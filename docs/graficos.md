# Gráficos e mascote (K.charts, K.mascot)

Biblioteca de gráficos no traço de cartum do Kamurafy. Arquivos: `ui/js/charts.js`,
`ui/js/mascote.js`, `ui/css/charts.css`. Vitrine com todos os casos: rota escondida
`#/galeria` (`tools/foto.sh galeria build/fotos/galeria.png 1180x7600`). Regras visuais
em `docs/design.md` (um eixo Y, área lavada, texto nunca na cor da série, dica ao passar o
mouse, "ver números", status sempre com ícone + texto).

## Regras que valem pra todas as funções

```js
const ch = K.charts.area(el, opts)   // el: elemento (ou seletor). Limpa o que havia nele.
ch.update({ points: novos })          // junta com as opções anteriores e redesenha
ch.destroy()                          // desliga ResizeObserver e dica; esvazia o el
```

- **Sempre** chame `destroy()` no `destroy()` da página (guarde os retornos numa lista).
  Montar um gráfico novo no mesmo `el` desmonta o anterior sozinho.
- Redesenha sozinho quando a largura do `el` muda (ResizeObserver). O `el` pode ser montado
  antes de entrar na tela: desenha quando ganhar largura.
- `update()` **junta** (`Object.assign`) com as opções atuais. Mande a série inteira de novo
  (`points` ou `series`), não só o ponto novo.
- Sem dados → `.empty` com a mensagem de `opts.empty` (tem texto padrão, mas escreva um que
  explique a situação: "Ainda sem histórico. O Kamurafy começa a anotar assim que fica aberto.").
- `null`/`NaN` nunca quebram: ponto com `y: null` vira buraco; item com `value: null` some.
- Texto de fora (nome de app, processo) entra só por `textContent`. Ícone só `data:image/…`.
- Cores: aceite `'var(--s1)'`, `'--s1'`, `'good'|'warn'|'serious'|'crit'|'gold'|'s1'|'s2'` ou hex.
  Série 1 = `--s1` (azul: carga, saúde), série 2 = `--s2` (laranja: energia, watts).
  Categorias em ordem fixa: `K.charts.palette` (validada pra daltonismo; nunca em ciclo).
- Movimento: entrada (revelar, crescer, ponteiro) só no primeiro desenho e desliga com
  `prefers-reduced-motion`, no modo foto (`html.snap`) e com a janela escondida.
- Formatação pt-BR: use `K.fmt.*` nos `format`. `K.charts.num(v, casas)` = número com
  vírgula e sinal de menos tipográfico ("−12,5").

---

## K.charts.area(el, opts) / K.charts.line(el, opts)

Mesma função; `area` pinta a área lavada (~12%) e por padrão inclui o zero no eixo Y.

