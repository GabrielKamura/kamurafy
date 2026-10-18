# Visual do Kamurafy

**Uma frase:** o fluxo de um otimizador de Mac profissional (menu lateral, um botão grande de
escanear, resultados que aparecem animados, gráficos ricos), desenhado como um caderno de
cartum: papel claro, tinta preta grossa, sombra dura deslocada, amarelo-ouro de destaque e
um mascote (a bateria sorridente).

A referência de estilo é o site Moneysniper do dono (tinta preta, papel, ouro `#ffd23f`,
vermelho `#dc2626`, fonte More Sugar, rabiscos no fundo, animações de pulo e balanço).
A referência de **fluxo** é o CleanMyMac. **Nunca** copie arte, ícones, ilustrações, nomes de
módulos com marca, textos ou paleta do CleanMyMac. Queremos a mesma qualidade, com cara própria.

## Tokens (ui/css/base.css)

| papel | token | valor |
|---|---|---|
| tinta | `--ink` | `#000` |
| texto 2º / apagado | `--ink-2` / `--ink-3` | `#374151` / `#6b7280` |
| fundo da janela | `--paper` | `#fffdf8` |
| cartão, gráfico | `--card` | `#fff` |
| área neutra | `--panel` | `#f5f3ee` |
| grade dos gráficos | `--line` | `#e7e4dc` |
| destaque | `--gold` / `--gold-soft` | `#ffd23f` / `#fff1b8` |
| status bom / atenção / sério / crítico | `--st-good` `--st-warn` `--st-serious` `--st-crit` | `#0ca30c` `#fab219` `#ec835a` `#d03b3b` (+ `-soft`) |
| série 1 (carga, saúde) | `--s1` | `#2a78d6` |
| série 2 (energia, watts) | `--s2` | `#eb6834` |
| borda | `--bw` / `--bw-thick` | 3px / 4px |
| sombra dura | `--shadow` / `-sm` / `-xs` | 6/4/2px deslocada, sem desfoque |
| cantos | `--radius` / `--radius-sm` | 20px / 12px |

Fonte: `var(--font)` = More Sugar (só na build local) → Fredoka (livre, é a que vai na versão
pública `PUBLICO=1`) → sistema. Hierarquia vem de **tamanho**. Sem negrito falso:
`html { font-synthesis: none }` (a More Sugar tem um peso só). Títulos (`h1`–`h3`), números
grandes, botões, abas e o nome na barra lateral ficam em **600** (lista em `base.css`): na
Fredoka isso usa o arquivo 600 de verdade e o cartum não fica fino; na More Sugar não muda nada.
Texto corrido fica no 400 do CSS (o arquivo 500 da Fredoka). Número grande novo? Ponha a classe
dele na lista do `base.css`.

**Toda tela é aprovada nas duas fontes.** Quem baixa o app vê a Fredoka: tire as fotos também
com `tools/cenarios/fredoka.js` (injeta `--font: 'Fredoka'`):
`tools/foto.sh bateria x.png 1180x2000 "$(sed 's/__EXTRA__//' tools/cenarios/fredoka.js)"`.

## Componentes (ui/css/components.css)

Use antes de inventar: `.card` (+ `.gold`, `.ink`, `.panel`, `.flat`), `.card-head`, `.btn`
(+ `.gold`, `.ink`, `.small`, `.ghost`, `.danger`; ocupado sem perder o foco: `aria-disabled="true"`),
`.status` (+ `.good/.warn/.serious/.crit`, `.big`) **sempre com ícone + texto** (`K.statusPill`),
`.sticker` (+ `.has-ic` com ícone), `.live-badge`, `.stat-label/.stat-value/.stat-sub`,
`.hero-value`, `.tile` + `.tile-icon`, `.meter` + `.meter-fill`, `.switch` (`aria-checked`),
`.setting`, `.tip`, `.table`, `.legend`, `.loading`, `.empty`, `.no-read`, abas `.ktabs > .ktab`
(+ `.ktab-badge`, `.warn`), grade `.grid.cols-2/3/4`, `.span-2`, `.row`, `.stack`.

