"""Маппинг ответов vendored aiorzd → TrainOption."""

from __future__ import annotations

import logging
import re
from datetime import datetime

from app.models import PriceInfo, SeatBerthPrices, SeatDetails, SeatInfo, TrainOption
from app.services.rzd_carriage_parse import (
    aggregate_from_carriages_payload,
    berth_prices_from_seat_entries,
    extract_route_distance_km,
    extract_train_stops,
    merge_stops_with_search_route,
    merge_berth_prices,
    seat_details_from_search_car_row,
    sum_seat_details,
)
from app.services.rzd_wagon_details import carriage_details_from_payload


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
    """Сумма свободных мест в строке cars[] (верхний уровень или вложенные seats[])."""

    for key in ("freeSeats", "free", "places", "seatCount", "quantity"):
        raw = row.get(key)
        if raw is None:
            continue
        try:
            v = int(round(float(raw)))
            if v > 0:
                return v
        except (TypeError, ValueError):
            continue
    seats = row.get("seats")
    if isinstance(seats, list):
        nested = 0
        for s in seats:
            if not isinstance(s, dict):
                continue
            for key in ("free", "freeSeats", "quantity"):
                raw = s.get(key)
                if raw is None:
                    continue
                try:
                    nested += int(round(float(raw)))
                except (TypeError, ValueError):
                    continue
        if nested > 0:
            return nested
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


def estimate_seat_details_from_totals(platz: int, coupe: int, sv: int) -> SeatDetails:
    """Оценка разбивки по полкам для карточки поезда (агрегаты РЖД без построчной схемы).

    Плацкарт: типичное соотношение основных и боковых полок (~1/3 + 1/3 + 1/6 + 1/6).
    Купе и СВ: только нижние/верхние пары мест.
    """

    lower = upper = side_lower = side_upper = 0
    if platz > 0:
        lower = platz // 3
        upper = platz // 3
        rem = platz - lower - upper
        side_lower = rem // 2
        side_upper = rem - side_lower
    if coupe > 0:
        lower += (coupe + 1) // 2
        upper += coupe // 2
    if sv > 0:
        lower += (sv + 1) // 2
        upper += sv // 2
    return SeatDetails(lower=lower, upper=upper, side_lower=side_lower, side_upper=side_upper)


def _seat_prices_model(bp: SeatBerthPrices | None) -> SeatBerthPrices | None:
    if bp is None:
        return None
    if not any(x is not None for x in (bp.lower, bp.upper, bp.side_lower, bp.side_upper)):
        return None
    return bp


def aggregate_cars_to_inventory(cars: list[dict]) -> tuple[SeatInfo, SeatDetails, PriceInfo, SeatBerthPrices]:
    """Суммирует строки cars[] из ответа РЖД по типам вагонов и вложенные seats[]."""

    platz = coupe = sv = unknown = 0
    min_platz: int | None = None
    min_coupe: int | None = None
    min_sv: int | None = None

    details_acc = SeatDetails()
    berth_acc = SeatBerthPrices()

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

        row_det = seat_details_from_search_car_row(row)
        if row_det:
            details_acc = sum_seat_details(details_acc, row_det)

        seats_nested = row.get("seats")
        if isinstance(seats_nested, list):
            berth_acc = merge_berth_prices(berth_acc, berth_prices_from_seat_entries(seats_nested))

    if unknown:
        platz += unknown

    if details_acc.lower + details_acc.upper + details_acc.side_lower + details_acc.side_upper == 0:
        details_acc = estimate_seat_details_from_totals(platz, coupe, sv)

    return (
        SeatInfo(platzkart=platz, coupe=coupe, sv=sv),
        details_acc,
        PriceInfo(platzkart=min_platz, coupe=min_coupe, sv=min_sv),
        berth_acc,
    )


