"""Разбор метаданных вагона из ответа get_train_carriages (5764): пол купе, услуги."""

from __future__ import annotations

import html
import re
from typing import Any

from app.models import CarriageDetail, CompartmentKind, CompartmentSeatHint, SeatDetails


def _strip_html(text: str) -> str:
    t = re.sub(r"<[^>]+>", " ", text)
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _norm(s: str) -> str:
    return s.casefold().replace("ё", "е")


def parse_compartment_kind(add_signs: str | None, cls_name: str | None) -> CompartmentKind:
    """Эвристика по addSigns и тексту clsName (РЖД кодирует по-разному)."""

    blob = _norm(f"{add_signs or ''} {_strip_html(cls_name or '')}")
    if any(x in blob for x in ("детск", "детей", "школ", "младш")):
        return "children"
    if "семей" in blob or "родител" in blob or "младен" in blob:
        return "family"
    raw = (add_signs or "").strip().upper()
    if "Ж" in raw and "М" not in raw and "МЖ" not in raw:
        return "female"
    if raw == "М" or (raw.startswith("М") and "Ж" not in raw and "МЖ" not in raw):
        return "male"
    if "МЖ" in raw or "М/Ж" in raw or ("М" in raw and "Ж" in raw):
        return "mixed"
    if "женск" in blob:
        return "female"
    if "мужск" in blob and "младен" not in blob:
        return "male"
    if "смешан" in blob or "общ" in blob and "купе" in blob:
        return "mixed"
    return "unknown"


_COMP_IDX_KEY_CANDIDATES = (
    "compartmentIndex",
    "compartment",
    "compartmentNumber",
    "compartmentNo",
    "section",
    "sectionNo",
    "coupeNum",
    "kupeNum",
    "compIdx",
    "compartmentIdx",
    "compart",
)


def _extract_compartment_index_for_hint(seat_row: dict, blob: str) -> int | None:
    """Пытаемся вытащить индекс отсека (0-based) из полей строки seats[] или из подписи."""

    for key in _COMP_IDX_KEY_CANDIDATES:
        raw = seat_row.get(key)
        if raw is None or raw == "":
            continue
        try:
            n = int(float(str(raw).strip().replace(",", ".")))
        except (TypeError, ValueError):
            continue
        if 1 <= n <= 36:
            return n - 1
        if 0 <= n <= 35:
            return n
    b = _norm(blob)
    for pat in (
        r"(?:купе|комп(?:арт)?|отсек|сек(?:ция)?|бокс)[^\d]{0,16}(\d{1,2})\b",
        r"\b(\d{1,2})(?:-?[еоыиaяь])?\s*(?:купе|комп|отсек)\b",
    ):
        m = re.search(pat, b, re.I)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 36:
                return n - 1
            if 0 <= n <= 35:
                return n
    return None


def _merge_compartment_kinds(a: CompartmentKind, b: CompartmentKind) -> CompartmentKind:
    if a == b:
        return a
    if {a, b} == {"female", "male"}:
        return "mixed"
    rank = {"unknown": 0, "family": 1, "children": 2, "mixed": 4, "male": 5, "female": 5}
    return a if rank.get(a, 0) >= rank.get(b, 0) else b


