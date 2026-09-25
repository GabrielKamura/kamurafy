# Ponte Swift ↔ interface

A interface (HTML/CSS/JS em `ui/`) roda num `WKWebView` servido em `kamurafy://app/`.
Ela conversa com o Swift por um único canal:

```js
const dados = await K.api('battery.now', { /* args */ })
```

Por baixo é `window.webkit.messageHandlers.kamurafy.postMessage({cmd, args})`. O Swift
responde com JSON (a Promise recebe uma string e o `K.api` já faz o `JSON.parse`). Erro vira
exceção com a mensagem em português.

- Toda data/hora é **Unix em segundos** (`Double`).
- Campo que o Mac não informa vem **ausente** (o JSONEncoder omite `nil`): na interface use
  sempre `v == null` (pega `undefined` também), nunca `=== null`.
- Texto que vem de fora e entra no DOM **só por textContent**: `energyApps[].name`,
  `disk.name` (nome que o usuário deu ao disco), `model`, `adapter.name`, `deviceName`,
  `manufacturer`, nomes de arquivo e de app da Faxina.
- A interface nunca usa `alert`/`confirm`/`prompt` (o WKWebView não mostra nada e o
  `confirm` devolve `false`): confirmação é um modal próprio em HTML.
- Ganchos de teste (modo foto, `KAMURAFY_UI_DIR`, inspetor) só existem na build de
  desenvolvimento (`-D KAMURAFY_DEV`, padrão do `./build.sh`); `PUBLICO=1` tira todos.
- Comando novo: registre no módulo Swift (`XxxModule.register`) e documente aqui.
- Testar sem interface: `build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --cmd <comando> '<json>'`
  (`--cmd list` lista todos).

## app.*

| comando | args | resposta |
|---|---|---|
| `app.ready` | — | `{ok}`. A casca chama depois do primeiro desenho; o modo foto espera por ele. |
| `app.log` | `{level, msg}` | `{ok}`. Já é chamado sozinho em erro de JS. |
| `app.version` | — | `{version, build, dev, publico}`. `publico: true` na build distribuível (a interface esconde módulos "em breve" e a galeria). |
| `window.drag` / `window.zoom` | — | arrasta/maximiza a janela (a casca cuida disso via `data-drag`) |
| `open.url` | `{url}` (só https) | abre no navegador padrão |
| `open.settings` | `{painel}`: `bateria` · `notificacoes` · `armazenamento` · `itens-login` · `privacidade-disco` | abre esse painel dos Ajustes do Sistema |

## notify.*

| comando | resposta |
|---|---|
| `notify.status` | `{permitido, estado}`; `estado`: `permitido` · `provisorio` · `negado` · `nao-pedido` · `indisponivel` |
| `notify.test` | manda um aviso de teste (se permitido) e devolve o mesmo que `notify.status` |

A permissão é pedida ao abrir o app. O banner aparece mesmo com o Kamurafy na frente.

## settings.*

`settings.get` → `AppSettings`. `settings.set` recebe só os campos que mudam e devolve tudo.

```json
{ "aviso80": true, "limiteAviso": 80, "avisoQuente": true, "som": true }
```

- `aviso80`: notifica quando a carga **cruza** `limiteAviso` (50–100) com o carregador ligado,
  uma vez por carga. Não avisa se o Carregamento Otimizado está segurando a carga. Mudar o
  limite rearma o aviso.
- `avisoQuente`: notifica com duas leituras seguidas ≥ 45 °C; só rearma abaixo de 42 °C.
- O app acorda a cada mudança de carga/tomada (aviso do macOS) e a cada minuto, também com
  a janela fechada.

## battery.now

