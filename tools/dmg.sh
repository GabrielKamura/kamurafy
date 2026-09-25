#!/bin/bash
# Gera o instalador build/Kamurafy-<versão>.dmg a partir de uma build pública.
#   tools/dmg.sh                    → compila (PUBLICO=1, universal) e empacota
#   APP=build/publico/Kamurafy.app tools/dmg.sh → empacota um .app já compilado
# Com ASSINATURA="Developer ID Application: …" o .app e o .dmg saem assinados.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSAO="${VERSAO:-$(sed -n 's/^VERSAO="\${VERSAO:-\(.*\)}"$/\1/p' build.sh)}"
if [ -z "${APP:-}" ]; then
  PUBLICO=1 BUILD_DIR=build/publico ./build.sh >/dev/null
  APP=build/publico/Kamurafy.app
fi
[ -d "$APP" ] || { echo "não achei $APP" >&2; exit 1; }
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/Kamurafy.app"
ln -s /Applications "$STAGE/Aplicativos"
OUT="build/Kamurafy-$VERSAO.dmg"
rm -f "$OUT"
hdiutil create -volname "Kamurafy" -srcfolder "$STAGE" -ov -format UDZO -imagekey zlib-level=9 "$OUT" >/dev/null
if [ -n "${ASSINATURA:-}" ]; then
  codesign --force --timestamp --sign "$ASSINATURA" "$OUT"
fi
shasum -a 256 "$OUT" | tee "$OUT.sha256"
echo "$OUT"