def aggregate_from_aiorzd_places(places: list) -> tuple[SeatInfo, SeatDetails, PriceInfo, SeatBerthPrices]:
    """Запасной путь: aiorzd уже разложил строки ответа в объекты Place."""

    platz = coupe = sv = unknown = 0
    min_platz: int | None = None
    min_coupe: int | None = None
    min_sv: int | None = None

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

    berth_acc = SeatBerthPrices()

    details_acc = estimate_seat_details_from_totals(platz, coupe, sv)

    return (
        SeatInfo(platzkart=platz, coupe=coupe, sv=sv),
        details_acc,
        PriceInfo(platzkart=min_platz, coupe=min_coupe, sv=min_sv),
        berth_acc,
    )


def apply_carriage_layer_payload(train: TrainOption, payload: dict | None) -> TrainOption:
    """Подмена полок / сумм / вместимости вагона данными слоя 5764 (если разобрались)."""

    if not payload:
        return train
    try:
        det, info, caps, double_deck, berth_layer = aggregate_from_carriages_payload(payload)
    except Exception:
        logging.exception("carriage payload parse failed")
        return train

    upd: dict = {}
    if det.lower + det.upper + det.side_lower + det.side_upper > 0:
        upd["seat_details"] = det
    if info.platzkart + info.coupe + info.sv > 0:
        upd["available_seats"] = info
    if caps.get("platzkart_carriage_seats"):
        upd["platzkart_carriage_seats"] = caps["platzkart_carriage_seats"]
    if caps.get("coupe_carriage_seats"):
        upd["coupe_carriage_seats"] = caps["coupe_carriage_seats"]
    if caps.get("sv_carriage_seats"):
        upd["sv_carriage_seats"] = caps["sv_carriage_seats"]
    if double_deck and caps.get("coupe_carriage_seats"):
        upd["coupe_double_deck_seats"] = caps["coupe_carriage_seats"]
    if double_deck:
        upd["coupe_double_deck"] = True

    merged_bp = merge_berth_prices(train.seat_prices or SeatBerthPrices(), berth_layer)
    sp = _seat_prices_model(merged_bp)
    if sp:
        upd["seat_prices"] = sp

    try:
        wagons = carriage_details_from_payload(payload)
    except Exception:
        logging.exception("carriage details parse failed")
        wagons = []
    if wagons:
        upd["carriage_details"] = wagons

    if not upd:
        return train
    return train.model_copy(update=upd)


def train_option_from_aiorzd(
    train_obj,
    index: int,
    *,
    origin_hint: str | None,
    dest_hint: str | None,
    language: str,
    carriage_payload: dict | None = None,
) -> TrainOption:
    """Преобразует объект aiorzd.Train в TrainOption."""

    content = train_obj.content or {}
    dep: datetime = train_obj.departure_time
    arr: datetime = train_obj.arrival_time
    dur_min = max(0, int((arr - dep).total_seconds() // 60))

    lang = "ru" if language == "ru" else "en"
    duration_label = _minutes_to_label(dur_min, lang)

    cars = content.get("cars") or []
    seat_info, seat_details, prices, berth_search = aggregate_cars_to_inventory(cars)
    total_shown = seat_info.platzkart + seat_info.coupe + seat_info.sv
    if total_shown == 0 and getattr(train_obj, "seats", None):
        seat_info, seat_details, prices, berth_search_alt = aggregate_from_aiorzd_places(list(train_obj.seats.values()))
        berth_search = merge_berth_prices(berth_search, berth_search_alt)

    seat_prices_combined = _seat_prices_model(berth_search)

    route0 = str(content.get("route0") or origin_hint or "").strip()
    route1 = str(content.get("route1") or dest_hint or "").strip()

    distance_raw = content.get("distance") or content.get("routeDistanceKm") or content.get("routeDistance")
    try:
        route_km = int(float(distance_raw)) if distance_raw is not None else 0
        if route_km > 8000:
            route_km = int(round(route_km / 1000))
    except (TypeError, ValueError):
        route_km = 0
    alt_km = extract_route_distance_km(content)
    if alt_km and route_km == 0:
        route_km = alt_km

    stops = merge_stops_with_search_route(
        extract_train_stops(content if isinstance(content, dict) else {}),
        origin_hint,
        dest_hint,
    )

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

    base = TrainOption(
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
        seat_prices=seat_prices_combined,
    )
    return apply_carriage_layer_payload(base, carriage_payload)
