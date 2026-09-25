# Contribuindo com o Kamurafy

Obrigado por querer ajudar! O Kamurafy mexe em arquivos das pessoas, então algumas regras
não se negociam.

## Regras duras

1. **A Faxina nunca apaga sem a pessoa ver e confirmar.** Tudo vai pra Lixeira, com desfazer.
   Apagar de vez só o que a Faxina mandou pra lá (ou esvaziar a Lixeira pelo Finder), sempre
   com uma confirmação que diz que não tem volta.
2. **A interface não é confiável.** Ela só manda IDs que o Swift devolveu numa varredura; o
   caminho nunca vem dela. O Swift confere tudo de novo antes de mexer.
3. **Mover e apagar é por descritor** (`app/Sources/SafeFS.swift`): pasta aberta sem seguir
   links simbólicos, item conferido pelo inode antes e depois. Nada de `removeItem`/`rm` pelo
   caminho.
4. **Só pastas conhecidas** dentro da pasta do usuário, existindo exatamente no lugar esperado
   (sem atalho no caminho) e no mesmo disco. Sem sudo e sem helper com privilégio.
5. **Na dúvida, desmarcado.** Só vem marcado o que tem dono conhecido, está fechado e não foi
   mexido há pouco. Arquivo pessoal (downloads, grandes, duplicados) nunca vem marcado.
6. **Texto de fora entra no DOM só por `textContent`** (nomes de app, de processo, de arquivo).
7. **Honestidade:** nada de prometer "deixa seu Mac 2× mais rápido". Explique o que cada número
   quer dizer e o que não dá pra desfazer.

## Compilar

Bastam as ferramentas de linha de comando da Apple (sem Xcode):

```bash
ARCHS=x86_64 BUILD_DIR=build/dev ./build.sh    # build de desenvolvimento (rápida)
./build.sh                                      # universal (Intel + Apple Silicon)
PUBLICO=1 ./build.sh                            # versão distribuível, sem ganchos de teste
```

## Testar

- `build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --cmd <comando> '<json>'` roda um comando da
  ponte (`--cmd list` lista todos). Contrato em [`docs/ponte.md`](docs/ponte.md).
- `tools/foto.sh <rota> <saida.png> [LxA] ['js']` fotografa uma tela sem abrir janela na frente
  (a interface vem direto de `ui/`). Erros de JS aparecem como `[js:error]`.
- `tools/cenario.sh <cenário> <rota> <saida.png>` troca a ponte por dados de mentira pra ver
  estados difíceis (sem bateria, quente, gasta...). Cenários em `tools/cenarios/`.
- **Limpeza só na caixa de areia:** `tools/faxina-teste.sh /private/tmp/kamurafy-teste/caixa`
  monta uma pasta do usuário de mentira cheia de armadilhas; depois
  `KAMURAFY_FAXINA_HOME=/private/tmp/kamurafy-teste/caixa build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --seq '[["cleanup.scan",{"categoria":"caches"}],["cleanup.clean",{"ids":"$sel:0"}]]'`.
  No terminal e no modo foto, limpar sem a caixa de areia é recusado.

Visual e regras dos gráficos em [`docs/design.md`](docs/design.md) e [`docs/graficos.md`](docs/graficos.md).
