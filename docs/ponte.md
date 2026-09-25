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
- Campo que o Mac não informa vem **ausente ou `null`**: a interface sempre trata isso.
- Comando novo: registre no módulo Swift (`XxxModule.register`) e documente aqui.
- Testar sem interface: `build/dev/Kamurafy.app/Contents/MacOS/Kamurafy --cmd <comando> '<json>'`
  (`--cmd list` lista todos).

## app.*

| comando | args | resposta |
|---|---|---|
| `app.ready` | — | `{ok}`. A casca chama depois do primeiro desenho; o modo foto espera por ele. |
| `app.log` | `{level, msg}` | `{ok}`. Já é chamado sozinho em erro de JS. |
| `app.version` | — | `{version, build, dev}` |
| `window.drag` / `window.zoom` | — | arrasta/maximiza a janela (a casca cuida disso via `data-drag`) |
| `open.url` | `{url}` (só https) | abre no navegador padrão |

## settings.*

`settings.get` → `AppSettings`. `settings.set` recebe só os campos que mudam e devolve tudo.

```json
{ "aviso80": true, "limiteAviso": 80, "avisoQuente": true, "som": true }
```

- `aviso80`: notifica quando a carga **cruza** `limiteAviso` (50–100) com o carregador ligado.
- `avisoQuente`: notifica com duas leituras seguidas ≥ 45 °C.

## battery.now

Leitura instantânea (rápida, pode chamar a cada 2 s). Exemplo real (MacBook Pro 16" 2019):

```json
{
  "present": true,
  "percent": 99,               // carga como o macOS mostra
  "currentMah": 7447, "maxMah": 7895, "designMah": 8790,
  "healthPct": 89.8,           // maxMah / designMah; oscila ±1–2 pontos a cada recalibração
  "cycles": 251, "designCycles": 1000,
  "temperatureC": 31,
  "voltageV": 12.684,
  "amperageMa": 611,           // + entrando na bateria, − saindo
  "watts": 7.7,                // + carregando, − gastando (0 quando cheia na tomada)
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
  "status": "saudavel",        // saudavel | de-olho | gasta | trocar | sem-bateria
  "readAt": 1790304193.29
}
```

Regra do `status` (Swift, `Battery.read`):
`trocar` se a Apple pede revisão ou há falha permanente · `gasta` se saúde < 80% ·
`de-olho` se saúde < 85% ou ciclos ≥ 80% do projetado · senão `saudavel`.
Na interface: `K.batteryStatus[status]` → `{label, tone, icon}`.

Mac sem bateria (desktop): `present: false`, `status: "sem-bateria"`, o resto vazio.

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

- `carga`: ordenado por `t`. `fonte: "macos"` vem do log do sistema (só carga e tomada, a cada
  dormir/acordar); `fonte: "kamurafy"` é medido pelo app (a cada 5 min, com watts e temperatura).
  Cobre ~7 dias antes do app ser instalado.
- `saude`: um ponto por dia, gravado pelo app enquanto aberto. Começa com 1 ponto.
- `projection.method`:
  - `"historico"`: 30+ dias de dados com queda → reta; `dateTo80` confiável.
  - `"ciclos"`: desgaste médio por ciclo até hoje → `cyclesTo80`. `dateTo80` só com 14+ dias
    (precisa saber quantos ciclos por mês a pessoa faz).
  - `"sem-dados"`: bateria nova demais pra estimar.

## battery.energyApps

`args: { limite: 8 }`. Leva ~1,5 s (duas amostras do `top`). Processos do mesmo app somados.

```json
[ { "pid": 631, "name": "Firefox", "power": 85.5, "isApp": true, "icon": "data:image/png;base64,..." },
  { "pid": 138, "name": "Tela e janelas (WindowServer)", "power": 35.5, "isApp": false, "icon": null } ]
```

`power` é o "impacto energético" do Monitor de Atividade (sem unidade; só compara entre si).
`name` vem de fora: **sempre textContent**, nunca innerHTML.

## system.now

```json
{
  "cpu": { "usagePct": 10.4, "userPct": 7, "systemPct": 3.3, "cores": 12, "chip": "Intel Core i7-9750H" },
  "memory": { "totalBytes": 17179869184, "usedBytes": 13060431872, "appBytes": 9579110400,
              "wiredBytes": 2762805248, "compressedBytes": 718516224, "cachedBytes": 3396718592,
              "freeBytes": 722718720, "swapUsedBytes": 445644800, "pressure": "normal" },
  "disk": { "name": "Macintosh HD", "totalBytes": 499963174912, "freeBytes": 401751961600,
            "availableBytes": 403873202557, "usedBytes": 96089972355 },
  "uptimeSec": 174463.7, "model": "MacBook Pro (16-inch, 2019)", "modelId": "MacBookPro16,1",
  "macOS": "13.7.8", "thermalState": "morno", "readAt": 1790304193.7
}
```

- `cpu.usagePct` é a média desde a chamada anterior (a primeira mede 250 ms).
- `memory.usedBytes` = app + wired + compressed (igual ao "Memória usada" do Monitor de Atividade).
  `cachedBytes` é cache de arquivo que o macOS devolve sozinho: **não** conta como ocupado.
- `memory.pressure`: normal | atencao | critica.
- `disk.availableBytes` inclui o espaço que o macOS consegue liberar sozinho (purgeable).
  Bytes em base 10 (como o Finder): use `K.fmt.bytes`.
