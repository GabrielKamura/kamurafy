/* Kamurafy — Otimizar (#/otimizar): sem mágica, a pessoa decide cada passo.
   Quatro abas (pílulas no topo, grudam ao rolar). Sem ?aba= na rota, abre na primeira:
     Por que tá lento? → speed.diagnose ao abrir a aba (se a leitura tiver mais de 30 s) e no botão
                       "Conferir de novo"; nunca relê sozinho. Veredito + nota no mostrador + a lista
                       de achados com a ação de cada um (fechar usa o mesmo fluxo de "Pesando agora",
                       com optimize.quit {id: alvo}, e confere de novo depois). No pé, a vigia
                       (settings.vigia / vigiaIgnorar). Os avisos da vigia abrem otimizar?aba=lento.
     Abrem com o Mac → optimize.startup: o que abre sozinho quando a pessoa entra no Mac, em
                       grupos (ajudantes de apps, agentes da pasta do usuário, do sistema todo),
                       com interruptor (optimize.startupToggle, reversível). Os do sistema pedem
                       senha: só pelos Ajustes (open.settings itens-login).
     Pesando agora   → optimize.heavy + system.now a cada 5 s, só com a aba aberta. Atualiza no
                       lugar (sem piscar) e não troca a ordem com o mouse em cima da lista.
                       Fechar → K.confirm → optimize.quit; se não fechar, Forçar (K.confirm vermelho).
     Manutenção      → optimize.tasks: cartões com "quando vale a pena", quanto demora e selo
                       "pede senha"; Rodar → K.confirm → optimize.run {id, confirmado: true}.
   Nada aqui apaga arquivo. Nome de app/processo vem de fora: só textContent.
   No terminal e no modo foto o Swift recusa o que muda algo ("Só no app aberto."): a tela mostra
   isso como "modo de teste", sem cara de erro. Contrato em docs/ponte.md (optimize.*).
   Ganchos de teste em K.otimizar (tab, reload, toggle, quit, force, run, pause, hover, age,
   state), só na build de desenvolvimento. */
'use strict';

