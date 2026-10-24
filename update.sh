#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/beatwave}"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Root olarak çalıştırılmalı." >&2
  exit 1
fi

cd "${APP_DIR}"
git pull --ff-only origin main

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose bulunamadı." >&2
  exit 1
fi

docker run --rm -v "${APP_DIR}:/app" -w /app node:20-bookworm-slim sh -lc 'npm run check'
"${COMPOSE[@]}" up -d --force-recreate lavalink

set -a
# shellcheck disable=SC1091
source "${APP_DIR}/.env"
set +a

for attempt in $(seq 1 60); do
  if curl -fsS -H "Authorization: ${LAVALINK_PASSWORD}" http://127.0.0.1:2333/version >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Lavalink hazır olmadı." >&2
    exit 1
  fi
  sleep 2
done

docker rm -f beatwave-bot >/dev/null 2>&1 || true
docker run -d \
  --name beatwave-bot \
  --restart unless-stopped \
  --network host \
  --env-file "${APP_DIR}/.env" \
  -v "${APP_DIR}:/app" \
  -w /app \
  node:20-bookworm-slim \
  sh -lc 'npm run check && npm run deploy && npm start'

echo "BeatWave güncellendi."
echo "Kontrol: docker ps"
echo "Bot logu: docker logs --tail 100 beatwave-bot"
