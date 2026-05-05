from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import date, datetime, time, timezone
from pathlib import Path

from app.models import RouteSegmentInfo, TicketSearchRequest, TicketSearchResponse, TrainOption
from app.services.route_segment import resolve_route_segment
from app.services.rzd_live import train_option_from_aiorzd


# RZD Data Adapter отделяет остальную систему от конкретного источника данных.
# Живой режим (по умолчанию): vendored aiorzd → pass.rzd.ru; выключить: RZD_LIVE_ENABLED=0.
# При ошибке upstream — откат на demo при RZD_LIVE_FALLBACK=1 (по умолчанию).
class RzdDataAdapter:
    def __init__(self, *, deepseek_client=None) -> None:
        self._data_file = Path(__file__).resolve().parents[1] / "data" / "demo_trains.json"
        self.live_enabled = _env_truthy_default_on("RZD_LIVE_ENABLED")
        self.live_fallback = os.getenv("RZD_LIVE_FALLBACK", "1").strip().lower() not in ("0", "false", "no")
        self._deepseek = deepseek_client

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
        route_stops_enrich = _env_truthy_default_on("RZD_ROUTE_STOPS_ENRICH")
        route_stops_max = int(os.getenv("RZD_ROUTE_STOPS_MAX_TRAINS", "12") or "12")
        route_stops_max = max(1, min(route_stops_max, 40))
        carriage_max = int(os.getenv("RZD_CARRIAGE_ENRICH_MAX_TRAINS", "15") or "15")
        carriage_max = max(1, min(carriage_max, 40))

        async with RzdFetcher() as fetcher:
            trains_iter = await fetcher.trains(origin, destination, TimeRange(day_start, day_end))
            trains_list = list(trains_iter)

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
            route_idx = eligible_idx[:route_stops_max] if route_stops_enrich else []
            carriage_idx = eligible_idx[:carriage_max] if enrich else []

            carriage_by_index: dict[int, dict] = {}
            basic_stops_by_index: dict[int, list[str]] = {}
            if trains_list and eligible_idx:
                src_code = await fetcher.get_city_code(origin)
                dst_code = await fetcher.get_city_code(destination)

                sem_c = asyncio.Semaphore(1)
                # Слой 5764 при параллели часто даёт Captcha → паузе 120 с в aiorzd.
                sem_r = asyncio.Semaphore(1)

                async def carriage_one(idx: int) -> None:
                    t = trains_list[idx]
                    num = str(getattr(t, "number", "") or (t.content or {}).get("number") or "")
                    if not num:
                        return
                    dep = getattr(t, "departure_time", None)
                    if dep is None:
                        return
                    async with sem_c:
                        try:
                            raw = await fetcher.get_train_carriages(src_code, dst_code, dep, num)
                        except Exception:
                            logging.debug("carriages enrich failed for train %s", num, exc_info=True)
                            return
                        if isinstance(raw, dict) and raw.get("result") == "OK":
                            carriage_by_index[idx] = raw

                async def route_stops_one(idx: int) -> None:
                    if not route_stops_enrich:
                        return
                    t = trains_list[idx]
                    content = t.content or {}
                    num = str(getattr(t, "number", "") or content.get("number") or "")
                    dep_date = str(content.get("date0") or "").strip()
                    if not num or not dep_date:
                        return
                    async with sem_r:
                        try:
                            route_names = await fetcher.get_basic_route_stops(num, dep_date)
                        except Exception:
                            logging.debug("basicRoute stops failed for train %s", num, exc_info=True)
                            return
                        if len(route_names) >= 2:
                            basic_stops_by_index[idx] = route_names

                tasks = []
                for i in carriage_idx:
                    tasks.append(carriage_one(i))
                for i in route_idx:
                    tasks.append(route_stops_one(i))

                if tasks:
                    await asyncio.gather(*tasks)

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

        enriched = await self._enrich_route_segments(request, mapped)

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
