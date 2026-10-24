#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/beatwave}"
PURGE_IMAGES=0
ASSUME_YES=0

for argument in "$@"; do
  case "${argument}" in
    --yes) ASSUME_YES=1 ;;
    --purge-images) PURGE_IMAGES=1 ;;
    *)
      echo "Kullanım: bash uninstall.sh [--yes] [--purge-images]" >&2
      exit 2
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu script root olarak çalıştırılmalı: sudo bash uninstall.sh" >&2
  exit 1
fi

# The default path is deliberately fixed so a typo cannot delete an unrelated directory.
if [[ "${APP_DIR}" != "/opt/beatwave" ]]; then
  echo "Güvenlik nedeniyle yalnızca /opt/beatwave kaldırılabilir." >&2
  exit 1
fi

if [[ "${ASSUME_YES}" -ne 1 ]]; then
  if [[ ! -t 0 ]]; then
    echo "Etkileşimsiz kullanım için --yes belirtmelisin." >&2
    exit 1
  fi
  echo "Bu işlem BeatWave konteynerlerini ve /opt/beatwave klasörünü kalıcı olarak silecek."
  read -r -p "Devam etmek için REMOVE yaz: " confirmation
  if [[ "${confirmation}" != "REMOVE" ]]; then
    echo "İptal edildi."
    exit 0
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if [[ -f "${APP_DIR}/docker-compose.yml" ]]; then
    if docker compose version >/dev/null 2>&1; then
      (cd "${APP_DIR}" && docker compose down --remove-orphans) || true
    elif command -v docker-compose >/dev/null 2>&1; then
      (cd "${APP_DIR}" && docker-compose down --remove-orphans) || true
    fi
  fi

  # Also remove containers created by older BeatWave installations.
  for container in beatwave-bot beatwave-yt-cipher discord-music-lavalink; do
    docker rm -f "${container}" >/dev/null 2>&1 || true
  done

  if [[ "${PURGE_IMAGES}" -eq 1 ]]; then
    for image in ghcr.io/lavalink-devs/lavalink:4 ghcr.io/kikkia/yt-cipher:master node:20-bookworm-slim; do
      docker image rm "${image}" >/dev/null 2>&1 || true
    done
    echo "BeatWave ile ilişkili Docker imajları kaldırılmaya çalışıldı."
  fi
else
  echo "Docker bulunamadı; konteyner temizliği atlandı."
fi

if [[ -d "${APP_DIR}" ]]; then
  rm -rf --one-file-system -- "${APP_DIR}"
fi

echo "BeatWave kaldırıldı: ${APP_DIR}"
echo "Docker programı ve sistemdeki diğer Docker projeleri korunmuştur."
