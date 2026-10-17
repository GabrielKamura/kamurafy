#!/bin/bash
# Gera o Kamurafy.app sem Xcode (só Command Line Tools).
#   ./build.sh                 → build/Kamurafy.app universal (Intel + Apple Silicon)
#   ARCHS=x86_64 ./build.sh    → só a arquitetura pedida (mais rápido pra testar)
#   BUILD_DIR=build/x ./build.sh → outra pasta de saída (pra builds em paralelo)
#   PUBLICO=1 ./build.sh       → versão pra distribuir: sem a fonte More Sugar (licença pessoal),
#                                sem modo foto/interface externa, sem galeria de testes
#   ASSINATURA="Developer ID Application: Nome (TEAMID)" PUBLICO=1 ./build.sh
#                              → assina com hardened runtime e carimbo de tempo (pronto pra notarizar)
set -euo pipefail
cd "$(dirname "$0")"

VERSAO="${VERSAO:-0.2.0}"
BUILD_NUM="${BUILD_NUM:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}"
BUILD_DIR="${BUILD_DIR:-build}"
ARCHS="${ARCHS:-x86_64 arm64}"
APP="$BUILD_DIR/Kamurafy.app"
TMP="$BUILD_DIR/.obj"

rm -rf "$APP" "$TMP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$TMP"

# build de desenvolvimento liga os ganchos de teste (modo foto, KAMURAFY_UI_DIR, inspetor)
SWIFT_FLAGS=()
[ -z "${PUBLICO:-}" ] && SWIFT_FLAGS+=(-D KAMURAFY_DEV)

bins=()
for arch in $ARCHS; do
  swiftc -O -whole-module-optimization -parse-as-library ${SWIFT_FLAGS[@]+"${SWIFT_FLAGS[@]}"} \
    -target "$arch-apple-macos13.0" \
    -module-name Kamurafy \
    app/Sources/*.swift \
    -o "$TMP/Kamurafy-$arch"
  bins+=("$TMP/Kamurafy-$arch")
done
if [ ${#bins[@]} -gt 1 ]; then
  lipo -create "${bins[@]}" -output "$APP/Contents/MacOS/Kamurafy"
else
  cp "${bins[0]}" "$APP/Contents/MacOS/Kamurafy"
fi

sed -e "s/__VERSAO__/$VERSAO/" -e "s/__BUILD__/$BUILD_NUM/" app/Info.plist > "$APP/Contents/Info.plist"
cp -R ui "$APP/Contents/Resources/ui"
if [ -n "${PUBLICO:-}" ]; then
  rm -f "$APP/Contents/Resources/ui/fonts/"MoreSugar-*.woff2
  rm -f "$APP/Contents/Resources/ui/js/pages/galeria.js" "$APP/Contents/Resources/ui/css/pages/galeria.css"
  sed -i '' -e '/pages\/galeria\./d' "$APP/Contents/Resources/ui/index.html"
elif [ -f local/MoreSugar-Regular.woff2 ]; then
  cp local/MoreSugar-Regular.woff2 "$APP/Contents/Resources/ui/fonts/"
fi

# ícone: gerado a partir de tools/icone.swift (um por pasta de build, pra builds em paralelo)
if [ -f tools/icone.swift ] && [ -x tools/gerar-icone.sh ]; then
  ICNS="$BUILD_DIR/AppIcon.icns"
  if [ ! -f "$ICNS" ] || [ tools/icone.swift -nt "$ICNS" ]; then
    tools/gerar-icone.sh "$ICNS.tmp.icns" >/dev/null && mv "$ICNS.tmp.icns" "$ICNS"
  fi
  cp "$ICNS" "$APP/Contents/Resources/AppIcon.icns"
fi

if [ -n "${ASSINATURA:-}" ]; then
  # assinatura de verdade: se falhar, o build falha (nada de cair pra ad-hoc em silêncio)
  codesign --force --options runtime --timestamp --sign "$ASSINATURA" "$APP"
  codesign --verify --strict --deep "$APP"
else
  codesign --force --sign - "$APP" >/dev/null
  [ -n "${PUBLICO:-}" ] && echo "aviso: build pública sem ASSINATURA (ad-hoc): o Gatekeeper bloqueia em outros Macs" >&2
fi
rm -rf "$TMP"
echo "$APP"
