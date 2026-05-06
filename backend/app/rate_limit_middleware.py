"""Ограничение частоты POST к /api/* по IP (память процесса)."""

from __future__ import annotations

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class PostApiRateLimitMiddleware(BaseHTTPMiddleware):
    """Защита от флуда по публичному API киоска; для нескольких воркеров нужен Redis."""

    def __init__(self, app, limit_per_minute: int):
        super().__init__(app)
        self.limit = max(1, int(limit_per_minute))
        self.window = 60.0
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _prune(self, ip: str, now: float) -> None:
        bucket = self._hits[ip]
        cutoff = now - self.window
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)

    async def dispatch(self, request: Request, call_next):
        if request.method == "POST" and request.url.path.startswith("/api/"):
            ip = request.client.host if request.client else "unknown"
            now = time.time()
            self._prune(ip, now)
            bucket = self._hits[ip]
            if len(bucket) >= self.limit:
                return JSONResponse({"detail": "Too Many Requests"}, status_code=429)
            bucket.append(now)
        return await call_next(request)
