/* Kamurafy — Desinstalar (#/desinstalar): tira o app e o que ele espalhou na sua pasta.
   Três momentos na mesma tela:
     lista     → uninstall.apps (~8 s: mede cada app; enquanto isso, espera com o mascote), grade de
                 cartões com busca, filtros (Todos, Grandes, Parados há 6+ meses, App Store) e ordem;
     gaveta    → o app escolhido em destaque e as sobras (uninstall.leftovers) com caixas de marcar.
                 As achadas só pelo nome vêm desmarcadas ("confira"). App aberto não segue;
     resultado → K.confirm → uninstall.run → o que foi, falhas com o motivo, Desfazer
                 (cleanup.restore) e "Ver na Lixeira" (#/faxina?aba=lixeira).
   A interface só manda IDs que o Swift devolveu; nomes e caminhos entram só por textContent.
   Contrato em docs/ponte.md (uninstall.*, cleanup.restore). O estado sobrevive à troca de tela.
   Ganchos de teste em K.desinstalar (load, open, close, search, filter, sort, mark, confirm,
   uninstall, undo, state, reset), só na build de desenvolvimento. */
'use strict';

(function () {
  /* ícones só desta tela (mesmo traço do icons.js: viewBox 24, pontas redondas) */
  Object.assign(K.ICONS, {
    unTrash: '<path d="M4 6.5h16"/><path d="M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7"/><path d="m6 6.5 1 12.3c.1 1 .9 1.7 1.9 1.7h6.2c1 0 1.8-.7 1.9-1.7l1-12.3"/><path d="M10 10.5v6M14 10.5v6"/>',
    unUndo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
    unFolder: '<path d="M3.5 7.5c0-1.1.9-2 2-2h3.8l2 2.2h7.2c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2Z"/>',
    unFinder: '<path d="M3.5 7.5c0-1.1.9-2 2-2h3.8l2 2.2h7.2c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2Z"/><path d="m10.5 15.5 4-4M11.5 11.5h3v3"/>',
    unBag: '<path d="M5.2 8.5h13.6l-.9 11a1.6 1.6 0 0 1-1.6 1.5H7.7a1.6 1.6 0 0 1-1.6-1.5Z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>',
    unMac: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.8"/><path d="M2.5 18h19l-.9 1.3a1.6 1.6 0 0 1-1.3.7H4.7a1.6 1.6 0 0 1-1.3-.7Z"/>',
    unData: '<ellipse cx="12" cy="6" rx="7" ry="2.7"/><path d="M5 6v12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>',
    unWeight: '<path d="M7.2 8.5h9.6l2.7 11.2H4.5Z"/><circle cx="12" cy="5.6" r="2.2"/><path d="M9.5 14.2h5"/>',
    unSort: '<path d="M7.5 4.5v15M4 16l3.5 3.5L11 16M16.5 19.5v-15M13 8l3.5-3.5L20 8"/>',
    unRefresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    unSafe: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
    unFlask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.3a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2l-5.5-9.6V3.5"/><path d="M7.3 14.5h9.4"/>',
    unCard: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  });

  const BIG = 500e6;                 // "Grandes": 500 MB ou mais (base 10, como o Finder)
  const STALE_D = 182;               // "Parados": seis meses sem abrir
  const KEEP_S = 10 * 60;            // a lista continua valendo por 10 min ao voltar pra tela
  const REST_KEEP_S = 40 * 60;       // os IDs das sobras valem 1 h no Swift: antes disso, procura de novo
  const WAIT_MSGS = [K.t('Abrindo a pasta Aplicativos…'), K.t('Medindo cada app…'), K.t('Vendo quando cada um foi aberto…'), K.t('Quase lá…')];

  const FILTERS = [
    { id: 'todos', label: K.t('Todos'), icon: 'apps', title: K.t('Todos os apps que dá pra desinstalar'), test: () => true },
    { id: 'grandes', label: K.t('Grandes'), icon: 'unWeight', title: K.t('Apps com 500 MB ou mais'), test: (a) => (a.bytes || 0) >= BIG },
    { id: 'parados', label: K.t('Parados há 6+ meses'), icon: 'moon',
      title: K.t('Sem abrir há seis meses ou mais. Apps sem registro de uso ficam de fora.'),
      test: (a) => stale(a) },
    { id: 'loja', label: K.t('App Store'), icon: 'unBag', title: K.t('Baixados pela App Store'), test: (a) => !!a.appStore },
  ];
  const SORTS = [
    { id: 'tamanho', label: K.t('Tamanho'), title: K.t('Os maiores primeiro') },
    { id: 'nome', label: K.t('Nome'), title: K.t('De A a Z') },
    { id: 'uso', label: K.t('Uso'), title: K.t('Os parados há mais tempo primeiro') },
  ];

  /* pasta da sobra (~/Library/<pasta>/…) → nome de gente. data: guarda o que o app criou (logins,
     ajustes, arquivos dele): vai junto e o modal avisa */
  const KINDS = [
    [K.t('Application Support'), K.t('Dados e configurações'), 'unData', true, K.t('Contas, ajustes e arquivos que o app criou.')],
    [K.t('Containers'), K.t('Caixa de dados do app'), 'unData', true, K.t('Tudo que o app guardou, às vezes até documentos feitos nele.')],
    [K.t('Caches'), K.t('Cache'), 'unFolder', false, K.t('Sem o app, é só espaço ocupado.')],
    ['Preferences/ByHost', K.t('Preferências deste Mac'), 'unFolder', false, K.t('Ajustes do app só deste Mac.')],
    [K.t('Preferences'), K.t('Preferências'), 'unFolder', false, K.t('Os ajustes que você fez no app.')],
    [K.t('Saved Application State'), K.t('Janelas salvas'), 'unFolder', false, K.t('As janelas que o app reabriria.')],
    [K.t('Logs'), K.t('Registros (logs)'), 'unFolder', false, K.t('Anotações do app pra achar problemas.')],
    ['HTTPStorages', K.t('Dados de internet'), 'unFolder', false, K.t('Cookies e dados de internet do app.')],
    ['WebKit', K.t('Dados de páginas web'), 'unFolder', false, K.t('O que as páginas abertas no app guardaram.')],
    [K.t('Application Scripts'), K.t('Scripts do app'), 'unFolder', false, K.t('Scripts que o app usa.')],
    [K.t('Cookies'), K.t('Cookies'), 'unFolder', false, K.t('Logins em sites abertos dentro do app.')],
    ['LaunchAgents', K.t('Abre junto com o Mac'), 'unFolder', false, K.t('Fazia uma parte do app abrir junto com o Mac.')],
  ];

  /* ================= estado (sobrevive à troca de tela) ================= */

  const S = {
    mode: 'idle',                 // idle | loading | ready | error
    apps: [], at: 0, took: 0, t0: 0, err: null, run: 0, promise: null,
    refreshing: false,            // atualizando com a lista velha ainda na tela
    q: '', filter: 'todos', sort: 'tamanho',
    sandbox: false,               // caixa de areia (testes): figurinha "modo de teste"
    bat: null,                    // battery.now, só pro mascote
    rest: new Map(),              // id do app → sobras {mode, data, items, sel, err, at, promise}
    openId: null,                 // app na gaveta
    checking: false,              // "Já fechei: conferir de novo"
    job: null,                    // a última desinstalação {appId, app, mode, items, res, err, at, undo, dismissed}
  };

  let host = null;
  let V = {};                     // referências da tela montada

  /* ================= utilidades ================= */

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const nowS = () => Date.now() / 1000;
  const snap = () => document.documentElement.classList.contains('snap');
  const fmtB = (v) => K.fmt.bytes(v || 0);
  /** tamanho que nunca quebra no meio ("1,7 / GB") */
  const fmtN = (v) => fmtB(v).replace(/ /g, '\u00a0');
  const plural = (n, um, varios) => `${K.fmt.num(n)} ${n === 1 ? um : varios}`;
  const mounted = () => !!host && document.body.contains(host);
  /* original em português (pras regras do WHY); a tela mostra traduzido */
  const errMsg = (e) => (e && (e.original || e.message) ? String(e.original || e.message) : K.t('erro desconhecido'));
  const sum = (list) => list.reduce((a, it) => a + (it.bytes || 0), 0);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Nomes e caminhos vêm de fora. Um caractere que muda a direção do texto (U+202E e parecidos)
     faria "‮gpj.exe" aparecer como "exe.jpg": na tela ele vira um sinal visível (�) e, no meio
     de uma frase, o nome vai isolado (FSI…PDI). Mesma regra da Faxina. */
  const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;
  const BIDI1 = /[؜‎‏‪-‮⁦-⁩]/;
  const vis = (s) => String(s == null ? '' : s).replace(BIDI, '�');
  const inl = (s) => '⁨' + vis(s) + '⁩';
  const tricky = (s) => BIDI1.test(String(s == null ? '' : s));

  /* motivos que o Swift manda (curtos, técnicos) → frase de gente; nunca mostra UUID */
  const WHY = [
    [/está aberto: feche antes/i, K.t('está aberto: feche o app e tente de novo')],
    [/não está mais na lista|mudou desde a lista|a lista venceu/i, K.t('a lista ficou velha: atualize e tente de novo')],
    [/só no app aberto|caixa de areia/i, K.t('no modo de teste, desinstalar só funciona na caixa de areia')],
    [/^mudou desde a varredura/i, K.t('mudou desde a procura: abra o app de novo na lista')],
    [/^mudou de (lugar|nome)$/i, (g) => K.t('{0}: abra o app de novo na lista', g[0])],
    [/-128|cancel/i, K.t('o pedido de senha foi cancelado')],
    [/não mandou pra Lixeira/i, K.t('o Finder não mandou pra Lixeira (o pedido de senha pode ter sido cancelado)')],
    [/lugar original não confere/i, K.t('não consegui conferir o lugar de onde saiu; continua na Lixeira, e dá pra devolver pelo Finder')],
    [/não está mais na Lixeira/i, K.t('já não está na Lixeira')],
    [/já existe outro/i, K.t('já tem outro com esse nome no lugar de onde saiu')],
    [/virou um link simbólico/i, K.t('virou um atalho (link simbólico): não mexo')],
    [/saiu da pasta permitida/i, K.t('foi parar numa pasta onde eu não mexo')],
    [/está em outro disco/i, K.t('está em outro disco: não mexo')],
  ];
  function why(m) {
    const s = vis(m || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim();
    for (const [re, to] of WHY) { const g = re.exec(s); if (g) return typeof to === 'function' ? to(g) : to; }
    return s ? K.t(s) : K.t('motivo desconhecido');
  }

  function withTimeout(p, ms, msg) {
    return Promise.race([p, K.sleep(ms).then(() => { throw new Error(msg || K.t('demorou demais pra responder')); })]);
  }

  /* ---------- datas: "hoje", "há 3 dias", "há 5 meses", "há mais de 2 anos" ---------- */

  function daysAgo(t) {
    const d = new Date(t * 1000), hoje = new Date();
    const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    return Math.round((dia(hoje) - dia(d)) / 86400000);
  }
  function ago(t) {
    if (!isNum(t)) return null;
    const d = daysAgo(t);
    if (d <= 0) return K.t('hoje');
    if (d === 1) return K.t('ontem');
    if (d < 7) return K.t('há {0} dias', d);
    if (d < 28) { const w = Math.round(d / 7); return w === 1 ? K.t('há 1 semana') : K.t('há {0} semanas', w); }
    const m = Math.max(1, Math.floor(d / 30.44));
    if (m < 12) return m === 1 ? K.t('há 1 mês') : K.t('há {0} meses', m);
    const y = Math.floor(m / 12);
    return K.t('há {0}{1} {2}', m % 12 ? K.t('mais de ') : '', y, y === 1 ? K.t('ano') : K.t('anos'));
  }
  function dateTxt(t) {
    const d = new Date(t * 1000);
    const o = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(K.locale || 'pt-BR', o).replace(/\./g, '').replace(/ de /g, ' ');
  }
  function stale(a) { return !!a && !a.aberto && isNum(a.usado) && daysAgo(a.usado) >= STALE_D; }

  /* ---------- apps ---------- */

  const appById = (id) => S.apps.find((a) => a.id === id) || (S.job && S.job.appId === id ? S.job.app : null);
  const sameApp = (a, b) => !!a && !!b && a.caminho === b.caminho && (a.bundleId || '') === (b.bundleId || '');

  function appIcon(a, cls) {
    const box = K.el('span', { class: cls || 'un-ic', 'aria-hidden': 'true' });
    if (a && typeof a.icon === 'string' && a.icon.indexOf('data:image/') === 0) box.appendChild(K.el('img', { src: a.icon, alt: '' }));
    else { box.classList.add('is-generic'); box.innerHTML = K.icon('box'); }
    return box;
  }

  function tag(tone, icon, text, title) {
    return K.el('span', { class: 'un-tag ' + tone, title: title || null, html: icon ? K.icon(icon) : null }, text);
  }

  function appTags(a) {
    const out = [];
    if (a.aberto) out.push(K.el('span', { class: 'un-tag open', title: K.t('Feche {0} antes de desinstalar.', vis(a.nome)) },
      K.el('i', { class: 'un-dot', 'aria-hidden': 'true' }), K.t('aberto agora')));
    if (a.appStore) out.push(tag('plain', 'unBag', K.t('App Store'), K.t('Baixado pela App Store')));
    if (a.apple) out.push(tag('plain', 'unMac', K.t('da Apple'), K.t('App da Apple (não faz parte do macOS: dá pra tirar)')));
    if (tricky(a.nome)) out.push(tag('warn', 'alert', K.t('nome disfarçado'), K.t('O nome tem um caractere invisível que troca a ordem das letras. Mostro um � no lugar.')));
    return out;
  }

  function usedTxt(a) {
    /* "aberto agora" já está na etiqueta: aqui vai o que fazer */
    if (a.aberto) return K.t('feche antes de desinstalar');
    const g = ago(a.usado);
    return g ? K.t('último uso {0}', g) : K.t('sem registro de uso');
  }
  const NO_USE = K.t('O macOS não anotou quando este app foi aberto.');

  function visibleApps() {
    const f = FILTERS.find((x) => x.id === S.filter) || FILTERS[0];
    const q = norm(S.q.trim());
    let list = S.apps.filter(f.test);
    if (q) list = list.filter((a) => norm(a.nome).includes(q) || (a.bundleId && norm(a.bundleId).includes(q)));
    return sortApps(list);
  }

  function sortApps(list) {
    const byName = (a, b) => String(a.nome).localeCompare(String(b.nome), K.locale || 'pt-BR', { sensitivity: 'base' });
    const useKey = (a) => (a.aberto ? nowS() : isNum(a.usado) ? a.usado : Infinity);
    if (S.sort === 'nome') return list.slice().sort(byName);
    if (S.sort === 'uso') return list.slice().sort((a, b) => useKey(a) - useKey(b) || byName(a, b));
    return list.slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0) || byName(a, b));
  }

  /* ---------- sobras ---------- */

  function kindOf(it) {
    const p = String((it && it.caminho) || '');
    for (const [dir, label, icon, data, note] of KINDS) {
      if (p.indexOf('/Library/' + dir + '/') >= 0) return { dir, label, icon, data, note };
    }
    return { dir: '', label: vis(it && it.nome) || K.t('Sobra'), icon: 'unFolder', data: false, note: '' };
  }
  const BYNAME = /\s*\(achado pelo nome: confira\)\s*/i;
  const byName = (it) => !!it && BYNAME.test(String(it.nota || ''));
  const restOk = (it) => !!it && !it.semAcesso && !it.appAberto;
  const suggested = (it) => restOk(it) && !!it.selecionado && !byName(it);

  function restOf(id) { return S.rest.get(id) || null; }
  function selItems(id) {
    const R = restOf(id);
    if (!R || R.mode !== 'ready') return [];
    return Array.from(R.sel).map((x) => R.items.get(x)).filter(restOk);
  }

  function loadRest(id, force) {
    let R = restOf(id);
    if (R && !force && (R.mode === 'loading' || (R.mode === 'ready' && nowS() - R.at < REST_KEEP_S))) return R.promise;
    R = { mode: 'loading', data: null, items: new Map(), sel: new Set(), err: null, at: 0, touched: false };
    S.rest.set(id, R);
    R.promise = withTimeout(K.api('uninstall.leftovers', { id }), 45000, K.t('a procura das sobras demorou demais')).then((d) => {
      if (restOf(id) !== R) return;
      R.data = d || { itens: [] };
      for (const it of R.data.itens || []) {
        R.items.set(it.id, it);
        if (suggested(it)) R.sel.add(it.id);
      }
      R.mode = 'ready';
      R.at = nowS();
    }).catch((e) => {
      if (restOf(id) !== R) return;
      R.mode = 'error';
      R.err = errMsg(e);
      console.warn('desinstalar/sobras: ' + R.err);
    }).then(() => {
      if (S.openId === id && mounted()) paintDrawer();
    });
    return R.promise;
  }

  /* ---------- mascote ---------- */

  function mascotState(extra) {
    const b = S.bat;
    let base = { pct: 72, tone: 'good' };
    if (b && b.present !== false && isNum(b.percent)) {
      const st = K.batStatus(b);
      base = { pct: b.percent, tone: st.tone, charging: !!b.isCharging, plugged: !!b.pluggedIn, hot: isNum(b.temperatureC) && b.temperatureC >= 40 };
    }
    return Object.assign(base, { full: false }, extra);
  }
  function addMascot(box, size, extra, list) {
    try {
      const m = K.mascot(box, { size, state: mascotState(extra) });
      (list || V.mascots).push(m);
      return m;
    } catch (e) { console.warn('desinstalar/mascote: ' + errMsg(e)); return null; }
  }

  function sparkles(n) {
    const star = K.t('M12 1.5c.9 6 3.6 8.7 9.5 9.8v1.4c-5.9 1.1-8.6 3.8-9.5 9.8h-1c-.9-6-3.6-8.7-9.5-9.8v-1.4C7.4 10.2 10.1 7.5 11 1.5Z');
    const out = [];
    for (let i = 0; i < n; i++) out.push(K.el('span', { class: `un-spark s${i + 1}`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24"><path d="${star}"/></svg>` }));
    return out;
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('un-shake');
    void node.offsetWidth;
    node.classList.add('un-shake');
  }

  function clearTimers() {
    for (const t of V.timers || []) clearInterval(t);
    V.timers = [];
  }
  function clearMascots(list) {
    for (const m of list || []) { try { m.destroy(); } catch (e) { /* já foi */ } }
    if (list) list.length = 0;
  }

  /* ================= lista ================= */

  function load(opts) {
    opts = opts || {};
    if (S.mode === 'loading' || S.refreshing) return S.promise || Promise.resolve();
    const run = ++S.run;
    const silent = !!opts.silent && S.mode === 'ready';
    if (silent) S.refreshing = true;
    else { S.mode = 'loading'; S.err = null; }
    S.t0 = performance.now();
    const started = nowS();
    if (mounted()) paintAll();
    S.promise = withTimeout(K.api('uninstall.apps'), 90000, K.t('a lista de apps demorou demais')).then((list) => {
      if (run !== S.run) return;
      /* lista lida antes de uma desinstalação terminar ainda traz o app que já foi pra Lixeira */
      const gone = S.job && S.job.mode === 'done' && S.job.at >= started ? S.job.app : null;
      const apps = (Array.isArray(list) ? list : []).filter((a) => a && a.id && !(gone && sameApp(a, gone)));
      /* a gaveta mostrando um resultado continua nele (o app desfeito volta com id novo) */
      const showingJob = !!S.job && S.job.appId === S.openId && S.job.mode === 'done';
      const openApp = S.openId && !showingJob ? appById(S.openId) : null;
      /* o id muda a cada lista: a gaveta aberta e as sobras já lidas seguem o mesmo app */
      for (const a of apps) {
        const old = S.apps.find((x) => sameApp(x, a));
        if (old && S.rest.has(old.id) && !S.rest.has(a.id)) { S.rest.set(a.id, S.rest.get(old.id)); S.rest.delete(old.id); }
        if (openApp && sameApp(openApp, a)) S.openId = a.id;
      }
      S.apps = apps;
      S.sandbox = S.sandbox || apps.some((a) => /\(teste\)/.test(String(a.local || '')));
      S.took = (performance.now() - S.t0) / 1000;
      S.at = nowS();
      S.mode = 'ready';
      if (!silent) K.sound.tada();
    }).catch((e) => {
      if (run !== S.run) return;
      if (silent) { S.refreshErr = errMsg(e); console.warn('desinstalar/atualizar: ' + S.refreshErr); }
      else { S.mode = 'error'; S.err = errMsg(e); K.sound.oops(); }
    }).then(() => {
      if (run !== S.run) return;
      S.refreshing = false;
      if (S.checking) {
        const a = S.openId ? appById(S.openId) : null;
        S.stillOpen = !!a && !!a.aberto;
        if (S.stillOpen) K.sound.oops();
      }
      S.checking = false;
      if (mounted()) paintAll();
    });
    return S.promise;
  }

  function paintShell() {
    host.innerHTML = '';
    V.sandbox = K.el('span', { class: 'sticker has-ic un-sandbox', html: K.icon('unFlask'),
      title: K.t('Caixa de areia: pasta e Lixeira de mentira. Nada seu é tocado.') }, K.t('modo de teste'));
    /* resumo numa figurinha de uma linha, como nas outras telas ("15 apps · 9,0 GB · 4 abertos") */
    V.sum = K.el('span', { class: 'sticker un-sum', role: 'status' });
    host.appendChild(K.el('header', { class: 'page-head un-head', 'data-drag': true },
      K.el('div', { class: 'un-head-text' },
        K.el('h1', null, K.t('Desinstalar')),
        K.el('p', null, K.t('O app e as sobras vão pra Lixeira: dá pra desfazer.'))),
      K.el('div', { class: 'un-head-side' }, V.sandbox, V.sum)));
    V.tools = K.el('div', { class: 'un-tools' });
    V.banner = K.el('div', { class: 'un-banner-box' });
    V.body = K.el('div', { class: 'un-body' });
    host.append(V.tools, V.banner, V.body);
    buildTools();
  }

  function paintAll() {
    if (!mounted()) return;
    paintHead();
    paintTools();
    paintBanner();
    paintBody();
    if (S.openId && V.dr) paintDrawer();
  }

  function paintHead() {
    V.sandbox.hidden = !S.sandbox;
    const ready = S.mode === 'ready' && S.apps.length > 0;
    V.sum.hidden = !ready;
    if (!ready) return;
    const n = S.apps.length;
    const open = S.apps.filter((a) => a.aberto).length;
    V.sum.textContent = `${plural(n, K.t('app'), K.t('apps'))} · ${fmtB(sum(S.apps))}${open ? ` · ${plural(open, K.t('aberto'), K.t('abertos'))}` : ''}`;
    V.sum.title = S.refreshing ? K.t('Atualizando a lista…') : K.t('Lista lida às {0}{1}.', K.fmt.time(S.at), open ? K.t('; {0} agora', plural(open, K.t('app está aberto'), K.t('apps estão abertos'))) : '');
  }

  /* ---------- barra de busca, filtros e ordem (gruda no topo) ---------- */

  function buildTools() {
    V.search = K.el('input', {
      class: 'un-search-in', type: 'search', placeholder: K.t('Buscar app pelo nome'), 'aria-label': K.t('Buscar app pelo nome'),
      autocomplete: 'off', spellcheck: 'false',
      oninput: () => { S.q = V.search.value; paintClear(); paintGrid(); },
      onkeydown: (e) => { if (e.key === 'Escape' && V.search.value) { e.preventDefault(); e.stopPropagation(); clearSearch(); } },
    });
    V.search.value = S.q;
    V.clear = K.el('button', { class: 'un-search-x', type: 'button', 'aria-label': K.t('Limpar a busca'), title: K.t('Limpar a busca'), html: K.icon('close'),
      onclick: () => { K.sound.tick(); clearSearch(); } });
    const field = K.el('label', { class: 'un-search' }, K.el('span', { class: 'un-search-ic', html: K.icon('scan') }), V.search, V.clear,
      K.el('kbd', { class: 'un-kbd', 'aria-hidden': 'true', title: K.t('Atalho: ⌘F') }, K.t('⌘F')));

    V.sorts = {};
    const sortBox = K.el('div', { class: 'un-sort', role: 'group', 'aria-label': K.t('Ordenar por') },
      K.el('span', { class: 'un-sort-t', html: K.icon('unSort') }, K.t('Ordenar')));
    for (const s of SORTS) {
      const b = K.el('button', { class: 'un-sort-b', type: 'button', title: s.title, onclick: () => setSort(s.id) }, s.label);
      V.sorts[s.id] = b;
      sortBox.appendChild(b);
    }

    V.chips = {};
    const chips = K.el('div', { class: 'un-chips', role: 'group', 'aria-label': K.t('Filtrar apps') });
    for (const f of FILTERS) {
      const n = K.el('span', { class: 'un-chip-n num' });
      const b = K.el('button', { class: 'un-chip', type: 'button', title: f.title, html: K.icon(f.icon), onclick: () => setFilter(f.id) },
        K.el('span', null, f.label), n);
      V.chips[f.id] = { b, n };
      chips.appendChild(b);
    }

    /* o mesmo nome das outras listas: "Procurar de novo" */
    V.refreshT = K.el('span', null, K.t('Procurar de novo'));
    V.refresh = K.el('button', { class: 'un-refresh', type: 'button', html: K.icon('unRefresh'), dataset: { fk: 'un-refresh' },
      onclick: () => { if (S.refreshing) return; K.sound.plop(); load({ silent: true }); } }, V.refreshT);
    /* "Mostrando 3 de 15" fica fora da barra que gruda (ela não cresce ao filtrar), mas é anunciado */
    V.count = K.el('span', { class: 'un-sr', role: 'status', 'aria-live': 'polite' });

    V.tools.append(
      K.el('div', { class: 'un-tools-row' }, field, K.el('div', { class: 'un-tools-end' }, sortBox, V.refresh)),
      K.el('div', { class: 'un-tools-row' }, chips), V.count);
    paintClear();
  }

  function paintClear() { if (V.clear) V.clear.hidden = !S.q; }
  function clearSearch() {
    S.q = '';
    if (V.search) { V.search.value = ''; V.search.focus(); }
    paintClear();
    paintGrid();
  }
  function setFilter(id) {
    if (S.filter === id) return;
    K.sound.tick();
    S.filter = id;
    paintTools();
    paintGrid();
  }
  function setSort(id) {
    if (S.sort === id) return;
    K.sound.tick();
    S.sort = id;
    paintTools();
    paintGrid();
  }

  function paintTools() {
    if (!V.tools) return;
    const ready = S.mode === 'ready' && S.apps.length > 0;
    V.tools.hidden = !ready;
    if (!ready) return;
    for (const f of FILTERS) {
      const c = V.chips[f.id];
      const on = S.filter === f.id;
      c.b.classList.toggle('on', on);
      c.b.setAttribute('aria-pressed', String(on));
      c.n.textContent = K.fmt.num(S.apps.filter(f.test).length);
    }
    for (const s of SORTS) {
      const on = S.sort === s.id;
      V.sorts[s.id].classList.toggle('on', on);
      V.sorts[s.id].setAttribute('aria-pressed', String(on));
    }
    V.refresh.title = S.refreshing ? K.t('Atualizando a lista…') : K.t('Lista lida às {0}.', K.fmt.time(S.at));
    V.refresh.setAttribute('aria-disabled', String(!!S.refreshing));
    V.refresh.classList.toggle('is-busy', S.refreshing);
    V.refreshT.textContent = S.refreshing ? K.t('Procurando…') : K.t('Procurar de novo');
    V.refresh.setAttribute('aria-label', V.refreshT.textContent);
  }

  /* ---------- aviso da última desinstalação (fica em cima da lista) ---------- */

  function paintBanner() {
    if (!V.banner) return;
    V.banner.replaceChildren();
    const j = S.job;
    if (!j || j.dismissed) return;
    if (S.openId === j.appId && V.dr) return;          // a gaveta já mostra
    const nome = inl(j.app.nome);
    const x = K.el('button', { class: 'un-banner-x', type: 'button', 'aria-label': K.t('Fechar o aviso'), title: K.t('Fechar o aviso'), html: K.icon('close'),
      onclick: () => { K.sound.tick(); j.dismissed = true; paintBanner(); } });
    let box;
    if (j.mode === 'running') {
      box = K.el('div', { class: 'tip un-banner', role: 'status' },
        K.el('span', { class: 'un-banner-spin', 'aria-hidden': 'true' }),
        K.el('p', null, K.t('Desinstalando {0}… Se pedir senha, é o macOS.', nome)));
    } else if (j.mode === 'error') {
      box = K.el('div', { class: 'tip un-banner crit', role: 'alert', html: K.icon('alert') },
        K.el('p', null, K.el('b', null, K.t('Não consegui desinstalar {0}. ', nome)), K.t('O motivo: {0}. Nada foi mexido.', why(j.err))), x);
    } else {
      const u = j.undo && j.undo.res;
      if (u) {
        const back = undoBack(j);
        box = K.el('div', { class: 'tip un-banner ' + (back.app ? 'good' : 'warn'), role: 'status', html: K.icon(back.app ? 'unUndo' : 'alert') },
          K.el('p', null, back.app ? K.t('{0} voltou pro lugar{1}.', nome, back.failRest ? K.t(', mas {0}', plural(back.failRest, K.t('sobra não voltou'), K.t('sobras não voltaram'))) : '')
            : K.t('{0} não voltou pro lugar: dá pra devolver pela Lixeira do Finder.', nome)),
          K.el('button', { class: 'btn small', type: 'button', onclick: () => { reopenJob(); } }, K.t('Ver detalhes')), x);
      } else {
        const moved = jobMoved(j);
        box = K.el('div', { class: 'tip un-banner good', role: 'status', html: K.icon('check') },
          K.el('p', null, K.el('b', null, K.t('{0} foi pra Lixeira', nome)), K.t(' às {0} ({1}{2}).', K.fmt.time(j.at), fmtB(moved.bytes), moved.rest ? K.t(', com {0}', plural(moved.rest, K.t('sobra'), K.t('sobras'))) : '')),
          K.el('div', { class: 'un-banner-act' },
            canUndo(j) ? K.el('button', { class: 'btn small', type: 'button', html: K.icon('unUndo'), disabled: !!(j.undo && j.undo.busy), onclick: () => { undo(); } },
              j.undo && j.undo.busy ? K.t('Devolvendo…') : K.t('Desfazer')) : null,
            K.el('button', { class: 'btn small', type: 'button', onclick: () => { reopenJob(); } }, K.t('Ver o que foi'))),
          x);
      }
    }
    V.banner.appendChild(box);
  }

  function reopenJob() {
    if (!S.job) return;
    K.sound.plop();
    openDrawer(S.job.appId);
  }

  /* ---------- corpo: esperando, erro, vazio ou a grade ---------- */

  function paintBody() {
    if (!V.body) return;
    clearTimers();
    clearMascots(V.mascots);
    V.body.replaceChildren();
    V.grid = null;
    if (S.mode === 'idle' || S.mode === 'loading') paintWait();
    else if (S.mode === 'error') paintError();
    else if (!S.apps.length) paintNone();
    else paintGrid();
  }

  function paintWait() {
    const art = K.el('div', { class: 'un-wait-art' },
      K.el('div', { class: 'un-wait-mascot' }),
      K.el('span', { class: 'un-wait-badge', html: K.icon('box') }),
      K.el('div', { class: 'un-bubble' }, K.t('Quantos apps\nserá que tem?')));
    const secs = K.el('span', { class: 'num' }, '');
    const msg = K.el('h2', { class: 'un-wait-msg' }, WAIT_MSGS[0]);
    const slow = K.el('p', { class: 'un-wait-slow muted', hidden: true }, K.t('Demorando mais que o normal. Pode trocar de tela, eu continuo.'));
    const tick = () => {
      const s = Math.max(0, Math.floor((performance.now() - S.t0) / 1000));
      secs.textContent = K.fmt.num(s, 0) + K.t(' s');
      msg.textContent = WAIT_MSGS[Math.min(WAIT_MSGS.length - 1, Math.floor(s / 2.2))];
      slow.hidden = s < 20;
    };
    tick();
    const card = K.el('section', { class: 'card un-wait pop-in', role: 'status', 'aria-live': 'polite' },
      art,
      K.el('div', { class: 'un-wait-text' },
        K.el('span', { class: 'sticker un-when-st' }, K.t('Contando seus apps… '), secs),
        msg,
        K.el('p', null, K.t('Leva uns 8 segundos.')),
        K.el('div', { class: 'un-wait-track', 'aria-hidden': 'true' }, K.el('i')),
        K.el('div', { class: 'un-places' }, K.el('span', { class: 'un-places-t' }, K.t('Onde eu olho:')),
          K.el('span', { class: 'un-place', html: K.icon('unFolder') }, K.t('Aplicativos')),
          K.el('span', { class: 'un-place', html: K.icon('unFolder') }, K.t('Meus aplicativos'))),
        slow));
    const ghosts = K.el('div', { class: 'un-grid is-ghost', 'aria-hidden': 'true' });
    for (let i = 0; i < 6; i++) {
      ghosts.appendChild(K.el('div', { class: 'un-ghost', style: { animationDelay: (i * 0.12).toFixed(2) + 's' } },
        K.el('i', { class: 'g-ic' }), K.el('i', { class: 'g-l1' }), K.el('i', { class: 'g-l2' }), K.el('i', { class: 'g-l3' })));
    }
    V.body.append(card, ghosts);
    addMascot(art.querySelector('.un-wait-mascot'), 136, { face: 'happy' });
    if (!snap()) V.timers.push(setInterval(tick, 500));
  }

  function paintError() {
    /* o mesmo cartão de erro de todas as telas (K.errorCard) */
    const c = K.errorCard({ title: K.t('Não consegui listar os apps'), reason: why(S.err), retry: () => { load(); }, retryHint: K.t('Leva uns 8 segundos.') });
    c.classList.add('pop-in');
    V.body.appendChild(c);
  }

  function paintNone() {
    const art = K.el('div', { class: 'un-wait-art' }, K.el('div', { class: 'un-wait-mascot' }));
    V.body.appendChild(K.el('section', { class: 'card un-wait is-none pop-in' },
      art,
      K.el('div', { class: 'un-wait-text' },
        K.el('h2', null, K.t('Nenhum app pra desinstalar por aqui')),
        K.el('p', null, K.t('Os apps do macOS (Safari, Mail, Fotos…) não aparecem aqui.')),
        K.el('div', { class: 'un-act' },
          K.el('button', { class: 'btn', type: 'button', html: K.icon('unRefresh'), onclick: () => { K.sound.plop(); load(); } }, K.t('Procurar de novo'))))));
    addMascot(art.firstChild, 128, { face: 'joy' });
  }

  function paintGrid() {
    if (!V.body || S.mode !== 'ready' || !S.apps.length) return;
    const list = visibleApps();
    const filtered = !!S.q.trim() || S.filter !== 'todos';
    const countTxt = filtered ? K.t('Mostrando {0} de {1}', K.fmt.num(list.length), plural(S.apps.length, K.t('app'), K.t('apps'))) : '';
    if (V.count) V.count.textContent = countTxt;
    V.body.replaceChildren();
    clearMascots(V.mascots);
    V.cards = new Map();
    if (!list.length) { V.body.appendChild(filterEmpty()); return; }
    if (filtered) {
      V.body.appendChild(K.el('div', { class: 'un-showing', 'aria-hidden': 'true' },
        K.el('span', null, countTxt, list.length ? ` · ${fmtB(sum(list))}` : ''),
        K.el('button', { class: 'btn small ghost', type: 'button', html: K.icon('close'),
          onclick: () => { K.sound.tick(); S.q = ''; if (V.search) V.search.value = ''; paintClear(); S.filter = 'todos'; paintTools(); paintGrid(); } }, K.t('Ver todos'))));
    }
    const max = Math.max(1, ...S.apps.map((a) => a.bytes || 0));
    const top3 = new Set(S.apps.slice().sort((x, y) => (y.bytes || 0) - (x.bytes || 0)).slice(0, 3).map((a) => a.id));
    const grid = K.el('div', { class: 'un-grid' });
    list.forEach((a, i) => grid.appendChild(appCard(a, i, max, top3)));
    V.grid = grid;
    V.body.appendChild(grid);
  }

  function filterEmpty() {
    const q = S.q.trim();
    let title, text;
    if (q) { title = K.t('Nenhum app com “{0}” no nome', inl(q)); text = S.filter !== 'todos' ? K.t('A busca está junto com um filtro: tente “Todos”.') : K.t('Confira a grafia ou busque um pedaço do nome.'); }
    else if (S.filter === 'parados') { title = K.t('Nenhum app parado há 6 meses ou mais'); text = K.t('Bom sinal: você usa o que tem instalado.'); }
    else if (S.filter === 'grandes') { title = K.t('Nenhum app com 500 MB ou mais'); text = K.t('Seus apps são levinhos.'); }
    else { title = K.t('Nenhum app da App Store aqui'); text = K.t('Os apps desta lista vieram de fora da App Store.'); }
    const art = K.el('div', { class: 'un-empty-art' });
    const box = K.el('section', { class: 'un-empty pop-in' }, art,
      K.el('div', null, K.el('h3', null, title), K.el('p', null, text),
        K.el('div', { class: 'un-act' },
          q ? K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.tick(); clearSearch(); } }, K.t('Limpar a busca')) : null,
          S.filter !== 'todos' ? K.el('button', { class: 'btn small', type: 'button', onclick: () => setFilter('todos') }, K.t('Ver todos')) : null)));
    addMascot(art, 92, { face: q ? 'worried' : 'joy' });
    return box;
  }

  function appCard(a, i, max, top3) {
    const nome = vis(a.nome);
    const big3 = !!top3 && top3.has(a.id);
    const pct = Math.max(a.bytes > 0 ? 1.5 : 0, Math.min(100, ((a.bytes || 0) / max) * 100));
    const used = K.el('span', { class: 'un-app-used' + (a.aberto ? ' is-open' : !isNum(a.usado) ? ' is-none' : stale(a) ? ' is-stale' : ''),
      title: a.aberto ? K.t('Salve e feche o app antes de desinstalar.') : isNum(a.usado) ? K.t('Aberto pela última vez em {0}', dateTxt(a.usado)) : NO_USE, html: K.icon(a.aberto ? 'lock' : stale(a) ? 'moon' : 'clock') },
    usedTxt(a));
    const card = K.el('button', {
      class: 'card un-app pop-in' + (a.aberto ? ' is-open' : '') + (S.openId === a.id ? ' is-on' : ''), type: 'button',
      dataset: { id: a.id }, style: { animationDelay: Math.min(i, 14) * 35 + 'ms' },
      'aria-label': K.t('{0}, {1}, {2}. Abrir pra desinstalar.', nome, fmtB(a.bytes), a.aberto ? K.t('aberto agora (feche antes de desinstalar)') : usedTxt(a)),
      onclick: () => { K.sound.plop(); openDrawer(a.id); },
    },
    K.el('span', { class: 'un-app-top' },
      appIcon(a, 'un-ic un-app-ic'),
      K.el('span', { class: 'un-app-id' },
        K.el('span', { class: 'un-app-name', title: nome }, nome),
        K.el('span', { class: 'un-app-ver' }, a.versao ? K.t('versão {0}', vis(a.versao)) : K.t('sem número de versão')))),
    K.el('span', { class: 'un-tags' }, appTags(a)),
    K.el('span', { class: 'un-app-foot' },
      K.el('span', { class: 'un-app-size num' }, fmtB(a.bytes)),
      used),
    /* a faixa de tamanho só nos 3 maiores, com legenda: nos outros ela parecia barra de carregamento */
    big3 ? K.el('span', { class: 'un-app-bar', title: K.t('Tamanho perto do maior app da lista') }, K.el('i', { style: { width: pct.toFixed(1) + '%' } })) : null);
    V.cards.set(a.id, card);
    return card;
  }

  function markCards() {
    if (!V.cards) return;
    for (const [id, c] of V.cards) c.classList.toggle('is-on', id === S.openId);
  }

  /* ================= gaveta: o app escolhido e as sobras ================= */

  function openDrawer(id) {
    const a = appById(id);
    if (!a || !mounted()) return Promise.resolve();
    const was = S.openId;
    S.openId = id;
    if (was !== id) S.stillOpen = false;
    if (!V.dr) {
      V.lastFocus = document.activeElement;
      const scrim = K.el('div', { class: 'un-scrim', onclick: () => closeDrawer() });
      const box = K.el('aside', { class: 'un-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'un-d-title' });
      host.append(scrim, box);
      V.dr = { scrim, box, mascots: [] };
      host.classList.add('un-has-drawer');
    }
    const job = S.job && S.job.appId === id ? S.job : null;
    const p = job && job.mode !== 'error' ? Promise.resolve() : loadRest(id);
    paintDrawer({ fresh: was !== id });
    paintBanner();
    markCards();
    setTimeout(() => { const t = V.dr && V.dr.box.querySelector('#un-d-title'); if (t) t.focus({ preventScroll: true }); }, 30);
    return p;
  }

  function closeDrawer() {
    if (!V.dr) { S.openId = null; return; }
    const dr = V.dr;
    V.dr = null;
    clearMascots(dr.mascots);
    const calm = snap() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) { dr.box.remove(); dr.scrim.remove(); }
    else {
      dr.box.classList.add('out');
      dr.scrim.classList.add('out');
      setTimeout(() => { dr.box.remove(); dr.scrim.remove(); }, 200);
    }
    const id = S.openId;
    S.openId = null;
    if (host) host.classList.remove('un-has-drawer');
    markCards();
    paintBanner();
    const card = V.cards && V.cards.get(id);
    const back = card && document.contains(card) ? card : V.lastFocus;
    if (back && document.contains(back) && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
  }

  function paintDrawer(o) {
    if (!V.dr || !S.openId) return;
    const a = appById(S.openId);
    if (!a) { closeDrawer(); return; }
    const box = V.dr.box;
    const old = box.querySelector('.un-d-scroll');
    const keep = old && !(o && o.fresh) ? old.scrollTop : 0;
    clearMascots(V.dr.mascots);
    const j = S.job && S.job.appId === a.id ? S.job : null;
    /* a gaveta é refeita (ex.: quando as sobras chegam): o foco do teclado volta pro mesmo lugar,
       ou pro título, em vez de cair no BODY */
    K.keepFocus(box, () => {
      box.replaceChildren();
      V.rr = null;
      if (j && j.mode === 'done') paintResult(box, a, j);
      else paintDetail(box, a, j);
    }, '#un-d-title');
    const sc = box.querySelector('.un-d-scroll');
    if (sc && keep) sc.scrollTop = keep;
  }

  function closeBtn() {
    return K.el('button', { class: 'un-d-close', type: 'button', 'aria-label': K.t('Fechar'), title: K.t('Fechar (Esc)'), html: K.icon('close'),
      onclick: () => { K.sound.tick(); closeDrawer(); } });
  }

  function paintDetail(box, a, j) {
    const running = !!j && j.mode === 'running';
    const R = restOf(a.id);
    const nome = vis(a.nome);

    /* cabeça dourada: o app em destaque */
    const head = K.el('header', { class: 'un-d-head' },
      closeBtn(),
      K.el('div', { class: 'un-d-hero' },
        appIcon(a, 'un-ic un-d-ic'),
        K.el('div', { class: 'un-d-id' },
          K.el('h2', { id: 'un-d-title', tabindex: '-1' }, nome),
          K.el('p', { class: 'un-d-ver' }, a.versao ? K.t('versão {0}', vis(a.versao)) : K.t('sem número de versão')),
          K.el('span', { class: 'un-tags' }, appTags(a)))));
    const used = a.aberto ? 'agora' : isNum(a.usado) ? `${ago(a.usado)}` : K.t('sem registro');
    const facts = K.el('dl', { class: 'un-d-facts' },
      K.el('div', null, K.el('dt', null, K.t('O app ocupa')), K.el('dd', { class: 'num' }, fmtB(a.bytes))),
      K.el('div', { title: a.aberto ? null : isNum(a.usado) ? K.t('Aberto pela última vez em {0}', dateTxt(a.usado)) : NO_USE },
        K.el('dt', null, K.t('Último uso')), K.el('dd', { class: isNum(a.usado) || a.aberto ? '' : 'is-none' }, used,
          isNum(a.usado) && !a.aberto ? K.el('small', null, dateTxt(a.usado)) : null)),
      K.el('div', null, K.el('dt', null, K.t('Onde está')), K.el('dd', null, vis(a.local) || K.t('Aplicativos'))));
    const path = K.el('p', { class: 'un-d-path selectable', title: vis(a.caminho) }, vis(a.caminho));

    const parts = [head, K.el('div', { class: 'un-d-sheet' }, facts, path)];

    /* avisos */
    const notes = [];
    if (j && j.mode === 'error') {
      const old = /lista ficou velha|está aberto/.test(why(j.err));
      notes.push(K.el('div', { class: 'tip un-note crit', role: 'alert', html: K.icon('alert') },
        K.el('p', null, K.el('b', null, K.t('Não consegui desinstalar. ')), K.t('O motivo: {0}. Nada foi mexido.', why(j.err))),
        old ? K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.plop(); S.job = null; load({ silent: true }); } }, K.t('Atualizar')) : null));
    }
    if (a.aberto) {
      notes.push(K.el('div', { class: 'tip un-note warn un-open-note', html: K.icon('lock') },
        K.el('p', null, K.el('b', null, `${inl(a.nome)} ${S.stillOpen ? K.t('ainda está aberto') : K.t('está aberto agora')}. `),
          S.stillOpen ? K.t('Ele pode rodar sem janela: feche com ⌘Q e confira de novo.')
            : K.t('Salve, feche o app e confira de novo.')),
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('unRefresh'), disabled: S.checking || S.refreshing,
          onclick: () => { K.sound.plop(); S.checking = true; paintDrawer(); load({ silent: true }); } },
        S.checking || S.refreshing ? K.t('Conferindo…') : K.t('Já fechei, conferir'))));
    }
    if (a.appStore || a.apple || a.doAdministrador) {
      notes.push(K.el('div', { class: 'tip un-note', html: K.icon(a.appStore ? 'unBag' : 'unMac') },
        K.el('p', null, a.appStore
          ? K.t('Da App Store: o Finder pode pedir sua senha. Dá pra baixar de novo nas suas compras.')
          : a.apple ? K.t('É da Apple, mas dá pra tirar. O Finder pode pedir sua senha.')
          : K.t('Instalado com senha de administrador: o Finder pode pedir sua senha.'))));
    }
    if (a.outrasCopias > 0) {
      notes.push(K.el('div', { class: 'tip un-note warn', html: K.icon('info') },
        K.el('p', null, K.t('Tem {0} desse app no Mac, que {1} os mesmos dados. Por isso nenhuma sobra vem marcada.', a.outrasCopias === 1 ? K.t('outra cópia') : K.t('{0} outras cópias', a.outrasCopias), a.outrasCopias === 1 ? K.t('usa') : K.t('usam')))));
    }
    if (notes.length) parts.push(K.el('div', { class: 'un-d-notes' }, notes));

    /* sobras */
    parts.push(restSection(a, R, running));

    parts.push(K.el('ul', { class: 'un-d-facts2' },
      K.el('li', { html: K.icon('unCard') }, K.t('Tirar o app não cancela assinatura.')),
      K.el('li', { html: K.icon('unSafe') }, K.t('Só mexo na sua pasta. O que foi instalado pro Mac todo fica de fora.')),
      K.el('li', { html: K.icon('unFolder') }, K.t('Procuro pelo nome exato do app. Pasta com outro nome (o VS Code usa “Code”) fica de fora.'))));

    box.appendChild(K.el('div', { class: 'un-d-scroll' }, parts));
    box.appendChild(footEl(a, R, running));
    paintFoot();
    refreshRest();
  }

  function restSection(a, R, running) {
    const sec = K.el('section', { class: 'un-rest' });
    const title = K.el('h3', null, K.t('Sobras na sua pasta'));
    if (!R || R.mode === 'loading') {
      sec.append(K.el('div', { class: 'un-rest-head' }, K.el('span', { class: 'head-ic', html: K.icon('unFolder') }), K.el('div', null, title)),
        K.el('div', { class: 'loading un-rest-loading' }, K.t('Procurando o que o {0} deixou…', inl(a.nome))));
      return sec;
    }
    if (R.mode === 'error') {
      sec.append(K.el('div', { class: 'un-rest-head' }, K.el('span', { class: 'head-ic none', html: K.icon('info') }), K.el('div', null, title)),
        K.el('div', { class: 'tip un-note', html: K.icon('info') },
          K.el('p', null, K.t('Não consegui procurar as sobras ({0}). Dá pra desinstalar só o app.', why(R.err))),
          K.el('button', { class: 'btn small', type: 'button', html: K.icon('unRefresh'), onclick: () => { K.sound.plop(); loadRest(a.id, true); paintDrawer(); } }, K.t('Tentar de novo'))));
      return sec;
    }
    const items = Array.from(R.items.values()).sort((x, y) => (y.bytes || 0) - (x.bytes || 0));
    const ok = items.filter(restOk);
    const d = R.data || {};
    if (!items.length) {
      sec.append(K.el('div', { class: 'un-rest-head' }, K.el('span', { class: 'head-ic good', html: K.icon('sparkle') }),
        K.el('div', null, title, K.el('p', null, d.incompleto ? K.t('Nada até onde consegui olhar.') : K.t('Nada espalhado na sua pasta. Só o app vai pra Lixeira.')))));
    } else {
      const all = K.checkbox({ label: K.t('Marcar todas as sobras'), onchange: () => toggleAll(a.id) });
      const selT = K.el('span', { class: 'un-rest-sel' });
      sec.append(K.el('div', { class: 'un-rest-head' }, all,
        K.el('div', { class: 'un-rest-ht' }, title,
          K.el('p', null, K.t('{0}, {1}. Marquei os que são do app com certeza.', plural(items.length, K.t('item'), K.t('itens')), fmtB(sum(items))))),
        selT));
      const ul = K.el('ul', { class: 'un-rest-list' });
      const rows = new Map();
      items.forEach((it) => { const r = restRow(a, it, running); rows.set(it.id, r); ul.appendChild(r.row); });
      sec.appendChild(ul);
      V.rr = { id: a.id, all, selT, rows, ok, running };
    }
    const extra = [];
    if (d.incompleto) extra.push(K.el('div', { class: 'tip un-note warn', html: K.icon('clock') }, K.el('p', null, K.t('Parei no meio: pode ter mais.'))));
    if (d.semAcesso > 0) {
      extra.push(K.el('div', { class: 'tip un-note', html: K.icon('lock') },
        K.el('p', null, K.t('O macOS não me deixou ler {0}. Com Acesso Total ao Disco eu vejo tudo.', d.semAcesso === 1 ? K.t('uma pasta') : K.t('{0} pastas', K.fmt.num(d.semAcesso)))),
        K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'privacidade-disco' }).catch(() => {}); } }, K.t('Abrir Ajustes'))));
    }
    if (extra.length) sec.appendChild(K.el('div', { class: 'un-d-notes' }, extra));
    return sec;
  }

  function restRow(a, it, running) {
    const k = kindOf(it);
    const ok = restOk(it);
    const chk = K.checkbox({ label: K.t('Marcar {0}: {1}', k.label, vis(it.caminho)), onchange: () => toggleRest(a.id, it.id) });
    const tags = K.el('span', { class: 'un-tags' });
    if (byName(it)) tags.appendChild(tag('warn', 'eye', 'confira', K.t('Achei pelo nome “{0}”, não pelo identificador do app: pode ser de outro programa com o mesmo nome.', vis(a.nome))));
    if (k.data) tags.appendChild(tag('data', 'unData', K.t('guarda dados'), K.t('O que o app guardou (logins, ajustes, arquivos dele). Vai junto com o app.')));
    if (it.semAcesso) tags.appendChild(tag('none', 'lock', K.t('sem acesso'), K.t('O macOS não deixou ler esta pasta (falta Acesso Total ao Disco).')));
    else if (it.parcial) tags.appendChild(tag('warn', 'lock', K.t('parte sem acesso'), K.t('Uma parte desta pasta não deu pra ler: o tamanho é o mínimo.')));
    if (tricky(it.caminho)) tags.appendChild(tag('warn', 'alert', K.t('nome disfarçado'), K.t('O caminho tem um caractere invisível que troca a ordem das letras. Mostro um � no lugar.')));
    const note = byName(it)
      ? K.t('{0}Pode ser de outro programa: marque só se tiver certeza.', k.note ? k.note + ' ' : '')
      : k.note || vis(String(it.nota || '').replace(BYNAME, '').trim());
    const unread = it.semAcesso && !it.bytes;
    const revealBtn = K.el('button', { class: 'un-reveal', type: 'button', title: K.t('Mostrar no Finder'), 'aria-label': K.t('Mostrar {0} no Finder', k.label), html: K.icon('unFinder'),
      onclick: (e) => { e.stopPropagation(); reveal(it.id, row); } });
    const row = K.el('li', { class: 'un-rest-row' + (ok ? '' : ' is-off') + (byName(it) ? ' is-check' : ''), dataset: { id: it.id } },
      chk,
      K.el('span', { class: 'un-rest-ic', 'aria-hidden': 'true', html: K.icon(k.icon) }),
      K.el('span', { class: 'un-rest-text' },
        K.el('span', { class: 'un-rest-top' }, K.el('span', { class: 'un-rest-name' }, k.label), tags),
        K.el('span', { class: 'un-rest-path', title: vis(it.caminho) }, vis(it.caminho)),
        note ? K.el('span', { class: 'un-rest-note' }, note) : null),
      K.el('span', { class: 'un-rest-size num' + (unread ? ' no-read' : '') }, unread ? K.t('sem leitura') : it.parcial ? K.el('small', null, K.t('pelo menos ')) : null, unread ? null : fmtB(it.bytes)),
      revealBtn);
    row.addEventListener('click', (e) => { if (e.target.closest('button')) return; if (ok && !running) toggleRest(a.id, it.id); });
    return { row, chk, it };
  }

  async function reveal(id, row) {
    K.sound.plop();
    try { await K.api('cleanup.reveal', { id }); } catch (e) {
      K.sound.oops();
      const old = row.querySelector('.un-row-msg');
      if (old) old.remove();
      const msg = K.el('span', { class: 'un-row-msg', role: 'status' }, K.t('Não achei no Finder: pode ter mudado de lugar.'));
      row.querySelector('.un-rest-text').appendChild(msg);
      setTimeout(() => msg.remove(), 6000);
    }
  }

  function toggleRest(appId, itemId, force) {
    const R = restOf(appId);
    if (!R || R.mode !== 'ready' || (S.job && S.job.appId === appId && S.job.mode === 'running')) return;
    const it = R.items.get(itemId);
    if (!restOk(it)) return;
    const on = force != null ? !!force : !R.sel.has(itemId);
    if (on === R.sel.has(itemId)) return;
    if (on) R.sel.add(itemId); else R.sel.delete(itemId);
    R.touched = true;
    K.sound.tick();
    refreshRest();
    paintFoot();
  }

  function toggleAll(appId) {
    const R = restOf(appId);
    if (!R || R.mode !== 'ready') return;
    const ok = Array.from(R.items.values()).filter(restOk);
    const all = ok.every((it) => R.sel.has(it.id));
    for (const it of ok) { if (all) R.sel.delete(it.id); else R.sel.add(it.id); }
    R.touched = true;
    K.sound.tick();
    refreshRest();
    paintFoot();
  }

  /** caixas, "marcadas", total e botão, sem redesenhar a lista (a rolagem fica onde está) */
  function refreshRest() {
    const rr = V.rr;
    if (!rr) return;
    const R = restOf(rr.id);
    if (!R) return;
    for (const [id, r] of rr.rows) {
      const ok = restOk(r.it);
      const on = R.sel.has(id) && ok;
      r.chk.set(on, !ok || rr.running);
      r.row.classList.toggle('is-sel', on);
    }
    const n = rr.ok.filter((it) => R.sel.has(it.id)).length;
    rr.all.set(n === 0 ? false : n === rr.ok.length ? true : 'mixed', !rr.ok.length || rr.running);
    rr.selT.textContent = n ? `${plural(n, K.t('marcado'), K.t('marcados'))}` : K.t('nada marcado');
  }

  function footEl(a, R, running) {
    V.foot = {
      lab: K.el('span', { class: 'un-foot-lab' }),
      big: K.el('b', { class: 'un-foot-big num' }),
      sub: K.el('span', { class: 'un-foot-sub' }),
      goT: K.el('span', null, K.t('Desinstalar')),
    };
    V.foot.go = K.el('button', { class: 'btn gold un-go', type: 'button', html: K.icon('unTrash'), onclick: () => { uninstall(); } }, V.foot.goT);
    return K.el('footer', { class: 'un-d-foot' },
      K.el('div', { class: 'un-foot-text', role: 'status', 'aria-live': 'polite' }, V.foot.lab, V.foot.big, V.foot.sub),
      V.foot.go);
  }

  function paintFoot() {
    const f = V.foot;
    if (!f || !S.openId) return;
    const a = appById(S.openId);
    if (!a) return;
    const R = restOf(a.id);
    const running = !!S.job && S.job.appId === a.id && S.job.mode === 'running';
    const items = selItems(a.id);
    const rb = sum(items);
    const total = (a.bytes || 0) + rb;
    const loadingRest = !R || R.mode === 'loading';
    const other = !!S.job && S.job.mode === 'running' && S.job.appId !== a.id;
    f.go.classList.toggle('is-busy', running);
    if (running) {
      f.lab.textContent = K.t('Levando pra Lixeira…');
      f.big.textContent = fmtB(total);
      f.sub.textContent = K.t('Se pedir senha, é o macOS.');
      f.goT.textContent = K.t('Desinstalando…');
      f.go.disabled = true;
      return;
    }
    if (a.aberto) {
      f.lab.textContent = K.t('O app está aberto');
      f.big.textContent = fmtB(total);
      f.sub.textContent = K.t('Com ele aberto, eu não mexo.');
      f.goT.textContent = K.t('Feche o app antes');
      f.go.disabled = true;
      return;
    }
    if (other) {
      f.lab.textContent = K.t('Vai pra Lixeira');
      f.big.textContent = fmtB(total);
      f.sub.textContent = K.t('Ainda estou desinstalando {0}: um de cada vez.', inl(S.job.app.nome));
      f.goT.textContent = K.t('Espere um pouco');
      f.go.disabled = true;
      return;
    }
    f.lab.textContent = K.t('Vai pra Lixeira');
    f.big.textContent = fmtB(total);
    if (loadingRest) f.sub.textContent = K.t('Procurando as sobras…');
    else if (R.mode === 'error') f.sub.textContent = K.t('Só o app (não consegui ver as sobras)');
    else if (!R.items.size) f.sub.textContent = K.t('Só o app: não achei sobras');
    else if (!items.length) f.sub.textContent = K.t('O app ({0}); nenhuma sobra marcada', fmtB(a.bytes));
    else f.sub.textContent = K.t('O app ({0}) + {1} ({2})', fmtB(a.bytes), plural(items.length, K.t('sobra'), K.t('sobras')), fmtB(rb));
    f.goT.textContent = loadingRest ? K.t('Procurando sobras…') : R.mode === 'error' ? K.t('Desinstalar só o app') : K.t('Desinstalar');
    f.go.disabled = loadingRest;
  }

  /* ================= desinstalar → confirmar → resultado ================= */

  function confirmList(a, items) {
    const rows = [K.el('li', { class: 'is-app' }, appIcon(a, 'un-ic un-cf-ic'),
      K.el('span', { class: 'un-cf-name' }, vis(a.nome), K.el('small', null, K.t(' o app'))),
      K.el('b', { class: 'num' }, fmtB(a.bytes)))];
    const top = items.slice().sort((x, y) => (y.bytes || 0) - (x.bytes || 0));
    /* janela baixa: lista mais curta, pra os avisos caberem sem rolar */
    const room = innerHeight < 720 ? 2 : 3;
    const max = top.length > room + 1 ? room : room + 1;
    top.slice(0, max).forEach((it) => {
      const k = kindOf(it);
      rows.push(K.el('li', null, K.el('span', { class: 'un-cf-k', html: K.icon(k.icon) }),
        K.el('span', { class: 'un-cf-name', title: vis(it.caminho) }, k.label),
        K.el('b', { class: 'num' }, it.parcial ? K.t('pelo menos ') : '', fmtB(it.bytes))));
    });
    if (top.length > max) {
      const rest = top.slice(max);
      rows.push(K.el('li', { class: 'un-cf-rest' }, K.el('span', { class: 'un-cf-k' }),
        K.el('span', { class: 'un-cf-name' }, K.t('e mais {0}', plural(rest.length, K.t('sobra'), K.t('sobras')))), K.el('b', { class: 'num' }, fmtB(sum(rest)))));
    }
    return K.el('ul', { class: 'un-cf' }, rows);
  }

  /** um aviso só (os dados vão junto; achados só pelo nome): em janela baixa ele não some atrás da rolagem */
  function confirmNotes(a, items) {
    const bits = [];
    const data = items.filter((it) => kindOf(it).data);
    if (data.length) {
      const kinds = Array.from(new Set(data.map((it) => kindOf(it).label)));
      bits.push(K.el('b', null, K.t('Os dados do app vão junto ')),
        K.t('({0}). Se instalar de novo, ele começa do zero.', kinds.join(K.t(' e '))));
    }
    const named = items.filter(byName);
    if (named.length) {
      bits.push(K.t('{0}{1} só pelo nome: confira se {2} do {3}.', bits.length ? ' ' : '', named.length === 1 ? K.t('Uma sobra marcada foi achada') : K.t('{0} sobras marcadas foram achadas', K.fmt.num(named.length)), named.length === 1 ? K.t('é mesmo') : K.t('são mesmo'), inl(a.nome)));
    }
    if (!bits.length) return [];
    return [K.el('div', { class: 'tip un-cf-note warn', html: K.icon(data.length ? 'unData' : 'eye') }, K.el('p', null, bits))];
  }

  async function uninstall(opts) {
    opts = opts || {};
    let a = appById(S.openId);
    if (!a || !S.apps.includes(a)) return;
    if (S.job && S.job.mode === 'running') { K.sound.oops(); shake(V.foot && V.foot.go); return; }
    if (a.aberto) { K.sound.oops(); shake(V.foot && V.foot.go); return; }
    let R = restOf(a.id);
    if (!R || R.mode === 'loading') return;
    /* as sobras vencem em 1 h no Swift: lista velha procura de novo antes */
    if (R.mode === 'ready' && nowS() - R.at > REST_KEEP_S) {
      K.sound.oops();
      await loadRest(a.id, true);
      return;
    }
    let items = selItems(a.id);
    if (!opts.semConfirmar) {
      K.sound.plop();
      const n = items.length;
      const total = (a.bytes || 0) + sum(items);
      const left = R.mode === 'ready' ? Array.from(R.items.values()).filter((it) => !R.sel.has(it.id)).length : 0;
      const parcial = items.some((it) => it.parcial) ? K.t('pelo menos ') : '';
      const ok = await K.confirm({
        title: n ? K.t('Mandar o app {0} e {1} ({2}{3}) pra Lixeira?', inl(a.nome), plural(n, K.t('sobra'), K.t('sobras')), parcial, fmtN(total)) : K.t('Mandar o app {0} ({1}) pra Lixeira?', inl(a.nome), fmtN(total)),
        text: (n ? K.t('Vão o app e {0}.', n === 1 ? K.t('a sobra marcada') : K.t('as {0} sobras marcadas', K.fmt.num(n))) : K.t('Só o app vai.'))
          + (left ? K.t(' {0} onde {1}.', left === 1 ? K.t('A desmarcada fica') : K.t('As desmarcadas ficam'), left === 1 ? K.t('está') : K.t('estão')) : '')
          + (a.appStore || a.apple || a.doAdministrador ? K.t(' O Finder pode pedir sua senha.') : ''),
        body: [confirmList(a, items), ...confirmNotes(a, items)],
        /* app do administrador (App Store) vai pelo Finder: esse volta pela Lixeira do Finder, não pelo Desfazer daqui */
        note: (a.appStore || a.doAdministrador)
          ? { icon: 'unUndo', tone: 'good', text: K.t('Dá pra desfazer enquanto estiver na Lixeira. As sobras voltam pelo Desfazer; o app volta pela Lixeira do Finder (botão direito › Colocar de volta).') }
          : { icon: 'unUndo', tone: 'good', text: K.t('Dá pra desfazer enquanto estiver na Lixeira: aqui ou em Espaço › Lixeira.') },
        /* o mascote em cima do modal custa altura: em janela baixa os avisos valem mais */
        ok: K.t('Desinstalar'), cancel: K.t('Agora não'), icon: 'unTrash', mascot: innerHeight >= 720 ? 'happy' : null,
      });
      if (!ok) return;
      /* com o modal aberto a lista pode ter sido lida de novo (id novo pro mesmo app) */
      const cur = S.openId ? appById(S.openId) : null;
      if (!cur || !sameApp(cur, a) || !S.apps.includes(cur) || (S.job && S.job.mode === 'running')) { K.sound.oops(); return; }
      if (cur.aberto) { K.sound.oops(); paintDrawer(); shake(V.foot && V.foot.go); return; }
      a = cur;
      items = selItems(a.id);
    }
    S.job = { appId: a.id, app: a, mode: 'running', items, res: null, err: null, at: 0, undo: null, dismissed: false };
    paintDrawer();
    paintBanner();
    let res;
    try {
      res = await K.api('uninstall.run', { id: a.id, restos: items.map((it) => it.id), confirmado: true });
    } catch (e) {
      const j = S.job;
      if (j && j.appId === a.id) { j.mode = 'error'; j.err = errMsg(e); }
      K.sound.oops();
      if (mounted()) { paintDrawer(); paintBanner(); if (S.openId !== a.id) paintFoot(); }
      return;
    }
    const j = S.job;
    if (!j || j.appId !== a.id) return;
    j.mode = 'done';
    j.res = res || { app: true, mensagem: '' };
    j.at = nowS();
    if (j.res.restos && j.res.restos.caixaDeAreia) S.sandbox = true;
    for (const x of S.apps) if (sameApp(x, a)) S.rest.delete(x.id);
    S.apps = S.apps.filter((x) => !sameApp(x, a));
    S.rest.delete(a.id);
    K.sound.tada();
    if (mounted()) {
      const here = S.openId === a.id;
      if (!here) paintFoot();
      paintHead();
      paintTools();
      paintGrid();
      paintDrawer({ fresh: here });
      paintBanner();
      if (here) setTimeout(() => { const t = V.dr && V.dr.box.querySelector('#un-d-title'); if (t) t.focus({ preventScroll: true }); }, 30);
    }
  }

  function jobMoved(j) {
    const r = (j && j.res) || {};
    const rest = (r.restos && r.restos.movidos) || [];
    return { rest: rest.length, bytes: (r.app ? j.app.bytes || 0 : 0) + sum(rest), list: rest };
  }
  function lixIds(j) {
    const r = (j && j.res) || {};
    return [r.appLixeiraId].concat(((r.restos && r.restos.movidos) || []).map((m) => m.lixeiraId)).filter(Boolean);
  }
  const canUndo = (j) => !!j && j.mode === 'done' && !(j.undo && j.undo.res) && lixIds(j).length > 0;
  /** o que o Desfazer devolveu: o app voltou? quantas sobras não voltaram? */
  function undoBack(j) {
    const u = (j.undo && j.undo.res) || { ok: 0, falhas: [] };
    const failed = new Set((u.falhas || []).map((f) => f.id));
    const appId = j.res && j.res.appLixeiraId;
    const restIds = lixIds(j).filter((x) => x !== appId);
    return { app: !!appId && !failed.has(appId) && u.ok > 0, failRest: restIds.filter((x) => failed.has(x)).length, fails: u.falhas || [] };
  }

  async function undo() {
    const j = S.job;
    if (!canUndo(j) || (j.undo && j.undo.busy)) return;
    const ids = lixIds(j);
    K.sound.plop();
    j.undo = { busy: true };
    if (mounted()) { paintDrawer(); paintBanner(); }
    try {
      j.undo = { res: await K.api('cleanup.restore', { ids }) };
    } catch (e) {
      j.undo = { err: errMsg(e) };
    }
    const u = j.undo.res;
    if (u && u.ok && !(u.falhas || []).length) K.sound.tada(); else K.sound.oops();
    /* o app voltou pra pasta: a lista precisa de um id novo pra ele */
    if (u && u.ok) load({ silent: true });
    if (mounted()) { paintDrawer(); paintBanner(); }
  }

  function goLixeira() {
    K.sound.plop();
    closeDrawer();
    location.hash = '#/faxina?aba=lixeira';
  }

  function paintResult(box, a, j) {
    const r = j.res || {};
    const moved = jobMoved(j);
    const restFails = (r.restos && r.restos.falhas) || [];
    const u = j.undo && j.undo.res;
    const nome = inl(a.nome);
    let title, sub, face = 'joy';
    if (u) {
      const back = undoBack(j);
      if (back.app && !back.failRest) { title = K.t('Voltou tudo pro lugar'); sub = K.t('Nada foi apagado.'); face = 'happy'; }
      else if (back.app) { title = K.t('O app voltou, mas nem tudo'); sub = K.t('{0} na Lixeira. O motivo está abaixo.', plural(back.failRest, K.t('sobra continua'), K.t('sobras continuam'))); face = 'worried'; }
      else { title = K.t('Não consegui devolver'); sub = K.t('Continua tudo na Lixeira. Dá pra devolver pelo Finder.'); face = 'worried'; }
    } else if (j.undo && j.undo.err) {
      title = K.t('Não consegui desfazer');
      sub = K.t('O motivo: {0}. Continua tudo na Lixeira.', why(j.undo.err));
      face = 'worried';
    } else {
      title = K.t('Pronto! O app {0} foi pra Lixeira', nome);  // o tamanho vai no parágrafo
      sub = K.t('{0}{1} no total{2}. Até esvaziar a Lixeira, dá pra desfazer.', moved.rest ? K.t('Com {0}: ', plural(moved.rest, K.t('sobra'), K.t('sobras'))) : '', fmtB(moved.bytes), restFails.length ? K.t('; {0} (motivo abaixo)', plural(restFails.length, K.t('sobra ficou'), K.t('sobras ficaram'))) : '');
    }
    const busy = j.undo && j.undo.busy;
    const acts = K.el('div', { class: 'un-act' });
    if (canUndo(j) && !(j.undo && j.undo.err)) {
      acts.appendChild(K.el('button', { class: 'btn', type: 'button', html: K.icon('unUndo'), disabled: !!busy, onclick: () => { undo(); } }, busy ? K.t('Devolvendo…') : K.t('Desfazer')));
    }
    if (!u || !undoBack(j).app || undoBack(j).failRest) {
      acts.appendChild(K.el('button', { class: 'btn ink', type: 'button', html: K.icon('unTrash'), disabled: !!busy, onclick: () => { goLixeira(); } }, K.t('Ver na Lixeira')));
    }
    acts.appendChild(K.el('button', { class: 'btn' + (acts.childElementCount ? K.t(' ghost') : ''), type: 'button', html: K.icon('apps'), disabled: !!busy,
      onclick: () => { K.sound.tick(); closeDrawer(); } }, K.t('Voltar pra lista')));
    const art = K.el('div', { class: 'un-res-art' });
    const sticker = (S.sandbox || (r.restos && r.restos.caixaDeAreia) ? K.t('modo de teste · Lixeira de mentira · ') : '') + K.t('feito às {0}', K.fmt.time(j.at));
    const head = K.el('header', { class: 'un-d-head un-res-head' + (face === 'worried' ? ' is-sad' : '') },
      closeBtn(),
      ...(face === 'joy' ? sparkles(4) : []),
      K.el('div', { class: 'un-res-top' }, art, appIcon(a, 'un-ic un-res-ic')),
      K.el('span', { class: 'sticker un-when-st' }, sticker),
      K.el('h2', { id: 'un-d-title', tabindex: '-1' }, title),
      K.el('p', null, sub),
      acts);

    const parts = [head];
    /* o que foi (ou, depois do Desfazer, o que voltou: o que não voltou fica no cartão de falhas) */
    const backed = u ? new Set(lixIds(j).filter((x) => !(u.falhas || []).some((f) => f.id === x))) : null;
    const ul = K.el('ul', { class: 'un-cf un-res-list' });
    if (r.app && (!backed || backed.has(r.appLixeiraId))) ul.appendChild(K.el('li', { class: 'is-app' }, appIcon(a, 'un-ic un-cf-ic'),
      K.el('span', { class: 'un-cf-name' }, vis(a.nome), K.el('small', null, K.t(' o app'))), K.el('b', { class: 'num' }, fmtB(a.bytes))));
    const byId = new Map((j.items || []).map((it) => [it.id, it]));
    for (const m of moved.list) {
      if (backed && !backed.has(m.lixeiraId)) continue;
      const it = byId.get(m.id) || { caminho: '', nome: m.nome };
      const k = kindOf(it);
      ul.appendChild(K.el('li', null, K.el('span', { class: 'un-cf-k', html: K.icon(k.icon) }),
        K.el('span', { class: 'un-cf-name', title: vis(it.caminho) || null }, k.label), K.el('b', { class: 'num' }, fmtB(m.bytes))));
    }
    if (ul.childElementCount) {
      parts.push(K.el('section', { class: 'un-res-sec' },
        K.el('h3', null, u ? K.t('O que voltou pro lugar') : K.t('O que foi pra Lixeira')), ul));
    }

    /* falhas, sempre com o motivo */
    const failBlocks = [];
    if (restFails.length) failBlocks.push(failList(K.t('{0} pra Lixeira', plural(restFails.length, K.t('sobra não foi'), K.t('sobras não foram'))), restFails, j));
    if (u && (u.falhas || []).length) failBlocks.push(failList(K.t('Não voltou pro lugar'), u.falhas, j));
    parts.push(...failBlocks);
    if (!r.appLixeiraId && r.app && !u) {
      parts.push(K.el('div', { class: 'tip un-note', html: K.icon('info') },
        K.el('p', null, K.t('O app foi pela Lixeira do Finder. Pra devolver, use “Devolver” lá.'))));
    }
    if (!u) {
      parts.push(K.el('ul', { class: 'un-d-facts2' },
        K.el('li', { html: K.icon('unCard') }, K.t('Lembrete: tirar o app não cancela assinatura.')),
        K.el('li', { html: K.icon('unTrash') }, K.t('Mudou de ideia? Em Espaço › Lixeira dá pra devolver cada item.'))));
    }
    box.appendChild(K.el('div', { class: 'un-d-scroll' }, parts));
    addMascot(art, 96, { face }, V.dr.mascots);
  }

  function failList(title, fails, j) {
    const appId = j.res && j.res.appLixeiraId;
    const byLix = new Map();
    for (const m of (j.res && j.res.restos && j.res.restos.movidos) || []) {
      const it = (j.items || []).find((x) => x.id === m.id);
      if (it) byLix.set(m.lixeiraId, it);
    }
    const ul = K.el('ul', { class: 'un-fails' });
    fails.slice(0, 12).forEach((f) => {
      const it = (j.items || []).find((x) => x.id === f.id) || byLix.get(f.id);
      const name = f.id && f.id === appId ? K.t('{0} (o app)', vis(j.app.nome)) : it ? kindOf(it).label : vis(f.nome) || K.t('Sobra');
      let reason = why(f.motivo);
      if (f.id === appId && /permissão/.test(reason)) reason = K.t('o macOS não deixou (o app era do administrador): devolva pela Lixeira do Finder, com “Devolver”');
      ul.appendChild(K.el('li', null,
        K.el('span', { class: 'un-fail-ic', html: K.icon('info') }),
        K.el('span', { class: 'un-fail-name', title: it ? vis(it.caminho) : null }, name),
        K.el('span', { class: 'un-fail-why' }, reason)));
    });
    if (fails.length > 12) ul.appendChild(K.el('li', { class: 'muted' }, K.t('e mais {0}', plural(fails.length - 12, K.t('item'), K.t('itens')))));
    return K.el('section', { class: 'un-failcard' }, K.el('h3', null, title), ul);
  }

  /* ================= teclado ================= */

  function onKey(e) {
    if (!mounted() || (K.confirm.isOpen && K.confirm.isOpen())) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (V.dr) {
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
      if (e.key === 'Tab') {
        const f = K.$$('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', V.dr.box).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
      return;
    }
    if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing)) {
      if (V.search && !V.tools.hidden) { e.preventDefault(); V.search.focus(); V.search.select(); }
    }
  }

  /* ================= página ================= */

  K.pages.desinstalar = {
    title: K.t('Desinstalar'),
    async render(el) {
      host = el;
      V = { mascots: [], timers: [] };
      S.openId = null;
      S.checking = false;
      if (S.job && S.job.mode !== 'running') S.job.dismissed = S.job.dismissed || nowS() - (S.job.at || 0) > KEEP_S;
      if (!S.bat) {
        try { S.bat = await withTimeout(K.cached('battery.now', null, 5000), 700); } catch (e) { /* mascote no padrão */ }
        if (host !== el) return;
      }
      paintShell();
      const fresh = S.mode === 'ready' && nowS() - S.at < KEEP_S;
      if (S.mode !== 'loading' && !fresh) load();
      else paintAll();
      document.addEventListener('keydown', onKey);
      /* o modo foto espera a lista (até 20 s); no app de verdade a espera aparece na hora */
      if (snap() && S.promise) await Promise.race([S.promise, K.sleep(20000)]);
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      if (K.confirm.isOpen()) K.confirm.close(false);
      if (V.dr) { clearMascots(V.dr.mascots); V.dr = null; }
      clearTimers();
      clearMascots(V.mascots);
      S.openId = null;
      host = null;
      V = {};
    },
  };

  /* ================= ganchos de teste (tools/foto.sh) =================
     Só existem na build de desenvolvimento: na PUBLICO (app.version.publico) K.desinstalar é
     undefined, e nada de "desinstalar sem perguntar" fica no app distribuído. */

  const find = (q) => {
    const rx = q instanceof RegExp ? q : new RegExp(String(q), 'i');
    return S.apps.find((a) => rx.test(a.nome)) || null;
  };
  const hooks = {
    /** lê a lista de novo; {silent: true} mantém a lista velha na tela enquanto isso */
    load(o) { return load(o); },
    /** abre a gaveta do primeiro app cujo nome casa; resolve quando as sobras chegam */
    open(q) { const a = find(q); return a ? openDrawer(a.id) : Promise.resolve(null); },
    close() { closeDrawer(); },
    search(q) { S.q = String(q || ''); if (V.search) V.search.value = S.q; paintClear(); paintGrid(); },
    filter(id) { if (FILTERS.some((f) => f.id === id)) { S.filter = id; paintTools(); paintGrid(); } },
    sort(id) { if (SORTS.some((s) => s.id === id)) { S.sort = id; paintTools(); paintGrid(); } },
    /** marca (ou desmarca, com on=false) as sobras da gaveta cujo caminho casa */
    mark(re, on) {
      const R = S.openId && restOf(S.openId);
      if (!R || R.mode !== 'ready') return 0;
      const rx = re instanceof RegExp ? re : new RegExp(String(re), 'i');
      let n = 0;
      for (const it of R.items.values()) if (rx.test(it.caminho) && restOk(it)) { toggleRest(S.openId, it.id, on !== false); n++; }
      return n;
    },
    /** abre o modal de confirmação (sem esperar a resposta) */
    confirm() { uninstall(); },
    /** desinstala o app da gaveta; {semConfirmar: true} pula o modal (só testes) */
    uninstall(o) { return uninstall(o); },
    undo() { return undo(); },
    state() {
      const R = S.openId && restOf(S.openId);
      return {
        mode: S.mode, apps: S.apps.length, bytes: sum(S.apps), sandbox: S.sandbox, open: S.openId ? (appById(S.openId) || {}).nome : null,
        sobras: R && R.mode === 'ready' ? R.items.size : null, marcadas: S.openId ? selItems(S.openId).length : null,
        job: S.job ? { app: S.job.app.nome, mode: S.job.mode, err: S.job.err, res: S.job.res, undo: S.job.undo } : null,
      };
    },
    /** volta os filtros ao padrão e esquece a última desinstalação; {lista: true} esquece a lista também */
    reset(o) {
      S.q = ''; S.filter = 'todos'; S.sort = 'tamanho'; S.job = null;
      if (o && o.lista) { S.run++; S.mode = 'idle'; S.apps = []; S.rest = new Map(); S.at = 0; S.refreshing = false; S.promise = null; }
      if (mounted()) { closeDrawer(); if (V.search) V.search.value = ''; if (o && o.lista) load(); else paintAll(); }
    },
  };
  const hooksOn = () => snap() || !!(K.appVersion && K.appVersion.publico === false);
  Object.defineProperty(K, 'desinstalar', { configurable: true, get: () => (hooksOn() ? hooks : undefined) });
})();
