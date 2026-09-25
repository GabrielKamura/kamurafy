#!/bin/bash
# Foto de uma tela com a ponte trocada por dados de mentira (estados difíceis de reproduzir).
#   tools/cenario.sh <cenario|arquivo.js> <rota> <saida.png> [LARGURAxALTURA] [js-extra]
# Cenários em tools/cenarios/: carregando, erro, faltando, gasta, nabateria, quente, semBateria, trocar.
# O arquivo do cenário pode ter o marcador __EXTRA__ (troca pelo js-extra, ex.: 'K.scan()').
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f "$1" ]; then C=$(cat "$1"); else C=$(cat "tools/cenarios/$1.js"); fi
EXTRA="${5:-}"
C="${C/__EXTRA__/$EXTRA}"
tools/foto.sh "$2" "$3" "${4:-1180x2800}" "$C"