(function () {
  /* ícones só desta tela (mesmo traço do icons.js: viewBox 24, pontas redondas) */
  Object.assign(K.ICONS, {
    otPower: '<path d="M12 3.5v7.5"/><path d="M7.2 6.4a7.3 7.3 0 1 0 9.6 0"/>',
    otWeight: '<path d="M6.5 7v10M17.5 7v10M3.5 9.8v4.4M20.5 9.8v4.4M6.5 12h11"/>',
    otWrench: '<path d="M14.5 4.2a4.8 4.8 0 0 0-5.8 6.3L3.8 15.4a2.1 2.1 0 0 0 3 3l4.9-4.9a4.8 4.8 0 0 0 6.3-5.8l-2.9 2.9-2.8-.5-.5-2.8Z"/>',
    otGlobe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.2-3.4-8.5S9.7 5.8 12 3.5Z"/>',
    otMenu: '<rect x="3.5" y="3.5" width="12.5" height="15" rx="2.2"/><path d="M7 8h5.5M7 11.5h5.5M7 15h2.5"/><path d="m13.5 12.5 7 2.7-3 1.2-1.2 3Z"/>',
    otDock: '<rect x="3" y="3.5" width="18" height="17" rx="3"/><rect x="6" y="14.3" width="12" height="3.4" rx="1.5"/>',
    otFolder: '<path d="M3.5 7.5c0-1.1.9-2 2-2h3.8l2 2.2h7.2c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2Z"/><path d="M3.5 10.5h17"/>',
    otQuit: '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    otSliders: '<path d="M4 7h8.5M16.5 7H20M4 12h2.5M10.5 12H20M4 17h10.5M18.5 17H20"/><circle cx="14.5" cy="7" r="2"/><circle cx="8.5" cy="12" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    otScript: '<path d="M6.5 3.5h7L18 8v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"/><path d="M13.5 3.5V8H18"/><path d="m10 12.5-2 2 2 2M13.5 12.5l2 2-2 2"/>',
    otBulb: '<path d="M9.5 17.5h5M10.5 20.5h3"/><path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5.9 1.2.9 2v1.5h5V16c0-.8.3-1.5.9-2A5.8 5.8 0 0 0 12 3.5Z"/>',
    otShield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
    otFlask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.3a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2l-5.5-9.6V3.5"/><path d="M7.3 14.5h9.4"/>',
    otMac: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="2"/><path d="M2.5 15h19l-1.2 3.2a1.5 1.5 0 0 1-1.4 1H5.1a1.5 1.5 0 0 1-1.4-1Z"/>',
    otEye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    otPhoto: '<rect x="3.5" y="6.5" width="17" height="12.5" rx="2.5"/><circle cx="12" cy="12.7" r="3.2"/><path d="m8.6 6.5 1.3-2.2h4.2l1.3 2.2"/>',
    otDownload: '<path d="M12 4v10.5"/><path d="m7.5 10.3 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  });

  const TABS = [
    { id: 'lento', label: K.t('Por que tá lento?'), icon: 'gauge' },
    { id: 'login', label: K.t('Abrem com o Mac'), icon: 'otPower' },
    { id: 'pesando', label: K.t('Pesando agora'), icon: 'otWeight' },
    { id: 'manutencao', label: K.t('Manutenção'), icon: 'otWrench' },
  ];

  const HEAVY_MS = 5000;         // "Pesando agora" relê a cada 5 s (só com a aba aberta)
  const STUCK_MS = 6000;         // depois de pedir pra fechar, quanto esperar antes de oferecer Forçar
  const LIMITE = 12;             // quantos apps a lista mostra
  const LIMITE_PEDE = 40;        // quantos o Swift manda (o custo é o mesmo: ele lê todos os processos)
  /* processo do macOS que não pesa (e que não dá pra fechar) fica recolhido numa linha só */
  const CALM_CPU = 5;            // %
  const CALM_MEM = 200 * 1048576;

  const ORIGENS = {
    ajudante: { titulo: K.t('Ajudantes de apps'), icon: 'apps',
      sub: K.t('Atualizador, ícone na barra de menus, sincronização.') },
    agente: { titulo: K.t('Agentes da sua pasta'), icon: 'otScript',
      sub: K.t('Programas da sua pasta (Biblioteca › LaunchAgents) que o macOS roda sozinho.') },
    sistema: { titulo: K.t('Do sistema todo'), icon: 'lock',
      sub: K.t('Valem pra todos os usuários e pedem senha: é pelos Ajustes. Ficam fora da conta lá em cima.') },
  };
  const ORIGEM_ORDER = ['ajudante', 'agente', 'sistema'];

  const PASS = K.t('O macOS vai pedir sua senha de administrador. O Kamurafy nunca vê a senha.');
  /* o que a tela sabe a mais de cada tarefa (o Swift manda título, descrição, quando e demora) */
  const TASK_UI = {
    dns: { icon: 'otGlobe', order: 0, ok: K.t('Limpar o cache'),
      bits: [K.t('O primeiro acesso a cada site demora um tiquinho a mais.'), K.t('Não apaga senha, histórico nem favorito.')] },
    abrircom: { icon: 'otMenu', order: 1, ok: K.t('Arrumar a lista'),
      bits: [K.t('Alguns ícones podem sumir e voltar.'), K.t('Não apaga app nem arquivo.')] },
    dock: { icon: 'otDock', order: 2, ok: K.t('Reiniciar o Dock'),
      bits: [K.t('Nenhum app fecha. O Dock some e volta em um ou dois segundos.')] },
    finder: { icon: 'otFolder', order: 3, ok: K.t('Reiniciar o Finder'),
      card: K.t('Se o Finder estiver copiando arquivos, espere terminar.'),
      warn: K.t('Se o Finder estiver copiando arquivos, isso para no meio. Espere terminar.'),
      bits: [K.t('As janelas do Finder fecham; os arquivos ficam onde estão.')] },
    spotlight: { icon: 'scan', order: 4, ok: K.t('Refazer o índice'),
      card: K.t('O Mac fica ocupado por algumas horas. Melhor na tomada.'),
      warn: K.t('O Mac fica ocupado por algumas horas: a busca fica incompleta e a ventoinha pode ligar. Melhor na tomada.'),
      bits: [K.t('Não apaga arquivo: só o índice da busca.'), K.t('Depois de começar, vai até o fim.')] },
  };

  const PRESSURE = {
    normal: { label: K.t('Pressão normal'), tone: 'good', icon: 'check' },
    atencao: { label: K.t('Pressão alta'), tone: 'warn', icon: 'eye' },
    critica: { label: K.t('Pressão crítica'), tone: 'crit', icon: 'alert' },
  };

  /* ================= estado (sobrevive à troca de tela) ================= */

  const S = {
    tab: 'lento',
    test: false,                 // o Swift recusou algo por ser modo de teste: figurinha no topo
    bat: null,                   // battery.now, só pro mascote
    st: { status: 'idle', items: [], err: null, at: 0, run: 0, msgs: new Map(), busy: new Set(), refreshing: false },
    hv: { status: 'idle', items: [], sys: null, err: null, at: 0, run: 0, fails: 0, paused: false, acting: false, showCalm: false, calmN: 0,
      phase: new Map(),          // pid → {phase, t, nome, mem, f?, force?}
      closed: null },            // último que fechou: {nome, mem, forced, t}
    tk: { status: 'idle', items: [], err: null, run: 0, res: new Map(), busy: null },
    lt: { status: 'idle', rep: null, err: null, at: 0, run: 0, busy: false, p: null, acting: false,
      phase: new Map(),          // 'app:<nome>' → {phase, t, nome, mem, f?, force?} (mesmas fases de "Pesando agora")
      msgs: new Map(),           // id do achado → recado (ex.: os Ajustes não abriram)
      closed: null },            // último que fechou: {nome, mem, forced, t}
    vg: { status: 'idle', vigia: true, ignorar: [], busy: false, err: null, run: 0 },
  };

  let host = null;
  let V = null;                  // referências da tela montada (null = desmontada)

  /* ================= utilidades ================= */

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const snap = () => document.documentElement.classList.contains('snap');
  const calm = () => snap() || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nowS = () => Date.now() / 1000;
  /* original em português (pras comparações abaixo); a tela mostra com K.t */
  const errMsg = (e) => (e && (e.original || e.message) ? String(e.original || e.message) : String(e || K.t('erro desconhecido')));
  const mounted = () => !!V && !V.dead && !!host && document.body.contains(host);
  const setText = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
  const plural = (n, um, varios) => `${K.fmt.num(n)} ${n === 1 ? um : varios}`;
  const noDot = (s) => String(s || '').trim().replace(/[.!\s]+$/, '');
  /* aspas retas do Swift ("Abrir com") viram aspas de verdade */
  const pretty = (s) => String(s || '').replace(/"([^"]*)"/g, '“$1”');

  /* Nomes vêm de fora. Caractere que muda a direção do texto (U+202E e parecidos) vira um sinal
     visível; no meio de uma frase o nome vai isolado (FSI…PDI), como na Faxina. */
  const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  const vis = (s) => String(s == null ? '' : s).replace(BIDI, '\uFFFD');
  const inl = (s) => '\u2068' + vis(s) + '\u2069';

  function withTimeout(p, ms, msg) {
    return Promise.race([p, K.sleep(ms).then(() => { throw new Error(msg || K.t('demorou demais pra responder')); })]);
  }

  /** "52%", "0,4%", "0%" */
  function cpuTxt(v) {
    if (!isNum(v)) return K.t('sem leitura');
    if (v <= 0) return '0%';
    return K.fmt.pct(v, v < 10 ? 1 : 0);
  }
  /** 250 → "2,5 núcleos"; 100 → "1 núcleo" */
  function coresTxt(v) {
    const n = Math.round(v / 10) / 10;
    if (n <= 1) return K.t('1 núcleo');
    return K.fmt.num(n, n % 1 ? 1 : 0) + K.t(' núcleos');
  }

  /** mensagem do Swift → frase de gente. test = recusado por ser modo de teste (não é erro) */
  function friendly(e) {
    const m = errMsg(e).trim();
    if (/só no app aberto/i.test(m)) {
      S.test = true;
      paintTest();
      return { tone: 'none', icon: 'otFlask', test: true, text: K.t('Modo de teste: aqui eu só mostro, não mudo nada.') };
    }
    if (/não está mais na lista|abra a tela de novo|atualize|o arquivo mudou/i.test(m)) {
      return { tone: 'warn', icon: 'cycle', stale: true, text: K.t('A lista estava velha e já olhei de novo. Tente outra vez.') };
    }
    if (/não encerra/i.test(m)) return { tone: 'none', icon: 'lock', text: K.t('É do macOS: esse eu não fecho.') };
    if (/esse sou eu/i.test(m)) return { tone: 'none', icon: 'info', text: K.t('Esse sou eu. Pra me fechar, use Kamurafy › Sair.') };
    if (/não mexo/i.test(m)) return { tone: 'none', icon: 'lock', text: K.t('Esse eu não mexo: é do macOS.') };
    /* "Não deu certo (-1743)." → "Não deu certo (código -1743)." (sem repetir o começo) */
    const code = /^não deu certo\s*\((-?\d+)\)/i.exec(m);
    if (code) return { tone: 'crit', icon: 'alert', text: K.t('Não deu certo (código {0}). Tente de novo daqui a pouco.', code[1]) };
    if (/^não deu certo/i.test(m)) return { tone: 'crit', icon: 'alert', text: noDot(K.t(m)) + '.' };
    return { tone: 'crit', icon: 'alert', text: K.t('Não deu certo: {0}.', noDot(K.t(m)) || K.t('erro desconhecido')) };
  }

  /* entrada animada só na primeira vez que cada estado da aba aparece nesta montagem */
  const cls = (c) => c + (V && V.pop ? ' pop-in' : '');
  const delay = (ms) => ({ animationDelay: (ms || 0) + 'ms' });

  function mascotState(extra) {
    const b = S.bat;
    let base = { pct: 72, tone: 'good' };
    if (b && b.present !== false && isNum(b.percent)) {
      const st = K.batStatus(b);
      base = { pct: b.percent, tone: st.tone, charging: !!b.isCharging, plugged: !!b.pluggedIn };
    }
    return Object.assign(base, { full: false }, extra);
  }
  function addMascot(box, size, extra) {
    try {
      const m = K.mascot(box, { size, state: mascotState(extra) });
      V.mascots.push(m);
      return m;
    } catch (e) { console.warn('otimizar/mascote: ' + errMsg(e)); return null; }
  }

  function tag(tone, icon, text, title) {
    return K.el('span', { class: 'ot-tag ' + (tone || ''), title: title || null, html: icon ? K.icon(icon) : null }, text);
  }

  function appIcon(src, fallback) {
    const box = K.el('span', { class: 'ot-ic', 'aria-hidden': 'true' });
    if (typeof src === 'string' && src.indexOf('data:image/') === 0) {
      box.classList.add('is-app');
      box.appendChild(K.el('img', { src, alt: '' }));
    } else box.innerHTML = K.icon(fallback || 'apps');
    return box;
  }

  /** linha de recado (depois de mexer num item): {tone, icon, text} */
  function paintMsg(node, m) {
    node.hidden = !m;
    if (!m) { node._k = null; return; }
    /* a lista de "Pesando agora" repinta a cada 5 s: o mesmo recado não é reescrito (nem relido
       pelo leitor de tela) */
    const k = (m.tone || '') + '|' + (m.icon || '') + '|' + m.text;
    if (node._k === k) return;
    node._k = k;
    if (!node.dataset.base) node.dataset.base = node.className;
    node.className = node.dataset.base + ' ' + (m.tone || 'none');
    node.innerHTML = K.icon(m.icon || 'info');
    node.appendChild(K.el('span', null, m.text));
  }

  function loadingCard(text, rows) {
    const sk = K.el('ul', { class: 'ot-skel', 'aria-hidden': 'true' });
    for (let i = 0; i < (rows || 3); i++) {
      sk.appendChild(K.el('li', null, K.el('i', { class: 'ot-sk-ic' }), K.el('span', { class: 'ot-sk-lines' }, K.el('i'), K.el('i')), K.el('i', { class: 'ot-sk-end' })));
    }
    return K.el('section', { class: cls('card ot-loadcard'), role: 'status', 'aria-live': 'polite' },
      K.el('div', { class: 'loading' }, text), sk);
  }

  /** o mesmo cartão de erro das outras telas (K.errorCard): rosa, mascote preocupado, botão ouro */
  function errorCard(title, err, retry, hint) {
    const c = K.errorCard({ title, reason: noDot(err) || K.t('erro desconhecido'), retry, retryHint: hint || K.t('Leva uns segundos.') });
    if (V && V.pop) c.classList.add('pop-in');
    return c;
  }

  /** caixa tracejada com mascote (lista vazia). Monte o mascote depois de pôr na tela. */
  function emptyBox(title, text, extra) {
    const art = K.el('div', { class: 'ot-empty-art' });
    const box = K.el('section', { class: cls('ot-empty') }, art,
      K.el('div', { class: 'ot-empty-text' }, K.el('h3', null, title), K.el('p', null, text), extra || null));
    box._art = art;
    return box;
  }

  /* ================= casca: cabeçalho, abas, painel ================= */

  function paintShell() {
    host.innerHTML = '';
    V.testTag = K.el('span', { class: 'sticker has-ic ot-test', html: K.icon('otFlask'),
      title: K.t('Modo de teste: mostra tudo, mas não muda nada.') }, K.t('modo de teste'));
    /* a promessa vai no subtítulo, como na Faxina e no Desinstalar; o canto direito fica só pra figurinha */
    host.appendChild(K.el('header', { class: 'page-head ot-head', 'data-drag': true },
      K.el('div', { class: 'ot-head-text' },
        K.el('h1', null, K.t('Velocidade')),
        K.el('p', { title: K.t('Desligar, fechar e as arrumações só mudam o que roda.') },
          K.t('O que deixa o Mac lento e como resolver. Nada aqui apaga arquivo seu.'))),
      K.el('div', { class: 'ot-head-side' }, V.testTag)));

    const nav = K.el('nav', { class: 'ktabs ot-tabs', role: 'tablist', 'aria-label': K.t('Partes da Velocidade') });
    V.tabs = {};
    for (const t of TABS) {
      const badge = K.el('span', { class: 'ktab-badge ot-tab-badge num', hidden: true });
      const b = K.el('button', { class: 'ktab ot-tab', type: 'button', role: 'tab', dataset: { tab: t.id }, html: K.icon(t.icon),
        onclick: () => { if (S.tab !== t.id) { K.sound.plop(); setTab(t.id); } } },
      K.el('span', null, t.label), badge);
      V.tabs[t.id] = { b, badge };
      nav.appendChild(b);
    }
    host.appendChild(nav);
    V.panel = K.el('div', { class: 'ot-panel', role: 'tabpanel' });
    host.appendChild(V.panel);
    paintTest();
  }

  function paintTest() { if (V && V.testTag) V.testTag.hidden = !S.test; }

  function badgeFor(id) {
    if (id === 'lento' && S.lt.status === 'ok' && S.lt.rep) {
      const n = S.lt.rep.achados.length;
      if (!n) return null;
      const heavy = S.lt.rep.veredito === 'pesado' || S.lt.rep.veredito === 'travando';
      return { text: K.fmt.num(n), tone: heavy ? 'warn' : null, icon: heavy ? 'alert' : null, title: K.t('{0} agora', plural(n, K.t('coisa pesando'), K.t('coisas pesando'))) };
    }
    if (id === 'login' && S.st.status === 'ok' && counted(S.st.items).length) {
      const on = counted(S.st.items).filter((x) => x.ligado).length;
      return { text: plural(on, K.t('ligado'), K.t('ligados')), title: K.t('{0} sozinho{1} com o Mac', plural(on, K.t('item abre'), K.t('itens abrem')), on === 1 ? '' : K.t('s')) };
    }
    if (id === 'pesando') {
      const stuck = Array.from(S.hv.phase.values()).filter((p) => p.phase === 'stuck' || p.phase === 'refused' || p.phase === 'forcefail').length;
      if (stuck) return { text: K.fmt.num(stuck), tone: 'warn', icon: 'alert', title: stuck === 1 ? K.t('Um app que você pediu pra fechar continua aberto') : K.t('{0} apps que você pediu pra fechar continuam abertos', K.fmt.num(stuck)) };
    }
    return null;
  }

  function paintTabs() {
    if (!V || !V.tabs) return;
    for (const t of TABS) {
      const x = V.tabs[t.id];
      const on = S.tab === t.id;
      x.b.classList.toggle('on', on);
      x.b.setAttribute('aria-selected', String(on));
      const bd = badgeFor(t.id);
      x.badge.hidden = !bd;
      x.badge.className = 'ktab-badge ot-tab-badge num' + (bd && bd.tone ? ' ' + bd.tone : '');
      const bk = bd ? (bd.icon || '') + '|' + bd.text : '';
      if (x.badge._k !== bk) {
        x.badge._k = bk;
        x.badge.innerHTML = bd && bd.icon ? K.icon(bd.icon) : '';
        if (bd) x.badge.appendChild(document.createTextNode(bd.text));
      }
      x.b.title = bd ? bd.title : '';
      x.b.setAttribute('aria-label', bd ? `${t.label}: ${bd.title}` : t.label);
    }
  }

  function statusOfTab(id) {
    return id === 'lento' ? S.lt.status : id === 'login' ? S.st.status : id === 'pesando' ? S.hv.status : S.tk.status;
  }

  function setTab(id) {
    if (!TABS.some((t) => t.id === id)) return;
    S.tab = id;
    if (!mounted()) return;
    paintTab();
    const v = document.getElementById('view');
    if (v) v.scrollTop = 0;
    if (id === 'lento') {
      if (ltStale()) diagnose();
      if (S.vg.status !== 'ok') loadVigia();
    }
    if (id === 'pesando' && (!S.hv.at || (!S.hv.paused && Date.now() - S.hv.at > 3000))) kickHeavy(true);
    if (id === 'login' && S.st.status === 'idle') loadStartup();
    if (id === 'manutencao' && S.tk.status === 'idle') loadTasks();
  }

  function clearPanel() {
    for (const m of V.mascots) { try { m.destroy(); } catch (e) { /* já foi */ } }
    V.mascots = [];
    for (const c of V.charts) { try { c.destroy(); } catch (e) { /* já foi */ } }
    V.charts = [];
    V.lt = null;
    V.vg = null;
    V.stRows = new Map();
    V.tasks = new Map();
    V.hv = null;
    V.sum = null;
    K.tooltip.hide();
  }

  function paintTab() {
    if (!mounted() || !V.panel) return;
    /* o painel é refeito inteiro: o foco do teclado volta pro mesmo controle (ex.: "Procurar de novo") */
    K.keepFocus(V.panel, () => {
      clearPanel();
      V.panel.innerHTML = '';
      host.dataset.tab = S.tab;
      const key = S.tab + ':' + statusOfTab(S.tab);
      V.pop = !V.popped.has(key);
      V.popped.add(key);
      if (S.tab === 'lento') paintLento();
      else if (S.tab === 'login') paintLogin();
      else if (S.tab === 'pesando') paintHeavy();
      else paintTasks();
    });
    paintTabs();
  }

  /* ================= Abrem com o Mac ================= */

  const origemOf = (x) => (ORIGENS[x.origem] ? x.origem : x.editavel ? 'agente' : 'sistema');
  const isSys = (x) => origemOf(x) === 'sistema' || !x.editavel;
  /* agente da Apple guardado na pasta do usuário: o Swift não mexe ("Esse item eu não mexo"), então nem tem interruptor */
  const isApple = (x) => /^com\.apple\./i.test(String(x.label || ''));
  /* o que dá pra afirmar: ligado/rodando só dos itens que o Kamurafy lê direito (os do sistema todo, não) */
  const counted = (items) => items.filter((x) => !isSys(x));

  async function loadStartup(opts) {
    const st = S.st;
    const run = ++st.run;
    const loud = !st.items.length || (opts && opts.loud);
    if (loud) { st.status = 'loading'; if (mounted() && S.tab === 'login') paintTab(); }
    else { st.refreshing = true; paintRefresh(); }
    try {
      const r = await withTimeout(K.api('optimize.startup'), 20000);
      if (run !== st.run) return;
      st.items = (Array.isArray(r) ? r : []).filter((x) => x && x.id && (x.label || x.nome));
      st.status = 'ok';
      st.err = null;
      st.at = Date.now();
    } catch (e) {
      if (run !== st.run) return;
      st.err = errMsg(e);
      st.status = st.items.length ? 'ok' : 'error';
    }
    st.refreshing = false;
    if (mounted()) { paintTabs(); if (S.tab === 'login') paintTab(); }
  }

  function paintRefresh() {
    if (!V || !V.sum || !V.sum.again) return;
    const busy = S.st.refreshing;
    /* aria-disabled (e não disabled): o botão continua com o foco enquanto procura */
    V.sum.again.setAttribute('aria-disabled', String(busy));
    V.sum.again.classList.toggle('is-busy', busy);
    setText(V.sum.againT, busy ? K.t('Procurando…') : K.t('Procurar de novo'));
  }

  function paintLogin() {
    const st = S.st;
    if (st.status === 'idle' || st.status === 'loading') {
      V.panel.appendChild(loadingCard(K.t('Procurando o que abre junto com o Mac…'), 3));
      return;
    }
    if (st.status === 'error') {
      V.panel.appendChild(errorCard(K.t('Não consegui ver o que abre com o Mac'), st.err, () => loadStartup({ loud: true }), K.t('Leva uns 2 segundos.')));
      return;
    }
    const items = st.items;
    if (items.length) V.panel.appendChild(startupSummary(items));
    if (st.err) {
      V.panel.appendChild(K.el('div', { class: 'tip ot-note warn', html: K.icon('alert') },
        K.el('p', null, K.t('Não consegui olhar de novo ({0}). Mostro a última lista.', noDot(st.err)))));
    }
    if (!items.length) {
      const box = emptyBox(K.t('Nada abre sozinho com o Mac'),
        K.t('Pelo menos nada que eu enxergue daqui.'));
      V.panel.appendChild(box);
      addMascot(box._art, 96, { face: 'joy' });
    } else {
      let d = 90;
      for (const o of ORIGEM_ORDER) {
        const list = items.filter((x) => origemOf(x) === o);
        if (!list.length) continue;
        V.panel.appendChild(startupGroup(o, list, d));
        d += 70;
      }
    }
    V.panel.appendChild(blindNote());
    paintSummary();
  }

  function startupSummary() {
    const art = K.el('div', { class: 'ot-sum-art' });
    const mascotBox = K.el('div', { class: 'ot-sum-mascot' });
    const bubble = K.el('div', { class: 'ot-bubble' });
    art.append(bubble, mascotBox, K.el('span', { class: 'ot-sum-badge', html: K.icon('otPower') }));
    const big = K.el('span', { class: 'ot-big num' });
    const lab = K.el('span', { class: 'ot-big-lab' });
    const sub = K.el('p', { class: 'ot-sum-sub' });
    const againT = K.el('span', null, K.t('Procurar de novo'));
    const again = K.el('button', { class: 'btn small ot-again', type: 'button', html: K.icon('cycle'), dataset: { fk: 'ot-again' },
      onclick: () => { if (S.st.refreshing) return; K.sound.tick(); loadStartup(); } }, againT);
    const card = K.el('section', { class: cls('card gold ot-sum'), 'aria-label': K.t('Resumo do que abre com o Mac') },
      art,
      K.el('div', { class: 'ot-sum-text' },
        K.el('div', { class: 'ot-sum-num' }, big, lab),
        sub,
        K.el('p', { class: 'ot-promise', html: K.icon('check') },
          K.el('span', null, K.t('Desligar não apaga nada. Dá pra ligar de novo aqui.')))),
      K.el('div', { class: 'ot-sum-act' }, again));
    V.sum = { card, big, lab, sub, bubble, again, againT, mascot: null, mascotBox };
    V.sum.mascot = addMascot(mascotBox, 116, { face: 'happy' });
    paintRefresh();
    return card;
  }

  function paintSummary() {
    const R = V && V.sum;
    if (!R) return;
    const items = S.st.items;
    const mine = counted(items);
    const sys = items.length - mine.length;
    const on = mine.filter((x) => x.ligado).length;
    const off = mine.length - on;
    const running = mine.filter((x) => x.rodando).length;
    setText(R.big, K.fmt.num(on));
    R.lab.innerHTML = '';
    R.lab.append(on === 1 ? K.t('item abre sozinho') : K.t('itens abrem sozinhos'), K.el('small', null, K.t('quando você entra no Mac')));
    const bits = [];
    if (!items.length) bits.push(K.t('Não encontrei nada que abra sozinho'));
    else {
      if (mine.length) {
        bits.push(K.t('{0} na sua conta', plural(mine.length, K.t('encontrado'), K.t('encontrados'))));
        if (off) bits.push(plural(off, K.t('desligado'), K.t('desligados')));
        bits.push(running ? K.t('{0} agora', plural(running, K.t('rodando'), K.t('rodando'))) : K.t('nenhum rodando agora'));
      }
      if (sys) bits.push(`${mine.length ? K.t('e ') : ''}${plural(sys, K.t('do sistema todo'), K.t('do sistema todo'))}`);
    }
    setText(R.sub, bits.join(' · '));
    setText(R.bubble, on === 0 ? K.t('Entrada leve!') : on <= 4 ? K.t('Esses chegam junto.') : K.t('Quanta coisa junto!'));
    if (R.mascot) R.mascot.set({ face: on > 8 ? 'worried' : on === 0 ? 'joy' : 'happy' });
  }

  function startupGroup(o, list, d) {
    const g = ORIGENS[o];
    const ul = K.el('ul', { class: 'ot-list' });
    for (const it of list) ul.appendChild(startupRow(it));
    return K.el('section', { class: cls('card ot-group ot-g-' + o), style: delay(d), 'aria-label': g.titulo },
      K.el('div', { class: 'ot-group-head' },
        K.el('span', { class: 'head-ic' + (o === 'sistema' ? K.t(' none') : ''), html: K.icon(g.icon) }),
        K.el('div', { class: 'ot-group-text' }, K.el('h2', null, g.titulo), K.el('p', { class: 'card-sub' }, g.sub)),
        K.el('span', { class: 'ot-count num' }, plural(list.length, K.t('item'), K.t('itens')))),
      ul);
  }

  function startupRow(it) {
    const sys = isSys(it);
    const apple = !sys && isApple(it);
    const name = K.el('span', { class: 'ot-name' });
    const tags = K.el('span', { class: 'ot-tags' });
    const meta = K.el('span', { class: 'ot-meta' });
    const msg = K.el('span', { class: 'ot-msg', hidden: true, role: 'status' });
    const stateTxt = K.el('span', { class: 'ot-state' });
    let sw = null;
    let act;
    if (sys) {
      act = K.el('button', { class: 'btn small ot-settings', type: 'button', html: K.icon('otSliders'),
        title: K.t('Abre os Ajustes do Sistema em Geral › Itens de Início'), onclick: openLoginSettings }, K.t('Ajustes'));
    } else if (apple) {
      act = K.el('span', { class: 'ot-na', html: K.icon('lock'), title: K.t('É um agente da própria Apple: o Kamurafy não liga nem desliga.') }, K.t('é do macOS'));
    } else {
      sw = K.el('button', { class: 'switch ot-switch', type: 'button', role: 'switch', onclick: () => { toggleStartup(r.it); } });
      act = sw;
    }
    const li = K.el('li', { class: 'ot-row' + (sys ? ' is-sys' : '') },
      appIcon(it.icon, ORIGENS[origemOf(it)].icon),
      K.el('span', { class: 'ot-text' }, K.el('span', { class: 'ot-top' }, name, tags), meta, msg),
      stateTxt, act);
    const r = { it, li, name, tags, meta, msg, stateTxt, sw, sys, apple };
    V.stRows.set(it.label || it.id, r);
    paintStartupRow(r);
    return li;
  }

  function paintStartupRow(r) {
    const it = r.it;
    const key = it.label || it.id;
    const busy = S.st.busy.has(key);
    const nome = vis(it.nome || it.label);
    setText(r.name, nome);
    r.tags.innerHTML = '';
    if (it.rodando) r.tags.appendChild(tag('good run', null, K.t('rodando agora'), K.t('Está carregado e rodando neste momento')));
    /* agente que não abre no login, só de tempos em tempos (o Swift manda "quando" quando souber) */
    if (it.quando && !r.sys) r.tags.appendChild(tag('none', 'clock', K.t('roda de vez em quando'), K.t('Não abre no login: roda {0}.', vis(it.quando))));
    if (!it.app && origemOf(it) === 'ajudante') r.tags.appendChild(tag('warn', 'alert', K.t('app não encontrado'), K.t('Não achei o app que colocou isso: ele pode já ter sido apagado.')));
    if (r.sys) r.tags.appendChild(tag('none', 'lock', K.t('pede senha'), K.t('Vale pra todos os usuários: mexer pede senha de administrador.')));
    r.meta.innerHTML = '';
    const bits = [];
    if (it.nota && !(r.sys && /pede senha|senha de administrador/i.test(it.nota))) bits.push(K.el('span', { class: 'ot-meta-note' }, vis(it.nota)));
    const tech = it.arquivo || it.label;
    if (tech && tech !== it.nome) bits.push(K.el('span', { class: 'ot-tech', title: [it.label, it.programa, it.arquivo].filter(Boolean).map(vis).join('\n') }, vis(tech)));
    r.meta.append(...bits);
    r.meta.hidden = !bits.length;
    setText(r.stateTxt, busy ? K.t('Mudando…') : r.sys ? K.t('veja nos Ajustes') : it.ligado ? (it.quando ? K.t('Roda sozinho') : K.t('Abre sozinho')) : K.t('Desligado'));
    if (r.sw) {
      r.sw.setAttribute('aria-checked', String(!!it.ligado));
      r.sw.disabled = busy;
      r.sw.classList.toggle('is-busy', busy);
      r.sw.setAttribute('aria-label', K.t('Abrir {0} junto com o Mac', nome));
      r.sw.title = it.ligado ? K.t('Ligado: abre sozinho com o Mac.') : K.t('Desligado: não abre sozinho.');
    }
    r.li.classList.toggle('is-off', !r.sys && !it.ligado);
    r.li.classList.toggle('is-busy', busy);
    paintMsg(r.msg, S.st.msgs.get(key));
  }

  function repaintStartup(key) {
    if (!mounted() || S.tab !== 'login') return;
    const r = V.stRows.get(key);
    if (r) paintStartupRow(r);
    paintSummary();
    paintTabs();
  }

  async function toggleStartup(it, want, opts) {
    opts = opts || {};
    const st = S.st;
    const key = it.label || it.id;
    if (st.busy.has(key) || isSys(it) || isApple(it)) return false;
    const ligar = want == null ? !it.ligado : !!want;
    if (want != null && ligar === !!it.ligado) return false;
    if (ligar && !it.app && !opts.semConfirmar) {
      /* religar algo cujo app sumiu: o programa pode rodar na hora (o macOS carrega ele já) */
      K.sound.plop();
      const ok = await K.confirm({
        title: K.t('Ligar {0}?', inl(it.nome || it.label)),
        text: K.t('Não achei o app que colocou isso. Ligando, o programa pode rodar na hora.'),
        body: it.programa ? K.el('p', { class: 'kmodal-text ot-cf-stats' }, K.t('O que roda: '), K.el('b', null, vis(it.programa))) : null,
        note: { tone: 'warn', icon: 'alert', text: K.t('Só ligue se você sabe o que é. Dá pra desligar de novo aqui.') },
        ok: K.t('Ligar mesmo assim'), cancel: K.t('Deixar desligado'), icon: 'otPower',
      });
      if (!ok) return false;
    } else if (!ligar && it.rodando && !opts.semConfirmar) {
      K.sound.plop();
      const ok = await K.confirm({
        title: K.t('Desligar {0}?', inl(it.nome || it.label)),
        text: K.t('Ele está rodando e para na hora.'),
        note: { tone: 'good', icon: 'check', text: K.t('Não apaga nada. Dá pra ligar de novo aqui.') },
        ok: K.t('Desligar'), cancel: K.t('Deixar ligado'), icon: 'otPower',
      });
      if (!ok) return false;
    } else K.sound.tick();
    const wasRunning = !!it.rodando;
    st.busy.add(key);
    st.msgs.delete(key);
    repaintStartup(key);
    let stale = false;
    try {
      const r = await withTimeout(K.api('optimize.startupToggle', { id: it.id, ligar }), 15000);
      if (r && typeof r.ligado === 'boolean') it.ligado = r.ligado;
      if (r && typeof r.rodando === 'boolean') it.rodando = r.rodando;
      let m;
      if (!!it.ligado !== ligar) m = { tone: 'warn', icon: 'alert', text: K.t('O macOS não aceitou a mudança agora. Tente de novo, ou mude pelos Ajustes.') };
      else if (ligar) m = { tone: 'good', icon: 'check', text: it.rodando ? K.t('Ligado e já rodando.') : K.t('Ligado: abre sozinho a partir do próximo login.') };
      else m = { tone: 'good', icon: 'check', text: wasRunning && !it.rodando ? K.t('Desligado e parado. O app continua instalado.') : K.t('Desligado. O app continua instalado.') };
      st.msgs.set(key, m);
      if (m.tone === 'warn') K.sound.oops(); else K.sound.tick();
    } catch (e) {
      const f = friendly(e);
      st.msgs.set(key, f);
      if (!f.test) K.sound.oops();
      stale = !!f.stale;
    }
    st.busy.delete(key);
    repaintStartup(key);
    if (stale) loadStartup();
    return true;
  }

  async function openLoginSettings(e) {
    K.sound.plop();
    const btn = e && e.currentTarget;
    try {
      await K.api('open.settings', { painel: 'itens-login' });
    } catch (err) {
      K.sound.oops();
      if (btn && btn.parentNode) {
        const old = btn.parentNode.querySelector('.ot-settings-err');
        if (old) old.remove();
        btn.insertAdjacentElement('afterend', K.el('span', { class: 'ot-settings-err', role: 'status' }, K.t('Não abriu ({0}). Abra Ajustes › Geral › Itens de Início.', noDot(errMsg(err)))));
      }
    }
  }

  function blindNote() {
    return K.el('div', { class: cls('tip ot-note ot-blind'), style: delay(260), html: K.icon('otEye') },
      K.el('p', null,
        K.el('b', null, K.t('O que eu não enxergo: ')),
        K.t('os apps de “Abrir ao iniciar sessão”. Eles ficam nos Ajustes do Sistema.')),
      K.el('div', { class: 'ot-note-act' },
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('otSliders'), onclick: openLoginSettings }, K.t('Abrir Itens de Início'))));
  }

  /* ================= Pesando agora ================= */

  async function loadHeavy() {
    const hv = S.hv;
    const run = ++hv.run;
    if (!hv.items.length && hv.status !== 'loading') {
      hv.status = 'loading';
      if (mounted() && S.tab === 'pesando') paintTab();
    }
    /* pede fundo sempre: os processos tranquilos do macOS saem da lista, e um app que a pessoa pediu
       pra fechar precisa continuar à vista pra dar pra saber se fechou mesmo */
    const [h, s] = await Promise.allSettled([
      withTimeout(K.api('optimize.heavy', { limite: LIMITE_PEDE }), 12000),
      withTimeout(K.api('system.now'), 6000),
    ]);
    if (run !== hv.run) return;
    if (s.status === 'fulfilled' && s.value) hv.sys = s.value;
    const was = hv.status;
    if (h.status === 'fulfilled') {
      hv.items = (Array.isArray(h.value) ? h.value : []).filter((a) => a && a.id && isNum(a.pid));
      hv.status = 'ok';
      hv.err = null;
      hv.fails = 0;
      hv.at = Date.now();
      settlePhases();
    } else {
      hv.err = errMsg(h.reason);
      hv.fails++;
      if (!hv.items.length) hv.status = 'error';
    }
    if (!mounted()) return;
    paintTabs();
    if (S.tab !== 'pesando') return;
    if (was !== hv.status || !V.hv) paintTab();
    else updateHeavy();
  }

  /** depois de cada leitura: quem fechou sai da lista; quem não fechou a tempo ganha "Forçar" */
  function settlePhases() {
    const hv = S.hv;
    const t = Date.now();
    const present = new Set(hv.items.map((a) => a.pid));
    for (const [pid, ph] of Array.from(hv.phase)) {
      if (!present.has(pid)) {
        if (ph.phase !== 'err') hv.closed = { nome: ph.nome, mem: ph.mem, forced: ph.phase === 'forced' || ph.phase === 'forcefail', t };
        hv.phase.delete(pid);
        continue;
      }
      if (ph.phase === 'asked' && t - ph.t >= STUCK_MS) ph.phase = 'stuck';
      if (ph.phase === 'forced' && t - ph.t >= STUCK_MS) ph.phase = 'forcefail';
      if (ph.phase === 'err' && t - ph.t > 60000) hv.phase.delete(pid);
    }
  }

  function canPoll() {
    return mounted() && S.tab === 'pesando' && !S.hv.paused && !S.hv.acting && !K.confirm.isOpen() && !(document.hidden && !snap());
  }

  function startPoll() {
    const me = V;
    const tick = async (force) => {
      me.pollId = 0;
      if (me.dead) return;
      if ((force ? mounted() && S.tab === 'pesando' : canPoll()) && !me.polling) {
        me.polling = true;
        try { await loadHeavy(); } catch (e) { console.warn('otimizar/pesando: ' + errMsg(e)); }
        me.polling = false;
      }
      if (!me.dead && !me.pollId) me.pollId = setTimeout(tick, HEAVY_MS);
    };
    me.kick = (force) => {
      if (me.dead || me.polling) return;
      clearTimeout(me.pollId);
      me.pollId = 0;
      tick(force);
    };
    me.pollId = setTimeout(tick, HEAVY_MS);
  }
  function kickHeavy(force) { if (V && V.kick) V.kick(force); }

  function setPaused(on) {
    S.hv.paused = !!on;
    paintLive();
    if (!on) kickHeavy();
  }

  /** serviço do macOS parado num canto (menos de 5% de CPU e de 200 MB): não pesa e não dá pra fechar */
  const isCalm = (a) => !!a.sistema && !a.proprio && !S.hv.phase.has(a.pid)
    && (isNum(a.cpu) ? a.cpu : 0) < CALM_CPU && (isNum(a.memBytes) ? a.memBytes : 0) < CALM_MEM;

  /** o que a lista mostra: os 12 que mais pesam, sem os tranquilos do macOS (a não ser que a pessoa
      peça pra ver), e sempre quem está no meio de um pedido de fechar */
  function visibleItems() {
    const hv = S.hv;
    const calm = hv.items.filter(isCalm);
    const pool = hv.showCalm ? hv.items : hv.items.filter((a) => !isCalm(a));
    const top = pool.slice(0, hv.showCalm ? LIMITE_PEDE : LIMITE);
    const seen = new Set(top.map((a) => a.pid));
    for (const a of pool) if (hv.phase.has(a.pid) && !seen.has(a.pid)) { top.push(a); seen.add(a.pid); }
    hv.calmN = calm.length;
    return top;
  }

  /** nome pra mostrar: processo solto com nome técnico ganha o nome em português (igual à Bateria) */
  const hvName = (a) => (a.app ? String(a.nome || '') : K.procName(a.nome)) || K.t('Processo {0}', a.pid);

  function paintHeavy() {
    const hv = S.hv;
    if (hv.status === 'idle' || (hv.status === 'loading' && !hv.items.length)) {
      V.panel.appendChild(loadingCard(K.t('Olhando quem está pesando…'), 4));
      return;
    }
    if (hv.status === 'error' && !hv.items.length) {
      V.panel.appendChild(errorCard(K.t('Não consegui ver quem está pesando'), hv.err, () => { kickHeavy(true); }, K.t('Leva uns 2 segundos.')));
      return;
    }
    const R = { rows: new Map(), hover: false, want: [], scale: { cpu: 100, mem: 1, memIsTotal: false } };
    V.hv = R;
    V.panel.appendChild(nowCard(R));
    V.panel.appendChild(listCard(R));
    V.panel.appendChild(howCard(R));
    R.mascot = addMascot(R.mascotBox, 104, { face: 'happy' });
    updateHeavy(true);
  }

  function nowCard(R) {
    R.mascotBox = K.el('div', { class: 'ot-now-mascot' });
    R.bubble = K.el('div', { class: 'ot-bubble' });
    R.cpuV = K.el('span', { class: 'ot-stat-v num' });
    R.cpuS = K.el('span', { class: 'ot-stat-s' });
    R.memV = K.el('span', { class: 'ot-stat-v num' });
    R.memS = K.el('span', { class: 'ot-stat-s' });
    R.pill = K.el('span', { class: 'ot-stat-pill' });
    return K.el('section', { class: cls('card ot-now'), 'aria-label': K.t('O Mac agora') },
      K.el('div', { class: 'ot-now-art' }, R.bubble, R.mascotBox),
      K.el('div', { class: 'ot-stat' },
        K.el('span', { class: 'ot-stat-t', html: K.icon('cpu') }, K.t('Processador agora')),
        R.cpuV, R.cpuS),
      K.el('div', { class: 'ot-stat' },
        K.el('span', { class: 'ot-stat-t', html: K.icon('memory') }, K.t('Memória em uso')),
        K.el('span', { class: 'ot-stat-row' }, R.memV, R.pill), R.memS));
  }

  function listCard(R) {
    R.liveText = K.el('span', null, K.t('Ao vivo'));
    R.live = K.el('span', { class: 'live-badge', role: 'status' }, K.el('i', { class: 'live-dot' }), R.liveText);
    R.pause = K.el('button', { class: 'btn small ot-pause', type: 'button', onclick: () => { K.sound.tick(); setPaused(!S.hv.paused); } });
    R.list = K.el('ul', { class: 'ot-hv-list', 'aria-label': K.t('Apps que mais pesam agora') });
    R.closed = K.el('div', { class: 'tip ot-closed', role: 'status', 'aria-live': 'polite', hidden: true });
    R.stale = K.el('div', { class: 'tip ot-note warn ot-stale', hidden: true, html: K.icon('alert') }, K.el('p'));
    R.empty = K.el('div', { class: 'empty ot-hv-empty', hidden: true }, K.t('Tudo calmo: nenhum app pesando agora.'));
    R.calmT = K.el('span');
    R.calmBtn = K.el('button', { class: 'btn small', type: 'button', dataset: { fk: 'ot-calm' },
      onclick: () => { K.sound.tick(); S.hv.showCalm = !S.hv.showCalm; updateHeavy(); } });
    R.calm = K.el('div', { class: 'ot-calm', hidden: true, html: K.icon('otMac') }, R.calmT, R.calmBtn);
    const holdOn = () => { R.hover = true; };
    const holdOff = () => { R.hover = false; if (R.pendingOrder) applyOrder(); };
    R.list.addEventListener('pointerenter', holdOn);
    R.list.addEventListener('pointerleave', () => { if (!R.list.contains(document.activeElement)) holdOff(); });
    R.list.addEventListener('focusin', holdOn);
    R.list.addEventListener('focusout', (e) => { if (!R.list.contains(e.relatedTarget) && !R.list.matches(':hover')) holdOff(); });
    return K.el('section', { class: cls('card ot-hvcard'), style: delay(80), 'aria-label': K.t('Quem mais pesa agora') },
      K.el('div', { class: 'card-head ot-hv-head' },
        K.el('div', { class: 'ot-hv-title' },
          K.el('span', { class: 'head-ic', html: K.icon('otWeight') }),
          K.el('div', null,
            K.el('h2', null, K.t('Quem mais pesa agora')),
            K.el('div', { class: 'card-sub' }, K.t('Cada app com abas e ajudantes somados.')))),
        K.el('div', { class: 'ot-hv-side' }, R.live, R.pause)),
      R.closed,
      R.stale,
      R.cols = K.el('div', { class: 'ot-cols', 'aria-hidden': 'true' },
        K.el('span'),
        K.el('span', null, K.t('App')),
        K.el('span', { class: 'ot-key' }, K.el('i', { class: 'ot-sw cpu' }), 'CPU'),
        K.el('span', { class: 'ot-key' }, K.el('i', { class: 'ot-sw mem' }), K.t('Memória')),
        K.el('span')),
      R.list,
      R.empty,
      R.calm);
  }

  function howCard(R) {
    R.coresP = K.el('p');
    const item = (icon, title, p) => K.el('div', { class: 'ot-how-item' },
      K.el('span', { class: 'ot-how-ic', html: K.icon(icon) }),
      K.el('div', null, K.el('b', null, title), p));
    return K.el('section', { class: cls('card panel ot-how'), style: delay(160), 'aria-label': K.t('Como ler estes números') },
      K.el('h3', null, K.t('Como ler estes números')),
      K.el('div', { class: 'ot-how-grid' },
        item('cpu', K.t('CPU acima de 100%?'), R.coresP),
        item('memory', K.t('Memória cheia não é defeito'),
          K.el('p', null, K.t('O macOS usa a sobra como cache. Feche algo quando a pressão ficar alta.'))),
        item('otQuit', K.t('Fechar ou forçar'),
          K.el('p', null, K.t('Fechar é como o Cmd+Q: o app pergunta se quer salvar. Forçar perde o que não foi salvo.')))));
  }

  function paintNow() {
    const R = V.hv;
    const s = S.hv.sys;
    const cpu = s && s.cpu && isNum(s.cpu.usagePct) ? s.cpu.usagePct : null;
    K.readOr(R.cpuV, cpu, (v) => K.fmt.pct(v, v < 10 ? 1 : 0));
    const coresFull = s && s.cpu ? K.fmt.cores(s.cpu) : '';
    /* o mesmo texto do Painel: é média, não soma */
    setText(R.cpuS, K.t('média do chip todo (0 a 100%)'));
    const m = s && s.memory;
    const used = m && isNum(m.usedBytes) ? m.usedBytes : null;
    const total = m && isNum(m.totalBytes) && m.totalBytes > 0 ? m.totalBytes : null;
    /* memória em base 2, como o Painel e o Monitor de Atividade ("de 16 GB", nunca "de 17,2 GB") */
    K.readOr(R.memV, used, (v) => K.fmt.mem(v));
    setText(R.memS, total ? K.t('de {0}, sem contar o cache', K.fmt.mem(total, 0)) : K.t('sem contar o cache'));
    const p = m && PRESSURE[m.pressure];
    const pk = p ? m.pressure : '';
    if (R.pillKey !== pk) {
      R.pillKey = pk;
      R.pill.innerHTML = '';
      if (p) R.pill.appendChild(K.statusPill(p.tone, p.label, p.icon));
    }
    /* mascote e balão pelo aperto do Mac (processador alto um instante não é defeito) */
    let face = 'happy';
    let say = K.t('Tudo tranquilo.');
    if (!s) say = K.t('Dando uma olhada…');
    else if (m && m.pressure === 'critica') { face = 'sad'; say = K.t('Tá faltando memória!'); }
    else if (m && m.pressure === 'atencao') { face = 'worried'; say = K.t('A memória tá apertada.'); }
    else if (isNum(cpu) && cpu >= 85) { face = 'hot'; say = K.t('Ufa, trabalhando pesado!'); }
    else if (isNum(cpu) && cpu >= 45) say = K.t('Trabalhando de boa.');
    setText(R.bubble, say);
    if (R.mascot && R.face !== face) { R.face = face; R.mascot.set({ face }); }
    setText(R.coresP, coresFull
      ? K.t('Na lista, 100% é um núcleo inteiro. Este Mac tem {0}.', coresFull)
      : K.t('Na lista, 100% é um núcleo inteiro: 250% são dois núcleos e meio.'));
  }

  function paintLive() {
    const R = V && V.hv;
    if (!R) return;
    const hv = S.hv;
    const paused = hv.paused;
    const stale = !paused && hv.fails > 0;
    R.live.classList.toggle('paused', paused);
    R.live.classList.toggle('stale', stale);
    setText(R.liveText, paused ? K.t('Pausado') : stale ? K.t('Sem resposta agora') : K.t('Ao vivo · a cada 5 s'));
    R.live.title = paused ? K.t('A lista está parada.') : K.t('Atualiza a cada 5 segundos com esta aba aberta');
    R.pause.innerHTML = K.icon(paused ? 'play' : 'pause');
    R.pause.appendChild(K.el('span', null, paused ? K.t('Continuar') : K.t('Pausar')));
    R.pause.setAttribute('aria-pressed', String(paused));
    R.stale.hidden = !stale;
    if (stale) setText(R.stale.querySelector('p'), K.t('Não consegui atualizar ({0}). Tento de novo em 5 segundos.', noDot(hv.err)));
  }

  function paintClosed() {
    const R = V.hv;
    const c = S.hv.closed;
    const show = !!c && Date.now() - c.t < 30000;
    R.closed.hidden = !show;
    if (!show) return;
    const key = c.t + c.nome;
    if (R.closedKey === key) return;
    R.closedKey = key;
    R.closed.innerHTML = K.icon('check');
    const mem = isNum(c.mem) && c.mem >= 50e6 ? K.t(' A memória dele ({0}) voltou pro Mac.', K.fmt.mem(c.mem)) : '';
    R.closed.appendChild(K.el('p', null, `${c.forced ? K.t('Fechei à força') : K.t('Fechou')}: ${inl(c.nome)}.${mem}`));
  }

  function updateHeavy(first) {
    const R = V && V.hv;
    if (!R) return;
    const hv = S.hv;
    paintNow();
    paintLive();
    paintClosed();
    const shown = visibleItems();
    const maxCpu = shown.reduce((mx, a) => Math.max(mx, isNum(a.cpu) ? a.cpu : 0), 0);
    const total = hv.sys && hv.sys.memory && isNum(hv.sys.memory.totalBytes) && hv.sys.memory.totalBytes > 0 ? hv.sys.memory.totalBytes : null;
    const maxMem = shown.reduce((mx, a) => Math.max(mx, isNum(a.memBytes) ? a.memBytes : 0), 1);
    R.scale = { cpu: Math.max(100, Math.ceil(maxCpu / 100) * 100), mem: total || maxMem, memIsTotal: !!total };
    const seen = new Set();
    for (const a of shown) {
      let r = R.rows.get(a.pid);
      if (!r) { r = hvRow(a); R.rows.set(a.pid, r); }
      r.a = a;
      paintHvRow(r);
      seen.add(a.pid);
    }
    for (const [pid, r] of Array.from(R.rows)) {
      if (seen.has(pid)) continue;
      R.rows.delete(pid);
      leaveRow(r);
    }
    R.want = shown.map((a) => a.pid);
    R.empty.hidden = shown.length > 0;
    R.cols.hidden = !shown.length;
    const nc = hv.calmN || 0;
    R.calm.hidden = !nc;
    if (nc) {
      setText(R.calmT, hv.showCalm
        ? K.t('Mostrando também {0}.', plural(nc, K.t('processo tranquilo do macOS'), K.t('processos tranquilos do macOS')))
        : nc === 1 ? K.t('Deixei de fora 1 processo tranquilo do macOS: não pesa e não dá pra fechar.')
          : K.t('Deixei de fora {0} processos tranquilos do macOS: não pesam e não dá pra fechar.', K.fmt.num(nc)));
      setText(R.calmBtn, hv.showCalm ? K.t('Esconder de novo') : K.t('Mostrar também'));
      R.calmBtn.setAttribute('aria-expanded', String(!!hv.showCalm));
    }
    applyOrder(first);
  }

  function hvRow(a) {
    const r = { a };
    r.name = K.el('span', { class: 'ot-name' });
    r.tags = K.el('span', { class: 'ot-tags' });
    r.meta = K.el('span', { class: 'ot-meta' });
    r.cpuVal = K.el('b', { class: 'num' });
    r.cpuSub = K.el('small');
    r.cpuFill = K.el('i', { class: 'ot-fill' });
    r.cpuTicks = K.el('span', { class: 'ot-ticks' });
    r.cpuCell = K.el('span', { class: 'ot-cell ot-cpu', tabindex: '0' },
      K.el('span', { class: 'ot-val' }, r.cpuVal, r.cpuSub),
      K.el('span', { class: 'ot-bar' }, r.cpuFill, r.cpuTicks));
    r.memVal = K.el('b', { class: 'num' });
    r.memSub = K.el('small');
    r.memFill = K.el('i', { class: 'ot-fill' });
    r.memCell = K.el('span', { class: 'ot-cell ot-mem', tabindex: '0' },
      K.el('span', { class: 'ot-val' }, r.memVal, r.memSub),
      K.el('span', { class: 'ot-bar' }, r.memFill));
    r.act = K.el('span', { class: 'ot-act' });
    r.msg = K.el('span', { class: 'ot-msg ot-hv-msg', hidden: true, role: 'status' });
    r.ic = K.el('span', { class: 'ot-icwrap' });
    r.li = K.el('li', { class: 'ot-hv', dataset: { pid: a.pid } },
      r.ic,
      K.el('span', { class: 'ot-text' }, K.el('span', { class: 'ot-top' }, r.name, r.tags), r.meta),
      r.cpuCell, r.memCell, r.act, r.msg);
    bindTip(r.cpuCell, r, 'cpu');
    bindTip(r.memCell, r, 'mem');
    return r;
  }

  function tipFor(r, kind) {
    const a = r.a;
    const sc = V.hv.scale;
    if (kind === 'cpu') {
      const rows = [{ value: cpuTxt(a.cpu), name: isNum(a.cpu) && a.cpu >= 100 ? K.t('≈ {0} trabalhando', coresTxt(a.cpu)) : K.t('de um núcleo'), color: 'var(--s2)' }];
      if ((a.processos || 1) > 1) rows.push({ value: K.fmt.num(a.processos), name: K.t('processos somados') });
      return { title: vis(hvName(a)) + K.t(' · CPU'), rows };
    }
    const rows = [{ value: K.fmt.mem(a.memBytes), name: K.t('de memória'), color: 'var(--s1)' }];
    if (sc.memIsTotal && isNum(a.memBytes)) rows.push({ value: K.fmt.pct(a.memBytes / sc.mem * 100, 0), name: K.t('dos {0} do Mac', K.fmt.mem(sc.mem, 0)) });
    return { title: vis(hvName(a)) + K.t(' · Memória'), rows };
  }

  function bindTip(cell, r, kind) {
    const show = (x, y) => { if (!V || !V.hv) return; const t = tipFor(r, kind); K.tooltip.show(x, y, t.title, t.rows); };
    cell.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
    cell.addEventListener('pointerleave', () => K.tooltip.hide());
    cell.addEventListener('focus', () => { const b = cell.getBoundingClientRect(); show(b.left + b.width / 2, b.top); });
    cell.addEventListener('blur', () => K.tooltip.hide());
  }

  function phaseMsg(ph) {
    if (!ph) return null;
    switch (ph.phase) {
      case 'asked': return { tone: 'none', icon: 'clock', text: K.t('Pedi pra fechar. Se ele perguntar se quer salvar, responda na janela dele.') };
      case 'stuck': return { tone: 'warn', icon: 'alert', text: K.t('Ainda aberto: talvez esperando você salvar. Se travou, dá pra forçar.') };
      case 'refused': return { tone: 'warn', icon: 'alert', text: K.t('Não quis fechar: pode estar perguntando algo. Se travou, dá pra forçar.') };
      case 'forced': return { tone: 'none', icon: 'clock', text: K.t('Mandei fechar à força. Já já ele some da lista.') };
      case 'forcefail': return { tone: 'crit', icon: 'alert', text: K.t('Nem forçando ele fechou. Tente pelo Monitor de Atividade ou reinicie o Mac.') };
      case 'err': return ph.f;
      default: return null;
    }
  }

  function actKey(r) {
    const a = r.a;
    if (a.sistema) return 'sys';
    if (a.proprio) return 'self';
    const ph = S.hv.phase.get(a.pid);
    return (ph ? ph.phase + (ph.force ? '!' : '') : 'none') + (S.hv.acting ? ':busy' : '');
  }

  function actFor(r) {
    const a = r.a;
    const nome = vis(hvName(a));
    if (a.sistema) return K.el('span', { class: 'ot-na', html: K.icon('lock'), title: K.t('O Kamurafy não fecha processos do macOS: eles seguram o sistema de pé.') }, K.t('é do macOS'));
    if (a.proprio) return K.el('span', { class: 'ot-na', html: K.icon('sparkle'), title: K.t('É o Kamurafy. Pra fechar, use Kamurafy › Sair.') }, K.t('sou eu'));
    const ph = S.hv.phase.get(a.pid);
    const p = ph && ph.phase;
    const busy = S.hv.acting;
    if (p === 'asking') return K.el('button', { class: 'btn small ot-quit is-busy', type: 'button', disabled: true, html: K.icon('otQuit') }, K.t('Fechando…'));
    if (p === 'forcing') return K.el('button', { class: 'btn small danger ot-force is-busy', type: 'button', disabled: true, html: K.icon('alert') }, K.t('Forçando…'));
    if (p === 'asked' || p === 'forced') return K.el('button', { class: 'btn small ot-wait', type: 'button', disabled: true, html: K.icon('clock') }, K.t('Esperando…'));
    if (p === 'stuck' || p === 'refused' || p === 'forcefail' || (p === 'err' && ph.force)) {
      return K.el('button', { class: 'btn small danger ot-force', type: 'button', html: K.icon('alert'), disabled: busy,
        'aria-label': K.t('Forçar {0} a fechar', nome), onclick: () => { forceApp(r.a); } }, K.t('Forçar'));
    }
    return K.el('button', { class: 'btn small ot-quit', type: 'button', html: K.icon('otQuit'), disabled: busy,
      'aria-label': `${a.app ? K.t('Fechar') : K.t('Encerrar')} ${nome}`, onclick: () => { quitApp(r.a); } }, a.app ? K.t('Fechar') : K.t('Encerrar'));
  }

  function paintHvRow(r) {
    const a = r.a;
    const sc = V.hv.scale;
    const nome = vis(hvName(a));
    setText(r.name, nome);
    r.name.title = !a.app && nome !== vis(a.nome) ? K.t('Nome técnico: {0}', vis(a.nome)) : '';
    const iconKey = (a.icon ? 'img' : 'ic') + (a.sistema ? 's' : a.app ? 'a' : 'p');
    if (r.iconKey !== iconKey) {
      r.iconKey = iconKey;
      r.ic.innerHTML = '';
      r.ic.appendChild(appIcon(a.icon, a.sistema ? 'otMac' : a.app ? 'apps' : 'cpu'));
    }
    const tagKey = [a.proprio, a.sistema, a.app].join();
    if (r.tagKey !== tagKey) {
      r.tagKey = tagKey;
      r.tags.innerHTML = '';
      if (a.proprio) r.tags.appendChild(tag('keep', null, 'este app'));
    }
    /* "do macOS" já aparece no lugar do botão; aqui só o que ajuda a reconhecer a linha */
    const n = a.processos || 1;
    const meta = [];
    if (a.sistema) meta.push(K.t('parte do macOS'));
    else if (!a.app) meta.push(K.t('sem janela'));
    if (n > 1) meta.push(K.t('{0} somados', plural(n, K.t('processo'), K.t('processos'))));
    setText(r.meta, meta.join(' · '));
    r.meta.hidden = !meta.length;
    /* CPU: 100% = um núcleo; a escala sobe de 100 em 100 e cada núcleo ganha um risquinho */
    const cpu = isNum(a.cpu) ? a.cpu : 0;
    setText(r.cpuVal, cpuTxt(a.cpu));
    setText(r.cpuSub, cpu >= 100 ? '≈ ' + coresTxt(cpu) : '');
    r.cpuFill.style.width = Math.min(100, cpu / sc.cpu * 100) + '%';
    r.cpuFill.classList.toggle('is-zero', cpu <= 0);
    if (r.tickScale !== sc.cpu) {
      r.tickScale = sc.cpu;
      r.cpuTicks.innerHTML = '';
      for (let k = 100; k < sc.cpu; k += 100) r.cpuTicks.appendChild(K.el('i', { class: 'ot-tick', style: { left: (k / sc.cpu * 100) + '%' } }));
    }
    r.cpuCell.setAttribute('aria-label', `CPU: ${cpuTxt(a.cpu)}${cpu >= 100 ? K.t(', cerca de ') + coresTxt(cpu) : K.t(' de um núcleo')}`);
    const mem = isNum(a.memBytes) ? a.memBytes : 0;
    setText(r.memVal, K.fmt.mem(mem));
    const mp = sc.memIsTotal ? mem / sc.mem * 100 : null;
    setText(r.memSub, mp != null ? K.fmt.pct(mp, mp > 0 && mp < 1 ? 1 : 0) : '');
    r.memFill.style.width = Math.min(100, mem / sc.mem * 100) + '%';
    r.memFill.classList.toggle('is-zero', mem <= 0);
    r.memCell.setAttribute('aria-label', K.t('Memória: {0}{1}', K.fmt.mem(mem), mp != null ? ', ' + K.fmt.pct(mp, 0) + K.t(' do total') : ''));
    const ak = actKey(r);
    if (r.actKey !== ak) { r.actKey = ak; r.act.innerHTML = ''; r.act.appendChild(actFor(r)); }
    const ph = S.hv.phase.get(a.pid);
    paintMsg(r.msg, phaseMsg(ph));
    r.li.classList.toggle('is-sys', !!a.sistema);
    r.li.classList.toggle('is-self', !!a.proprio);
    r.li.classList.toggle('is-closing', !!ph && ['asking', 'asked', 'forcing', 'forced'].includes(ph.phase));
  }

  function repaintHeavyRows() {
    if (!mounted() || S.tab !== 'pesando' || !V.hv) return;
    for (const r of V.hv.rows.values()) paintHvRow(r);
    paintClosed();
    paintTabs();
  }

  function leaveRow(r) {
    const li = r.li;
    K.tooltip.hide();
    if (calm() || !li.parentNode || !li.animate) { li.remove(); return; }
    li.classList.add('is-leaving');
    const h = li.offsetHeight;
    const an = li.animate([{ opacity: 1, height: h + 'px' }, { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px' }],
      { duration: 320, easing: 'ease-in', fill: 'forwards' });
    an.onfinish = () => li.remove();
  }

  /** põe as linhas na ordem da leitura, com um deslizar curto (FLIP). Com o mouse ou o foco na
      lista a ordem fica parada (o botão "Fechar" não foge do cursor); arruma quando sair. */
  function applyOrder(first) {
    const R = V && V.hv;
    if (!R) return;
    const list = R.list;
    const want = R.want.map((pid) => R.rows.get(pid)).filter(Boolean).map((r) => r.li);
    const fresh = want.filter((li) => li.parentNode !== list);
    const anim = !first && !calm();
    if (R.hover && !first) {
      for (const li of fresh) { list.appendChild(li); if (anim) popRow(li); }
      const cur = Array.from(list.children).filter((li) => !li.classList.contains('is-leaving'));
      R.pendingOrder = !(cur.length === want.length && cur.every((li, i) => li === want[i]));
      return;
    }
    /* uma linha ainda sumindo (o app fechou): reordena quando ela terminar, pra ela não pular de lugar */
    if (!first && list.querySelector('.is-leaving')) {
      for (const li of fresh) { list.appendChild(li); if (anim) popRow(li); }
      R.pendingOrder = true;
      clearTimeout(R.orderT);
      const me = V;
      R.orderT = setTimeout(() => { if (me && !me.dead && V === me && me.hv === R) applyOrder(); }, 380);
      return;
    }
    R.pendingOrder = false;
    const cur = Array.from(list.children).filter((li) => !li.classList.contains('is-leaving'));
    if (!fresh.length && cur.length === want.length && cur.every((li, i) => li === want[i])) return;
    const before = anim ? new Map(cur.map((li) => [li, li.getBoundingClientRect().top])) : null;
    for (const li of want) list.appendChild(li);
    if (!anim) return;
    for (const li of want) {
      if (!before.has(li)) { popRow(li); continue; }
      const d = before.get(li) - li.getBoundingClientRect().top;
      if (Math.abs(d) > 1 && li.animate) li.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }
  function popRow(li) {
    if (li.animate) li.animate([{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  function statsLine(a) {
    const n = a.processos || 1;
    return K.el('p', { class: 'kmodal-text ot-cf-stats' },
      K.t('Agora ele usa {0} de CPU e {1} de memória{2}.', cpuTxt(a.cpu), K.fmt.mem(a.memBytes || 0), n > 1 ? K.t(', somando {0}', plural(n, K.t('processo'), K.t('processos'))) : ''));
  }

  async function quitApp(a, opts) {
    opts = opts || {};
    const hv = S.hv;
    if (hv.acting || a.sistema || a.proprio) return false;
    if (!opts.semConfirmar) {
      K.sound.plop();
      const ok = await K.confirm({
        title: a.app ? K.t('Fechar o app {0}?', inl(a.nome)) : K.t('Encerrar {0}?', inl(hvName(a))),
        text: a.app ? K.t('Se tiver algo sem salvar, o próprio app pergunta antes de fechar.')
          : K.t('Programa sem janela. Encerrar pode interromper uma sincronização ou um download.'),
        body: statsLine(a),
        note: { tone: 'good', icon: 'check', text: a.app ? K.t('Fechar não apaga nada. Dá pra abrir o app de novo quando quiser.') : K.t('Não apaga nada. O app dono costuma abrir ele de novo.') },
        ok: a.app ? K.t('Fechar') : K.t('Encerrar'), cancel: K.t('Deixar aberto'), icon: 'otQuit',
      });
      if (!ok) return false;
    }
    await doQuit(a, false);
    return true;
  }

  async function forceApp(a, opts) {
    opts = opts || {};
    if (S.hv.acting || a.sistema || a.proprio) return false;
    if (!opts.semConfirmar) {
      K.sound.plop();
      const ok = await K.confirm({
        title: a.app ? K.t('Forçar o app {0} a fechar?', inl(a.nome)) : K.t('Forçar {0} a fechar?', inl(hvName(a))),
        text: a.app ? K.t('Ele fecha na hora, sem perguntar nada. Use quando ele travou ou não responde.') : K.t('O processo para na hora, sem terminar o que estava fazendo.'),
        note: { tone: 'crit', icon: 'alert', text: K.t('O que não foi salvo nele se perde, e isso não dá pra desfazer.') },
        ok: K.t('Forçar e fechar'), cancel: K.t('Esperar mais'), tone: 'danger', icon: 'alert',
      });
      if (!ok) return false;
    }
    await doQuit(a, true);
    return true;
  }

  async function doQuit(a, force) {
    const hv = S.hv;
    const pid = a.pid;
    hv.acting = true;
    hv.phase.set(pid, { phase: force ? 'forcing' : 'asking', t: Date.now(), nome: hvName(a), mem: a.memBytes });
    repaintHeavyRows();
    /* cada leitura troca os ids no Swift: espera a que estiver em andamento e usa o id mais novo */
    for (let i = 0; i < 40 && V && V.polling; i++) await K.sleep(50);
    const cur = hv.items.find((x) => x.pid === pid) || a;
    let next;
    let stale = false;
    try {
      const r = await withTimeout(K.api('optimize.quit', force ? { id: cur.id, forcar: true } : { id: cur.id }), 15000);
      if (r && r.ok) {
        next = { phase: force ? 'forced' : 'asked', t: Date.now() };
        K.sound.tick();
      } else {
        next = { phase: force ? 'forcefail' : 'refused', t: Date.now() };
        K.sound.oops();
      }
    } catch (e) {
      const f = friendly(e);
      next = { phase: 'err', t: Date.now(), f, force };
      if (!f.test) K.sound.oops();
      stale = !!f.stale;
    }
    hv.phase.set(pid, Object.assign(hv.phase.get(pid) || { nome: hvName(cur), mem: cur.memBytes }, next));
    hv.acting = false;
    repaintHeavyRows();
    /* olha logo de novo (sem esperar os 5 s): o app some da lista ou ganha o "Forçar" */
    if (next.phase === 'asked' || next.phase === 'forced') {
      const me = V;
      setTimeout(() => { if (me && !me.dead) kickHeavy(); }, 1600);
      setTimeout(() => { if (me && !me.dead) kickHeavy(); }, STUCK_MS + 300);
    } else if (stale) kickHeavy(true);
  }

  /* ================= Manutenção ================= */

  async function loadTasks() {
    const tk = S.tk;
    const run = ++tk.run;
    if (!tk.items.length) { tk.status = 'loading'; if (mounted() && S.tab === 'manutencao') paintTab(); }
    try {
      const r = await withTimeout(K.api('optimize.tasks'), 8000);
      if (run !== tk.run) return;
      tk.items = (Array.isArray(r) ? r : []).filter((t) => t && t.id && t.titulo);
      tk.status = 'ok';
      tk.err = null;
    } catch (e) {
      if (run !== tk.run) return;
      tk.err = errMsg(e);
      tk.status = tk.items.length ? 'ok' : 'error';
    }
    if (mounted() && S.tab === 'manutencao') paintTab();
  }

  function paintTasks() {
    const tk = S.tk;
    if (tk.status === 'idle' || tk.status === 'loading') { V.panel.appendChild(loadingCard(K.t('Lendo as arrumações…'), 3)); return; }
    if (tk.status === 'error') { V.panel.appendChild(errorCard(K.t('Não consegui ler as arrumações'), tk.err, () => loadTasks(), K.t('Leva um segundo.'))); return; }

    const art = K.el('div', { class: 'ot-tk-art' });
    const intro = K.el('section', { class: cls('card ot-tk-intro') },
      art,
      K.el('div', { class: 'ot-tk-text' },
        K.el('h2', null, K.t('Arrumações do próprio macOS')),
        K.el('p', null, K.t('Cada uma resolve um defeito específico. Se está tudo funcionando, deixe quieto.'))));
    V.panel.appendChild(intro);
    addMascot(art, 92, { face: 'happy' });
    art.appendChild(K.el('span', { class: 'ot-tk-badge', html: K.icon('otWrench') }));

    if (!tk.items.length) {
      const box = emptyBox(K.t('Sem arrumações por aqui'), K.t('Não recebi nenhuma tarefa de manutenção desta vez.'));
      V.panel.appendChild(box);
      addMascot(box._art, 96, { face: 'worried' });
      return;
    }
    const list = tk.items.slice().sort((x, y) => {
      const ox = TASK_UI[x.id] ? TASK_UI[x.id].order : 50;
      const oy = TASK_UI[y.id] ? TASK_UI[y.id].order : 50;
      return ox - oy;
    });
    const grid = K.el('div', { class: 'ot-tasks' });
    list.forEach((t, i) => grid.appendChild(taskCard(t, i, i === list.length - 1 && list.length % 2 === 1)));
    V.panel.appendChild(grid);
  }

  function taskCard(t, i, wide) {
    const ui = TASK_UI[t.id] || {};
    const chips = K.el('div', { class: 'ot-chips' },
      K.el('span', { class: 'ot-chip', html: K.icon('clock'), title: K.t('Quanto demora') }, pretty(t.demora || 'rapidinho')));
    if (t.precisaSenha) chips.appendChild(K.el('span', { class: 'ot-chip warn', html: K.icon('lock'), title: K.t('O macOS pede a sua senha de administrador. Quem pede é ele, não o Kamurafy.') }, K.t('pede senha')));
    const btnT = K.el('span', null, K.t('Rodar'));
    const btn = K.el('button', { class: 'btn gold ot-run', type: 'button', html: K.icon('play'), onclick: () => { runTask(t); } }, btnT);
    const res = K.el('div', { class: 'ot-res', role: 'status', 'aria-live': 'polite' });
    const card = K.el('section', { class: cls('card ot-task' + (wide ? ' is-wide' : '')), style: delay(80 + i * 60), 'aria-label': pretty(t.titulo) },
      K.el('span', { class: 'head-ic ot-task-ic', html: K.icon(ui.icon || 'otWrench') }),
      K.el('div', { class: 'ot-task-head' }, K.el('h3', null, pretty(t.titulo)), chips),
      K.el('div', { class: 'ot-task-body' },
        K.el('p', { class: 'ot-task-desc' }, pretty(t.descricao)),
        K.el('div', { class: 'ot-when', html: K.icon('otBulb') },
          K.el('div', null, K.el('span', { class: 'ot-when-t' }, K.t('Quando vale a pena')), K.el('span', { class: 'ot-when-d' }, pretty(t.quando)))),
        ui.card ? K.el('div', { class: 'tip ot-task-warn', html: K.icon('alert') }, K.el('p', null, ui.card)) : null),
      K.el('div', { class: 'ot-task-foot' }, res, btn));
    V.tasks.set(t.id, { t, card, btn, btnT, res });
    paintTaskState(t.id);
    return card;
  }

  const RES = {
    done: { tone: 'good', icon: 'check' },
    cancel: { tone: 'none', icon: 'info' },
    test: { tone: 'none', icon: 'otFlask' },
    fail: { tone: 'crit', icon: 'alert' },
  };

  function paintTaskState(id) {
    const x = V && V.tasks.get(id);
    if (!x) return;
    const r = S.tk.res.get(id);
    const busy = S.tk.busy;
    const running = busy === id;
    x.btn.disabled = !!busy;
    x.btn.classList.toggle('is-busy', running);
    setText(x.btnT, running ? K.t('Rodando…') : r && r.phase === 'done' ? K.t('Rodar de novo') : K.t('Rodar'));
    x.btn.title = busy && !running ? K.t('Espere a outra arrumação terminar') : '';
    x.res.innerHTML = '';
    x.card.classList.toggle('is-done', !!r && r.phase === 'done' && !running);
    if (running) {
      x.res.appendChild(K.el('span', { class: 'ot-res-line none', html: K.icon('clock') },
        x.t.precisaSenha ? K.t('Se aparecer um pedido de senha, é o macOS.') : K.t('Rodando…')));
    } else if (r) {
      const s = RES[r.phase] || RES.fail;
      x.res.appendChild(K.el('span', { class: 'ot-res-line ' + s.tone, html: K.icon(s.icon) },
        K.el('span', null, r.text, r.at ? K.el('span', { class: 'ot-res-at' }, K.t(' · às {0}', K.fmt.time(r.at))) : null)));
    }
  }
  function paintAllTasks() { if (V && V.tasks) for (const id of V.tasks.keys()) paintTaskState(id); }

  async function runTask(t, opts) {
    opts = opts || {};
    const tk = S.tk;
    if (tk.busy) return false;
    const ui = TASK_UI[t.id] || {};
    if (!opts.semConfirmar) {
      K.sound.plop();
      const bits = (ui.bits || []).slice();
      let note;
      if (ui.warn) { note = { tone: 'warn', icon: 'alert', text: ui.warn }; if (t.precisaSenha) bits.push(PASS); }
      else if (t.precisaSenha) note = { tone: 'warn', icon: 'lock', text: PASS };
      else note = { tone: 'good', icon: 'check', text: K.t('Não pede senha e não apaga nada seu.') };
      const body = bits.length ? K.el('ul', { class: 'ot-cf' }, bits.map((b) => K.el('li', { html: K.icon(b === PASS ? 'lock' : 'check') }, K.el('span', null, b)))) : null;
      const ok = await K.confirm({
        title: pretty(t.titulo) + '?', text: pretty(t.descricao), body, note,
        ok: ui.ok || K.t('Rodar agora'), cancel: K.t('Agora não'), icon: ui.icon || 'otWrench',
      });
      if (!ok) return false;
    }
    tk.busy = t.id;
    tk.res.delete(t.id);
    paintAllTasks();
    let res;
    try {
      /* sem prazo: o pedido de senha do macOS pode ficar aberto o tempo que a pessoa quiser */
      const r = await K.api('optimize.run', { id: t.id, confirmado: true });
      const m = noDot(r && r.mensagem);
      if (r && r.ok) {
        res = { phase: 'done', text: (m ? noDot(K.t(r.mensagem)) : K.t('Pronto')) + '.' + (t.id === 'spotlight' ? K.t(' A busca volta aos poucos nas próximas horas.') : ''), at: nowS() };
        K.sound.tada();
      } else if (/cancel/i.test(m)) {
        res = { phase: 'cancel', text: K.t('Você cancelou o pedido de senha. Nada foi mexido.') };
        K.sound.tick();
      } else {
        res = { phase: 'fail', text: K.t('Não deu certo{0}. Nada foi mexido.', m ? ': ' + m : '') };
        K.sound.oops();
      }
    } catch (e) {
      const f = friendly(e);
      res = { phase: f.test ? 'test' : 'fail', text: f.test ? K.t('Modo de teste: nada rodou de verdade.') : f.text };
      if (!f.test) K.sound.oops();
    }
    tk.busy = null;
    tk.res.set(t.id, res);
    paintAllTasks();
    return true;
  }

  /* ================= Por que tá lento? ================= */

  const LT_FRESH = 30000;        // abrir a aba lê de novo se a última leitura tiver mais que isso
  const LT_RECHECK = 2000;       // depois de pedir pra fechar, quando conferir de novo
  const VIGIA_T = K.t('Me avisar quando um app ficar no talo ou a memória chegar no limite');
  const VEREDITO = {
    voando: { t: K.t('Voando!'), face: 'joy' },
    deboa: { t: K.t('De boa'), face: 'happy' },
    pesado: { t: K.t('Tá pesado'), face: 'worried' },
    travando: { t: K.t('Tá travando'), face: 'worried' },
  };
  /* as mesmas faixas do veredito no Swift: ≥ 85 voando · ≥ 65 de boa · ≥ 40 pesado */
  const NOTA_ZONES = [
    { to: 40, tone: 'crit', label: K.t('Tá travando') },
    { to: 65, tone: 'serious', label: K.t('Tá pesado') },
    { to: 85, tone: 'good', label: K.t('De boa') },
    { to: 100, tone: 'good', label: K.t('Voando') },
  ];
  const FUNDO = {
    spotlight: { icon: 'scan', t: K.t('O Spotlight está indexando'), d: K.t('Comum depois de atualizar ou copiar muitos arquivos.') },
    timemachine: { icon: 'clock', t: K.t('O Time Machine está fazendo backup'), d: K.t('Termina sozinho.') },
    fotos: { icon: 'otPhoto', t: K.t('O Fotos está analisando a biblioteca'), d: K.t('Na tomada ele termina mais rápido.') },
    icloud: { icon: 'cloud', t: K.t('O iCloud está sincronizando'), d: K.t('Termina sozinho.') },
    atualizacao: { icon: 'otDownload', t: K.t('O macOS está preparando uma atualização'), d: K.t('Termina sozinho.') },
  };
  const HEAT_TIP = K.t('Tira de cima de almofada ou cobertor.');

  const ltStale = () => !S.lt.at || Date.now() - S.lt.at > LT_FRESH;
  const appKey = (f) => 'app:' + String(f.nome || f.alvo || f.id || '');
  const quittable = (f) => (f.tipo === 'processo' || f.tipo === 'navegador') && f.acao === 'encerrar' && !!f.alvo;
  const ltName = (f) => K.procName(f.nome) || K.t('Um processo');
  /* com ícone de app (ou navegador) é app: "o próprio app pergunta antes de fechar" */
  const ltIsApp = (f) => f.tipo === 'navegador' || (typeof f.icon === 'string' && f.icon.indexOf('data:image/') === 0);

  function verdictOf(rep) {
    if (VEREDITO[rep.veredito]) return VEREDITO[rep.veredito];
    const n = rep.nota;
    return n >= 85 ? VEREDITO.voando : n >= 65 ? VEREDITO.deboa : n >= 40 ? VEREDITO.pesado : VEREDITO.travando;
  }

  /** o que o Swift manda, com o que falta preenchido (campo ausente = sem leitura) */
  function normRep(r) {
    const rep = Object.assign({}, r || {});
    rep.achados = (Array.isArray(rep.achados) ? rep.achados : []).filter((f) => f && typeof f.tipo === 'string');
    if (!isNum(rep.nota)) rep.nota = Math.max(0, 100 - rep.achados.reduce((s, f) => s + (isNum(f.peso) ? f.peso : 0), 0));
    rep.nota = Math.max(0, Math.min(100, rep.nota));
    return rep;
  }

  /** 120 → "1,2 núcleo"; perto de 100 → "um núcleo inteiro"; 250 → "2,5 núcleos" */
  function ltCores(cpu) {
    if (!isNum(cpu)) return K.t('um núcleo inteiro');
    if (cpu >= 90 && cpu < 110) return K.t('um núcleo inteiro');
    const n = Math.round(cpu / 10) / 10;
    return `${K.fmt.num(n, n % 1 ? 1 : 0)} ${n >= 2 ? K.t('núcleos') : K.t('núcleo')}`;
  }

  /** título, linha, ícone e ação de um achado. Nome vem de fora: tudo aqui vira textContent. */
  function describe(f, rep) {
    const nome = inl(ltName(f));
    const mem = isNum(f.memBytes) ? K.fmt.mem(f.memBytes) : null;
    const swap = isNum(f.valor) && f.valor > 0 ? f.valor : isNum(rep.swapBytes) && rep.swapBytes > 0 ? rep.swapBytes : null;
    const quit = quittable(f) ? { kind: 'quit' } : (f.tipo === 'processo' || f.tipo === 'navegador') ? { kind: 'na' } : null;
    const img = typeof f.icon === 'string' && f.icon.indexOf('data:image/') === 0 ? f.icon : null;
    switch (f.tipo) {
      case 'memoria':
        if (f.detalhe === 'critica') {
          return { icon: 'memory', t: K.t('A memória está no limite'),
            d: K.t('O Mac usa o disco como memória{0}. Feche abas e apps parados.', swap ? K.t(' ({0} no disco)', K.fmt.mem(swap)) : '') };
        }
        if (f.detalhe === 'swap') {
          return { icon: 'memory', t: K.t('A memória já apertou hoje'),
            d: K.t('{0} parar no disco. Reiniciar zera isso.', swap ? K.fmt.mem(swap) + K.t(' foram') : K.t('Uma parte foi')) };
        }
        return { icon: 'memory', t: K.t('A memória está apertada'), d: K.t('Fechar abas e apps parados alivia na hora.') };
      case 'processo':
        if (f.detalhe === 'memoria') {
          const frac = isNum(f.valor) ? f.valor : isNum(f.memBytes) && isNum(rep.memTotalBytes) && rep.memTotalBytes > 0 ? f.memBytes / rep.memTotalBytes : null;
          return { icon: 'cpu', img, t: K.t('{0} ocupa {1}', nome, mem || K.t('muita memória')),
            d: frac != null ? K.t('É {0} da memória do Mac.', K.fmt.pct(frac * 100, 0)) : K.t('Fechar devolve essa memória pro Mac.'), act: quit };
        }
        return { icon: 'cpu', img, t: K.t('{0} está no talo', nome), d: K.t('Usa {0} do processador há mais de um minuto.', ltCores(f.cpu)), act: quit };
      case 'navegador': {
        const procs = isNum(f.processos) && f.processos > 1 ? K.t('{0} processos', K.fmt.num(f.processos)) : null;
        /* no talo, o que pesa é o processador; com a memória apertada, o tamanho */
        const what = f.detalhe === 'cpu' && isNum(f.cpu)
          ? K.t('Usa {0} do processador{1}', ltCores(f.cpu), procs ? K.t(' em {0}', procs) : '')
          : [procs, mem].filter(Boolean).join(K.t(' e '));
        return { icon: 'otGlobe', img, t: K.t('{0} está pesando', nome),
          d: K.t('{0}Fechar abas paradas alivia.', what ? what + '. ' : ''), act: quit };
      }
      case 'fundo': {
        const x = FUNDO[f.detalhe] || { icon: 'otMac', t: K.t('O macOS está trabalhando por baixo'), d: K.t('Termina sozinho.') };
        return { icon: x.icon, t: x.t, d: x.d, act: { kind: 'tag', tone: 'none', icon: 'clock', text: K.t('passa sozinho'), title: K.t('Trabalho do macOS: termina sozinho.') } };
      }
      case 'calor': {
        const lim = isNum(f.valor) ? f.valor : isNum(rep.limiteCPU) ? rep.limiteCPU : null;
        if (lim != null && lim < 100) {
          return { icon: 'thermo', t: K.t('O calor está freando o processador'), d: K.t('Ele está rodando a {0}% da velocidade. {1}', K.fmt.num(lim, 0), HEAT_TIP) };
        }
        return { icon: 'thermo', t: K.t('O Mac está quente'), d: HEAT_TIP };
      }
      case 'economia':
        return { icon: 'leaf', t: K.t('Modo de Pouca Energia ligado'), d: K.t('O macOS deixa o Mac mais lento de propósito pra bateria durar.'),
          act: f.acao === 'ajustes-bateria' ? { kind: 'btn', label: K.t('Abrir Ajustes'), icon: 'otSliders', run: openBatterySettings } : null };
      case 'disco': {
        const livre = isNum(f.valor) ? f.valor : isNum(rep.discoLivreBytes) ? rep.discoLivreBytes : null;
        return { icon: 'disk', t: K.t('O disco está quase cheio'),
          d: K.t('{0} O macOS precisa de espaço pra trabalhar.', livre != null ? K.t('Sobram {0}.', K.fmt.bytes(livre)) : K.t('Sobra pouco espaço.')),
          act: f.acao === 'faxina' ? { kind: 'btn', label: K.t('Liberar espaço'), icon: 'broom', run: () => { K.sound.plop(); location.hash = '#/faxina'; } } : null };
      }
      case 'reiniciar': {
        const dias = isNum(f.valor) ? Math.floor(f.valor) : isNum(rep.uptimeSec) ? Math.floor(rep.uptimeSec / 86400) : null;
        return { icon: 'cycle', t: dias != null ? K.t('Ligado há {0}', plural(dias, K.t('dia'), K.t('dias'))) : K.t('Faz tempo que o Mac não reinicia'),
          d: K.t('Reiniciar zera a memória acumulada. Menu Apple › Reiniciar.'),
          act: { kind: 'tag', tone: 'none', icon: 'otBulb', text: K.t('dica'), title: K.t('Uma dica: o Kamurafy não reinicia o Mac por você.') } };
      }
      case 'inicio': {
        const n = isNum(f.processos) ? f.processos : null;
        return { icon: 'otPower', t: n != null ? K.t('{0} com o Mac', plural(n, K.t('app abre'), K.t('apps abrem'))) : K.t('Muita coisa abre com o Mac'),
          d: K.t('Deixam o Mac mais lento pra ligar.'),
          act: { kind: 'btn', label: K.t('Ver quais'), icon: 'arrow', run: () => { K.sound.plop(); setTab('login'); } } };
      }
      default:
        return f.nome ? { icon: 'alert', t: K.t('{0} está pesando', nome), d: '', act: quit } : null;
    }
  }

  async function diagnose() {
    const lt = S.lt;
    if (lt.busy && lt.p) return lt.p;
    const run = ++lt.run;
    lt.busy = true;
    if (!lt.rep) { lt.status = 'loading'; if (mounted() && S.tab === 'lento') paintTab(); }
    else paintLtBusy();
    const p = (async () => {
      try {
        const r = await withTimeout(K.api('speed.diagnose'), 15000);
        if (run !== lt.run) return;
        lt.rep = normRep(r);
        lt.status = 'ok';
        lt.err = null;
        lt.at = Date.now();
        settleLt();
      } catch (e) {
        if (run !== lt.run) return;
        lt.err = errMsg(e);
        lt.status = lt.rep ? 'ok' : 'error';
      }
      lt.busy = false;
      lt.p = null;
      if (!mounted()) return;
      paintTabs();
      if (S.tab !== 'lento') return;
      if (V.lt && lt.status === 'ok') fillLento();
      else paintTab();
    })();
    lt.p = p;
    return p;
  }

  /** depois de cada leitura: quem fechou sai da lista; quem não fechou a tempo ganha "Forçar" */
  function settleLt() {
    const lt = S.lt;
    const t = Date.now();
    const present = new Set(lt.rep.achados.filter((f) => f.tipo === 'processo' || f.tipo === 'navegador').map(appKey));
    for (const [k, ph] of Array.from(lt.phase)) {
      if (ph.phase === 'asking' || ph.phase === 'forcing') continue;
      if (!present.has(k)) {
        if (ph.phase !== 'err') lt.closed = { nome: ph.nome, mem: ph.mem, forced: ph.phase === 'forced' || ph.phase === 'forcefail', t };
        lt.phase.delete(k);
        continue;
      }
      if (ph.phase === 'asked' && t - ph.t >= STUCK_MS) ph.phase = 'stuck';
      if (ph.phase === 'forced' && t - ph.t >= STUCK_MS) ph.phase = 'forcefail';
      if (ph.phase === 'err' && t - ph.t > 60000) lt.phase.delete(k);
    }
  }

  function paintLento() {
    const lt = S.lt;
    if (lt.status === 'idle' || (lt.status === 'loading' && !lt.rep)) {
      V.panel.appendChild(loadingCard(K.t('Vendo o que está pesando agora…'), 3));
    } else if (lt.status === 'error' && !lt.rep) {
      V.panel.appendChild(errorCard(K.t('Não consegui ver o que está pesando'), lt.err, () => { diagnose(); }, K.t('Leva uns 2 segundos.')));
    } else {
      const R = { rows: new Map() };
      V.lt = R;
      V.panel.appendChild(ltHero(R));
      R.note = K.el('div', { class: 'tip ot-note warn', hidden: true, html: K.icon('alert') }, K.el('p'));
      R.closed = K.el('div', { class: 'tip ot-closed ot-lt-closed', role: 'status', 'aria-live': 'polite', hidden: true });
      R.body = K.el('div', { class: 'ot-lt-body' });
      V.panel.append(R.note, R.closed, R.body);
      R.mascot = addMascot(R.mascotBox, 116, { face: verdictOf(lt.rep).face });
      try {
        R.gauge = K.charts.gauge(R.gaugeBox, { value: lt.rep.nota, min: 0, max: 100, zones: NOTA_ZONES, size: 210, pill: false,
          format: (v) => K.fmt.num(v, 0), endFormat: (v) => K.fmt.num(v, 0), label: K.t('de 100'), tipTitle: K.t('Nota do Mac agora') });
        V.charts.push(R.gauge);
      } catch (e) { console.warn('otimizar/mostrador: ' + errMsg(e)); }
      fillLento(true);
    }
    V.panel.appendChild(vigiaCard());
  }

  function ltHero(R) {
    R.mascotBox = K.el('div', { class: 'ot-lt-mascot' });
    R.verdict = K.el('h2', { class: 'ot-lt-verdict' });
    R.line = K.el('p', { class: 'ot-lt-line' });
    R.facts = K.el('p', { class: 'ot-lt-facts' });
    R.againT = K.el('span', null, K.t('Conferir de novo'));
    R.again = K.el('button', { class: 'btn small ot-again', type: 'button', html: K.icon('cycle'), dataset: { fk: 'ot-lt-again' },
      onclick: () => { if (S.lt.busy) return; K.sound.tick(); diagnose(); } }, R.againT);
    R.at = K.el('span', { class: 'ot-lt-at' });
    R.gaugeBox = K.el('div', { class: 'ot-lt-gauge-in' });
    return K.el('section', { class: cls('card gold ot-lt-hero'), 'aria-label': K.t('Por que o Mac está lento agora') },
      K.el('div', { class: 'ot-lt-art' }, R.mascotBox, K.el('span', { class: 'ot-sum-badge ot-lt-badge', html: K.icon('gauge') })),
      K.el('div', { class: 'ot-lt-main' }, K.el('div', { role: 'status', 'aria-live': 'polite' }, R.verdict, R.line), R.facts,
        K.el('div', { class: 'ot-lt-act' }, R.again, R.at)),
      K.el('div', { class: 'ot-lt-gauge' }, R.gaugeBox));
  }

  function paintLtBusy() {
    const R = V && V.lt;
    if (!R || !R.again) return;
    const busy = S.lt.busy;
    R.again.setAttribute('aria-disabled', String(busy));
    R.again.classList.toggle('is-busy', busy);
    setText(R.againT, busy ? K.t('Conferindo…') : K.t('Conferir de novo'));
  }

  function factsOf(rep) {
    const out = [];
    if (isNum(rep.cpu)) out.push(['cpu', K.t('Processador'), K.fmt.pct(rep.cpu, rep.cpu > 0 && rep.cpu < 10 ? 1 : 0)]);
    if (isNum(rep.memUsadaBytes)) {
      out.push(['memory', K.t('Memória'), K.fmt.mem(rep.memUsadaBytes) + (isNum(rep.memTotalBytes) && rep.memTotalBytes > 0 ? K.t(' de ') + K.fmt.mem(rep.memTotalBytes, 0) : '')]);
    }
    if (isNum(rep.discoLivreBytes)) out.push(['disk', K.t('Disco'), K.fmt.bytes(rep.discoLivreBytes) + K.t(' livres')]);
    if (isNum(rep.uptimeSec)) out.push(['clock', K.t('Ligado há'), K.fmt.duration(rep.uptimeSec)]);
    return out;
  }

  /** escreve a leitura na tela montada (na primeira vez e a cada "Conferir de novo") */
  function fillLento(first) {
    const R = V && V.lt;
    if (!R) return;
    const pop = V.pop;
    if (!first) V.pop = false;   // leitura nova não faz os cartões pularem de novo
    const lt = S.lt;
    const rep = lt.rep;
    const vd = verdictOf(rep);
    const n = rep.achados.length;
    setText(R.verdict, vd.t);
    /* voando com algo na lista: é pouca coisa, não "pesando" */
    setText(R.line, !n ? K.t('Nada pesando agora.')
      : rep.veredito === 'voando' ? K.t('Só {0} pra olhar.', n === 1 ? K.t('um detalhe') : K.t('{0} detalhes', K.fmt.num(n)))
      : K.t('{0} agora', plural(n, K.t('coisa pesando'), K.t('coisas pesando'))));
    R.facts.textContent = '';
    for (const [ic, lab, val] of factsOf(rep)) R.facts.appendChild(K.el('span', { class: 'ot-lt-fact', html: K.icon(ic) }, K.el('span', null, lab + ' ', K.el('b', null, val))));
    R.facts.hidden = !R.facts.childNodes.length;
    setText(R.at, isNum(rep.readAt) ? K.t('lido às {0}', K.fmt.time(rep.readAt)) : '');
    if (R.mascot && R.face !== vd.face) { R.face = vd.face; R.mascot.set({ face: vd.face }); }
    if (R.gauge) R.gauge.update({ value: rep.nota });
    R.note.hidden = !lt.err;
    if (lt.err) setText(R.note.querySelector('p'), K.t('Não consegui conferir de novo agora ({0}). Mostro a última leitura.', noDot(lt.err)));
    paintLtClosed();
    const had = R.body.contains(document.activeElement);
    K.keepFocus(R.body, () => {
      R.body.textContent = '';
      R.rows = new Map();
      const rows = rep.achados.map((f) => ltRow(f, rep)).filter(Boolean);
      if (rows.length) R.body.appendChild(ltListCard(rows));
      else R.body.appendChild(ltEmpty());
    });
    /* o botão que tinha o foco sumiu (o app fechou): o foco vai pro "Conferir de novo" */
    if (had && !R.body.contains(document.activeElement)) { try { R.again.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
    V.pop = pop;
    paintLtBusy();
  }

  function ltListCard(rows) {
    const ul = K.el('ul', { class: 'ot-lt-list', 'aria-label': K.t('O que está pesando') });
    for (const r of rows) ul.appendChild(r.li);
    return K.el('section', { class: cls('card ot-lt-card'), style: delay(80) },
      K.el('div', { class: 'card-head ot-lt-head' },
        K.el('div', { class: 'ot-hv-title' },
          K.el('span', { class: 'head-ic', html: K.icon('otWeight') }),
          K.el('div', null,
            K.el('h2', null, K.t('O que está pesando')),
            K.el('div', { class: 'card-sub' }, K.t('Do que mais pesa pro que menos pesa.'))))),
      ul);
  }

  function ltEmpty() {
    return K.el('section', { class: cls('ot-empty ot-lt-empty'), style: delay(80) },
      K.el('span', { class: 'ot-lt-empty-ic', 'aria-hidden': 'true', html: K.icon('otEye') }),
      K.el('div', { class: 'ot-empty-text' },
        K.el('p', null, K.t('Ficou lento? Volte aqui na hora.'))));
  }

  function ltRow(f, rep) {
    const d = describe(f, rep);
    if (!d) return null;
    const tone = ['warn', 'serious', 'crit'].includes(f.tom) ? f.tom : 'warn';
    const r = { f, d };
    r.act = K.el('span', { class: 'ot-act ot-lt-actcell' });
    r.msg = K.el('span', { class: 'ot-msg', hidden: true, role: 'status' });
    const ic = d.img ? appIcon(d.img) : K.el('span', { class: 'ot-ic ot-lt-ic ' + tone, 'aria-hidden': 'true', html: K.icon(d.icon) });
    r.li = K.el('li', { class: 'ot-lt-row' }, ic,
      K.el('span', { class: 'ot-text' },
        K.el('span', { class: 'ot-lt-t' }, d.t),
        d.d ? K.el('span', { class: 'ot-lt-d' }, d.d) : null,
        r.msg),
      r.act);
    V.lt.rows.set(f.id || appKey(f), r);
    paintLtRow(r);
    return r;
  }

  function ltActKey(r) {
    const a = r.d.act;
    if (!a) return 'none';
    if (a.kind !== 'quit') return a.kind;
    const ph = S.lt.phase.get(appKey(r.f));
    return 'quit:' + (ph ? ph.phase + (ph.force ? '!' : '') : 'none') + (S.lt.acting ? ':busy' : '');
  }

  function ltActNode(r) {
    const f = r.f;
    const a = r.d.act;
    if (!a) return null;
    if (a.kind === 'tag') return tag(a.tone + ' ot-lt-tag', a.icon, a.text, a.title);
    if (a.kind === 'na') return K.el('span', { class: 'ot-na', html: K.icon('lock'), title: K.t('O Kamurafy não fecha processos do macOS: eles seguram o sistema de pé.') }, K.t('é do macOS'));
    if (a.kind === 'btn') {
      return K.el('button', { class: 'btn small', type: 'button', html: K.icon(a.icon), onclick: (e) => { a.run(e, f); } }, a.label);
    }
    const nome = vis(ltName(f));
    const ph = S.lt.phase.get(appKey(f));
    const p = ph && ph.phase;
    const busy = S.lt.acting;
    if (p === 'asking') return K.el('button', { class: 'btn small ot-quit is-busy', type: 'button', disabled: true, html: K.icon('otQuit') }, K.t('Fechando…'));
    if (p === 'forcing') return K.el('button', { class: 'btn small danger ot-force is-busy', type: 'button', disabled: true, html: K.icon('alert') }, K.t('Forçando…'));
    if (p === 'asked' || p === 'forced') return K.el('button', { class: 'btn small ot-wait', type: 'button', disabled: true, html: K.icon('clock') }, K.t('Esperando…'));
    if (p === 'stuck' || p === 'refused' || p === 'forcefail' || (p === 'err' && ph.force)) {
      return K.el('button', { class: 'btn small danger ot-force', type: 'button', html: K.icon('alert'), disabled: busy,
        'aria-label': K.t('Forçar {0} a fechar', nome), onclick: () => { ltForce(f); } }, K.t('Forçar'));
    }
    return K.el('button', { class: 'btn small ot-quit', type: 'button', html: K.icon('otQuit'), disabled: busy,
      'aria-label': K.t('Fechar {0}', nome), onclick: () => { ltQuit(f); } }, K.t('Fechar'));
  }

  function paintLtRow(r) {
    const ak = ltActKey(r);
    if (r.actKey !== ak) {
      r.actKey = ak;
      r.act.textContent = '';
      const node = ltActNode(r);
      if (node) r.act.appendChild(node);
      r.act.hidden = !node;
    }
    const ph = quittable(r.f) ? S.lt.phase.get(appKey(r.f)) : null;
    paintMsg(r.msg, ph ? phaseMsg(ph) : S.lt.msgs.get(r.f.id) || null);
    r.li.classList.toggle('is-closing', !!ph && ['asking', 'asked', 'forcing', 'forced'].includes(ph.phase));
  }

  function repaintLtRows() {
    if (!mounted() || S.tab !== 'lento' || !V.lt) return;
    for (const r of V.lt.rows.values()) paintLtRow(r);
    paintLtClosed();
    paintTabs();
  }

  function paintLtClosed() {
    const R = V && V.lt;
    if (!R || !R.closed) return;
    const c = S.lt.closed;
    const show = !!c && Date.now() - c.t < 30000;
    R.closed.hidden = !show;
    if (!show) return;
    const key = c.t + c.nome;
    if (R.closedKey === key) return;
    R.closedKey = key;
    R.closed.innerHTML = K.icon('check');
    const mem = isNum(c.mem) && c.mem >= 50e6 ? K.t(' A memória dele ({0}) voltou pro Mac.', K.fmt.mem(c.mem)) : '';
    R.closed.appendChild(K.el('p', null, `${c.forced ? K.t('Fechei à força') : K.t('Fechou')}: ${inl(c.nome)}.${mem}`));
  }

  async function openBatterySettings(e, f) {
    K.sound.plop();
    try {
      await K.api('open.settings', { painel: 'bateria' });
      S.lt.msgs.delete(f.id);
    } catch (err) {
      K.sound.oops();
      S.lt.msgs.set(f.id, { tone: 'crit', icon: 'alert', text: K.t('Não abriu ({0}). Abra Ajustes do Sistema › Bateria.', noDot(errMsg(err))) });
    }
    repaintLtRows();
  }

  function ltStats(f) {
    const bits = [];
    if (isNum(f.cpu)) bits.push(K.t('{0} de CPU', cpuTxt(f.cpu)));
    if (isNum(f.memBytes)) bits.push(K.t('{0} de memória', K.fmt.mem(f.memBytes)));
    if (!bits.length) return null;
    const n = isNum(f.processos) ? f.processos : 1;
    return K.el('p', { class: 'kmodal-text ot-cf-stats' },
      K.t('Agora ele usa {0}{1}.', bits.join(K.t(' e ')), n > 1 ? K.t(', somando {0}', plural(n, K.t('processo'), K.t('processos'))) : ''));
  }

  async function ltQuit(f, opts) {
    opts = opts || {};
    if (S.lt.acting || !quittable(f)) return false;
    const app = ltIsApp(f);
    if (!opts.semConfirmar) {
      K.sound.plop();
      const ok = await K.confirm({
        title: app ? K.t('Fechar o app {0}?', inl(ltName(f))) : K.t('Fechar {0}?', inl(ltName(f))),
        text: app ? K.t('Se tiver algo sem salvar, o próprio app pergunta antes de fechar.')
          : K.t('Se ele estiver sincronizando ou baixando algo, isso para.'),
        body: ltStats(f),
        note: { tone: 'good', icon: 'check', text: app ? K.t('Fechar não apaga nada. Dá pra abrir o app de novo quando quiser.') : K.t('Não apaga nada. O app dono costuma abrir ele de novo.') },
        ok: K.t('Fechar'), cancel: K.t('Deixar aberto'), icon: 'otQuit',
      });
      if (!ok) return false;
    }
    await doLtQuit(f, false);
    return true;
  }

  async function ltForce(f, opts) {
    opts = opts || {};
    if (S.lt.acting || !quittable(f)) return false;
    const app = ltIsApp(f);
    if (!opts.semConfirmar) {
      K.sound.plop();
      const ok = await K.confirm({
        title: app ? K.t('Forçar o app {0} a fechar?', inl(ltName(f))) : K.t('Forçar {0} a fechar?', inl(ltName(f))),
        text: app ? K.t('Ele fecha na hora, sem perguntar nada. Use quando ele travou ou não responde.') : K.t('O processo para na hora, sem terminar o que estava fazendo.'),
        note: { tone: 'crit', icon: 'alert', text: K.t('O que não foi salvo nele se perde, e isso não dá pra desfazer.') },
        ok: K.t('Forçar e fechar'), cancel: K.t('Esperar mais'), tone: 'danger', icon: 'alert',
      });
      if (!ok) return false;
    }
    await doLtQuit(f, true);
    return true;
  }

  async function doLtQuit(f, force) {
    const lt = S.lt;
    const key = appKey(f);
    lt.acting = true;
    lt.phase.set(key, { phase: force ? 'forcing' : 'asking', t: Date.now(), nome: ltName(f), mem: f.memBytes });
    repaintLtRows();
    /* cada leitura registra ids novos no Swift: espera a que estiver em andamento e usa o alvo mais novo */
    if (lt.p) { try { await withTimeout(lt.p, 16000); } catch (e) { /* segue com o que tem */ } }
    const cur = (lt.rep && lt.rep.achados.find((x) => quittable(x) && appKey(x) === key)) || f;
    let next;
    let stale = false;
    try {
      const r = await withTimeout(K.api('optimize.quit', force ? { id: cur.alvo, forcar: true } : { id: cur.alvo }), 15000);
      if (r && r.ok) { next = { phase: force ? 'forced' : 'asked', t: Date.now() }; K.sound.tick(); }
      else { next = { phase: force ? 'forcefail' : 'refused', t: Date.now() }; K.sound.oops(); }
    } catch (e) {
      const fr = friendly(e);
      next = { phase: 'err', t: Date.now(), f: fr, force };
      if (!fr.test) K.sound.oops();
      stale = !!fr.stale;
    }
    lt.phase.set(key, Object.assign(lt.phase.get(key) || { nome: ltName(cur), mem: cur.memBytes }, next));
    lt.acting = false;
    repaintLtRows();
    /* confere de novo: o app some da lista ou, se não fechou a tempo, ganha o "Forçar" */
    if (next.phase === 'asked' || next.phase === 'forced') {
      const me = V;
      const again = () => {
        const ph = lt.phase.get(key);
        if (me && !me.dead && ph && (ph.phase === 'asked' || ph.phase === 'forced')) diagnose();
      };
      setTimeout(again, LT_RECHECK);
      setTimeout(again, STUCK_MS + 300);
    } else if (stale) diagnose();
  }

  /* ---------- vigia (settings.vigia / vigiaIgnorar) ---------- */

  function readVg(v) {
    const vg = S.vg;
    if (!v || typeof v !== 'object') return;
    vg.vigia = v.vigia !== false;
    vg.ignorar = (Array.isArray(v.vigiaIgnorar) ? v.vigiaIgnorar : []).filter((x) => typeof x === 'string' && x.trim());
  }

  async function loadVigia() {
    const vg = S.vg;
    const run = ++vg.run;
    try {
      const v = await withTimeout(K.settings.load(), 6000);
      if (run !== vg.run) return;
      readVg(v);
      vg.status = 'ok';
      vg.err = null;
    } catch (e) {
      if (run !== vg.run) return;
      if (vg.status !== 'ok') vg.status = 'error';
    }
    paintVigia();
  }

  async function saveVigia(patch) {
    const vg = S.vg;
    if (vg.status !== 'ok' || vg.busy) return false;
    K.sound.plop();
    const before = { vigia: vg.vigia, ignorar: vg.ignorar.slice() };
    if ('vigia' in patch) vg.vigia = !!patch.vigia;
    if ('vigiaIgnorar' in patch) vg.ignorar = patch.vigiaIgnorar.slice();
    vg.busy = true;
    vg.err = null;
    ++vg.run;
    paintVigia();
    try {
      readVg(await withTimeout(K.settings.set(patch), 8000));
    } catch (e) {
      vg.vigia = before.vigia;
      vg.ignorar = before.ignorar;
      vg.err = K.t('Não consegui salvar agora ({0}). Voltei como estava.', noDot(errMsg(e)));
      K.sound.oops();
    }
    vg.busy = false;
    paintVigia();
    return true;
  }

  function vigiaCard() {
    const R = {};
    V.vg = R;
    R.sw = K.el('button', { class: 'switch ot-lt-sw', type: 'button', role: 'switch', 'aria-label': VIGIA_T,
      onclick: () => { if (!R.sw.disabled) saveVigia({ vigia: !S.vg.vigia }); } });
    R.err = K.el('p', { class: 'ot-lt-err', role: 'alert', hidden: true });
    R.ign = K.el('div', { class: 'ot-lt-ign', hidden: true });
    const card = K.el('section', { class: cls('card ot-lt-vigia'), style: delay(160), 'aria-label': K.t('Vigia') },
      K.el('div', { class: 'ot-lt-vg-row' },
        K.el('span', { class: 'head-ic', html: K.icon('bell') }),
        K.el('div', { class: 'ot-lt-vg-text' }, K.el('h2', null, K.t('Vigia')), K.el('p', null, VIGIA_T)),
        R.sw),
      R.err, R.ign);
    paintVigia();
    return card;
  }

  function paintVigia() {
    const R = V && V.vg;
    if (!R || !mounted()) return;
    const vg = S.vg;
    const ok = vg.status === 'ok';
    R.sw.setAttribute('aria-checked', String(ok && vg.vigia));
    /* ocupado salvando: o clique é ignorado, mas o interruptor não perde o foco */
    R.sw.disabled = !ok;
    R.sw.setAttribute('aria-busy', String(vg.busy));
    R.sw.title = !ok ? '' : vg.vigia ? K.t('Ligada: olho a cada minuto.') : K.t('Desligada: não aviso nada.');
    const err = vg.status === 'error' ? K.t('Não consegui ler esse ajuste. Tento de novo quando você voltar aqui.') : vg.err;
    R.err.hidden = !err;
    setText(R.err, err || '');
    const list = ok ? vg.ignorar : [];
    R.ign.hidden = !list.length;
    const had = R.ign.contains(document.activeElement);
    K.keepFocus(R.ign, () => {
      R.ign.textContent = '';
      if (!list.length) return;
      const ul = K.el('ul', { class: 'ot-lt-ign-list' });
      for (const nome of list) {
        ul.appendChild(K.el('li', null,
          K.el('span', { class: 'ot-lt-ign-n' }, vis(nome)),
          K.el('button', { class: 'btn small', type: 'button', html: K.icon('bell'),
            'aria-label': K.t('Voltar a avisar sobre {0}', vis(nome)),
            onclick: () => { saveVigia({ vigiaIgnorar: S.vg.ignorar.filter((x) => x !== nome) }); } }, K.t('Voltar a avisar'))));
      }
      R.ign.append(K.el('span', { class: 'ot-lt-ign-l' }, K.t('Não aviso mais destes')), ul);
    }, K.t('.ot-lt-ign-list button'));
    /* tirou o último da lista: o foco volta pro interruptor */
    if (had && !R.ign.contains(document.activeElement)) { try { R.sw.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
  }

  /* ================= página ================= */

  function teardown() {
    if (!V) return;
    if (K.confirm.isOpen()) K.confirm.close(false);
    V.dead = true;
    clearTimeout(V.pollId);
    if (V.onVis) document.removeEventListener('visibilitychange', V.onVis);
    for (const c of V.charts) { try { c.destroy(); } catch (e) { /* já foi */ } }
    for (const m of V.mascots) { try { m.destroy(); } catch (e) { /* já foi */ } }
    K.tooltip.hide();
    V = null;
    host = null;
  }

  K.pages.otimizar = {
    title: K.t('Velocidade'),
    async render(el) {
      teardown();
      host = el;
      V = { dead: false, mascots: [], charts: [], stRows: new Map(), tasks: new Map(), hv: null, sum: null, lt: null, vg: null,
        popped: new Set(), pop: true, pollId: 0 };
      const me = V;
      /* a rota diz a aba (os avisos da vigia abrem otimizar?aba=lento); sem ela, a primeira */
      const q = /[?&]aba=([a-z]+)/.exec(location.hash || '');
      S.tab = q && TABS.some((t) => t.id === q[1]) ? q[1] : TABS[0].id;
      /* recados e pedidos de fechar são desta visita; a lista e os resultados ficam */
      S.st.msgs.clear();
      S.hv.phase.clear();
      S.hv.closed = null;
      S.hv.acting = false;
      S.lt.phase.clear();
      S.lt.msgs.clear();
      S.lt.closed = null;
      S.lt.acting = false;
      await Promise.race([K.cached('battery.now', null, 5000).then((b) => { S.bat = b; }).catch(() => {}), K.sleep(700)]);
      if (me.dead || host !== el) return;
      paintShell();
      const pSt = loadStartup();
      const pTk = loadTasks();
      const pHv = S.tab === 'pesando' ? loadHeavy() : Promise.resolve();
      const pLt = S.tab === 'lento' && ltStale() ? diagnose() : Promise.resolve();
      loadVigia();
      paintTab();
      startPoll();
      me.onVis = () => { if (!document.hidden && S.tab === 'pesando') kickHeavy(); };
      document.addEventListener('visibilitychange', me.onVis);
      const wait = S.tab === 'lento' ? pLt : S.tab === 'login' ? pSt : S.tab === 'pesando' ? pHv : pTk;
      await Promise.race([wait, K.sleep(4000)]);
    },
    destroy() { teardown(); },
  };

  /* ================= ganchos de teste (tools/foto.sh) =================
     Só na build de desenvolvimento: na PUBLICO (app.version.publico) K.otimizar é undefined.
     No modo foto o Swift recusa desligar, fechar e rodar de verdade ("Só no app aberto."). */

  function findIn(list, m) {
    const rx = m instanceof RegExp ? m : new RegExp(String(m), 'i');
    return list.find((x) => rx.test(String(x.nome || '')) || rx.test(String(x.label || '')) || rx.test(String(x.id || '')));
  }

  const hooks = {
    /** troca de aba: 'lento' | 'login' | 'pesando' | 'manutencao' */
    tab(nome) { setTab(nome); },
    /** lê de novo a aba (padrão: a atual) */
    reload(nome) {
      const t = nome || S.tab;
      return t === 'lento' ? diagnose() : t === 'login' ? loadStartup({ loud: true }) : t === 'pesando' ? loadHeavy() : loadTasks();
    },
    /** "Por que tá lento?": Fechar / Forçar um achado pelo nome ({semConfirmar: true} pula o modal) */
    ltQuit(m, opts) { const f = S.lt.rep && findIn(S.lt.rep.achados.filter(quittable), m); return f ? ltQuit(f, opts) : Promise.resolve(false); },
    ltForce(m, opts) { const f = S.lt.rep && findIn(S.lt.rep.achados.filter(quittable), m); return f ? ltForce(f, opts) : Promise.resolve(false); },
    /** envelhece os pedidos de fechar da aba lento e confere de novo (pra ver o "Forçar" sem esperar) */
    ltAge(ms) { for (const ph of S.lt.phase.values()) ph.t -= (ms || STUCK_MS); return diagnose(); },
    /** liga/desliga a vigia; unignore('Spotify') tira um nome da lista de "não avisar" */
    vigia(on) { return saveVigia({ vigia: on !== false }); },
    unignore(nome) { return saveVigia({ vigiaIgnorar: S.vg.ignorar.filter((x) => x !== nome) }); },
    /** liga/desliga um item de início pelo nome ou label; {semConfirmar: true} pula o modal */
    toggle(m, ligar, opts) { const it = findIn(S.st.items, m); return it ? toggleStartup(it, ligar, opts) : Promise.resolve(false); },
    /** Fechar (abre o modal, a menos que {semConfirmar: true}) */
    quit(m, opts) { const a = findIn(S.hv.items, m); return a ? quitApp(a, opts) : Promise.resolve(false); },
    /** Forçar (modal vermelho, a menos que {semConfirmar: true}) */
    force(m, opts) { const a = findIn(S.hv.items, m); return a ? forceApp(a, opts) : Promise.resolve(false); },
    /** roda uma arrumação pelo id ('dns', 'spotlight'…) */
    run(id, opts) { const t = S.tk.items.find((x) => x.id === id); return t ? runTask(t, opts) : Promise.resolve(false); },
    pause(on) { setPaused(on !== false); },
    /** mostra (true) ou recolhe os processos tranquilos do macOS */
    calm(on) { S.hv.showCalm = on !== false; if (V && V.hv) updateHeavy(); },
    /** finge o mouse em cima da lista de "Pesando agora" (a ordem fica parada) */
    hover(on) { if (V && V.hv) { V.hv.hover = !!on; if (!on) applyOrder(); } },
    /** envelhece os pedidos de fechar (pra ver o "Forçar" sem esperar 6 s) */
    age(ms) { for (const ph of S.hv.phase.values()) ph.t -= (ms || STUCK_MS); settlePhases(); repaintHeavyRows(); },
    /** esquece o que já foi lido (os cenários trocam a ponte depois da primeira leitura) */
    reset() {
      Object.assign(S.st, { status: 'idle', items: [], err: null, at: 0, run: S.st.run + 1 });
      Object.assign(S.hv, { status: 'idle', items: [], sys: null, err: null, at: 0, run: S.hv.run + 1, fails: 0, paused: false, acting: false, closed: null, showCalm: false, calmN: 0 });
      Object.assign(S.tk, { status: 'idle', items: [], err: null, run: S.tk.run + 1, busy: null });
      Object.assign(S.lt, { status: 'idle', rep: null, err: null, at: 0, run: S.lt.run + 1, busy: false, p: null, acting: false, closed: null });
      Object.assign(S.vg, { status: 'idle', vigia: true, ignorar: [], busy: false, err: null, run: S.vg.run + 1 });
      S.st.msgs.clear(); S.st.busy.clear(); S.hv.phase.clear(); S.tk.res.clear(); S.lt.phase.clear(); S.lt.msgs.clear();
      S.test = false;
    },
    state() {
      return {
        tab: S.tab, test: S.test,
        lento: { status: S.lt.status, veredito: S.lt.rep && S.lt.rep.veredito, nota: S.lt.rep && S.lt.rep.nota, achados: S.lt.rep ? S.lt.rep.achados.map((f) => f.tipo + (f.detalhe ? ':' + f.detalhe : '')) : [],
          fases: Array.from(S.lt.phase, ([k, p]) => ({ k, fase: p.phase })), vigia: S.vg.status === 'ok' ? S.vg.vigia : null, ignorar: S.vg.ignorar.slice() },
        login: { status: S.st.status, itens: S.st.items.length, ligados: S.st.items.filter((x) => x.ligado).length, recados: S.st.msgs.size },
        pesando: { status: S.hv.status, itens: S.hv.items.length, pausado: S.hv.paused, fases: Array.from(S.hv.phase, ([pid, p]) => ({ pid, fase: p.phase })) },
        manutencao: { status: S.tk.status, itens: S.tk.items.length, rodando: S.tk.busy, resultados: Array.from(S.tk.res, ([id, r]) => ({ id, fase: r.phase })) },
      };
    },
  };
  const hooksOn = () => snap() || !!(K.appVersion && K.appVersion.publico === false);
  Object.defineProperty(K, 'otimizar', { configurable: true, get: () => (hooksOn() ? hooks : undefined) });
})();
