#!/bin/bash
# Tira uma foto de uma tela do Kamurafy sem abrir janela na frente do usuário.
#   tools/foto.sh <rota> <saida.png> [LARGURAxALTURA] [js-antes-da-foto]
# Usa a interface direto de ui/ (não precisa recompilar pra mudança de HTML/CSS/JS).
# Precisa de um app compilado em build/dev (ARCHS=x86_64 BUILD_DIR=build/dev ./build.sh).
# Erros de JS aparecem no terminal como [js:error]; arquivo da interface que não existe, como [ui:404].
# O app sai sozinho se a interface não avisar app.ready em 25 s, ou se a foto não sair.
set -euo pipefail
cd "$(dirname "$0")/.."
ROTA="${1:-inicio}"
SAIDA="${2:-build/foto-$ROTA.png}"
TAM="$(echo "${3:-1180x780}" | tr X x)"
ACAO="${4:-}"
APP="${APP:-build/dev/Kamurafy.app}"
[ -x "$APP/Contents/MacOS/Kamurafy" ] || { echo "falta $APP — rode: ARCHS=x86_64 BUILD_DIR=build/dev ./build.sh" >&2; exit 1; }
case "$SAIDA" in /*) ABS="$SAIDA" ;; *) ABS="$PWD/$SAIDA" ;; esac
mkdir -p "$(dirname "$ABS")"
KAMURAFY_UI_DIR="$PWD/ui" KAMURAFY_SNAPSHOT="$ABS" KAMURAFY_ROUTE="$ROTA" KAMURAFY_SIZE="$TAM" \
  KAMURAFY_WAIT="${ESPERA:-1500}" KAMURAFY_ACTION="$ACAO" "$APP/Contents/MacOS/Kamurafy"
