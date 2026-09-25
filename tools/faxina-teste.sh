#!/bin/bash
# Monta uma "pasta do usuário" de mentira cheia de armadilhas pra testar a Faxina sem
# nunca tocar nos arquivos de verdade.
#   tools/faxina-teste.sh <pasta-da-caixa-de-areia>
# Depois:
#   KAMURAFY_FAXINA_HOME=<pasta> build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --seq '[["cleanup.scan",{"categoria":"caches"}],["cleanup.clean",{"ids":"$sel:0"}]]'
#   KAMURAFY_FAXINA_HOME=<pasta> tools/foto.sh faxina build/fotos/faxina.png 1180x2400
# A pasta <pasta>-fora guarda arquivos que NUNCA podem sumir (conferir no fim).
set -euo pipefail
cd "$(dirname "$0")/.."
SB="${1:?uso: tools/faxina-teste.sh <pasta dentro de /private/tmp ou \$TMPDIR>}"
# só pastas temporárias: o script apaga a pasta antes de montar
mkdir -p "$SB"
SB="$(cd "$SB" && pwd -P)"
case "$SB" in /private/tmp/?*/?*|/private/var/folders/?*/?*) ;; *) echo "use uma pasta dentro de /private/tmp ou \$TMPDIR (ex.: /private/tmp/kamurafy-teste/caixa)" >&2; exit 1 ;; esac
# só apaga o que já foi uma caixa de areia (tem a marca) ou está vazio
if [ -n "$(ls -A "$SB")" ] && [ ! -f "$SB/.kamurafy-caixa" ]; then echo "$SB já tem coisas e não é uma caixa de areia: não vou apagar" >&2; exit 1; fi
FORA="$SB-fora"   # um "fora" por caixa: uma caixa nunca apaga a prova de outra
if [ -e "$FORA" ] && [ ! -f "$FORA/.kamurafy-caixa" ]; then echo "$FORA já existe e não é da caixa de areia: não vou apagar" >&2; exit 1; fi
rm -rf "$SB" "$FORA"
mkdir -p "$SB"/{Library/Caches,Library/Logs,Library/Developer/Xcode,.npm,.cache,Downloads,Documents,Desktop,Movies} "$FORA/importante"
touch "$SB/.kamurafy-caixa" "$FORA/.kamurafy-caixa"
mkdir -p build
[ build/addedtime -nt tools/addedtime.c ] || clang -O2 -o build/addedtime tools/addedtime.c
echo "NAO PODE SUMIR" > "$FORA/importante/segredo.txt"
rnd() { head -c "$2" /dev/urandom > "$1"; }
# caches de apps (inclui um que "parece" app aberto: com.apple.finder, que está sempre aberto)
# e pastas que parecem cache mas guardam dado de verdade (JetBrains Local History, Deno KV, Poetry venvs)
mkdir -p "$SB/Library/Caches/JetBrains/IntelliJIdea2024.1/"{caches,LocalHistory} "$SB/Library/Caches/deno/"{deps,location_data/abc} "$SB/Library/Caches/pypoetry/"{cache,virtualenvs/proj-py3.11}
echo idx > "$SB/Library/Caches/JetBrains/IntelliJIdea2024.1/caches/i"; echo HISTORICO > "$SB/Library/Caches/JetBrains/IntelliJIdea2024.1/LocalHistory/h"
echo dep > "$SB/Library/Caches/deno/deps/d"; echo KV > "$SB/Library/Caches/deno/location_data/abc/kv.sqlite3"
echo pkg > "$SB/Library/Caches/pypoetry/cache/p"; echo VENV > "$SB/Library/Caches/pypoetry/virtualenvs/proj-py3.11/pyvenv.cfg"
mkdir -p "$SB/.cache/huggingface/hub"; echo TOKEN > "$SB/.cache/huggingface/token"; echo modelo > "$SB/.cache/huggingface/hub/m"
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
printf 'encrcdsa' > "$SB/Downloads/cofre.dmg"; rnd "$SB/Downloads/cofre-resto.bin" 1; cat "$SB/Downloads/cofre-resto.bin" >> "$SB/Downloads/cofre.dmg"; rm "$SB/Downloads/cofre-resto.bin"; touch -t 202501010000 "$SB/Downloads/cofre.dmg"
mkdir -p "$SB/Downloads/projeto-antigo/.git"; echo x > "$SB/Downloads/projeto-antigo/main.py"; touch -t 202501010000 "$SB/Downloads/projeto-antigo"
build/addedtime 1735700400 "$SB/Downloads/instalador-velho.dmg" "$SB/Downloads/nota-antiga.pdf" "$SB/Downloads/cofre.dmg" "$SB/Downloads/projeto-antigo"
rnd "$SB/Downloads/recente.zip" 200000
ln -s "$FORA/importante/segredo.txt" "$SB/Downloads/atalho.txt"
# grandes e duplicados
rnd "$SB/Movies/video-grande.mov" 160000000
cp "$SB/Movies/video-grande.mov" "$SB/Desktop/video-grande copia.mov"
rnd "$SB/Documents/planilha.xlsx" 2000000; cp "$SB/Documents/planilha.xlsx" "$SB/Downloads/planilha (1).xlsx"
ln "$SB/Documents/planilha.xlsx" "$SB/Documents/hardlink-da-planilha.xlsx"   # hard link: não é duplicado
touch -t 202401010000 "$SB/Downloads/planilha (1).xlsx"
# tudo "velho" (senão a regra de "mexido há pouco" desmarca tudo)
find "$SB/Library" "$SB/.npm" "$SB/.cache" -exec touch -h -t 202501010000 {} + 2>/dev/null || true
echo "$SB"
