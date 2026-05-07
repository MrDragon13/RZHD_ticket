"""Кольцевой журнал HTTP-запросов к API с момента старта процесса (для секретной панели отладки).

Не заменяет централизованный логирование и не пишет тела POST — только метод, путь, статус,
клиентский IP (с учётом X-Forwarded-For / X-Real-IP), укороченный User-Agent и X-Request-Id.
"""

from __future__ import annotations

import os
import time
from collections import deque
from datetime import UTC, datetime

from starlette.requests import Request

_max_raw = int(os.getenv("PATH_AUDIT_LOG_MAX_LINES", "8000"))
MAX_LINES = max(100, min(_max_raw, 50_000))

_lines: deque[str] = deque(maxlen=MAX_LINES)
_process_start_perf = time.perf_counter()
_process_start_wall = datetime.now(UTC)


def _iso_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or "?"
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip() or "?"
    if request.client:
        return request.client.host or "?"
    return "?"


def record_http_visit(
    *,
    request: Request,
    status_code: int,
    request_id: str,
) -> None:
    method = request.method.upper()
    path = request.url.path
    if request.url.query:
        path = f"{path}?{request.url.query}"
    ip = client_ip(request)
    ua = (request.headers.get("user-agent") or "").replace("\n", " ").replace("\r", " ")
    if len(ua) > 180:
        ua = ua[:177] + "..."
    line = f"{_iso_now()} | {ip} | {method} {path} | {status_code} | rid={request_id} | {ua}"
    _lines.append(line)


def snapshot() -> tuple[str, list[str], int]:
    """ISO время старта процесса, строки журнала (от старых к новым), ёмкость буфера."""

    started = _process_start_wall.isoformat().replace("+00:00", "Z")
    return started, list(_lines), MAX_LINES


def uptime_seconds() -> float:
    return time.perf_counter() - _process_start_perf
