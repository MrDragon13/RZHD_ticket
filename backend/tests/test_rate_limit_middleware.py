"""Изолированная проверка middleware ограничения POST к /api/*."""

from app.rate_limit_middleware import PostApiRateLimitMiddleware
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient


async def tiny_ok(request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


def _make_app(limit: int) -> Starlette:
    app = Starlette(routes=[Route("/api/ping", endpoint=tiny_ok, methods=["POST"])])
    app.add_middleware(PostApiRateLimitMiddleware, limit_per_minute=limit)
    return app


def test_post_rate_limit_returns_429_after_burst():
    client = TestClient(_make_app(4))
    for _ in range(4):
        r = client.post("/api/ping")
        assert r.status_code == 200
    r = client.post("/api/ping")
    assert r.status_code == 429
    assert r.json().get("detail")


def test_get_not_limited():
    app = Starlette(
        routes=[
            Route("/api/ping", endpoint=tiny_ok, methods=["GET", "POST"]),
        ]
    )
    app.add_middleware(PostApiRateLimitMiddleware, limit_per_minute=2)
    client = TestClient(app)
    for _ in range(5):
        assert client.get("/api/ping").status_code == 200
