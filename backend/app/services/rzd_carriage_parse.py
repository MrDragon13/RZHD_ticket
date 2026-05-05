"""Разбор JSON слоя вагонов РЖД (pass.rzd.ru) и вложенных seats в строках поиска."""

from __future__ import annotations

import re
from typing import Any, Iterator

from app.models import SeatDetails, SeatInfo, SeatBerthPrices


def _norm(s: str) -> str:
    return s.casefold().replace("ё", "е")


def _int_any(*vals: Any) -> int | None:
    for v in vals:
        if v is None:
            continue
        try:
            return int(round(float(v)))
        except (TypeError, ValueError):
            continue
    return None


def sum_seat_details(a: SeatDetails, b: SeatDetails) -> SeatDetails:
    return SeatDetails(
        lower=a.lower + b.lower,
        upper=a.upper + b.upper,
        side_lower=a.side_lower + b.side_lower,
        side_upper=a.side_upper + b.side_upper,
    )


def seat_details_from_car_row_nested(row: dict) -> SeatDetails | None:
    """Если в строке cars[] есть seats[] с label/free — суммируем как даёт РЖД."""

    seats = row.get("seats")
    if not isinstance(seats, list) or not seats:
        return None
    acc = SeatDetails()
    any_nonzero = False
    for s in seats:
        if not isinstance(s, dict):
            continue
        free = _int_any(s.get("free"), s.get("freeSeats"), s.get("quantity"), s.get("count"))
        if free is None or free <= 0:
            continue
        label = _norm(
            str(s.get("label") or s.get("typeLoc") or s.get("title") or s.get("name") or ""),
        )
        any_nonzero = True
        _add_free_by_label(acc, label, free)
    if not any_nonzero:
        return None
    return acc


def _seat_total_from_entry(s: dict) -> int | None:
    """Всего мест в категории тарифа (ёмкость), если РЖД передала счётчик или список мест."""

    n = _int_any(
        s.get("placeCount"),
        s.get("placesTotal"),
        s.get("total"),
        s.get("capacity"),
        s.get("seatCount"),
    )
    if n is not None and n > 0:
        return min(n, 200)
    places = s.get("places")
    if isinstance(places, list) and places:
        return len(places)
    if isinstance(places, str) and places.strip():
        return len(re.findall(r"\d+", places))
    return None


def _add_free_by_label(acc: SeatDetails, label: str, free: int) -> None:
    if "бок" in label:
        if "ниж" in label or label.endswith(" н"):
            acc.side_lower += free
        elif "верх" in label or "врх" in label:
            acc.side_upper += free
        else:
            acc.side_lower += free // 2
            acc.side_upper += free - free // 2
    elif "ниж" in label:
        acc.lower += free
    elif "верх" in label or "врх" in label:
        acc.upper += free
    else:
        acc.lower += (free + 1) // 2
        acc.upper += free // 2


def _add_total_by_label(acc: SeatDetails, label: str, total: int) -> None:
    if "бок" in label:
        if "ниж" in label or label.endswith(" н"):
            acc.side_lower += total
        elif "верх" in label or "врх" in label:
            acc.side_upper += total
        else:
            acc.side_lower += total // 2
            acc.side_upper += total - total // 2
    elif "ниж" in label:
        acc.lower += total
    elif "верх" in label or "врх" in label:
        acc.upper += total
    else:
        acc.lower += (total + 1) // 2
        acc.upper += total // 2


def seat_details_totals_from_car_row_nested(row: dict) -> SeatDetails | None:
    """Суммарная вместимость по категориям полок из seats[] (placeCount / список places)."""

    seats = row.get("seats")
    if not isinstance(seats, list) or not seats:
        return None
    acc = SeatDetails()
    any_nonzero = False
    for s in seats:
        if not isinstance(s, dict):
            continue
        total = _seat_total_from_entry(s)
        if total is None or total <= 0:
            continue
        label = _norm(
            str(s.get("label") or s.get("typeLoc") or s.get("title") or s.get("name") or ""),
        )
        any_nonzero = True
        _add_total_by_label(acc, label, total)
    if not any_nonzero:
        return None
    return acc


def seat_details_available_from_car_row_nested(row: dict) -> SeatDetails | None:
    """Свободные места по категориям для одного вагона (та же логика, что seat_details_from_car_row_nested)."""

    return seat_details_from_car_row_nested(row)


