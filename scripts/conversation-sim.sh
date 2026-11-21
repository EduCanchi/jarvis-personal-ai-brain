#!/usr/bin/env bash
# Simulación de una conversación de 10 turnos por la API (sin micrófono).
# Verifica contexto, seguimiento y latencia. El micrófono y la interrupción
# por voz solo pueden validarse en la interfaz.
set -uo pipefail
URL="${PAIB_URL:-http://127.0.0.1:4317}"
CONV=""
TURNOS=(
  "Voy a organizar un viaje a Antigua Guatemala del 12 al 18 de diciembre."
  "¿Qué fechas te he dicho?"
  "El presupuesto es de 1.200 dólares."
  "¿Cuánto era el presupuesto?"
  "Añade una visita al lago de Atitlán."
  "¿Qué plan tenemos hasta ahora?"
  "Mi hermana se llama Lucía y viene conmigo."
  "¿Quién viene conmigo?"
  "Resume el viaje en tres puntos."
  "¿Y qué día llegamos?"
)
i=0
for T in "${TURNOS[@]}"; do
  i=$((i+1))
  INICIO=$(python3 -c 'import time;print(time.time())')
  if [[ -z "$CONV" ]]; then
    RESP=$(curl -s -m 240 -X POST "$URL/api/assistant" -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys;print(json.dumps({"question":sys.argv[1],"origin":"texto"}))' "$T")")
  else
    RESP=$(curl -s -m 240 -X POST "$URL/api/assistant" -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys;print(json.dumps({"question":sys.argv[1],"conversation_id":sys.argv[2],"origin":"texto"}))' "$T" "$CONV")")
  fi
  FIN=$(python3 -c 'import time;print(time.time())')
  CONV=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("conversation_id",""))' 2>/dev/null)
  RESPUESTA=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("answer","")[:220])' 2>/dev/null)
  MS=$(python3 -c "print(round(($FIN-$INICIO)*1000))")
  printf "\n[%02d] %s\n     → %s\n     (%s ms)\n" "$i" "$T" "$RESPUESTA" "$MS"
done
echo
echo "Conversación: $CONV"
echo "Bórrala con: curl -X DELETE \"$URL/api/conversations/$CONV\""
