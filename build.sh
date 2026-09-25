#!/bin/bash
# Gera o Kamurafy.app sem Xcode (só Command Line Tools).
#   ./build.sh                 → build/Kamurafy.app universal (Intel + Apple Silicon)
#   ARCHS=x86_64 ./build.sh    → só a arquitetura pedida (mais rápido pra testar)
#   BUILD_DIR=build/x ./build.sh → outra pasta de saída (pra builds em paralelo)
#   PUBLICO=1 ./build.sh       → versão pra distribuir: sem a fonte More Sugar (licença pessoal)
set -euo pipefail
cd "$(dirname "$0")"

VERSAO="${VERSAO:-0.1.0}"
BUILD_NUM="${BUILD_NUM:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}"
BUILD_DIR="${BUILD_DIR:-build}"
ARCHS="${ARCHS:-x86_64 arm64}"
APP="$BUILD_DIR/Kamurafy.app"
TMP="$BUILD_DIR/.obj"

rm -rf "$APP" "$TMP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$TMP"

bins=()
for arch in $ARCHS; do
  swiftc -O -whole-module-optimization -parse-as-library \
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
elif [ -f local/MoreSugar-Regular.woff2 ]; then
  cp local/MoreSugar-Regular.woff2 "$APP/Contents/Resources/ui/fonts/"
fi

# ícone: gerado uma vez a partir de tools/icone.swift
if [ -f tools/icone.swift ]; then
  if [ ! -f build/AppIcon.icns ] || [ tools/icone.swift -nt build/AppIcon.icns ]; then
    mkdir -p build
    tools/gerar-icone.sh build/AppIcon.icns >/dev/null
  fi
  cp build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
fi

codesign --force --sign "${ASSINATURA:--}" --timestamp=none "$APP" >/dev/null 2>&1 || codesign --force --sign - "$APP"
rm -rf "$TMP"
echo "$APP"
