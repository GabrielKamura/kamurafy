/* Kamurafy — galeria de componentes (rota escondida #/galeria).
   Mostra cada gráfico e o mascote com dados de exemplo realistas e casos-limite,
   e no fim os mesmos componentes com dados reais desta máquina. É onde se testa. */
'use strict';

(function () {
  const DAY = 86400;
  let made = [];
  let timers = [];

  /* PRNG com seed: os exemplos saem iguais em toda foto */
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const keep = (x) => { made.push(x); return x; };
  const every = (ms, fn) => { timers.push(setInterval(fn, ms)); };

  /* ---------- dados de exemplo ---------- */

  /** 7 dias de carga: acordado a cada 5 min, dormindo à noite (buraco), na tomada em alguns trechos */
  function fakeCharge(now) {
    const rnd = prng(42);
    const pts = [];
    let pct = 64;
    const start = now - 7 * DAY;
    for (let t = start; t <= now; t += 300) {
      const d = new Date(t * 1000);
      const h = d.getHours() + d.getMinutes() / 60;
      const dia = d.getDay();
      const dormindo = (h >= 0.5 && h < 8) || (dia % 3 === 0 && h >= 12.5 && h < 13.6);
      const tomada = (h >= 9.5 && h < 12) || (h >= 19 && h < 23.2 && dia !== 5) || (dia === 0 && h >= 14 && h < 17);
      if (dormindo) {
        pct = tomada ? Math.min(100, pct + 2.5) : Math.max(5, pct - 0.05);
        continue;
      }
      if (tomada) pct = Math.min(100, pct + (pct < 80 ? 4 + rnd() : 0.9));
      else pct = Math.max(8, pct - (0.45 + rnd() * 0.6 + (h > 14 && h < 16 ? 0.5 : 0)));
      pts.push({ x: t, y: Math.round(pct), plugged: tomada });
    }
    return pts;
  }

  /** energia ao vivo: gastando na bateria, depois liga na tomada e passa a entrar */
  function fakeWatts(now, n) {
    const rnd = prng(7);
    const pts = [];
    for (let i = n - 1; i >= 0; i--) {
      const t = now - i * 2;
      const k = n - 1 - i;
      let w;
      if (k < n * 0.62) w = -(11 + rnd() * 5 + (k % 17 === 5 ? 16 : 0) + (k % 23 === 11 ? 9 : 0));
      else w = 58 - (k - n * 0.62) * 0.35 + rnd() * 4;
      pts.push({ x: t, y: Math.round(w * 10) / 10 });
    }
    return pts;
  }

  /** saúde: um ponto por dia (com dias faltando), oscilando ±1 ponto a cada recalibração */
  function fakeHealth(now) {
    const rnd = prng(3);
    const pts = [];
    for (let i = 200; i >= 0; i--) {
      if (i > 0 && rnd() < 0.35) continue;
      const base = 93.1 - (200 - i) * 0.0165;
      pts.push({ x: now - i * DAY, y: Math.round((base + (rnd() - 0.5) * 1.4) * 10) / 10 });
    }
    pts[pts.length - 1].y = 89.8;
    return pts;
  }

  function appIcon(bg, glyph) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="15" fill="${bg}"/><g fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  const ICONS = {
    web: appIcon('#e8622c', '<circle cx="32" cy="32" r="14"/><path d="M18 32h28M32 18c-6 8-6 20 0 28M32 18c6 8 6 20 0 28"/>'),
    chat: appIcon('#6b3fa0', '<path d="M18 22h28v16H30l-8 7v-7h-4Z"/>'),
    music: appIcon('#f0435a', '<path d="M27 42V22l16-4v20"/><circle cx="23" cy="42" r="4"/><circle cx="39" cy="38" r="4"/>'),
    photo: appIcon('#2f9be8', '<rect x="17" y="21" width="30" height="22" rx="4"/><circle cx="26" cy="29" r="3"/><path d="m20 41 9-8 6 5 4-3 7 6"/>'),
    kamu: appIcon('#ffd23f', '<circle cx="25" cy="30" r="1.5" stroke="#000"/><circle cx="39" cy="30" r="1.5" stroke="#000"/><path d="M25 38c4 4 10 4 14 0" stroke="#000"/>'),
    folder: appIcon('#3a86e0', '<path d="M17 24h11l3 4h16v14H17Z"/>'),
  };

  const wfmt = (v) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + K.fmt.watts(v);

  /* ---------- montagem ---------- */

  function section(root, id, title, sub) {
    const s = K.el('section', { class: 'gal-sec', id: 'gal-' + id },
      K.el('div', { class: 'gal-sec-head' }, K.el('h2', null, title), sub ? K.el('p', null, sub) : null));
    root.appendChild(s);
    return s;
  }
  function card(parent, title, sub, tag, cls) {
    const head = K.el('div', { class: 'card-head gal-head' },
      K.el('div', null, K.el('h3', null, title), sub ? K.el('div', { class: 'card-sub' }, sub) : null),
      tag ? K.el('code', { class: 'gal-tag' }, tag) : null);
    const c = K.el('div', { class: 'card gal-card ' + (cls || '') }, head);
    parent.appendChild(c);
    return c;
  }
  const box = (parent, cls) => { const b = K.el('div', { class: cls || 'gal-box' }); parent.appendChild(b); return b; };
  const grid = (parent, cols) => { const g = K.el('div', { class: `grid ${cols || 'cols-2'} gal-grid` }); parent.appendChild(g); return g; };

  /* ---------- mascote ---------- */

  const STATES = [
    { t: 'Carregando', s: '62% · saúde boa', st: { pct: 62, tone: 'good', charging: true, plugged: true } },
    { t: 'Cheia na tomada', s: '100% · dormindo', st: { pct: 100, tone: 'good', plugged: true, full: true } },
    { t: 'Na bateria', s: '71% · saudável', st: { pct: 71, tone: 'good' } },
    { t: 'Segurando em 80%', s: 'na tomada, sem carregar', st: { pct: 80, tone: 'good', plugged: true } },
    { t: 'De olho', s: '38% · saúde abaixo de 85%', st: { pct: 38, tone: 'warn' } },
    { t: 'Gasta', s: '22% · saúde abaixo de 80%', st: { pct: 22, tone: 'serious' } },
    { t: 'Hora de trocar', s: '9% · a Apple pede revisão', st: { pct: 9, tone: 'crit' } },
    { t: 'Com calor', s: '58% · 41 °C, carregando', st: { pct: 58, tone: 'good', charging: true, plugged: true, hot: true } },
    { t: 'Festa', s: 'face: "joy" (fim da varredura)', st: { pct: 86, tone: 'good', face: 'joy' } },
    { t: 'Sem leitura', s: 'pct: null (Mac de mesa)', st: { pct: null, tone: 'good' } },
  ];

  function mascotSection(root) {
    const sec = section(root, 'mascote', 'Mascote', 'K.mascot(el, {size}).set(estado) — a cor do líquido é a saúde; a altura é a carga.');
    const c1 = card(sec, 'Todos os estados', 'Rosto, raio, cabo e enfeites mudam sozinhos pelo estado.', 'K.mascot');
    const g = box(c1, 'gal-mascots');
    for (const e of STATES) {
      const cell = K.el('figure', { class: 'gal-m' });
      const holder = K.el('div', { class: 'gal-m-art' });
      cell.appendChild(holder);
      cell.appendChild(K.el('figcaption', null, K.el('b', null, e.t), K.el('span', null, e.s)));
      g.appendChild(cell);
      K.mascot(holder, { size: 132, state: e.st });
    }

    const c2 = card(sec, 'Tamanhos', 'De 64 px (cartão) a 320 px (tela da bateria). O traço engrossa proporcionalmente menos no grande.', '{size}');
    const row = box(c2, 'gal-sizes');
    for (const sz of [64, 96, 140, 200, 320]) {
      const f = K.el('figure', { class: 'gal-size' });
      const holder = K.el('div');
      f.appendChild(holder);
      f.appendChild(K.el('figcaption', null, sz + ' px'));
      row.appendChild(f);
      K.mascot(holder, { size: sz, state: { pct: 76, tone: 'good', charging: sz === 320, plugged: sz === 320 } });
    }

    /* brinquedo: mexe no estado e vê a transição */
    const c3 = card(sec, 'Brinque com os estados', 'Pra conferir as transições: líquido sobe e desce, rosto troca, raio entra com pulo.', 'm.set({...})');
    const wrap = box(c3, 'gal-play');
    const art = K.el('div', { class: 'gal-play-art' });
    wrap.appendChild(art);
    const m = K.mascot(art, { size: 260, state: { pct: 64, tone: 'good', charging: true, plugged: true } });
    const ctl = K.el('div', { class: 'gal-ctl' });
    wrap.appendChild(ctl);

    const pctOut = K.el('span', { class: 'gal-ctl-v' }, '64%');
    const range = K.el('input', { type: 'range', min: 0, max: 100, value: 64, class: 'gal-range', 'aria-label': 'Carga' });
    range.addEventListener('input', () => { pctOut.textContent = range.value + '%'; m.set({ pct: +range.value, full: +range.value >= 100 }); });
    ctl.appendChild(K.el('label', { class: 'gal-ctl-row' }, K.el('span', null, 'Carga'), range, pctOut));

    const tones = K.el('div', { class: 'gal-chips', role: 'group', 'aria-label': 'Saúde' });
    const toneList = [['good', 'Saudável'], ['warn', 'De olho'], ['serious', 'Gasta'], ['crit', 'Trocar']];
    const paintTones = (on) => { for (const b of tones.children) b.setAttribute('aria-pressed', String(b.dataset.tone === on)); };
    for (const [t, label] of toneList) {
      tones.appendChild(K.el('button', { class: 'btn small gal-chip', type: 'button', dataset: { tone: t }, onclick: () => { m.set({ tone: t }); paintTones(t); } }, label));
    }
    paintTones('good');
    ctl.appendChild(K.el('div', { class: 'gal-ctl-row' }, K.el('span', null, 'Saúde'), tones));

    const sw = (label, key, on) => {
      const b = K.el('button', { class: 'switch', role: 'switch', 'aria-checked': String(on), 'aria-label': label, type: 'button' });
      b.addEventListener('click', () => {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v));
        const patch = {}; patch[key] = v;
        if (key === 'charging' && v) patch.plugged = true;
        m.set(patch);
      });
      return K.el('div', { class: 'setting' }, K.el('div', { class: 'setting-text' }, K.el('b', null, label)), b);
    };
    ctl.appendChild(sw('Carregando', 'charging', true));
    ctl.appendChild(sw('Na tomada', 'plugged', true));
    ctl.appendChild(sw('Quente (≥ 40 °C)', 'hot', false));

    const faces = K.el('div', { class: 'gal-chips' });
    const FACES = [['auto', 'automático'], ['happy', 'feliz'], ['worried', 'preocupado'], ['sad', 'triste'], ['cry', 'chorando'], ['sleep', 'dormindo'], ['hot', 'com calor'], ['joy', 'festa']];
    for (const [f, nome] of FACES) {
      faces.appendChild(K.el('button', { class: 'btn small gal-chip', type: 'button', title: f, onclick: () => m.set({ face: f === 'auto' ? null : f }) }, nome));
    }
    ctl.appendChild(K.el('div', { class: 'gal-ctl-row top' }, K.el('span', null, 'Rosto'), faces));
  }

  /* ---------- linha e área ---------- */

  function lineSection(root, now) {
    const sec = section(root, 'linhas', 'Linha e área', 'K.charts.area / K.charts.line — crosshair que gruda no ponto, rótulo no último ponto, "ver números".');

    const c1 = card(sec, 'Carga · últimos 7 dias', 'Centenas de pontos, buracos quando o Mac dormiu e fita dourada embaixo quando esteve na tomada.', 'K.charts.area');
    const carga = fakeCharge(now);
    keep(K.charts.area(box(c1), {
      name: 'Carga',
      points: carga,
      yMin: 0, yMax: 100,
      yFormat: (v) => K.fmt.pct(v, 0),
      xMin: now - 7 * DAY, xMax: now,
      bands: K.charts.runs(carga, (p) => p.plugged, { x: 'x', label: 'Na tomada' }),
      bandStyle: 'track',
      refs: [{ y: 80, label: '80%' }],
      height: 240,
      gap: 1800,
      gapLabel: 'Mac dormindo',
    }));

    const g = grid(sec, 'cols-2');
    const c2 = card(g, 'Energia ao vivo', 'Watts a cada 2 s. Abaixo de zero, a bateria está gastando.', 'K.charts.line');
    let watts = fakeWatts(now, 90);
    const live = keep(K.charts.line(box(c2), {
      name: 'Energia',
      points: watts,
      color: 'var(--s2)',
      yZero: true,
      yFormat: (v) => (v > 0 ? '+' : '') + K.charts.num(v, 0) + ' W',
      tipFormat: wfmt,
      xFormat: 'ago',
      signs: ['entrando', 'saindo'],
      height: 200,
      table: { xLabel: 'Quando' },
    }));
    if (!document.documentElement.classList.contains('snap')) {
      const rnd = prng(99);
      every(2000, () => {
        const last = watts[watts.length - 1];
        const t = last.x + 2;
        const y = Math.round((last.y + (rnd() - 0.52) * 3) * 10) / 10;
        watts = watts.slice(1).concat([{ x: t, y }]);
        live.update({ points: watts });
      });
    }

    const c3 = card(g, 'Saúde ao longo do tempo', 'Poucos pontos, linha de 80% e projeção tracejada.', 'K.charts.line');
    const saude = fakeHealth(now);
    const last = saude[saude.length - 1];
    const dias80 = Math.round((last.y - 80) / 0.0165);
    const quando = K.fmt.monthYear(now + dias80 * DAY);
    keep(K.charts.line(box(c3), {
      series: [
        { name: 'Saúde', points: saude, format: (v) => K.fmt.pct(v, 1) },
        { name: 'Projeção', points: [{ x: last.x, y: last.y }, { x: now + dias80 * DAY, y: 80 }], dash: true, endLabel: `~${quando}`, format: (v) => '≈ ' + K.fmt.pct(v, 0) },
      ],
      yFormat: (v) => K.fmt.pct(v, 0),
      yMin: 75, yMax: 100,
      refs: [{ y: 80, label: '80% · a Apple considera gasta abaixo disso' }],
      tipTitle: (x) => K.fmt.day(x) + ' ' + new Date(x * 1000).getFullYear(),
      height: 200,
    }));

    const c4 = card(g, 'Saúde · 1 ponto só', 'Primeiro dia de uso: um ponto e a referência.', 'caso-limite');
    keep(K.charts.line(box(c4), {
      name: 'Saúde',
      points: [{ x: now, y: 89.8 }],
      yFormat: (v) => K.fmt.pct(v, 0),
      tipFormat: (v) => K.fmt.pct(v, 1),
      refs: [{ y: 80, label: '80%' }],
      tipTitle: K.fmt.day,
      height: 180,
    }));

    const c5 = card(g, 'Sem dados', 'sem série nenhuma: aparece a mensagem de vazio', 'caso-limite');
    keep(K.charts.area(box(c5), { points: [], empty: 'Ainda sem histórico. O Kamurafy começa a anotar assim que fica aberto.' }));

    const c6 = card(g, 'Duas séries (número no eixo X)', 'Legenda sempre com 2+ séries; área só na primeira.', 'series: [...]');
    const rnd = prng(5);
    const a = [], b = [];
    for (let i = 0; i <= 30; i++) { a.push({ x: i, y: 40 + Math.sin(i / 4) * 18 + rnd() * 6 }); b.push({ x: i, y: 30 + Math.cos(i / 5) * 12 + rnd() * 5 }); }
    keep(K.charts.line(box(c6), {
      series: [{ name: 'Usuário', points: a, area: true }, { name: 'Sistema', points: b }],
      yZero: true,
      yFormat: (v) => K.fmt.pct(v, 0),
      xFormat: (v) => v + ' s',
      tipTitle: (v) => `segundo ${v}`,
      table: { xLabel: 'Segundo', order: 'asc' },
      height: 180,
    }));
  }

  /* ---------- barras ---------- */

  function barsSection(root) {
    const sec = section(root, 'barras', 'Barras', 'K.charts.bars — ícone do app, nome, valor na ponta, dica por barra.');
    const g = grid(sec, 'cols-2');
    const c1 = card(g, 'Quem mais gasta energia', 'Impacto energético (do Monitor de Atividade). Só compara entre si.', 'K.charts.bars', 'span-2');
    keep(K.charts.bars(box(c1), {
      items: [
        { label: 'Firefox', value: 85.5, icon: ICONS.web, note: '14 processos' },
        { label: 'Tela e janelas (WindowServer)', value: 35.5, note: 'do sistema' },
        { label: 'Slack', value: 21.2, icon: ICONS.chat, note: '5 processos' },
        { label: 'Fotos (analisando a biblioteca de fotos em segundo plano)', value: 12.8, icon: ICONS.photo },
        { label: 'Música', value: 6.4, icon: ICONS.music },
        { label: 'Kamurafy', value: 1.1, icon: ICONS.kamu },
        { label: 'Finder', value: 0.3, icon: ICONS.folder },
      ],
      color: 'var(--s2)',
      valueName: 'de impacto',
      table: true,
    }));
    const c2 = card(g, 'Lista vazia', 'lista vazia: aparece a mensagem de vazio', 'caso-limite');
    keep(K.charts.bars(box(c2), { items: [], empty: 'Nenhum app gastando energia de verdade agora. Tudo calmo.' }));
    const c3 = card(g, 'Sem ícones, poucas barras', 'Sem ícone nenhum, a coluna some.', 'caso-limite');
    keep(K.charts.bars(box(c3), {
      items: [{ label: 'Tela', value: 7.2 }, { label: 'Processador', value: 4.1 }, { label: 'Wi-Fi', value: 0.8 }],
      format: (v) => K.fmt.watts(v),
      valueName: 'em média',
    }));
  }

  /* ---------- mostradores, anéis, pilha, minilinhas ---------- */

  const CPU_ZONES = [
    { to: 60, tone: 'good', label: 'Tranquilo' },
    { to: 90, tone: 'warn', label: 'Trabalhando' },
    { to: 100, tone: 'serious', label: 'A todo vapor' },
  ];
  const HEALTH_ZONES = [
    { to: 80, tone: 'serious', label: 'Gasta' },
    { to: 85, tone: 'warn', label: 'De olho' },
    { to: 100, tone: 'good', label: 'Saudável' },
  ];

  function gaugeSection(root) {
    const sec = section(root, 'mostradores', 'Mostradores e anéis', 'K.charts.gauge (semicírculo com ponteiro) e K.charts.ring (anel de progresso).');
    const g = grid(sec, 'cols-4');
    const c1 = card(g, 'CPU', null, 'gauge');
    keep(K.charts.gauge(box(c1), { value: 10.4, zones: CPU_ZONES, label: 'uso de CPU' }));
    const c2 = card(g, 'CPU no talo', null, 'gauge');
    const hot = keep(K.charts.gauge(box(c2), { value: 92, zones: CPU_ZONES, label: 'uso de CPU' }));
    const c3 = card(g, 'Saúde', null, 'gauge');
    keep(K.charts.gauge(box(c3), { value: 89.8, min: 60, max: 100, zones: HEALTH_ZONES, format: (v) => K.fmt.pct(v, 1), endFormat: (v) => v + '%', label: 'da capacidade de fábrica' }));
    const c4 = card(g, 'Sem leitura', null, 'value: null');
    keep(K.charts.gauge(box(c4), { value: null, zones: CPU_ZONES, label: 'uso de CPU', empty: 'Ainda medindo…' }));
    if (!document.documentElement.classList.contains('snap')) {
      let k = 0;
      every(2600, () => { k++; hot.update({ value: k % 2 ? 67 : 92 }); });
    }

    const g2 = grid(sec, 'cols-4');
    const r1 = card(g2, 'Disco', null, 'ring');
    keep(K.charts.ring(box(r1), { value: 96.1, max: 500, tone: 's1', label: 'ocupado', sub: '96,1 GB de 500 GB' }));
    const r2 = card(g2, 'Varredura', null, 'ring');
    const scan = keep(K.charts.ring(box(r2), { value: 64, tone: 'gold', label: 'varrendo', sub: 'Olhando os caches…' }));
    const r3 = card(g2, 'Sem progresso conhecido', null, 'busy: true');
    keep(K.charts.ring(box(r3), { value: null, busy: true, text: '…', label: 'procurando', sub: 'Isso leva uns segundos' }));
    const r4 = card(g2, 'Pequenos', null, 'size: 84');
    const row = box(r4, 'gal-rings');
    keep(K.charts.ring(box(row, 'gal-ring'), { value: 88, tone: 'good', size: 84 }));
    keep(K.charts.ring(box(row, 'gal-ring'), { value: 96, tone: 'crit', size: 84 }));
    if (!document.documentElement.classList.contains('snap')) {
      let v = 64;
      every(1200, () => { v = v >= 100 ? 0 : Math.min(100, v + 7); scan.update({ value: v, label: v >= 100 ? 'pronto!' : 'varrendo' }); });
    }
  }

  function stackSection(root) {
    const sec = section(root, 'pilha', 'Barra empilhada e minilinhas', 'K.charts.stack (memória, disco) e K.charts.spark (tendência nos cartões).');
    const c1 = card(sec, 'Memória', '16 GB no total. O cache o macOS devolve sozinho quando precisa.', 'K.charts.stack');
    const GB = 1e9;
    keep(K.charts.stack(box(c1), {
      segments: [
        { name: 'Apps', value: 9.58 * GB, color: 'var(--s1)' },
        { name: 'Fixa', value: 2.76 * GB, color: '#4a3aa7', note: 'o sistema não solta' },
        { name: 'Comprimida', value: 0.72 * GB, color: 'var(--s2)' },
        { name: 'Cache', value: 3.40 * GB, color: '#1baf7a', note: 'devolvida quando precisar' },
        { name: 'Livre', value: 0.72 * GB, color: 'var(--panel)' },
      ],
      format: (v) => K.fmt.bytes(v),
      table: true,
    }));
    const g = grid(sec, 'cols-2');
    const c2 = card(g, 'Disco com resto automático', 'total maior que a soma + restName → sobra vira "Livre".', 'restName');
    keep(K.charts.stack(box(c2), {
      segments: [{ name: 'Apps e sistema', value: 61e9, color: 'var(--s1)' }, { name: 'Documentos', value: 35.1e9, color: 'var(--s2)' }],
      total: 500e9,
      restName: 'Livre',
      format: (v) => K.fmt.bytes(v),
    }));
    const c3 = card(g, 'Sem segmentos', null, 'caso-limite');
    keep(K.charts.stack(box(c3), { segments: [], empty: 'Não deu pra ler a memória agora.' }));

    const g2 = grid(sec, 'cols-4');
    const rnd = prng(11);
    const temp = Array.from({ length: 36 }, (_, i) => 30 + Math.sin(i / 5) * 2 + rnd() * 1.2);
    const wts = Array.from({ length: 36 }, (_, i) => -(9 + rnd() * 6 + (i === 22 ? 14 : 0)));
    const cpu = Array.from({ length: 36 }, (_, i) => 6 + rnd() * 18 + (i > 28 ? 30 : 0));
    const tile = (parent, label, value, sub, vals, o) => {
      const c = K.el('div', { class: 'card gal-tile' },
        K.el('div', { class: 'stat-label' }, label),
        K.el('div', { class: 'stat-value' }, value),
        sub ? K.el('div', { class: 'stat-sub' }, sub) : null);
      const b = K.el('div', { class: 'gal-spark' });
      c.appendChild(b);
      parent.appendChild(c);
      keep(K.charts.spark(b, vals, o));
    };
    tile(g2, 'Temperatura', '31,1 °C', 'última hora', temp, { format: (v) => K.fmt.temp(v), color: 'var(--s2)' });
    tile(g2, 'Energia', '−12 W', 'gastando', wts, { format: wfmt, color: 'var(--s2)', ref: 0, area: false });
    tile(g2, 'CPU', '41%', 'subiu agora', cpu, { format: (v) => K.fmt.pct(v, 0), min: 0, max: 100 });
    tile(g2, 'Um valor só', '88%', 'caso-limite', [88], { format: (v) => K.fmt.pct(v, 0) });
  }

  /* ---------- com dados desta máquina ---------- */

  function realSection(root) {
    const sec = section(root, 'reais', 'Com dados desta máquina', 'Os mesmos componentes lendo o Mac de verdade (pode levar uns segundos).');
    const g = grid(sec, 'cols-2');
    const cm = card(g, 'Agora', null, 'battery.now');
    const mBox = box(cm, 'gal-real-m');
    const mTxt = K.el('div', { class: 'gal-real-t loading' }, 'Lendo a bateria…');
    cm.appendChild(mTxt);
    const cc = card(g, 'Uso de CPU', null, 'system.now');
    const cpuBox = box(cc);
    cpuBox.appendChild(K.el('div', { class: 'loading' }, 'Medindo…'));

    const c1 = card(sec, 'Carga · últimos 7 dias (real)', null, 'battery.history');
    const hBox = box(c1);
    hBox.appendChild(K.el('div', { class: 'loading' }, 'Lendo o histórico do macOS…'));
    const g2 = grid(sec, 'cols-2');
    const c2 = card(g2, 'Quem gasta energia (real)', null, 'battery.energyApps');
    const eBox = box(c2);
    eBox.appendChild(K.el('div', { class: 'loading' }, 'Olhando os apps…'));
    const c3 = card(g2, 'Memória (real)', null, 'system.now');
    const memBox = box(c3);
    memBox.appendChild(K.el('div', { class: 'loading' }, 'Lendo…'));

    const fail = (el, e) => { el.textContent = ''; el.appendChild(K.el('div', { class: 'error-box' }, 'Não deu pra ler: ' + (e && e.message || e))); };

    K.cached('battery.now', null, 4000).then((b) => {
      mTxt.classList.remove('loading');
      if (!b || !b.present) {
        K.mascot(mBox, { size: 180, state: { pct: null, plugged: true } });
        mTxt.textContent = 'Este Mac não tem bateria.';
        return;
      }
      const st = K.batteryStatus[b.status] || K.batteryStatus.saudavel;
      const full = b.pluggedIn && !b.isCharging && b.percent >= 99;
      keep(K.mascot(mBox, { size: 180, state: { pct: b.percent, tone: st.tone, charging: b.isCharging, plugged: b.pluggedIn, full, hot: b.temperatureC >= 40 } }));
      mTxt.textContent = `${K.fmt.pct(b.percent, 0)} · saúde ${K.fmt.pct(b.healthPct)} · ${b.isCharging ? 'carregando' : b.pluggedIn ? 'na tomada' : 'na bateria'} · ${K.fmt.temp(b.temperatureC)}`;
    }).catch((e) => fail(mBox, e));

    K.api('system.now').then((s) => {
      cpuBox.textContent = '';
      keep(K.charts.gauge(cpuBox, { value: s.cpu && s.cpu.usagePct, zones: CPU_ZONES, label: 'uso de CPU' }));
      const m = s.memory || {};
      memBox.textContent = '';
      keep(K.charts.stack(memBox, {
        segments: [
          { name: 'Apps', value: m.appBytes, color: 'var(--s1)' },
          { name: 'Fixa', value: m.wiredBytes, color: '#4a3aa7' },
          { name: 'Comprimida', value: m.compressedBytes, color: 'var(--s2)' },
          { name: 'Cache', value: m.cachedBytes, color: '#1baf7a' },
          { name: 'Livre', value: m.freeBytes, color: 'var(--panel)' },
        ],
        total: m.totalBytes,
        restName: 'Outros',
        format: (v) => K.fmt.bytes(v),
      }));
    }).catch((e) => { fail(cpuBox, e); fail(memBox, e); });

    K.api('battery.history', { dias: 7 }).then((h) => {
      hBox.textContent = '';
      const now = Date.now() / 1000;
      const carga = (h && h.carga) || [];
      keep(K.charts.area(hBox, {
        name: 'Carga',
        points: carga.map((p) => ({ x: p.t, y: p.pct })),
        yMin: 0, yMax: 100,
        yFormat: (v) => K.fmt.pct(v, 0),
        xMin: now - 7 * DAY, xMax: now,
        bands: K.charts.runs(carga, (p) => p.plugged, { label: 'Na tomada' }),
        height: 240,
        gapLabel: 'sem leitura (Mac dormindo)',
        empty: 'O macOS ainda não tem histórico de carga pra mostrar.',
      }));
    }).catch((e) => fail(hBox, e));

    K.api('battery.energyApps', { limite: 8 }).then((list) => {
      eBox.textContent = '';
      keep(K.charts.bars(eBox, {
        items: (list || []).map((a) => ({ label: a.name, value: a.power, icon: a.icon, note: a.isApp ? null : 'do sistema' })),
        color: 'var(--s2)',
        valueName: 'de impacto',
        empty: 'Nenhum app gastando energia de verdade agora.',
      }));
    }).catch((e) => fail(eBox, e));
  }

  K.pages.galeria = {
    title: 'Galeria de componentes',
    async render(el) {
      made = [];
      timers = [];
      const now = Math.floor(Date.now() / 1000);
      el.appendChild(K.el('header', { class: 'page-head', 'data-drag': true },
        K.el('div', null,
          K.el('h1', null, 'Galeria'),
          K.el('p', null, 'Os gráficos e o mascote com dados de exemplo e casos-limite. Não aparece no menu.'))));

      const nav = K.el('nav', { class: 'gal-nav', 'aria-label': 'Seções da galeria' });
      for (const [id, label] of [['mascote', 'Mascote'], ['linhas', 'Linha e área'], ['barras', 'Barras'], ['mostradores', 'Mostradores'], ['pilha', 'Pilha e minilinhas'], ['reais', 'Dados reais']]) {
        nav.appendChild(K.el('button', { class: 'btn small', type: 'button', onclick: () => { const s = document.getElementById('gal-' + id); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, label));
      }
      el.appendChild(nav);

      mascotSection(el);
      lineSection(el, now);
      barsSection(el);
      gaugeSection(el);
      stackSection(el);
      realSection(el);
    },
    destroy() {
      for (const t of timers) clearInterval(t);
      for (const m of made) { try { m.destroy(); } catch (e) { /* já foi */ } }
      made = [];
      timers = [];
    },
  };
})();
