#!/bin/bash
# Gera o ícone do Kamurafy (.icns) a partir de tools/icone.swift, sem Xcode.
#   tools/gerar-icone.sh build/AppIcon.icns
# Compila o desenhista (swiftc), gera o .iconset (16 a 512 @2x) numa pasta temporária e
# junta tudo com o iconutil. O build.sh chama isto quando tools/icone.swift muda.
# Pra conferir os tamanhos pequenos: swiftc tools/icone.swift -o /tmp/icone && /tmp/icone --folha x.png
set -euo pipefail

SAIDA="${1:?uso: tools/gerar-icone.sh <saida.icns>}"
case "$SAIDA" in
  /*) ;;
  *) SAIDA="$PWD/$SAIDA" ;;
esac
case "$SAIDA" in
  *.icns) ;;
  *) echo "gerar-icone: a saída precisa terminar em .icns ($SAIDA)" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
TMP="$(mktemp -d "${TMPDIR:-/tmp}/kamurafy-icone.XXXXXX")"
trap 'rm -rf "$TMP" "$SAIDA.$$.icns"' EXIT

swiftc -O tools/icone.swift -o "$TMP/icone"
"$TMP/icone" "$TMP/AppIcon.iconset"
mkdir -p "$(dirname "$SAIDA")"
# grava ao lado e troca de uma vez: builds em paralelo nunca copiam um .icns pela metade
iconutil -c icns "$TMP/AppIcon.iconset" -o "$SAIDA.$$.icns"
mv -f "$SAIDA.$$.icns" "$SAIDA"
echo "$SAIDA"
