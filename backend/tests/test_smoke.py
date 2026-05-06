"""Быстрые smoke-тесты API без внешней сети."""

from app.main import app
from fastapi.testclient import TestClient

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


def test_support_chat_returns_reply():
    """Имитация техподдержки: всегда JSON с reply и source (DeepSeek может быть выключен)."""

    response = client.post(
        "/api/support-chat",
        json={
            "language": "ru",
            "message": "Не вижу поезда в списке",
            "conversation": [],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "reply" in body
    assert isinstance(body["reply"], str)
    assert len(body["reply"]) >= 1
    assert body.get("source") in ("llm", "fallback")
