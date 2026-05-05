from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

deepseek_client = DeepSeekClient()
rzd_adapter = RzdDataAdapter()


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
    action = "search_tickets" if current_state.get("destination") else "ask_clarification"
    return DialogResponse(
        assistant_text=payload["assistant_text"],
        action=action,
        state=current_state,
    )


@app.post("/api/tickets/search", response_model=TicketSearchResponse)
async def search_tickets(request: TicketSearchRequest) -> TicketSearchResponse:
    """Возвращает варианты поездов из RZD Data Adapter.

    Сейчас адаптер работает в demo-режиме, но контракт endpoint'а уже подходит
    для будущего live-парсера или официальной интеграции с данными РЖД.
    """

    return rzd_adapter.search(request)


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