| opção | tipo | padrão | o que faz |
|---|---|---|---|
| `points` | `[{x, y}]` | — | série única (x = Unix em segundos ou número). `y: null` = buraco |
| `name`, `color` | string | `''`, `--s1` | nome e cor da série única |
| `series` | `[{name, points, color?, dash?, area?, format?, endLabel?, dots?, width?}]` | — | 2+ séries (tem precedência sobre `points`). Série `dash: true` sem cor herda a cor da anterior |
| `height` | px | 220 | altura do gráfico (sem legenda) |
| `xType` | `'time'\|'number'` | automático | tempo se x > 1e8 |
| `xMin`, `xMax` | número | dos dados | janela fixa (ex.: `agora − 7 dias` → `agora`) |
| `xFormat` | `fn(x)` ou `'ago'` | pt-BR automático | rótulos do eixo X. `'ago'` = relativo ao último ponto ("−2 min", "agora") |
| `tipTitle` | `fn(x)` | automático | título da dica e 1ª coluna da tabela |
| `yMin`, `yMax` | número | redondo automático | trava o eixo (ex.: carga 0–100) |
| `yZero` | bool | `true` em area | inclui o 0 (use em watts) |
| `yTicks` | número | pela altura | quantas marcas (aprox.) |
| `yFormat` | `fn(v)` | número pt-BR | rótulos do eixo Y **e** da dica (se não houver `tipFormat`) |
| `tipFormat` | `fn(v, raw)` | `yFormat` | valor na dica, na tabela e no rótulo do último ponto |
| `refs` | `[{y, label?, short?, tone?, color?, align?, legend?, inDomain?}]` | — | linhas de referência tracejadas, rotuladas. `short` é usado quando o `label` não cabe ou tromba |
| `bands` | `[{from, to, label?, color?}]` | — | faixas de fundo (cinza claro). Com `label`, entram na legenda e na dica ("qua, 23:41 · Na tomada") |
| `bandStyle` | `'fundo'\|'track'` | fundo | `'track'`: as faixas viram uma fita dourada logo abaixo do eixo X (o fundo do gráfico fica limpo; é o que a carga dos 7 dias usa) |
| `gap` | segundos, `false` | 6× o intervalo mediano | distância que conta como buraco (Mac dormindo). `false` = nunca quebra |
| `gapStyle` | `'dots'\|'none'` | `'dots'` | buraco por distância vira ligação pontilhada fininha (sem área) |
| `gapLabel` | string | — | põe o pontilhado na legenda ("Mac dormindo") |
| `signs` | `[acima, abaixo]` | — | com valores negativos: "↑ entrando" / "↓ saindo" nos cantos |
| `legend` | bool | auto | automático: 2+ séries ou faixas com rótulo |
| `table` | `false` ou `{xLabel, order, xFormat, bandLabel, rows()}` | ligado | botão "Ver números". `order`: `'desc'` (tempo) / `'asc'`. `rows()` devolve `{head, rows}` próprio |
| `tooltip` | `fn(x, hits, padrão) → {title?, rows?}` | — | muda a dica. `hits = [{series, x, y, raw}]` (raw = seu objeto original) |
| `onHover` | `fn(x \| null, hits)` | — | avisa a página (ex.: destacar um cartão) |
| `empty` | string | "Ainda não há dados pra mostrar aqui." | mensagem sem dados |
| `ariaLabel` | string | nomes das séries | leitor de tela |

Rótulo do último ponto: ligado na 1ª série sólida (`endLabel: false` desliga; string ou
`fn(y, raw)` troca o texto). Rótulo comprido demais sobe pra cima do ponto.
Teclado: o gráfico é focável; ← → andam pelos pontos (Shift = 10%), Home/End, Esc.

### Carga dos últimos 7 dias (battery.history)

```js
const h = await K.api('battery.history', { dias: 7 })
const agora = Date.now() / 1000
charts.push(K.charts.area(box, {
  name: 'Carga',
  points: h.carga.map((p) => ({ x: p.t, y: p.pct })),
  yMin: 0, yMax: 100,
  yFormat: (v) => K.fmt.pct(v, 0),
  xMin: agora - 7 * 86400, xMax: agora,
  bands: K.charts.runs(h.carga, (p) => p.plugged, { label: 'Na tomada' }),
  gapLabel: 'sem leitura (Mac dormindo)',
  height: 240,
  empty: 'O macOS ainda não tem histórico de carga pra mostrar.',
}))
```

Dados `fonte: "macos"` são eventos do `pmset` (irregulares; dormindo aparecem de 2 em 2 h).
O `gap` automático (6× a mediana) + pontilhado mostra isso direito. Com dados `kamurafy`
(a cada 5 min) dá pra passar `gap: 1800`.

### Energia ao vivo (battery.now a cada 2 s)

```js
let pts = []
const ch = K.charts.line(box, {
  name: 'Energia', color: 'var(--s2)', points: pts,
  yZero: true,
  yFormat: (v) => (v > 0 ? '+' : '') + K.charts.num(v, 0) + ' W',
  tipFormat: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + K.fmt.watts(v),
  xFormat: 'ago',
  signs: ['entrando', 'saindo'],
  height: 200,
  empty: 'Medindo… o primeiro número chega em 2 segundos.',
})
timer = setInterval(async () => {
  const b = await K.api('battery.now')
  pts = pts.concat([{ x: b.readAt, y: b.watts }]).slice(-90)   // 3 min
  ch.update({ points: pts })
}, 2000)
```

A dica continua no lugar enquanto a linha anda (ela gruda no ponto mais perto).

### Saúde ao longo do tempo, com 80% e projeção

