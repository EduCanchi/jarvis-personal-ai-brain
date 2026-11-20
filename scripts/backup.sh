#!/usr/bin/env bash
# Crea un respaldo consistente (base de datos + archivos) llamando a la API local.
set -euo pipefail
URL="${PAIB_URL:-http://127.0.0.1:4317}"

if ! curl -s -m 3 "$URL/api/health" >/dev/null 2>&1; then
  echo "ERROR: la aplicación no está en marcha en $URL. Iníciala con scripts/start.sh"
  exit 1
fi

RESPONSE="$(curl -s -m 300 -X POST "$URL/api/backup")"
echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Respaldo creado:', d['backup']['file'], f\"({d['backup']['size']} bytes)\")" 2>/dev/null \
  || echo "$RESPONSE"
