"""Построение сегмента маршрута пользователя по списку остановок поезда РЖД.

Логируем каждый шаг (INFO), чтобы по логам сервера можно было найти, где ломается цепочка.
Если индексы станций отправления/назначения не находятся эвристикой — запрашиваем DeepSeek.
"""

from __future__ import annotations

import logging
import os
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
    route_terminal_from: str | None = None,
    route_terminal_to: str | None = None,
    train_number: str,
    train_id: str,
    deepseek: DeepSeekClient | None,
) -> RouteSegmentResult:
    steps: list[str] = []
    raw = [str(s).strip() for s in stops if str(s).strip()]
    n = len(raw)

    r0 = str(route_terminal_from or "").strip()
    r1 = str(route_terminal_to or "").strip()
    steps.append(f"train_id={train_id} number={train_number} raw_stop_count={n}")
    steps.append(f"route_terminals={r0!r}->{r1!r}")
    # После basicRoute эвристики обычно достаточно; LLM для сегмента — дорого при N поездах.
    allow_llm_route = os.getenv("ROUTE_SEGMENT_USE_LLM", "").strip().lower() in ("1", "true", "yes")

    def _try_segment_from_stops(
        stop_list: list[str],
        *,
        tag: str,
    ) -> RouteSegmentResult | None:
        """Возвращает результат при успешном совпадении индексов, иначе None."""

        lst = [str(s).strip() for s in stop_list if str(s).strip()]
        m = len(lst)
        if m < 2:
            return None
        o_ = search_origin.strip()
        d_ = search_destination.strip()
        i0 = next((i for i, name in enumerate(lst) if station_matches(name, o_)), -1)
        i1 = next((i for i, name in enumerate(lst) if station_matches(name, d_)), -1)
        # departure_station/arrival_station в TrainOption часто совпадают с терминусами поезда
        # (route0/route1), а не с пунктами пассажира — подставлять их только если они согласованы
        # с городами из запроса, иначе получится сегмент «от начала до конца всего маршрута».
        if i0 < 0 and departure_station.strip() and station_matches(departure_station, o_):
            i0 = next(
                (i for i, name in enumerate(lst) if station_matches(name, departure_station)),
                -1,
            )
        if i1 < 0 and arrival_station.strip() and station_matches(arrival_station, d_):
            i1 = next(
                (i for i, name in enumerate(lst) if station_matches(name, arrival_station)),
                -1,
            )
        steps.append(f"{tag} i_from={i0} i_to={i1}")
        if i0 >= 0 and i1 >= 0 and i0 != i1:
            inter = _segment_between_indices(lst, i0, i1)
            idx_end = i1 if i0 < i1 else i0
            frac = _fraction_for_indices(m, idx_end)
            steps.append(
                f"{tag}_ok intermediate_count={len(inter)} fraction={frac} m_stops={m}"
            )
            logging.info("route_segment %s", " | ".join(steps))
            return RouteSegmentResult(
                intermediate_stops=inter[:40],
                endpoint_fraction=frac,
                origin_index=i0,
                destination_index=i1,
                method=tag,
                debug_steps=steps,
            )
        return None

    if n <= 1:
        steps.append("few_or_no_stops_in_payload")

        if allow_llm_route and deepseek is not None and deepseek.enabled:
            try:
                synth = await _llm_synthesize_route_stops(
                    train_number=train_number,
                    user_origin=search_origin.strip(),
                    user_dest=search_destination.strip(),
                    dep_board=departure_station.strip(),
                    arr_board=arrival_station.strip(),
                    route_from=r0,
                    route_to=r1,
                    deepseek=deepseek,
                )
                steps.append(f"llm_synth_stop_count={len(synth)}")
                raw = synth
                n = len(raw)
            except Exception:
                logging.exception("route_segment llm synthesize failed train_id=%s", train_id)
                steps.append("llm_synth_exception")

    if n <= 1:
        steps.append("abort: fewer than 2 stops after synth")
        logging.info("route_segment %s", " | ".join(steps))
        return RouteSegmentResult(method="empty", debug_steps=steps)

    o = search_origin.strip()
    d = search_destination.strip()
    steps.append(f"search_origin={o!r} search_destination={d!r}")
    steps.append(f"departure_station={departure_station!r} arrival_station={arrival_station!r}")
    preview = raw[:12]
    steps.append(f"stops_preview={preview}{'...' if n > 12 else ''}")

    heuristic_hit = _try_segment_from_stops(raw, tag="heuristic")
    if heuristic_hit is not None:
        return heuristic_hit

    if not allow_llm_route:
        steps.append("skip_llm: ROUTE_SEGMENT_USE_LLM=0 after heuristic_miss")
        logging.warning("route_segment %s", " | ".join(steps))
        return RouteSegmentResult(method="failed_no_llm", debug_steps=steps)

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

    if allow_llm_route and deepseek is not None and deepseek.enabled:
        steps.append("final_attempt: llm_synthesize_stops_after_failed_match")
        try:
            synth2 = await _llm_synthesize_route_stops(
                train_number=train_number,
                user_origin=o,
                user_dest=d,
                dep_board=departure_station.strip(),
                arr_board=arrival_station.strip(),
                route_from=r0,
                route_to=r1,
                deepseek=deepseek,
            )
            steps.append(f"llm_synth2_stop_count={len(synth2)}")
            synth_hit = _try_segment_from_stops(synth2, tag="llm_synth_retry")
            if synth_hit is not None:
                return synth_hit
            steps.append("llm_synth2_no_index_match")
        except Exception:
            logging.exception("route_segment llm synth2 failed train_id=%s", train_id)
            steps.append("llm_synth2_exception")

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