Leitura instantânea (rápida, pode chamar a cada 2 s). Exemplo real (MacBook Pro 16" 2019):

```json
{
  "present": true,
  "percent": 99,               // carga como o macOS mostra
  "currentMah": 7447, "maxMah": 7895, "designMah": 8790,
  "healthPct": 89.8,           // saúde como o macOS mostra; oscila ±1–2 pontos a cada recalibração
                               // e pode passar de 100 em bateria nova
  "healthPctRaw": 89.8,        // capacidade bruta do medidor / fábrica (no Intel é igual)
  "cycles": 251, "designCycles": 1000,
  "temperatureC": 31,
  "voltageV": 12.684,
  "amperageMa": 611,           // + entrando na bateria, − saindo
  "watts": 7.7,                // + carregando, − gastando (0 quando cheia na tomada)
  "systemWatts": 44.5,         // quanto o Mac inteiro puxa agora (ausente se o medidor não diz)
  "isCharging": true, "pluggedIn": true, "fullyCharged": false,
  "finishingCharge": true,     // o macOS está terminando a carga devagar
  "optimizedChargingEngaged": false,
  "minutesToFull": 48,         // só carregando
  "minutesToEmpty": null,      // só na bateria
  "adapter": { "watts": 100, "voltageV": 20, "currentA": 5, "isWireless": false, "name": null },
  "cellsMv": [4228, 4227, 4229],
  "cellSpreadMv": 2,           // diferença entre a célula mais alta e a mais baixa
  "appleCondition": "normal",  // normal | revisao | falha | desconhecida
  "permanentFailure": false,
  "lowPowerMode": true,
  "thermalState": "morno",     // normal | morno | quente | critico (do Mac todo)
  "status": "saudavel",        // saudavel | de-olho | gasta | trocar | desconhecida | sem-bateria
  "readAt": 1790304193.29
}
```

Regra do `status` (Swift, `Battery.read`), sobre a saúde **amortecida** (mediana dos
últimos 7 pontos diários + a leitura de agora, pra não trocar de status a cada recalibração):
`trocar` se a Apple pede revisão ou há falha permanente · `desconhecida` se não há leitura de
saúde · `gasta` se < 80% · `de-olho` se < 85% ou ciclos ≥ 80% do projetado · senão `saudavel`.
Na interface: `K.batStatus(b)` → `{label, tone, icon}`.

Leituras fora de faixa (65535, célula fora de 1–5 V, temperatura > 90 °C) viram ausentes.
No Apple Silicon, `maxMah` segue `NominalChargeCapacity` e `healthPct` usa
`BatteryData.MaximumCapacityPercent` quando existe (o mesmo número dos Ajustes).

Mac sem bateria (desktop): `present: false`, `status: "sem-bateria"`, `percent: 0`,
`pluggedIn: true`, `designCycles: 1000`, `cellsMv: []` e o resto ausente.

## battery.info

Dados que não mudam (chame uma vez):

```json
{ "model": "MacBook Pro (16-inch, 2019)", "modelId": "MacBookPro16,1",
  "chip": "Intel Core i7-9750H", "isAppleSilicon": false,
  "deviceName": "bq40z651", "manufacturer": "SMP", "designCycles": 1000, "designMah": 8790 }
```

## battery.history

`args: { dias: 7 }` (1–30). Demora ~4 s na primeira chamada (lê o `pmset -g log`); depois fica em cache por 10 min.

```json
{
  "carga": [ { "t": 1789701708, "pct": 16, "plugged": false, "charging": null, "watts": null, "tempC": null, "fonte": "macos" }, ... ],
  "saude": [ { "dia": "2026-09-24", "t": 1790304193, "healthPct": 89.8, "maxMah": 7895, "designMah": 8790, "cycles": 251 } ],
  "projection": { "method": "ciclos", "cyclesTo80": 241, "wearPerCycle": 0.0406,
                  "dateTo80": null, "cyclesPerMonth": null, "daysOfData": 0 }
}
```

- `carga`: ordenado por `t`, sempre terminando na leitura de agora. `fonte: "macos"` vem do
  log do sistema (só carga e tomada, a cada dormir/acordar); `fonte: "kamurafy"` é medido
  pelo app (a cada 5 min, ou antes se a carga ou a tomada mudarem; com watts e temperatura).
  Cobre ~7 dias antes do app ser instalado. Mac sem bateria: `[]`.
- `saude`: um ponto por dia, gravado pelo app enquanto aberto. Começa com 1 ponto.
  Arquivo que não decodifica é guardado como `saude.quebrado-<t>.json`, nunca sobrescrito.
- `projection` usa a saúde amortecida. `method`:
  - `"historico"`: 30+ dias de dados com queda real → reta; `dateTo80` confiável.
  - `"ciclos"`: desgaste médio por ciclo até hoje → `cyclesTo80`. `dateTo80` só com 14+ dias
    e 5+ ciclos nesse período (precisa saber quantos ciclos por mês a pessoa faz).
  - `"sem-dados"`: bateria nova (menos de 50 ciclos ou saúde acima de 98%) ou sem leitura.

## battery.energyApps

`args: { limite: 8 }`. Leva ~1,5 s (duas amostras do `top`); o resultado fica 5 s em cache.
Cada processo é somado no app responsável (abas do Safari → Safari, helpers → o app, como o
Monitor de Atividade). O `top`/`pmset` que o próprio Kamurafy roda ficam de fora; o
Kamurafy em si aparece com `isSelf: true`.

```json
[ { "pid": 631, "name": "Firefox", "power": 85.5, "isApp": true, "isSystem": false, "isSelf": false, "icon": "data:image/png;base64,..." },
  { "pid": 138, "name": "Tela e janelas (WindowServer)", "power": 35.5, "isApp": false, "isSystem": true, "isSelf": false } ]
```

`power` é o "impacto energético" do Monitor de Atividade (sem unidade; só compara entre si).
`name` vem de fora: **sempre textContent**, nunca innerHTML.

## system.now

```json
{
  "cpu": { "usagePct": 10.4, "userPct": 7, "systemPct": 3.3, "cores": 12, "physicalCores": 6,
           "performanceCores": null, "efficiencyCores": null, "chip": "Intel Core i7-9750H" },
  "memory": { "totalBytes": 17179869184, "usedBytes": 13060431872, "appBytes": 9579110400,
              "wiredBytes": 2762805248, "compressedBytes": 718516224, "cachedBytes": 3396718592,
              "freeBytes": 722718720, "swapUsedBytes": 445644800, "pressure": "normal" },
  "disk": { "name": "Macintosh HD", "totalBytes": 499963174912, "freeBytes": 401751961600,
            "availableBytes": 403873202557, "usedBytes": 96089972355 },
  "uptimeSec": 174463.7, "model": "MacBook Pro (16-inch, 2019)", "modelId": "MacBookPro16,1",
  "macOS": "13.7.8", "thermalState": "morno", "readAt": 1790304193.7
}
```

- `cpu.usagePct` é a média desde a chamada anterior (a primeira mede 500 ms); chamadas com
  menos de 1 s de diferença recebem a mesma medida. `cores` são threads lógicas (12 num i7
  de 6 núcleos); `physicalCores` é o número de núcleos de verdade; no Apple Silicon vêm
  também `performanceCores` e `efficiencyCores`.
- `memory.usedBytes` = app + wired + compressed (igual ao "Memória usada" do Monitor de Atividade).
  `cachedBytes` é cache de arquivo que o macOS devolve sozinho: **não** conta como ocupado.
- `memory.pressure`: normal | atencao | critica.
- `disk.availableBytes` inclui o espaço que o macOS consegue liberar sozinho (purgeable).
  Bytes em base 10 (como o Finder): use `K.fmt.bytes`.

## cleanup.* (Faxina)

Regras (ver CLAUDE.md): a interface só manda **IDs** que o Swift devolveu numa varredura (o
caminho nunca sai da interface); tudo vai pra Lixeira; apagar de vez exige `confirmado: true`
e só vale pro que a Faxina mandou (ou esvaziar a Lixeira toda pelo Finder). IDs valem por 1 h
e morrem ao serem limpos. No terminal (`--cmd`/`--seq`) e no modo foto, limpar só funciona com
`KAMURAFY_FAXINA_HOME` (caixa de areia: pasta de mentira + "Lixeira" de mentira dentro dela;
`tools/faxina-teste.sh <pasta>` monta uma com armadilhas).

| comando | args | resposta |
|---|---|---|
| `cleanup.categories` | — | `[{id, titulo, descricao, precisaPermissao}]` — ids: `caches`, `dev`, `logs`, `sistema`, `downloads` |
| `cleanup.scan` | `{categoria}` | `CleanCategory` (~1 s cada; `downloads` faz o macOS pedir permissão da pasta na 1ª vez) |
| `cleanup.large` | `{minMB: 100}` | `{itens, bytes, incompleto, semAcesso, ms}` — Downloads, Mesa, Documentos, Filmes, Música, Imagens (até 40 s) |
| `cleanup.duplicates` | `{minMB: 1}` | `{grupos: [{id, bytesCada, desperdicio, itens}], desperdicio, incompleto, semAcesso, ms}` (até ~60 s) |
| `cleanup.clean` | `{ids: [...]}` | `{movidos: [{id, nome, bytes, lixeiraId}], falhas: [{id, nome, motivo}], bytes, caixaDeAreia}` |
| `cleanup.moved` | — | `{itens: [{id, nome, categoria, original, bytes, t, naLixeira}], bytes, caixaDeAreia}` (mais novo primeiro) |
| `cleanup.restore` | `{ids}` (ids de `moved`/`lixeiraId`) | `{ok, bytes, falhas}` — devolve ao lugar original |
| `cleanup.purge` | `{ids?, confirmado: true}` | `{ok, bytes, falhas}` — apaga de vez o que a Faxina mandou (sem ids = tudo) |
| `cleanup.trashInfo` | — | `{legivel, bytes?, itens?, daFaxina, caixaDeAreia}` (`legivel: false` = o macOS não deixou ver a Lixeira toda) |
| `cleanup.emptyTrash` | `{confirmado: true}` | `{ok}` — pede ao Finder (o macOS pode perguntar sobre Automação na 1ª vez) |
| `cleanup.reveal` | `{id}` | mostra o item no Finder |

`CleanItem`:
```json
{ "id": "…", "categoria": "caches", "nome": "com.spotify.client", "caminho": "~/Library/Caches/com.spotify.client",
  "bytes": 969900000, "arquivos": 812, "modificado": 1790300000, "usado": null,
  "selecionado": true, "nota": "O app recria sozinho quando precisar.",
  "app": "Spotify", "appAberto": false, "icon": "data:image/png;base64,…",
  "tipo": null, "grupo": null, "semAcesso": false }
```
- `selecionado`: sugestão do Swift (cache de app fechado, logs, programação conhecida). Caches
  do macOS, downloads, grandes e duplicados nunca vêm marcados. A interface aplica uma trava a
  mais (`K.cleanSuggested`, em `util.js`, usada na Faxina, na Varredura e no Painel pra os
  números baterem): item de `caches` sem `app` não vem marcado, porque costuma ser serviço do
  macOS sem o prefixo `com.apple` ou ferramenta de terminal rodando.
- `parcial` (opcional, planejado: a interface já entende): `true` quando parte da pasta não deu
  pra ler e `bytes` é só o mínimo. A linha mostra "parte sem acesso" e "pelo menos X".
- `appAberto: true` → o Swift **recusa** limpar (a interface deve desabilitar e dizer "feche o app").
- `tipo` (downloads/grandes/duplicados): `instalador` · `imagem-disco` · `imagem-protegida` ·
  `app` · `compactado` · `video` · `audio` · `imagem` · `documento` · `pasta` · `outro`.
- `parcial: true` = parte não deu pra ler (o tamanho é mínimo). `vinculo` (duplicados/grandes):
  `"link"` = mesmo arquivo com outro nome (apagar não libera espaço), `"clone"` = cópia do APFS
  que divide o espaço (libera quase nada). Nenhum dos dois conta no `desperdicio`.
- `CleanCategory.aviso`: quando a pasta da categoria não está no lugar exato (virou atalho),
  ela fica de fora e o motivo vem aqui.
- `DupGroup.nota`: aviso fixo do grupo (programas que usam o arquivo pelo caminho). A cópia
  que o Swift sugere manter vem **primeiro** (fora de Downloads/Mesa, a mais antiga, sem "cópia").
- Política do que vem marcado: só cache de app conhecido, fechado e sem mexida na última hora
  (15 min nos de programação); o que não volta sozinho vem desmarcado e com o custo na nota.
- Duplicados: o Swift recusa se o pedido deixaria um grupo sem nenhuma cópia; a interface
  deve impedir marcar todas (sugestão: manter a mais antiga, que vem primeiro).
- `nome`, `caminho` e `app` vêm de fora: só textContent. Na tela, caracteres que mudam a direção
  do texto (U+202E e parecidos) viram `�` e ganham a etiqueta "nome disfarçado"; no meio de uma
  frase o nome vai isolado (FSI…PDI).
- Números: `bytes` é espaço em disco de verdade (alocado), base 10 no `K.fmt.bytes`.
- `motivo` das falhas: frase curta em português, sem UUID nem caminho. A interface traduz os que
  conhece (`why()` em `faxina.js`) e tira UUID do que não conhece.
- As abas conversam: depois de um `cleanup.clean` que deu certo, a interface tira das outras abas
  o que tiver o mesmo `caminho` (ou estiver dentro dele) e avisa "a lista mudou". Um grupo de
  duplicados que fica com uma cópia só sai da lista, e essa cópia vira "última cópia" (Grandes
  e Downloads avisam antes de mandar ela também).
- Ganchos de teste da interface (`K.faxina.scan/clean/purge/emptyTrash…`, com `semConfirmar`)
  só existem na build de desenvolvimento: com `app.version.publico` eles somem.

## optimize.* (Otimizar)

Nada aqui apaga arquivo. No terminal e no modo foto, as ações que mudam algo são recusadas.

| comando | args | resposta |
|---|---|---|
| `optimize.startup` | — | `[StartupItem]` (ver abaixo), ~1 s |
| `optimize.startupToggle` | `{id, ligar}` | `{id, ligado, rodando}` — liga/desliga pelo launchctl (enable/disable + bootstrap/bootout); reversível |
| `optimize.heavy` | `{limite: 12}` | `[HeavyApp]` — CPU e memória somadas por app responsável |
| `optimize.quit` | `{id, forcar?}` | `{ok, mensagem}` — app: pede pra fechar (ele pode perguntar se quer salvar); forçar só se o usuário escolher |
| `optimize.tasks` | — | `[{id, titulo, descricao, quando, precisaSenha, demora}]` |
| `optimize.run` | `{id, confirmado: true}` | `{ok, mensagem}` — `dns` e `spotlight` pedem a senha pelo próprio macOS; `abrircom`, `dock`, `finder` não |

`StartupItem`: `{id, label, nome, app?, icon?, origem, ligado, rodando, editavel, arquivo?, programa?, nota?}`.
`origem`: `ajudante` (item de início de app, do launchd) · `agente` (~/Library/LaunchAgents) ·
`sistema` (/Library/Launch*, só leitura: mexer pede senha → `open.settings {painel:'itens-login'}`).

`HeavyApp`: `{id, nome, pid, cpu, memBytes, processos, app, sistema, proprio, icon?, respondendo}`.
`cpu` é % de um núcleo (pode passar de 100). `sistema: true` = o Kamurafy não encerra
(Finder, Dock, WindowServer, processos do macOS). `proprio: true` = o Kamurafy.

## uninstall.* (Desinstalar)

| comando | args | resposta |
|---|---|---|
| `uninstall.apps` | — | `[InstalledApp]`, maior primeiro (~8 s: mede cada app) |
| `uninstall.leftovers` | `{id}` | `CleanCategory` com `categoria: "restos"` (itens registrados como os da Faxina) |
| `uninstall.run` | `{id, restos: [ids], confirmado: true}` | `{app, appLixeiraId?, restos?: CleanResult, mensagem}` |

`InstalledApp`: `{id, nome, bundleId?, versao?, caminho, bytes, usado?, icon?, appStore, apple, aberto, local}`.
- App aberto é recusado ("feche antes"). App instalado pelo administrador (App Store, .pkg) vai
  pela Lixeira do Finder, que pede a senha.
- Sobras: só nomes **exatos** — pelo bundle id (vêm marcadas) ou pelo nome do app (vêm
  desmarcadas, "achado pelo nome: confira"). Pastas: Application Support, Caches, Preferences
  (+ByHost), Saved Application State, Logs, HTTPStorages, WebKit, Containers, Application
  Scripts, Cookies, LaunchAgents.
- O app desinstalado entra no `cleanup.moved` (categoria `app`) e o `cleanup.restore` devolve
  ele pra pasta Aplicativos.

## menubar.* (barra de menus)

| comando | args | resposta |
|---|---|---|
| `menubar.status` | — | `{abrirNoLogin, barra, porcentagem, soNaBarra}`; `abrirNoLogin`: `ligado` · `desligado` · `precisa-aprovar` · `indisponivel` |
| `menubar.loginItem` | `{ligar}` | mesmo formato (SMAppService: abrir o Kamurafy junto com o Mac) |
| `app.show` | `{rota?}` | abre a janela principal (na rota, se vier) e fecha o balão |
| `menubar.resize` | `{altura}` | ajusta a altura do balão (200–700) |

Configurações novas em `settings.*`: `iconeNaBarra` (padrão true), `porcentagemNaBarra` (true),
`soNaBarra` (false: com true, fechar a janela tira o Kamurafy do Dock e ele fica só no ícone).
O balão carrega `ui/menubar.html` (340 px de largura) com a mesma ponte (`K.api`); ele pode
chamar `K.menubar.refresh()` quando é aberto.
