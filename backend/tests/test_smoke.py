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
