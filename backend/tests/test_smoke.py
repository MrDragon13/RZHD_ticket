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


def _sample_train_option(train_id: str, number: str, dep: str, arr: str, dur_min: int) -> dict:
    return {
        "id": train_id,
        "train_number": number,
        "origin": "Москва",
        "destination": "Казань",
        "departure_station": "Москва",
        "arrival_station": "Казань",
        "departure_time": dep,
        "arrival_time": arr,
        "duration_minutes": dur_min,
        "duration_label": f"{dur_min // 60} ч",
        "route_distance_km": 820,
        "stops": ["Владимир"],
        "available_seats": {"platzkart": 40, "coupe": 8, "sv": 2},
        "seat_details": {"lower": 10, "upper": 10, "side_lower": 4, "side_upper": 4},
        "prices": {"platzkart": 2500, "coupe": 4100, "sv": 9800},
        "amenities": ["bio"],
        "features": [],
        "carriage_notes": [],
    }


def test_compare_trains_returns_text():
    """Сравнение двух поездов: структурированный текст и источник (LLM или fallback)."""

    response = client.post(
        "/api/compare-trains",
        json={
            "language": "ru",
            "train_a": _sample_train_option("demo-a", "001А", "22:35", "08:40", 600),
            "train_b": _sample_train_option("demo-b", "002М", "23:10", "09:05", 595),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "comparison_text" in body
    assert isinstance(body["comparison_text"], str)
    assert len(body["comparison_text"]) >= 20
    assert body.get("source") in ("llm", "fallback")


def test_compare_trains_rejects_identical_ids():
    payload = {
        "language": "ru",
        "train_a": _sample_train_option("same", "001А", "22:35", "08:40", 600),
        "train_b": _sample_train_option("same", "002М", "23:10", "09:05", 595),
    }
    response = client.post("/api/compare-trains", json=payload)
    assert response.status_code == 400
