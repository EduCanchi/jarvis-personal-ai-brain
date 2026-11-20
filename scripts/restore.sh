#!/usr/bin/env bash
# Restaura un respaldo. Operación destructiva: reemplaza la base actual
# (antes crea automáticamente un respaldo de seguridad).
#
# Uso: scripts/restore.sh /ruta/al/respaldo.tar.gz --confirmar
set -euo pipefail
URL="${PAIB_URL:-http://127.0.0.1:4317}"

if [[ $# -lt 2 || "$2" != "--confirmar" ]]; then
  echo "Uso: $0 <ruta-del-respaldo.tar.gz> --confirmar"
  echo "Esto reemplazará la memoria actual por la del respaldo."
  exit 1
fi

FILE="$1"

if ! curl -s -m 3 "$URL/api/health" >/dev/null 2>&1; then
  echo "ERROR: la aplicación no está en marcha en $URL."
  exit 1
fi

curl -s -m 300 -X POST "$URL/api/restore" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"file": sys.argv[1], "confirm": True}))' "$FILE")"
echo
