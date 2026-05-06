"""Приведение произвольного аудио от браузера к WAV PCM16 mono для Vosk."""

from __future__ import annotations

import logging
import shutil
import subprocess

logger = logging.getLogger(__name__)


def webm_or_any_to_wav_16k_mono(data: bytes) -> bytes:
    """ffmpeg в stdin → WAV 16 kHz mono на stdout."""

    if not data or len(data) < 32:
        raise ValueError("empty_audio")

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg_not_found")

    proc = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "wav",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "pipe:1",
        ],
        input=data,
        capture_output=True,
        timeout=60,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[:800]
        logger.warning("ffmpeg failed: %s", err)
        raise ValueError("ffmpeg_convert_failed")
    out = proc.stdout
    if not out or len(out) < 44:
        raise ValueError("wav_too_short")
    return out
