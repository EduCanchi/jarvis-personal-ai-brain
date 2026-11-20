#!/usr/bin/env bash
# Instala el motor de voz local (Kokoro + Piper) en un entorno aislado.
# Idempotente: no vuelve a descargar lo que ya existe.
set -euo pipefail

VOICES="$HOME/Library/Application Support/PersonalAIBrain/voices"
mkdir -p "$VOICES/kokoro" "$VOICES/piper/jarvis-high" "$VOICES/samples"

PY=""
for candidate in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done
if [[ -z "$PY" ]]; then
  echo "ERROR: no hay Python 3.9+ disponible."
  exit 1
fi
echo "==> Python: $PY"

if [[ ! -x "$VOICES/venv-voice/bin/python" ]]; then
  echo "==> Creando entorno aislado (venv-voice)"
  "$PY" -m venv "$VOICES/venv-voice"
fi

echo "==> Instalando dependencias (piper-tts, kokoro-onnx, soundfile)"
"$VOICES/venv-voice/bin/pip" install --quiet --upgrade pip
"$VOICES/venv-voice/bin/pip" install --quiet piper-tts==1.8.0 kokoro-onnx soundfile

download() {
  local url="$1" dest="$2" label="$3"
  if [[ -s "$dest" ]]; then
    echo "    ya existe: $label"
    return 0
  fi
  echo "    descargando $label"
  curl -L --fail --retry 3 --progress-bar -o "$dest" "$url"
}

echo "==> Kokoro-82M (Apache-2.0)"
download "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx" \
  "$VOICES/kokoro/kokoro-v1.0.onnx" "kokoro-v1.0.onnx (310 MB)"
download "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin" \
  "$VOICES/kokoro/voices-v1.0.bin" "voices-v1.0.bin (27 MB)"

echo "==> Voz JARVIS de la comunidad (Piper, licencia MIT declarada)"
download "https://huggingface.co/jgkawell/jarvis/resolve/main/en/en_GB/jarvis/high/jarvis-high.onnx" \
  "$VOICES/piper/jarvis-high/jarvis-high.onnx" "jarvis-high.onnx (109 MB)"
download "https://huggingface.co/jgkawell/jarvis/resolve/main/en/en_GB/jarvis/high/jarvis-high.onnx.json" \
  "$VOICES/piper/jarvis-high/jarvis-high.onnx.json" "jarvis-high.onnx.json"

cat <<EOF

Motor de voz instalado en:
  $VOICES

Abre la app y ve a "Voces" para escuchar y activar.
Nota: la voz JARVIS de Piper solo es válida en inglés. Para español se usa Kokoro (Apache-2.0).
EOF