def seat_details_from_car_row_flat(row: dict) -> SeatDetails | None:
    """Плоские ключи вроде lowerSeats, upperCnt — если API отдаёт без массива seats."""

    lower = _int_any(
        row.get("lowerSeats"),
        row.get("lower"),
        row.get("lowerCnt"),
        row.get("Lower"),
    )
    upper = _int_any(
        row.get("upperSeats"),
        row.get("upper"),
        row.get("upperCnt"),
        row.get("Upper"),
    )
    sl = _int_any(
        row.get("sideLowerSeats"),
        row.get("side_lower"),
        row.get("lowerSide"),
        row.get("sideLower"),
    )
    su = _int_any(
        row.get("sideUpperSeats"),
        row.get("side_upper"),
        row.get("upperSide"),
        row.get("sideUpper"),
    )
    if lower is None and upper is None and sl is None and su is None:
        return None
    return SeatDetails(
        lower=lower or 0,
        upper=upper or 0,
        side_lower=sl or 0,
        side_upper=su or 0,
    )


def seat_details_from_search_car_row(row: dict) -> SeatDetails | None:
    nested = seat_details_from_car_row_nested(row)
    if nested and (nested.lower + nested.upper + nested.side_lower + nested.side_upper) > 0:
        return nested
    flat = seat_details_from_car_row_flat(row)
    if flat and (flat.lower + flat.upper + flat.side_lower + flat.side_upper) > 0:
        return flat
    return None


def _walk_cars_nodes(payload: dict) -> Iterator[dict]:
    """Ищем списки вагонов в типичных местах ответа layer 5764."""

    if not isinstance(payload, dict):
        return
    root_cars = payload.get("cars")
    if isinstance(root_cars, list):
        for car in root_cars:
            if isinstance(car, dict):
                yield car

    for block in payload.get("lst") or []:
        if not isinstance(block, dict):
            continue
        cars = block.get("cars") or block.get("wagons") or block.get("Car")
        if isinstance(cars, list):
            for car in cars:
                if isinstance(car, dict):
                    yield car
        elif isinstance(block.get("cnumber"), (str, int)) or block.get("seats"):
            yield block

    for block in payload.get("tp") or []:
        if not isinstance(block, dict):
            continue
        cars = block.get("cars") or block.get("list")
        if isinstance(cars, list):
            for car in cars:
                if isinstance(car, dict):
                    yield car


def _classify_wagon(text: str) -> str | None:
    t = _norm(text)
    if any(x in t for x in ("св", "люкс", "lux", "мягк")):
        return "sv"
    if any(x in t for x in ("купе", "coupe", "сидяч", "пасс", "пк", "фирм")):
        return "coupe"
    if any(x in t for x in ("плац", "platz", "общ")):
        return "platzkart"
    return None


def _wagon_category(car: dict) -> str | None:
    parts = [
        str(car.get("type") or ""),
        str(car.get("typeLoc") or ""),
        str(car.get("clsType") or ""),
        str(car.get("servCls") or ""),
    ]
    return _classify_wagon(" ".join(parts))


def _capacity_from_wagon(car: dict) -> int | None:
    """Максимальная вместимость вагона по данным РЖД (если есть)."""

    for key in ("capacity", "totalSeats", "seatCount", "placesTotal", "maxSeats", "carCapacity"):
        n = _int_any(car.get(key))
        if n and n > 0:
            return min(n, 120)
    seats = car.get("seats")
    cap = 0
    if isinstance(seats, list):
        for s in seats:
            if not isinstance(s, dict):
                continue
            places = s.get("places")
            if isinstance(places, list) and places:
                cap += len(places)
            elif isinstance(places, str) and places.strip():
                cap += len(re.findall(r"\d+", places))
            pf = _int_any(s.get("placeCount"), s.get("total"))
            if pf:
                cap = max(cap, pf)
    return cap if cap > 0 else None


def _min_merge(cur: int | None, val: int | None) -> int | None:
    if val is None or val <= 0:
        return cur
    return val if cur is None else min(cur, val)


def merge_berth_prices(acc: SeatBerthPrices, addition: SeatBerthPrices) -> SeatBerthPrices:
    return SeatBerthPrices(
        lower=_min_merge(acc.lower, addition.lower),
        upper=_min_merge(acc.upper, addition.upper),
        side_lower=_min_merge(acc.side_lower, addition.side_lower),
        side_upper=_min_merge(acc.side_upper, addition.side_upper),
    )


def berth_prices_from_seat_entries(seats: list[dict]) -> SeatBerthPrices:
    """Минимальный тариф по подписи категории места (seats[] из РЖД)."""

    bp = SeatBerthPrices()
    for s in seats:
        if not isinstance(s, dict):
            continue
        free = _int_any(s.get("free"), s.get("freeSeats"))
        if free is None or free <= 0:
            continue
        raw_t = s.get("tariff") or s.get("price") or s.get("cost")
        try:
            rub = int(round(float(raw_t))) if raw_t is not None else None
        except (TypeError, ValueError):
            rub = None
        if rub is None or rub <= 0:
            continue
        label = _norm(str(s.get("label") or s.get("typeLoc") or ""))
        if "бок" in label:
            if "ниж" in label:
                bp.side_lower = _min_merge(bp.side_lower, rub)
            elif "верх" in label:
                bp.side_upper = _min_merge(bp.side_upper, rub)
            else:
                bp.side_lower = _min_merge(bp.side_lower, rub)
        elif "ниж" in label:
            bp.lower = _min_merge(bp.lower, rub)
        elif "верх" in label:
            bp.upper = _min_merge(bp.upper, rub)
        else:
            bp.lower = _min_merge(bp.lower, rub)
    return bp


