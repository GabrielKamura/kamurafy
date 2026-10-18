/* Kamurafy — Faxina (#/faxina): limpeza com a pessoa no controle.
   Quatro abas (pílulas no topo, grudam ao rolar):
     Sujeira          → botão redondo "Procurar sujeira", varredura categoria por categoria
                        (caches, programação, logs, macOS e, se pedir, Downloads esquecidos),
                        resultado com número herói, barra empilhada e cartões com caixas de marcar;
     Arquivos grandes → cleanup.large (100 MB ou mais nas pastas pessoais), filtro por tipo;
     Duplicados       → cleanup.duplicates, a interface nunca deixa marcar todas as cópias;
     Lixeira          → o que a Faxina mandou (devolver / apagar de vez) e esvaziar a Lixeira toda.
   Fluxo de limpeza igual nas três primeiras: marcar → barra fixa "Limpar X" → K.confirm →
   cleanup.clean (tudo vai pra Lixeira) → resultado com Desfazer / Apagar de vez / Ver a Lixeira.
   A interface só manda IDs que o Swift devolveu; nomes e caminhos entram só por textContent.
   Contrato em docs/ponte.md (cleanup.*). O estado sobrevive à troca de tela (IDs valem 1 h).
   Ganchos de teste em K.faxina (scan, selectAll, mark, clean, tab, open, undo, purge…), só na
   build de desenvolvimento. */
'use strict';

