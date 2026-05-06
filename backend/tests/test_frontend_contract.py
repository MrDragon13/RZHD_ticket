"""Регрессионные проверки ключевых защитных паттернов во frontend/app.js (без браузера)."""

from pathlib import Path


def _app_js() -> str:
    root = Path(__file__).resolve().parents[2]
    return (root / "frontend" / "app.js").read_text(encoding="utf-8")


def test_app_js_has_dialog_abort_and_message_cap():
    src = _app_js()
    assert "takeDialogAbortSignal" in src
    assert "abortDialogRequests" in src
    assert "MAX_USER_MESSAGE_CHARS" in src
    assert "languageScreenBusy" in src
    assert "selectTrainSeq" in src
    assert "orbRecognition" in src
    assert "normalizeCarriageServiceChip" in src
    assert "ticketAllFeatures" in src


def test_index_html_user_input_maxlength():
    root = Path(__file__).resolve().parents[2]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    assert 'id="user-input"' in html
    assert "maxlength=" in html
