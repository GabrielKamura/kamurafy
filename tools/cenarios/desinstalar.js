(function(){
/* Desinstalar com a ponte trocada por dados de mentira (nada é desinstalado: uninstall.run e
   cleanup.restore daqui só devolvem respostas inventadas). Use com rota "painel" e o js-extra
   configurando CFG, ex.:
     tools/cenario.sh tools/cenarios/desinstalar.js painel build/fotos/x.png 1180x780 'CFG.modo="carregando"'
     ... 'CFG.depois=function(){ return K.desinstalar.open("Nuvem") }'
   CFG.modo: lista (padrão) · carregando · erro · vazio
   CFG.sobras: normal (padrão) · erro · vazio · carregando
   CFG.run: ok (padrão) · falhas · erro      CFG.restore: ok (padrão) · parcial
   CFG.sobrasMs: quanto as sobras demoram pra chegar (padrão 40 ms; ex.: 800 pra testar o foco) */
var CFG = {};
__EXTRA__;
var D = 86400, now = Date.now() / 1000;
var APPS = [
  { nome: 'Estúdio de Vídeo Pro', bundleId: 'com.exemplo.video', versao: '12.4', caminho: '/Applications/Estúdio de Vídeo Pro.app', bytes: 3860000000, usado: now - 400 * D, appStore: true, apple: false, aberto: false, local: 'Aplicativos' },
  { nome: 'Keynote', bundleId: 'com.apple.iWork.Keynote', versao: '14.2', caminho: '/Applications/Keynote.app', bytes: 712000000, usado: now - 230 * D, appStore: true, apple: true, aberto: false, local: 'Aplicativos' },
  { nome: 'Navegador Leve', bundleId: 'com.exemplo.navegador', versao: '131.0.2', caminho: '/Applications/Navegador Leve.app', bytes: 598000000, usado: now - 600, appStore: false, apple: false, aberto: true, local: 'Aplicativos' },
  { nome: 'Nuvem de Arquivos', bundleId: 'com.exemplo.nuvem', versao: '4.1', caminho: '/Applications/Nuvem de Arquivos.app', bytes: 421000000, usado: now - 9 * D, appStore: false, apple: false, aberto: false, local: 'Aplicativos' },
  { nome: 'Editor de Texto Simples', bundleId: 'com.exemplo.texto', versao: '2.0', caminho: '~/Applications/Editor de Texto Simples.app', bytes: 38000000, appStore: false, apple: false, aberto: false, local: 'Meus aplicativos' },
  { nome: 'Jogo da Cobrinha', bundleId: 'com.exemplo.cobrinha', versao: '1.0.3', caminho: '/Applications/Jogo da Cobrinha.app', bytes: 152000000, usado: now - 700 * D, appStore: true, apple: false, aberto: false, local: 'Aplicativos' },
  { nome: 'Conversor Universal de Arquivos Compactados', bundleId: 'com.exemplo.conversor', versao: '3.4', caminho: '/Applications/Conversor Universal de Arquivos Compactados.app', bytes: 11000000, usado: now - 40 * D, appStore: true, apple: false, aberto: false, local: 'Aplicativos' },
  { nome: 'Leitor‮fdp', bundleId: 'com.exemplo.leitor', caminho: '/Applications/Leitor‮fdp.app', bytes: 4096, appStore: false, apple: false, aberto: false, local: 'Aplicativos' },
].map(function (a, i) { a.id = 'APP-' + i; return a; });
function rest(a) {
  var b = a.bundleId, n = a.nome, h = '~/Library/';
  return { id: 'restos', titulo: 'Sobras de ' + n, descricao: '', bytes: 0, bytesSelecionados: 0, semAcesso: CFG.semAcesso || 0, incompleto: !!CFG.incompleto, ms: 120,
    itens: [
      { id: 'R1-' + a.id, categoria: 'restos', nome: b, caminho: h + 'Caches/' + b, bytes: 812000000, selecionado: true, nota: 'Cache do app.', appAberto: false, semAcesso: false },
      { id: 'R2-' + a.id, categoria: 'restos', nome: b, caminho: h + 'Containers/' + b, bytes: 164000000, selecionado: true, nota: 'Caixa de dados do app (tudo que ele guardou).', appAberto: false, semAcesso: false },
      { id: 'R3-' + a.id, categoria: 'restos', nome: n, caminho: h + 'Application Support/' + n, bytes: 58000000, selecionado: false, nota: 'Dados e configurações do app. (achado pelo nome: confira)', appAberto: false, semAcesso: false },
      { id: 'R4-' + a.id, categoria: 'restos', nome: b + '.plist', caminho: h + 'Preferences/' + b + '.plist', bytes: 8192, selecionado: true, nota: 'Preferências do app.', appAberto: false, semAcesso: false },
      { id: 'R5-' + a.id, categoria: 'restos', nome: b + '.savedState', caminho: h + 'Saved Application State/' + b + '.savedState', bytes: 36000, selecionado: true, nota: 'Janelas que o app lembra de reabrir.', appAberto: false, semAcesso: false },
      { id: 'R6-' + a.id, categoria: 'restos', nome: b + '.plist', caminho: h + 'LaunchAgents/' + b + '.agente.plist', bytes: 4096, selecionado: true, nota: 'Item que abria junto com o Mac.', appAberto: false, semAcesso: false },
      { id: 'R7-' + a.id, categoria: 'restos', nome: b, caminho: h + 'Logs/' + b, bytes: 0, selecionado: true, nota: 'Registros do app.', appAberto: false, semAcesso: true },
    ] };
}
function later(v, ms) { return new Promise(function (r) { setTimeout(function () { r(JSON.parse(JSON.stringify(v))); }, ms || 40); }); }
function fail(m, ms) { return new Promise(function (_, j) { setTimeout(function () { j(new Error(m)); }, ms || 40); }); }
var pend = {};
var real = K.api;
K.api = function (c, a) {
  a = a || {};
  if (c === 'uninstall.apps') {
    if (CFG.modo === 'carregando') return new Promise(function () {});
    if (CFG.modo === 'erro') return fail('Não consegui ler a pasta Aplicativos (teste)', 60);
    if (CFG.modo === 'vazio') return later([], 60);
    return later(APPS, 60);
  }
  if (c === 'uninstall.leftovers') {
    var app = APPS.find(function (x) { return x.id === a.id; }) || APPS[0];
    if (CFG.sobras === 'carregando') return new Promise(function () {});
    if (CFG.sobras === 'erro') return fail('Esse app não está mais na lista: atualize.');
    if (CFG.sobras === 'vazio') return later({ id: 'restos', titulo: '', descricao: '', bytes: 0, bytesSelecionados: 0, itens: [], semAcesso: 0, incompleto: false, ms: 20 });
    var r = rest(app); pend[a.id] = r; return later(r, CFG.sobrasMs);
  }
  if (c === 'uninstall.run') {
    if (CFG.run === 'erro') return fail('Estúdio de Vídeo Pro está aberto: feche antes.', 200);
    var ids = a.restos || [], r2 = pend[a.id] || { itens: [] };
    var mov = [], fal = [];
    ids.forEach(function (id, i) {
      var it = r2.itens.find(function (x) { return x.id === id; }) || { nome: '?', bytes: 0 };
      if (CFG.run === 'falhas' && i === 1) fal.push({ id: id, nome: it.nome, motivo: 'mudou desde a varredura: procure de novo' });
      else mov.push({ id: id, nome: it.nome, bytes: it.bytes, lixeiraId: 'L-' + id });
    });
    return later({ app: true, appLixeiraId: 'L-' + a.id, restos: { movidos: mov, falhas: fal, bytes: 0, caixaDeAreia: true }, mensagem: 'foi' }, 200);
  }
  if (c === 'cleanup.restore') {
    var f = CFG.restore === 'parcial' ? [{ id: a.ids[1], nome: '?', motivo: 'não está mais na Lixeira' }] : [];
    return later({ ok: a.ids.length - f.length, bytes: 0, falhas: f }, 150);
  }
  if (c === 'cleanup.reveal') return later({ ok: true });
  return real(c, a);
};
K.cached = function (c, a) { return K.api(c, a); };
if (K.desinstalar) K.desinstalar.reset();
location.hash = '#/desinstalar';
if (CFG.depois) setTimeout(function () { try { CFG.depois(); } catch (e) { console.error(e); } }, CFG.espera || 400);
})();void 0
