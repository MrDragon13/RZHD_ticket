"""Быстрые smoke-тесты API без внешней сети."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json().get("status") == "ok"
    assert response.headers.get("X-Request-Id")


def test_request_id_echo():
    rid = "test-req-id-12345"
    response = client.get("/api/health", headers={"X-Request-Id": rid})
    assert response.headers.get("X-Request-Id") == rid


def test_checkout_voice_intent_returns_boolean():
    """Форма ответа классификации подтверждения оформления (DeepSeek может быть выключен)."""

    response = client.post(
        "/api/checkout-voice-intent",
        json={"language": "ru", "text": "не хочу", "ui_stage": "checkout"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "confirm_demo_checkout" in body
    assert isinstance(body["confirm_demo_checkout"], bool)
