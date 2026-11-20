#!/usr/bin/env bash
# Crea "Personal AI Brain.app" en ~/Applications, apuntando a este repositorio.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP_DIR="$HOME/Applications/Personal AI Brain.app"
LOG_DIR="$HOME/Library/Logs"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$LOG_DIR"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Personal AI Brain</string>
  <key>CFBundleDisplayName</key><string>Personal AI Brain</string>
  <key>CFBundleIdentifier</key><string>local.personal-ai-brain</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><false/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP_DIR/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
# Lanzador generado por scripts/make-app.sh — no editar a mano.
set -u
ROOT="$ROOT"
LOG="$LOG_DIR/PersonalAIBrain.log"
URL="http://127.0.0.1:4317"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! curl -s -m 2 "\$URL/api/health" >/dev/null 2>&1; then
  cd "\$ROOT" || { osascript -e 'display alert "Personal AI Brain" message "No se encuentra el directorio del proyecto: $ROOT"'; exit 1; }
  if [[ ! -d .next ]]; then
    osascript -e 'display alert "Personal AI Brain" message "Falta la compilación. Ejecuta scripts/install.sh en el proyecto."'
    exit 1
  fi
  nohup /usr/bin/env npm run start >> "\$LOG" 2>&1 &
  for _ in \$(seq 1 90); do
    if curl -s -m 2 "\$URL/api/health" >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

if curl -s -m 3 "\$URL/api/health" >/dev/null 2>&1; then
  open "\$URL"
else
  osascript -e 'display alert "Personal AI Brain" message "El servidor no respondió. Revisa ~/Library/Logs/PersonalAIBrain.log"'
fi
LAUNCH

chmod +x "$APP_DIR/Contents/MacOS/launch"
touch "$APP_DIR"

echo "Lanzador creado: $APP_DIR"
echo "Puedes arrastrarlo al Dock desde ~/Applications."
