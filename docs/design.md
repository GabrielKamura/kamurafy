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

Fonte: `var(--font)` = More Sugar (só na build local) → Fredoka (livre) → sistema. Um peso
só, sem negrito falso: hierarquia vem de **tamanho**, não de peso.

## Componentes (ui/css/components.css)

Use antes de inventar: `.card` (+ `.gold`, `.ink`, `.panel`, `.flat`), `.card-head`, `.btn`
(+ `.gold`, `.ink`, `.small`, `.ghost`), `.status` (+ `.good/.warn/.serious/.crit`, `.big`)
**sempre com ícone + texto** (`K.statusPill`), `.sticker`, `.stat-label/.stat-value/.stat-sub`,
`.hero-value`, `.tile` + `.tile-icon`, `.meter` + `.meter-fill`, `.switch` (`aria-checked`),
`.setting`, `.tip`, `.table`, `.legend`, `.loading`, `.empty`, `.error-box`, grade
`.grid.cols-2/3/4`, `.span-2`, `.row`, `.stack`.

Página: `<header class="page-head" data-drag>` com `h1` (44px) + `p`, depois conteúdo.
`data-drag` marca áreas vazias por onde se arrasta a janela.

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
