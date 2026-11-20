#!/usr/bin/env bash
# Verificación de la ampliación JARVIS: voz, herramientas, permisos, acceso remoto.
# Uso: bash scripts/smoke-jarvis.sh [--notificar]
set -uo pipefail

URL="${PAIB_URL:-http://127.0.0.1:4317}"
TMP="$(mktemp -d)"
PASS=0
FAIL=0
trap 'rm -rf "$TMP"' EXIT

ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

echo "== JARVIS · smoke test =="
echo "Servidor: $URL"

echo "[1] Estado"
check "health responde" 'curl -s -m 10 "$URL/api/health" | grep -q "\"ok\":true"'
VOZ="$(curl -s -m 20 "$URL/api/voice/transcribe")"
check "whisper.cpp disponible" 'echo "$VOZ" | grep -q "\"disponible\":true"'
check "voces en español detectadas" 'echo "$VOZ" | python3 -c "import sys,json;d=json.load(sys.stdin);sys.exit(0 if any(v[\"idioma\"].startswith(\"es\") for v in d[\"voces\"]) else 1)"'

echo "[2] Voz"
/usr/bin/say -v "Mónica" -o "$TMP/e.aiff" "Jarvis, prepara un resumen del proyecto aurora."
/usr/bin/afconvert -f WAVE -d LEI16@16000 -c 1 "$TMP/e.aiff" "$TMP/e.wav"
STT="$(curl -s -m 120 -X POST "$URL/api/voice/transcribe" -F "audio=@$TMP/e.wav")"
check "STT transcribe en español" 'echo "$STT" | grep -qi "aurora"'
TTS_CODE="$(curl -s -m 60 -o "$TMP/s.m4a" -w "%{http_code}" -X POST "$URL/api/voice/speak" -H "Content-Type: application/json" -d '{"text":"Hola, soy Jarvis."}')"
check "TTS genera audio" '[[ "$TTS_CODE" == "200" ]] && [[ $(wc -c < "$TMP/s.m4a") -gt 1000 ]]'

echo "[3] Asistente"
RESP="$(curl -s -m 240 -X POST "$URL/api/assistant" -H "Content-Type: application/json" -d '{"question":"¿Quién lidera el Proyecto Aurora?","origin":"texto"}')"
check "respuesta con contenido" 'echo "$RESP" | python3 -c "import sys,json;sys.exit(0 if len(json.load(sys.stdin)[\"answer\"])>10 else 1)"'
check "modelo Nemotron identificado" 'echo "$RESP" | grep -q "nemotron"'

echo "[4] Herramientas de creación"
PPTX="$(curl -s -m 120 -X POST "$URL/api/tools" -H "Content-Type: application/json" -d '{"nombre":"crear_presentacion","argumentos":{"titulo":"Prueba JARVIS","diapositivas":[{"titulo":"Uno","puntos":["A","B"]}]}}')"
check "crear_presentacion" 'echo "$PPTX" | grep -q "\"ok\":true"'
ART="$(echo "$PPTX" | python3 -c "import sys,json;print(json.load(sys.stdin)['artefactos'][0]['id'])")"
curl -s -m 60 "$URL/api/files/$ART?download=1" -o "$TMP/p.pptx"
check "pptx válido (ZIP con slides)" 'unzip -l "$TMP/p.pptx" 2>/dev/null | grep -q "ppt/slides/slide1.xml"'

XLSX="$(curl -s -m 120 -X POST "$URL/api/tools" -H "Content-Type: application/json" -d '{"nombre":"crear_excel","argumentos":{"nombre":"prueba","hojas":[{"nombre":"Datos","columnas":["A","B"],"filas":[[1,2]]}]}}')"
check "crear_excel" 'echo "$XLSX" | grep -q "\"ok\":true"'
ARTX="$(echo "$XLSX" | python3 -c "import sys,json;print(json.load(sys.stdin)['artefactos'][0]['id'])")"
curl -s -m 60 "$URL/api/files/$ARTX?download=1" -o "$TMP/x.xlsx"
check "xlsx válido" 'unzip -l "$TMP/x.xlsx" 2>/dev/null | grep -q "xl/workbook.xml"'

echo "[5] Permisos"
CONF="$(curl -s -m 60 -X POST "$URL/api/tools" -H "Content-Type: application/json" -d '{"nombre":"crear_recordatorio","argumentos":{"titulo":"x"}}')"
check "acción sensible exige confirmación" 'echo "$CONF" | grep -q "\"requiere_confirmacion\":true"'

echo "[6] Acceso remoto"
NOAUTH="$(curl -s -o /dev/null -w "%{http_code}" -m 20 -H "Host: mac.tailnet.ts.net" "$URL/api/health")"
check "remoto sin token bloqueado (401)" '[[ "$NOAUTH" == "401" ]]'
TOKEN="$(cat "$HOME/Library/Application Support/PersonalAIBrain/access-token.txt" 2>/dev/null || echo "")"
if [[ -n "$TOKEN" ]]; then
  WITHAUTH="$(curl -s -o /dev/null -w "%{http_code}" -m 20 -H "Host: mac.tailnet.ts.net" -H "x-paib-token: $TOKEN" "$URL/api/health")"
  check "remoto con token permitido (200)" '[[ "$WITHAUTH" == "200" ]]'
  SHORT="$(curl -s -m 120 -X POST -H "x-paib-token: $TOKEN" -H "Content-Type: application/json" -d '{"instruccion":"Responde solo: conectado"}' "$URL/api/shortcuts/run")"
  check "atajo de Apple responde texto" '[[ ${#SHORT} -gt 2 ]]'
else
  bad "token de acceso no generado"
fi

echo "[7] Automatizaciones"
AUTO="$(curl -s -m 120 -X POST "$URL/api/automations" -H "Content-Type: application/json" -d '{"nombre":"Prueba smoke","prompt":"Responde ok","schedule":{"tipo":"cada","minutos":60}}')"
AID="$(echo "$AUTO" | python3 -c "import sys,json;print(json.load(sys.stdin)['automation']['id'])" 2>/dev/null || echo "")"
check "crear automatización" '[[ -n "$AID" ]]'
[[ -n "$AID" ]] && curl -s -m 30 -X DELETE "$URL/api/automations/$AID" >/dev/null

if [[ "${1:-}" == "--notificar" ]]; then
  echo "[8] Notificación"
  NOTIF="$(curl -s -m 60 -X POST "$URL/api/notifications" -H "Content-Type: application/json" -d '{"titulo":"JARVIS","mensaje":"Prueba automática"}')"
  check "notificación local enviada" 'echo "$NOTIF" | grep -q "\"ok\":true"'
fi

echo
echo "Resultado: $PASS correctas, $FAIL fallidas"
[[ "$FAIL" -eq 0 ]] || exit 1
