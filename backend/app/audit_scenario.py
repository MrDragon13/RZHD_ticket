"""Краткие текстовые строки для журнала сценария (секретное меню logloglog).

Без повторения полных тел POST: только осмысленные поля и маскирование телефона/документа.
"""

from __future__ import annotations

import re

from app.models import (
    CheckoutVoiceIntentRequest,
    CompareTrainsRequest,
    DemoCheckoutRequest,
    DialogRequest,
    FunFactRequest,
    RecommendRequest,
    RecommendResponse,
    SupportChatRequest,
    TicketSearchRequest,
    TicketSearchResponse,
    TrainCarriageDetailsRequest,
    TrainRouteStopsRequest,
    UnderstandRequest,
)


def clip(text: str | None, max_len: int = 72) -> str:
    if not text:
        return ""
    s = " ".join(str(text).split())
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def mask_phone(raw: str | None) -> str:
    if not raw:
        return "—"
    d = re.sub(r"\D", "", raw)
    if len(d) >= 9:
        tail = d[-4:]
        return f"+7***{tail}"
    return "***"


def mask_document(raw: str | None) -> str:
    if not raw:
        return "—"
    s = str(raw).strip()
    if len(s) <= 4:
        return "****"
    return f"…{s[-4:]}"


def clip_name(raw: str | None, max_len: int = 42) -> str:
    if not raw:
        return "—"
    s = str(raw).strip()
    return clip(s, max_len) or "—"


def format_dialog_event(req: DialogRequest, action: str, state: dict) -> str:
    bits = [f"диалог action={action}", f"lang={req.language}", f'text="{clip(req.text, 88)}"']
    for key in ("origin", "destination", "date"):
        v = state.get(key)
        if v:
            bits.append(f"{key}={clip(str(v), 36)}")
    pending = state.get("pending_fields")
    if pending:
        bits.append(f"pending={','.join(pending)}")
    return " ".join(bits)


def format_understand_event(req: UnderstandRequest) -> str:
    return f'разбор фразы lang={req.language} text="{clip(req.text, 96)}"'


def format_search_event(req: TicketSearchRequest, resp: TicketSearchResponse) -> str:
    prefs = ",".join(req.preferences[:6]) if req.preferences else ""
    p = f" prefs={prefs}" if prefs else ""
    return (
        f"поиск поездов {req.origin or '?'}→{req.destination} дата={req.date or '?'}{p} "
        f"источник={resp.source} вариантов={len(resp.trains)}"
    )


def format_route_stops_event(req: TrainRouteStopsRequest) -> str:
    return (
        f"догрузка остановок карты поезд №{req.train_number} id={clip(req.train_id, 40)} "
        f"{req.origin}→{req.destination}"
    )


def format_carriage_event(req: TrainCarriageDetailsRequest) -> str:
    t = req.train
    ncar = len(t.carriage_details) if t.carriage_details else 0
    return (
        f"схема вагонов поезд №{t.train_number} {t.origin}→{t.destination} "
        f"вагонов_в_ответе={ncar}"
    )


def format_recommend_event(req: RecommendRequest, resp: RecommendResponse) -> str:
    top = resp.recommendations[0].train_id if resp.recommendations else "?"
    it = req.intent
    return (
        f"рекомендации поездов вариантов={len(req.trains)} топ_id={top} "
        f"маршрут {it.origin or '?'}→{it.destination or '?'} дата={it.date or '?'}"
    )


def format_fun_fact_event(req: FunFactRequest) -> str:
    return f"AI-факт карты {req.origin or '?'}→{req.destination}"


def format_support_event(req: SupportChatRequest) -> str:
    return f'чат поддержки msg="{clip(req.message, 120)}"'


def format_compare_event(req: CompareTrainsRequest) -> str:
    a, b = req.train_a, req.train_b
    return (
        f"сравнение поездов №{a.train_number} ({a.departure_time}–{a.arrival_time}) vs "
        f"№{b.train_number} ({b.departure_time}–{b.arrival_time})"
    )


def format_voice_checkout_event(req: CheckoutVoiceIntentRequest, confirm: bool) -> str:
    return (
        f"голос оформление ui_stage={req.ui_stage} confirm={confirm} "
        f'text="{clip(req.text, 72)}"'
    )


def _format_seats(req: DemoCheckoutRequest) -> str:
    seats = req.selected_seats
    if not seats:
        car = req.selected_carriage or "?"
        return f"агрегат вагон {car}"
    parts = []
    for s in seats[:12]:
        car = s.carriage or "?"
        bk = (s.berth_kind or "?")[:1]
        parts.append(f"{car}:{s.seat_number}{bk}")
    return ";".join(parts)


def format_demo_checkout_event(req: DemoCheckoutRequest) -> str:
    t = req.train
    phone = mask_phone(req.passenger_phone)
    doc = mask_document(req.passenger_document)
    name = clip_name(req.passenger_full_name or req.passenger_label)
    seats = _format_seats(req)
    return (
        f"демо-билет поезд №{t.train_number} {t.origin}→{t.destination} "
        f"места [{seats}] пассажир={name} тел={phone} док={doc}"
    )
