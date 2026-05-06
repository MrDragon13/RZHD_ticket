"""Отдельный сервис Vosk + Piper + ffmpeg; backend проксирует сюда при SPEECH_SERVICE_URL."""

from __future__ import annotations

import logging
import os

_level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
_level = getattr(logging, _level_name, logging.INFO)
logging.basicConfig(level=_level, format="%(levelname)s %(name)s %(message)s", force=True)

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.audio_convert import webm_or_any_to_wav_16k_mono
from app.services.piper_tts import synthesize_wav
from app.services.vosk_stt import transcribe_wav_pcm_bytes

app = FastAPI(title="Путь speech sidecar", version="1.0.0")


class SpeechToTextResponse(BaseModel):
    text: str


class TextToSpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    language: str = "ru"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/stt", response_model=SpeechToTextResponse)
async def stt(audio: UploadFile = File(...)) -> SpeechToTextResponse:
    raw = await audio.read()
    if len(raw) < 64:
        raise HTTPException(status_code=400, detail="audio_too_short")
    try:
        wav = webm_or_any_to_wav_16k_mono(raw)
        text = transcribe_wav_pcm_bytes(wav)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return SpeechToTextResponse(text=text)


@app.post("/tts")
async def tts(req: TextToSpeechRequest) -> Response:
    lang = "en" if req.language == "en" else "ru"
    try:
        wav = synthesize_wav(req.text, lang)
    except ValueError:
        raise HTTPException(status_code=400, detail="tts_invalid") from None
    except RuntimeError:
        raise HTTPException(status_code=500, detail="tts_failed") from None
    return Response(content=wav, media_type="audio/wav")
