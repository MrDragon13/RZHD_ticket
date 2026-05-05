from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# В этом файле собраны Pydantic-модели, которыми обмениваются API-эндпоинты.
# Явные модели защищают приложение от произвольного текста LLM: frontend всегда
# получает структурированные данные, а backend может валидировать ответы.
Language = Literal["ru", "en"]


class TimeWindow(BaseModel):
    """Временное окно, например желаемое прибытие с 07:00 до 09:00."""

    start: str = Field(..., examples=["07:00"])
    end: str = Field(..., examples=["09:00"])


_TIME_RANGE_RE = re.compile(
    r"^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$",
)


def _coerce_time_window(value: Any) -> Any:
    """LLM иногда возвращает окно одной строкой «07:00-09:00» вместо объекта."""

    if value is None or isinstance(value, TimeWindow):
        return value
    if isinstance(value, dict):
        return TimeWindow(**value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        match = _TIME_RANGE_RE.match(text)
        if match:
            return TimeWindow(start=match.group(1), end=match.group(2))
        # Иначе валидация упадёт на строке; для опциональных окон безопаснее отбросить.
        return None
    return value


class UnderstandRequest(BaseModel):
    """Запрос на смысловой разбор фразы пользователя."""

    language: Language
    text: str
    origin_hint: str | None = None


class TripIntent(BaseModel):
    """Структурированное намерение пассажира после обработки естественной речи."""

    model_config = ConfigDict(extra="ignore")

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
    rank_with_llm: bool = False

    @field_validator("departure_time_window", "arrival_time_window", mode="before")
    @classmethod
    def _normalize_time_windows(cls, value: Any) -> Any:
        return _coerce_time_window(value)


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

    @field_validator("departure_time_window", "arrival_time_window", mode="before")
    @classmethod
    def _normalize_search_windows(cls, value: Any) -> Any:
        return _coerce_time_window(value)


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


CompartmentKind = Literal["unknown", "female", "male", "mixed", "children", "family"]


class CarriageDetail(BaseModel):
    """Метаданные одного вагона из слоя РЖД (5764): номер, тип, пол купе, услуги."""

    number: str = Field(..., min_length=1, max_length=24)
    type_label: str = Field(default="", description="Купе / СВ / Плацкарт и т.д.")
    compartment_kind: CompartmentKind = "unknown"
    add_signs_raw: str | None = Field(default=None, description="Сырой код addSigns с сайта РЖД.")
    service_summary: str | None = Field(default=None, description="Краткий текст из clsName без HTML.")
    services_short: list[str] = Field(default_factory=list, description="Подписи услуг (биотуалет, кондиционер…).")
    berth_totals: SeatDetails | None = Field(
        default=None,
        description="Вместимость по категориям полок из seats[] вагона (РЖД).",
    )
    berth_available: SeatDetails | None = Field(
        default=None,
        description="Свободные места по категориям полок для этого вагона (РЖД).",
    )


class SeatBerthPrices(BaseModel):
    """Минимальные цены по категориям полок (если пришли из ответа РЖД по местам)."""

    lower: int | None = None
    upper: int | None = None
    side_lower: int | None = None
    side_upper: int | None = None


class TrainOption(BaseModel):
    """Единый формат поезда для интерфейса, рекомендаций и демо-чекаута."""

    model_config = ConfigDict(extra="ignore")

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
    platzkart_carriage_seats: int | None = Field(
        default=None,
        ge=1,
        le=72,
        description="Типичная вместимость одного плацкартного вагона (места 1–N), для демо-схемы.",
    )
    coupe_carriage_seats: int | None = Field(
        default=None,
        ge=1,
        le=40,
        description="Типичная вместимость одного купейного вагона (одноэтажный), для демо-схемы.",
    )
    sv_carriage_seats: int | None = Field(
        default=None,
        ge=1,
        le=24,
        description="Типичная вместимость вагона СВ (часто 16–18), для демо-схемы.",
    )
    coupe_double_deck: bool = Field(
        default=False,
        description="Если true, купейные вагоны поезда считаются двухэтажными (другая вместимость).",
    )
    coupe_double_deck_seats: int | None = Field(
        default=None,
        ge=1,
        le=72,
        description="Вместимость двухэтажного купе на вагон (часто 64), если coupe_double_deck.",
    )
    seat_prices: SeatBerthPrices | None = Field(
        default=None,
        description="Минимальные цены по типам полок из ответа РЖД (если есть).",
    )
    carriage_details: list[CarriageDetail] = Field(
        default_factory=list,
        description="Список вагонов из слоя 5764 (номер, тип, пол купе, услуги).",
    )


class TicketSearchResponse(BaseModel):
    """Результат RZD Data Adapter: в MVP данные берутся из демо-базы."""

    source: Literal["demo", "live-cache"] = "demo"
    updated_at: str
    trains: list[TrainOption]


class RecommendRequest(BaseModel):
    """Запрос на гибридную рекомендацию: локальный скоринг + LLM-текст."""

    model_config = ConfigDict(extra="ignore")

    language: Language
    intent: TripIntent
    trains: list[TrainOption]
    last_user_message: str | None = None


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


BerthKind = Literal["lower", "upper", "side_lower", "side_upper"]


class SelectedSeat(BaseModel):
    """Одно место в демо-заказе (номер вагона задаётся для каждого места отдельно)."""

    seat_number: str = Field(..., min_length=1, max_length=4)
    berth_kind: BerthKind
    carriage: str | None = Field(
        default=None,
        description="Номер вагона для этого места (например '05').",
    )


class DemoCheckoutRequest(BaseModel):
    """Запрос демонстрационного оформления выбранного поезда."""

    language: Language
    train: TrainOption
    passenger_label: str | None = None
    selected_carriage: str | None = Field(
        default=None,
        description="Устаревший общий номер вагона; если в каждом месте указан carriage, поле игнорируется.",
    )
    selected_seats: list[SelectedSeat] | None = None

    @field_validator("selected_seats")
    @classmethod
    def limit_party_size(cls, seats: list[SelectedSeat] | None) -> list[SelectedSeat] | None:
        if seats is not None and len(seats) > 8:
            raise ValueError("Не более 8 мест в одном демо-заказе.")
        return seats


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
