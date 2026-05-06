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
    assert "sessionIdleTrackingActive" in src
    assert "transitionLanguageToAuth" in src


def test_index_html_loads_api_client_before_app_js():
    root = Path(__file__).resolve().parents[2]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    api_idx = html.find("api-client.js")
    app_idx = html.find("app.js")
    assert api_idx != -1 and app_idx != -1
    assert api_idx < app_idx


def test_api_client_has_fetch_wrappers():
    root = Path(__file__).resolve().parents[2]
    api = (root / "frontend" / "api-client.js").read_text(encoding="utf-8")
    assert "async function fetchApi" in api
    assert "async function postJson" in api
    assert "async function getJson" in api
    assert "X-Request-Id" in api


def test_app_js_no_optional_chain_assignment():
    """Выражение obj?.prop = val недопустимо как LHS — SyntaxError в браузере."""
    src = _app_js()
    assert "?.textContent =" not in src


def test_app_js_delegates_http_to_api_client():
    src = _app_js()
    assert "async function fetchApi" not in src
    assert "api-client.js" in Path(__file__).resolve().parents[2].joinpath("frontend/index.html").read_text(encoding="utf-8")


def test_index_html_has_auth_and_idle_warning():
    root = Path(__file__).resolve().parents[2]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    assert 'id="auth-screen"' in html
    assert 'id="session-idle-warning"' in html


def test_index_html_has_logout_button():
    root = Path(__file__).resolve().parents[2]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    assert 'id="session-logout-button"' in html


def test_app_js_idle_deadline_and_pause():
    src = _app_js()
    assert "idleLogoutDeadline" in src
    assert "beginIdlePause" in src
    assert "scheduleIdleFromDeadline" in src


def test_api_client_wraps_fetch_with_idle_hooks():
    root = Path(__file__).resolve().parents[2]
    api = (root / "frontend" / "api-client.js").read_text(encoding="utf-8")
    assert "pathTerminalIdleFetchBegin" in api
    assert "pathTerminalIdleFetchEnd" in api