```js
const s = h.saude.map((d) => ({ x: d.t, y: d.healthPct }))
const series = [{ name: 'Saúde', points: s, format: (v) => K.fmt.pct(v, 1) }]
if (h.projection.dateTo80 && s.length) {
  const u = s[s.length - 1]
  series.push({ name: 'Projeção', dash: true, points: [u, { x: h.projection.dateTo80, y: 80 }],
                endLabel: '~' + K.fmt.monthYear(h.projection.dateTo80),
                format: (v) => '≈ ' + K.fmt.pct(v, 0) })
}
charts.push(K.charts.line(box, {
  series,
  yFormat: (v) => K.fmt.pct(v, 0),
  refs: [{ y: 80, label: '80% · a Apple considera gasta abaixo disso', short: '80%' }],
  tipTitle: K.fmt.day,
  height: 200,
}))
```

Com 1 ponto só, o gráfico mostra o ponto no meio de uma janela de ±3 dias e a linha de 80%.

---

## K.charts.bars(el, opts)

Barras horizontais (até 24 px, ponta arredondada, crescendo da linha de base), valor na ponta.

| opção | tipo | padrão | o que faz |
|---|---|---|---|
| `items` | `[{label, value, icon?, note?, color?}]` | — | `icon`: `data:image/...` (do Swift) ou nome de `K.ICONS`; sem ícone = quadradinho neutro |
| `format` | `fn(v, item)` | número pt-BR | valor na ponta, dica e tabela |
| `color` | cor | `--s1` | cor das barras (energia: `var(--s2)`) |
| `max` | número | maior valor | escala fixa (ex.: 100) |
| `valueName` | string | `''` | texto depois do valor na dica ("de impacto") |
| `share` | bool | `true` | dica mostra "% do total da lista" |
| `icons` | bool | auto | força/tira a coluna de ícones |
| `labelWidth` | px | 260 | largura máxima da coluna de nomes. A coluna de nomes ocupa 1,4 parte e as barras 1 parte; nome comprido quebra em até 2 linhas (sem "…") |
| `labelName` | string | `'Nome'` | cabeçalho da 1ª coluna da tabela ("App") |
| `thickness` | px | 20 | espessura (máx. 24) |
| `table` | bool | `false` | botão "Ver números" com a mesma lista em tabela (ligue sempre nas telas reais) |
| `empty` | string | "Nada pra mostrar agora." | lista vazia |

A ordem é a sua (ordene antes). Dica por barra (mouse e foco de teclado).

```js
const apps = await K.api('battery.energyApps', { limite: 8 })
charts.push(K.charts.bars(box, {
  items: K.energyItems(apps),   // limpa e junta a lista (ver Ajudantes)
  color: 'var(--s2)',
  valueName: 'de impacto', labelName: 'App', table: true,
  empty: 'Nenhum app gastando energia de verdade agora. Tudo calmo.',
}))
```

---

## K.charts.gauge(el, opts)

Mostrador semicircular desenhado à mão, ponteiro animado (com pulinho), zonas de status.

| opção | tipo | padrão | o que faz |
|---|---|---|---|
| `value` | número \| null | — | `null` = ponteiro apagado e "—" |
| `min`, `max` | número | 0, 100 | escala |
| `zones` | `[{to, tone, label?, icon?}]` | uma zona `s1` | em ordem crescente de `to`; `tone` = `good\|warn\|serious\|crit` |
| `format` | `fn(v)` | `"10%"` | número grande |
| `endFormat` | `fn(v)` | `format` | rótulos das pontas |
| `label` | string | — | legenda embaixo do número ("uso de CPU") |
| `pill` | bool | `true` | etiqueta de status (ícone + texto) da zona atual |
| `fill` | bool | `true` | pinta o arco até o valor na cor da zona (desligue pra ver as zonas inteiras) |
| `size` | px | 240 | largura máxima |
| `empty` | string | — | texto quando `value` é null |

Chamar `update({value})` a cada leitura só gira o ponteiro do valor anterior pro novo.

```js
/* processador alto um instante não é defeito: nunca vermelho */
const CPU = [{ to: 60, tone: 'good', label: 'Tranquilo' }, { to: 90, tone: 'warn', label: 'Trabalhando' },
             { to: 100, tone: 'serious', label: 'A todo vapor' }]
const g = K.charts.gauge(box, { value: s.cpu.usagePct, zones: CPU, label: 'uso de CPU' })
// saúde: min 60, zonas das regras do Swift
K.charts.gauge(box2, { value: b.healthPct, min: 60, max: 100, format: (v) => K.fmt.pct(v, 1),
  endFormat: (v) => v + '%', label: 'da capacidade de fábrica',
  zones: [{ to: 80, tone: 'serious', label: 'Gasta' }, { to: 85, tone: 'warn', label: 'De olho' },
          { to: 100, tone: 'good', label: 'Saudável' }] })
```

