from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# В этом файле собраны Pydantic-модели, которыми обмениваются API-эндпоинты.
# Явные модели защищают приложение от произвольного текста LLM: frontend всегда
# получает структурированные данные, а backend может валидировать ответы.
Language = Literal["ru", "en"]


class TimeWindow(BaseModel):
    """Временное окно, например желаемое прибытие с 07:00 до 09:00."""

    start: str = Field(..., examples=["07:00"])
    end: str = Field(..., examples=["09:00"])


class UnderstandRequest(BaseModel):
    """Запрос на смысловой разбор фразы пользователя."""

    language: Language
    text: str
    origin_hint: str | None = None


class TripIntent(BaseModel):
    """Структурированное намерение пассажира после обработки естественной речи."""

    intent: str = "search_ticket"
    language: Language = "ru"
    origin: str | None = None
    destination: str | None = None
    date: str | None = None
    departure_time_window: TimeWindow | None = None
    arrival_time_window: TimeWindow | None = None
    preferences: list[str] = Field(default_factory=list)
    priority: str | None = None
    transfers: str | None = None
    assistant_text: str


class DialogRequest(BaseModel):
    """Сообщение пользователя в сквозном диалоге с ассистентом."""

    language: Language
    text: str
    state: dict = Field(default_factory=dict)


class DialogResponse(BaseModel):
    """Ответ ассистента и обновленное состояние интерфейса."""

    assistant_text: str
    action: str
    state: dict = Field(default_factory=dict)


class TicketSearchRequest(BaseModel):
    """Параметры поиска поездов после смыслового разбора."""

    language: Language
    origin: str | None = None
    destination: str
    date: str | None = None
    arrival_time_window: TimeWindow | None = None
    departure_time_window: TimeWindow | None = None
    preferences: list[str] = Field(default_factory=list)


class SeatInfo(BaseModel):
    """Количество свободных мест по типам вагонов."""

    platzkart: int = 0
    coupe: int = 0
    sv: int = 0


class PriceInfo(BaseModel):
    """Минимальные цены по типам вагонов в рублях."""

    platzkart: int | None = None
    coupe: int | None = None
    sv: int | None = None


class SeatDetails(BaseModel):
    """Детализация свободных мест: нижние, верхние и боковые полки."""

    lower: int = 0
    upper: int = 0
    side_lower: int = 0
    side_upper: int = 0


class TrainOption(BaseModel):
    """Единый формат поезда для интерфейса, рекомендаций и демо-чекаута."""

    id: str
    train_number: str
    origin: str
    destination: str
    departure_station: str
    arrival_station: str
    departure_time: str
    arrival_time: str
    duration_minutes: int
    duration_label: str
    route_distance_km: int
    stops: list[str]
    available_seats: SeatInfo
    seat_details: SeatDetails = Field(default_factory=SeatDetails)
    prices: PriceInfo
    features: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    carriage_notes: list[str] = Field(default_factory=list)


class TicketSearchResponse(BaseModel):
    """Результат RZD Data Adapter: в MVP данные берутся из демо-базы."""

    source: Literal["demo", "live-cache"] = "demo"
    updated_at: str
    trains: list[TrainOption]


class RecommendRequest(BaseModel):
    """Запрос на гибридную рекомендацию: локальный скоринг + LLM-текст."""

    language: Language
    intent: TripIntent
    trains: list[TrainOption]


class Recommendation(BaseModel):
    """Оценка одного поезда и объяснение выбора."""

    train_id: str
    score: float
    badges: list[str]
    explanation: str


class RecommendResponse(BaseModel):
    """Список рекомендаций и голосовая фраза ассистента."""

    recommendations: list[Recommendation]
    assistant_text: str


class FunFactRequest(BaseModel):
    """Запрос короткого факта о маршруте или городе назначения."""

    language: Language
    origin: str | None = None
    destination: str


class FunFactResponse(BaseModel):
    """Факт для вау-экрана карты."""

    fact: str
    source: Literal["llm", "fallback"]


class DemoCheckoutRequest(BaseModel):
    """Запрос демонстрационного оформления выбранного поезда."""

    language: Language
    train: TrainOption
    passenger_label: str | None = None


class DemoTicket(BaseModel):
    """Демо-билет: не является настоящим проездным документом."""

    status: Literal["success"] = "success"
    ticket_type: Literal["demo"] = "demo"
    ticket_id: str
    qr_payload: str
    route: str
    train_number: str
    departure: str
    arrival: str
    car: str
    seat: str
    berth_type: str
    travel_class: str
    disclaimer: str


class HealthResponse(BaseModel):
    """Минимальный healthcheck для мониторинга VDS."""

    status: Literal["ok"] = "ok"
