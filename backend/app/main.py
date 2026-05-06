from __future__ import annotations

import logging
import os
from calendar import month_name
from datetime import date, datetime

_level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
_level = getattr(logging, _level_name, logging.INFO)
logging.basicConfig(level=_level, format="%(levelname)s %(name)s %(message)s", force=True)

import httpx

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

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
    SpeechSettingsResponse,
    SpeechToTextResponse,
    TextToSpeechRequest,
    TicketSearchRequest,
    TicketSearchResponse,
    TrainRouteStopsRequest,
    TrainRouteStopsResponse,
    TrainCarriageDetailsRequest,
    TrainCarriageDetailsResponse,
    TripIntent,
    UnderstandRequest,
)
from app.services.audio_convert import webm_or_any_to_wav_16k_mono
from app.services.checkout import create_demo_ticket
from app.services.deepseek_client import DeepSeekClient
from app.services.piper_tts import synthesize_wav
from app.services.recommendations import recommend_trains
from app.services.rzd_adapter import RzdDataAdapter
from app.services.speech_config import (
    effective_stt_engine,
    effective_tts_engine,
    piper_en_voice_available,
    speech_service_base_url,
    stt_engine_for_client,
    tts_engine_for_client,
)
from app.services.vosk_stt import transcribe_wav_pcm_bytes


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

SPEECH_HTTP_TIMEOUT = httpx.Timeout(120.0, connect=30.0)


async def _proxy_stt_to_sidecar(raw: bytes, upload: UploadFile) -> SpeechToTextResponse:
    base = speech_service_base_url()
    if not base:
        raise RuntimeError("speech sidecar URL missing")
    url = f"{base}/stt"
    filename = upload.filename or "speech.webm"
    ct = upload.content_type or "application/octet-stream"
    try:
        async with httpx.AsyncClient(timeout=SPEECH_HTTP_TIMEOUT) as client:
            response = await client.post(url, files={"audio": (filename, raw, ct)})
    except httpx.RequestError as exc:
        logging.warning("speech sidecar STT request failed: %s", exc)
        raise HTTPException(status_code=503, detail="speech_service_unavailable") from exc
    if response.status_code != 200:
        logging.warning(
            "speech sidecar STT %s: %s",
            response.status_code,
            response.text[:400],
        )
        raise HTTPException(status_code=503, detail="stt_upstream_failed")
    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="stt_bad_response") from exc
    return SpeechToTextResponse(text=str(payload.get("text", "")))


async def _proxy_tts_to_sidecar(req: TextToSpeechRequest) -> Response:
    base = speech_service_base_url()
    if not base:
        raise RuntimeError("speech sidecar URL missing")
    url = f"{base}/tts"
    try:
        async with httpx.AsyncClient(timeout=SPEECH_HTTP_TIMEOUT) as client:
            response = await client.post(
                url,
                json={"text": req.text, "language": req.language},
            )
    except httpx.RequestError as exc:
        logging.warning("speech sidecar TTS request failed: %s", exc)
        raise HTTPException(status_code=503, detail="speech_service_unavailable") from exc
    if response.status_code != 200:
        logging.warning(
            "speech sidecar TTS %s: %s",
            response.status_code,
            response.text[:400],
        )
        raise HTTPException(status_code=503, detail="tts_upstream_failed")
    return Response(content=response.content, media_type="audio/wav")


# Для логически последовательного диалога поиск запускается только после того,
# как собраны все обязательные параметры. Иначе ассистент задает уточняющий
# вопрос и ждет следующую реплику пользователя.
REQUIRED_DIALOG_FIELDS = ("origin", "destination", "date")

_RU_MONTHS_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)


def _parse_travel_date_string(raw: str | None) -> date | None:
    """Разбирает дату из полей диалога / TripIntent (ISO или d.m.Y)."""

    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    for fmt in ("%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _format_date_for_assistant_speech(raw: str | None, language: str) -> str:
    """Человекочитаемая дата для голосовой реплики (не ISO)."""

    d = _parse_travel_date_string(raw)
    if d is None:
        return (raw or "").strip()
    today = date.today()
    if language == "en":
        label = f"{month_name[d.month]} {d.day}"
        if d.year != today.year:
            label = f"{label}, {d.year}"
        return label
    label = f"{d.day} {_RU_MONTHS_GENITIVE[d.month - 1]}"
    if d.year != today.year:
        label = f"{label} {d.year}"
    return label


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Healthcheck для VDS, reverse proxy и быстрой ручной проверки."""

    return HealthResponse()


@app.get("/api/speech-settings", response_model=SpeechSettingsResponse)
async def speech_settings() -> SpeechSettingsResponse:
    """Режимы STT/TTS для клиента (отдельно распознавание и синтез)."""

    return SpeechSettingsResponse(
        stt_engine=stt_engine_for_client(),
        tts_engine=tts_engine_for_client(),
    )


@app.post("/api/stt", response_model=SpeechToTextResponse)
async def speech_to_text(audio: UploadFile = File(...)) -> SpeechToTextResponse:
    """Распознавание с микрофона (аудио webm/wav/…) через Vosk на сервере или speech-sidecar."""

    if effective_stt_engine() != "vosk":
        raise HTTPException(status_code=503, detail="stt_mode_not_vosk")
    raw = await audio.read()
    if len(raw) < 64:
        raise HTTPException(status_code=400, detail="audio_too_short")
    if speech_service_base_url():
        return await _proxy_stt_to_sidecar(raw, audio)
    try:
        wav = webm_or_any_to_wav_16k_mono(raw)
        text = transcribe_wav_pcm_bytes(wav)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return SpeechToTextResponse(text=text)


@app.post("/api/tts")
async def text_to_speech(req: TextToSpeechRequest) -> Response:
    """Озвучка Piper (WAV); при режиме legacy клиент не должен вызывать."""

    if effective_tts_engine() != "piper":
        raise HTTPException(status_code=503, detail="tts_mode_not_piper")
    lang = req.language
    if lang == "en" and not piper_en_voice_available():
        raise HTTPException(status_code=503, detail="piper_en_voice_missing")
    if speech_service_base_url():
        return await _proxy_tts_to_sidecar(req)
    try:
        wav = synthesize_wav(req.text, lang)
    except (RuntimeError, ValueError):
        raise HTTPException(status_code=500, detail="tts_failed") from None
    return Response(content=wav, media_type="audio/wav")


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
    date_spoken = _format_date_for_assistant_speech(state.get("date"), language)
    if language == "en":
        return f"Thank you. I have the route: {origin} to {destination}, {date_spoken}. Searching suitable trains."
    return f"Спасибо. Маршрут собран: {origin} в {destination}, {date_spoken}. Подбираю подходящие поезда."


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


@app.post("/api/train-carriage-details", response_model=TrainCarriageDetailsResponse)
async def train_carriage_details(request: TrainCarriageDetailsRequest) -> TrainCarriageDetailsResponse:
    """Догружает слой вагонов 5764 для выбора мест и уточнения полок."""

    return await rzd_adapter.fetch_train_carriage_details(request)


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
