(function(){
/* Cenário do "Por que tá lento?" (Otimizar): troca speed.diagnose, optimize.quit, settings.* e
   open.settings por dados de mentira. Nada aqui muda algo de verdade: fechar e salvar são falsos.
   Uso: tools/cenario.sh tools/cenarios/lento.js 'otimizar?aba=lento' saida.png 1180x1600 \
          "LT.modo='pesado'; LT.depois=function(){ K.otimizar.ltQuit('Chrome') }"
   LT.modo: voando · pesado (padrão) · travando · erro · carregando
   LT.ignorar: lista de "não avisar mais" da vigia (padrão: dois apps; vazio no voando)
   LT.depois: roda 900 ms depois da página montar (ESPERA=3000 ajuda).
   Fechar: o Chrome fecha; o node "não quer fechar" (aparece o Forçar) e fecha forçando. */
var LT = { modo: 'pesado', ignorar: null, depois: null, vigiaFalha: false };
__EXTRA__;
function ICON(c, l) {
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="15" fill="' + c + '"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#fff" font-family="Helvetica" font-weight="bold">' + l + '</text></svg>';
  return 'data:image/svg+xml;base64,' + btoa(s);
}
var GB = 1073741824;
var now = Date.now() / 1000;
var BASE = { cpu: 9, pressao: 'normal', memUsadaBytes: 7.4 * GB, memTotalBytes: 16 * GB, swapBytes: 0,
  discoLivreBytes: 374e9, discoTotalBytes: 500e9, uptimeSec: 3 * 3600 + 25 * 60, termico: 'normal', limiteCPU: 100,
  economia: false, ms: 1080 };
var ACHADOS = [];
if (LT.modo === 'pesado') {
  Object.assign(BASE, { cpu: 71, pressao: 'atencao', memUsadaBytes: 13.6 * GB, swapBytes: 1.1 * GB, discoLivreBytes: 18e9,
    discoTotalBytes: 256e9, uptimeSec: 2 * 86400 + 5 * 3600, termico: 'morno', economia: true });
  ACHADOS = [
    { id: 'memoria', tipo: 'memoria', peso: 14, tom: 'warn', detalhe: 'atencao' },
    { id: 'nav:chrome', tipo: 'navegador', peso: 20, tom: 'serious', nome: 'Google Chrome', icon: ICON('#ea4335', 'G'), cpu: 120,
      memBytes: 5.2 * GB, processos: 48, detalhe: 'cpu', acao: 'encerrar', alvo: 'alvo-chrome' },
    { id: 'fundo:spotlight', tipo: 'fundo', peso: 8, tom: 'warn', detalhe: 'spotlight', cpu: 64 },
    { id: 'disco', tipo: 'disco', peso: 10, tom: 'serious', valor: 18e9, acao: 'faxina' },
    { id: 'economia', tipo: 'economia', peso: 6, tom: 'warn', acao: 'ajustes-bateria' },
  ];
}
if (LT.modo === 'travando') {
  Object.assign(BASE, { cpu: 94, pressao: 'critica', memUsadaBytes: 15.4 * GB, swapBytes: 6.9 * GB, discoLivreBytes: 96e9,
    uptimeSec: 21 * 86400 + 4 * 3600, termico: 'quente', limiteCPU: 62 });
  ACHADOS = [
    { id: 'memoria', tipo: 'memoria', peso: 30, tom: 'crit', detalhe: 'critica', valor: 6.9 * GB },
    { id: 'proc:node', tipo: 'processo', peso: 22, tom: 'serious', nome: 'node', cpu: 190, memBytes: 1.3 * GB, processos: 1,
      detalhe: 'cpu', acao: 'encerrar', alvo: 'alvo-node' },
    { id: 'calor', tipo: 'calor', peso: 12, tom: 'serious', detalhe: 'quente', valor: 62 },
    { id: 'reiniciar', tipo: 'reiniciar', peso: 8, tom: 'warn', valor: 21 },
    { id: 'inicio', tipo: 'inicio', peso: 4, tom: 'warn', processos: 8, acao: 'inicio' },
  ];
}
var SET = { aviso80: true, limiteAviso: 80, avisoQuente: true, som: false, iconeNaBarra: true, porcentagemNaBarra: true,
  soNaBarra: false, vigia: true, vigiaIgnorar: LT.ignorar || (LT.modo === 'voando' ? [] : ['Spotify', 'Docker Desktop']) };
var gone = {};
var forced = {};
var n = 0;
function erro(m) { return { __erro: m }; }
function report() {
  n++;
  var list = ACHADOS.filter(function (f) { return !gone[f.alvo]; }).map(function (f) {
    var y = JSON.parse(JSON.stringify(f));
    if (y.alvo) y.alvo = y.alvo + '#' + n;   /* cada leitura troca os ids, como no Swift */
    return y;
  });
  var nota = Math.max(0, 100 - list.reduce(function (s, f) { return s + f.peso; }, 0));
  if (!list.length) nota = 96;
  var v = nota >= 85 ? 'voando' : nota >= 65 ? 'deboa' : nota >= 40 ? 'pesado' : 'travando';
  return Object.assign({}, BASE, { veredito: v, nota: nota, achados: list, readAt: now + n * 7 });
}
var H = {
  'speed.diagnose': function () { return LT.modo === 'erro' ? erro('o Swift não respondeu (teste)') : report(); },
  'optimize.quit': function (a) {
    var id = String(a.id || '').split('#');
    var f = ACHADOS.filter(function (x) { return x.alvo === id[0]; })[0];
    if (!f || Number(id[1]) !== n) return erro('Não está mais na lista: atualize.');
    if (a.forcar) { gone[f.alvo] = true; forced[f.alvo] = true; return { ok: true, mensagem: 'Encerrado à força.' }; }
    if (f.nome === 'node') return { ok: false, mensagem: 'O app não quis fechar.' };
    gone[f.alvo] = true;
    return { ok: true, mensagem: 'Pedi pra fechar.' };
  },
  'settings.get': function () { return LT.vigiaFalha ? erro('o Swift não respondeu (teste)') : SET; },
  'settings.set': function (a) { Object.assign(SET, a || {}); return SET; },
  'open.settings': function () { return { ok: true }; },
};
var real = K.api;
K.api = function (c, a) {
  if (LT.modo === 'carregando' && c === 'speed.diagnose') return new Promise(function () {});
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
if (LT.depois) setTimeout(function () { try { LT.depois(); } catch (e) { console.error('cenário: ' + e.message); } }, 900);
})();void 0
