"""Распознавание речи через Vosk (русская компактная модель на сервере)."""

from __future__ import annotations

import json
import logging
import wave
from io import BytesIO
from typing import Any

logger = logging.getLogger(__name__)

_model: Any = None


def _get_model():
    global _model
    if _model is not None:
        return _model
    from vosk import Model

    from app.services.speech_config import vosk_model_dir

    path = vosk_model_dir()
    if not path:
        raise RuntimeError("VOSK_MODEL_PATH not set")
    import os

    if not os.path.isdir(path):
        raise RuntimeError(f"Vosk model directory missing: {path}")
    logger.info("loading Vosk model from %s", path)
    _model = Model(path)
    return _model


def transcribe_wav_pcm_bytes(wav_bytes: bytes) -> str:
    """WAV 16-bit PCM (как после ffmpeg)."""

    from vosk import KaldiRecognizer

    wf = wave.open(BytesIO(wav_bytes), "rb")
    try:
        if wf.getnchannels() != 1:
            raise ValueError("expected_mono")
        if wf.getsampwidth() != 2:
            raise ValueError("expected_16bit")
        model = _get_model()
        rec = KaldiRecognizer(model, wf.getframerate())
        while True:
            chunk = wf.readframes(4000)
            if not chunk:
                break
            rec.AcceptWaveform(chunk)
        result = json.loads(rec.FinalResult())
        text = (result.get("text") or "").strip()
        return text
    finally:
        wf.close()
