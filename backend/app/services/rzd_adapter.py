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
        max_conc = int(os.getenv("RZD_CARRIAGE_CONCURRENCY", "4") or "4")
        max_conc = max(1, min(max_conc, 16))

        async with RzdFetcher() as fetcher:
            trains_iter = await fetcher.trains(origin, destination, TimeRange(day_start, day_end))
            trains_list = list(trains_iter)

            carriage_by_index: dict[int, dict] = {}
            if enrich and trains_list:
                src_code = await fetcher.get_city_code(origin)
                dst_code = await fetcher.get_city_code(destination)

                sem = asyncio.Semaphore(max_conc)

                async def one_train(idx: int, t) -> None:
                    num = str(getattr(t, "number", "") or (t.content or {}).get("number") or "")
                    if not num:
                        return
                    dep = getattr(t, "departure_time", None)
                    if dep is None:
                        return
                    async with sem:
                        try:
                            raw = await fetcher.get_train_carriages(src_code, dst_code, dep, num)
                        except Exception:
                            logging.debug("carriages enrich failed for train %s", num, exc_info=True)
                            return
                        if isinstance(raw, dict) and raw.get("result") == "OK":
                            carriage_by_index[idx] = raw

                await asyncio.gather(*(one_train(i, tr) for i, tr in enumerate(trains_list)))

        mapped: list[TrainOption] = []
        for index, train_obj in enumerate(trains_list):
            mapped.append(
                train_option_from_aiorzd(
                    train_obj,
                    index,
                    origin_hint=origin,
                    dest_hint=destination,
                    language=request.language,
                    carriage_payload=carriage_by_index.get(index),
                ),
            )

        mapped = [
            t
            for t in mapped
            if t.available_seats.platzkart + t.available_seats.coupe + t.available_seats.sv > 0
        ]

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
        out: list[TrainOption] = []
        for t in trains:
            seg = await resolve_route_segment(
                stops=list(t.stops),
                search_origin=origin,
                search_destination=destination,
                departure_station=t.departure_station,
                arrival_station=t.arrival_station,
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
            out.append(t.model_copy(update={"route_segment": info}))
        return out


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
