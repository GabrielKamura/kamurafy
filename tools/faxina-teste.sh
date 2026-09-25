#!/bin/bash
# Monta uma "pasta do usuário" de mentira cheia de armadilhas pra testar a Faxina sem
# nunca tocar nos arquivos de verdade.
#   tools/faxina-teste.sh <pasta-da-caixa-de-areia>
# Depois:
#   KAMURAFY_FAXINA_HOME=<pasta> build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --seq '[["cleanup.scan",{"categoria":"caches"}],["cleanup.clean",{"ids":"$sel:0"}]]'
#   KAMURAFY_FAXINA_HOME=<pasta> tools/foto.sh faxina build/fotos/faxina.png 1180x2400
# A pasta <pasta>/../fora-da-caixa guarda arquivos que NUNCA podem sumir (conferir no fim).
set -euo pipefail
SB="${1:?uso: tools/faxina-teste.sh <pasta>}"
case "$SB" in /|/Users|/Users/*/|"$HOME"|"$HOME/") echo "não use a pasta do usuário de verdade" >&2; exit 1 ;; esac
SB="$(mkdir -p "$SB" && cd "$SB" && pwd -P)"
case "$SB" in "$HOME"|"$HOME"/Library*|"$HOME"/Documents*|"$HOME"/Desktop*|"$HOME"/Downloads*) echo "escolha uma pasta de teste, fora das suas pastas pessoais" >&2; exit 1 ;; esac
FORA="$(dirname "$SB")/fora-da-caixa"
rm -rf "$SB" "$FORA"
mkdir -p "$SB"/{Library/Caches,Library/Logs,Library/Developer/Xcode,.npm,.cache,Downloads,Documents,Desktop,Movies} "$FORA/importante"
echo "NAO PODE SUMIR" > "$FORA/importante/segredo.txt"
rnd() { head -c "$2" /dev/urandom > "$1"; }
# caches de apps (inclui um que "parece" app aberto: com.apple.finder, que está sempre aberto)
mkdir -p "$SB/Library/Caches/"{com.spotify.client,Firefox,com.exemplo.App/sub,com.apple.Music,com.apple.finder,CloudKit,com.apple.bird,pip,node-gyp,GeoServices}
rnd "$SB/Library/Caches/com.spotify.client/data.bin" 4000000
rnd "$SB/Library/Caches/Firefox/cache2.bin" 3000000
rnd "$SB/Library/Caches/com.exemplo.App/sub/a.bin" 2000000
rnd "$SB/Library/Caches/com.apple.Music/m.bin" 500000
rnd "$SB/Library/Caches/com.apple.finder/f.bin" 300000
rnd "$SB/Library/Caches/CloudKit/nao-mexer.bin" 500000
rnd "$SB/Library/Caches/com.apple.bird/nao-mexer.bin" 500000
rnd "$SB/Library/Caches/pip/p.bin" 1500000
rnd "$SB/Library/Caches/node-gyp/n.bin" 700000
rnd "$SB/Library/Caches/GeoServices/g.bin" 200000
# armadilhas: links simbólicos pra fora, nomes esquisitos
ln -s "$FORA/importante" "$SB/Library/Caches/link-pra-fora"
ln -s "$FORA/importante" "$SB/Library/Caches/com.exemplo.App/link-dentro"
ln -s "$FORA" "$SB/Library/Logs/logs-fora"
mkdir -p "$SB/Library/Caches/com.acentuação e espaço"; rnd "$SB/Library/Caches/com.acentuação e espaço/x" 100000
mkdir -p "$SB/Library/Caches/..hidden-dots"; rnd "$SB/Library/Caches/..hidden-dots/y" 100000
# logs
mkdir -p "$SB/Library/Logs/"{DiagnosticReports,MeuApp}; echo crash > "$SB/Library/Logs/DiagnosticReports/a.crash"; echo log > "$SB/Library/Logs/MeuApp/x.log"
# programação
mkdir -p "$SB/.npm/_cacache" "$SB/Library/Developer/Xcode/DerivedData/Proj" "$SB/.cache/uv" "$SB/.cache/ferramenta-x"
rnd "$SB/.npm/_cacache/c.bin" 2500000; rnd "$SB/Library/Developer/Xcode/DerivedData/Proj/b.o" 1200000
rnd "$SB/.cache/uv/u.bin" 600000; rnd "$SB/.cache/ferramenta-x/z.bin" 300000
# downloads esquecidos (datas antigas) e recentes
rnd "$SB/Downloads/instalador-velho.dmg" 3000000; touch -t 202501010000 "$SB/Downloads/instalador-velho.dmg"
rnd "$SB/Downloads/nota-antiga.pdf" 200000; touch -t 202503010000 "$SB/Downloads/nota-antiga.pdf"
rnd "$SB/Downloads/recente.zip" 200000
ln -s "$FORA/importante/segredo.txt" "$SB/Downloads/atalho.txt"
# grandes e duplicados
rnd "$SB/Movies/video-grande.mov" 160000000
cp "$SB/Movies/video-grande.mov" "$SB/Desktop/video-grande copia.mov"
rnd "$SB/Documents/planilha.xlsx" 2000000; cp "$SB/Documents/planilha.xlsx" "$SB/Downloads/planilha (1).xlsx"
ln "$SB/Documents/planilha.xlsx" "$SB/Documents/hardlink-da-planilha.xlsx"   # hard link: não é duplicado
touch -t 202401010000 "$SB/Downloads/planilha (1).xlsx"
echo "$SB"
