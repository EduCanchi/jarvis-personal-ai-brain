#!/usr/bin/env bash
# Inicia el servidor en segundo plano (solo localhost) y abre la interfaz.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="http://127.0.0.1:4317"
LOG="$HOME/Library/Logs/PersonalAIBrain.log"
mkdir -p "$(dirname "$LOG")"

if curl -s -m 2 "$URL/api/health" >/dev/null 2>&1; then
  echo "Ya está en marcha: $URL"
  open "$URL"
  exit 0
fi

if [[ ! -d .next ]]; then
  echo "==> Compilando (solo la primera vez)…"
  npm run build
fi

nohup npm run start >> "$LOG" 2>&1 &
echo "Iniciando… log: $LOG"
for _ in $(seq 1 90); do
  if curl -s -m 2 "$URL/api/health" >/dev/null 2>&1; then
    echo "Listo: $URL"
    open "$URL"
    exit 0
  fi
  sleep 1
done

echo "ERROR: el servidor no respondió. Revisa $LOG"
exit 1
