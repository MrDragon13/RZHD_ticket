"""Маппинг ответов vendored aiorzd → TrainOption."""

from __future__ import annotations

import re
from datetime import datetime

from app.models import PriceInfo, SeatDetails, SeatInfo, TrainOption


def _minutes_to_label(total_minutes: int, language: str) -> str:
    if total_minutes < 60:
        return f"{total_minutes} мин" if language == "ru" else f"{total_minutes} min"
    h = total_minutes // 60
    m = total_minutes % 60
    if language == "ru":
        return f"{h} ч {m} мин" if m else f"{h} ч"
    return f"{h} h {m} min" if m else f"{h} h"


def _classify_car_row(text: str) -> str | None:
    t = text.lower()
    if any(x in t for x in ("св", "люкс", "lux", "мягк")):
        return "sv"
    if any(x in t for x in ("купе", "coupe", "сидяч")):
        return "coupe"
    if any(x in t for x in ("плац", "platz", "общ")):
        return "platzkart"
    return None


def aggregate_cars_to_inventory(cars: list[dict]) -> tuple[SeatInfo, SeatDetails, PriceInfo]:
    """Суммирует строки cars[] из ответа РЖД по типам вагонов."""

    platz = coupe = sv = 0
    min_platz: int | None = None
    min_coupe: int | None = None
    min_sv: int | None = None

    lower = upper = side_lower = side_upper = 0

    for row in cars:
        try:
            free = int(row.get("freeSeats") or 0)
        except (TypeError, ValueError):
            free = 0
        raw_tariff = row.get("tariff")
        try:
            price_rub = int(round(float(raw_tariff))) if raw_tariff is not None else None
        except (TypeError, ValueError):
            price_rub = None

        label = f"{row.get('type', '')} {row.get('typeLoc', '')}"
        cat = _classify_car_row(label)
        if cat == "platzkart":
            platz += free
            if price_rub is not None:
                min_platz = price_rub if min_platz is None else min(min_platz, price_rub)
        elif cat == "coupe":
            coupe += free
            if price_rub is not None:
                min_coupe = price_rub if min_coupe is None else min(min_coupe, price_rub)
        elif cat == "sv":
            sv += free
            if price_rub is not None:
                min_sv = price_rub if min_sv is None else min(min_sv, price_rub)

    # Грубая оценка полок: если класс не разобрали, не заполняем детализацию.
    if platz and coupe == 0 and sv == 0:
        lower = int(platz * 0.45)
        upper = platz - lower

    return (
        SeatInfo(platzkart=platz, coupe=coupe, sv=sv),
        SeatDetails(lower=lower, upper=upper, side_lower=side_lower, side_upper=side_upper),
        PriceInfo(platzkart=min_platz, coupe=min_coupe, sv=min_sv),
    )


def train_option_from_aiorzd(
    train_obj,
    index: int,
    *,
    origin_hint: str | None,
    dest_hint: str | None,
    language: str,
) -> TrainOption:
    """Преобразует объект aiorzd.Train в TrainOption."""

    content = train_obj.content or {}
    dep: datetime = train_obj.departure_time
    arr: datetime = train_obj.arrival_time
    dur_min = max(0, int((arr - dep).total_seconds() // 60))

    lang = "ru" if language == "ru" else "en"
    duration_label = _minutes_to_label(dur_min, lang)

    cars = content.get("cars") or []
    seat_info, seat_details, prices = aggregate_cars_to_inventory(cars)

    route0 = str(content.get("route0") or origin_hint or "").strip()
    route1 = str(content.get("route1") or dest_hint or "").strip()

    distance_raw = content.get("distance") or content.get("routeDistanceKm") or content.get("routeDistance")
    try:
        route_km = int(float(distance_raw)) if distance_raw is not None else 0
    except (TypeError, ValueError):
        route_km = 0

    stops: list[str] = []
    raw_stops = content.get("stops") or content.get("stopList")
    if isinstance(raw_stops, list):
        for s in raw_stops[:40]:
            if isinstance(s, str):
                stops.append(s)
            elif isinstance(s, dict) and s.get("station"):
                stops.append(str(s["station"]))

    features: list[str] = []
    brand = content.get("brand")
    if isinstance(brand, str) and brand.strip():
        slug = re.sub(r"[^\w]+", "_", brand.strip().lower()).strip("_")
        if slug:
            features.append(slug[:48])
    carrier = content.get("carrier")
    if isinstance(carrier, str) and carrier.strip():
        features.append(re.sub(r"[^\w]+", "_", carrier.strip().lower())[:48])

    train_number = str(getattr(train_obj, "number", "") or content.get("number") or "")

    tid = f"rzd-{train_number}-{dep.strftime('%Y%m%d%H%M')}-{index}"

    return TrainOption(
        id=tid,
        train_number=train_number,
        origin=origin_hint or route0 or "—",
        destination=dest_hint or route1 or "—",
        departure_station=route0 or origin_hint or "—",
        arrival_station=route1 or dest_hint or "—",
        departure_time=dep.strftime("%H:%M"),
        arrival_time=arr.strftime("%H:%M"),
        duration_minutes=dur_min,
        duration_label=duration_label,
        route_distance_km=route_km,
        stops=stops,
        available_seats=seat_info,
        seat_details=seat_details,
        prices=prices,
        features=features[:6],
        amenities=[],
        carriage_notes=[],
    )
