#!/usr/bin/env bash
# Prueba de integración real contra la aplicación en marcha.
# Uso: bash scripts/smoke.sh [--restauracion]
#   --restauracion  añade la prueba destructiva de respaldo/restauración
set -euo pipefail

URL="${PAIB_URL:-http://127.0.0.1:4317}"
TMP="$(mktemp -d)"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "== Personal AI Brain · smoke test =="
echo "Servidor: $URL"

echo "[1] Salud y configuración"
HEALTH="$(curl -s -m 10 "$URL/api/health")"
check "responde /api/health" 'echo "$HEALTH" | grep -q "\"ok\":true"'
check "clave NVIDIA configurada" 'echo "$HEALTH" | grep -q "\"clave_configurada\":true"'

echo "[2] Modelos (catálogo)"
MODELS="$(curl -s -m 60 "$URL/api/models")"
check "catálogo incluye nemotron-3-ultra" 'echo "$MODELS" | grep -q "nemotron-3-ultra-550b-a55b"'
check "catálogo incluye nemotron-3.5-super-vl" 'echo "$MODELS" | grep -q "nemotron-3.5-super-vl-120b-a12b"'
check "catálogo incluye embeddings" 'echo "$MODELS" | grep -q "nemotron-3.5-embed-8b"'

echo "[3] Documentos de prueba"
STAMP="$(date +%s)"
printf 'Informe de prueba %s\n\nEl Proyecto Helios esta liderado por Ana Torres en la organizacion Vega Systems.\nEl presupuesto aprobado es de 50.000 euros y la entrega sera en marzo de 2027.\n' "$STAMP" > "$TMP/informe-$STAMP.txt"
cupsfilter "$TMP/informe-$STAMP.txt" > "$TMP/informe-$STAMP.pdf" 2>/dev/null || cp "$TMP/informe-$STAMP.txt" "$TMP/informe-$STAMP.pdf"

cd /Users/usuario/Jarvis
node --input-type=module -e "
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
const c = createCanvas(900, 500);
const ctx = c.getContext('2d');
ctx.fillStyle = '#101418'; ctx.fillRect(0,0,900,500);
ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif';
ctx.fillText('Proyecto Helios', 40, 70);
ctx.font = '20px sans-serif';
ctx.fillText('Lider: Ana Torres', 40, 140);
ctx.fillText('Organizacion: Vega Systems', 40, 180);
ctx.fillText('Presupuesto: 50.000 EUR', 40, 220);
ctx.fillText('Entrega: marzo de 2027', 40, 260);
fs.writeFileSync('$TMP/diagrama-$STAMP.png', c.toBuffer('image/png'));
"

UPLOAD="$(curl -s -m 120 -X POST "$URL/api/documents" \
  -F "files=@$TMP/informe-$STAMP.pdf" \
  -F "files=@$TMP/diagrama-$STAMP.png")"
check "subida aceptada" 'echo "$UPLOAD" | grep -q "\"id\""'

DOC_ID="$(echo "$UPLOAD" | python3 -c 'import sys,json; print(json.load(sys.stdin)["results"][0]["id"])')"

echo "[4] Procesamiento (máx. 240 s)"
STATUS=""
for _ in $(seq 1 60); do
  STATUS="$(curl -s -m 10 "$URL/api/documents/$DOC_ID" | python3 -c 'import sys,json; print(json.load(sys.stdin)["document"]["status"])')"
  [[ "$STATUS" == "procesado" || "$STATUS" == "error" ]] && break
  sleep 4
done
check "documento procesado (estado: $STATUS)" '[[ "$STATUS" == "procesado" ]]'

DETAIL="$(curl -s -m 10 "$URL/api/documents/$DOC_ID")"
check "fragmentos generados" 'echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if len(d[\"chunks\"])>0 else 1)"'
check "relaciones extraídas" 'echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if len(d[\"edges\"])>0 else 1)"'

echo "[5] Grafo"
GRAPH="$(curl -s -m 30 "$URL/api/graph")"
check "hay nodos en el grafo" 'echo "$GRAPH" | python3 -c "import sys,json; sys.exit(0 if len(json.load(sys.stdin)[\"nodes\"])>0 else 1)"'
check "hay aristas en el grafo" 'echo "$GRAPH" | python3 -c "import sys,json; sys.exit(0 if len(json.load(sys.stdin)[\"edges\"])>0 else 1)"'

echo "[6] Chat con fuentes (máx. 240 s)"
CHAT="$(curl -s -m 240 -X POST "$URL/api/chat" -H "Content-Type: application/json" \
  -d "{\"question\":\"¿Quién lidera el Proyecto Helios y qué presupuesto tiene?\"}")"
check "respuesta generada" 'echo "$CHAT" | python3 -c "import sys,json; sys.exit(0 if len(json.load(sys.stdin).get(\"answer\",\"\"))>20 else 1)"'
check "incluye fuentes" 'echo "$CHAT" | python3 -c "import sys,json; sys.exit(0 if len(json.load(sys.stdin).get(\"sources\",[]))>0 else 1)"'
check "menciona a Ana Torres" 'echo "$CHAT" | grep -qi "Ana Torres"'

echo "[7] Persistencia"
check "conversación guardada" 'curl -s -m 10 "$URL/api/conversations" | grep -q "Proyecto Helios"'

if [[ "${1:-}" == "--restauracion" ]]; then
  echo "[8] Respaldo y restauración (destructivo)"
  BACKUP="$(curl -s -m 120 -X POST "$URL/api/backup")"
  FILE="$(echo "$BACKUP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["backup"]["file"])')"
  check "respaldo creado" '[[ -f "$FILE" ]]'
  BEFORE="$(curl -s -m 10 "$URL/api/stats" | python3 -c 'import sys,json; print(json.load(sys.stdin)["nodos"])')"
  curl -s -m 240 -X POST "$URL/api/restore" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"file": sys.argv[1], "confirm": True}))' "$FILE")" >/dev/null
  AFTER="$(curl -s -m 10 "$URL/api/stats" | python3 -c 'import sys,json; print(json.load(sys.stdin)["nodos"])')"
  check "nodos intactos tras restaurar ($BEFORE → $AFTER)" '[[ "$BEFORE" == "$AFTER" ]]'
fi

echo
echo "Resultado: $PASS correctas, $FAIL fallidas"
[[ "$FAIL" -eq 0 ]] || exit 1