def infer_compartment_seat_hints(car: dict) -> list[CompartmentSeatHint]:
    """Разбор seats[]: если в строке есть и пол, и номер отсека — добавляем hint."""

    seats = car.get("seats")
    if not isinstance(seats, list) or not seats:
        return []
    by_idx: dict[int, CompartmentKind] = {}
    for s in seats:
        if not isinstance(s, dict):
            continue
        parts = [
            str(s.get("label") or ""),
            str(s.get("typeLoc") or ""),
            str(s.get("title") or ""),
            str(s.get("name") or ""),
            str(s.get("clsName") or ""),
            str(s.get("catLabelLoc") or ""),
            str(s.get("description") or ""),
        ]
        blob_raw = " ".join(parts)
        blob = _norm(_strip_html(blob_raw))
        if len(blob) < 4:
            continue
        kind = parse_compartment_kind(None, blob_raw)
        if kind == "unknown":
            continue
        ci = _extract_compartment_index_for_hint(s, blob)
        if ci is None:
            continue
        ci = max(0, min(ci, 48))
        if ci in by_idx:
            by_idx[ci] = _merge_compartment_kinds(by_idx[ci], kind)
        else:
            by_idx[ci] = kind
    return [
        CompartmentSeatHint(compartment_index=k, kind=v)
        for k, v in sorted(by_idx.items(), key=lambda x: x[0])
    ]


def _service_labels(services: Any, limit: int = 12) -> list[str]:
    if not isinstance(services, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in services:
        if not isinstance(item, dict):
            continue
        desc = item.get("description") or item.get("name") or ""
        if not isinstance(desc, str):
            continue
        desc = _strip_html(desc)
        desc = re.sub(r"^\[иконка сайта\]\s*", "", desc, flags=re.I).strip()
        if len(desc) < 2:
            continue
        if desc.lower().startswith("[иконка"):
            continue
        key = desc.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(desc[:120])
        if len(out) >= limit:
            break
    return out


def carriage_detail_from_rzd_car(car: dict) -> CarriageDetail | None:
    from app.services.rzd_carriage_parse import (
        seat_details_available_from_car_row_nested,
        seat_details_totals_from_car_row_nested,
    )

    if not isinstance(car, dict):
        return None
    num = car.get("cnumber")
    if num is None:
        return None
    number = str(num).strip().zfill(2) if str(num).strip().isdigit() else str(num).strip()
    type_label = str(car.get("typeLoc") or car.get("catLabelLoc") or car.get("type") or "").strip() or "—"
    cls_raw = car.get("clsName")
    cls_name = str(cls_raw) if cls_raw else None
    summary = _strip_html(cls_name) if cls_name else None
    if summary and len(summary) > 280:
        summary = summary[:277] + "…"

    add_signs = car.get("addSigns")
    add_raw = str(add_signs).strip() if add_signs is not None else None

    kind = parse_compartment_kind(add_raw, cls_name)

    services_short = _service_labels(car.get("services"))

    berth_totals = seat_details_totals_from_car_row_nested(car)
    berth_available = seat_details_available_from_car_row_nested(car)
    compartment_seat_hints = infer_compartment_seat_hints(car)

    return CarriageDetail(
        number=number,
        type_label=type_label,
        compartment_kind=kind,
        add_signs_raw=add_raw,
        service_summary=summary,
        services_short=services_short,
        compartment_seat_hints=compartment_seat_hints,
        berth_totals=_clean_seat_details(berth_totals),
        berth_available=_clean_seat_details(berth_available),
    )


def _clean_seat_details(d: SeatDetails | None) -> SeatDetails | None:
    if d is None:
        return None
    if d.lower + d.upper + d.side_lower + d.side_upper <= 0:
        return None
    return d


def carriage_details_from_payload(payload: dict) -> list[CarriageDetail]:
    from app.services.rzd_carriage_parse import _walk_cars_nodes

    details: list[CarriageDetail] = []
    seen_nums: dict[str, int] = {}
    for car in _walk_cars_nodes(payload):
        d = carriage_detail_from_rzd_car(car)
        if not d:
            continue
        if d.number in seen_nums:
            seen_nums[d.number] += 1
            d = d.model_copy(update={"number": f"{d.number}-{seen_nums[d.number]}"})
        else:
            seen_nums[d.number] = 0
        details.append(d)

    def sort_key(c: CarriageDetail) -> tuple[int, str]:
        base = c.number.split("-")[0]
        try:
            return (int(base), c.number)
        except ValueError:
            return (999, c.number)

    details.sort(key=sort_key)
    return details