def _stops_list_from_llm_payload(data: dict[str, Any]) -> list[str]:
    """Достаёт упорядоченный список названий станций из JSON ответа LLM."""

    for key in ("stops", "route_stops", "stations", "route"):
        val = data.get(key)
        if not isinstance(val, list):
            continue
        out: list[str] = []
        for item in val:
            if isinstance(item, str):
                t = item.strip()
                if t:
                    out.append(t[:120])
            elif isinstance(item, dict):
                name = item.get("name") or item.get("station") or item.get("title")
                if name is not None:
                    t = str(name).strip()
                    if t:
                        out.append(t[:120])
        if len(out) >= 2:
            # Убираем только подряд идущие дубликаты, порядок сохраняем.
            deduped: list[str] = []
            prev_cf: str | None = None
            for s in out:
                cf = _norm(s)
                if cf == prev_cf:
                    continue
                prev_cf = cf
                deduped.append(s)
            if len(deduped) >= 2:
                return deduped[:80]
    return []


async def _llm_synthesize_route_stops(
    *,
    train_number: str,
    user_origin: str,
    user_dest: str,
    dep_board: str,
    arr_board: str,
    route_from: str,
    route_to: str,
    deepseek: DeepSeekClient,
) -> list[str]:
    """Строит правдоподобный список остановок, если в ответе РЖД нет полного маршрута."""

    system = (
        "Ты помощник железнодорожного терминала РЖД. "
        "Нужен упорядоченный список остановок поезда по ходу следования для отображения на карте. "
        "Верни строго JSON без markdown и без комментариев: "
        '{"stops": ["Название станции 1", "Название станции 2", ...]}. '
        "Ключ только stops — массив строк, от начального пункта маршрута поезда до конечного, по порядку. "
        "Включи станции посадки и высадки пассажира, если они на этом пути. "
        "Промежуточные — типичные крупные узлы на железной дороге между городами (Россия). "
        "Не повторяй подряд одинаковые названия. От 4 до 24 элементов. "
        "Названия — как в расписании (можно с уточнением вокзала: «Москва Казанская»). "
        "Не выдумывай вымышленные города; используй реальные узлы на типичном пути следования."
    )
    user = "\n".join(
        [
            f"Номер поезда (если известен): {train_number}",
            f"Маршрут поезда (терминусы, если известны): {route_from or 'неизвестно'} → {route_to or 'неизвестно'}",
            f"Пассажир запрашивает: {user_origin} → {user_dest}",
            f"Станции из билета/поиска РЖД (посадка / высадка): {dep_board} → {arr_board}",
            "Составь список остановок по порядку следования.",
        ]
    )
    data = await deepseek.chat_json(system, user)
    stops = _stops_list_from_llm_payload(data)
    if len(stops) < 2:
        logging.warning(
            "route_segment llm synthesize returned too few stops keys=%s",
            list(data.keys()) if isinstance(data, dict) else type(data),
        )
    return stops