---

## K.charts.spark(el, values, opts)

Minilinha pra cartões de número. `values`: `[números]` ou `[{x, y}]` (null = buraco).

| opção | padrão | o que faz |
|---|---|---|
| `color` | `--s1` | cor |
| `height` | 40 | px |
| `min`, `max` | dos dados | escala fixa (CPU: 0–100) |
| `area` | `true` | área lavada |
| `ref` | — | linha tracejada fina (ex.: 0 W) |
| `format` | número | valor na dica |
| `labels` | — | títulos da dica por índice (ex.: horários) |
| `tipTitle` | — | `fn(x, i)` alternativo a `labels` |
| `name` | — | nome na dica |

`update(novosValores, novasOpts?)` ou `update({values, ...opts})`. Um valor só aparece na
ponta direita. Sem valores: `.empty` pequeno ("sem dados").

```js
const sp = K.charts.spark(el.querySelector('.spark'), temps, { color: 'var(--s2)', format: K.fmt.temp })
```

---

## K.charts.stack(el, opts)

Barra empilhada horizontal com folga de 2 px entre segmentos, rótulo dentro quando cabe,
legenda com valor e %, dica por segmento (a legenda também acende o segmento).

| opção | padrão | o que faz |
|---|---|---|
| `segments` | — | `[{name, value, color?, note?}]`; zeros/nulls somem |
| `total` | soma | total da barra (sobra fica em branco, ou vira segmento com `restName`) |
| `restName`, `restColor`, `restNote` | —, `--panel` | nome da sobra (ex.: "Livre") |
| `format` | número | valores |
| `height` | 30 | px |
| `inside` | `true` | nome dentro do segmento se couber (branco ou tinta pela cor) |
| `legend` | `true` | legenda embaixo |
| `table` | `false` | botão "Ver números" (a legenda já mostra tudo) |

```js
const m = s.memory
charts.push(K.charts.stack(box, {
  segments: [
    { name: 'Apps', value: m.appBytes, color: 'var(--s1)' },
    { name: 'Fixa', value: m.wiredBytes, color: '#4a3aa7', note: 'o sistema não solta' },
    { name: 'Comprimida', value: m.compressedBytes, color: 'var(--s2)' },
    { name: 'Cache', value: m.cachedBytes, color: '#1baf7a', note: 'o macOS devolve sozinho' },
    { name: 'Livre', value: m.freeBytes, color: 'var(--panel)' },
  ],
  total: m.totalBytes, restName: 'Outros',
  format: (v) => K.fmt.bytes(v),
}))
```

Essas 4 cores (azul, violeta, laranja, verde-água) passaram no validador de daltonismo nessa
ordem. O verde-água fica abaixo de 3:1 no branco: por isso o valor sempre aparece na legenda.

---

## K.charts.ring(el, opts)

Anel de progresso grosso, contorno à mão (disco, varredura).

| opção | padrão | o que faz |
|---|---|---|
| `value`, `max` | —, 100 | progresso; `null` = vazio com "—" |
| `tone` | `gold` | cor (`good`, `crit`, `s1`…) |
| `label` | — | texto pequeno dentro (some abaixo de 96 px) |
| `text` | `% de max` | troca o número do meio |
| `format` | `% de max` | `fn(value)` pro número do meio |
| `sub` | — | legenda embaixo do anel |
| `busy` | `false` | arco girando (progresso desconhecido) |
| `size` | 150 | px |
| `thickness` | 16 | espessura (em unidades de 100) |

```js
const r = K.charts.ring(box, { value: 0, tone: 'gold', label: 'varrendo', sub: 'Olhando os caches…' })
r.update({ value: 42 })                 // anima do valor anterior pro novo
K.charts.ring(box2, { value: d.usedBytes, max: d.totalBytes, tone: 's1', label: 'ocupado',
  sub: `${K.fmt.bytes(d.usedBytes)} de ${K.fmt.bytes(d.totalBytes)}` })
```

---

## K.mascot(el, {size, state}) → {set(estado), get(), destroy(), el}

