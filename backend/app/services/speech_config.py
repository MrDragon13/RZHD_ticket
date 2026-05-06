"""Режимы озвучки и распознавания: отдельно TTS и STT (см. SPEECH_TTS_ENGINE / SPEECH_STT_ENGINE)."""

from __future__ import annotations

import logging
import os
from typing import Literal

logger = logging.getLogger(__name__)

SttMode = Literal["vosk", "legacy"]
TtsMode = Literal["piper", "legacy"]


def _env_stt_requested() -> SttMode:
    raw = os.getenv("SPEECH_STT_ENGINE", "legacy").strip().lower()
    if raw in ("vosk", "legacy"):
        return raw  # type: ignore[return-value]
    logger.warning("SPEECH_STT_ENGINE=%r invalid, using legacy", raw)
    return "legacy"


def _env_tts_requested() -> TtsMode:
    raw = os.getenv("SPEECH_TTS_ENGINE", "piper").strip().lower()
    if raw in ("piper", "legacy"):
        return raw  # type: ignore[return-value]
    logger.warning("SPEECH_TTS_ENGINE=%r invalid, using piper", raw)
    return "piper"


def vosk_model_dir() -> str | None:
    p = os.getenv("VOSK_MODEL_PATH", "").strip()
    return p if p else None


def piper_binary() -> str:
    return os.getenv("PIPER_BINARY", "piper").strip() or "piper"


def piper_voice_path(lang: str) -> str:
    """Путь к .onnx голоса Piper (RU обязателен для киоска; EN опционален)."""

    if lang == "en":
        return os.getenv(
            "PIPER_VOICE_EN",
            "/models/piper/en_US-lessac-low.onnx",
        ).strip()
    return os.getenv(
        "PIPER_VOICE_RU",
        "/models/piper/ru_RU-irina-medium.onnx",
    ).strip()


def piper_voice_ready(lang: str) -> bool:
    p = piper_voice_path(lang)
    return bool(p and os.path.isfile(p))


def vosk_ready() -> bool:
    d = vosk_model_dir()
    return bool(d and os.path.isdir(d) and os.listdir(d))


def effective_stt_engine() -> SttMode:
    req = _env_stt_requested()
    if req == "vosk" and not vosk_ready():
        logger.warning("Vosk requested but VOSK_MODEL_PATH missing or empty — falling back to legacy STT hint on client")
        return "legacy"
    return req


def effective_tts_engine() -> TtsMode:
    req = _env_tts_requested()
    if req == "piper" and not piper_voice_ready("ru"):
        logger.warning("Piper requested but RU voice .onnx missing — client should use legacy TTS")
        return "legacy"
    return req


def stt_engine_for_client() -> SttMode:
    """Что отдаём frontend: если сервер не может STT, клиент использует Web Speech API."""

    return effective_stt_engine()


def tts_engine_for_client() -> TtsMode:
    return effective_tts_engine()
