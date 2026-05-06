"""Синтез Piper (лёгкий офлайн-голос на CPU)."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess

from app.services.speech_config import piper_binary, piper_voice_ready, piper_voice_path

logger = logging.getLogger(__name__)


def _resolve_piper_exe() -> str:
    raw = piper_binary()
    if os.path.isfile(raw):
        return raw
    found = shutil.which(os.path.basename(raw) if "/" not in raw else raw)
    if found:
        return found
    raise RuntimeError("piper binary not found")


def synthesize_wav(text: str, language: str) -> bytes:
    """Возвращает WAV в байтах."""

    if not text or not str(text).strip():
        raise ValueError("empty_text")
    lang = "ru" if language != "en" else "en"
    model = piper_voice_path(lang)
    if not model or not piper_voice_ready(lang):
        raise RuntimeError(f"piper voice not configured for language={lang}")

    exe = _resolve_piper_exe()

    proc = subprocess.run(
        [exe, "--model", model, "--output_file", "-"],
        input=str(text).strip().encode("utf-8"),
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[:600]
        logger.warning("piper failed: %s", err)
        raise RuntimeError("piper_failed")
    out = proc.stdout
    if not out or len(out) < 44:
        raise RuntimeError("piper_empty_output")
    return out