(function () {
  /* ícones só desta tela (mesmo traço do icons.js: viewBox 24, pontas redondas) */
  Object.assign(K.ICONS, {
    fxTrash: '<path d="M4 6.5h16"/><path d="M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7"/><path d="m6 6.5 1 12.3c.1 1 .9 1.7 1.9 1.7h6.2c1 0 1.8-.7 1.9-1.7l1-12.3"/><path d="M10 10.5v6M14 10.5v6"/>',
    fxUndo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
    fxFolder: '<path d="M3.5 7.5c0-1.1.9-2 2-2h3.8l2 2.2h7.2c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2Z"/>',
    fxFile: '<path d="M6.5 3.5h7L18 8v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M13.5 3.5V8H18"/>',
    fxDoc: '<path d="M6.5 3.5h7L18 8v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M13.5 3.5V8H18M8.5 12.5h6.5M8.5 16h4.5"/>',
    fxCode: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
    fxLogs: '<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    fxMac: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.8"/><path d="M2.5 18h19l-.9 1.3a1.6 1.6 0 0 1-1.3.7H4.7a1.6 1.6 0 0 1-1.3-.7Z"/>',
    fxDownload: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    fxBig: '<path d="M7.2 8.5h9.6l2.7 11.2H4.5Z"/><circle cx="12" cy="5.6" r="2.2"/><path d="M9.5 14.2h5"/>',
    fxCopy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    fxFilm: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
    fxMusic: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    fxImage: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="9" cy="9.5" r="1.7"/><path d="m4 17.5 5-5 4 4 2.5-2.5 4.5 4.5"/>',
    fxZip: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M12 3.5v2M12 7.5v2M12 11.5v2"/><rect x="10.3" y="14.5" width="3.4" height="3.5" rx="1"/>',
    fxFinder: '<path d="M3.5 7.5c0-1.1.9-2 2-2h3.8l2 2.2h7.2c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2Z"/><path d="m10.5 15.5 4-4M11.5 11.5h3v3"/>',
    fxFlask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.3a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2l-5.5-9.6V3.5"/><path d="M7.3 14.5h9.4"/>',
    fxChevron: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    fxSafe: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
    fxEye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    fxKeep: '<path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1Z"/>',
  });

  const PAL = (K.charts && K.charts.palette) || ['var(--s1)', 'var(--s2)', '#1baf7a', '#4a3aa7', '#e87ba4'];
  /* categorias da Sujeira, em ordem fixa (a cor segue K.charts.palette, nunca em ciclo) */
  const CATS = {
    caches: { icon: 'apps', color: PAL[0], titulo: K.t('Caches de apps'), short: K.t('os apps recriam sozinhos'), doing: K.t('Abrindo os caches dos apps…') },
    dev: { icon: 'fxCode', color: PAL[1], titulo: K.t('Caches de programação'), short: K.t('npm, pip, Xcode e companhia'), doing: K.t('Olhando npm, pip, Xcode…') },
    logs: { icon: 'fxLogs', color: PAL[2], titulo: K.t('Registros (logs)'), short: K.t('anotações e relatórios de travamento'), doing: K.t('Lendo os registros…') },
    sistema: { icon: 'fxMac', color: PAL[3], titulo: K.t('Caches do macOS'), short: K.t('temporários dos apps da Apple'), doing: K.t('Conferindo os caches do macOS…') },
    downloads: { icon: 'fxDownload', color: PAL[4], titulo: K.t('Downloads esquecidos'), short: K.t('parados há mais de 3 meses'), doing: K.t('Olhando a pasta Downloads…') },
  };
  const CAT_ORDER = ['caches', 'dev', 'logs', 'sistema', 'downloads'];

  const TIPOS = {
    video: { label: K.t('Vídeos'), icon: 'fxFilm' },
    instalador: { label: K.t('Instaladores'), icon: 'box' },
    compactado: { label: K.t('Compactados'), icon: 'fxZip' },
    imagem: { label: K.t('Imagens'), icon: 'fxImage' },
    audio: { label: K.t('Áudio'), icon: 'fxMusic' },
    documento: { label: K.t('Documentos'), icon: 'fxDoc' },
    pasta: { label: K.t('Pastas'), icon: 'fxFolder' },
    outro: { label: K.t('Outros'), icon: 'fxFile' },
  };

  const TABS = [
    { id: 'sujeira', label: K.t('Sujeira'), icon: 'broom' },
    { id: 'grandes', label: K.t('Arquivos grandes'), icon: 'fxBig' },
    { id: 'duplicados', label: K.t('Duplicados'), icon: 'fxCopy' },
    { id: 'lixeira', label: K.t('Lixeira'), icon: 'fxTrash' },
  ];
  const KIND = { sujeira: 'suj', grandes: 'gra', duplicados: 'dup' };
  const TAB_OF = { suj: 'sujeira', gra: 'grandes', dup: 'duplicados' };
  const PERSONAL = [K.t('Downloads'), K.t('Mesa'), K.t('Documentos'), K.t('Filmes'), K.t('Música'), K.t('Imagens')];

  const STEP_MIN = 650;          // cada categoria fica pelo menos isso na tela
  const KEEP_S = 50 * 60;        // os IDs valem 1 h no Swift: depois disso a lista vence
  const PAGE = 30;               // itens por vez numa lista comprida (nada de rolagem dentro de cartão)

  /* ================= estado (sobrevive à troca de tela) ================= */

  function blank() {
    return { mode: 'idle', run: 0, items: new Map(), sel: new Set(), data: null, err: null, at: 0, took: 0, t0: 0,
      done: null, steps: null, filter: 'todos', open: new Set(), shown: {}, busy: null, expired: false, promise: null,
      touched: false,             // a pessoa já mexeu no que veio marcado
      cleanErr: null,             // a última limpeza falhou inteira (fica na tela até a próxima)
      stale: null,                // outra aba limpou algo desta lista: {gone, changed: Set, by: [abas], back}
      repApps: null };            // Sujeira: apps com mais de um item (a linha ganha o nome da pasta)
  }
  const S = {
    tab: 'sujeira',
    cats: null,                  // cleanup.categories
    sandbox: false,              // caixa de areia (testes): figurinha "modo de teste"
    withDownloads: false,        // "Incluir Downloads esquecidos" (desligado por padrão)
    bat: null,                   // battery.now, só pro mascote
    suj: blank(), gra: blank(), dup: blank(),
    lix: { info: null, moved: null, infoErr: null, movedErr: null, loading: false, at: 0, promise: null, msg: null, busy: null, shown: PAGE },
    /* caminho → {others: [caminhos]}: a última cópia fora da Lixeira de um grupo de duplicados
       (as outras a Faxina já mandou). Grandes e Downloads avisam antes de mandar essa também. */
    lastCopy: new Map(),
  };

  let host = null;
  let V = {};                    // referências da tela montada

  /* ================= utilidades ================= */

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const nowS = () => Date.now() / 1000;
  const snap = () => document.documentElement.classList.contains('snap');
  const fmtB = (v) => K.fmt.bytes(v || 0);
  const selectable = (it) => !!it && !it.appAberto && !it.semAcesso;
  const plural = (n, um, varios) => `${K.fmt.num(n)} ${n === 1 ? um : varios}`;
  const mounted = () => !!host && document.body.contains(host);
  const errMsg = (e) => (e && (e.original || e.message) ? String(e.original || e.message) : K.t('erro desconhecido'));
  const isDl = (it) => !!it && it.categoria === 'downloads';
  /** "É 1 item" / "São 2 itens" */
  const isAre = (n) => (n === 1 ? K.t('É') : K.t('São'));

  /* Nomes e caminhos vêm de fora. Um caractere que muda a direção do texto (U+202E e parecidos)
     faria "‮gpj.exe" aparecer como "exe.jpg" e inverteria o resto da frase em volta. Na tela
     ele vira um sinal visível (�); no meio de uma frase o nome ainda vai isolado (FSI…PDI). */
  const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;
  const BIDI1 = /[؜‎‏‪-‮⁦-⁩]/;
  const vis = (s) => String(s == null ? '' : s).replace(BIDI, '�');
  const inl = (s) => '⁨' + vis(s) + '⁩';
  const tricky = (s) => BIDI1.test(String(s == null ? '' : s));

  /* motivos que o Swift manda (curtos, técnicos) → frase de gente; nunca mostra UUID */
  const WHY = [
    [/^sobraria nenhuma cópia/i, K.t('a outra cópia já não está no lugar: procure de novo')],
    [/^lugar original fora da pasta do usuário/i, K.t('não consegui conferir o lugar de onde saiu; continua na Lixeira, e dá pra devolver pelo Finder')],
    [/^não está mais na lista/i, K.t('a lista venceu: procure de novo')],
    [/^mudou desde a varredura/i, K.t('mudou desde a procura: procure de novo')],
    [/^mudou de (lugar|nome)$/i, (g) => K.t('{0}: procure de novo', g[0])],
    [/^saiu da pasta permitida/i, K.t('foi parar numa pasta onde eu não mexo')],
    [/^pasta fora da pasta do usuário/i, K.t('fica fora da sua pasta de usuário: não mexo')],
    [/^virou um link simbólico/i, K.t('virou um atalho (link simbólico): não mexo')],
    [/^está em outro disco/i, K.t('está em outro disco: não mexo')],
    [/^já existe outro no lugar original/i, K.t('já tem outro com esse nome no lugar de onde saiu')],
  ];
  function why(m) {
    const s = vis(m || '').replace(/\s*\(grupo [^)]*\)/gi, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim();
    for (const [re, to] of WHY) { const g = re.exec(s); if (g) return typeof to === 'function' ? to(g) : to; }
    return s ? K.t(s) : K.t('motivo desconhecido');
  }
  const failTxt = (list) => list.slice(0, 3).map((x) => `${inl(x.nome)} (${why(x.motivo)})`).join('; ');

  /** o que já vem marcado: a regra mora em K.cleanSuggested (util.js), a mesma da Varredura */
  const suggested = (it) => (K.cleanSuggested ? K.cleanSuggested(it) : !!it && it.selecionado && selectable(it));
  /** nota do item: cache sem app conhecido não vem marcado, então a nota do Swift ("pode ir") não serve */
  function noteFor(it) {
    if (!it || it.appAberto || it.semAcesso) return null;
    if (it.categoria === 'caches' && !it.app && it.selecionado && !suggested(it)) {
      return K.t('Não sei de qual app é. Deixei desmarcado; se reconhecer, pode marcar.');
    }
    return it.nota || null;
  }

  function withTimeout(p, ms, msg) {
    return Promise.race([p, K.sleep(ms).then(() => { throw new Error(msg || K.t('demorou demais pra responder')); })]);
  }

  /** Unix → "hoje", "ontem", "em 12 mar", "em 12 mar 2024" */
  function quando(t) {
    if (!isNum(t)) return null;
    const d = new Date(t * 1000), hoje = new Date();
    const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dia(hoje) - dia(d)) / 86400000);
    if (diff === 0) return K.t('hoje');
    if (diff === 1) return K.t('ontem');
    const o = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== hoje.getFullYear()) o.year = 'numeric';
    return K.t('em ') + d.toLocaleDateString(K.locale || 'pt-BR', o).replace(/\./g, '').replace(/ de /g, ' ');
  }

  function catInfo(id) {
    const c = (S.cats || []).find((x) => x && x.id === id);
    return { titulo: (c && c.titulo) || CATS[id].titulo, descricao: (c && c.descricao) || '', precisaPermissao: c ? !!c.precisaPermissao : id === 'downloads' };
  }

  function typeIcon(it) {
    if (it && it.tipo && TIPOS[it.tipo]) return TIPOS[it.tipo].icon;
    if (it && CATS[it.categoria]) return CATS[it.categoria].icon;
    if (it && it.categoria === 'grandes') return 'fxBig';
    if (it && it.categoria === 'duplicados') return 'fxCopy';
    return 'fxFile';
  }

  function iconEl(it) {
    const box = K.el('span', { class: 'fx-item-ic', 'aria-hidden': 'true' });
    if (it && typeof it.icon === 'string' && it.icon.indexOf('data:image/') === 0) {
      box.classList.add('is-app');
      box.appendChild(K.el('img', { src: it.icon, alt: '' }));
    } else box.innerHTML = K.icon(typeIcon(it));
    return box;
  }

  function tag(tone, icon, text, title) {
    return K.el('span', { class: 'fx-tag ' + tone, title: title || null, html: icon ? K.icon(icon) : null }, text);
  }

  const tipoOf = (it) => (it && TIPOS[it.tipo] ? it.tipo : 'outro');
  /** marcados que o filtro de tipo (Arquivos grandes) está escondendo */
  function hiddenByFilter(st, ids) {
    if (!st.filter || st.filter === 'todos') return [];
    return ids.map((id) => st.items.get(id)).filter((it) => it && tipoOf(it) !== st.filter);
  }

  function selIds(st) { return Array.from(st.sel).filter((id) => selectable(st.items.get(id))); }
  function selBytes(st) {
    let s = 0;
    for (const id of st.sel) { const it = st.items.get(id); if (selectable(it)) s += it.bytes || 0; }
    return s;
  }

  function sparkles(n) {
    const star = K.t('M12 1.5c.9 6 3.6 8.7 9.5 9.8v1.4c-5.9 1.1-8.6 3.8-9.5 9.8h-1c-.9-6-3.6-8.7-9.5-9.8v-1.4C7.4 10.2 10.1 7.5 11 1.5Z');
    const out = [];
    for (let i = 0; i < n; i++) out.push(K.el('span', { class: `fx-spark s${i + 1}`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24"><path d="${star}"/></svg>` }));
    return out;
  }

  function mascotState(extra) {
    const b = S.bat;
    let base = { pct: 72, tone: 'good' };
    if (b && b.present !== false && isNum(b.percent)) {
      const st = K.batStatus(b);
      base = { pct: b.percent, tone: st.tone, charging: !!b.isCharging, plugged: !!b.pluggedIn, hot: isNum(b.temperatureC) && b.temperatureC >= 40 };
    }
    return Object.assign(base, { full: false }, extra);
  }

  function addMascot(box, size, extra) {
    try {
      const m = K.mascot(box, { size, state: mascotState(extra) });
      V.mascots.push(m);
      return m;
    } catch (e) { console.warn('faxina/mascote: ' + errMsg(e)); return null; }
  }

  function keepChart(ch) { V.charts.push(ch); return ch; }

  /** conta de 0 até o valor; se a seleção mudar no meio, refreshSel escreve direto e a conta para */
  function countBytes(node, to) {
    const id = {};
    node._count = id;
    if (snap() || matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = fmtB(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      if (node._count !== id) return;
      const k = Math.min(1, (t - t0) / 900);
      node.textContent = fmtB(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function clearView() {
    for (const c of V.charts || []) { try { c.destroy(); } catch (e) { /* já foi */ } }
    for (const m of V.mascots || []) { try { m.destroy(); } catch (e) { /* já foi */ } }
    for (const t of V.timers || []) clearInterval(t);
    V.charts = [];
    V.mascots = [];
    V.timers = [];
    V.rows = new Map();
    V.cats = new Map();
    V.groups = new Map();
    V.stage = null;
    V.hero = null;
    V.heroP = null;
    V.heroLab = null;
    V.stack = null;
    V.after = [];
  }

  function view() { return document.getElementById('view'); }
  function scrollTop() { const v = view(); if (v) v.scrollTop = 0; }

  /* ================= casca da página: cabeçalho, abas, painel, barra fixa ================= */

  function paintShell() {
    host.innerHTML = '';
    host.dataset.tab = S.tab;
    V.sandbox = K.el('span', { class: 'sticker has-ic fx-sandbox', html: K.icon('fxFlask'),
      title: K.t('Caixa de areia: pasta e Lixeira de mentira. Nada seu é tocado.') },
      K.t('modo de teste'));
    host.appendChild(K.el('header', { class: 'page-head fx-head', 'data-drag': true },
      K.el('div', { class: 'fx-head-text' },
        K.el('h1', null, K.t('Espaço')),
        K.el('p', null, K.t('O que ocupa o disco e o que dá pra tirar. Só vai pra Lixeira o que você marcar.'))),
      K.el('div', { class: 'fx-head-side' }, V.sandbox)));

    const nav = K.el('nav', { class: 'ktabs fx-tabs', role: 'tablist', 'aria-label': K.t('Partes do Espaço') });
    V.tabs = {};
    for (const t of TABS) {
      const badge = K.el('span', { class: 'ktab-badge fx-tab-badge num' });
      const b = K.el('button', { class: 'ktab fx-tab', type: 'button', role: 'tab', dataset: { tab: t.id }, html: K.icon(t.icon),
        onclick: () => { if (S.tab !== t.id) { K.sound.plop(); setTab(t.id); } } },
      K.el('span', { class: 'fx-tab-label' }, t.label), badge);
      V.tabs[t.id] = { b, badge };
      nav.appendChild(b);
    }
    host.appendChild(nav);

    V.panel = K.el('div', { class: 'fx-panel', role: 'tabpanel' });
    host.appendChild(V.panel);

    V.bar = barEl();
    host.appendChild(V.bar.node);
    paintSandbox();
  }

  function paintSandbox() {
    if (V.sandbox) V.sandbox.hidden = !S.sandbox;
  }

  /** selo de cada aba: nas três primeiras é sempre espaço (bytes); na Lixeira, quantos itens.
      Devolve {text, title} — o title diz o que o número quer dizer. */
  function badgeFor(id) {
    if (id === 'lixeira') {
      const m = S.lix.moved;
      const n = m && Array.isArray(m.itens) ? m.itens.filter((x) => x.naLixeira).length : 0;
      return n ? { text: K.fmt.num(n), title: K.t('{0} na Lixeira', plural(n, K.t('item que o Kamurafy mandou está'), K.t('itens que o Kamurafy mandou estão'))) } : null;
    }
    const st = S[KIND[id]];
    if (st.mode === 'scanning') return { text: '…', title: K.t('Procurando…') };
    if (st.mode !== 'result' && st.mode !== 'cleaning') return null;
    const sel = selBytes(st);
    if (sel > 0) return { text: fmtB(sel), title: K.t('{0} marcados pra ir pra Lixeira', fmtB(sel)) };
    if (id === 'grandes' || id === 'sujeira') {
      const b = Array.from(st.items.values()).reduce((a, it) => a + (it.bytes || 0), 0);
      return b > 0 ? { text: fmtB(b), title: K.t('{0} {1} (nada marcado ainda)', fmtB(b), id === 'grandes' ? K.t('em arquivos grandes') : 'achados') } : null;
    }
    if (id === 'duplicados') {
      const b = st.data && st.data.desperdicio > 0 ? st.data.desperdicio : 0;
      return b > 0 ? { text: fmtB(b), title: K.t('{0} em cópias repetidas (nada marcado ainda)', fmtB(b)) } : null;
    }
    return null;
  }

  function paintTabs() {
    if (!V.tabs) return;
    for (const t of TABS) {
      const x = V.tabs[t.id];
      const on = S.tab === t.id;
      x.b.classList.toggle('on', on);
      x.b.setAttribute('aria-selected', String(on));
      const bd = badgeFor(t.id);
      x.badge.hidden = !bd;
      x.badge.textContent = bd ? bd.text : '';
      x.b.title = bd ? bd.title : '';
      x.b.setAttribute('aria-label', bd ? `${t.label}: ${bd.title}` : t.label);
    }
  }

  function setTab(id, opts) {
    if (!TABS.some((t) => t.id === id)) return;
    S.tab = id;
    if (!mounted()) return;
    host.dataset.tab = id;
    paintTab();
    if (!(opts && opts.keepScroll)) scrollTop();
    if (id === 'lixeira') loadLixeira();
  }

  function paintTab() {
    if (!mounted() || !V.panel) return;
    clearView();
    V.panel.innerHTML = '';
    host.dataset.tab = S.tab;
    if (S.tab === 'sujeira') paintSujeira();
    else if (S.tab === 'grandes') paintGrandes();
    else if (S.tab === 'duplicados') paintDuplicados();
    else paintLixeira();
    paintTabs();
    paintBar();
    const todo = V.after;
    V.after = [];
    for (const fn of todo) { try { fn(); } catch (e) { console.error('faxina/montagem: ' + (e.stack || e.message)); } }
  }

  /* ---------- barra fixa embaixo: "Limpar 2,3 GB" ---------- */

  function barEl() {
    const count = K.el('b', { class: 'fx-bar-count num' });
    const sub = K.el('span', { class: 'fx-bar-sub' });
    const clear = K.el('button', { class: 'btn small fx-bar-clear', type: 'button', onclick: () => { K.sound.tick(); clearSel(); } }, K.t('Desmarcar tudo'));
    const goT = K.el('span', { class: 'num' }, K.t('Limpar'));
    const go = K.el('button', { class: 'btn gold fx-bar-go', type: 'button', html: K.icon('fxTrash'),
      onclick: () => { const k = KIND[S.tab]; if (k) cleanKind(k); } }, goT);
    const node = K.el('div', { class: 'fx-barwrap', hidden: true },
      K.el('div', { class: 'fx-bar', role: 'region', 'aria-label': K.t('Limpar o que está marcado') },
        K.el('span', { class: 'fx-bar-ic', html: K.icon('fxTrash') }),
        K.el('div', { class: 'fx-bar-text', role: 'status', 'aria-live': 'polite' }, count, sub),
        K.el('div', { class: 'fx-bar-act' }, clear, go)));
    return { node, count, sub, clear, go, goT };
  }

  function paintBar() {
    if (!V.bar) return;
    const kind = KIND[S.tab];
    const st = kind && S[kind];
    const show = !!st && (st.mode === 'result' || st.mode === 'cleaning') && st.items.size > 0;
    V.bar.node.hidden = !show;
    host.classList.toggle('fx-has-bar', show);
    if (!show) return;
    const ids = selIds(st);
    const bytes = selBytes(st);
    const cleaning = st.mode === 'cleaning';
    V.bar.count.textContent = ids.length ? plural(ids.length, K.t('item marcado'), K.t('itens marcados')) : K.t('Nada marcado ainda');
    let sub;
    if (cleaning) sub = K.t('Levando pra Lixeira…');
    else if (!ids.length) sub = kind === 'suj' ? K.t('Marque o que quer mandar pra Lixeira.') : K.t('Arquivos seus: nada vem marcado.');
    else {
      sub = K.t('Vai pra Lixeira · dá pra desfazer');
      if (kind === 'gra') {
        const hidden = hiddenByFilter(st, ids).length;
        if (hidden) sub += K.t(' · inclui {0}', plural(hidden, K.t('fora do filtro'), K.t('fora do filtro')));
      }
      if (kind === 'suj') {
        const dl = ids.filter((id) => isDl(st.items.get(id))).length;
        if (dl) sub += K.t(' · inclui {0} de Downloads', plural(dl, K.t('arquivo seu'), K.t('arquivos seus')));
      }
    }
    V.bar.sub.textContent = sub;
    V.bar.goT.textContent = cleaning ? K.t('Limpando…') : ids.length ? K.t('Limpar ') + fmtB(bytes) : K.t('Limpar');
    V.bar.go.disabled = cleaning || !ids.length;
    V.bar.go.classList.toggle('is-busy', cleaning);
    V.bar.clear.hidden = !ids.length || cleaning;
  }

  /* ================= seleção ================= */

  function toggleItem(kind, id, force) {
    const st = S[kind];
    const it = st.items.get(id);
    if (!selectable(it) || st.mode !== 'result') return;
    const on = force != null ? force : !st.sel.has(id);
    if (on === st.sel.has(id)) return;
    if (on) {
      if (kind === 'dup' && wouldEmptyGroup(st, it)) { denyDup(it); return; }
      st.sel.add(id);
    } else st.sel.delete(id);
    st.touched = true;
    K.sound.tick();
    refreshSel(kind);
  }

  /** caixa do cabeçalho de uma categoria da Sujeira. Downloads esquecidos não tem: são arquivos
      da pessoa, marcados um por um (nada de marcar trinta instaladores e planilhas num clique) */
  function toggleCat(catId) {
    const st = S.suj;
    if (st.mode !== 'result' || catId === 'downloads') return;
    const items = Array.from(st.items.values()).filter((it) => it.categoria === catId && selectable(it));
    if (!items.length) return;
    const all = items.every((it) => st.sel.has(it.id));
    for (const it of items) { if (all) st.sel.delete(it.id); else st.sel.add(it.id); }
    st.touched = true;
    K.sound.tick();
    refreshSel('suj');
  }

  function clearSel() {
    const kind = KIND[S.tab];
    if (!kind) return;
    S[kind].sel.clear();
    S[kind].touched = true;
    refreshSel(kind);
  }

  /* duplicados: o grupo nunca fica sem nenhuma cópia */
  function groupOf(st, it) {
    return st.data && Array.isArray(st.data.grupos) ? st.data.grupos.find((g) => g.id === it.grupo) : null;
  }
  function wouldEmptyGroup(st, it) {
    const g = groupOf(st, it);
    if (!g) return true;
    return g.itens.filter((x) => x.id !== it.id).every((x) => st.sel.has(x.id));
  }
  function denyDup(it) {
    K.sound.oops();
    const r = V.rows.get(it.id);
    if (r) { r.row.classList.remove('fx-shake'); void r.row.offsetWidth; r.row.classList.add('fx-shake'); }
    const g = V.groups.get(it.grupo);
    if (g) g.msg.hidden = false;
  }
  function markCopies() {
    const st = S.dup;
    if (st.mode !== 'result' || !st.data) return;
    st.sel.clear();
    for (const g of st.data.grupos || []) {
      const items = sortGroup(g.itens);
      items.slice(1).filter(selectable).forEach((x) => st.sel.add(x.id));
    }
    K.sound.tick();
    refreshSel('dup');
  }
  /* A sugestão de qual cópia fica: a mais antiga. Com a data empatada (o Duplicar do Finder mantém
     a data), fica a que parece o original: em Documentos antes de Downloads e Mesa, e nome sem
     "cópia", "copy" ou "(1)". */
  const COPYISH = /\bc[oó]pia\b|\bcopy\b|\(\d+\)/i;
  const modT = (x) => (isNum(x.modificado) ? x.modificado : Infinity);
  function keepRank(it) {
    const p = String(it.caminho || '');
    const dir = /^~\/Documents\//.test(p) ? 0 : /^~\/Downloads\//.test(p) ? 3 : /^~\/Desktop\//.test(p) ? 2 : 1;
    return dir + (COPYISH.test(String(it.nome || '')) ? 4 : 0);
  }
  const sameAge = (a, b) => modT(a) === modT(b) || Math.abs(modT(a) - modT(b)) <= 2;
  function sortGroup(list) {
    return (list || []).slice().sort((a, b) => (sameAge(a, b) ? keepRank(a) - keepRank(b) : modT(a) < modT(b) ? -1 : 1));
  }

  /** "sobrando" = o que "Marcar as cópias" liberaria de verdade: a soma das cópias que não ficam
      (o Swift manda o tamanho de uma × número de cópias, que não bate quando o espaço no disco varia) */
  function dupTotals(st) {
    let total = 0;
    for (const g of (st.data && st.data.grupos) || []) {
      g.desperdicio = g.itens.slice(1).reduce((a, x) => a + (x.bytes || 0), 0);
      total += g.desperdicio;
    }
    if (st.data) st.data.desperdicio = total;
  }

  /* ---------- as abas conversam: o que uma limpou some das outras ---------- */

  const under = (p, root) => p === root || p.startsWith(root + '/');

  /** tira de st.data o que já não está em st.items (depois de outra aba limpar). Duplicados:
      devolve quantos grupos deixaram de ter cópia repetida */
  function dropMissing(kind) {
    const st = S[kind];
    let dissolved = 0;
    if (kind === 'suj') {
      for (const id of Object.keys(st.data || {})) {
        const d = st.data[id];
        if (!d || !Array.isArray(d.itens)) continue;
        d.itens = d.itens.filter((it) => st.items.has(it.id));
        d.bytes = d.itens.reduce((a, it) => a + (it.bytes || 0), 0);
      }
    } else if (kind === 'gra') {
      if (st.data && Array.isArray(st.data.itens)) st.data.itens = st.data.itens.filter((it) => st.items.has(it.id));
    } else if (st.data && Array.isArray(st.data.grupos)) {
      st.data.grupos = st.data.grupos.filter((g) => {
        const before = g.itens.slice();
        g.itens = g.itens.filter((x) => st.items.has(x.id));
        if (g.itens.length === 1 && before.length > 1) {
          /* sobrou uma cópia só: deixa de ser duplicado, e é a última fora da Lixeira */
          const left = g.itens[0];
          markLast(left.caminho, before.filter((x) => x !== left).map((x) => x.caminho));
          st.items.delete(left.id);
          st.sel.delete(left.id);
          dissolved++;
        }
        return g.itens.length > 1;
      });
      dupTotals(st);
    }
    return dissolved;
  }

  function markLast(path, others) {
    if (!path || !others.length) return;
    const e = S.lastCopy.get(path) || { others: [] };
    for (const o of others) if (o && !e.others.includes(o)) e.others.push(o);
    S.lastCopy.set(path, e);
  }

  /** depois de uma limpeza numa aba, as outras não podem continuar mostrando como presente o que
      já está na Lixeira: some da lista (pelo caminho) e fica um aviso de que a lista mudou */
  function pruneOthers(kind, paths, by) {
    if (!paths.length) return;
    const label = by || K.t('aba {0}', TABS.find((t) => t.id === TAB_OF[kind]).label);
    for (const other of ['suj', 'gra', 'dup']) {
      if (other === kind) continue;
      const st = S[other];
      if (st.mode !== 'result') continue;
      let gone = 0;
      const changed = new Set();
      for (const [id, it] of Array.from(st.items)) {
        const p = String(it.caminho || '');
        if (paths.some((m) => under(p, m))) { st.items.delete(id); st.sel.delete(id); gone++; }
        else if (paths.some((m) => under(m, p))) changed.add(id);
      }
      if (!gone && !changed.size) continue;
      const dissolved = gone ? dropMissing(other) : 0;
      const s = st.stale || (st.stale = { gone: 0, dissolved: 0, changed: new Set(), by: [], back: false });
      s.gone += gone;
      s.dissolved += dissolved;
      changed.forEach((id) => s.changed.add(id));
      if (!s.by.includes(label)) s.by.push(label);
    }
  }

  /** algo voltou da Lixeira: a última cópia deixa de ser a última, e a lista podada fica velha */
  function afterRestore(paths) {
    if (!paths.length) return;
    for (const [p, e] of Array.from(S.lastCopy)) {
      e.others = e.others.filter((o) => !paths.includes(o));
      if (!e.others.length) S.lastCopy.delete(p);
    }
    for (const k of ['suj', 'gra', 'dup']) if (S[k].stale && S[k].mode === 'result') S[k].stale.back = true;
  }

  /** avisos das três abas: limpeza que falhou inteira (fica até a próxima) e lista que mudou */
  function stateNotes(kind) {
    const st = S[kind];
    const out = [];
    if (st.cleanErr) {
      out.push(K.el('div', { class: 'error-box fx-clean-err', role: 'alert' },
        K.el('b', null, K.t('Não consegui mandar pra Lixeira. ')), K.t('O motivo: {0}. Nada foi mexido.', why(st.cleanErr))));
    }
    const s = st.stale;
    if (s) {
      const bits = [];
      if (s.gone) bits.push(K.t('{0} pra Lixeira', plural(s.gone, K.t('item daqui já foi'), K.t('itens daqui já foram'))));
      if (s.dissolved) bits.push(K.t('{0} só com a última cópia', s.dissolved === 1 ? K.t('um grupo ficou') : K.t('{0} grupos ficaram', K.fmt.num(s.dissolved))));
      if (s.changed.size) bits.push(plural(s.changed.size, K.t('pasta mostra mais do que tem'), K.t('pastas mostram mais do que têm')));
      if (s.back) bits.push(K.t('algo voltou da Lixeira'));
      const txt = bits.join('; ');
      out.push(K.el('div', { class: 'tip fx-note warn fx-stale', html: K.icon('cycle') },
        K.el('p', null, K.el('b', null, K.t('A lista mudou. ')), `${txt.charAt(0).toUpperCase()}${txt.slice(1)}.`),
        K.el('button', { class: 'btn small', type: 'button', onclick: () => { if (kind === 'suj') scanSujeira(); else search(kind); } }, K.t('Procurar de novo'))));
    }
    return out;
  }

  /** aviso do modal: entre os marcados há a última cópia de um grupo de duplicados */
  function lastCopyWarn(items) {
    const last = items.filter((it) => S.lastCopy.has(it.caminho));
    if (!last.length) return null;
    const names = last.slice(0, 2).map((it) => `“${inl(it.nome)}”`).join(K.t(' e '));
    return K.el('div', { class: 'tip fx-note warn fx-cf-warn', html: K.icon('fxCopy') },
      K.el('p', null, K.el('b', null, last.length === 1 ? K.t('É a última cópia. ') : K.t('São as últimas cópias. ')),
        K.t('{0}{1}: as outras já estão na Lixeira. Se mandar {2} também, não sobra nenhuma fora dela.', names, last.length > 2 ? K.t(' e mais {0}', K.fmt.num(last.length - 2)) : '', last.length === 1 ? K.t('esta') : K.t('estas'))));
  }

  function selectAll() {
    const kind = KIND[S.tab];
    if (!kind) return;
    if (kind === 'dup') { markCopies(); return; }
    const st = S[kind];
    if (st.mode !== 'result') return;
    for (const it of st.items.values()) if (selectable(it)) st.sel.add(it.id);
    refreshSel(kind);
  }

  /** atualiza caixas, totais, herói, barra empilhada e barra fixa sem redesenhar a lista */
  function refreshSel(kind) {
    const st = S[kind];
    if (!mounted() || KIND[S.tab] !== kind) { paintTabs(); return; }
    let locked = new Set(), keepers = new Set();
    if (kind === 'dup' && st.data) {
      for (const g of st.data.grupos || []) {
        const left = g.itens.filter((x) => !st.sel.has(x.id));
        if (left.length === 1) locked.add(left[0].id);
        if (left.length < g.itens.length) left.forEach((x) => keepers.add(x.id));
        const gv = V.groups.get(g.id);
        if (gv) {
          const n = g.itens.length - left.length;
          const b = g.itens.filter((x) => st.sel.has(x.id)).reduce((a, x) => a + (x.bytes || 0), 0);
          gv.sel.textContent = n ? `${plural(n, K.t('cópia marcada'), K.t('cópias marcadas'))} · ${fmtB(b)}` : K.t('nenhuma marcada');
          gv.card.classList.toggle('has-sel', n > 0);
          if (left.length > 1) gv.msg.hidden = true;
        }
      }
    }
    for (const [id, r] of V.rows) {
      if (r.kind !== kind) continue;
      const it = st.items.get(id);
      const on = st.sel.has(id);
      r.chk.set(on && selectable(it), !selectable(it) || locked.has(id));
      r.row.classList.toggle('is-sel', on);
      if (r.keep) {
        r.keep.hidden = !keepers.has(id);
        r.chk.title = locked.has(id) ? K.t('Pelo menos uma cópia fica: não dá pra marcar todas.') : '';
      }
    }
    if (kind === 'suj') {
      for (const [catId, c] of V.cats) {
        const items = Array.from(st.items.values()).filter((it) => it.categoria === catId);
        const ok = items.filter(selectable);
        const n = ok.filter((it) => st.sel.has(it.id)).length;
        const b = ok.filter((it) => st.sel.has(it.id)).reduce((a, it) => a + (it.bytes || 0), 0);
        if (c.chk) c.chk.set(n === 0 ? false : n === ok.length ? true : 'mixed', !ok.length);
        c.selTxt.textContent = n ? K.t('{0} marcados', fmtB(b)) : K.t('nada marcado');
        c.card.classList.toggle('has-sel', n > 0);
      }
      paintHero(!V.heroCounting);
      if (V.stack) V.stack.update(stackOpts());
    }
    paintTabs();
    paintBar();
  }

  /* ================= Sujeira ================= */

  function paintSujeira() {
    const st = S.suj;
    if (st.mode === 'idle' || st.mode === 'scanning') paintStage();
    else if (st.mode === 'done') paintDone('suj');
    else paintSujeiraResult();
  }

  /* ---------- parado e varrendo: o botão enorme e a lista do que eu olho ---------- */

  function stageCats() {
    const st = S.suj;
    if (st.mode === 'scanning' && st.steps) return st.steps.map((s) => s.id);
    return CAT_ORDER.filter((id) => (S.cats ? S.cats.some((c) => c.id === id) : true));
  }

  function paintStage() {
    const st = S.suj;
    const scanning = st.mode === 'scanning';
    const ui = V.stage = { steps: {} };
    const small = innerHeight < 760;

    const go = K.el('button', { class: 'fx-go', type: 'button', 'aria-label': K.t('Procurar sujeira no Mac'), onclick: () => { scanSujeira(); } },
      K.el('span', { class: 'fx-go-shine', 'aria-hidden': 'true', html: '<svg viewBox="0 0 100 100"><path d="M18 35 Q22 21 36 14"/><circle cx="14.5" cy="43" r="2.3"/></svg>' }),
      K.el('span', { class: 'fx-go-ic', html: K.icon('broom') }),
      K.el('span', { class: 'fx-go-label' }, K.t('Procurar')),
      K.el('span', { class: 'fx-go-label fx-go-label2' }, K.t('sujeira')),
      K.el('span', { class: 'fx-go-sub' }, K.t('leva uns segundos')));
    ui.ringBox = K.el('div', { class: 'fx-ring' });
    ui.ringIc = K.el('span', { class: 'fx-ring-ic', html: K.icon('broom') });
    ui.ringPct = K.el('span', { class: 'fx-ring-pct num' }, '0%');
    ui.now = K.el('div', { class: 'fx-now', role: 'status', 'aria-live': 'polite' }, '');
    const mBox = K.el('div', { class: 'fx-orb-mascot' },
      K.el('span', { class: 'fx-orb-broom', 'aria-hidden': 'true', html: K.icon('broom') }));
    const mArt = K.el('div', { class: 'fx-orb-mascot-art' });
    mBox.prepend(mArt);
    ui.bubble = K.el('div', { class: 'fx-bubble', hidden: scanning }, K.t('Bora achar o que\nsobra no seu Mac?'));
    const orb = K.el('div', { class: 'fx-orb' },
      K.el('span', { class: 'fx-orbit', 'aria-hidden': 'true' }),
      K.el('span', { class: 'fx-halo', 'aria-hidden': 'true' }),
      ...sparkles(3),
      K.el('div', { class: 'fx-go-wrap' }, go),
      K.el('div', { class: 'fx-ring-wrap' }, ui.ringBox, K.el('div', { class: 'fx-ring-mid', 'aria-hidden': 'true' }, ui.ringIc, ui.ringPct)),
      ui.now, mBox, ui.bubble);
    ui.mascot = addMascot(mArt, small ? 96 : 112, { face: scanning ? 'happy' : null });
    go.addEventListener('mouseenter', () => { if (S.suj.mode === 'idle' && ui.mascot) ui.mascot.set({ face: 'joy' }); });
    go.addEventListener('mouseleave', () => { if (S.suj.mode === 'idle' && ui.mascot) ui.mascot.set({ face: null }); });

    ui.listHead = K.el('b', null, scanning ? K.t('Procurando') : K.t('O que eu olho'));
    ui.count = K.el('span', { class: 'fx-count num' }, '');
    const ol = K.el('ol', { class: 'fx-steps' });
    stageCats().forEach((id, i) => {
      const meta = CATS[id];
      const info = catInfo(id);
      const bub = K.el('span', { class: 'fx-bub', html: K.icon(meta.icon) });
      const desc = K.el('span', { class: 'fx-desc' }, meta.short);
      const size = K.el('span', { class: 'fx-step-size num' });
      const n = K.el('span', { class: 'fx-step-n' });
      const right = K.el('span', { class: 'fx-step-right' }, size, n);
      const text = K.el('span', { class: 'fx-step-text', title: info.descricao || null }, K.el('b', null, info.titulo), desc);
      const row = K.el('li', { class: 'fx-step pop-in', dataset: { state: scanning ? 'wait' : 'idle', cat: id }, style: { animationDelay: 100 + i * 60 + 'ms' } },
        bub, text, right);
      if (id === 'downloads' && !scanning) {
        row.classList.add('is-opt');
        const sw = K.el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(S.withDownloads), 'aria-label': K.t('Incluir Downloads esquecidos'),
          onclick: () => {
            S.withDownloads = !S.withDownloads;
            sw.setAttribute('aria-checked', String(S.withDownloads));
            row.classList.toggle('is-on', S.withDownloads);
            note.textContent = dlNote();
            K.sound.tick();
          } });
        const note = K.el('span', { class: 'fx-step-note' }, dlNote());
        text.appendChild(note);
        right.replaceChildren(sw);
        row.classList.toggle('is-on', S.withDownloads);
        row.addEventListener('click', (e) => { if (!e.target.closest('button')) sw.click(); });
      }
      ol.appendChild(row);
      ui.steps[id] = { row, bub, desc, size, n };
    });
    const promise = K.el('ul', { class: 'fx-promise' },
      K.el('li', { html: K.icon('fxEye') }, K.t('Mostro tudo antes')),
      K.el('li', { html: K.icon('fxTrash') }, K.t('Só vai pra Lixeira')),
      K.el('li', { html: K.icon('fxUndo') }, K.t('Dá pra desfazer')));
    const list = K.el('div', { class: 'fx-list' }, K.el('div', { class: 'fx-list-head' }, ui.listHead, ui.count), ol, promise);

    const expired = st.expired ? K.el('div', { class: 'tip fx-expired', html: K.icon('clock') },
      K.el('p', null, K.t('A lista venceu (vale uma hora). Procure de novo.'))) : null;
    ui.stage = K.el('section', { class: 'fx-stage' + (scanning ? ' is-scanning' : ''), 'data-drag': true }, orb, list);
    V.panel.append(...[expired, ui.stage].filter(Boolean));

    if (scanning) {
      const size = small ? 196 : 220;
      ui.ring = keepChart(K.charts.ring(ui.ringBox, { value: 0, tone: 'gold', text: '', label: K.t('Procurando sujeira'), busy: true, size, thickness: 13 }));
      st.steps.forEach((s, i) => paintStep(i));
    }
  }

  function dlNote() {
    return S.withDownloads
      ? K.t('Ligado. Se o macOS pedir acesso a Downloads, é só permitir. Nada vem marcado.')
      : K.t('Desligado. Ligando, o macOS pede permissão. Nada vem marcado.');
  }

  function paintStep(i) {
    const st = S.suj;
    const ui = V.stage;
    if (!ui || !mounted() || S.tab !== 'sujeira' || st.mode !== 'scanning' || !st.steps) return;
    const s = st.steps[i];
    const r = ui.steps[s.id];
    if (!r) return;
    const meta = CATS[s.id];
    r.row.dataset.state = s.state;
    r.bub.className = 'fx-bub';
    if (s.state === 'on') {
      r.desc.textContent = meta.doing;
      ui.now.textContent = meta.doing;
      ui.ringIc.innerHTML = K.icon(meta.icon);
      ui.ringIc.classList.remove('fx-bump');
      void ui.ringIc.offsetWidth;
      ui.ringIc.classList.add('fx-bump');
    } else if (s.state === 'done') {
      r.desc.textContent = meta.short;
      const res = s.res || {};
      const n = Array.isArray(res.itens) ? res.itens.length : 0;
      r.bub.innerHTML = K.icon(n ? 'check' : 'sparkle');
      r.bub.classList.add(n ? 't-good' : 't-clean', 'fx-bump');
      if (n) { K.countUp(r.size, res.bytes || 0, fmtB, 700); r.n.textContent = plural(n, K.t('item'), K.t('itens')); }
      else { r.size.textContent = 'limpinho'; r.size.classList.add('is-clean'); r.n.textContent = K.t('nada aqui'); }
      if (res.incompleto) r.n.textContent += K.t(' · parei no meio');
    } else if (s.state === 'err') {
      r.desc.textContent = meta.short;
      r.bub.innerHTML = K.icon('info');
      r.bub.classList.add('t-none', 'fx-bump');
      r.size.textContent = K.t('não deu pra ler');
      r.size.classList.add('is-err');
      r.n.textContent = '';
    }
    const done = st.steps.filter((x) => x.state === 'done' || x.state === 'err').length;
    const on = st.steps.findIndex((x) => x.state === 'on');
    ui.count.textContent = K.t('{0} de {1}', Math.min(st.steps.length, (on >= 0 ? on : done - 1) + 1), st.steps.length);
    const pct = Math.round((done / st.steps.length) * 100);
    ui.ringPct.textContent = pct + '%';
    if (ui.ring) ui.ring.update({ value: pct, busy: done < st.steps.length });
    const found = st.steps.reduce((a, x) => a + (x.res && x.res.bytes ? x.res.bytes : 0), 0);
    if (done === st.steps.length) {
      if (ui.ring) ui.ring.update({ value: 100, busy: false, tone: 'good' });
      ui.ringIc.innerHTML = K.icon('check');
      ui.now.textContent = found ? K.t('Achei {0}!', fmtB(found)) : K.t('Pronto!');
      if (ui.mascot) ui.mascot.set({ face: 'joy' });
    }
  }

  function scanSujeira() {
    const st = S.suj;
    if (st.mode === 'scanning' || st.mode === 'cleaning') return st.promise || Promise.resolve();
    const run = ++st.run;
    const ids = CAT_ORDER.filter((id) => (id !== 'downloads' || S.withDownloads) && (S.cats ? S.cats.some((c) => c.id === id) : true));
    Object.assign(st, { mode: 'scanning', steps: ids.map((id) => ({ id, state: 'wait', res: null })), data: {}, items: new Map(), sel: new Set(),
      done: null, open: new Set(), shown: {}, expired: false, err: null, touched: false, cleanErr: null, stale: null, repApps: null, t0: performance.now() });
    K.sound.plop();
    if (S.tab === 'sujeira') paintTab(); else paintTabs();
    st.promise = (async () => {
      for (let i = 0; i < st.steps.length; i++) {
        if (run !== st.run) return;
        const s = st.steps[i];
        s.state = 'on';
        paintStep(i);
        const [out] = await Promise.allSettled([withTimeout(K.api('cleanup.scan', { categoria: s.id }), 90000), K.sleep(STEP_MIN)]);
        if (run !== st.run) return;
        if (out.status === 'fulfilled' && out.value) {
          s.res = out.value;
          s.state = 'done';
          st.data[s.id] = out.value;
          K.sound.tick();
        } else {
          s.state = 'err';
          s.err = errMsg(out.reason);
          st.data[s.id] = { id: s.id, error: s.err, itens: [], bytes: 0 };
          console.warn(`faxina/${s.id}: ${s.err}`);
          K.sound.oops();
        }
        paintStep(i);
      }
      await K.sleep(snap() ? 0 : 700);
      if (run !== st.run) return;
      const perApp = new Map();
      for (const s of st.steps) {
        const d = st.data[s.id];
        for (const it of (d && d.itens) || []) {
          st.items.set(it.id, it);
          if (suggested(it)) st.sel.add(it.id);
          if (it.app) perApp.set(it.app, (perApp.get(it.app) || 0) + 1);
        }
      }
      st.repApps = new Set(Array.from(perApp).filter(([, n]) => n > 1).map(([a]) => a));
      st.took = (performance.now() - st.t0) / 1000;
      st.at = nowS();
      st.mode = 'result';
      st.fresh = true;
      K.sound.tada();
      if (S.tab === 'sujeira') { paintTab(); scrollTop(); } else paintTabs();
    })().catch((e) => {
      console.error('faxina/varredura: ' + (e.stack || e.message));
      st.mode = 'idle';
      if (S.tab === 'sujeira') paintTab();
    });
    return st.promise;
  }

  /* ---------- resultado ---------- */

  function stackOpts() {
    const st = S.suj;
    const segs = [];
    let total = 0;
    for (const s of st.steps || []) {
      const d = st.data[s.id];
      if (!d || d.error) continue;
      total += d.bytes || 0;
      const b = (d.itens || []).filter((it) => st.sel.has(it.id) && selectable(it)).reduce((a, it) => a + (it.bytes || 0), 0);
      segs.push({ name: catInfo(s.id).titulo, value: b, color: CATS[s.id].color });
    }
    return { segments: segs, total, restName: K.t('Não marcado (você decide)'), restColor: 'var(--panel)', format: fmtB, height: 30,
      ariaLabel: K.t('O que está marcado pra limpar, por tipo'), empty: K.t('Nada pra dividir aqui.') };
  }

  function paintSujeiraResult() {
    const st = S.suj;
    const steps = st.steps || [];
    const all = Array.from(st.items.values());
    const total = all.reduce((a, it) => a + (it.bytes || 0), 0);
    const errs = steps.filter((s) => s.state === 'err');
    const incompletos = steps.filter((s) => st.data[s.id] && st.data[s.id].incompleto);
    /* o Swift já conta no semAcesso da categoria os itens que não deu pra ler: não somar de novo */
    const denied = steps.reduce((a, s) => {
      const d = st.data[s.id];
      if (!d) return a;
      const locked = (d.itens || []).filter((it) => it.semAcesso).length;
      return a + Math.max(d.semAcesso || 0, locked);
    }, 0);
    const openApps = all.filter((it) => it.appAberto);
    const clean = !all.length && !errs.length;
    const fresh = st.fresh;
    st.fresh = false;

    /* herói */
    const art = K.el('div', { class: 'fx-sum-art' });
    const again = K.el('button', { class: 'btn ink', type: 'button', html: K.icon('cycle'), onclick: () => { scanSujeira(); } }, errs.length ? K.t('Tentar de novo') : K.t('Procurar de novo'));
    const when = fresh ? K.t('Feita agora, em {0} s', K.fmt.num(Math.max(1, st.took), 0)) : K.t('Feita às {0}', K.fmt.time(st.at));
    let heroBlock;
    if (clean) {
      heroBlock = [K.el('h1', { class: 'fx-sum-title' }, K.t('Tudo limpinho por aqui')),
        K.el('p', null, K.t('Nada que valha limpar agora. Volte daqui a umas semanas.'))];
    } else {
      V.hero = K.el('span', { class: 'fx-hero num' }, '');
      V.heroLab = K.el('span', null, K.t('pra liberar'));
      V.heroP = K.el('p', null, '');
      heroBlock = [
        K.el('div', { class: 'fx-hero-row' }, V.hero,
          K.el('span', { class: 'fx-hero-lab' }, V.heroLab, K.el('small', null, K.t('de {0} que achei', fmtB(total))))),
        V.heroP,
      ];
    }
    const sum = K.el('section', { class: 'card gold fx-sum pop-in' + (clean ? ' is-clean' : '') },
      ...sparkles(4), art,
      K.el('div', { class: 'fx-sum-text' },
        K.el('span', { class: 'sticker fx-when' }, when),
        ...heroBlock,
        K.el('div', { class: 'fx-sum-act' }, again)));
    let stackBox = null;
    if (!clean && total > 0) {
      stackBox = K.el('div', { class: 'fx-sum-stack' }, K.el('div', { class: 'fx-sum-stack-t' }, K.t('O que está marcado, por tipo')));
      const box = K.el('div');
      stackBox.appendChild(box);
      sum.appendChild(stackBox);
      V.after.push(() => { V.stack = keepChart(K.charts.stack(box, stackOpts())); });
    }
    V.panel.appendChild(sum);
    addMascot(art, 128, { face: clean ? 'joy' : 'happy' });
    if (V.hero && selIds(st).length) countBytes(V.hero, selBytes(st));

    /* avisos honestos */
    const notes = stateNotes('suj');
    if (errs.length || incompletos.length) {
      const bits = [];
      if (errs.length) bits.push(K.t('não consegui ler {0}', errs.map((s) => catInfo(s.id).titulo.toLowerCase()).join(K.t(' e '))));
      if (incompletos.length) bits.push(K.t('parei no meio em {0}', incompletos.map((s) => catInfo(s.id).titulo.toLowerCase()).join(K.t(' e '))));
      notes.push(K.el('div', { class: 'tip fx-note warn', html: K.icon('alert') },
        K.el('p', null, K.el('b', null, K.t('Procura incompleta. ')), K.t('Nessa rodada {0}. Pode ter mais.', bits.join(K.t(', e ')))),
        K.el('button', { class: 'btn small', type: 'button', onclick: () => { scanSujeira(); } }, K.t('Tentar de novo'))));
    }
    if (denied > 0) notes.push(permissionTip(denied));
    if (openApps.length) {
      const names = Array.from(new Set(openApps.map((it) => it.app || it.nome))).map(inl);
      const b = openApps.reduce((a, it) => a + (it.bytes || 0), 0);
      const who = names.length <= 2 ? names.join(K.t(' e ')) : K.t('{0} e mais {1}', names.slice(0, 2).join(', '), names.length - 2);
      notes.push(K.el('div', { class: 'tip fx-note', html: K.icon('info') },
        K.el('p', null, names.length === 1 ? K.t('{0} está aberto: o cache ({1}) fica de fora. Feche e procure de novo pra incluir.', who, fmtB(b)) : K.t('{0} estão abertos: o cache ({1}) fica de fora. Feche e procure de novo pra incluir.', who, fmtB(b)))));
    }
    if (notes.length) V.panel.appendChild(K.el('div', { class: 'fx-notes' }, notes));

    /* cartões por categoria */
    const list = K.el('div', { class: 'fx-cats' });
    steps.forEach((s, i) => list.appendChild(catCard(s.id, i)));
    V.panel.appendChild(list);
    V.heroCounting = true;       // o herói está contando: o primeiro refresh não pisa na animação
    refreshSel('suj');
    V.heroCounting = false;
  }

  /** número herói e o parágrafo embaixo dele, sempre de acordo com o que está marcado agora */
  function paintHero(writeNum) {
    const st = S.suj;
    if (!V.hero || !V.heroP) return;
    const ids = selIds(st);
    const n = ids.length;
    const dl = ids.filter((id) => isDl(st.items.get(id))).length;
    V.hero.classList.toggle('is-none', !n);
    if (writeNum || !n) { V.hero._count = null; V.hero.textContent = n ? fmtB(selBytes(st)) : K.t('Nada'); }
    V.heroLab.textContent = n ? K.t('pra liberar') : K.t('marcado agora');
    let p;
    if (!st.touched) {
      p = n ? K.t('Já marquei o que é seguro: {0}. Abra cada tipo pra conferir.', plural(n, K.t('item'), K.t('itens')))
        : K.t('Nada veio marcado: vale você olhar antes. Abra cada tipo pra escolher.');
    } else if (n) {
      const mine = dl ? K.t(', {0} da pasta Downloads', dl === 1 ? K.t('um deles é arquivo seu') : K.t('{0} deles são arquivos seus', K.fmt.num(dl))) : '';
      p = `${plural(n, K.t('item marcado'), K.t('itens marcados'))}${mine}.`;
    } else {
      p = K.t('Nada sai daqui sem você marcar.');
    }
    V.heroP.textContent = p;
  }

  function permissionTip(n) {
    return K.el('div', { class: 'tip fx-note', html: K.icon('lock') },
      K.el('p', null, K.el('b', null, K.t('O macOS não me deixou ler tudo. ')),
        K.t('{0} de fora. Pra eu olhar tudo, dê Acesso Total ao Disco.', n === 1 ? K.t('Uma pasta ficou') : K.t('{0} pastas ficaram', K.fmt.num(n)))),
      K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'privacidade-disco' }).catch(() => {}); } },
        K.t('Abrir Ajustes'), K.el('span', { class: 'btn-ic', html: K.icon('arrow') })));
  }

  function catCard(id, i) {
    const st = S.suj;
    const meta = CATS[id];
    const info = catInfo(id);
    const d = st.data[id] || { itens: [], bytes: 0 };
    const items = (d.itens || []).slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    const card = K.el('article', { class: 'card fx-cat pop-in', dataset: { cat: id }, style: { animationDelay: 120 + i * 70 + 'ms' } });
    const ic = K.el('span', { class: 'head-ic fx-cat-ic', html: K.icon(meta.icon) }, K.el('i', { class: 'fx-swatch', style: { background: meta.color } }));
    if (d.error) {
      card.classList.add('is-err');
      card.appendChild(K.el('div', { class: 'fx-cat-head' }, ic,
        K.el('div', { class: 'fx-cat-text' }, K.el('h3', null, info.titulo, K.statusPill('none', K.t('Não deu pra ler'), 'info')),
          K.el('p', null, K.t('Não consegui olhar agora ({0}).', why(d.error))))));
      return card;
    }
    if (!items.length) {
      card.classList.add('is-empty');
      card.appendChild(K.el('div', { class: 'fx-cat-head' }, ic,
        K.el('div', { class: 'fx-cat-text' }, K.el('h3', null, info.titulo, K.statusPill('good', d.incompleto ? K.t('Nada até onde olhei') : K.t('Limpinho'), 'sparkle')),
          K.el('p', null, info.descricao))));
      return card;
    }
    /* Downloads esquecidos: sem "marcar tudo" (são arquivos da pessoa, um por um) */
    const bulk = id !== 'downloads';
    const chk = bulk ? K.checkbox({ label: K.t('Marcar tudo em {0}', info.titulo), onchange: () => toggleCat(id) })
      : K.el('span', { class: 'fx-cat-solo', title: K.t('Arquivos seus: marque um por um.'), 'aria-hidden': 'true', html: K.icon('fxFile') });
    const open = st.open.has(id);
    const chev = K.el('span', { class: 'fx-chev', html: K.icon('fxChevron') });
    const openBtn = K.el('button', { class: 'btn small fx-open', type: 'button', 'aria-expanded': String(open), onclick: (e) => { e.stopPropagation(); toggleOpen(id); } },
      K.el('span', { class: 'fx-open-t' }, open ? K.t('Esconder') : K.t('Ver itens')), chev);
    const selTxt = K.el('span', { class: 'fx-cat-sel' });
    const pills = [];
    if (d.incompleto) pills.push(tag('warn', 'clock', K.t('parei no meio'), K.t('Parei no meio: pode ter mais.')));
    if (!bulk) pills.push(tag('plain', null, K.t('um por um'), K.t('Arquivos seus: marque um por um.')));
    const head = K.el('div', { class: 'fx-cat-head is-click' }, chk, ic,
      K.el('div', { class: 'fx-cat-text' },
        K.el('h3', null, info.titulo, ...pills),
        K.el('p', null, bulk ? info.descricao : K.t('{0} Não é cache: o que for pra Lixeira só volta se você devolver.', info.descricao))),
      K.el('div', { class: 'fx-cat-num' },
        K.el('b', { class: 'num' }, fmtB(d.bytes)),
        K.el('span', { class: 'fx-cat-count' }, plural(items.length, K.t('item'), K.t('itens'))),
        selTxt),
      openBtn);
    head.addEventListener('click', (e) => { if (!e.target.closest('button')) toggleOpen(id); });
    const list = K.el('ul', { class: 'fx-items', hidden: !open });
    card.append(head, list);
    V.cats.set(id, { chk: bulk ? chk : null, selTxt, list, openBtn, card, items });
    card.classList.toggle('is-open', open);
    if (open) fillList(list, 'suj', items, 'cat:' + id);
    return card;
  }

  function toggleOpen(id, force) {
    const st = S.suj;
    const c = V.cats.get(id);
    if (!c) return;
    const open = force != null ? force : !st.open.has(id);
    if (open) st.open.add(id); else st.open.delete(id);
    c.list.hidden = !open;
    c.card.classList.toggle('is-open', open);
    c.openBtn.setAttribute('aria-expanded', String(open));
    c.openBtn.querySelector('.fx-open-t').textContent = open ? K.t('Esconder') : K.t('Ver itens');
    if (open && !c.list.childElementCount) fillList(c.list, 'suj', c.items, 'cat:' + id);
    if (force == null) K.sound.tick();
    refreshSel('suj');
  }

  /* ---------- linhas de item (Sujeira, Grandes, Duplicados) ---------- */

  function fillList(ul, kind, items, key, o) {
    const st = S[kind];
    const shown = st.shown[key] || PAGE;
    st.shown[key] = shown;
    ul.replaceChildren();
    items.slice(0, shown).forEach((it, i) => ul.appendChild(itemRow(kind, it, o && o.extra ? o.extra(it, i) : null)));
    if (items.length > shown) {
      const rest = items.length - shown;
      const more = K.el('li', { class: 'fx-more' },
        K.el('button', { class: 'btn small', type: 'button', onclick: () => {
          K.sound.tick();
          st.shown[key] = shown + PAGE * 2;
          fillList(ul, kind, items, key, o);
          refreshSel(kind);
        } }, K.t('Mostrar mais {0}', K.fmt.num(Math.min(rest, PAGE * 2))), rest > PAGE * 2 ? K.el('span', { class: 'muted' }, K.t(' de {0}', K.fmt.num(rest))) : null));
      ul.appendChild(more);
    }
  }

  function metaFor(kind, it) {
    const bits = [];
    if (kind !== 'suj' || it.categoria === 'downloads') {
      const m = quando(it.modificado);
      if (m) bits.push(K.t('mexido pela última vez {0}', m));
      const u = quando(it.usado);
      if (u && (!isNum(it.modificado) || Math.abs(it.usado - it.modificado) > 86400)) bits.push(K.t('aberto {0}', u));
    }
    return bits.join(' · ');
  }

  /** nome que a linha mostra: o app dono (caches) ou o nome do arquivo. Dois itens do mesmo app
      (BraveSoftware e com.brave.Browser) ganham o nome da pasta junto, pra não parecerem repetidos */
  function rowName(kind, it) {
    if (kind !== 'suj' || !it.app) return vis(it.nome);
    const rep = S.suj.repApps;
    return rep && rep.has(it.app) && it.nome !== it.app ? `${vis(it.app)} · ${vis(it.nome)}` : vis(it.app);
  }

  function itemRow(kind, it, extra) {
    const ok = selectable(it);
    const nameTxt = rowName(kind, it);
    const chk = K.checkbox({ label: K.t('Marcar ') + nameTxt, onchange: () => toggleItem(kind, it.id) });
    const tags = K.el('span', { class: 'fx-tags' });
    if (extra && extra.first) {
      tags.appendChild(extra.tie
        ? tag('keep', 'fxKeep', K.t('parece o original'), K.t('Mesma data: sugiro manter esta, pela pasta e pelo nome.'))
        : tag('keep', 'clock', K.t('a mais antiga'), K.t('A mais antiga: sugiro manter esta.')));
    }
    let keep = null;
    if (kind === 'dup') { keep = tag('good', 'fxKeep', 'fica'); keep.hidden = true; tags.appendChild(keep); }
    if (it.appAberto) tags.appendChild(tag('warn', 'lock', K.t('aberto: feche antes'), K.t('{0} está aberto. Feche e procure de novo pra limpar.', nameTxt)));
    if (it.semAcesso) tags.appendChild(tag('none', 'lock', K.t('sem acesso'), K.t('O macOS não deixou ler esta pasta (falta Acesso Total ao Disco).')));
    else if (it.parcial) tags.appendChild(tag('warn', 'lock', K.t('parte sem acesso'), K.t('O macOS não deixou ler parte desta pasta: o tamanho é o mínimo.')));
    if (kind !== 'dup' && S.lastCopy.has(it.caminho)) {
      tags.appendChild(tag('warn', 'fxCopy', K.t('última cópia'), K.t('As outras cópias já estão na Lixeira. Esta é a que sobrou.')));
    }
    if (tricky(it.nome) || tricky(it.caminho)) {
      tags.appendChild(tag('warn', 'alert', K.t('nome disfarçado'), K.t('O nome tem um caractere invisível que troca a ordem das letras. Mostro um � no lugar.')));
    }
    const lines = [K.el('span', { class: 'fx-item-top' }, K.el('span', { class: 'fx-item-name' }, nameTxt), tags),
      K.el('span', { class: 'fx-item-path', title: vis(it.caminho) }, vis(it.caminho))];
    const meta = metaFor(kind, it);
    if (meta) lines.push(K.el('span', { class: 'fx-item-meta' }, meta));
    const note = noteFor(it);
    if (note) lines.push(K.el('span', { class: 'fx-item-note' }, note));
    const unread = it.semAcesso && !it.bytes;
    const size = K.el('span', { class: 'fx-item-size num' + (unread ? ' no-read' : '') },
      unread ? K.t('sem leitura') : it.parcial ? K.el('small', null, K.t('pelo menos ')) : null, unread ? null : fmtB(it.bytes));
    const reveal = K.el('button', { class: 'fx-reveal', type: 'button', title: K.t('Mostrar no Finder'), 'aria-label': K.t('Mostrar {0} no Finder', nameTxt), html: K.icon('fxFinder'),
      onclick: (e) => { e.stopPropagation(); revealItem(it.id, row); } });
    const row = K.el('li', { class: 'fx-item' + (ok ? '' : ' is-off'), dataset: { id: it.id } },
      chk, iconEl(it), K.el('span', { class: 'fx-item-text' }, lines), size, reveal);
    row.addEventListener('click', (e) => { if (e.target.closest('button')) return; if (ok) toggleItem(kind, it.id); });
    V.rows.set(it.id, { row, chk, kind, keep });
    const st = S[kind];
    chk.set(st.sel.has(it.id) && ok, !ok);
    row.classList.toggle('is-sel', st.sel.has(it.id));
    return row;
  }

  async function revealItem(id, row) {
    K.sound.plop();
    try { await K.api('cleanup.reveal', { id }); } catch (e) {
      K.sound.oops();
      if (row) flashRow(row, K.t('Não achei esse item no Finder: ele pode ter mudado de lugar.'));
    }
  }

  function flashRow(row, text) {
    const old = row.querySelector('.fx-row-msg');
    if (old) old.remove();
    const msg = K.el('span', { class: 'fx-row-msg', role: 'status' }, text);
    const box = row.querySelector('.fx-item-text') || row;
    box.appendChild(msg);
    setTimeout(() => msg.remove(), 6000);
  }

  /* ================= Arquivos grandes ================= */

  function paintGrandes() {
    const st = S.gra;
    if (st.mode === 'idle') paintIntro('gra');
    else if (st.mode === 'scanning') paintSearching('gra');
    else if (st.mode === 'error') paintSearchError('gra');
    else if (st.mode === 'done') paintDone('gra');
    else paintGrandesResult();
  }

  const INTRO = {
    gra: {
      icon: 'fxBig', title: K.t('Arquivos grandes esquecidos'),
      text: K.t('De 100 MB pra cima, nas suas pastas. Nada vem marcado: você escolhe um por um.'),
      btn: K.t('Procurar arquivos grandes'), wait: K.t('Pode levar até 40 segundos.'),
      doing: K.t('Procurando arquivos de 100 MB ou mais…'), bubble: K.t('Coisa grande\nescondida?'),
    },
    dup: {
      icon: 'fxCopy', title: K.t('Arquivos repetidos'),
      text: K.t('Conteúdo idêntico, de 1 MB pra cima. Em cada grupo, uma cópia sempre fica.'),
      btn: K.t('Procurar duplicados'), wait: K.t('Pode levar até um minuto.'),
      doing: K.t('Comparando o conteúdo dos arquivos…'), bubble: K.t('Tem coisa\nem dobro?'),
    },
  };

  function paintIntro(kind) {
    const st = S[kind];
    const t = INTRO[kind];
    const art = K.el('div', { class: 'fx-intro-art' },
      K.el('div', { class: 'fx-intro-mascot' }),
      K.el('span', { class: 'fx-intro-badge', html: K.icon(t.icon) }),
      K.el('div', { class: 'fx-bubble fx-intro-bubble' }, t.bubble));
    const expired = st.expired ? K.el('div', { class: 'tip fx-expired', html: K.icon('clock') },
      K.el('p', null, K.t('A lista venceu (vale uma hora). Procure de novo.'))) : null;
    const card = K.el('section', { class: 'card fx-intro pop-in' },
      art,
      K.el('div', { class: 'fx-intro-text' },
        K.el('h2', null, t.title),
        K.el('p', null, t.text),
        K.el('div', { class: 'fx-folders' }, K.el('span', { class: 'fx-folders-t' }, K.t('Onde eu olho:')),
          PERSONAL.map((f) => K.el('span', { class: 'fx-folder', html: K.icon('fxFolder') }, f))),
        K.el('div', { class: 'tip fx-perm', html: K.icon('lock') },
          K.el('p', null, K.t('Se o macOS pedir acesso, é só permitir. Se negar, eu pulo a pasta.'))),
        K.el('div', { class: 'fx-intro-act' },
          K.el('button', { class: 'btn gold fx-intro-go', type: 'button', html: K.icon('scan'), onclick: () => { search(kind); } }, t.btn),
          K.el('span', { class: 'muted fx-intro-wait' }, t.wait))));
    V.panel.append(...[expired, card].filter(Boolean));
    addMascot(art.querySelector('.fx-intro-mascot'), 130, { face: 'happy' });
  }

  function paintSearching(kind) {
    const st = S[kind];
    const t = INTRO[kind];
    const ringEl = K.el('div');
    const ringBox = K.el('div', { class: 'fx-search-ring' }, ringEl, K.el('span', { class: 'fx-search-ic', html: K.icon(t.icon) }));
    const secs = K.el('span', { class: 'num' }, '');
    const tick = () => { secs.textContent = K.fmt.num(Math.max(0, Math.floor((performance.now() - st.t0) / 1000)), 0) + K.t(' s'); };
    tick();
    const card = K.el('section', { class: 'card fx-search pop-in', role: 'status', 'aria-live': 'polite' },
      ringBox,
      K.el('div', { class: 'fx-search-text' },
        K.el('span', { class: 'sticker fx-when' }, K.t('Procurando… '), secs),
        K.el('h2', null, t.doing),
        K.el('p', null, t.wait),
        K.el('div', { class: 'fx-folders' }, PERSONAL.map((f) => K.el('span', { class: 'fx-folder', html: K.icon('fxFolder') }, f))),
        K.el('p', { class: 'muted fx-search-hint' }, K.t('Pode trocar de aba enquanto isso.'))));
    V.panel.appendChild(card);
    V.after.push(() => keepChart(K.charts.ring(ringEl, { value: null, busy: true, tone: 'gold', text: '', size: 150, thickness: 13 })));
    if (!snap()) V.timers.push(setInterval(tick, 1000));
  }

  function paintSearchError(kind) {
    const st = S[kind];
    const t = INTRO[kind];
    /* o mesmo cartão de erro das outras telas */
    const c = K.errorCard({ title: K.t('Não consegui terminar a procura'), reason: why(st.err), retry: () => { search(kind); }, retryHint: t.wait });
    c.classList.add('pop-in');
    V.panel.appendChild(c);
  }

  function search(kind) {
    const st = S[kind];
    if (st.mode === 'scanning' || st.mode === 'cleaning') return st.promise || Promise.resolve();
    const run = ++st.run;
    Object.assign(st, { mode: 'scanning', items: new Map(), sel: new Set(), data: null, err: null, done: null, shown: {}, filter: 'todos', expired: false,
      touched: false, cleanErr: null, stale: null, t0: performance.now() });
    K.sound.plop();
    if (S.tab === TAB_OF[kind]) paintTab(); else paintTabs();
    const cmd = kind === 'gra' ? ['cleanup.large', { minMB: 100 }, 120000] : ['cleanup.duplicates', { minMB: 1 }, 150000];
    st.promise = withTimeout(K.api(cmd[0], cmd[1]), cmd[2], K.t('a procura passou do tempo')).then((r) => {
      if (run !== st.run) return;
      st.data = r || {};
      if (kind === 'gra') {
        for (const it of st.data.itens || []) st.items.set(it.id, it);
      } else {
        for (const g of st.data.grupos || []) {
          g.itens = sortGroup(g.itens);
          for (const it of g.itens) st.items.set(it.id, it);
        }
        dupTotals(st);
      }
      st.took = (performance.now() - st.t0) / 1000;
      st.at = nowS();
      st.mode = 'result';
      K.sound.tada();
    }).catch((e) => {
      if (run !== st.run) return;
      st.mode = 'error';
      st.err = errMsg(e);
      K.sound.oops();
    }).then(() => {
      if (run !== st.run) return;
      if (S.tab === TAB_OF[kind]) { paintTab(); scrollTop(); } else paintTabs();
    });
    return st.promise;
  }

  function summaryCard(kind, o) {
    const st = S[kind];
    const again = K.el('button', { class: 'btn small', type: 'button', html: K.icon('cycle'), onclick: () => { search(kind); } }, K.t('Procurar de novo'));
    return K.el('section', { class: 'card fx-rsum pop-in' },
      K.el('span', { class: 'head-ic', html: K.icon(INTRO[kind].icon) }),
      K.el('div', { class: 'fx-rsum-text' },
        K.el('div', { class: 'fx-rsum-num' }, K.el('span', { class: 'num fx-rsum-big' }, o.big), K.el('span', { class: 'fx-rsum-lab' }, o.label)),
        K.el('p', null, o.text),
        o.actions ? K.el('div', { class: 'fx-rsum-main' }, o.actions) : null),
      K.el('div', { class: 'fx-rsum-act' }, again),
      K.el('span', { class: 'fx-rsum-when muted' }, K.t('Procura feita às {0} em {1} s', K.fmt.time(st.at), K.fmt.num(Math.max(1, st.took), 0))));
  }

  /** a procura não viu tudo: parou no meio ou o macOS negou alguma pasta */
  const partialSearch = (st) => !!(st.data && (st.data.incompleto || st.data.semAcesso > 0));

  function searchNotes(kind) {
    const st = S[kind];
    const out = stateNotes(kind);
    if (st.data && st.data.incompleto) {
      out.push(K.el('div', { class: 'tip fx-note warn', html: K.icon('clock') },
        K.el('p', null, K.el('b', null, K.t('Procura incompleta. ')), K.t('Parei antes de olhar tudo: pode ter mais.'))));
    }
    if (st.data && st.data.semAcesso > 0) out.push(permissionTip(st.data.semAcesso));
    return out.length ? K.el('div', { class: 'fx-notes' }, out) : null;
  }

  function paintGrandesResult() {
    const st = S.gra;
    const items = Array.from(st.items.values()).sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    const total = items.reduce((a, it) => a + (it.bytes || 0), 0);
    if (!items.length) {
      /* procura incompleta: "tudo leve" seria mentira, é "nada até onde consegui olhar" */
      const part = partialSearch(st);
      V.panel.appendChild(summaryCard('gra', part
        ? { big: K.t('Nenhum'), label: K.t('até onde consegui olhar'), text: K.t('A procura não viu tudo: o aviso abaixo diz o quê.') }
        : { big: K.t('Nenhum'), label: K.t('arquivo grande'), text: K.t('Tudo leve por aqui.') }));
      const n = searchNotes('gra');
      if (n) V.panel.appendChild(n);
      V.panel.appendChild(part
        ? emptyBox(K.t('Nada até onde consegui olhar'), K.t('Pode ter algo no que ficou de fora.'), 'happy')
        : emptyBox(K.t('Tudo leve por aqui'), K.t('Nada de 100 MB ou mais nas suas pastas.')));
      return;
    }
    V.panel.appendChild(summaryCard('gra', {
      big: fmtB(total), label: `em ${plural(items.length, K.t('arquivo grande'), K.t('arquivos grandes'))}`,
      text: K.t('Nada vem marcado: marque só o que não precisa mais.'),
    }));
    const n = searchNotes('gra');
    if (n) V.panel.appendChild(n);

    /* chips de filtro por tipo */
    const byType = {};
    for (const it of items) { const k = TIPOS[it.tipo] ? it.tipo : 'outro'; byType[k] = (byType[k] || 0) + 1; }
    const chips = K.el('div', { class: 'fx-chips', role: 'group', 'aria-label': K.t('Filtrar por tipo') });
    const chip = (id, label, icon, count) => {
      const b = K.el('button', { class: 'fx-chip' + (st.filter === id ? ' on' : ''), type: 'button', 'aria-pressed': String(st.filter === id), html: icon ? K.icon(icon) : null,
        onclick: () => { if (st.filter === id) return; K.sound.tick(); st.filter = id; st.shown = {}; paintTab(); } },
      K.el('span', null, label), K.el('span', { class: 'fx-chip-n num' }, K.fmt.num(count)));
      chips.appendChild(b);
    };
    chip('todos', K.t('Todos'), null, items.length);
    for (const k of Object.keys(TIPOS)) if (byType[k]) chip(k, TIPOS[k].label, TIPOS[k].icon, byType[k]);
    if (st.filter !== 'todos' && !byType[st.filter]) st.filter = 'todos';

    const vis = st.filter === 'todos' ? items : items.filter((it) => (TIPOS[it.tipo] ? it.tipo : 'outro') === st.filter);
    const ul = K.el('ul', { class: 'fx-items' });
    const card = K.el('section', { class: 'card fx-listcard pop-in', style: { animationDelay: '80ms' } },
      K.el('div', { class: 'fx-listcard-head' }, chips), ul);
    V.panel.appendChild(card);
    fillList(ul, 'gra', vis, 'f:' + st.filter);
    refreshSel('gra');
  }

  function emptyBox(title, text, face) {
    const art = K.el('div', { class: 'fx-empty-art' });
    const box = K.el('section', { class: 'fx-empty pop-in' }, art, K.el('div', null, K.el('h3', null, title), K.el('p', null, text)));
    V.after.push(() => addMascot(art, 96, { face: face || 'joy' }));
    return box;
  }

  /* ================= Duplicados ================= */

  function paintDuplicados() {
    const st = S.dup;
    if (st.mode === 'idle') paintIntro('dup');
    else if (st.mode === 'scanning') paintSearching('dup');
    else if (st.mode === 'error') paintSearchError('dup');
    else if (st.mode === 'done') paintDone('dup');
    else paintDuplicadosResult();
  }

  function paintDuplicadosResult() {
    const st = S.dup;
    const grupos = (st.data && st.data.grupos) || [];
    if (!grupos.length) {
      const part = partialSearch(st);
      V.panel.appendChild(summaryCard('dup', part
        ? { big: K.t('Nenhum'), label: K.t('até onde consegui olhar'), text: K.t('A procura não viu tudo: o aviso abaixo diz o quê.') }
        : { big: K.t('Nenhum'), label: K.t('repetido'), text: K.t('Cada coisa no seu lugar.') }));
      const n = searchNotes('dup');
      if (n) V.panel.appendChild(n);
      V.panel.appendChild(part
        ? emptyBox(K.t('Nada até onde consegui olhar'), K.t('Pode ter algo no que ficou de fora.'), 'happy')
        : emptyBox(K.t('Nada em dobro'), K.t('Nenhum arquivo de 1 MB ou mais repetido nas suas pastas.')));
      return;
    }
    const mark = K.el('button', { class: 'btn small gold', type: 'button', html: K.icon('fxCopy'), onclick: () => { markCopies(); } }, K.t('Marcar as cópias (mantém a mais antiga)'));
    V.panel.appendChild(summaryCard('dup', {
      big: fmtB(st.data.desperdicio), label: K.t('em cópias repetidas'),
      text: K.t('{0} de arquivos iguais. Em cada grupo, uma cópia sempre fica.', plural(grupos.length, K.t('grupo'), K.t('grupos'))),
      actions: mark,
    }));
    const n = searchNotes('dup');
    if (n) V.panel.appendChild(n);
    const list = K.el('div', { class: 'fx-groups' });
    grupos.forEach((g, i) => list.appendChild(groupCard(g, i)));
    V.panel.appendChild(list);
    refreshSel('dup');
  }

  function groupCard(g, i) {
    const first = g.itens[0] || {};
    const sel = K.el('span', { class: 'fx-group-sel' });
    const msg = K.el('p', { class: 'fx-group-msg', role: 'status', hidden: true }, K.t('Pelo menos uma cópia fica: não dá pra marcar todas.'));
    const ul = K.el('ul', { class: 'fx-items' });
    /* "X cada" só quando as linhas mostram o mesmo número; conteúdo igual pode ocupar um pouco
       mais ou menos no disco, e aí eu digo a faixa em vez de um "cada" que não bate com a linha */
    const sizes = g.itens.map((x) => x.bytes || 0);
    const lo = Math.min(...sizes), hi = Math.max(...sizes);
    const each = fmtB(lo) === fmtB(hi)
      ? K.el('span', null, K.t('{0} cada', fmtB(hi)))
      : K.el('span', { title: K.t('Conteúdo idêntico; o espaço no disco pode variar um pouco.') }, K.t('conteúdo igual, de {0} a {1} no disco', fmtB(lo), fmtB(hi)));
    const tie = g.itens.length > 1 && sameAge(g.itens[0], g.itens[1]);
    const card = K.el('article', { class: 'card fx-group pop-in', dataset: { grupo: g.id }, style: { animationDelay: 80 + Math.min(i, 8) * 60 + 'ms' } },
      K.el('div', { class: 'fx-group-head' },
        K.el('span', { class: 'head-ic', html: K.icon(typeIcon(first)) }),
        K.el('div', { class: 'fx-group-text' },
          K.el('h3', null, vis(first.nome) || K.t('Arquivo repetido')),
          K.el('p', null, `${plural(g.itens.length, K.t('cópia igual'), K.t('cópias iguais'))} · `, each)),
        K.el('div', { class: 'fx-group-num' }, K.el('b', { class: 'num' }, fmtB(g.desperdicio)), K.el('span', null, K.t('sobrando')), sel)),
      msg, ul);
    V.groups.set(g.id, { card, sel, msg });
    fillList(ul, 'dup', g.itens, 'g:' + g.id, { extra: (it, idx) => ({ first: idx === 0, tie: idx === 0 && tie }) });
    return card;
  }

  /* ================= limpar → confirmar → resultado ================= */

  /** lista curta de arquivos pro modal e pro resultado: os maiores com nome, o resto somado */
  function fileList(items, max) {
    max = max || 4;
    const top = items.slice().sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    const rows = top.slice(0, max).map((it) => K.el('li', null,
      K.el('span', { class: 'fx-cf-ic', html: K.icon(typeIcon(it)) }),
      K.el('span', { class: 'fx-cf-name', title: vis(it.caminho) || null }, vis(it.nome)),
      K.el('b', { class: 'num' }, it.parcial ? K.t('pelo menos ') : '', fmtB(it.bytes))));
    if (top.length > max) {
      const rest = top.slice(max);
      rows.push(K.el('li', { class: 'fx-cf-rest' }, K.el('span', { class: 'fx-cf-name' }, K.t('e mais {0}', plural(rest.length, K.t('arquivo'), K.t('arquivos')))),
        K.el('b', { class: 'num' }, fmtB(rest.reduce((a, it) => a + (it.bytes || 0), 0)))));
    }
    return K.el('ul', { class: 'fx-cf' }, rows);
  }

  function confirmBody(kind, ids) {
    const st = S[kind];
    const items = ids.map((id) => st.items.get(id)).filter(Boolean);
    const out = [];
    if (kind === 'suj') {
      const rows = [];
      for (const s of st.steps || []) {
        const mine = items.filter((it) => it.categoria === s.id);
        if (!mine.length) continue;
        rows.push(K.el('li', null,
          K.el('i', { class: 'fx-swatch', style: { background: CATS[s.id].color } }),
          K.el('span', { class: 'fx-cf-name' }, catInfo(s.id).titulo),
          K.el('span', { class: 'fx-cf-n' }, plural(mine.length, K.t('item'), K.t('itens'))),
          K.el('b', { class: 'num' }, fmtB(mine.reduce((a, it) => a + (it.bytes || 0), 0)))));
      }
      out.push(K.el('ul', { class: 'fx-cf' }, rows));
      /* Downloads esquecidos são arquivos da pessoa: vão com nome, não só com o total */
      const dl = items.filter(isDl);
      if (dl.length) {
        out.push(K.el('p', { class: 'fx-cf-t' }, dl.length === 1 ? K.t('O arquivo seu que vai junto:') : K.t('Seus arquivos da pasta Downloads que vão junto:')), fileList(dl));
      }
    } else {
      /* Arquivos grandes com filtro: o que está marcado mas escondido pelo filtro vem à parte */
      const hidden = kind === 'gra' ? hiddenByFilter(st, ids) : [];
      const shown = hidden.length ? items.filter((it) => !hidden.includes(it)) : items;
      if (shown.length) out.push(fileList(shown));
      if (hidden.length) {
        const f = TIPOS[st.filter] ? TIPOS[st.filter].label : st.filter;
        out.push(K.el('p', { class: 'fx-cf-t' }, K.t('E {0} fora do filtro “{1}”:', hidden.length === 1 ? K.t('mais 1 marcado') : K.t('mais {0} marcados', K.fmt.num(hidden.length)), f)),
          fileList(hidden));
      }
    }
    const warn = kind === 'dup' ? null : lastCopyWarn(items);
    if (warn) out.push(warn);
    return out;
  }

  /** texto do modal de limpar: diz com honestidade o que volta sozinho e o que não volta */
  function confirmText(kind, items) {
    const n = items.length;
    if (kind === 'gra') return K.t('{0} {1}, {2} por você.', isAre(n), plural(n, K.t('arquivo seu'), K.t('arquivos seus')), n === 1 ? K.t('escolhido') : K.t('escolhidos'));
    if (kind === 'dup') return K.t('{0} {1}. Em cada grupo, uma cópia fica.', isAre(n), plural(n, K.t('cópia repetida'), K.t('cópias repetidas')));
    const dl = items.filter(isDl).length;
    if (!dl) return K.t('{0} {1} de cache e registro. Os apps recriam o que precisarem.', isAre(n), plural(n, K.t('item'), K.t('itens')));
    if (dl === n) {
      return K.t('{0} {1} de Downloads. Não é cache: se a Lixeira for esvaziada, {2}.', isAre(n), plural(n, K.t('arquivo seu'), K.t('arquivos seus')), n === 1 ? K.t('ele não volta') : K.t('eles não voltam'));
    }
    return K.t('{0} {1}. Inclui {2} de Downloads, que não {3} se a Lixeira for esvaziada.', isAre(n), plural(n, K.t('item'), K.t('itens')), plural(dl, K.t('arquivo seu'), K.t('arquivos seus')), dl === 1 ? K.t('volta') : K.t('voltam'));
  }

  /** os IDs do Swift valem 1 h: lista velha não limpa nada, então pede uma procura nova */
  function expiredNow(kind) {
    const st = S[kind];
    if (!(st.at && nowS() - st.at > KEEP_S)) return false;
    K.sound.oops();
    Object.assign(st, blank(), { run: st.run + 1, expired: true });
    if (S.tab === TAB_OF[kind] && mounted()) paintTab(); else paintTabs();
    return true;
  }

  async function cleanKind(kind, opts) {
    opts = opts || {};
    const st = S[kind];
    if (st.mode !== 'result') return;
    let ids = selIds(st);
    if (!ids.length) return;
    if (expiredNow(kind)) return;
    /* duplicados: confere de novo que nenhum grupo fica vazio (o Swift também recusa) */
    if (kind === 'dup') {
      for (const g of (st.data && st.data.grupos) || []) {
        if (g.itens.every((x) => st.sel.has(x.id))) { denyDup(g.itens[0]); return; }
      }
    }
    let items = ids.map((id) => st.items.get(id));
    let bytes = items.reduce((a, it) => a + (it.bytes || 0), 0);
    if (!opts.semConfirmar) {
      K.sound.plop();
      const mine = items.some((it) => kind !== 'suj' || isDl(it));
      const ok = await K.confirm({
        title: K.t('Mandar {0}{1} pra Lixeira?', items.some((it) => it.parcial) ? K.t('pelo menos ') : '', fmtB(bytes)),
        text: confirmText(kind, items),
        body: confirmBody(kind, ids),
        note: mine
          ? { icon: 'fxUndo', tone: 'good', text: K.t('Dá pra desfazer: fica na Lixeira, e dá pra devolver pela aba Lixeira.') }
          : { icon: 'fxUndo', tone: 'good', text: K.t('Dá pra desfazer: fica tudo na Lixeira até você esvaziar.') },
        ok: K.t('Mandar pra Lixeira'), cancel: K.t('Agora não'), icon: 'fxTrash', mascot: 'happy',
      });
      if (!ok || st.mode !== 'result') return;
      /* o modal pode ter ficado aberto muito tempo: confere a idade da lista de novo */
      if (expiredNow(kind)) return;
      ids = selIds(st);
      if (!ids.length) return;
      items = ids.map((id) => st.items.get(id));
      bytes = items.reduce((a, it) => a + (it.bytes || 0), 0);
    }
    st.mode = 'cleaning';
    paintBar();
    paintTabs();
    let res;
    try {
      res = await K.api('cleanup.clean', { ids });
    } catch (e) {
      st.mode = 'result';
      K.sound.oops();
      st.cleanErr = errMsg(e);
      if (S.tab === TAB_OF[kind] && mounted()) { paintTab(); scrollTop(); } else paintTabs();
      return;
    }
    st.cleanErr = null;
    if (res && res.caixaDeAreia) { S.sandbox = true; paintSandbox(); }
    const movedList = (res && res.movidos) || [];
    const movedIds = new Set(movedList.map((m) => m.id));
    const byCat = {};
    /* guarda categoria e caminho de cada item que foi (a lista da aba some depois daqui) */
    const info = movedList.map((m) => {
      const it = st.items.get(m.id) || {};
      const c = it.categoria || 'outro';
      byCat[c] = (byCat[c] || 0) + (m.bytes || 0);
      return { id: m.id, lixeiraId: m.lixeiraId, nome: m.nome || it.nome, bytes: m.bytes, categoria: c, caminho: it.caminho || null, tipo: it.tipo };
    });
    const paths = info.map((m) => m.caminho).filter(Boolean);
    /* duplicados: a cópia que sobrou sozinha num grupo é a última fora da Lixeira */
    if (kind === 'dup') {
      for (const g of (st.data && st.data.grupos) || []) {
        const went = g.itens.filter((x) => movedIds.has(x.id));
        const left = g.itens.filter((x) => !movedIds.has(x.id));
        if (went.length && left.length === 1) markLast(left[0].caminho, went.map((x) => x.caminho));
      }
    }
    for (const p of paths) S.lastCopy.delete(p);
    for (const id of movedIds) { st.items.delete(id); st.sel.delete(id); }
    pruneOthers(kind, paths);
    st.done = { res: res || { movidos: [], falhas: [], bytes: 0 }, info, asked: ids.length, bytesAsked: bytes, byCat, at: nowS(), undo: null, purge: null, busy: null };
    st.mode = 'done';
    if (movedList.length) K.sound.tada(); else K.sound.oops();
    if (S.tab === TAB_OF[kind] && mounted()) { paintTab(); scrollTop(); } else paintTabs();
    loadLixeira();
  }

  function paintDone(kind) {
    const st = S[kind];
    const d = st.done;
    const r = d.res || {};
    const moved = r.movidos || [];
    const fails = r.falhas || [];
    const info = d.info || moved;
    const bytes = moved.reduce((a, m) => a + (m.bytes || 0), 0) || r.bytes || 0;
    const lixIds = moved.map((m) => m.lixeiraId).filter(Boolean);
    const files = kind !== 'suj';
    const dlMoved = info.filter(isDl);
    let title, sub, face = 'joy';
    if (d.purge && d.purge.res) {
      const p = d.purge.res;
      title = p.ok ? K.t('Apagado de vez: {0} livres', fmtB(p.bytes)) : K.t('Não consegui apagar de vez');
      sub = p.ok ? K.t('O espaço voltou pro disco.') : K.t('Continua tudo na Lixeira. O motivo está abaixo.');
      if (!p.ok) face = 'worried';
    } else if (d.undo && d.undo.res) {
      const u = d.undo.res;
      const total = lixIds.length;
      if (u.ok === total) { title = K.t('Voltou tudo pro lugar'); sub = K.t('Nada foi apagado.'); face = 'happy'; }
      else if (u.ok > 0) { title = K.t('Voltaram {0} de {1}', K.fmt.num(u.ok), K.fmt.num(total)); sub = K.t('O resto continua na Lixeira. O motivo está abaixo.'); face = 'worried'; }
      else { title = K.t('Não consegui devolver'); sub = K.t('Continua tudo na Lixeira. O motivo está abaixo.'); face = 'worried'; }
    } else if (!moved.length) {
      title = K.t('Não consegui mandar nada pra Lixeira');
      sub = K.t('Nada foi mexido. O motivo está abaixo.');
      face = 'worried';
    } else {
      title = K.t('Pronto! {0} {1} pra Lixeira', fmtB(bytes), moved.length === 1 ? K.t('foi') : K.t('foram'));
      let what = '';
      if (kind === 'dup') what = K.t('Em cada grupo, uma cópia continua no lugar.');
      else if (kind === 'suj') {
        const caches = info.length - dlMoved.length;
        what = !dlMoved.length ? K.t('Os apps recriam o que precisarem.')
          : !caches ? K.t('{0} se você devolver.', dlMoved.length === 1 ? K.t('É arquivo seu: só volta') : K.t('São arquivos seus: só voltam'))
            : K.t('{0} se você devolver.', dlMoved.length === 1 ? K.t('O arquivo de Downloads só volta') : K.t('Os arquivos de Downloads só voltam'));
      }
      const left = fails.length ? K.t('{0} de fora: o motivo está abaixo. ', plural(fails.length, K.t('item ficou'), K.t('itens ficaram'))) : '';
      sub = K.t('{0}{1}Até esvaziar a Lixeira, dá pra desfazer.', left, what ? what + ' ' : '');
    }

    const art = K.el('div', { class: 'fx-sum-art' });
    const acts = K.el('div', { class: 'fx-sum-act' });
    const busy = d.busy;
    if (moved.length && !d.undo && !(d.purge && d.purge.res && d.purge.res.ok)) {
      acts.appendChild(K.el('button', { class: 'btn', type: 'button', html: K.icon('fxUndo'), disabled: !!busy, onclick: () => { undoKind(kind); } },
        busy === 'undo' ? K.t('Devolvendo…') : K.t('Desfazer')));
    }
    /* no momento do alívio, nada de "apagar de vez" em destaque: isso fica na aba Lixeira, com
       confirmação. Mesma ordem do Desinstalar: Desfazer · Ver na Lixeira · Procurar de novo */
    acts.appendChild(K.el('button', { class: 'btn ink', type: 'button', html: K.icon('fxTrash'), disabled: !!busy, onclick: () => { K.sound.plop(); setTab('lixeira'); } }, K.t('Ver na Lixeira')));
    acts.appendChild(K.el('button', { class: 'btn ghost', type: 'button', html: K.icon('cycle'), disabled: !!busy,
      onclick: () => { if (kind === 'suj') scanSujeira(); else search(kind); } }, K.t('Procurar de novo')));
    const sticker = (S.sandbox || r.caixaDeAreia ? K.t('modo de teste · Lixeira de mentira · ') : '') + K.t('feito às {0}', K.fmt.time(d.at));
    const sum = K.el('section', { class: 'card gold fx-sum fx-done pop-in' + (face === 'worried' ? ' is-sad' : '') },
      ...(face === 'joy' ? sparkles(4) : []), art,
      K.el('div', { class: 'fx-sum-text' },
        K.el('span', { class: 'sticker fx-when' }, sticker),
        K.el('h1', { class: 'fx-sum-title', tabindex: '-1' }, title),
        K.el('p', null, sub),
        acts));
    V.panel.appendChild(sum);
    addMascot(art, 128, { face });

    /* o que foi, por tipo (Sujeira, com os nomes dos arquivos de Downloads) ou a lista (arquivos) */
    if (moved.length && !d.undo) {
      const box = K.el('section', { class: 'card fx-moved pop-in', style: { animationDelay: '90ms' } },
        K.el('div', { class: 'fx-moved-head' }, K.el('h3', null, d.purge && d.purge.res && d.purge.res.ok ? K.t('O que foi apagado') : K.t('O que foi pra Lixeira')),
          K.el('span', { class: 'muted' }, plural(moved.length, K.t('item'), K.t('itens')))));
      if (kind === 'suj') {
        const ul = K.el('ul', { class: 'fx-cf' });
        for (const id of CAT_ORDER) {
          if (!d.byCat[id]) continue;
          ul.appendChild(K.el('li', null, K.el('i', { class: 'fx-swatch', style: { background: CATS[id].color } }),
            K.el('span', { class: 'fx-cf-name' }, catInfo(id).titulo), K.el('b', { class: 'num' }, fmtB(d.byCat[id]))));
        }
        box.appendChild(ul);
        if (dlMoved.length) box.append(K.el('p', { class: 'fx-cf-t' }, K.t('Seus arquivos de Downloads:')), fileList(dlMoved, 8));
      } else {
        box.appendChild(fileList(info, 8));
      }
      V.panel.appendChild(box);
    }

    /* falhas, sempre com o motivo */
    const failBlocks = [];
    if (fails.length) failBlocks.push(failList(K.t('{0} pra Lixeira', plural(fails.length, K.t('item não foi'), K.t('itens não foram'))), fails));
    if (d.undo && d.undo.res && d.undo.res.falhas && d.undo.res.falhas.length) failBlocks.push(failList(K.t('Não voltou pro lugar'), d.undo.res.falhas));
    if (d.undo && d.undo.err) failBlocks.push(errLine(K.t('Não consegui desfazer'), d.undo.err));
    if (d.purge && d.purge.res && d.purge.res.falhas && d.purge.res.falhas.length) failBlocks.push(failList(K.t('Não foi apagado'), d.purge.res.falhas));
    if (d.purge && d.purge.err) failBlocks.push(errLine(K.t('Não consegui apagar de vez'), d.purge.err));
    for (const f of failBlocks) V.panel.appendChild(f);
    if ((files || dlMoved.length) && moved.length && !d.undo && !d.purge) {
      V.panel.appendChild(K.el('div', { class: 'tip fx-note', html: K.icon('info') },
        K.el('p', null, K.t('Mudou de ideia? Na aba Lixeira dá pra devolver cada item pro lugar.'))));
    }
  }

  function failList(title, fails) {
    const ul = K.el('ul', { class: 'fx-fails' });
    fails.slice(0, 12).forEach((f) => ul.appendChild(K.el('li', null,
      K.el('span', { class: 'fx-fail-ic', html: K.icon('info') }),
      K.el('span', { class: 'fx-fail-name' }, vis(f.nome) || K.t('Item')),
      K.el('span', { class: 'fx-fail-why' }, why(f.motivo)))));
    if (fails.length > 12) ul.appendChild(K.el('li', { class: 'muted' }, K.t('e mais {0}', plural(fails.length - 12, K.t('item'), K.t('itens')))));
    return K.el('section', { class: 'card fx-failcard pop-in' }, K.el('h3', null, title), ul);
  }

  function errLine(title, msg) {
    return K.el('div', { class: 'error-box fx-clean-err', role: 'alert' }, K.el('b', null, title + '. '), K.t('O motivo: ') + why(msg) + '.');
  }

  async function undoKind(kind) {
    const st = S[kind];
    const d = st.done;
    if (!d || d.busy || d.undo) return;
    const ids = ((d.res && d.res.movidos) || []).map((m) => m.lixeiraId).filter(Boolean);
    if (!ids.length) return;
    K.sound.plop();
    d.busy = 'undo';
    if (S.tab === TAB_OF[kind]) paintTab();
    try {
      d.undo = { res: await K.api('cleanup.restore', { ids }) };
      if (d.undo.res.ok) K.sound.tada(); else K.sound.oops();
      const failed = new Set(((d.undo.res && d.undo.res.falhas) || []).map((f) => f.id));
      afterRestore((d.info || []).filter((m) => m.caminho && !failed.has(m.lixeiraId)).map((m) => m.caminho));
    } catch (e) {
      d.undo = null;
      d.undoErr = errMsg(e);
      K.sound.oops();
    }
    d.busy = null;
    if (!d.undo && d.undoErr) d.undo = { res: { ok: 0, bytes: 0, falhas: [] }, err: d.undoErr };
    if (S.tab === TAB_OF[kind] && mounted()) paintTab();
    loadLixeira();
  }

  async function purgeKind(kind, opts) {
    opts = opts || {};
    const st = S[kind];
    const d = st.done;
    if (!d || d.busy || d.undo || (d.purge && d.purge.res && d.purge.res.ok)) return;
    const moved = (d.res && d.res.movidos) || [];
    const ids = moved.map((m) => m.lixeiraId).filter(Boolean);
    if (!ids.length) return;
    const bytes = moved.reduce((a, m) => a + (m.bytes || 0), 0);
    if (!opts.semConfirmar) {
      K.sound.plop();
      /* Sujeira com Downloads esquecidos: também são arquivos da pessoa, com o mesmo cuidado */
      const dl = (d.info || []).filter(isDl);
      const files = kind !== 'suj' || dl.length > 0;
      const n = ids.length;
      let text;
      if (kind !== 'suj') text = K.t('Isso tira da Lixeira {0} que você acabou de mandar. Depois disso, só um backup (como o Time Machine) traz de volta.', n === 1 ? K.t('o arquivo') : K.t('os {0} arquivos', K.fmt.num(n)));
      else if (!dl.length) text = K.t('Isso tira da Lixeira {0} que eu acabei de mandar. São caches e registros: os apps recriam o que precisarem.', n === 1 ? K.t('o item') : K.t('os {0} itens', K.fmt.num(n)));
      else {
        const mine = dl.length === n ? (n === 1 ? K.t('É um arquivo seu') : K.t('São arquivos seus')) : `${dl.length === 1 ? K.t('Um deles é arquivo seu') : K.t('{0} deles são arquivos seus', K.fmt.num(dl.length))}`;
        text = K.t('Isso tira da Lixeira {0} que eu acabei de mandar. {1} de Downloads: depois disso, só um backup (como o Time Machine) traz de volta.', n === 1 ? K.t('o item') : K.t('os {0} itens', K.fmt.num(n)), mine);
      }
      const ok = await K.confirm({
        title: K.t('Apagar de vez {0}?', fmtB(bytes)),
        text,
        body: dl.length ? [K.el('p', { class: 'fx-cf-t' }, dl.length === 1 ? K.t('O arquivo seu que some de vez:') : K.t('Seus arquivos que somem de vez:')), fileList(dl)] : null,
        note: { tone: 'crit', icon: 'alert', text: K.t('Não dá pra desfazer. O resto da sua Lixeira fica como está.') },
        ok: K.t('Apagar de vez'), cancel: K.t('Deixar na Lixeira'), tone: 'danger', icon: 'flame',
        ack: files ? K.t('Entendi: não dá pra desfazer') : null,
      });
      if (!ok) return;
    }
    d.busy = 'purge';
    if (S.tab === TAB_OF[kind]) paintTab();
    try {
      d.purge = { res: await K.api('cleanup.purge', { ids, confirmado: true }) };
      if (d.purge.res.ok) K.sound.tada(); else K.sound.oops();
    } catch (e) {
      d.purge = { err: errMsg(e) };
      K.sound.oops();
    }
    d.busy = null;
    if (S.tab === TAB_OF[kind] && mounted()) paintTab();
    loadLixeira();
  }

  /* ================= Lixeira ================= */

  function loadLixeira() {
    const L = S.lix;
    /* já tem leitura em andamento: ela pode ser de antes da última mudança, então lê de novo no fim */
    if (L.loading) { L.again = true; return L.promise.then(() => (L.again ? loadLixeira() : null)); }
    L.loading = true;
    L.again = false;
    if (mounted() && S.tab === 'lixeira' && !L.info && !L.moved) paintTab();
    L.promise = Promise.allSettled([
      withTimeout(K.api('cleanup.trashInfo'), 25000, K.t('a Lixeira demorou demais pra responder')),
      withTimeout(K.api('cleanup.moved'), 10000),
    ]).then(([a, b]) => {
      L.info = a.status === 'fulfilled' ? a.value : null;
      L.infoErr = a.status === 'rejected' ? errMsg(a.reason) : null;
      L.moved = b.status === 'fulfilled' ? b.value : L.moved;
      L.movedErr = b.status === 'rejected' ? errMsg(b.reason) : null;
      if ((L.info && L.info.caixaDeAreia) || (L.moved && L.moved.caixaDeAreia)) S.sandbox = true;
      L.loading = false;
      L.at = nowS();
      if (L.again) { L.again = false; return loadLixeira(); }
      if (mounted()) {
        paintSandbox();
        if (S.tab === 'lixeira') paintTab(); else paintTabs();
      }
    });
    return L.promise;
  }

  function paintLixeira() {
    const L = S.lix;
    if (!L.info && !L.moved && (L.loading || !L.at)) {
      V.panel.appendChild(K.el('div', { class: 'loading' }, K.t('Olhando a Lixeira…')));
      return;
    }
    const info = L.info;
    const moved = (L.moved && L.moved.itens) || [];
    const still = moved.filter((m) => m.naLixeira);
    const fromFax = still.reduce((a, m) => a + (m.bytes || 0), 0);

    if (L.msg) {
      V.panel.appendChild(K.el('div', { class: 'tip fx-lix-msg pop-in ' + (L.msg.tone || ''), role: 'status', html: K.icon(L.msg.icon || 'check') },
        K.el('p', null, L.msg.text)));
    }

    /* quanto tem na Lixeira + esvaziar tudo */
    const legivel = info && info.legivel;
    const reading = !info && !L.infoErr;
    const total = K.el('div', { class: 'fx-lix-num' });
    if (reading) {
      total.append(K.el('span', { class: 'loading fx-lix-reading' }, K.t('Medindo a Lixeira…')));
    } else if (legivel && info.itens) {
      total.append(K.el('span', { class: 'fx-lix-big num' }, fmtB(info.bytes)),
        K.el('span', { class: 'fx-lix-lab' }, K.t('na Lixeira, em {0}', plural(info.itens, K.t('item'), K.t('itens')))));
    } else if (legivel) {
      total.append(K.el('span', { class: 'fx-lix-big' }, K.t('Vazia')), K.el('span', { class: 'fx-lix-lab' }, K.t('nada esperando pra ser apagado')));
    } else {
      total.append(K.el('span', { class: 'fx-lix-big no-read' }, K.t('sem leitura')),
        K.el('span', { class: 'fx-lix-lab' }, K.t('o tamanho da Lixeira toda')));
    }
    /* Lixeira vazia: o mascote tira um cochilo no lugar da lata */
    const lixArt = K.el('div', { class: 'fx-lix-art' + (legivel && !info.itens ? ' is-sleep' : '') },
      legivel && !info.itens ? null : K.el('span', { class: 'fx-lix-can', html: K.icon('fxTrash') }));
    const nowCard = K.el('section', { class: 'card fx-lix-now pop-in' },
      lixArt,
      K.el('div', { class: 'fx-lix-text' },
        K.el('h2', null, K.t('Na Lixeira agora')),
        total,
        K.el('ul', { class: 'fx-lix-facts' },
          K.el('li', { html: K.icon('broom') }, still.length ? K.t('{0} disso veio do Kamurafy ({1})', fmtB(fromFax), plural(still.length, K.t('item'), K.t('itens'))) : K.t('Nada ali veio do Kamurafy')),
          !legivel || info.itens ? K.el('li', { html: K.icon('info') }, K.t('Na Lixeira, ainda ocupa espaço no disco.')) : null),
        !legivel && !reading ? K.el('div', { class: 'tip fx-perm', html: K.icon('lock') },
          K.el('p', null, L.infoErr ? K.t('Não consegui olhar a Lixeira toda: {0}. O que eu mandei, eu sei.', String(L.infoErr).replace(/[.!\s]+$/, ''))
            : K.t('Pra ver a Lixeira toda, preciso de Acesso Total ao Disco. O que eu mandei, eu sei.')),
          K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'privacidade-disco' }).catch(() => {}); } }, K.t('Abrir Ajustes'))) : null));
    const emptyNow = legivel && !info.itens;
    const busyEmpty = L.busy === 'empty';
    const dangerCard = K.el('section', { class: 'card fx-lix-danger pop-in', style: { animationDelay: '70ms' } },
      K.el('div', { class: 'fx-lix-danger-head' }, K.el('span', { class: 'head-ic crit', html: K.icon('alert') }), K.el('h3', null, K.t('Esvaziar a Lixeira toda'))),
      K.el('p', null, K.t('Apaga de vez tudo, tenha vindo do Kamurafy ou não, inclusive de discos externos. Não dá pra desfazer.')),
      K.el('button', { class: 'btn danger', type: 'button', html: K.icon('flame'), disabled: emptyNow || !!L.busy, onclick: () => { emptyTrash(); } },
        busyEmpty ? K.t('Esvaziando…') : emptyNow ? K.t('A Lixeira já está vazia') : K.t('Esvaziar a Lixeira toda')),
      K.el('span', { class: 'fx-lix-danger-note muted' }, K.t('Na primeira vez, o macOS pode pedir permissão.')));
    V.panel.appendChild(K.el('div', { class: 'fx-lix-top' }, nowCard, dangerCard));
    if (lixArt.classList.contains('is-sleep')) addMascot(lixArt, 112, { face: 'sleep', pct: 100 });

    /* o que o Kamurafy mandou (Faxina e Desinstalar): "Lixeira" sozinha é só a do macOS */
    const head = K.el('div', { class: 'fx-lix-list-head' },
      K.el('div', null, K.el('h2', null, K.t('O que o Kamurafy mandou')),
        K.el('p', null, K.t('Fica aqui até a Lixeira ser esvaziada. Dá pra devolver cada item pro lugar.'))));
    if (still.length) {
      head.appendChild(K.el('div', { class: 'fx-lix-list-act' },
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('fxUndo'), disabled: !!L.busy, onclick: () => { restoreMoved(still.map((m) => m.id)); } },
          still.length === 1 ? K.t('Devolver') : K.t('Devolver tudo')),
        K.el('button', { class: 'btn small danger', type: 'button', html: K.icon('flame'), disabled: !!L.busy, onclick: () => { purgeMoved(still.map((m) => m.id)); } },
          K.t('Apagar de vez tudo isso'))));
    }
    const listCard = K.el('section', { class: 'card fx-lix-list pop-in', style: { animationDelay: '120ms' } }, head);
    if (L.movedErr && !L.moved) listCard.appendChild(K.errorCard({ compact: true, title: K.t('Não consegui ler a lista'), reason: L.movedErr, retry: () => { L.moved = null; L.movedErr = null; loadLixeira(); paintTab(); } }));
    else if (!moved.length) listCard.appendChild(K.el('div', { class: 'empty' }, K.t('Nada que eu mandei pra Lixeira ainda.')));
    else {
      /* o que ainda está na Lixeira vem primeiro; o que já saiu fica recolhido (é só histórico) */
      const gone = moved.filter((m) => !m.naLixeira);
      const rows = still.concat(L.showGone ? gone : []);
      if (!still.length) listCard.appendChild(K.el('div', { class: 'empty fx-lix-none' }, K.t('Nada do que eu mandei continua na Lixeira agora.')));
      const ul = K.el('ul', { class: 'fx-items fx-lix-items' });
      rows.slice(0, L.shown).forEach((m) => ul.appendChild(movedRow(m)));
      if (rows.length > L.shown) {
        ul.appendChild(K.el('li', { class: 'fx-more' }, K.el('button', { class: 'btn small', type: 'button',
          onclick: () => { K.sound.tick(); L.shown += PAGE * 2; paintTab(); } }, K.t('Mostrar mais {0}', K.fmt.num(Math.min(rows.length - L.shown, PAGE * 2))))));
      }
      if (rows.length) listCard.appendChild(ul);
      if (gone.length) {
        listCard.appendChild(K.el('div', { class: 'fx-lix-gone' },
          K.el('button', { class: 'btn small ghost', type: 'button', html: K.icon(L.showGone ? 'fxChevron' : 'clock'), 'aria-expanded': String(!!L.showGone),
            onclick: () => { K.sound.tick(); L.showGone = !L.showGone; paintTab(); } },
          L.showGone ? K.t('Esconder o que já saiu da Lixeira') : K.t('Ver o que já saiu da Lixeira ({0})', K.fmt.num(gone.length)))));
      }
    }
    V.panel.appendChild(listCard);
  }

  function movedRow(m) {
    const L = S.lix;
    const cat = CATS[m.categoria] ? catInfo(m.categoria).titulo : m.categoria === 'grandes' ? K.t('Arquivo grande') : m.categoria === 'duplicados' ? K.t('Cópia repetida') : K.t('Espaço');
    const tags = K.el('span', { class: 'fx-tags' }, tag('plain', null, cat));
    if (!m.naLixeira) tags.appendChild(tag('none', 'info', K.t('já saiu da Lixeira'), K.t('Foi devolvido, apagado ou a Lixeira foi esvaziada.')));
    if (tricky(m.nome) || tricky(m.original)) {
      tags.appendChild(tag('warn', 'alert', K.t('nome disfarçado'), K.t('O nome tem um caractere invisível que troca a ordem das letras. Mostro um � no lugar.')));
    }
    const lines = [K.el('span', { class: 'fx-item-top' }, K.el('span', { class: 'fx-item-name' }, vis(m.nome)), tags),
      K.el('span', { class: 'fx-item-path', title: vis(m.original) }, vis(m.original)),
      K.el('span', { class: 'fx-item-meta' }, K.t('mandado {0}{1}', quando(m.t) || '', isNum(m.t) ? K.t(', às ') + K.fmt.time(m.t) : ''))];
    const acts = K.el('span', { class: 'fx-row-acts' });
    const row = K.el('li', { class: 'fx-item fx-moved-row' + (m.naLixeira ? '' : ' is-gone') },
      K.el('span', { class: 'fx-item-ic', 'aria-hidden': 'true', html: K.icon(typeIcon(m)) }),
      K.el('span', { class: 'fx-item-text' }, lines),
      K.el('span', { class: 'fx-item-size num' }, fmtB(m.bytes)),
      acts);
    if (m.naLixeira) {
      acts.append(
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('fxUndo'), disabled: !!L.busy, title: K.t('Devolver pro lugar de onde saiu'), onclick: () => { restoreMoved([m.id]); } }, K.t('Devolver')),
        K.el('button', { class: 'fx-reveal danger', type: 'button', html: K.icon('flame'), disabled: !!L.busy, title: K.t('Apagar de vez'), 'aria-label': K.t('Apagar {0} de vez', vis(m.nome)), onclick: () => { purgeMoved([m.id]); } }),
        K.el('button', { class: 'fx-reveal', type: 'button', html: K.icon('fxFinder'), title: K.t('Mostrar no Finder'), 'aria-label': K.t('Mostrar {0} no Finder', vis(m.nome)), onclick: () => { revealItem(m.id, row); } }));
    }
    return row;
  }

  function lixMsg(tone, icon, text) {
    S.lix.msg = { tone, icon, text };
  }

  async function restoreMoved(ids) {
    const L = S.lix;
    if (L.busy || !ids.length) return;
    K.sound.plop();
    L.busy = 'restore';
    if (S.tab === 'lixeira') paintTab();
    try {
      const r = await K.api('cleanup.restore', { ids });
      const f = (r && r.falhas) || [];
      const failed = new Set(f.map((x) => x.id));
      const back = ((L.moved && L.moved.itens) || []).filter((m) => ids.includes(m.id) && !failed.has(m.id)).map((m) => m.original);
      if (r.ok) afterRestore(back);
      if (r.ok && !f.length) { K.sound.tada(); lixMsg('good', 'fxUndo', K.t('{0} pro lugar ({1}).', r.ok === 1 ? K.t('Devolvi 1 item') : K.t('Devolvi {0} itens', K.fmt.num(r.ok)), fmtB(r.bytes))); }
      else if (r.ok) { K.sound.tick(); lixMsg('warn', 'alert', K.t('Devolvi {0}, mas {1}: {2}.', K.fmt.num(r.ok), plural(f.length, K.t('não voltou'), K.t('não voltaram')), failTxt(f))); }
      else { K.sound.oops(); lixMsg('crit', 'alert', K.t('Não consegui devolver: {0}.', failTxt(f) || K.t('o item já não estava na Lixeira'))); }
    } catch (e) {
      K.sound.oops();
      lixMsg('crit', 'alert', K.t('Não consegui devolver: {0}.', why(errMsg(e))));
    }
    L.busy = null;
    await loadLixeira();
  }

  async function purgeMoved(ids, opts) {
    opts = opts || {};
    const L = S.lix;
    if (L.busy || !ids.length) return;
    const items = ((L.moved && L.moved.itens) || []).filter((m) => ids.includes(m.id));
    const bytes = items.reduce((a, m) => a + (m.bytes || 0), 0);
    if (!opts.semConfirmar) {
      K.sound.plop();
      const one = items.length === 1 ? items[0] : null;
      const ok = await K.confirm({
        title: one ? K.t('Apagar de vez?') : K.t('Apagar de vez {0}?', fmtB(bytes)),
        text: one ? K.t('“{0}” ({1}) sai da Lixeira pra sempre.', inl(one.nome), fmtB(one.bytes)) : K.t('{0} da Lixeira pra sempre. O resto dela fica como está.', plural(items.length, K.t('item sai'), K.t('itens saem'))),
        note: { tone: 'crit', icon: 'alert', text: K.t('Não dá pra desfazer. Depois disso, só um backup (como o Time Machine) traz de volta.') },
        ok: K.t('Apagar de vez'), cancel: K.t('Deixar na Lixeira'), tone: 'danger', icon: 'flame',
        ack: items.some((m) => !CATS[m.categoria] || m.categoria === 'downloads') ? K.t('Entendi: não dá pra desfazer') : null,
      });
      if (!ok) return;
    }
    L.busy = 'purge';
    if (S.tab === 'lixeira') paintTab();
    try {
      const r = await K.api('cleanup.purge', { ids, confirmado: true });
      const f = (r && r.falhas) || [];
      if (r.ok && !f.length) { K.sound.tada(); lixMsg('good', 'check', K.t('Apagado de vez: {0} livres no disco.', fmtB(r.bytes))); }
      else if (r.ok) { K.sound.tick(); lixMsg('warn', 'alert', K.t('Apaguei {0}, mas {1}: {2}.', K.fmt.num(r.ok), plural(f.length, K.t('ficou'), K.t('ficaram')), failTxt(f))); }
      else if (f.length) { K.sound.oops(); lixMsg('crit', 'alert', K.t('Não consegui apagar: {0}.', failTxt(f))); }
      else lixMsg('', 'info', K.t('Isso já não estava mais na Lixeira.'));
    } catch (e) {
      K.sound.oops();
      lixMsg('crit', 'alert', K.t('Não consegui apagar: {0}.', why(errMsg(e))));
    }
    L.busy = null;
    await loadLixeira();
  }

  async function emptyTrash(opts) {
    opts = opts || {};
    const L = S.lix;
    if (L.busy) return;
    const info = L.info;
    if (!opts.semConfirmar) {
      K.sound.plop();
      const size = info && info.legivel ? ` (${fmtB(info.bytes)}, ${plural(info.itens || 0, K.t('item'), K.t('itens'))})` : '';
      const ok = await K.confirm({
        title: K.t('Esvaziar a Lixeira toda?'),
        text: K.t('Isso apaga de vez TUDO que está na Lixeira{0}, tenha vindo do Kamurafy ou não, inclusive de discos externos.', size),
        note: { tone: 'crit', icon: 'alert', text: K.t('Não dá pra desfazer. Depois disso, só um backup (como o Time Machine) traz de volta.') },
        ok: K.t('Esvaziar tudo'), cancel: K.t('Agora não'), tone: 'danger', icon: 'fxTrash', mascot: 'worried',
        ack: K.t('Entendi: apaga tudo e não tem volta'),
      });
      if (!ok) return;
    }
    L.busy = 'empty';
    if (S.tab === 'lixeira') paintTab();
    try {
      await K.api('cleanup.emptyTrash', { confirmado: true });
      K.sound.tada();
      lixMsg('good', 'sparkle', K.t('Lixeira vazia! O espaço voltou pro disco.'));
    } catch (e) {
      K.sound.oops();
      lixMsg('crit', 'alert', K.t('A Lixeira não foi esvaziada: {0}', errMsg(e)));
    }
    L.busy = null;
    await loadLixeira();
  }

  /* ================= página ================= */

  function expire(kind) {
    const st = S[kind];
    if ((st.mode === 'result' || st.mode === 'done') && st.at && nowS() - st.at > KEEP_S) {
      Object.assign(st, blank(), { run: st.run + 1, expired: st.mode === 'result' });
    }
  }

  async function loadBasics() {
    const [cats, moved, bat] = await Promise.allSettled([
      S.cats ? Promise.resolve(S.cats) : withTimeout(K.api('cleanup.categories'), 4000),
      withTimeout(K.api('cleanup.moved'), 4000),
      withTimeout(K.cached('battery.now', null, 5000), 2000),
    ]);
    if (cats.status === 'fulfilled' && Array.isArray(cats.value)) S.cats = cats.value;
    if (moved.status === 'fulfilled' && moved.value) {
      S.lix.moved = moved.value;
      if (moved.value.caixaDeAreia) S.sandbox = true;
    }
    if (bat.status === 'fulfilled') S.bat = bat.value;
  }

  /* o "Deixar voando" da Varredura mandou caches pra Lixeira: a lista daqui perde esses itens */
  window.addEventListener('kamurafy:limpou', (e) => {
    const d = (e && e.detail) || {};
    if (d.origem === 'faxina' || !Array.isArray(d.caminhos)) return;
    pruneOthers(null, d.caminhos.map(String).filter(Boolean), K.t('Varredura'));
  });

  K.pages.faxina = {
    title: K.t('Espaço'),
    async render(el) {
      host = el;
      V = {};
      clearView();
      const q = /[?&]aba=([a-z]+)/.exec(location.hash || '');
      if (q && TABS.some((t) => t.id === q[1])) S.tab = q[1];
      ['suj', 'gra', 'dup'].forEach(expire);
      await loadBasics();
      if (host !== el) return;
      paintShell();
      paintTab();
      if (S.tab === 'lixeira') await Promise.race([loadLixeira(), K.sleep(3000)]);
      else loadLixeira();
    },
    destroy() {
      if (K.confirm.isOpen()) K.confirm.close(false);
      clearView();
      host = null;
      V = {};
    },
  };

  /* ================= ganchos de teste (tools/foto.sh) =================
     Só existem na build de desenvolvimento: na PUBLICO (app.version.publico) K.faxina é
     undefined, e nada de "limpar/apagar sem perguntar" fica no app distribuído. */

  const hooks = {
    /** troca de aba: 'sujeira' | 'grandes' | 'duplicados' | 'lixeira' */
    tab(nome) { setTab(nome); },
    /** procura (padrão: Sujeira). Devolve Promise que resolve quando termina. */
    scan(nome) {
      const t = nome || 'sujeira';
      if (S.tab !== t) setTab(t);
      return t === 'sujeira' ? scanSujeira() : KIND[t] ? search(KIND[t]) : Promise.resolve();
    },
    /** liga/desliga "Incluir Downloads esquecidos" */
    downloads(on) { S.withDownloads = !!on; if (S.tab === 'sujeira' && S.suj.mode === 'idle') paintTab(); },
    /** marca tudo que dá na aba atual (Duplicados: as cópias, mantendo a mais antiga) */
    selectAll() { selectAll(); },
    selectNone() { clearSel(); },
    markCopies() { markCopies(); },
    /** abre a lista de uma categoria da Sujeira ('all' = todas) */
    open(cat) {
      const ids = cat === 'all' || !cat ? Array.from(V.cats ? V.cats.keys() : []) : [cat];
      ids.forEach((id) => toggleOpen(id, true));
    },
    filter(tipo) { if (S.gra.mode === 'result') { S.gra.filter = tipo || 'todos'; S.gra.shown = {}; if (S.tab === 'grandes') paintTab(); } },
    /** marca (ou desmarca, com on=false) os itens da aba atual cujo nome casa com a expressão */
    mark(re, on) {
      const k = KIND[S.tab];
      if (!k) return 0;
      const rx = re instanceof RegExp ? re : new RegExp(String(re), 'i');
      let n = 0;
      for (const it of S[k].items.values()) if (rx.test(it.nome) && selectable(it)) { toggleItem(k, it.id, on !== false); n++; }
      return n;
    },
    /** limpa o que está marcado na aba atual; {semConfirmar: true} pula o modal (só testes) */
    clean(opts) { const k = KIND[S.tab]; return k ? cleanKind(k, opts) : Promise.resolve(); },
    undo() { const k = KIND[S.tab]; return k ? undoKind(k) : Promise.resolve(); },
    purge(opts) { const k = KIND[S.tab]; return k ? purgeKind(k, opts) : Promise.resolve(); },
    emptyTrash(opts) { return emptyTrash(opts); },
    /** esquece tudo e volta pro começo */
    reset() { S.suj = blank(); S.gra = blank(); S.dup = blank(); S.lix.msg = null; if (mounted()) paintTab(); },
    state() {
      const o = {};
      for (const k of ['suj', 'gra', 'dup']) o[k] = { mode: S[k].mode, itens: S[k].items.size, marcados: selIds(S[k]).length, bytes: selBytes(S[k]) };
      o.tab = S.tab; o.sandbox = S.sandbox; o.ultimasCopias = Array.from(S.lastCopy.keys());
      return o;
    },
  };
  const hooksOn = () => snap() || !!(K.appVersion && K.appVersion.publico === false);
  Object.defineProperty(K, 'faxina', { configurable: true, get: () => (hooksOn() ? hooks : undefined) });
})();
