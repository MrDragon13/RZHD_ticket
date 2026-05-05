from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, time, timezone
from pathlib import Path

from app.models import TicketSearchRequest, TicketSearchResponse, TrainOption
from app.services.rzd_live import train_option_from_aiorzd


# RZD Data Adapter отделяет остальную систему от конкретного источника данных.
# Демо-режим читает demo_trains.json; при RZD_LIVE_ENABLED вызывается vendored aiorzd
# к pass.rzd.ru с откатом на демо при ошибке (RZD_LIVE_FALLBACK).
class RzdDataAdapter:
    def __init__(self) -> None:
        self._data_file = Path(__file__).resolve().parents[1] / "data" / "demo_trains.json"
        self.live_enabled = os.getenv("RZD_LIVE_ENABLED", "").strip().lower() in ("1", "true", "yes")
        self.live_fallback = os.getenv("RZD_LIVE_FALLBACK", "1").strip().lower() not in ("0", "false", "no")

    async def search(self, request: TicketSearchRequest) -> TicketSearchResponse:
        if self.live_enabled:
            try:
                return await self._search_live(request)
            except Exception:
                logging.exception("RZD live search failed")
                if self.live_fallback:
                    return self._search_demo(request)
                raise
        return self._search_demo(request)

    def _search_demo(self, request: TicketSearchRequest) -> TicketSearchResponse:
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
            trains=matched,
        )

    async def _search_live(self, request: TicketSearchRequest) -> TicketSearchResponse:
        from app.vendor.aiorzd import RzdFetcher, TimeRange

        origin = (request.origin or "Москва").strip()
        destination = request.destination.strip()
        travel_date = _parse_travel_date(request.date)

        day_start = datetime.combine(travel_date, time.min)
        day_end = datetime.combine(travel_date, time(23, 59, 59))

        async with RzdFetcher() as fetcher:
            trains_iter = await fetcher.trains(origin, destination, TimeRange(day_start, day_end))
            trains_list = list(trains_iter)

        mapped: list[TrainOption] = []
        for index, train_obj in enumerate(trains_list):
            mapped.append(
                train_option_from_aiorzd(
                    train_obj,
                    index,
                    origin_hint=origin,
                    dest_hint=destination,
                    language=request.language,
                ),
            )

        return TicketSearchResponse(
            source="live-cache",
            updated_at=datetime.now(timezone.utc).isoformat(),
            trains=mapped,
        )

    def _load_demo_trains(self) -> list[TrainOption]:
        with self._data_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        return [TrainOption(**item) for item in payload["trains"]]


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
