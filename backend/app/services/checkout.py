from __future__ import annotations

import json
import random
from datetime import datetime

from app.models import DemoCheckoutRequest, DemoTicket


# Demo Checkout Module имитирует финальный этап оформления.
# Он намеренно не принимает оплату, не спрашивает паспортные данные и всегда
# возвращает успешный демонстрационный билет для олимпиадного сценария.
def create_demo_ticket(request: DemoCheckoutRequest) -> DemoTicket:
    train = request.train
    now = datetime.utcnow()
    ticket_id = f"PATH-{now:%Y%m%d}-{random.randint(100000, 999999)}"
    travel_class = _pick_travel_class(train.prices.model_dump())
    car = f"{random.randint(1, 12):02d}"
    seat = f"{random.randint(1, 54):03d}"
    route = f"{train.departure_station} -> {train.arrival_station}"

    warning = (
        "Демонстрационный билет. Не является проездным документом. Оплата не производится."
        if request.language == "ru"
        else "Demo ticket. Not valid for travel. No payment is processed."
    )
    payload = {
        "type": "demo_ticket",
        "ticket_id": ticket_id,
        "route": route,
        "train_number": train.train_number,
        "status": "not_valid_for_travel",
    }

    return DemoTicket(
        ticket_id=ticket_id,
        qr_payload=json.dumps(payload, ensure_ascii=False),
        route=route,
        train_number=train.train_number,
        departure=train.departure_time,
        arrival=train.arrival_time,
        car=car,
        seat=seat,
        travel_class=travel_class,
        disclaimer=warning,
    )


def _pick_travel_class(prices: dict[str, int | None]) -> str:
    # Для демо выбираем наиболее презентабельный доступный класс.
    if prices.get("coupe"):
        return "Купе"
    if prices.get("sv"):
        return "СВ"
    return "Плацкарт"
