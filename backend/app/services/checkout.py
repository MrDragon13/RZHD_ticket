from __future__ import annotations

import json
import random
from datetime import datetime

from app.models import DemoCheckoutRequest, DemoTicket


def _normalize_car(raw: str | None, fallback: str) -> str:
    value = (raw or "").strip()
    if value.isdigit():
        return f"{int(value):02d}"
    return fallback


def _parse_seat(seat_number: str) -> str:
    nums = "".join(ch for ch in seat_number if ch.isdigit())
    if not nums:
        return seat_number.strip()
    try:
        return f"{int(nums):03d}"
    except ValueError:
        return seat_number.strip()


def _berth_label(kind: str, language: str) -> str:
    labels = {
        "lower": ("нижняя полка", "lower berth"),
        "upper": ("верхняя полка", "upper berth"),
        "side_lower": ("боковая нижняя", "side lower berth"),
        "side_upper": ("боковая верхняя", "side upper berth"),
    }
    ru, en = labels.get(kind, ("полка", "berth"))
    return ru if language == "ru" else en


# Demo Checkout Module имитирует финальный этап оформления.
# Он намеренно не принимает оплату, не спрашивает паспортные данные и всегда
# возвращает успешный демонстрационный билет для олимпиадного сценария.
def create_demo_ticket(request: DemoCheckoutRequest) -> DemoTicket:
    train = request.train
    now = datetime.utcnow()
    ticket_id = f"PATH-{now:%Y%m%d}-{random.randint(100000, 999999)}"
    travel_class = _pick_travel_class(train.prices.model_dump())

    if request.selected_seats:
        fallback_car = f"{random.randint(1, 12):02d}"
        pairs = []
        for item in request.selected_seats:
            car_part = _normalize_car(item.carriage or request.selected_carriage, fallback_car)
            pairs.append(
                (
                    car_part,
                    _parse_seat(item.seat_number),
                    _berth_label(item.berth_kind, request.language),
                )
            )
        cars = {p[0] for p in pairs}
        car = pairs[0][0] if len(cars) == 1 else "+".join(sorted(cars))
        seat_labels = [p[1] for p in pairs]
        berth_labels = [p[2] for p in pairs]
        if len(seat_labels) == 1:
            seat_s = seat_labels[0]
            berth_type = berth_labels[0]
        else:
            seat_s = ", ".join(seat_labels)
            berth_type = f"{len(seat_labels)} места" if request.language == "ru" else f"{len(seat_labels)} seats"
    else:
        random_car = f"{random.randint(1, 12):02d}"
        car = random_car
        seat_s, berth_type = _pick_demo_seat(train.seat_details.model_dump(), request.language)

    dep_s = (train.departure_station or "").strip()
    arr_s = (train.arrival_station or "").strip()
    if request.language == "en":
        route = f"{dep_s} to {arr_s}" if dep_s and arr_s else dep_s or arr_s
    else:
        route = f"{dep_s} в {arr_s}" if dep_s and arr_s else dep_s or arr_s

    warning = (
        "Демонстрационный билет. Не является проездным документом. Оплата не производится."
        if request.language == "ru"
        else "Demo ticket. Not valid for travel. No payment is processed."
    )

    pn = (request.passenger_full_name or "").strip()
    pp = (request.passenger_phone or "").strip()
    pd = (request.passenger_document or "").strip()
    if not pn or not pp or not pd:
        if request.language == "en":
            pn = pn or "Ivan Ivanovich Ivanov"
            pp = pp or "+7 (903) 123-45-67"
            pd = pd or "4510 123456"
        else:
            pn = pn or "Иван Иванович Иванов"
            pp = pp or "+7 (903) 123-45-67"
            pd = pd or "4510 123456"

    payload_seats = []
    if request.selected_seats:
        fb = f"{random.randint(1, 12):02d}"
        payload_seats = [
            {
                "carriage": _normalize_car(s.carriage or request.selected_carriage, fb),
                "seat_number": _parse_seat(s.seat_number),
                "berth_kind": s.berth_kind,
            }
            for s in request.selected_seats
        ]
    payload = {
        "type": "demo_ticket",
        "ticket_id": ticket_id,
        "route": route,
        "train_number": train.train_number,
        "car": car,
        "seats": payload_seats,
        "seat_label": seat_s,
        "berth_type": berth_type,
        "status": "not_valid_for_travel",
        "passenger_full_name": pn,
        "passenger_phone": pp,
        "passenger_document": pd,
    }

    return DemoTicket(
        ticket_id=ticket_id,
        qr_payload=json.dumps(payload, ensure_ascii=False),
        route=route,
        train_number=train.train_number,
        departure=train.departure_time,
        arrival=train.arrival_time,
        car=car,
        seat=seat_s,
        berth_type=berth_type,
        travel_class=travel_class,
        disclaimer=warning,
        passenger_full_name=pn,
        passenger_phone=pp,
        passenger_document=pd,
    )


def _pick_travel_class(prices: dict[str, int | None]) -> str:
    # Для демо выбираем наиболее презентабельный доступный класс.
    if prices.get("coupe"):
        return "Купе"
    if prices.get("sv"):
        return "СВ"
    return "Плацкарт"


def _pick_demo_seat(seat_details: dict[str, int], language: str) -> tuple[str, str]:
    """Выбирает демонстрационное место с учетом доступности нижних/верхних полок."""

    variants = [
        ("lower", seat_details.get("lower", 0), "нижняя полка", "lower berth"),
        ("upper", seat_details.get("upper", 0), "верхняя полка", "upper berth"),
        ("side_lower", seat_details.get("side_lower", 0), "боковая нижняя", "side lower berth"),
        ("side_upper", seat_details.get("side_upper", 0), "боковая верхняя", "side upper berth"),
    ]
    available = [variant for variant in variants if variant[1] > 0]
    selected = available[0] if available else variants[1]
    label = selected[2] if language == "ru" else selected[3]
    return f"{random.randint(1, 54):03d}", label
