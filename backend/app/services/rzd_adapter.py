from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.models import TicketSearchRequest, TicketSearchResponse, TrainOption


# RZD Data Adapter отделяет остальную систему от конкретного источника данных.
# Сейчас реализован надежный demo-режим, а live-парсер можно подключить сюда же,
# не меняя API frontend и рекомендательной системы.
class RzdDataAdapter:
    def __init__(self) -> None:
        self._data_file = Path(__file__).resolve().parents[1] / "data" / "demo_trains.json"

    def search(self, request: TicketSearchRequest) -> TicketSearchResponse:
        trains = self._load_demo_trains()
        normalized_destination = request.destination.lower()
        normalized_origin = (request.origin or "Москва").lower()

        # Фильтрация намеренно мягкая: для презентации лучше вернуть похожий
        # маршрут, чем показать пустой экран из-за несовпадения формы названия.
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

    def _load_demo_trains(self) -> list[TrainOption]:
        with self._data_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        # Демо-база хранится простым JSON-массивом, чтобы ее было удобно
        # редактировать школьнику без знания сложных форматов данных.
        return [TrainOption(**item) for item in payload]
