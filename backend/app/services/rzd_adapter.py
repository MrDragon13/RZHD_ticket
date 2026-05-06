from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time as time_monotonic
from datetime import date, datetime, time, timezone
from pathlib import Path

from app.models import (
    RouteSegmentInfo,
    TicketSearchRequest,
    TicketSearchResponse,
    TrainCarriageDetailsRequest,
    TrainCarriageDetailsResponse,
    TrainOption,
    TrainRouteStopsRequest,
    TrainRouteStopsResponse,
)
from app.services.route_segment import resolve_route_segment
from app.services.rzd_live import (
    _merge_stop_lists_from_carriage_layer,
    apply_carriage_layer_payload,
    train_option_from_aiorzd,
)


def _dep_date_dmY_from_train_id(train_id: str) -> str:
    """Дата dd.mm.yyyy из id вида rzd-<номер>-YYYYMMDDHHMM-<idx>, если date0 не пришёл с РЖД."""

    parts = str(train_id or "").split("-")
    if len(parts) < 4:
        return ""
    mid = parts[-2]
    if len(mid) < 8 or not mid[:8].isdigit():
        return ""
    try:
        dt = datetime.strptime(mid[:8], "%Y%m%d").date()
        return dt.strftime("%d.%m.%Y")
    except ValueError:
        return ""


def _departure_datetime_from_train_option(train: TrainOption) -> datetime | None:
    """Дата и время отправления для запроса слоя вагонов 5764."""

    day = (train.departure_date_rzd or "").strip() or _dep_date_dmY_from_train_id(train.id)
    hm = (train.departure_time or "").strip()
    if not day or not hm:
        return None
    try:
        return datetime.strptime(f"{hm} {day}", "%H:%M %d.%m.%Y")
    except ValueError:
        return None


