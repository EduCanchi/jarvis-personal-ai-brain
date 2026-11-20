#!/usr/bin/env bash
# Detiene el servidor local de Personal AI Brain (puerto 4317).
set -euo pipefail
PIDS="$(lsof -ti tcp:4317 -sTCP:LISTEN || true)"
if [[ -z "$PIDS" ]]; then
  echo "No hay ningún servidor escuchando en el puerto 4317."
  exit 0
fi
echo "Deteniendo PID(s): $PIDS"
kill $PIDS
sleep 1
echo "Detenido."
