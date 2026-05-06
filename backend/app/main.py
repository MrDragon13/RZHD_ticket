from __future__ import annotations

import logging
import os

_level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
_level = getattr(logging, _level_name, logging.INFO)
logging.basicConfig(level=_level, format="%(levelname)s %(name)s %(message)s", force=True)

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.models import (
    DemoCheckoutRequest,
    DemoTicket,
    DialogRequest,
    DialogResponse,
    FunFactRequest,
    FunFactResponse,
    HealthResponse,
    RecommendRequest,
    RecommendResponse,
    TicketSearchRequest,
    TicketSearchResponse,
    TrainRouteStopsRequest,
    TrainRouteStopsResponse,
    TripIntent,
    UnderstandRequest,
)
from app.services.checkout import create_demo_ticket
from app.services.deepseek_client import DeepSeekClient
from app.services.recommendations import recommend_trains
from app.services.rzd_adapter import RzdDataAdapter


# FastAPI-приложение является центральной точкой backend. Оно держит ключ DeepSeek
# на сервере, предоставляет frontend простые endpoint'ы и не раскрывает секреты в
# браузерный код терминала.
app = FastAPI(
    title="Путь API",
    description="Backend олимпиадного прототипа умного билетного терминала РЖД.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_engineering_log(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Логируем тело запроса при 422, чтобы отлавливать несовпадение схемы с ответом LLM."""

    body = getattr(exc, "body", None)
    preview = None
    if isinstance(body, (bytes, bytearray)):
        preview = bytes(body)[:8000].decode("utf-8", errors="replace")
    elif body is not None:
        preview = str(body)[:8000]
    logging.warning(
        "request validation failed %s %s errors=%s body_preview=%s",
        request.method,
        request.url.path,
        exc.errors(),
        preview,
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


deepseek_client = DeepSeekClient()
rzd_adapter = RzdDataAdapter(deepseek_client=deepseek_client)


# Для логически последовательного диалога поиск запускается только после того,
# как собраны все обязательные параметры. Иначе ассистент задает уточняющий
# вопрос и ждет следующую реплику пользователя.
REQUIRED_DIALOG_FIELDS = ("origin", "destination", "date")


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Healthcheck для VDS, reverse proxy и быстрой ручной проверки."""

    return HealthResponse()


@app.post("/api/understand", response_model=TripIntent)
async def understand(request: UnderstandRequest) -> TripIntent:
    """Разбирает естественную речь пользователя в структурированные параметры."""

    payload = await deepseek_client.understand_trip(
        request.language,
        request.text,
        request.origin_hint,
    )
    return TripIntent(**payload)


@app.post("/api/dialog", response_model=DialogResponse)
async def dialog(request: DialogRequest) -> DialogResponse:
    """Поддерживает сквозной диалог и обновляет состояние пользовательского пути.

    В MVP диалоговое состояние хранится на frontend и передается в каждом запросе.
    Это проще для демонстрационного терминала и не требует авторизации или сессий.
    """

    current_state = dict(request.state)
    payload = await deepseek_client.understand_trip(
        request.language,
        request.text,
        current_state.get("origin"),
    )
    current_state.update({key: value for key, value in payload.items() if value is not None})
    missing_fields = [field for field in REQUIRED_DIALOG_FIELDS if not current_state.get(field)]
    if missing_fields:
        current_state["pending_fields"] = missing_fields
        action = "ask_clarification"
        assistant_text = _clarification_text(request.language, missing_fields)
    else:
        current_state.pop("pending_fields", None)
        action = "search_tickets"
        assistant_text = _ready_to_search_text(request.language, current_state)
    return DialogResponse(
        assistant_text=assistant_text,
        action=action,
        state=current_state,
    )


def _clarification_text(language: str, missing_fields: list[str]) -> str:
    """Формирует короткий уточняющий вопрос вместо преждевременного поиска."""

    missing = set(missing_fields)
    if language == "en":
        if missing == {"origin"}:
            return "Where are we departing from?"
        if missing == {"destination"}:
            return "Where would you like to go?"
        if missing == {"date"}:
            return "What date should I search for?"
        if missing == {"origin", "date"}:
            return "Please clarify the departure city and travel date."
        if missing == {"destination", "date"}:
            return "Please clarify the destination city and travel date."
        if missing == {"origin", "destination"}:
            return "Please clarify the departure and destination cities."
        return "Please clarify the departure city, destination, and travel date."

    if missing == {"origin"}:
        return "Откуда поедем?"
    if missing == {"destination"}:
        return "Куда вы хотите поехать?"
    if missing == {"date"}:
        return "На какую дату ищем поезд?"
    if missing == {"origin", "date"}:
        return "Уточните, пожалуйста, город отправления и дату поездки."
    if missing == {"destination", "date"}:
        return "Уточните, пожалуйста, город назначения и дату поездки."
    if missing == {"origin", "destination"}:
        return "Уточните, пожалуйста, город отправления и город назначения."
    return "Уточните, пожалуйста, город отправления, город назначения и дату поездки."


def _ready_to_search_text(language: str, state: dict) -> str:
    """Финальная реплика перед поиском, когда все обязательные поля уже собраны."""

    origin = state.get("origin")
    destination = state.get("destination")
    date = state.get("date")
    if language == "en":
        return f"Thank you. I have the route: {origin} to {destination}, {date}. Searching suitable trains."
    return f"Спасибо. Маршрут собран: {origin} -> {destination}, {date}. Подбираю подходящие поезда."


@app.post("/api/tickets/search", response_model=TicketSearchResponse)
async def search_tickets(request: TicketSearchRequest) -> TicketSearchResponse:
    """Возвращает варианты поездов из RZD Data Adapter.

    Сейчас адаптер работает в demo-режиме, но контракт endpoint'а уже подходит
    для будущего live-парсера или официальной интеграции с данными РЖД.
    """

    return await rzd_adapter.search(request)


@app.post("/api/train-route-stops", response_model=TrainRouteStopsResponse)
async def train_route_stops(request: TrainRouteStopsRequest) -> TrainRouteStopsResponse:
    """Догружает полный список станций (basicRoute) для выбранного поезда — карта и сегмент маршрута."""

    return await rzd_adapter.fetch_train_route_stops(request)


@app.post("/api/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest) -> RecommendResponse:
    """Ранжирует поезда и формирует реплику голосового ассистента."""

    return await recommend_trains(request, deepseek_client)


@app.post("/api/fun-fact", response_model=FunFactResponse)
async def fun_fact(request: FunFactRequest) -> FunFactResponse:
    """Возвращает короткий факт о маршруте или городе назначения."""

    fact, source = await deepseek_client.generate_fun_fact(
        request.language,
        request.origin,
        request.destination,
    )
    return FunFactResponse(fact=fact, source=source)


@app.post("/api/checkout/demo", response_model=DemoTicket)
async def demo_checkout(request: DemoCheckoutRequest) -> DemoTicket:
    """Имитирует оформление билета без оплаты и персональных данных."""

    return create_demo_ticket(request)
