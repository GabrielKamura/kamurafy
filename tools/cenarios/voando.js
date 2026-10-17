(function(){
/* Varredura com o "Deixar voando": bateria ok (na tomada), 2,1 GB de sujeira que a Faxina traria
   marcada (o cache do Spotify fica de fora: app aberto), speed.diagnose "pesado" com o Spotify no
   talo (cpu 105, acao encerrar) e o Spotlight indexando, aviso dos 80% desligado.
   Nada de verdade muda: cleanup.clean, optimize.quit e settings.set são falsos (a sujeira some da
   próxima procura, o Spotify "fecha" e sai do diagnóstico, o aviso liga só aqui dentro).
   Uso (sempre pela fila do Mac):
     ESPERA=8000 tools/cenario.sh tools/cenarios/voando.js inicio x.png 1180x1800 'K.scan()'
   js-extra (roda depois de trocar a ponte):
     V.lento=1      a limpeza não termina (foto do andamento)
     V.falhaQuit=1  o Spotify não quer fechar
     V.pedeSalvar=1 pede pra fechar, mas ele continua aberto (perguntando se quer salvar)
     V.voar(ms)     clica em "Deixar voando"; V.marcarApps(ms) marca os apps no modal;
     V.fazer(ms)    clica em "Fazer agora"
   Ex.: comemoração: ESPERA=14000 … 'K.scan(); V.voar(7500); V.marcarApps(8100); V.fazer(8600)' */
var V = { lento: 0, falhaQuit: 0, pedeSalvar: 0 };
function ICON(c, l) {
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="15" fill="' + c + '"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#fff" font-family="Helvetica" font-weight="bold">' + l + '</text></svg>';
  return 'data:image/svg+xml;base64,' + btoa(s);
}
function ok(v, ms) { return new Promise(function (r) { setTimeout(function () { r(JSON.parse(JSON.stringify(v))); }, ms || 30); }); }
function err(m) { return new Promise(function (_, j) { setTimeout(function () { j(new Error(m)); }, 30); }); }
function sum(a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); }

var S = { aviso80: false, limiteAviso: 80, avisoQuente: true, som: true, vigia: true };
K.settings.value = JSON.parse(JSON.stringify(S));

var BAT = { present: true, status: 'saudavel', healthPct: 91.4, cycles: 312, designCycles: 1000, percent: 76, pluggedIn: true,
  isCharging: true, fullyCharged: false, finishingCharge: false, minutesToFull: 48, temperatureC: 31.2, thermalState: 'morno',
  optimizedChargingEngaged: false, lowPowerMode: false, appleCondition: 'normal', permanentFailure: false,
  designMah: 8790, maxMah: 8034, currentMah: 6106, voltageV: 12.4, watts: 31.5, amperageMa: 2540, cellsMv: [4120, 4118, 4121], cellSpreadMv: 3, readAt: Date.now() / 1000 };
var SYS = { cpu: { usagePct: 34, cores: 12, physicalCores: 6, chip: 'Intel Core i7-9750H' },
  memory: { totalBytes: 17179869184, usedBytes: 11.2e9, pressure: 'normal' },
  disk: { name: 'Macintosh HD', totalBytes: 499963174912, availableBytes: 214e9, freeBytes: 210e9 },
  uptimeSec: 260000, thermalState: 'morno', macOS: '13.7.8', model: 'MacBook Pro (16-inch, 2019)', readAt: Date.now() / 1000 };

var ITENS = {
  caches: [
    { id: 'c1', categoria: 'caches', nome: 'com.tinyspeck.slackmacgap', app: 'Slack', bytes: 420e6, selecionado: true },
    { id: 'c2', categoria: 'caches', nome: 'com.figma.Desktop', app: 'Figma', bytes: 380e6, selecionado: true },
    { id: 'c3', categoria: 'caches', nome: 'us.zoom.xos', app: 'zoom.us', bytes: 210e6, selecionado: true },
    { id: 'c4', categoria: 'caches', nome: 'com.spotify.client', app: 'Spotify', bytes: 969e6, selecionado: false, appAberto: true },
    { id: 'c5', categoria: 'caches', nome: 'askpermissiond', bytes: 12e6, selecionado: true },
  ],
  dev: [
    { id: 'd1', categoria: 'dev', nome: 'DerivedData', app: 'Xcode', bytes: 640e6, selecionado: true },
    { id: 'd2', categoria: 'dev', nome: '_cacache', app: 'npm', bytes: 310e6, selecionado: true },
  ],
  logs: [
    { id: 'l1', categoria: 'logs', nome: 'Logs', bytes: 140e6, selecionado: true },
  ],
};
var TIT = { caches: 'Caches de apps', dev: 'Caches de programação', logs: 'Registros' };
var gone = {};
var spotify = true;
function scan(id) {
  var it = (ITENS[id] || []).filter(function (x) { return !gone[x.id]; }).map(function (x) {
    return Object.assign({ arquivos: 100, modificado: Date.now() / 1000 - 86400 * 3, nota: 'O app recria sozinho quando precisar.', appAberto: false, semAcesso: false }, x);
  });
  return { id: id, titulo: TIT[id], descricao: '', precisaPermissao: false, itens: it, incompleto: false,
    bytes: sum(it, function (x) { return x.bytes; }), bytesSelecionados: sum(it, function (x) { return x.selecionado && !x.appAberto ? x.bytes : 0; }) };
}
var SPOT = { id: 'app:spot', tipo: 'processo', peso: 34, tom: 'serious', nome: 'Spotify', icon: ICON('#1db954', 'S'), cpu: 105, processos: 6, detalhe: 'cpu', acao: 'encerrar', alvo: 'spot-1' };
var SPOTL = { id: 'fundo:spotlight', tipo: 'fundo', peso: 12, tom: 'warn', cpu: 38, detalhe: 'spotlight' };
function diag() {
  var a = (spotify ? [SPOT] : []).concat([SPOTL]);
  var nota = Math.max(0, 100 - sum(a, function (x) { return x.peso; }));
  return { veredito: nota >= 85 ? 'voando' : nota >= 65 ? 'deboa' : nota >= 40 ? 'pesado' : 'travando', nota: nota, achados: a,
    cpu: spotify ? 142 : 40, pressao: 'normal', memUsadaBytes: 11.2e9, memTotalBytes: 17179869184, swapBytes: 3e8,
    discoLivreBytes: 214e9, discoTotalBytes: 499963174912, uptimeSec: 260000, termico: 'morno', limiteCPU: 100, economia: false,
    ms: 900, readAt: Date.now() / 1000 };
}
function energy() {
  var a = [{ pid: 702, name: 'Google Chrome', power: 22.5, isApp: true }, { pid: 812, name: 'Slack', power: 6.1, isApp: true }];
  if (spotify) a.unshift({ pid: 733, name: 'Spotify', power: 48.2, isApp: true });
  return a;
}

var real = K.api;
K.api = function (c, a) {
  a = a || {};
  if (c === 'battery.now') return ok(BAT);
  if (c === 'battery.energyApps') return ok(energy(), 120);
  if (c === 'system.now') return ok(SYS);
  if (c === 'cleanup.scan') return ok(scan(a.categoria), 60);
  if (c === 'optimize.startup') return ok([]);
  if (c === 'speed.diagnose') return ok(diag(), 250);
  if (c === 'settings.get') return ok(S);
  if (c === 'settings.set') { Object.assign(S, a); return ok(S); }
  if (c === 'cleanup.clean') {
    if (V.lento) return new Promise(function () {});
    var all = [].concat(ITENS.caches, ITENS.dev, ITENS.logs);
    var mv = [], fl = [];
    (a.ids || []).forEach(function (id) {
      var it = all.filter(function (x) { return x.id === id; })[0];
      if (!it || gone[id]) fl.push({ id: id, nome: id, motivo: 'Não está mais na lista.' });
      else if (it.appAberto) fl.push({ id: id, nome: it.nome, motivo: 'App aberto: feche antes.' });
      else { gone[id] = 1; mv.push({ id: id, nome: it.nome, bytes: it.bytes, lixeiraId: 'lx-' + id }); }
    });
    return ok({ movidos: mv, falhas: fl, bytes: sum(mv, function (x) { return x.bytes; }), caixaDeAreia: false }, 200);
  }
  if (c === 'optimize.quit') {
    if (V.falhaQuit) return ok({ ok: false, mensagem: 'O app não quis fechar.' });
    if (a.id !== 'spot-1') return err('Não está mais na lista: atualize.');
    if (!V.pedeSalvar) spotify = false;
    return ok({ ok: true, mensagem: 'Pedi pra fechar.' }, 120);
  }
  if (c === 'open.url' || c === 'open.settings') return ok({ ok: true });
  if (/^(cleanup\.(purge|emptyTrash|restore)|optimize\.(run|startupToggle)|uninstall\.)/.test(c)) return err('recusado no cenário de teste');
  return real(c, a);
};
K.cached = function (c, a) { return K.api(c, a); };

V.voar = function (ms) { setTimeout(function () { var b = document.querySelector('.kz-fly'); if (b) b.click(); else console.error('cenário voando: sem o botão "Deixar voando"'); }, ms || 0); };
V.marcarApps = function (ms) { setTimeout(function () { document.querySelectorAll('.kz-fly-row').forEach(function (li) { if (/^Fechar/.test(li.querySelector('b').textContent)) li.click(); }); }, ms || 0); };
V.fazer = function (ms) { setTimeout(function () { var b = document.querySelector('.kmodal-ok'); if (b && !b.disabled) b.click(); else console.error('cenário voando: sem o "Fazer agora"'); }, ms || 0); };
__EXTRA__
})();void 0
