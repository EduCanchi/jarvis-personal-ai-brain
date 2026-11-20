#!/usr/bin/env bash
# Instalación reproducible de Personal AI Brain en macOS Apple Silicon.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> Personal AI Brain — instalación"
echo "    Directorio: $ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Aviso: este instalador está pensado para macOS. Continuando de todos modos."
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "Aviso: se recomienda Apple Silicon (arm64). Arquitectura detectada: $(uname -m)"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado. Instálalo con Homebrew (brew install node) o desde https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: se requiere Node.js 22 o superior (detectado $(node -v))."
  exit 1
fi

echo "==> Node $(node -v) · npm $(npm -v)"

echo "==> Instalando dependencias"
npm install --no-audit --no-fund

echo "==> Compilando la aplicación"
npm run build

echo "==> Instalando motor de voz local (Kokoro + Piper JARVIS)"
bash scripts/install-voices.sh || echo "Aviso: no se pudo instalar el motor de voz; la app usará las voces de macOS."

echo "==> Preparando lanzador para el Dock"
bash scripts/make-app.sh

cat <<'EOF'

Instalación completada.

Siguientes pasos:
  1. Abre "Personal AI Brain" desde ~/Applications o el Launchpad.
  2. En Configuración → Clave de NVIDIA, pega tu clave nvapi-… y guarda.
  3. Pulsa "Probar conexión real" para verificar los tres modelos.
  4. Arrastra documentos en Biblioteca.

La base de datos y los archivos viven en:
  ~/Library/Application Support/PersonalAIBrain

EOF
