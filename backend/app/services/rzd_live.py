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


def _normalize_rzd_text(s: str) -> str:
    t = s.casefold().replace("ё", "е")
    return t


def _parse_free_seats(row: dict) -> int:
    """РЖД в разных ответах может отдавать разные ключи."""

    for key in ("freeSeats", "free", "places", "seatCount", "quantity"):
        raw = row.get(key)
        if raw is None:
            continue
        try:
            return int(round(float(raw)))
        except (TypeError, ValueError):
            continue
    return 0


def _classify_car_row(text: str) -> str | None:
    """Грубая категория для UI (плац / купе / св)."""

    t = _normalize_rzd_text(text)
    # СВ / люкс / мягкий
    if any(
        x in t
        for x in (
            " св ",
            "(св)",
            "св,",
            "-св",
            "люкс",
            "lux",
            "мягк",
            "deluxe",
        )
    ):
        return "sv"
    if t.startswith("св ") or t.endswith(" св") or t == "св":
        return "sv"
    # Купе, сидячий, пасс. с местами и т.п.
    if any(
        x in t
        for x in (
            "купе",
            "coupe",
            "сидяч",
            "пасс",
            "фирм",
            "скорост",
            "ласточ",
            "сапсан",
            "резерв",
            " пк ",
            "пк-",
        )
    ):
        return "coupe"
    # Плацкарт / общий
    if any(x in t for x in ("плац", "platz", "общ", "плацкарт")):
        return "platzkart"
    return None


def _classify_car_dict(row: dict) -> str | None:
    """Классификация по всем текстовым полям строки cars[]."""

    parts = [
        str(row.get("type") or ""),
        str(row.get("typeLoc") or ""),
        str(row.get("servCls") or ""),
        str(row.get("category") or ""),
        str(row.get("carType") or ""),
        str(row.get("itype") or ""),
    ]
    combined = " ".join(parts)
    cat = _classify_car_row(combined)
    if cat:
        return cat

    # Коды класса обслуживания (часто латиница/цифры): 3П — плацкарт, 2К/2Ю — купе и т.д.
    serv = _normalize_rzd_text(str(row.get("servCls") or ""))
    if any(x in serv for x in ("3п", "3п-", "плац")):
        return "platzkart"
    if any(x in serv for x in ("св", "люкс", "lux")):
        return "sv"
    if any(x in serv for x in ("2к", "2ю", "2ж", "2э", "купе", "куп")):
        return "coupe"

    return None


def aggregate_cars_to_inventory(cars: list[dict]) -> tuple[SeatInfo, SeatDetails, PriceInfo]:
    """Суммирует строки cars[] из ответа РЖД по типам вагонов."""

    platz = coupe = sv = unknown = 0
    min_platz: int | None = None
    min_coupe: int | None = None
    min_sv: int | None = None

    lower = upper = side_lower = side_upper = 0

    for row in cars:
        free = _parse_free_seats(row)
        raw_tariff = row.get("tariff")
        try:
            price_rub = int(round(float(raw_tariff))) if raw_tariff is not None else None
        except (TypeError, ValueError):
            price_rub = None

        cat = _classify_car_dict(row)
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
        else:
            unknown += free

    # Нераспознанные места не теряем: показываем в «плацкарт» (самый частый класс в выдаче).
    if unknown:
        platz += unknown

    # Грубая оценка полок для плацкарта.
    if platz and coupe == 0 and sv == 0:
        lower = int(platz * 0.45)
        upper = platz - lower

    return (
        SeatInfo(platzkart=platz, coupe=coupe, sv=sv),
        SeatDetails(lower=lower, upper=upper, side_lower=side_lower, side_upper=side_upper),
        PriceInfo(platzkart=min_platz, coupe=min_coupe, sv=min_sv),
    )


def aggregate_from_aiorzd_places(places: list) -> tuple[SeatInfo, SeatDetails, PriceInfo]:
    """Запасной путь: aiorzd уже разложил строки ответа в объекты Place."""

    platz = coupe = sv = unknown = 0
    min_platz: int | None = None
    min_coupe: int | None = None
    min_sv: int | None = None

    lower = upper = side_lower = side_upper = 0

    for place in places:
        label = getattr(place, "type", None) or ""
        try:
            free = int(getattr(place, "quantity", 0) or 0)
        except (TypeError, ValueError):
            free = 0
        raw_price = getattr(place, "price", None)
        try:
            price_rub = int(round(float(raw_price))) if raw_price is not None else None
        except (TypeError, ValueError):
            price_rub = None

        cat = _classify_car_row(str(label))
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
        else:
            unknown += free

    if unknown:
        platz += unknown

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
    total_shown = seat_info.platzkart + seat_info.coupe + seat_info.sv
    if total_shown == 0 and getattr(train_obj, "seats", None):
        seat_info, seat_details, prices = aggregate_from_aiorzd_places(list(train_obj.seats.values()))

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
