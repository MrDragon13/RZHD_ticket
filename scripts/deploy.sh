#!/usr/bin/env bash
# Полный перезапуск стека на сервере с git и Docker Compose v1.
# Запускать из корня репозитория на VDS: bash scripts/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
git pull origin main
docker-compose down
docker-compose up -d --build
if curl -fsS --max-time 12 "http://127.0.0.1:80/" >/dev/null 2>&1; then
  echo "deploy: HTTP :80 ok"
else
  echo "deploy: warning — curl http://127.0.0.1:80/ failed (проверьте Caddy и контейнеры: docker-compose ps)" >&2
  exit 1
fi