A bateria sorridente do logo, grande e expressiva. Tudo animado em CSS/SVG (nada de laço em
JS): onda no líquido, respiração, piscada de vez em quando, bolhas quando carrega, zzz,
suor, estrelinhas. Desliga com `prefers-reduced-motion` e no modo foto.

```js
const m = K.mascot(box, { size: 240, state: { pct: 76, tone: 'good', charging: true, plugged: true } })
m.set({ pct: 77 })            // junta com o estado anterior; transições suaves
m.set({ hot: true })          // rosto suando por cima de tudo
m.destroy()
```

| estado | tipo | o que faz |
|---|---|---|
| `pct` | 0–100 \| null | altura do líquido (carga). `null` = corpo cinza vazio (sem leitura / Mac de mesa) |
| `tone` | `good\|warn\|serious\|crit\|none` | cor do líquido pela **saúde** (`K.batStatus(b).tone`). `none` = saúde sem leitura: líquido neutro, nada de verde |
| `charging` | bool | raio no peito, bolhas, cabo (o rosto sobe um pouco pra caber o raio) |
| `plugged` | bool | cabo na tomada |
| `full` | bool | com `plugged`: rosto dormindo com "z z" |
| `hot` | bool | suando, vapor, bochecha vermelha (temperatura ≥ 40 °C) |
| `face` | `happy\|worried\|sad\|cry\|sleep\|hot\|joy` \| null | força o rosto (`joy` = festa no fim da varredura) |
| `label` | string | troca o texto do leitor de tela (o padrão descreve o estado em pt-BR) |

Rosto automático (sem `face`): `hot` → suando; `full && plugged` → dormindo; senão pela
saúde: good → feliz, warn → preocupado, serious → triste, crit → chorando.
`size` é a largura em px (64 a 320 ficam bons; abaixo de 110 os enfeites menores somem).

Da leitura do Swift:

```js
const b = await K.api('battery.now')
const st = K.batStatus(b)   // sem saúde medida vira "Sem leitura" (tone 'none'), nunca "Saudável"
m.set({ pct: b.present ? b.percent : null, tone: st.tone, charging: b.isCharging,
        plugged: b.pluggedIn, full: b.pluggedIn && !b.isCharging && b.percent >= 99,
        hot: b.temperatureC >= 40 })
```

---

## Ajudantes

- `K.charts.runs(lista, teste, {x: 't', label, color, gap, keepPoints})` → faixas
  `[{from, to, label}]` juntando itens seguidos que passam no teste. Cada faixa vai até o
  próximo item (o estado durou até mudar). `gap` quebra a faixa em buracos maiores que isso.
- `K.charts.color(c)` → resolve `'var(--s1)'`/`'good'` pra hex.
- `K.charts.num(v, casas)` → "−12,5".
- `K.charts.palette` → cores categóricas em ordem fixa.
- `K.charts.soon(fn)` → próximo quadro, com timer de reserva (janela escondida não roda rAF).
- `K.energyItems(lista, {min})` (util.js) → itens de barras a partir do `battery.energyApps`:
  tira as ferramentas que o próprio Kamurafy roda (`top`, `pmset`…), soma o "Conteúdo da
  Internet de X" no X, marca o Kamurafy como "este app", troca nome que é só versão
  ("2.1.282") por "Processo sem nome" e escolhe ícone por nome (tela, som, nuvem).
- `K.readOr(node, v, fmt)` (util.js) → escreve o número, ou "sem leitura" apagado (classe
  `.no-read`) quando o valor falta. Nada de travessão preto no lugar de número.

## Testar

`tools/foto.sh galeria build/fotos/galeria.png 1180x7600` (e `1000x7600`, `1000x660`).
A janela do modo foto fica escondida: o relógio das animações CSS para ali. Pra ver um
quadro no meio da animação, tire a classe `snap`, redesenhe e pause tudo num tempo:

```bash
tools/foto.sh galeria build/fotos/meio.png 1180x2400 "(function(){document.documentElement.classList.remove('snap');Object.defineProperty(document,'hidden',{get:function(){return false}});K.pages.galeria.destroy();var v=document.querySelector('.page-galeria');v.innerHTML='';K.pages.galeria.render(v);setTimeout(function(){document.getAnimations().forEach(function(a){a.pause();a.currentTime=450})},200)})()"
```

Dica ao passar o mouse, na foto: dispare um `PointerEvent('pointermove')` no `.kc-svg`.
