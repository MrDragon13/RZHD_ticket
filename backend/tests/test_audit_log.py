"""Контракт GET /api/audit-log и опциональная защита PATH_AUDIT_TOKEN."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_audit_log_open_without_env_token(monkeypatch):
    monkeypatch.delenv("PATH_AUDIT_TOKEN", raising=False)
    client.get("/api/health")
    response = client.get("/api/audit-log")
    assert response.status_code == 200
    body = response.json()
    assert "/api/health" in "\n".join(body["lines"])


def test_audit_log_requires_credentials_when_token_set(monkeypatch):
    monkeypatch.setenv("PATH_AUDIT_TOKEN", "audit-secret-test")
    response = client.get("/api/audit-log")
    assert response.status_code == 401


def test_audit_log_with_bearer_when_token_set(monkeypatch):
    monkeypatch.setenv("PATH_AUDIT_TOKEN", "audit-secret-test")
    client.get("/api/health")
    response = client.get("/api/audit-log", headers={"Authorization": "Bearer audit-secret-test"})
    assert response.status_code == 200
    body = response.json()
    assert body.get("server_started_at")
    assert isinstance(body.get("lines"), list)
    assert body.get("line_count", 0) >= 1
    assert body.get("buffer_capacity", 0) >= 100
    joined = "\n".join(body["lines"])
    assert "/api/health" in joined
