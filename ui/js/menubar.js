/* Kamurafy — balão da barra de menus (ui/menubar.html, NSPopover de 340 px de largura).
   Topo com o mascote e a carga, quatro minicartões (CPU, memória, disco, temperatura), quem
   mais gasta agora, atalhos pro app, ajustes rápidos e rodapé com a versão.
   Dados: battery.now + system.now (a cada 5 s com o balão aberto), battery.energyApps (a cada
   20 s), battery.info (uma vez), menubar.status, settings.*, app.version — contrato em
   docs/ponte.md. Avisa app.ready depois do primeiro desenho e pede menubar.resize sempre que
   a altura muda. O Swift chama K.menubar.refresh() quando o balão abre.
   Reinicia do zero num DOMContentLoaded novo (os cenários de teste fazem isso). */
'use strict';

(function () {
  const LIVE_MS = 5000;
  const APPS_MS = 20000;
  const APPS_TOP = 3;
  const BAR_FLOOR = 40;            // impacto que já enche a barra (abaixo disso é gasto leve)
  const READY_WAIT_MS = 3200;      // o primeiro "quem gasta" leva ~1,5 s: a foto espera um pouco por ele

  /* ícones só do balão (mesmo traço do icons.js) */
  Object.assign(K.ICONS, {
    mbGo: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
    mbSliders: '<path d="M4 7.5h9M18.5 7.5H20M4 16.5h2.5M11.5 16.5H20"/><circle cx="15.8" cy="7.5" r="2.4"/><circle cx="9" cy="16.5" r="2.4"/>',
  });

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const snap = () => document.documentElement.classList.contains('snap');
  const setText = (node, txt) => { if (node.textContent !== txt) node.textContent = txt; };
  const canRun = () => snap() || !document.hidden;

  /* a dica flutuante mora no app.js, que o balão não carrega */
  if (!K.tooltip) {
    K.tooltip = {
      show(x, y, title, rows) {
        const tt = K.$('#tooltip');
        if (!tt) return;
        tt.textContent = '';
        if (title) tt.appendChild(K.el('div', { class: 'tt-title' }, title));
        for (const r of rows || []) {
          tt.appendChild(K.el('div', { class: 'tt-row' },
            r.color ? K.el('i', { class: 'tt-key', style: { background: r.color } }) : null,
            K.el('span', { class: 'tt-val' }, r.value),
            r.name ? K.el('span', { class: 'tt-name' }, r.name) : null));
        }
        tt.hidden = false;
        const w = tt.offsetWidth, h = tt.offsetHeight;
        let left = x + 14, top = y - h - 10;
        if (left + w > innerWidth - 6) left = Math.max(6, x - w - 14);
        if (top < 6) top = y + 14;
        tt.style.left = left + 'px';
        tt.style.top = top + 'px';
      },
      hide() { const tt = K.$('#tooltip'); if (tt) tt.hidden = true; },
    };
  }

  /* ================= regras de texto ================= */

  /** o que a bateria está fazendo agora, numa linha curta ("Carregando · cheia em 48 min") */
  function stateOf(b) {
    const pct = b.percent;
    let r;
    if (b.isCharging == null && b.pluggedIn == null) {
      r = { key: 'unknown', icon: 'info', title: 'Tomada sem leitura', sub: 'o Mac não informou' };
    } else if (b.isCharging) {
      let t;
      if (b.optimizedChargingEngaged) t = 'no ritmo otimizado';
      else if (isNum(b.minutesToFull) && b.minutesToFull > 0) t = `cheia em ${K.fmt.mins(b.minutesToFull)}`;
      else if (b.finishingCharge) t = 'terminando devagar';
      else t = 'calculando o tempo…';
      r = { key: 'charging', icon: 'bolt', title: 'Carregando', sub: t };
    } else if (b.pluggedIn) {
      if (K.batTopping(b)) r = { key: 'topping', icon: 'bolt', title: 'Na tomada', sub: 'terminando de encher' };
      else if (b.fullyCharged || (isNum(pct) && pct >= 99)) r = { key: 'full', icon: 'moon', title: 'Cheia na tomada', sub: 'descansando' };
      else if (b.optimizedChargingEngaged) r = { key: 'held', icon: 'plug', title: 'Na tomada', sub: 'o macOS segurou a carga' };
      else r = { key: 'plugged', icon: 'plug', title: 'Na tomada', sub: 'sem carregar agora' };
    } else {
      const m = isNum(b.minutesToEmpty) && b.minutesToEmpty > 0 && b.minutesToEmpty < 48 * 60 ? b.minutesToEmpty : null;
      const low = isNum(pct) && pct <= 20;
      r = { key: low ? 'low' : 'battery', icon: low ? 'alert' : 'battery', title: low ? 'Carga baixa' : 'Na bateria',
        sub: m ? `dura mais ${K.fmt.mins(m)}` : 'calculando quanto dura…' };
    }
    /* calor não entra aqui: o minicartão da temperatura e o rosto do mascote já contam */
    r.text = r.title + ' · ' + r.sub;
    return r;
  }

  /* temperatura da bateria (as mesmas faixas da tela Bateria) */
  const TEMP = [
    { to: 35, tone: 'good', word: null },
    { to: 40, tone: 'warn', word: 'morna' },
    { to: 45, tone: 'serious', word: 'quente' },
    { to: Infinity, tone: 'crit', word: 'muito quente' },
  ];
  /* calor do Mac todo (Mac de mesa, sem sensor de bateria) */
  const THERMAL = {
    normal: { word: 'Fresco', tone: 'good' },
    morno: { word: 'Morno', tone: 'good' },
    quente: { word: 'Quente', tone: 'serious' },
    critico: { word: 'Crítico', tone: 'crit' },
  };
  const PRESSURE = {
    normal: { word: 'Folgada', tone: 'good', txt: 'Tem memória de sobra pro que está aberto.' },
    atencao: { word: 'Apertada', tone: 'warn', txt: 'O macOS já está comprimindo e usando o disco pra dar conta. Fechar abas e apps parados alivia.' },
    critica: { word: 'No limite', tone: 'serious', txt: 'Falta memória e o Mac usa o disco no lugar dela, o que deixa tudo lento.' },
  };

  /** memória em base 2, como o Monitor de Atividade ("16 GB"): a mesma função das outras telas */
  const mem = (v) => K.fmt.mem(v);

  /* ================= estado da página ================= */

  let M = null;          // balão montado (um por DOMContentLoaded)
  let readySent = false;
  let setOpenPref = false;  // ajustes abertos ou fechados: vale enquanto o app está aberto

  const alive = (m) => M === m && !m.dead;

  function stop(m) {
    if (!m) return;
    m.dead = true;
    clearInterval(m.liveTimer);
    clearInterval(m.appsTimer);
    clearTimeout(m.readyTimer);
    if (m.ro) m.ro.disconnect();
    if (m.mascot) { try { m.mascot.destroy(); } catch (e) { /* já foi */ } }
  }

  function show(rota) {
    K.sound.plop();
    K.tooltip.hide();
    K.api('app.show', rota ? { rota } : {}).catch((e) => console.warn('app.show: ' + e.message));
  }

  /* ================= montagem ================= */

  function build(m, root) {
    m.hero = K.el('section', { class: 'card mb-hero pop-in', role: 'button', tabindex: 0 });
    m.hero.addEventListener('click', () => show(m.mode === 'bat' || m.mode === 'noread' ? 'bateria' : null));
    m.hero.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.hero.click(); } });

    m.minis = K.el('div', { class: 'mb-minis' });
    m.mini = {
      cpu: mini(m, 'cpu', 'painel', 0),
      mem: mini(m, 'memory', 'painel', 1),
      disk: mini(m, 'disk', 'painel', 2),
      temp: mini(m, 'thermo', 'bateria', 3),
    };

    root.append(
      m.hero,
      m.minis,
      appsCard(m),
      actions(m),
      settingsCard(m),
      footer(m));
    heroWait(m);
  }

  /* ---------- topo: mascote + carga + estado + saúde ---------- */

  function heroWait(m) {
    m.mode = 'wait';
    m.hero.textContent = '';
    m.hero.className = 'card mb-hero pop-in is-wait';
    m.hero.setAttribute('aria-label', 'Lendo a bateria');
    const box = K.el('div', { class: 'mb-mascot', 'aria-hidden': 'true' });
    m.hero.append(box, K.el('div', { class: 'mb-hero-tx' },
      K.el('div', { class: 'loading mb-wait' }, 'Lendo a bateria…')));
    m.mascot = K.mascot(box, { size: 94, state: { pct: null, tone: 'none', face: 'happy' } });
  }

  /** monta o topo de novo só quando o tipo muda (bateria · sem leitura · Mac de mesa · erro) */
  function heroMode(m, mode) {
    if (m.mode === mode) return;
    m.mode = mode;
    const h = m.hero;
    h.textContent = '';
    h.className = 'card mb-hero mode-' + mode + (m.first ? ' pop-in' : '');
    delete h.dataset.state;
    m.h = {};
    const box = K.el('div', { class: 'mb-mascot', 'aria-hidden': 'true' });
    if (mode === 'bat') {
      m.h.n = K.el('span', { class: 'mb-charge-n num' });
      m.h.u = K.el('span', { class: 'mb-charge-u' }, '%');
      m.h.ic = K.el('span', { class: 'mb-state-ic' });
      m.h.st = K.el('span', { class: 'mb-state-t' });
      m.h.ss = K.el('span', { class: 'mb-state-s' });
      m.h.state = K.el('div', { class: 'mb-state' }, m.h.ic, K.el('span', { class: 'mb-state-tx' }, m.h.st, m.h.ss));
      m.h.hl = K.el('span', { class: 'mb-health-l' });
      m.h.pill = K.el('span', { class: 'mb-health-p' });
      h.append(box, K.el('div', { class: 'mb-hero-tx' },
        K.el('div', { class: 'mb-charge' }, m.h.n, m.h.u, K.el('span', { class: 'mb-charge-l' }, 'de carga')),
        m.h.state,
        K.el('div', { class: 'mb-health' }, m.h.hl, m.h.pill)));
      m.mascot = K.mascot(box, { size: 94, state: { pct: null } });
      m.h.last = {};
    } else {
      const txt = {
        desk: ['Mac de mesa', 'Sem bateria por aqui: ele vive na tomada.'],
        noread: ['Bateria sem leitura', 'O Mac não informou a bateria agora. Tento de novo em 5 segundos.'],
        err: ['Sem leitura agora', 'Não consegui falar com a bateria. Tento de novo em 5 segundos.'],
      }[mode];
      h.append(box, K.el('div', { class: 'mb-hero-tx' },
        K.el('div', { class: 'mb-hero-title' }, txt[0]),
        K.el('p', { class: 'mb-hero-sub' }, txt[1])));
      m.mascot = K.mascot(box, { size: 72, state: { pct: null, tone: 'none', plugged: mode === 'desk', face: mode === 'desk' ? 'happy' : 'worried' } });
      h.setAttribute('aria-label', txt[0] + '. ' + txt[1] + (mode === 'desk' ? ' Abrir o Kamurafy.' : ' Ver a bateria no Kamurafy.'));
    }
  }

  function paintHero(m, b) {
    if (!b || !b.present) {
      /* notebook sem leitura ≠ Mac de mesa: o modelo diz qual é */
      if (b && !b.present) {
        heroMode(m, K.isLaptop(m.info) ? 'noread' : 'desk');
      } else if (m.mode === 'wait' || m.mode === 'err' || m.mode === 'desk') {
        /* a leitura falhou: se o modelo diz que é Mac de mesa, não fala em bateria */
        heroMode(m, m.info && m.info.model && !K.isLaptop(m.info) ? 'desk' : 'err');
      }
      return;
    }
    heroMode(m, 'bat');
    const st = K.batStatus(b);
    const s = stateOf(b);
    const pct = isNum(b.percent) ? b.percent : null;
    const hot = isNum(b.temperatureC) && b.temperatureC >= 40;
    m.mascot.set({
      pct, tone: st.tone, charging: !!b.isCharging, plugged: !!b.pluggedIn,
      full: !!(b.pluggedIn && !b.isCharging && pct != null && pct >= 99) && !K.batTopping(b), hot,
    });
    const L = m.h.last;
    if (pct == null) { K.readOr(m.h.n, null); m.h.u.hidden = true; }
    else {
      m.h.n.classList.remove('no-read');
      m.h.u.hidden = false;
      if (L.pct == null && m.first) K.countUp(m.h.n, pct, (v) => K.fmt.num(v, 0), 700);
      else setText(m.h.n, K.fmt.num(pct, 0));
    }
    L.pct = pct;
    if (L.icon !== s.icon) { m.h.ic.innerHTML = K.icon(s.icon); L.icon = s.icon; }
    setText(m.h.st, s.title);
    setText(m.h.ss, s.sub);
    m.h.state.dataset.state = s.key;
    m.hero.dataset.state = s.key;

    const h = b.healthPct;
    const hk = st.label + '|' + h;
    if (L.hk !== hk) {
      L.hk = hk;
      setText(m.h.hl, isNum(h) ? `Saúde ${K.fmt.pct(h)}` : 'Saúde');
      m.h.pill.textContent = '';
      m.h.pill.appendChild(K.statusPill(st.tone, st.label, st.icon));
    }
    m.hero.setAttribute('aria-label',
      `${pct != null ? K.fmt.pct(pct, 0) + ' de carga' : 'Carga sem leitura'}. ${s.text}. ` +
      `${isNum(h) ? 'Saúde ' + K.fmt.pct(h) : 'Saúde sem leitura'}, ${st.label}. Ver a bateria no Kamurafy.`);
  }

  /* ---------- minicartões ---------- */

  function mini(m, iconName, rota, i) {
    const ic = K.el('span', { class: 'mb-mini-ic', html: K.icon(iconName) });
    const v = K.el('span', { class: 'mb-mini-v num' }, '…');
    const l = K.el('span', { class: 'mb-mini-l' }, '');
    const node = K.el('button', { class: 'mb-mini pop-in', type: 'button', onclick: () => show(rota) }, ic, v, l);
    node.style.animationDelay = (60 + i * 40) + 'ms';
    m.minis.appendChild(node);
    return { node, ic, v, l, icon: iconName };
  }

  function paintMini(c, o) {
    c.node.classList.remove('good', 'warn', 'serious', 'crit', 'none');
    c.node.classList.add(o.tone || 'none');
    if (o.value == null) K.readOr(c.v, null);
    else { c.v.classList.remove('no-read'); setText(c.v, o.value); }
    /* palavra comprida ("No limite", "Apertada") encolhe pra caber no cartão de ~70 px */
    const len = o.value == null ? 0 : String(o.value).length;
    c.v.classList.toggle('long', len >= 8 && len < 10);
    c.v.classList.toggle('longer', len >= 10);
    setText(c.l, o.label);
    c.l.classList.toggle('long', String(o.label || '').length >= 12);
    c.node.title = o.title;
    c.node.setAttribute('aria-label', o.aria || o.title);
  }

  function paintMinis(m) {
    const s = m.s, b = m.b;
    /* CPU: alto um instante é normal, então no máximo "atenção" (nunca vermelho) */
    const cpu = s && s.cpu && isNum(s.cpu.usagePct) ? s.cpu.usagePct : null;
    const busy = cpu != null && cpu >= 90;
    paintMini(m.mini.cpu, {
      tone: cpu == null ? 'none' : busy ? 'warn' : 'good',
      value: cpu == null ? null : K.fmt.pct(cpu, 0),
      label: busy ? 'a todo vapor' : 'CPU',
      title: cpu == null
        ? 'Processador: o macOS não informou agora.'
        : `Processador em ${K.fmt.pct(cpu, 0)} agora${busy ? ', a todo vapor' : ''}. Alto por um instante é normal; se ficar assim parado, veja quem está puxando.`,
    });

    const m0 = s && s.memory;
    const pr = m0 ? PRESSURE[m0.pressure] : null;
    const used = m0 && isNum(m0.usedBytes) && isNum(m0.totalBytes)
      ? ` Em uso: ${mem(m0.usedBytes)} de ${mem(m0.totalBytes)} (usar bastante é normal; o que conta é a pressão).` : '';
    paintMini(m.mini.mem, {
      tone: pr ? pr.tone : 'none',
      value: pr ? pr.word : null,
      label: 'memória',
      title: pr
        ? `Memória ${pr.word.toLowerCase()}. ${pr.txt}${used}`
        : 'Memória: o macOS não informou agora.',
    });

    const d = s && s.disk;
    const total = d && isNum(d.totalBytes) ? d.totalBytes : null;
    const avail = d ? (isNum(d.availableBytes) ? d.availableBytes : isNum(d.freeBytes) ? d.freeBytes : null) : null;
    const freePct = total && avail != null ? (avail / total) * 100 : null;
    const dt = freePct == null ? 'none' : freePct < 10 ? 'crit' : freePct < 20 ? 'warn' : 'good';
    paintMini(m.mini.disk, {
      tone: dt,
      value: avail == null ? null : K.fmt.bytes(avail),
      label: dt === 'crit' ? 'quase cheio' : dt === 'warn' ? 'enchendo' : 'livres',
      title: avail == null
        ? 'Disco: o macOS não informou agora.'
        : `${K.fmt.bytes(avail)} livres de ${K.fmt.bytes(total)} (${K.fmt.num(freePct, 0)}%), contando o que o macOS libera sozinho. Ele gosta de ter uns 10 a 20% livres.`,
    });

    if (m.mode === 'bat') {
      const t = b && isNum(b.temperatureC) ? b.temperatureC : null;
      const z = t == null ? null : TEMP.find((x) => t < x.to);
      paintMini(m.mini.temp, {
        tone: z ? z.tone : 'none',
        value: t == null ? null : K.fmt.temp(t),
        label: z && z.word ? z.word : 'bateria',
        title: t == null
          ? 'Temperatura da bateria: o Mac não informou agora.'
          : `Bateria a ${K.fmt.temp(t)}${z && z.word ? ', ' + z.word : ''}. Abaixo de 35 °C é o ideal: é assim que ela dura mais.`,
      });
    } else {
      /* sem sensor de bateria: mostra o calor do Mac todo */
      const th = s ? THERMAL[s.thermalState] : null;
      paintMini(m.mini.temp, {
        tone: th ? th.tone : 'none',
        value: th ? th.word : null,
        label: 'calor',
        title: th ? `Calor do Mac: ${th.word.toLowerCase()}. É a leitura geral do macOS, não um sensor em graus.` : 'Calor do Mac: o macOS não informou agora.',
      });
    }
  }

  /* ---------- quem mais gasta agora ---------- */

  function appsCard(m) {
    m.appsList = K.el('div', { class: 'mb-apps-list', 'aria-live': 'polite' },
      K.el('div', { class: 'loading mb-apps-wait' }, 'Medindo quem gasta…'));
    const more = K.el('button', { class: 'mb-link', type: 'button', onclick: () => show('bateria') },
      'ver mais', K.el('span', { html: K.icon('mbGo') }));
    const c = K.el('section', { class: 'card mb-apps pop-in', 'aria-labelledby': 'mb-apps-t' },
      K.el('div', { class: 'mb-apps-head' },
        K.el('h2', { id: 'mb-apps-t' }, 'Quem mais gasta agora'),
        more),
      m.appsList,
      K.el('p', { class: 'mb-apps-note', title: 'O número é o "impacto energético" do Monitor de Atividade: não tem unidade e serve só pra comparar um app com outro.' },
        'Impacto energético do macOS (não é watt).'));
    c.style.animationDelay = '180ms';
    return c;
  }

  function paintApps(m, list, err) {
    const box = m.appsList;
    if (err) {
      if (m.appsShown) return;      // já tem uma lista na tela: fica com ela até a próxima medida
      box.textContent = '';
      box.appendChild(K.el('div', { class: 'mb-apps-err' },
        K.el('span', null, 'Não deu pra medir agora.'),
        K.el('button', { class: 'mb-link', type: 'button', onclick: () => { K.sound.plop(); loadApps(m, true); } },
          K.el('span', { class: 'mb-link-ic', html: K.icon('cycle') }), 'Tentar de novo')));
      m.resize();
      return;
    }
    const items = K.energyItems(list).slice(0, APPS_TOP);
    box.textContent = '';
    m.appsShown = true;
    if (!items.length) {
      box.appendChild(K.el('div', { class: 'mb-apps-empty' },
        K.el('span', { class: 'mb-h-ic good', html: K.icon('leaf') }),
        K.el('span', null, 'Nenhum app gastando energia de verdade agora. Tudo calmo.')));
      return;
    }
    /* escala com piso: num Mac calmo o primeiro não aparece com a barra cheia */
    const max = Math.max(...items.map((x) => x.value), BAR_FLOOR);
    for (const it of items) {
      const isImg = typeof it.icon === 'string' && it.icon.indexOf('data:image/') === 0;
      const ic = isImg
        ? K.el('img', { class: 'mb-app-img', src: it.icon, alt: '' })
        : K.el('span', { class: 'mb-app-ic', html: K.icon(K.ICONS[it.icon] ? it.icon : 'apps') });
      const fill = K.el('i', { class: 'mb-bar-fill' });
      fill.style.width = Math.max(6, (it.value / max) * 100).toFixed(1) + '%';
      /* processo do sistema: "Tela e janelas (WindowServer)" vira "Tela e janelas" (o nome técnico fica na dica) */
      const short = !it.isApp ? it.label.replace(/\s*\([^)]*\)\s*$/, '') || it.label : it.label;
      const row = K.el('div', { class: 'mb-app', role: 'listitem' },
        ic,
        K.el('span', { class: 'mb-app-name' },
          K.el('span', { class: 'mb-app-n' }, short),
          it.note ? K.el('span', { class: 'mb-app-note' }, it.note) : null),
        K.el('span', { class: 'mb-bar', 'aria-hidden': 'true' }, fill),
        K.el('span', { class: 'mb-app-v num' }, K.fmt.num(it.value, it.value < 10 ? 1 : 0)));
      row.title = `${it.label}${it.note ? ' (' + it.note + ')' : ''}: impacto ${K.fmt.num(it.value, 1)}`;
      box.appendChild(row);
    }
    /* nome comprido não perde espaço pra etiqueta: se não couber, a etiqueta sai (ela continua na dica) */
    for (const n of box.querySelectorAll('.mb-app-n')) {
      const note = n.nextElementSibling;
      if (note && n.scrollWidth > n.clientWidth + 1) note.hidden = true;
    }
    box.setAttribute('role', 'list');
  }

  /* ---------- atalhos ---------- */

  function actions(m) {
    const logo = K.el('span', { class: 'mb-logo', html: K.logo().replace(/#fff/g, '#000') });
    const c = K.el('nav', { class: 'mb-actions pop-in', 'aria-label': 'Atalhos' },
      K.el('button', { class: 'btn gold mb-open', type: 'button', onclick: () => show(null) }, logo, 'Abrir o Kamurafy'),
      K.el('button', { class: 'btn mb-act', type: 'button', html: K.icon('scan'), title: 'Abre o Kamurafy na Varredura, pra olhar o Mac inteiro', onclick: () => show('inicio') }, 'Escanear'),
      K.el('button', { class: 'btn mb-act', type: 'button', html: K.icon('broom'), title: 'Abre a Faxina: você vê tudo antes e escolhe o que vai pra Lixeira', onclick: () => show('faxina') }, 'Faxina'));
    c.style.animationDelay = '230ms';
    return c;
  }

  /* ---------- ajustes rápidos ---------- */

  function option(o) {
    const sw = K.el('button', { class: 'switch mb-switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': o.title });
    const sub = K.el('span', { class: 'mb-opt-sub' }, o.sub);
    const extra = K.el('span', { class: 'mb-opt-extra', hidden: true });
    const row = K.el('div', { class: 'mb-opt' },
      K.el('div', { class: 'mb-opt-tx' }, K.el('span', { class: 'mb-opt-t' }, o.title), sub, extra),
      sw);
    sw.addEventListener('click', () => { if (!sw.disabled && !sw.dataset.busy) o.onflip(sw.getAttribute('aria-checked') !== 'true'); });
    return { row, sw, sub, extra, base: o.sub };
  }

  function setSwitch(opt, on, disabled) {
    opt.sw.setAttribute('aria-checked', on ? 'true' : 'false');
    opt.sw.disabled = !!disabled;
  }

  /** linha extra embaixo do texto: aviso (erro) ou um botão pros Ajustes do Sistema */
  function optExtra(opt, kind, text, withSettings) {
    const linkText = typeof withSettings === 'string' ? withSettings : 'Abrir os Ajustes do Sistema';
    opt.extra.textContent = '';
    opt.extra.hidden = !text && !withSettings;
    opt.extra.className = 'mb-opt-extra' + (kind ? ' ' + kind : '');
    if (opt.extra.hidden) return;
    if (kind === 'err' || kind === 'warn') opt.extra.appendChild(K.el('span', { class: 'mb-opt-eic', html: K.icon(kind === 'err' ? 'alert' : 'eye') }));
    if (text) opt.extra.appendChild(K.el('span', null, text));
    if (withSettings) {
      opt.extra.appendChild(K.el('button', { class: 'mb-link', type: 'button',
        onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'itens-login' }).catch((e) => console.warn('open.settings: ' + e.message)); } },
      linkText, K.el('span', { html: K.icon('mbGo') })));
    }
  }

  /** erro da ponte numa frase curta (sem caminho nem texto técnico enorme) */
  function why(e) {
    let t = String((e && e.message) || e || '').trim();
    if (t.length > 90) t = t.slice(0, 88).replace(/\s+\S*$/, '') + '…';
    return t ? 'Não deu pra mudar agora. ' + t : 'Não deu pra mudar agora.';
  }

  function settingsCard(m) {
    const flipSetting = (opt, key) => async (on) => {
      const before = !on;
      setSwitch(opt, on);
      opt.sw.dataset.busy = '1';
      optExtra(opt, null, '');
      K.sound.plop();
      try {
        const s = await K.api('settings.set', { [key]: on });
        if (!alive(m)) return;
        setSwitch(opt, !!(s && s[key]));
      } catch (e) {
        if (!alive(m)) return;
        setSwitch(opt, before);
        optExtra(opt, 'err', why(e));
        K.sound.oops();
      } finally { delete opt.sw.dataset.busy; if (alive(m)) paintSum(m); }
    };

    m.optPct = option({ title: 'Mostrar a % na barra', sub: 'A carga ao lado do ícone, lá em cima.',
      onflip: (on) => m.optPct.flip(on) });
    m.optPct.flip = flipSetting(m.optPct, 'porcentagemNaBarra');

    m.optBar = option({ title: 'Ficar só na barra', sub: 'Ao fechar a janela, ele sai do Dock.',
      onflip: (on) => m.optBar.flip(on) });
    m.optBar.flip = flipSetting(m.optBar, 'soNaBarra');

    m.optLogin = option({ title: 'Abrir junto com o Mac', sub: 'Liga sozinho quando você entra na conta.',
      onflip: (on) => flipLogin(m, on) });

    for (const o of [m.optPct, m.optBar, m.optLogin]) setSwitch(o, false, true);

    /* fechado por padrão: o balão é pra olhar rápido; abrir aumenta a altura (menubar.resize) */
    m.setSum = K.el('span', { class: 'mb-set-sum' });
    const all = K.el('button', { class: 'mb-link mb-set-all', type: 'button', onclick: () => show('ajustes') },
      'Todos os ajustes (avisos, som…)', K.el('span', { html: K.icon('mbGo') }));
    m.setBody = K.el('div', { class: 'mb-set-body', id: 'mb-set-body' }, m.optPct.row, m.optBar.row, m.optLogin.row, all);
    m.setHead = K.el('button', { class: 'mb-set-head', type: 'button', 'aria-controls': 'mb-set-body',
      onclick: () => { K.sound.plop(); setOpen(m, !setOpenPref, true); } },
      K.el('span', { class: 'mb-set-ic', html: K.icon('mbSliders') }),
      K.el('span', { class: 'mb-set-t', id: 'mb-set-t' }, 'Ajustes rápidos'),
      m.setSum,
      K.el('span', { class: 'mb-set-chev', html: K.icon('mbGo') }));
    m.setCard = K.el('section', { class: 'card mb-set pop-in', 'aria-labelledby': 'mb-set-t' }, m.setHead, m.setBody);
    m.setCard.style.animationDelay = '280ms';
    setOpen(m, setOpenPref);
    return m.setCard;
  }

  function setOpen(m, open, user) {
    setOpenPref = !!open;
    m.setHead.setAttribute('aria-expanded', String(setOpenPref));
    m.setCard.classList.toggle('open', setOpenPref);
    m.setBody.hidden = !setOpenPref;
    if (m.resize) m.resize();
    /* aberto passa da altura máxima do balão (700): rola até os ajustes ficarem à vista */
    if (user && setOpenPref) {
      setTimeout(() => {
        if (alive(m)) m.setCard.scrollIntoView({ block: 'nearest', behavior: snap() ? 'auto' : 'smooth' });
      }, 120);
    }
  }

  /** resumo na linha fechada: quantos estão ligados, ou o que pede atenção */
  function paintSum(m) {
    const sum = m.setSum;
    sum.textContent = '';
    sum.className = 'mb-set-sum';
    if (m.statusErr) { sum.append('sem leitura'); return; }
    if (m.loginState === 'precisa-aprovar') {
      sum.classList.add('warn');
      sum.append(K.el('span', { class: 'mb-opt-eic', html: K.icon('eye') }), 'falta aprovar');
      return;
    }
    const rows = [m.optPct, m.optBar, m.optLogin].filter((o) => !o.row.hidden);
    const on = rows.filter((o) => o.sw.getAttribute('aria-checked') === 'true').length;
    sum.append(`${on} de ${rows.length} ${on === 1 ? 'ligado' : 'ligados'}`);
  }

  function paintLogin(m, estado) {
    const o = m.optLogin;
    m.loginState = estado;
    if (estado === 'ligado') { setSwitch(o, true); setText(o.sub, o.base); optExtra(o, null, ''); }
    else if (estado === 'desligado') { setSwitch(o, false); setText(o.sub, o.base); optExtra(o, null, ''); }
    else if (estado === 'precisa-aprovar') {
      setSwitch(o, true);
      setText(o.sub, o.base);
      optExtra(o, 'warn', 'Falta você aprovar lá no macOS.', 'Aprovar nos Ajustes do Sistema');
    } else {
      setSwitch(o, false, true);
      setText(o.sub, 'O macOS não deixou ligar por aqui.');
      optExtra(o, null, '', 'Ligar nos Ajustes do Sistema');
    }
  }

  async function flipLogin(m, on) {
    const o = m.optLogin;
    const before = m.loginState;
    setSwitch(o, on);
    o.sw.dataset.busy = '1';
    optExtra(o, null, '');
    K.sound.plop();
    try {
      const st = await K.api('menubar.loginItem', { ligar: on });
      if (!alive(m)) return;
      paintLogin(m, st && st.abrirNoLogin);
    } catch (e) {
      if (!alive(m)) return;
      paintLogin(m, before);
      optExtra(o, 'err', why(e), before !== 'indisponivel');
      K.sound.oops();
    } finally { delete o.sw.dataset.busy; if (alive(m)) paintSum(m); }
  }

  function paintStatus(m, st) {
    if (!st) return;
    m.statusErr = false;
    if (!m.optPct.sw.dataset.busy) setSwitch(m.optPct, !!st.porcentagem);
    if (!m.optBar.sw.dataset.busy) setSwitch(m.optBar, !!st.soNaBarra);
    if (!m.optLogin.sw.dataset.busy) paintLogin(m, st.abrirNoLogin);
    paintSum(m);
  }

  function paintStatusError(m, e) {
    m.statusErr = true;
    for (const o of [m.optPct, m.optBar, m.optLogin]) setSwitch(o, false, true);
    optExtra(m.optLogin, 'err', 'Não consegui ler os ajustes agora. ' + ((e && e.message) || ''));
    paintSum(m);
  }

  /** "% na barra" só existe com bateria: o ícone do Mac de mesa não mostra número */
  function paintPctRow(m) {
    const hide = m.mode === 'desk';
    if (m.optPct.row.hidden !== hide) { m.optPct.row.hidden = hide; paintSum(m); }
  }

  /* ---------- rodapé ---------- */

  function footer(m) {
    m.ver = K.el('span', { class: 'mb-ver' }, 'Kamurafy');
    return K.el('footer', { class: 'mb-foot' },
      K.el('span', { class: 'mb-foot-brand' }, K.el('span', { class: 'mb-logo', html: K.logo().replace(/#fff/g, '#000') }), m.ver),
      K.el('span', { class: 'mb-foot-tip', title: 'Clique com o botão direito no ícone da bateria, lá em cima, e escolha “Sair do Kamurafy”.' },
        'Pra sair: botão direito no ícone.'));
  }

  function paintVersion(m, v) {
    if (!v || !v.version) return;
    setText(m.ver, `Kamurafy ${v.version}`);
    m.ver.title = `Versão ${v.version} (${v.build || '0'})`;
  }

  /* ================= dados ================= */

  async function tick(m) {
    if (m.ticking) return;
    m.ticking = true;
    try {
      const [b, s] = await Promise.allSettled([K.api('battery.now'), K.api('system.now')]);
      if (!alive(m)) return;
      if (b.status === 'fulfilled' && b.value) m.b = b.value;
      if (s.status === 'fulfilled' && s.value) m.s = s.value;
      const noBattery = b.status !== 'fulfilled' || !b.value || !b.value.present;
      if (noBattery && m.info === undefined) {
        m.info = await K.cached('battery.info', null, 600000).catch(() => null);
        if (!alive(m)) return;
      }
      paintHero(m, b.status === 'fulfilled' ? b.value : m.b);
      paintMinis(m);
      paintPctRow(m);
      m.first = false;
    } finally { m.ticking = false; }
  }

  async function loadApps(m, force) {
    if (m.appsBusy && !force) return m.appsBusy;
    const p = K.api('battery.energyApps', { limite: 8 })
      .then((list) => { if (alive(m)) paintApps(m, list); })
      .catch((e) => { if (alive(m)) paintApps(m, null, e); })
      .finally(() => { if (m.appsBusy === p) m.appsBusy = null; });
    m.appsBusy = p;
    return p;
  }

  async function loadStatus(m) {
    try {
      const st = await K.api('menubar.status');
      if (alive(m)) paintStatus(m, st);
    } catch (e) {
      if (alive(m)) paintStatusError(m, e);
    }
  }

  function startTimers(m) {
    clearInterval(m.liveTimer);
    clearInterval(m.appsTimer);
    m.liveTimer = setInterval(() => { if (alive(m) && canRun()) tick(m); }, LIVE_MS);
    m.appsTimer = setInterval(() => { if (alive(m) && canRun()) loadApps(m); }, APPS_MS);
  }

  /* ---------- altura do balão ---------- */

  function watchHeight(m) {
    let raf = 0;
    const send = () => {
      raf = 0;
      if (!alive(m)) return;
      const h = document.body.scrollHeight;
      if (h && h !== m.sentH) {
        m.sentH = h;
        K.api('menubar.resize', { altura: h }).catch(() => {});
      }
    };
    m.resize = () => { if (!raf) { raf = 1; K.charts.soon(send); } };
    if (window.ResizeObserver) {
      m.ro = new ResizeObserver(m.resize);
      m.ro.observe(K.$('#mb'));
    }
  }

  /* ================= início ================= */

  async function boot() {
    stop(M);
    const root = K.$('#mb');
    if (!root) return;
    root.textContent = '';
    K.tooltip.hide();
    if (!K.inApp) {
      root.appendChild(K.el('div', { class: 'empty' }, 'Abra pelo Kamurafy.app.'));
      return;
    }
    const m = M = { first: true, b: null, s: null, info: undefined, mode: null };
    build(m, root);
    watchHeight(m);

    K.api('settings.get').then((s) => {
      K.settings.value = s;
      K.sound.enabled = !!(s && s.som) && !snap();
    }).catch(() => { K.sound.enabled = false; });

    const version = K.api('app.version').then((v) => { if (alive(m)) paintVersion(m, v); }).catch(() => {});
    const apps = loadApps(m);
    await Promise.all([tick(m), loadStatus(m), version]);
    if (!alive(m)) return;
    m.resize();
    startTimers(m);

    /* o modo foto espera o app.ready: dá um tempinho pro "quem gasta" chegar antes */
    if (!readySent) {
      await Promise.race([apps, new Promise((r) => { m.readyTimer = setTimeout(r, READY_WAIT_MS); })]);
      if (!readySent) {
        readySent = true;
        if (M) M.resize && M.resize();
        K.api('app.ready').catch(() => {});
      }
    }
  }

  /** o Swift chama quando o balão abre: lê tudo de novo na hora */
  function refresh() {
    if (document.readyState === 'loading') return;   // o DOMContentLoaded já vai montar tudo
    const m = M;
    if (!m || m.dead) { boot(); return; }
    const now = Date.now();
    if (m.lastRefresh && now - m.lastRefresh < 400) return;
    m.lastRefresh = now;
    tick(m);
    loadApps(m);
    loadStatus(m);
    startTimers(m);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && M && !M.dead && !snap()) refresh();
  });

  K.menubar = { refresh };
  document.addEventListener('DOMContentLoaded', boot);
})();
