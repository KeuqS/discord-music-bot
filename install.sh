#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/beatwave}"
REPO_URL="${REPO_URL:-https://github.com/KeuqS/discord-music-bot.git}"
DEFAULT_GUILD_ID="557698874152583178"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu script root olarak çalıştırılmalı: sudo bash install.sh" >&2
  exit 1
fi

if [[ -t 0 ]]; then
  read -r -p "Discord bot tokeni: " DISCORD_TOKEN
  read -r -p "Discord Application/Client ID: " CLIENT_ID
  read -r -p "Discord Guild ID [${DEFAULT_GUILD_ID}]: " GUILD_ID
  GUILD_ID="${GUILD_ID:-$DEFAULT_GUILD_ID}"
  read -r -s -p "Dashboard admin parolası [boş bırakırsan oluşturulur]: " DASHBOARD_PASSWORD
  echo
  read -r -p "Spotify Client ID [boş bırakılabilir]: " SPOTIFY_CLIENT_ID
  read -r -s -p "Spotify Client Secret [boş bırakılabilir]: " SPOTIFY_CLIENT_SECRET
  echo
else
  : "${DISCORD_TOKEN:?DISCORD_TOKEN gerekli}"
  : "${CLIENT_ID:?CLIENT_ID gerekli}"
  GUILD_ID="${GUILD_ID:-$DEFAULT_GUILD_ID}"
  SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-}"
  SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET:-}"
fi

if [[ ! "${CLIENT_ID}" =~ ^[0-9]{17,20}$ ]]; then
  echo "CLIENT_ID Discord Application ID olmalı ve yalnızca rakamlardan oluşmalı." >&2
  exit 1
fi
if [[ -n "${GUILD_ID}" && ! "${GUILD_ID}" =~ ^[0-9]{17,20}$ ]]; then
  echo "GUILD_ID Discord sunucu ID’si olmalı ve yalnızca rakamlardan oluşmalı. Spotify secret bu alana girilmez." >&2
  exit 1
fi

if [[ -z "${DASHBOARD_PASSWORD:-}" ]]; then
  DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
  GENERATED_DASHBOARD_PASSWORD=1
else
  GENERATED_DASHBOARD_PASSWORD=0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io
fi
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose kurulamadı." >&2
  exit 1
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch origin main
  git -C "${APP_DIR}" reset --hard origin/main
elif [[ -e "${APP_DIR}" ]]; then
  echo "Hedef klasör boş değil: ${APP_DIR}" >&2
  exit 1
else
  git clone --branch main "${REPO_URL}" "${APP_DIR}"
fi

mkdir -p "${APP_DIR}/data"
chmod 700 "${APP_DIR}/data"

LAVALINK_PASSWORD="$(openssl rand -hex 32)"
umask 077
{
  printf 'DISCORD_TOKEN=%s\n' "${DISCORD_TOKEN}"
  printf 'CLIENT_ID=%s\n' "${CLIENT_ID}"
  printf 'GUILD_ID=%s\n' "${GUILD_ID}"
  printf 'LAVALINK_PASSWORD=%s\n' "${LAVALINK_PASSWORD}"
  printf 'LAVALINK_HOST=localhost\nLAVALINK_PORT=2333\nLAVALINK_SECURE=false\nLAVALINK_SEARCH_PLATFORM=ytsearch\n'
  printf 'DASHBOARD_ENABLED=true\nDASHBOARD_HOST=0.0.0.0\nDASHBOARD_PORT=3000\nDASHBOARD_USER=admin\nDASHBOARD_PASSWORD=%s\nDASHBOARD_USERS_FILE=data/users.json\n' "${DASHBOARD_PASSWORD}"
  printf 'SPOTIFY_CLIENT_ID=%s\nSPOTIFY_CLIENT_SECRET=%s\n' "${SPOTIFY_CLIENT_ID}" "${SPOTIFY_CLIENT_SECRET}"
} > "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"

echo "Node bağımlılıkları kuruluyor..."
docker run --rm \
  -v "${APP_DIR}:/app" \
  -w /app \
  node:20-bookworm-slim \
  sh -lc 'apt-get update >/dev/null && apt-get install -y --no-install-recommends python3 make g++ libopus-dev pkg-config >/dev/null && npm install'

cd "${APP_DIR}"
"${COMPOSE[@]}" up -d --force-recreate lavalink

echo "Lavalink hazır olması bekleniyor..."
for attempt in $(seq 1 60); do
  if curl -fsS -H "Authorization: ${LAVALINK_PASSWORD}" http://127.0.0.1:2333/version >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Lavalink 60 denemede hazır olmadı. Log: docker logs discord-music-lavalink" >&2
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

echo
echo "BeatWave kurulumu tamamlandı."
echo "Web paneli: http://$(hostname -I | awk '{print $1}'):3000"
echo "Panel kullanıcı adı: admin"
if [[ "${GENERATED_DASHBOARD_PASSWORD}" -eq 1 ]]; then
  echo "Oluşturulan panel parolası: ${DASHBOARD_PASSWORD}"
else
  echo "Panel parolası: kurulum sırasında belirlediğin parola"
fi
echo
echo "Durum: docker ps"
echo "Bot logu: docker logs -f beatwave-bot"
echo "Lavalink logu: docker logs -f discord-music-lavalink"