Página: `<header class="page-head" data-drag>` com `h1` (44px) + `p`, depois conteúdo.
`data-drag` marca áreas vazias por onde se arrasta a janela. No canto direito do cabeçalho só
entram **duas peças**: `.sticker` (ouro, −3°) pra um fato ("15 apps · 9,0 GB · 4 abertos",
"modo de teste", o modelo do Mac) e `.live-badge` pro que é ao vivo. Promessa ("nada aqui apaga
arquivo seu") vai no subtítulo.

Estados (iguais em todas as telas):
- **erro**: `K.errorCard({title, reason, retry, retryHint})` — rosa, mascote preocupado, "O motivo:
  X. Nada foi mexido." e botão ouro "Tentar de novo" com a dica de quanto demora. Dentro de um
  cartão, `compact: true` (sem mascote). Tela que só lê e tenta sozinha passa `text` próprio
  ("… Tento de novo sozinho em instantes."). Nunca parênteses dentro de parênteses.
- **sem leitura**: `K.readOr` / `.no-read` ("medindo…", "sem leitura" apagado), nunca "—" preto.
- **vazio**: caixa tracejada com mascote, na largura toda do painel.
- **recarregar**: "Escanear de novo" só na Varredura; nas listas, "Procurar de novo".
- Tela que se refaz inteira com o foco dentro dela: `K.keepFocus(raiz, pintar, fallback)`.

Nomes que valem pra todas as telas: a lista do que o app mandou pra Lixeira é "O que o Kamurafy
mandou" (em Faxina › Lixeira); "Lixeira" sozinha é só a do macOS. Memória sempre em base 2
(`K.fmt.mem`: "16 GB", como a Apple); disco e arquivos em base 10 (`K.fmt.bytes`, como o Finder).
Núcleos: `K.fmt.cores` ("6 núcleos (12 linhas de execução)"). Processo do macOS com nome técnico:
`K.procName` ("Tela e janelas (WindowServer)"). App com janela é app, mesmo sendo da Apple
("app da Apple"), nunca "do sistema".

JS: monte DOM com `K.el(tag, attrs, ...filhos)` (texto vai por textContent). Ícone:
`K.icon('nome')` (lista em `ui/js/icons.js`; pode acrescentar ícones no mesmo traço:
viewBox 24, `stroke-width` 2.3, pontas redondas, `currentColor`). Números: `K.fmt.*`.
Som: `K.sound.plop()` no clique importante, `.tada()` ao terminar varredura, `.tick()` em
passos, `.oops()` em erro. Nada de som em hover.

## Movimento

Entrada dos cartões com `.pop-in` escalonado (`style.animationDelay`), números com
`K.countUp`, mascote piscando e respirando, botão de escanear com `.pulse`. Hover levanta
(`translate(-2px,-2px)` + sombra maior), clique afunda. Tudo desliga com
`prefers-reduced-motion` e no modo foto (`html.snap`, que também zera todas as transições em
`base.css`: com a janela fora da vista o relógio para e a transição ficaria presa no primeiro
quadro). No modo foto, roteiro longo (mais de ~15 s de ações) fica lento: quebre em fotos menores.

## Gráficos (regras que valem mesmo no estilo cartum)

- O traço "desenhado à mão" usa rough.js (`ui/vendor/rough.js`) com **aspereza baixa**
  (0,5–1) e `seed` fixa, pra não tremer a cada redesenho. Linhas de dados 2,5px; grade em
  fio fino reto (`--line`), nunca tracejada; eixos discretos.
- Área = cor da série com ~12% de opacidade (lavado, nunca bloco saturado). Nada de hachura
  como enfeite.
- **Um eixo Y só.** Duas medidas de escala diferente = dois gráficos.
- Série única não precisa de legenda (o título diz o que é). 2+ séries: legenda sempre.
- Texto nunca na cor da série: valores e rótulos em `--ink`/`--ink-2`/`--ink-3`; a cor vai
  na marca ao lado.
- Rotular com parcimônia: o último ponto, o extremo, a linha de referência (ex.: "80%").
- Todo gráfico tem **dica ao passar o mouse** (linha vertical que gruda no ponto mais perto
  em linha/área; dica por barra em barras) via `K.tooltip.show(x, y, título, linhas)`, e um
  botão "ver números" que mostra a mesma informação em `.table`.
- Status (bom/atenção/crítico) só com as cores `--st-*` e sempre com ícone + texto.
- Número herói (a saúde da bateria) ≥ 56px, um só por tela.
- Barras até 24px de espessura, ponta arredondada, crescendo de uma linha de base.

## Mascote

A bateria sorridente do logo, grande, com:
- líquido interno na altura da carga, com onda animada; cor pelo status da **saúde**;
- rosto que muda: feliz (saudável), preocupado (de olho), triste (gasta/trocar), dormindo
  (carga 100% na tomada), suando (temperatura ≥ 40 °C);
- raio no peito quando carregando; bochechas rosadas (`--pink`).

## Texto

Português do Brasil, com todos os acentos. Tom de amigo que entende do assunto: direto,
leve, sem gíria forçada e sem jargão ("capacidade de fábrica", não "design capacity").
Sempre explique o que um número quer dizer ("A Apple considera gasta abaixo de 80%").
Nunca prometa milagre (nada de "deixa seu Mac 2× mais rápido").

## Modo escuro ("caderno à noite")

O app segue a aparência do macOS ou a escolha dos Ajustes (`settings.tema`: auto · claro · escuro); o
Swift muda a aparência do app e o CSS responde em `@media (prefers-color-scheme: dark)`, sempre no fim
de cada arquivo. Papel `#1c1915`, cartão `#27231d`, tinta creme `#f3ead6`, ouro igual. A sombra dura
vira creme. Os cartões dourados grandes guardam o visual claro por dentro. Cor nova: use um token do
`base.css` (com valor no claro e no escuro), nunca hex solto. O balão da barra de menus é sempre claro.
Foto no escuro: `KAMURAFY_TEMA=escuro tools/foto.sh …`.

## Idiomas

O texto do código é a chave, em português: `K.t('Frase com {0}', valor)` no JS e `L("Frase com {0}", valor)`
no Swift. A tradução mora em `ui/i18n/en.json` e `ui/i18n/es.json`. Frase inteira com variável, nunca
pedaços colados. Texto que o código compara (status, id, mensagem do Swift) não passa pelo `K.t` na
origem: compare o original e traduza só na hora de mostrar. Depois de mexer em texto:
`node tools/i18n-faltando.mjs` mostra o que falta traduzir. Foto em outro idioma:
`KAMURAFY_IDIOMA=en tools/foto.sh …`.
