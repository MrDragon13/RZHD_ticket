from __future__ import annotations

import asyncio
import json
import logging
import os
import time as time_monotonic
from datetime import date, datetime, time, timezone
from pathlib import Path

from app.models import (
    RouteSegmentInfo,
    TicketSearchRequest,
    TicketSearchResponse,
    TrainOption,
    TrainRouteStopsRequest,
    TrainRouteStopsResponse,
)
from app.services.route_segment import resolve_route_segment
from app.services.rzd_live import train_option_from_aiorzd


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


# RZD Data Adapter отделяет остальную систему от конкретного источника данных.
# Живой режим (по умолчанию): vendored aiorzd → pass.rzd.ru; выключить: RZD_LIVE_ENABLED=0.
# При ошибке upstream — откат на demo при RZD_LIVE_FALLBACK=1 (по умолчанию).
class RzdDataAdapter:
    def __init__(self, *, deepseek_client=None) -> None:
        self._data_file = Path(__file__).resolve().parents[1] / "data" / "demo_trains.json"
        self.live_enabled = _env_truthy_default_on("RZD_LIVE_ENABLED")
        self.live_fallback = os.getenv("RZD_LIVE_FALLBACK", "1").strip().lower() not in ("0", "false", "no")
        self._deepseek = deepseek_client
        # Один поток на вторичные запросы РЖД (basicRoute, carriages), чтобы реже ловить капчу.
        self._rzd_io_sem = asyncio.Semaphore(1)

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

            async with RzdFetcher() as fetcher:
                async with self._rzd_io_sem:
                    try:
                        stops_live = await fetcher.get_basic_route_stops(req.train_number.strip(), date_rzd)
                    except Exception:
                        logging.exception("lazy basicRoute failed train=%s", req.train_number)
                        stops_live = []

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
            trains=await self._enrich_route_segments(request, matched),
        )

    async def _search_live(self, request: TicketSearchRequest) -> TicketSearchResponse:
        from app.vendor.aiorzd import RzdFetcher, TimeRange

        origin = (request.origin or "Москва").strip()
        destination = request.destination.strip()
        travel_date = _parse_travel_date(request.date)

        day_start = datetime.combine(travel_date, time.min)
        day_end = datetime.combine(travel_date, time(23, 59, 59))

        enrich = _env_truthy_default_on("RZD_CARRIAGE_ENRICH")
        route_stops_on_search = _env_explicit_on("RZD_ROUTE_STOPS_ON_SEARCH")
        route_stops_max = int(os.getenv("RZD_ROUTE_STOPS_MAX_TRAINS", "15") or "15")
        route_stops_max = max(1, min(route_stops_max, 40))
        carriage_max = int(os.getenv("RZD_CARRIAGE_ENRICH_MAX_TRAINS", "15") or "15")
        carriage_max = max(1, min(carriage_max, 40))

        t_search0 = time_monotonic.monotonic()
        logging.info(
            "RZD search_live start origin=%r destination=%r date=%s route_stops_on_search=%s route_max=%s carriage_max=%s",
            origin,
            destination,
            travel_date.isoformat(),
            route_stops_on_search,
            route_stops_max,
            carriage_max,
        )

        async with RzdFetcher() as fetcher:
            trains_iter = await fetcher.trains(origin, destination, TimeRange(day_start, day_end))
            trains_list = list(trains_iter)
            logging.info(
                "RZD search_live trains_layer dt=%.2fs raw_trains=%s",
                time_monotonic.monotonic() - t_search0,
                len(trains_list),
            )

            # Слой 5827 уже даёт места в cars[] — можно отсеять поезда без мест до тяжёлых запросов.
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

            eligible_idx = [
                i
                for i, t in enumerate(light)
                if t.available_seats.platzkart + t.available_seats.coupe + t.available_seats.sv > 0
            ]
            route_idx = eligible_idx[:route_stops_max] if route_stops_on_search else []
            carriage_idx = eligible_idx[:carriage_max] if enrich else []

            if route_stops_on_search and len(eligible_idx) > route_stops_max:
                skipped_slice = eligible_idx[route_stops_max : route_stops_max + 20]
                skipped_nums = [
                    str(getattr(trains_list[si], "number", "") or (trains_list[si].content or {}).get("number") or "?")
                    for si in skipped_slice
                ]
                logging.warning(
                    "RZD route stops on search capped: max=%s eligible=%s skipped_sample=%s",
                    route_stops_max,
                    len(eligible_idx),
                    skipped_nums,
                )

            carriage_by_index: dict[int, dict] = {}
            basic_stops_by_index: dict[int, list[str]] = {}
            if trains_list and eligible_idx:
                src_code = await fetcher.get_city_code(origin)
                dst_code = await fetcher.get_city_code(destination)

                async def carriage_one(idx: int) -> None:
                    t = trains_list[idx]
                    num = str(getattr(t, "number", "") or (t.content or {}).get("number") or "")
                    if not num:
                        return
                    dep = getattr(t, "departure_time", None)
                    if dep is None:
                        return
                    async with self._rzd_io_sem:
                        try:
                            raw = await fetcher.get_train_carriages(src_code, dst_code, dep, num)
                        except Exception:
                            logging.debug("carriages enrich failed for train %s", num, exc_info=True)
                            return
                        if isinstance(raw, dict) and raw.get("result") == "OK":
                            carriage_by_index[idx] = raw

                async def route_stops_one(idx: int) -> None:
                    if not route_stops_on_search:
                        return
                    t = trains_list[idx]
                    content = t.content or {}
                    num = str(getattr(t, "number", "") or content.get("number") or "")
                    dep_date = str(content.get("date0") or "").strip()
                    if not dep_date:
                        dep_date = _dep_date_dmY_from_train_id(light[idx].id)
                    if not num or not dep_date:
                        return
                    async with self._rzd_io_sem:
                        try:
                            route_names = await fetcher.get_basic_route_stops(num, dep_date)
                        except Exception:
                            logging.debug("basicRoute on search failed for train %s", num, exc_info=True)
                            return
                        if len(route_names) >= 2:
                            basic_stops_by_index[idx] = route_names

                tasks = [route_stops_one(i) for i in route_idx]
                tasks.extend(carriage_one(i) for i in carriage_idx)
                if tasks:
                    await asyncio.gather(*tasks)
                    logging.info(
                        "RZD search_live secondary_RZD_done dt=%.2fs basicRoute_ok=%s carriage_ok=%s tasks=%s",
                        time_monotonic.monotonic() - t_search0,
                        len(basic_stops_by_index),
                        len(carriage_by_index),
                        len(tasks),
                    )
                    if route_stops_on_search:
                        logging.info(
                            "RZD route stops on search: basicRoute_ok=%s eligible=%s cap=%s",
                            len(basic_stops_by_index),
                            len(eligible_idx),
                            route_stops_max,
                        )

        mapped: list[TrainOption] = []
        for index in eligible_idx:
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
        enriched = await self._enrich_route_segments(request, mapped)
        logging.info(
            "RZD search_live done mapped=%s enrich_segments_dt=%.2fs total_dt=%.2fs",
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
    ) -> list[TrainOption]:
        """Добавляет route_segment с промежуточными остановками и логирует шаги."""

        origin = (request.origin or "").strip()
        destination = (request.destination or "").strip()

        async def one_train(t: TrainOption) -> TrainOption:
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
            return t.model_copy(update={"route_segment": info})

        return list(await asyncio.gather(*(one_train(t) for t in trains)))


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
