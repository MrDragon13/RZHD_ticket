"""Эвристики: когда нужен слой вагонов (5764) и как сопоставить запрос с метаданными вагонов."""

from __future__ import annotations

import re
from collections.abc import Iterable

from app.models import CarriageDetail, TrainOption

# Канонические теги (такие же могут прийти в preferences с LLM или с fallback-разбора).
WAGON_SERVICE_TAGS = frozenset(
    {
        "pets",
        "restaurant",
        "air_conditioning",
        "wifi",
        "media",
    }
)

# (канонический тег, подстроки в нормализованном тексте вагонов / запроса)
_TAG_NEEDLES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "restaurant",
        (
            "ресторан",
            "вагон-ресторан",
            "вагон ресторан",
            "купе-бар",
            "restaurant",
            "buffet",
            "dining car",
        ),
    ),
    (
        "air_conditioning",
        (
            "кондицион",
            "кондициониру",
            "air cond",
            "aircond",
            "climate control",
            "a/c",
        ),
    ),
    (
        "pets",
        (
            "животн",
            "питомц",
            "перевоз живот",
            "собак",
            "кошк",
            "pet",
            "pets",
            "dog",
            "cat",
        ),
    ),
    (
        "wifi",
        (
            "wi-fi",
            "wifi",
            "wi fi",
            "беспроводн",
            "wireless",
        ),
    ),
    (
        "media",
        (
            "медиа",
            "телевиз",
            " tv",
            "tv-",
            "audio",
            "video",
            "entertainment",
            "развлечен",
        ),
    ),
)

_PREFERENCE_ALIASES: dict[str, str] = {
    "ac": "air_conditioning",
    "climate": "air_conditioning",
    "cooling": "air_conditioning",
    "aircon": "air_conditioning",
    "pet": "pets",
    "animals": "pets",
    "animal": "pets",
    "dining": "restaurant",
    "buffet": "restaurant",
}


def _norm(s: str) -> str:
    t = s.casefold().replace("ё", "е")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def extract_wagon_constraints(
    preferences: Iterable[str] | None,
    last_user_message: str | None = None,
) -> frozenset[str]:
    """Возвращает набор услуг вагона, по которым нужна детализация / фильтрация."""

    found: set[str] = set()
    for raw in preferences or []:
        p = _norm(str(raw))
        if not p:
            continue
        if p in WAGON_SERVICE_TAGS:
            found.add(p)
            continue
        if p in _PREFERENCE_ALIASES:
            found.add(_PREFERENCE_ALIASES[p])
            continue
    blob = _norm(f"{' '.join(preferences or [])} {last_user_message or ''}")
    for tag, needles in _TAG_NEEDLES:
        if any(n in blob for n in needles):
            found.add(tag)
    return frozenset(t for t in found if t in WAGON_SERVICE_TAGS)


def needs_carriage_layer_for_search(
    preferences: Iterable[str] | None,
    last_user_message: str | None,
    rank_with_llm: bool,
) -> bool:
    """Нужно ли на этапе поиска догружать 5764 (дополнительно к явному RZD_CARRIAGE_ENRICH)."""

    if rank_with_llm:
        return True
    return bool(extract_wagon_constraints(preferences, last_user_message))


def train_wagon_text_blob(train: TrainOption) -> str:
    """Склеивает все текстовые сигналы уровня вагона/услуг по поезду."""

    parts: list[str] = []
    parts.extend(train.amenities or [])
    parts.extend(train.features or [])
    parts.extend(train.carriage_notes or [])
    for n in train.carriage_details or []:
        if isinstance(n, CarriageDetail):
            parts.append(n.type_label or "")
            parts.append(n.service_summary or "")
            parts.extend(n.services_short or [])
            if n.add_signs_raw:
                parts.append(n.add_signs_raw)
    return _norm(" ".join(parts))


def train_satisfies_wagon_tag(train: TrainOption, tag: str) -> bool:
    """Проверяет один тег по подстрокам в «блобе» вагонов."""

    if tag not in WAGON_SERVICE_TAGS:
        return True
    blob = train_wagon_text_blob(train)
    if not blob:
        return False
    for t, needles in _TAG_NEEDLES:
        if t == tag:
            return any(n in blob for n in needles)
    return False


def train_satisfies_all_wagon_tags(train: TrainOption, tags: frozenset[str]) -> bool:
    if not tags:
        return True
    return all(train_satisfies_wagon_tag(train, t) for t in tags)


def filter_trains_by_wagon_constraints(
    trains: list[TrainOption],
    constraints: frozenset[str],
) -> list[TrainOption]:
    """Строго оставляет только поезда, у которых в данных вагонов видны все запрошенные услуги."""

    if not constraints:
        return trains
    return [t for t in trains if train_satisfies_all_wagon_tags(t, constraints)]