def aggregate_from_carriages_payload(payload: dict) -> tuple[SeatDetails, SeatInfo, dict[str, int | None], bool, SeatBerthPrices]:
    """Полный разбор ответа get_train_carriages для полок, сумм по классам и max вместимости на тип вагона."""

    details = SeatDetails()
    platz = coupe = sv = 0

    max_platz: int | None = None
    max_coupe: int | None = None
    max_sv: int | None = None
    double_deck_coupe = False
    berth_prices = SeatBerthPrices()

    for car in _walk_cars_nodes(payload):
        cat = _wagon_category(car)
        cap = _capacity_from_wagon(car)

        text_blob = _norm(
            f"{car.get('type', '')} {car.get('typeLoc', '')} {car.get('clsType', '')}",
        )
        if any(x in text_blob for x in ("двухэтаж", "2 эт", "2эт", "двух ярус")):
            double_deck_coupe = True

        partial = seat_details_from_car_row_nested(car)
        if partial is None:
            partial = seat_details_from_car_row_flat(car)
        if partial:
            details = sum_seat_details(details, partial)

        seats = car.get("seats") if isinstance(car.get("seats"), list) else []
        berth_prices = merge_berth_prices(berth_prices, berth_prices_from_seat_entries(seats))
        car_free = 0
        for s in seats:
            if not isinstance(s, dict):
                continue
            f = _int_any(s.get("free"), s.get("freeSeats"))
            if f:
                car_free += f
        if car_free == 0:
            car_free = _int_any(car.get("freeSeats"), car.get("free")) or 0

        if cat == "platzkart":
            platz += car_free
            if cap:
                max_platz = cap if max_platz is None else max(max_platz, cap)
        elif cat == "coupe":
            coupe += car_free
            if cap:
                max_coupe = cap if max_coupe is None else max(max_coupe, cap)
        elif cat == "sv":
            sv += car_free
            if cap:
                max_sv = cap if max_sv is None else max(max_sv, cap)
        elif car_free:
            platz += car_free

    caps: dict[str, int | None] = {
        "platzkart_carriage_seats": max_platz,
        "coupe_carriage_seats": max_coupe,
        "sv_carriage_seats": max_sv,
    }
    info = SeatInfo(platzkart=platz, coupe=coupe, sv=sv)
    return details, info, caps, double_deck_coupe, berth_prices


def extract_route_distance_km(content: dict) -> int | None:
    """Дополнительные ключи расстояния в ответе поезда."""

    for key in (
        "distance",
        "routeDistanceKm",
        "routeDistance",
        "routeLen",
        "routeLenKm",
        "totalDistance",
        "dist",
        "distKm",
        "length",
        "routeLength",
    ):
        raw = content.get(key)
        if raw is None:
            continue
        try:
            v = float(raw)
            if v > 0:
                if v > 5000:
                    v = v / 1000.0
                return int(round(v))
        except (TypeError, ValueError):
            continue
    return None


def extract_train_stops(content: dict) -> list[str]:
    """Имена остановок из разных вариантов JSON слоя поиска поездов РЖД."""

    names: list[str] = []
    seen: set[str] = set()

    def add(raw: object | None) -> None:
        if raw is None:
            return
        n = str(raw).strip()
        if len(n) < 2:
            return
        key = _norm(n)
        if key in seen:
            return
        seen.add(key)
        names.append(n)

    raw_list = content.get("stops") or content.get("stopList")
    if isinstance(raw_list, list):
        for s in raw_list[:80]:
            if isinstance(s, str):
                add(s)
            elif isinstance(s, dict):
                add(
                    s.get("station")
                    or s.get("stationName")
                    or s.get("name")
                    or s.get("title")
                    or s.get("stName")
                    or s.get("city")
                )

    if len(names) < 2:
        for alt_key in (
            "routeStops",
            "stopSchedule",
            "stationsList",
            "schedule",
            "stationList",
            "stations",
            "routeStation",
            "routeSchedule",
            "lstStation",
        ):
            nested = content.get(alt_key)
            if not isinstance(nested, list):
                continue
            for item in nested[:80]:
                if isinstance(item, str):
                    add(item)
                elif isinstance(item, dict):
                    add(
                        item.get("station")
                        or item.get("stationName")
                        or item.get("name")
                        or item.get("title")
                    )

    return names[:80]