# RZD Data Adapter отделяет остальную систему от конкретного источника данных.
# Живой режим (по умолчанию): vendored aiorzd → pass.rzd.ru; выключить: RZD_LIVE_ENABLED=0.
# При ошибке upstream — откат на demo при RZD_LIVE_FALLBACK=1 (по умолчанию).
class RzdDataAdapter:
    def __init__(self, *, deepseek_client=None) -> None:
        self._data_file = Path(__file__).resolve().parents[1] / "data" / "demo_trains.json"
        self.live_enabled = _env_truthy_default_on("RZD_LIVE_ENABLED")
        self.live_fallback = os.getenv("RZD_LIVE_FALLBACK", "1").strip().lower() not in ("0", "false", "no")
        self._deepseek = deepseek_client
        # Ограничение параллелизма вторичных запросов РЖД (basicRoute, carriages). Больше 1 — быстрее,
        # но выше риск капчи; см. RZD_SECONDARY_CONCURRENCY.
        self._rzd_secondary_concurrency = _clamp_secondary_concurrency()
        self._rzd_secondary_sem = asyncio.Semaphore(self._rzd_secondary_concurrency)

    async def search(self, request: TicketSearchRequest) -> TicketSearchResponse:
        if self.live_enabled:
            try:
                return await self._search_live(request)
            except Exception:
                logging.exception("RZD live search failed")
                if self.live_fallback:
                    return await self._search_demo(request)
                raise
        return await self._search_demo(request)

    async def fetch_train_route_stops(self, req: TrainRouteStopsRequest) -> TrainRouteStopsResponse:
        """Полный маршрут basicRoute для одного поезда (после выдачи рекомендации или выбора карточки)."""

        origin = (req.origin or "").strip()
        destination = (req.destination or "").strip()
        date_rzd = (req.departure_date_rzd or "").strip() or _dep_date_dmY_from_train_id(req.train_id)

        stops_live: list[str] = []
        if self.live_enabled and date_rzd and req.train_number.strip():
            from app.vendor.aiorzd import RzdFetcher

            t_lazy0 = time_monotonic.monotonic()
            async with RzdFetcher() as fetcher:
                async with self._rzd_secondary_sem:
                    try:
                        stops_live = await fetcher.get_basic_route_stops(req.train_number.strip(), date_rzd)
                    except Exception:
                        logging.exception("lazy basicRoute failed train=%s", req.train_number)
                        stops_live = []
            logging.info(
                "RZD perf phase=lazy_basicRoute train=%s dt=%.3fs stop_count=%s",
                req.train_number.strip(),
                time_monotonic.monotonic() - t_lazy0,
                len(stops_live),
            )

        stops = stops_live if len(stops_live) >= 2 else list(req.fallback_stops or [])
        if stops_live and len(stops_live) < 2:
            logging.info(
                "lazy basicRoute sparse train=%s dep=%s — using fallback_stops count=%s",
                req.train_number,
                date_rzd,
                len(req.fallback_stops or []),
            )

        seg = await resolve_route_segment(
            stops=stops,
            search_origin=origin,
            search_destination=destination,
            departure_station=req.departure_station,
            arrival_station=req.arrival_station,
            route_terminal_from=req.route_terminal_from or origin,
            route_terminal_to=req.route_terminal_to or destination,
            train_number=req.train_number,
            train_id=req.train_id,
            deepseek=self._deepseek,
        )
        info = RouteSegmentInfo(
            intermediate_stops=seg.intermediate_stops,
            endpoint_fraction=seg.endpoint_fraction,
            method=seg.method,
            origin_index=seg.origin_index,
            destination_index=seg.destination_index,
            debug_steps=seg.debug_steps[:30],
        )
        return TrainRouteStopsResponse(train_id=req.train_id, stops=stops, route_segment=info)

    async def fetch_train_carriage_details(self, req: TrainCarriageDetailsRequest) -> TrainCarriageDetailsResponse:
        """Слой 5764 для одного поезда — экран выбора мест / оформление."""

        train = req.train
        origin = (req.origin or "").strip() or (train.origin or "").strip()
        destination = (req.destination or "").strip() or (train.destination or "").strip()
        if not origin or not destination:
            return TrainCarriageDetailsResponse(train=train)

        dep_dt = _departure_datetime_from_train_option(train)
        num = (train.train_number or "").strip()
        if not self.live_enabled or dep_dt is None or not num:
            return TrainCarriageDetailsResponse(train=train)

        from app.vendor.aiorzd import RzdFetcher

        raw: dict | None = None
        async with RzdFetcher() as fetcher:
            async with self._rzd_secondary_sem:
                try:
                    src_code = await fetcher.get_city_code(origin)
                    dst_code = await fetcher.get_city_code(destination)
                    raw = await fetcher.get_train_carriages(src_code, dst_code, dep_dt, num)
                except Exception:
                    logging.exception("lazy carriages layer failed train=%s", num)
                    return TrainCarriageDetailsResponse(train=train)

        if not isinstance(raw, dict) or raw.get("result") != "OK":
            logging.info(
                "lazy carriages not OK train=%s keys=%s",
                num,
                list(raw.keys()) if isinstance(raw, dict) else type(raw),
            )
            return TrainCarriageDetailsResponse(train=train)

        updated = apply_carriage_layer_payload(train, raw)
        merged_stops = _merge_stop_lists_from_carriage_layer(list(updated.stops), raw)
        if merged_stops != list(updated.stops):
            updated = updated.model_copy(update={"stops": merged_stops})
        logging.info(
            "RZD perf phase=lazy_carriages train=%s carriage_details=%s",
            num,
            len(updated.carriage_details),
        )
        return TrainCarriageDetailsResponse(train=updated)

    async def _search_demo(self, request: TicketSearchRequest) -> TicketSearchResponse:
        trains = self._load_demo_trains()
        normalized_destination = request.destination.lower()
        normalized_origin = (request.origin or "Москва").lower()

        matched = [
            train
            for train in trains
            if normalized_destination in train.destination.lower()
            and normalized_origin in train.origin.lower()
        ]

        if not matched:
            matched = trains

        return TicketSearchResponse(
            source="demo",
            updated_at=datetime.now(timezone.utc).isoformat(),
            trains=await self._enrich_route_segments(request, matched, perf_sid=None),
        )

    async def _search_live(self, request: TicketSearchRequest) -> TicketSearchResponse:
        from app.vendor.aiorzd import RzdFetcher, TimeRange

        sid = secrets.token_hex(4)
        origin = (request.origin or "Москва").strip()
        destination = request.destination.strip()
        travel_date = _parse_travel_date(request.date)

        day_start = datetime.combine(travel_date, time.min)
        day_end = datetime.combine(travel_date, time(23, 59, 59))

        enrich = _env_explicit_on("RZD_CARRIAGE_ENRICH")
        route_stops_on_search = _env_explicit_on("RZD_ROUTE_STOPS_ON_SEARCH")
        route_stops_max = int(os.getenv("RZD_ROUTE_STOPS_MAX_TRAINS", "15") or "15")
        route_stops_max = max(1, min(route_stops_max, 40))
        carriage_max = int(os.getenv("RZD_CARRIAGE_ENRICH_MAX_TRAINS", "15") or "15")
        carriage_max = max(1, min(carriage_max, 40))

        t_search0 = time_monotonic.monotonic()
        logging.info(
            "RZD perf sid=%s phase=search_start origin=%r destination=%r date=%s "
            "secondary_concurrency=%s route_stops_on_search=%s route_max=%s carriage_max=%s",
            sid,
            origin,
            destination,
            travel_date.isoformat(),
            self._rzd_secondary_concurrency,
            route_stops_on_search,
            route_stops_max,
            carriage_max,
        )

        trains_list: list = []
        eligible_idx: list[int] = []
        carriage_by_index: dict[int, dict] = {}
        basic_stops_by_index: dict[int, list[str]] = {}

        t_trains0 = time_monotonic.monotonic()
        async with RzdFetcher() as fetcher:
            trains_iter = await fetcher.trains(origin, destination, TimeRange(day_start, day_end))
            trains_list = list(trains_iter)
            logging.info(
                "RZD perf sid=%s phase=trains_layer dt=%.3fs raw_trains=%s",
                sid,
                time_monotonic.monotonic() - t_trains0,
                len(trains_list),
            )

            t_light0 = time_monotonic.monotonic()
            light: list[TrainOption] = []
            for index, train_obj in enumerate(trains_list):
                light.append(
                    train_option_from_aiorzd(
                        train_obj,
                        index,
                        origin_hint=origin,
                        dest_hint=destination,
                        language=request.language,
                        carriage_payload=None,
                        basic_route_stops=None,
                    ),
                )
            logging.info(
                "RZD perf sid=%s phase=map_light dt=%.3fs",
                sid,
                time_monotonic.monotonic() - t_light0,
            )

            eligible_idx = [
                i
                for i, t in enumerate(light)
                if t.available_seats.platzkart + t.available_seats.coupe + t.available_seats.sv > 0
            ]
            route_idx = eligible_idx[:route_stops_max] if route_stops_on_search else []
            carriage_idx = eligible_idx[:carriage_max] if enrich else []
            n_route_tasks = len(route_idx)
            n_carriage_tasks = len(carriage_idx)
            logging.info(
                "RZD perf sid=%s phase=filter raw_trains=%s eligible_with_seats=%s "
                "secondary_schedule basicRoute_tasks=%s carriages_tasks=%s (cap route=%s carriage=%s)",
                sid,
                len(trains_list),
                len(eligible_idx),
                n_route_tasks,
                n_carriage_tasks,
                route_stops_max,
                carriage_max,
            )

            if route_stops_on_search and len(eligible_idx) > route_stops_max:
                skipped_slice = eligible_idx[route_stops_max : route_stops_max + 20]
                skipped_nums = [
                    str(getattr(trains_list[si], "number", "") or (trains_list[si].content or {}).get("number") or "?")
                    for si in skipped_slice
                ]
                logging.warning(
                    "RZD perf sid=%s route_stops_capped max=%s eligible=%s skipped_sample=%s",
                    sid,
                    route_stops_max,
                    len(eligible_idx),
                    skipped_nums,
                )

            perf_rows: list[tuple[str, str, float]] = []

            if trains_list and eligible_idx:
                t_cc0 = time_monotonic.monotonic()
                src_code, dst_code = await asyncio.gather(
                    fetcher.get_city_code(origin),
                    fetcher.get_city_code(destination),
                )
                logging.info(
                    "RZD perf sid=%s phase=city_codes_parallel dt=%.3fs",
                    sid,
                    time_monotonic.monotonic() - t_cc0,
                )

                async def carriage_one(idx: int) -> None:
                    t = trains_list[idx]
                    num = str(getattr(t, "number", "") or (t.content or {}).get("number") or "")
                    dep = getattr(t, "departure_time", None)
                    if not num or dep is None:
                        return
                    t0 = time_monotonic.monotonic()
                    try:
                        async with self._rzd_secondary_sem:
                            raw = await fetcher.get_train_carriages(src_code, dst_code, dep, num)
                        if isinstance(raw, dict) and raw.get("result") == "OK":
                            carriage_by_index[idx] = raw
                    except Exception:
                        logging.debug(
                            "RZD perf sid=%s carriages_failed train=%s",
                            sid,
                            num,
                            exc_info=True,
                        )
                    finally:
                        perf_rows.append(("carriages", num, time_monotonic.monotonic() - t0))

                async def route_stops_one(idx: int) -> None:
                    t = trains_list[idx]
                    content = t.content or {}
                    num = str(getattr(t, "number", "") or content.get("number") or "")
                    dep_date = str(content.get("date0") or "").strip()
                    if not dep_date:
                        dep_date = _dep_date_dmY_from_train_id(light[idx].id)
                    if not num or not dep_date:
                        return
                    t0 = time_monotonic.monotonic()
                    try:
                        async with self._rzd_secondary_sem:
                            route_names = await fetcher.get_basic_route_stops(num, dep_date)
                        if len(route_names) >= 2:
                            basic_stops_by_index[idx] = route_names
                    except Exception:
                        logging.debug(
                            "RZD perf sid=%s basicRoute_failed train=%s",
                            sid,
                            num,
                            exc_info=True,
                        )
                    finally:
                        perf_rows.append(("basicRoute", num, time_monotonic.monotonic() - t0))

                tasks = [route_stops_one(i) for i in route_idx]
                tasks.extend(carriage_one(i) for i in carriage_idx)
                if tasks:
                    t_sec0 = time_monotonic.monotonic()
                    await asyncio.gather(*tasks)
                    dt_sec = time_monotonic.monotonic() - t_sec0
                    sum_task = sum(r[2] for r in perf_rows)
                    slow = sorted(perf_rows, key=lambda x: -x[2])[:8]
                    slow_s = " ".join(f"{k}:{n}={d:.2f}s" for k, n, d in slow)
                    par_hint = (sum_task / dt_sec) if dt_sec > 0 else 0.0
                    logging.info(
                        "RZD perf sid=%s phase=secondary_rzd dt_wall=%.3fs concurrency=%s "
                        "tasks_run=%s perf_samples=%s sum_task_time=%.3fs parallelism_vs_wall=%.2fx "
                        "basicRoute_ok=%s carriages_ok=%s slowest=[%s]",
                        sid,
                        dt_sec,
                        self._rzd_secondary_concurrency,
                        len(tasks),
                        len(perf_rows),
                        sum_task,
                        par_hint,
                        len(basic_stops_by_index),
                        len(carriage_by_index),
                        slow_s,
                    )
                    if route_stops_on_search:
                        logging.info(
                            "RZD perf sid=%s route_stops_on_search_detail eligible=%s cap=%s basic_ok=%s",
                            sid,
                            len(eligible_idx),
                            route_stops_max,
                            len(basic_stops_by_index),
                        )
            else:
                logging.info(
                    "RZD perf sid=%s phase=secondary_rzd skipped reason=%s raw_trains=%s eligible_with_seats=%s",
                    sid,
                    "no_trains" if not trains_list else "no_tasks_or_no_eligible_seats",
                    len(trains_list),
                    len(eligible_idx),
                )

        mapped: list[TrainOption] = []
        for index in range(len(trains_list)):
            mapped.append(
                train_option_from_aiorzd(
                    trains_list[index],
                    index,
                    origin_hint=origin,
                    dest_hint=destination,
                    language=request.language,
                    carriage_payload=carriage_by_index.get(index),
                    basic_route_stops=basic_stops_by_index.get(index),
                ),
            )

        t_seg0 = time_monotonic.monotonic()
        enriched = await self._enrich_route_segments(request, mapped, perf_sid=sid)
        logging.info(
            "RZD perf sid=%s phase=search_done mapped=%s enrich_route_segments_wall=%.3fs total_wall=%.3fs",
            sid,
            len(mapped),
            time_monotonic.monotonic() - t_seg0,
            time_monotonic.monotonic() - t_search0,
        )

        return TicketSearchResponse(
            source="live-cache",
            updated_at=datetime.now(timezone.utc).isoformat(),
            trains=enriched,
        )

    def _load_demo_trains(self) -> list[TrainOption]:
        with self._data_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        return [TrainOption(**item) for item in payload["trains"]]

    async def _enrich_route_segments(
        self,
        request: TicketSearchRequest,
        trains: list[TrainOption],
        *,
        perf_sid: str | None = None,
    ) -> list[TrainOption]:
        """Добавляет route_segment с промежуточными остановками и логирует шаги."""

        origin = (request.origin or "").strip()
        destination = (request.destination or "").strip()

        t_en0 = time_monotonic.monotonic()

        async def one_train(t: TrainOption) -> tuple[TrainOption, float, str]:
            t0 = time_monotonic.monotonic()
            seg = await resolve_route_segment(
                stops=list(t.stops),
                search_origin=origin,
                search_destination=destination,
                departure_station=t.departure_station,
                arrival_station=t.arrival_station,
                route_terminal_from=t.origin,
                route_terminal_to=t.destination,
                train_number=t.train_number,
                train_id=t.id,
                deepseek=self._deepseek,
            )
            info = RouteSegmentInfo(
                intermediate_stops=seg.intermediate_stops,
                endpoint_fraction=seg.endpoint_fraction,
                method=seg.method,
                origin_index=seg.origin_index,
                destination_index=seg.destination_index,
                debug_steps=seg.debug_steps[:30],
            )
            dt = time_monotonic.monotonic() - t0
            return (t.model_copy(update={"route_segment": info}), dt, seg.method)

        rows = await asyncio.gather(*(one_train(t) for t in trains))
        out = [r[0] for r in rows]
        dt_wall = time_monotonic.monotonic() - t_en0
        if perf_sid and trains:
            timings = [(tr.train_number, r[1], r[2]) for tr, r in zip(trains, rows)]
            slow = sorted(timings, key=lambda x: -x[1])[:6]
            sum_r = sum(x[1] for x in timings)
            mx = max((x[1] for x in timings), default=0.0)
            slow_s = ", ".join(f"{n}={d:.2f}s/{m}" for n, d, m in slow)
            logging.info(
                "RZD perf sid=%s phase=enrich_route_segments dt_wall=%.3fs trains=%s "
                "sum_resolve_time=%.3fs max_single=%.3fs slowest=[%s]",
                perf_sid,
                dt_wall,
                len(trains),
                sum_r,
                mx,
                slow_s,
            )
        elif perf_sid:
            logging.info(
                "RZD perf sid=%s phase=enrich_route_segments dt_wall=%.3fs trains=0",
                perf_sid,
                dt_wall,
            )
        return out


def _clamp_secondary_concurrency() -> int:
    """Параллельные вторичные запросы к pass.rzd.ru (2 по умолчанию; 1 — меньше риск капчи)."""

    try:
        raw = int(os.getenv("RZD_SECONDARY_CONCURRENCY", "2") or "2")
    except ValueError:
        raw = 2
    return max(1, min(raw, 8))


def _env_truthy_default_on(name: str) -> bool:
    """Переменная не задана или пустая → True; явное отключение: 0 / false / no."""

    raw = os.getenv(name)
    if raw is None:
        return True
    s = raw.strip().lower()
    if not s:
        return True
    return s not in ("0", "false", "no")


def _env_explicit_on(name: str) -> bool:
    """Только явное включение 1/true/yes/on; по умолчанию выключено (для тяжёлых опций РЖД)."""

    raw = os.getenv(name)
    if raw is None:
        return False
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _parse_travel_date(raw: str | None) -> date:
    if not raw or not str(raw).strip():
        return date.today()
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        s = s[:10]
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return date.today()
