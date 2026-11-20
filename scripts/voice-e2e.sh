#!/usr/bin/env bash
# Prueba de extremo a extremo del canal de voz SIN micrófono:
#   1. Genera una locución en español con la voz de macOS.
#   2. La transcribe con whisper.cpp (misma ruta que usa la interfaz).
#   3. Envía la transcripción al asistente (herramientas + memoria).
#   4. Sintetiza la respuesta y mide el tiempo hasta el primer audio.
#
# Uso: bash scripts/voice-e2e.sh "texto que diría el usuario"
set -euo pipefail
URL="${PAIB_URL:-http://127.0.0.1:4317}"
TEXTO="${1:-Jarvis, ¿qué sabes del Proyecto Aurora?}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== Voz de extremo a extremo =="
echo "Entrada simulada: $TEXTO"

/usr/bin/say -v "Mónica" -o "$TMP/entrada.aiff" "$TEXTO"
/usr/bin/afconvert -f WAVE -d LEI16@16000 -c 1 "$TMP/entrada.aiff" "$TMP/entrada.wav"

echo "[0] Calentamiento (carga de whisper y conexiones)"
curl -s -m 120 -X POST "$URL/api/voice/transcribe" -F "audio=@$TMP/entrada.wav" >/dev/null
curl -s -m 120 -X POST "$URL/api/assistant" -H "Content-Type: application/json" \
  -d '{"question":"Hola","origin":"voz"}' >/dev/null
curl -s -m 120 -X POST "$URL/api/voice/warm" >/dev/null
sleep 1

echo "[1] STT (whisper.cpp)"
T0=$(python3 -c 'import time;print(time.time())')
STT="$(curl -s -m 120 -X POST "$URL/api/voice/transcribe" -F "audio=@$TMP/entrada.wav")"
T1=$(python3 -c 'import time;print(time.time())')
echo "    $STT"
TRANSCRITO="$(echo "$STT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["text"])')"

echo "[2] Asistente"
T2=$(python3 -c 'import time;print(time.time())')
RESP="$(curl -s -m 240 -X POST "$URL/api/assistant" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"question":sys.argv[1],"origin":"voz"}))' "$TRANSCRITO")")"
T3=$(python3 -c 'import time;print(time.time())')
RESPUESTA="$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["answer"])')"
HERRAMIENTAS="$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(",".join(t["herramienta"] for t in d["tools"]) or "-")')"
echo "    respuesta: ${RESPUESTA:0:180}"
echo "    herramientas: $HERRAMIENTAS"

echo "[3] TTS (primera frase)"
T4=$(python3 -c 'import time;print(time.time())')
PRIMERA="$(curl -s -m 60 -X POST "$URL/api/voice/speak" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1],"segments":True}))' "$RESPUESTA")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["segments"][0])')"
curl -s -m 60 -X POST "$URL/api/voice/speak" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1]}))' "$PRIMERA")" -o "$TMP/salida.m4a" >/dev/null
T5=$(python3 -c 'import time;print(time.time())')

python3 - "$T0" "$T1" "$T2" "$T3" "$T4" "$T5" <<'PY'
import sys
t0,t1,t2,t3,t4,t5 = map(float, sys.argv[1:])
print()
print(f"STT:                 {(t1-t0)*1000:7.0f} ms")
print(f"Asistente (Nemotron):{(t3-t2)*1000:7.0f} ms")
print(f"TTS primera frase:   {(t5-t4)*1000:7.0f} ms")
print(f"Tiempo hasta 1er audio (estimado): {(t3-t0)*1000 + (t5-t4)*1000:7.0f} ms")
PY

ls -la "$TMP/salida.m4a" | awk '{print "audio generado:", $5, "bytes"}'
