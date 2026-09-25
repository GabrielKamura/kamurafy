(function(){
/* Cenário do Otimizar: troca optimize.*, system.now e open.settings por dados de mentira.
   Nada aqui chama o Swift pra mudar algo: desligar, fechar e rodar são todos falsos.
   Uso: tools/cenario.sh tools/cenarios/otimizar.js 'otimizar?aba=pesando' saida.png 1180x2000 \
          "OT.modo='cheio'; OT.depois=function(){ K.otimizar.quit('Figma') }"
   OT.modo: cheio (padrão) · vazio · erro · carregando · pressao · recusa (o Swift recusa como no modo foto)
   OT.depois: roda 900 ms depois da página montar (ESPERA=3000 ajuda). */
var OT = { modo: 'cheio', depois: null };
__EXTRA__;
function ICON(c, l) {
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="15" fill="' + c + '"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#fff" font-family="Helvetica" font-weight="bold">' + l + '</text></svg>';
  return 'data:image/svg+xml;base64,' + btoa(s);
}
var n = 0;
function uid() { n++; return 'fake-' + n; }
var START = [
  { label: 'com.spotify.client.startuphelper', nome: 'Spotify', app: 'Spotify', icon: ICON('#1db954', 'S'), origem: 'ajudante', ligado: true, rodando: false, editavel: true },
  { label: 'com.getdropbox.dropbox.helper', nome: 'Dropbox', app: 'Dropbox', icon: ICON('#0061fe', 'D'), origem: 'ajudante', ligado: true, rodando: true, editavel: true },
  { label: 'us.zoom.ZoomAutoUpdater', nome: 'zoom.us', app: 'zoom.us', icon: ICON('#2d8cff', 'Z'), origem: 'ajudante', ligado: false, rodando: false, editavel: true },
  { label: 'com.adobe.acc.installer.v2', nome: 'com.adobe.acc.installer.v2', origem: 'ajudante', ligado: true, rodando: false, editavel: true, nota: 'O app que colocou isso pode já ter sido apagado.' },
  { label: 'com.google.keystone.agent', nome: 'Google Chrome', app: 'Google Chrome', icon: ICON('#ea4335', 'G'), origem: 'agente', ligado: true, rodando: true, editavel: true, arquivo: '~/Library/LaunchAgents/com.google.keystone.agent.plist', programa: '/Users/voce/Library/Google/GoogleSoftwareUpdate/GoogleSoftwareUpdate.bundle/Contents/Resources/GoogleSoftwareUpdateAgent.app/Contents/MacOS/GoogleSoftwareUpdateAgent' },
  { label: 'homebrew.mxcl.postgresql@16', nome: 'homebrew.mxcl.postgresql@16', origem: 'agente', ligado: false, rodando: false, editavel: true, arquivo: '~/Library/LaunchAgents/homebrew.mxcl.postgresql@16.plist', programa: '/usr/local/opt/postgresql@16/bin/postgres' },
  { label: 'com.adobe.ARMDCHelper.cc24aef4a1b90ed56a725c38014c95072f92651fb65e1bf9c8e43c37a23d420d', nome: 'Adobe Acrobat', app: 'Adobe Acrobat', icon: ICON('#d7373f', 'A'), origem: 'sistema', ligado: true, rodando: false, editavel: false, arquivo: '/Library/LaunchDaemons/com.adobe.ARMDC.SMJobBlessHelper.plist', nota: 'Serviço do sistema: mexer pede senha de administrador (Ajustes › Itens de Início).' },
  { label: 'com.logi.optionsplus.updater', nome: 'Logi Options+', app: 'Logi Options+', icon: ICON('#00b8fc', 'L'), origem: 'sistema', ligado: true, rodando: true, editavel: false, arquivo: '/Library/LaunchAgents/com.logi.optionsplus.updater.plist', nota: 'Vale pra todos os usuários: mexer pede senha de administrador (Ajustes › Itens de Início).' },
];
var HEAVY = [
  { nome: 'Google Chrome', pid: 501, cpu: 186, memBytes: 4.2e9, processos: 52, app: true, sistema: false, proprio: false, icon: ICON('#ea4335', 'G') },
  { nome: 'node', pid: 7788, cpu: 98.4, memBytes: 812e6, processos: 1, app: false, sistema: false, proprio: false },
  { nome: 'Figma', pid: 612, cpu: 64, memBytes: 1.6e9, processos: 9, app: true, sistema: false, proprio: false, icon: ICON('#a259ff', 'F') },
  { nome: 'WindowServer', pid: 138, cpu: 38, memBytes: 140e6, processos: 1, app: false, sistema: true, proprio: false },
  { nome: 'Slack', pid: 700, cpu: 2.1, memBytes: 910e6, processos: 7, app: true, sistema: false, proprio: false, icon: ICON('#4a154b', 'S') },
  { nome: 'Spotify', pid: 733, cpu: 12.4, memBytes: 520e6, processos: 6, app: true, sistema: false, proprio: false, icon: ICON('#1db954', 'S') },
  { nome: 'kernel_task', pid: 0, cpu: 22, memBytes: 3e6, processos: 1, app: false, sistema: true, proprio: false },
  { nome: 'Kamurafy', pid: 9001, cpu: 3.2, memBytes: 180e6, processos: 4, app: true, sistema: false, proprio: true, icon: ICON('#ffd23f', 'K') },
  { nome: 'Mail', pid: 812, cpu: 0.8, memBytes: 300e6, processos: 3, app: true, sistema: false, proprio: false, icon: ICON('#3b82f6', 'M') },
  { nome: 'Finder', pid: 369, cpu: 0.6, memBytes: 143e6, processos: 4, app: true, sistema: true, proprio: false },
];
var SYS = { cpu: { usagePct: 38, cores: 12, physicalCores: 6 }, memory: { totalBytes: 17179869184, usedBytes: 12.1e9, pressure: 'normal' } };
if (OT.modo === 'pressao') {
  SYS = { cpu: { usagePct: 91, cores: 8, physicalCores: 8 }, memory: { totalBytes: 8589934592, usedBytes: 7.9e9, pressure: 'critica' } };
  HEAVY[0].cpu = 512; HEAVY[0].memBytes = 3.9e9;
}
var TASKS = null;
var gone = {};
var quitCalls = {};
function erro(m) { return { __erro: m }; }
var H = {
  'optimize.startup': function () { return START.map(function (x) { var y = JSON.parse(JSON.stringify(x)); y.id = uid(); x.id = y.id; return y; }); },
  'optimize.startupToggle': function (a) {
    var it = START.filter(function (x) { return x.id === a.id; })[0];
    if (!it) return erro('Esse item não está mais na lista: abra a tela de novo.');
    it.ligado = !!a.ligar; it.rodando = !!a.ligar && it.origem === 'agente';
    return { id: a.id, ligado: it.ligado, rodando: it.rodando };
  },
  'optimize.heavy': function () {
    return HEAVY.filter(function (x) { return !gone[x.pid]; }).map(function (x, i) {
      var y = JSON.parse(JSON.stringify(x)); y.id = uid(); x.id = y.id;
      y.cpu = Math.max(0, Math.round((x.cpu * (0.9 + ((n * 7 + i * 3) % 10) / 50)) * 10) / 10);
      y.respondendo = true; return y;
    });
  },
  'optimize.quit': function (a) {
    var it = HEAVY.filter(function (x) { return x.id === a.id; })[0];
    if (!it) return erro('Não está mais na lista: atualize.');
    if (it.sistema) return erro('É do macOS: o Kamurafy não encerra.');
    if (a.forcar) { gone[it.pid] = true; return { ok: true, mensagem: 'Encerrado à força.' }; }
    if (/Figma/.test(it.nome)) return { ok: false, mensagem: 'O app não quis fechar.' };
    if (/Spotify/.test(it.nome)) return { ok: true, mensagem: 'Pedi pra fechar.' };
    gone[it.pid] = true;
    return { ok: true, mensagem: 'Pedi pra fechar.' };
  },
  'optimize.run': function (a) {
    if (a.id === 'spotlight') return { ok: false, mensagem: 'Cancelado.' };
    if (a.id === 'finder') return erro('Não deu certo (-1743).');
    var m = { dns: 'Cache de DNS limpo.', abrircom: 'Lista do "Abrir com" refeita.', dock: 'Dock reiniciado.' };
    return { ok: true, mensagem: m[a.id] || 'Pronto.' };
  },
  'system.now': function () { return SYS; },
  'open.settings': function () { return { ok: true }; },
};
if (OT.modo === 'vazio') {
  H['optimize.startup'] = function () { return []; };
  H['optimize.heavy'] = function () { return []; };
  H['optimize.tasks'] = function () { return []; };
}
if (OT.modo === 'erro') {
  ['optimize.startup', 'optimize.heavy', 'optimize.tasks', 'system.now'].forEach(function (c) { H[c] = function () { return erro('o Swift não respondeu (teste)'); }; });
}
if (OT.modo === 'recusa') {
  ['optimize.startupToggle', 'optimize.quit', 'optimize.run'].forEach(function (c) { H[c] = function () { return erro('Só no app aberto.'); }; });
}
var real = K.api;
K.api = function (c, a) {
  if (OT.modo === 'carregando' && /^optimize\.|^system\.now/.test(c)) return new Promise(function () {});
  if (Object.prototype.hasOwnProperty.call(H, c)) {
    return new Promise(function (r, j) {
      setTimeout(function () {
        try { var v = H[c](a || {}); if (v && v.__erro) j(new Error(v.__erro)); else r(JSON.parse(JSON.stringify(v))); } catch (e) { j(e); }
      }, 60);
    });
  }
  return real(c, a);
};
if (K.otimizar && K.otimizar.reset) K.otimizar.reset();
document.getElementById('sidebar').innerHTML = '';
document.dispatchEvent(new Event('DOMContentLoaded'));
if (OT.depois) setTimeout(function () { try { OT.depois(); } catch (e) { console.error('cenário: ' + e.message); } }, 900);
})();void 0
