"""Построение сегмента маршрута пользователя по списку остановок поезда РЖД.

Логируем каждый шаг (INFO), чтобы по логам сервера можно было найти, где ломается цепочка.
Если индексы станций отправления/назначения не находятся эвристикой — запрашиваем DeepSeek.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field

from app.services.deepseek_client import DeepSeekClient


def _norm(s: str) -> str:
    return (
        str(s or "")
        .casefold()
        .replace("ё", "е")
        .replace(".", " ")
        .strip()
    )


def _strip_station_noise(s: str) -> str:
    t = _norm(s)
    t = re.sub(
        r"\s+(пасс|пассажирский|главн|главный|центр|экспресс)\s*$",
        "",
        t,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", t).strip()


def station_matches(station_name: str, user_hint: str) -> bool:
    """Грубое совпадение названий станций (как на фронте)."""

    a = _strip_station_noise(station_name)
    b = _strip_station_noise(user_hint)
    if not a or not b:
        return False
    if a == b:
        return True
    if b in a or a in b:
        return True

    def collapse_abbrev(t: str) -> str:
        return re.sub(r"\b([а-яa-z])\s+", r"\1", t)

    a2 = collapse_abbrev(a)
    b2 = collapse_abbrev(b)
    if a2 == b2 or b2 in a2 or a2 in b2:
        return True

    wa = a.split()
    wb = b.split()
    la = wa[-1] if wa else ""
    lb = wb[-1] if wb else ""
    if len(la) >= 4 and len(lb) >= 4 and (lb in la or la in lb):
        return True

    if len(b) >= 4:
        for tok in a.split():
            if len(tok) >= 4 and (b in tok or tok in b):
                return True
    if len(a) >= 4:
        for tok in b.split():
            if len(tok) >= 4 and (a in tok or tok in a):
                return True
    return False


def _segment_between_indices(stops: list[str], i_from: int, i_to: int) -> list[str]:
    if i_from < 0 or i_to < 0 or i_from == i_to:
        return []
    lo, hi = min(i_from, i_to), max(i_from, i_to)
    mid = stops[lo + 1 : hi]
    if i_from > i_to:
        mid = list(reversed(mid))
    return mid


def _fraction_for_indices(n_stops: int, idx_end: int) -> float | None:
    if n_stops < 2 or idx_end < 0:
        return None
    return (idx_end + 1) / (n_stops + 1)


def _safe_int(val: Any) -> int:
    try:
        return int(round(float(val)))
    except (TypeError, ValueError):
        return -1


class RouteSegmentResult(BaseModel):
    """Результат разрешения сегмента для карты и отладки."""

    intermediate_stops: list[str] = Field(default_factory=list)
    endpoint_fraction: float | None = None
    origin_index: int | None = None
    destination_index: int | None = None
    method: str = "none"
    debug_steps: list[str] = Field(default_factory=list)


async def resolve_route_segment(
    *,
    stops: list[str],
    search_origin: str,
    search_destination: str,
    departure_station: str,
    arrival_station: str,
    train_number: str,
    train_id: str,
    deepseek: DeepSeekClient | None,
) -> RouteSegmentResult:
    steps: list[str] = []
    raw = [str(s).strip() for s in stops if str(s).strip()]
    n = len(raw)

    steps.append(f"train_id={train_id} number={train_number} raw_stop_count={n}")
    if n <= 1:
        steps.append("abort: fewer than 2 stops in list")
        logging.info("route_segment %s", " | ".join(steps))
        return RouteSegmentResult(method="empty", debug_steps=steps)

    o = search_origin.strip()
    d = search_destination.strip()
    steps.append(f"search_origin={o!r} search_destination={d!r}")
    steps.append(f"departure_station={departure_station!r} arrival_station={arrival_station!r}")
    preview = raw[:12]
    steps.append(f"stops_preview={preview}{'...' if n > 12 else ''}")

    i_from = next((i for i, name in enumerate(raw) if station_matches(name, o)), -1)
    i_to = next((i for i, name in enumerate(raw) if station_matches(name, d)), -1)
    steps.append(f"heuristic_user i_from={i_from} i_to={i_to}")

    if i_from < 0:
        i_from = next((i for i, name in enumerate(raw) if station_matches(name, departure_station)), -1)
        steps.append(f"heuristic_dep_station i_from={i_from}")
    if i_to < 0:
        i_to = next((i for i, name in enumerate(raw) if station_matches(name, arrival_station)), -1)
        steps.append(f"heuristic_arr_station i_to={i_to}")

    if i_from >= 0 and i_to >= 0 and i_from != i_to:
        intermediate = _segment_between_indices(raw, i_from, i_to)
        idx_end = i_to if i_from < i_to else i_from
        frac = _fraction_for_indices(n, idx_end)
        steps.append(f"heuristic_ok intermediate_count={len(intermediate)} fraction={frac}")
        logging.info("route_segment %s", " | ".join(steps))
        return RouteSegmentResult(
            intermediate_stops=intermediate[:40],
            endpoint_fraction=frac,
            origin_index=i_from,
            destination_index=i_to,
            method="heuristic",
            debug_steps=steps,
        )

    steps.append("heuristic_miss: trying DeepSeek index match")

    if deepseek is None or not deepseek.enabled:
        steps.append("deepseek_skip: client disabled or no API key")
        logging.warning("route_segment %s", " | ".join(steps))
        return RouteSegmentResult(method="failed_no_llm", debug_steps=steps)

    try:
        llm_out = await _llm_resolve_indices(raw, o, d, deepseek)
        li = llm_out.get("origin_index")
        ri = llm_out.get("destination_index")
        steps.append(f"llm_raw origin_index={li} destination_index={ri}")

        i_from = _safe_int(li)
        i_to = _safe_int(ri)
        if (
            i_from >= 0
            and i_to >= 0
            and i_from < n
            and i_to < n
            and i_from != i_to
        ):
            intermediate = _segment_between_indices(raw, i_from, i_to)
            idx_end = i_to if i_from < i_to else i_from
            frac = _fraction_for_indices(n, idx_end)
            steps.append(f"llm_ok intermediate_count={len(intermediate)} fraction={frac}")
            logging.info("route_segment %s", " | ".join(steps))
            return RouteSegmentResult(
                intermediate_stops=intermediate[:40],
                endpoint_fraction=frac,
                origin_index=i_from,
                destination_index=i_to,
                method="llm",
                debug_steps=steps,
            )
        steps.append("llm_invalid_indices")
    except Exception:
        logging.exception("route_segment LLM failed train_id=%s", train_id)
        steps.append("llm_exception")

    logging.warning("route_segment %s", " | ".join(steps))
    return RouteSegmentResult(method="failed", debug_steps=steps)


async def _llm_resolve_indices(
    stops: list[str],
    user_origin: str,
    user_dest: str,
    deepseek: DeepSeekClient,
) -> dict[str, Any]:
    """Запрашивает у модели индексы станций в упорядоченном списке."""

    numbered = [f"{i}: {name}" for i, name in enumerate(stops[:60])]
    system = (
        "Ты помощник для железнодорожного терминала. "
        "Дан упорядоченный список остановок поезда по ходу следования (формат «индекс: название»). "
        "Пассажир едет от станции A до станции B на этом поезде. "
        "Подбери индексы строк list, которые лучше всего соответствуют станции отправления A и станции прибытия B "
        "(названия могут отличаться сокращениями: «Н.НОВГОРОД» vs «Нижний Новгород», «Москва» vs «Москва Ярославская»). "
        "Верни строго JSON без markdown: "
        '{"origin_index": <int>, "destination_index": <int>, "note": "<кратко по-русски>"}. '
        "Если невозможно — оба индекса -1."
    )
    user = "\n".join(
        [
            f"Станция отправления пассажира (A): {user_origin}",
            f"Станция назначения пассажира (B): {user_dest}",
            "Остановки поезда:",
            *numbered,
        ]
    )
    data = await deepseek.chat_json(system, user)
    return data if isinstance(data, dict) else {}
