/* Kamurafy — página Bateria (#/bateria), a tela estrela do app.
   Herói (mascote + saúde), quatro blocos (ciclos, temperatura, energia, previsão), energia ao
   vivo, células, carga dos últimos 7 dias, saúde ao longo do tempo, quem mais gasta, avisos e
   cuidados. Dados: battery.now (a cada 2 s), battery.info, battery.history (uma vez, ~4 s),
   battery.energyApps (a cada 20 s), settings.* — contrato em docs/ponte.md.
   render() resolve assim que o herói e os blocos desenharam com a leitura de agora; histórico
   e apps chegam depois, cada um no seu cartão. */
'use strict';

(function () {
  const DAY = 86400;
  const LIVE_MS = 2000;
  const APPS_MS = 20000;
  const LIVE_POINTS = 90;            // 3 min de amostras a cada 2 s
  const LIMITES = [70, 75, 80, 85, 90];

  /* ícones só desta tela (mesmo traço do icons.js) */
  Object.assign(K.ICONS, {
    btUp: '<path d="M12 19.5V5M6.5 10.5 12 5l5.5 5.5"/>',
    btDown: '<path d="M12 4.5V19M6.5 13.5 12 19l5.5-5.5"/>',
    btSteady: '<path d="M5 9.5h14M5 14.5h14"/>',
    btCalendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    btSun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    btTarget: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    btWrench: '<path d="M14.5 4.2a4.8 4.8 0 0 0-5.8 6.3L3.8 15.4a2.1 2.1 0 0 0 3 3l4.9-4.9a4.8 4.8 0 0 0 6.3-5.8l-2.9 2.9-2.8-.5-.5-2.8Z"/>',
    btShield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/>',
    btLaptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="2"/><path d="M2.5 19h19"/>',
    btWave: '<path d="M2.5 12h3l2.5-6 4 12 3-9 2 3h4.5"/>',
  });

  let P = null;   // estado da tela montada (null = desmontada)

  /* ================= utilidades ================= */

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snap = () => document.documentElement.classList.contains('snap');
  const icon = (n) => K.el('span', { class: 'bt-ic', html: K.icon(n) });
  const setText = (node, txt) => { if (node.textContent !== txt) node.textContent = txt; };

  /** watts sem sinal, com o sentido em palavras: "7,7 W entrando", "12 W saindo" */
  function wattsTxt(w) {
    if (!isNum(w)) return 'sem leitura';
    if (Math.abs(w) < 0.05) return '0 W';
    return K.fmt.watts(w) + (w > 0 ? ' entrando' : ' saindo');
  }
  const hoursTxt = (s) => {
    if (!isNum(s) || s < 60) return '0 min';
    return K.fmt.duration(s);
  };

  /** número com contagem animada só na primeira vez; sem valor vira "sem leitura" apagado */
  function countTo(node, v, fmt, first) {
    if (!isNum(v)) { K.readOr(node, null); return; }
    node.classList.remove('no-read');
    if (first) K.countUp(node, v, fmt);
    else setText(node, fmt(v));
  }

  const statusOf = (b) => K.batStatus(b);

  /* ---------- faixas e regras ---------- */

  const TEMP_MIN = 20, TEMP_MAX = 50;
  const TEMP = [
    { from: TEMP_MIN, to: 35, tone: 'good', label: 'Tranquila', icon: 'check', txt: 'Abaixo de 35 °C é o ideal: é assim que a bateria dura mais.' },
    { from: 35, to: 40, tone: 'warn', label: 'Morna', icon: 'eye', txt: 'Normal com o Mac trabalhando. Se ficar assim o tempo todo, veja quem está gastando.' },
    { from: 40, to: 45, tone: 'serious', label: 'Quente', icon: 'flame', txt: 'Calor acelera o desgaste. Deixe o Mac respirar e feche o que estiver pesado.' },
    { from: 45, to: TEMP_MAX, tone: 'crit', label: 'Muito quente', icon: 'alert', txt: 'Quente demais pra bateria. Tire de cima de almofada ou cobertor e deixe esfriar.' },
  ];
  const tempZone = (t) => (isNum(t) ? TEMP.find((z) => t < z.to) || TEMP[TEMP.length - 1] : null);

  function cellVerdict(spread) {
    if (!isNum(spread)) return null;
    if (spread <= 20) return { tone: 'good', icon: 'check', label: 'Equilibradas', txt: 'As células estão parelhas, como numa bateria saudável.' };
    if (spread <= 50) return { tone: 'warn', icon: 'eye', label: 'Leve diferença', txt: 'Uma célula está um pouco atrás. Costuma diminuir depois de uma carga completa, quando o chip da bateria equilibra as células.' };
    return { tone: 'serious', icon: 'alert', label: 'Desequilibradas', txt: 'Uma célula está bem diferente das outras, e isso faz a carga acabar antes da hora. Se continuar assim por dias, vale uma revisão.' };
  }

  const APPLE = {
    normal: { tone: 'good', icon: 'btShield', label: 'Normal', txt: 'O macOS não vê problema nenhum.' },
    revisao: { tone: 'crit', icon: 'alert', label: 'Revisão recomendada', txt: 'O próprio macOS sugere levar pra revisão.' },
    falha: { tone: 'crit', icon: 'alert', label: 'Falha registrada', txt: 'O chip da bateria registrou uma falha permanente.' },
  };

  /** o que a bateria está fazendo agora, em uma linha */
  function stateOf(b) {
    const pct = b.percent;
    const hot = isNum(b.temperatureC) && b.temperatureC >= 40;
    let r;
    if (b.isCharging == null && b.pluggedIn == null) {
      /* o Mac não disse se está na tomada: não dá pra afirmar "na bateria" */
      r = { key: 'unknown', icon: 'info', title: 'Tomada sem leitura', sub: 'o Mac não informou agora', bubble: '' };
    } else if (b.isCharging) {
      let t;
      if (b.optimizedChargingEngaged) t = 'no ritmo otimizado do macOS';
      else if (isNum(b.minutesToFull) && b.minutesToFull > 0) t = `cheia em ${K.fmt.mins(b.minutesToFull)}`;
      else if (b.finishingCharge) t = 'terminando devagar';
      else t = 'calculando o tempo…';
      r = { key: 'charging', icon: 'bolt', title: 'Carregando', sub: t, bubble: 'Enchendo o tanque!' };
    } else if (b.pluggedIn) {
      if (b.fullyCharged || (isNum(pct) && pct >= 99)) r = { key: 'full', icon: 'moon', title: 'Cheia e na tomada', sub: 'descansando', bubble: 'Zzz… tô cheia.' };
      else if (b.optimizedChargingEngaged) r = { key: 'held', icon: 'plug', title: 'Na tomada', sub: 'o macOS segurou a carga', bubble: 'Segurando aqui.' };
      else r = { key: 'plugged', icon: 'plug', title: 'Na tomada', sub: 'sem carregar agora', bubble: 'Só descansando.' };
    } else {
      const m = isNum(b.minutesToEmpty) && b.minutesToEmpty > 0 && b.minutesToEmpty < 48 * 60 ? b.minutesToEmpty : null;
      r = { key: 'battery', icon: 'battery', title: 'Na bateria', sub: m ? `dura mais ${K.fmt.mins(m)}` : 'calculando quanto dura…', bubble: isNum(pct) && pct <= 20 ? 'Tô ficando fraquinha…' : 'Tô firme!' };
    }
    const sk = K.batStatusKey(b);
    if (hot) { r.sub += ' · quente'; r.bubble = 'Ufa, que calor!'; }
    else if (sk === 'trocar') r.bubble = 'Tô pedindo revisão.';
    else if (sk === 'gasta' && r.key !== 'full') r.bubble = 'Já guardo menos que antes.';
    else if (sk === 'desconhecida' && r.key !== 'charging') r.bubble = 'Não consegui medir minha saúde.';
    r.text = r.title + ' · ' + r.sub;
    return r;
  }

  /** previsão local enquanto o histórico não chega (mesma conta do Swift) */
  function localProjection(b) {
    const h = b.healthPct, c = b.cycles;
    if (!isNum(h) || !isNum(c) || c <= 0 || h >= 100) return { method: 'sem-dados' };
    const wear = (100 - h) / c;
    if (!(wear > 0)) return { method: 'sem-dados' };
    return { method: 'ciclos', cyclesTo80: h > 80 ? Math.round((h - 80) / wear) : 0, wearPerCycle: Math.round(wear * 10000) / 10000, dateTo80: null, local: true };
  }

  /* ================= montagem ================= */

  function card(cls, delay) {
    const c = K.el('section', { class: 'card bt-card pop-in ' + (cls || '') });
    c.style.animationDelay = (delay || 0) + 'ms';
    return c;
  }
  function head(iconName, title, sub, side) {
    return K.el('div', { class: 'card-head bt-chead' },
      K.el('div', { class: 'bt-chead-main' },
        K.el('span', { class: 'head-ic', html: K.icon(iconName) }),
        K.el('div', { class: 'bt-chead-t' },
          K.el('h2', null, title),
          sub ? K.el('div', { class: 'card-sub' }, sub) : null)),
      side || null);
  }
  const keep = (p, ch) => { p.charts.push(ch); return ch; };

  /* ---------- cabeçalho ---------- */
  function pageHead(p, info) {
    p.liveText = K.el('span', null, 'Ao vivo');
    const live = K.el('span', { class: 'live-badge', role: 'status', title: 'Lendo a bateria a cada 2 segundos' }, K.el('i', { class: 'live-dot' }), p.liveText);
    p.liveBadge = live;
    const side = K.el('div', { class: 'bt-head-side' });
    if (info && info.model) side.appendChild(K.el('span', { class: 'sticker bt-model', title: info.model }, K.fmt.model(info.model)));
    side.appendChild(live);
    return K.el('header', { class: 'page-head bt-head', 'data-drag': true },
      K.el('div', null,
        K.el('h1', null, 'Bateria'),
        K.el('p', null, 'Como ela está, quanto aguenta e o que fazer pra durar mais.')),
      side);
  }

  /* ---------- fichas de seção (grudam no topo ao rolar) ---------- */
  const SECTIONS = [
    { id: 'resumo', label: 'Resumo', icon: 'heart' },
    { id: 'ao-vivo', label: 'Ao vivo', icon: 'btWave' },
    { id: 'historico', label: 'Histórico', icon: 'chart' },
    { id: 'avisos', label: 'Avisos', icon: 'bell' },
    { id: 'cuidados', label: 'Cuidados', icon: 'leaf' },
  ];

  function view() { return document.getElementById('view'); }

  /** rola a tela até a seção, descontando a faixa das fichas */
  function scrollToSection(p, id, smooth) {
    const el = p.el.querySelector(`[data-secao="${id}"]`);
    const v = view();
    if (!el || !v) return;
    const bar = p.nav ? p.nav.offsetHeight : 0;
    const top = v.scrollTop + el.getBoundingClientRect().top - v.getBoundingClientRect().top - bar - 14;
    v.scrollTo({ top: Math.max(0, top), behavior: smooth && !snap() ? 'smooth' : 'auto' });
  }

  function sectionNav(p) {
    const bar = K.el('nav', { class: 'bt-nav', 'aria-label': 'Partes da tela' });
    const btns = {};
    for (const sc of SECTIONS) {
      btns[sc.id] = K.el('button', { class: 'btn small bt-navbtn', type: 'button', html: K.icon(sc.icon),
        onclick: () => { K.sound.plop(); mark(sc.id); p.navLock = Date.now() + 700; scrollToSection(p, sc.id, true); } }, sc.label);
      bar.appendChild(btns[sc.id]);
    }
    function mark(id) {
      for (const k in btns) {
        btns[k].classList.toggle('on', k === id);
        if (k === id) btns[k].setAttribute('aria-current', 'true'); else btns[k].removeAttribute('aria-current');
      }
    }
    /* a ficha acesa acompanha a rolagem */
    let raf = 0;
    const onScroll = () => {
      if (raf || (p.navLock && Date.now() < p.navLock)) return;
      raf = 1;
      K.charts.soon(() => {
        raf = 0;
        const v = view();
        if (!v || !p.alive) return;
        const lim = v.getBoundingClientRect().top + bar.offsetHeight + 60;
        let cur = SECTIONS[0].id;
        for (const sc of SECTIONS) {
          const el = p.el.querySelector(`[data-secao="${sc.id}"]`);
          if (el && el.getBoundingClientRect().top <= lim) cur = sc.id;
        }
        if (v.scrollTop + v.clientHeight >= v.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id;
        mark(cur);
      });
    };
    const v = view();
    if (v) { v.addEventListener('scroll', onScroll, { passive: true }); p.offScroll = () => v.removeEventListener('scroll', onScroll); }
    mark(SECTIONS[0].id);
    p.nav = bar;
    return bar;
  }

  /* ---------- herói: mascote + saúde ---------- */
  function heroPart(p, b) {
    const c = card('bt-hero', 0);
    const bubble = K.el('div', { class: 'bt-bubble', 'aria-hidden': 'true' });
    const mBox = K.el('div', { class: 'bt-mascot' });
    const chargeN = K.el('span', { class: 'bt-charge-n num' });
    const stateIc = K.el('span', { class: 'bt-state-ic' });
    const stateT = K.el('span', { class: 'bt-state-t' });
    const stateS = K.el('span', { class: 'bt-state-s' });
    const stateTx = K.el('span', { class: 'bt-state-tx' }, stateT, stateS);
    const stage = K.el('div', { class: 'bt-stage' },
      bubble, mBox,
      K.el('div', { class: 'bt-charge' }, chargeN, K.el('span', { class: 'bt-charge-u' }, '%'), K.el('span', { class: 'bt-charge-l' }, 'de carga')),
      K.el('div', { class: 'bt-state' }, stateIc, stateTx));

    const healthN = K.el('span', { class: 'bt-hn num' });
    const healthU = K.el('span', { class: 'bt-hu' }, '%');
    const pillBox = K.el('div', { class: 'bt-hpill' });
    const txt = K.el('p', { class: 'bt-htxt' });
    const meterBox = K.el('div', { class: 'bt-hm-box' });
    const appleBox = K.el('div', { class: 'bt-apple' });
    let osc = null;
    const right = K.el('div', { class: 'bt-health' },
      K.el('div', { class: 'bt-eyebrow' }, 'Saúde da bateria'),
      K.el('div', { class: 'bt-hrow' }, K.el('div', { class: 'bt-hval hero-value' }, healthN, healthU), pillBox),
      txt, meterBox,
      K.el('div', { class: 'bt-hfoot' },
        appleBox,
        (osc = K.el('p', { class: 'bt-osc' }, icon('info'),
          K.el('span', null, 'Esse número oscila 1 ou 2 pontos de uma carga pra outra, porque o chip da bateria recalibra a medida. Vale a tendência, não o número de um dia.')))));
    c.appendChild(stage);
    c.appendChild(right);

    const size = innerWidth < 1120 ? 196 : 228;
    p.mascot = K.mascot(mBox, { size, state: { pct: null } });
    let last = {};

    function meter(h) {
      meterBox.textContent = '';
      if (!isNum(h)) return;
      const st = statusOf(p.b);
      const w = clamp(h, 0, 100);
      const lost = 100 - w;
      const track = K.el('div', { class: 'bt-hm-track' },
        K.el('div', { class: `bt-hm-fill ${st.tone}`, style: { width: w + '%' } }));
      /* legenda em cima da barra: o que ela guarda e o que já perdeu (nada de "−12%" solto) */
      const cap = K.el('div', { class: 'bt-hm-cap' },
        K.el('span', null, `guarda ${K.fmt.pct(h, h % 1 ? 1 : 0)}`),
        lost >= 0.5 ? K.el('span', { class: 'bt-hm-capr' }, ` · perdeu ${K.fmt.num(lost, 0)}% desde nova`) : null);
      meterBox.appendChild(K.el('div', { class: 'bt-hm', role: 'img', 'aria-label': `Saúde ${K.fmt.pct(h)} da capacidade de fábrica; a marca de 80% é onde a Apple considera gasta.` },
        cap,
        K.el('div', { class: 'bt-hm-bar' }, track, K.el('i', { class: 'bt-hm-mark', style: { left: '80%' } })),
        K.el('div', { class: 'bt-hm-scale' },
          K.el('span', { style: { left: '0' } }, '0%'),
          K.el('span', { class: 'bt-hm-ml', style: { right: '20%' } }, 'gasta abaixo de 80%'),
          K.el('span', { style: { right: '0' } }, '100%'))));
    }

    function update(b, first) {
      const st = statusOf(b);
      const s = stateOf(b);
      const full = !!(b.pluggedIn && !b.isCharging && isNum(b.percent) && b.percent >= 99);
      p.mascot.set({
        pct: isNum(b.percent) ? b.percent : null, tone: st.tone,
        charging: !!b.isCharging, plugged: !!b.pluggedIn, full,
        hot: isNum(b.temperatureC) && b.temperatureC >= 40,
      });
      countTo(chargeN, b.percent, (v) => K.fmt.num(v, 0), first);
      chargeN.nextSibling.hidden = !isNum(b.percent);
      if (last.icon !== s.icon) { stateIc.innerHTML = K.icon(s.icon); last.icon = s.icon; }
      setText(stateT, s.title);
      setText(stateS, s.sub);
      stateTx.setAttribute('aria-label', s.text);
      setText(bubble, s.bubble);
      stage.dataset.state = s.key;

      const h = b.healthPct;
      if (first || h !== last.h || b.status !== last.status) {
        /* sem leitura: palavra apagada no lugar do número (um travessão preto parecia defeito) */
        healthN.classList.toggle('bt-hn-none', !isNum(h));
        if (!isNum(h)) setText(healthN, 'Sem leitura');
        else if (first) countTo(healthN, h, (v) => K.fmt.num(v, 1), true);
        else setText(healthN, K.fmt.num(h, 1));
        healthN.classList.remove('no-read');
        healthU.hidden = !isNum(h);
        if (osc) osc.hidden = !isNum(h);
        pillBox.textContent = '';
        if (isNum(h) || b.status === 'trocar') pillBox.appendChild(K.statusPill(st.tone, st.label, st.icon, true));
        txt.textContent = '';
        if (isNum(b.maxMah) && isNum(b.designMah)) {
          txt.append('Sua bateria guarda ', K.el('span', { class: 'bt-strong' }, K.fmt.num(b.maxMah) + ' mAh'),
            ' de ', K.el('span', { class: 'bt-strong' }, K.fmt.num(b.designMah) + ' mAh'),
            ' da capacidade de fábrica. A Apple considera gasta abaixo de 80%.');
        } else if (isNum(h)) {
          txt.append('Quanto ela ainda guarda da capacidade de fábrica. A Apple considera gasta abaixo de 80%.');
        } else {
          txt.append('O Mac não informou a capacidade da bateria agora. Tente de novo daqui a pouco.');
        }
        meter(h);
        last.h = h; last.status = b.status;
      }
      if (first || b.appleCondition !== last.cond) {
        appleBox.textContent = '';
        const a = APPLE[b.appleCondition];
        appleBox.appendChild(K.el('span', { class: 'bt-apple-l' }, 'Condição pela Apple'));
        if (a) {
          appleBox.appendChild(K.statusPill(a.tone, a.label, a.icon));
          appleBox.appendChild(K.el('span', { class: 'bt-apple-t' }, a.txt));
        } else appleBox.appendChild(K.el('span', { class: 'bt-apple-t' }, 'Não informada por este Mac.'));
        last.cond = b.appleCondition;
      }
    }
    return { node: c, update };
  }

  /* ---------- quatro blocos ---------- */
  function tile(iconName, label, delay, tone) {
    const val = K.el('div', { class: 'bt-tval' });
    const vis = K.el('div', { class: 'bt-tvis' });
    const txt = K.el('p', { class: 'bt-ttxt' });
    const ic = K.el('span', { class: 'head-ic' + (tone ? ' ' + tone : ''), html: K.icon(iconName) });
    const node = card('bt-tile', delay);
    node.append(K.el('div', { class: 'bt-ttop' }, ic, K.el('h3', { class: 'bt-tlabel' }, label)), val, vis, txt);
    return { node, val, vis, txt, ic };
  }

  function cyclesTile(p) {
    const t = tile('cycle', 'Ciclos', 80);
    const n = K.el('span', { class: 'num' });
    const of = K.el('small');
    t.val.append(n, of);
    const fill = K.el('div', { class: 'meter-fill gold', style: { width: '0%' } });
    const scaleR = K.el('span');
    t.vis.append(K.el('div', { class: 'meter bt-meter' }, fill), K.el('div', { class: 'meter-marks' }, K.el('span', null, '0'), scaleR));
    let last = null;
    return {
      node: t.node,
      update(b, first) {
        const c = b.cycles, d = b.designCycles;
        if (!first && c === last) return;
        last = c;
        countTo(n, c, (v) => K.fmt.num(v, 0), first);
        of.textContent = isNum(d) ? `de ${K.fmt.num(d)}` : '';
        scaleR.textContent = isNum(d) ? K.fmt.num(d) : '';
        const frac = isNum(c) && isNum(d) && d > 0 ? clamp(c / d, 0, 1) : 0;
        const go = () => { fill.style.width = (frac * 100).toFixed(1) + '%'; };
        if (first && !snap()) K.charts.soon(go); else go();
        t.vis.hidden = !(isNum(c) && isNum(d));
        if (!isNum(c)) t.txt.textContent = 'O Mac não informou os ciclos.';
        else if (isNum(d) && c >= d) t.txt.textContent = `Já passou dos ${K.fmt.num(d)} ciclos que a Apple projeta. Não desliga nada: só indica desgaste.`;
        else t.txt.textContent = 'Um ciclo é gastar 100% da carga, somando recargas parciais (50% hoje + 50% amanhã = 1).';
      },
    };
  }

  function tempTile(p) {
    const t = tile('thermo', 'Temperatura', 140);
    const n = K.el('span', { class: 'num' });
    t.val.append(n);
    const pin = K.el('i', { class: 'bt-ts-pin' });
    const track = K.el('div', { class: 'bt-ts-track' });
    for (const z of TEMP) track.appendChild(K.el('span', { class: 'bt-ts-z ' + z.tone, style: { width: ((z.to - z.from) / (TEMP_MAX - TEMP_MIN)) * 100 + '%' } }));
    const scale = K.el('div', { class: 'bt-ts-scale' });
    for (const v of [35, 40, 45]) scale.appendChild(K.el('span', { style: { left: ((v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100 + '%' } }, String(v)));
    const pillBox = K.el('div', { class: 'bt-tpill' });
    t.vis.append(K.el('div', { class: 'bt-ts', 'aria-hidden': 'true' }, K.el('div', { class: 'bt-ts-bar' }, track, pin), scale), pillBox);
    let lastZone;
    return {
      node: t.node,
      update(b, first) {
        const c = b.temperatureC;
        countTo(n, c, (v) => K.fmt.temp(v), first);
        const z = tempZone(c);
        pin.hidden = !z;
        t.vis.hidden = !z;
        if (z) pin.style.left = clamp((c - TEMP_MIN) / (TEMP_MAX - TEMP_MIN), 0, 1) * 100 + '%';
        if (z !== lastZone) {
          lastZone = z;
          pillBox.textContent = '';
          if (z) pillBox.appendChild(K.statusPill(z.tone, z.label, z.icon));
          t.txt.textContent = z ? z.txt : 'O Mac não informou a temperatura da bateria.';
          t.ic.className = 'head-ic' + (z && z.tone !== 'good' ? ' ' + z.tone : '');
        }
      },
    };
  }

  function energyTile(p) {
    const t = tile('bolt', 'Energia', 200);
    const n = K.el('span', { class: 'num' });
    t.val.append(n);
    const flow = K.el('div', { class: 'bt-flow', 'aria-hidden': 'true' });
    const flowTx = K.el('div', { class: 'bt-flow-t' });
    const adapter = K.el('div', { class: 'bt-adapter' });
    t.vis.append(flow, flowTx);
    t.txt.replaceWith(adapter);
    let lastDir = null;
    const node = (ic) => K.el('span', { class: 'bt-flow-n', html: K.icon(ic) });
    return {
      node: t.node,
      update(b) {
        const w = b.watts;
        const f = K.fmt.flow(w, b.pluggedIn);
        K.readOr(n, f ? f.value : null, (v) => v);
        const dir = !f ? 'none' : f.dir;
        if (dir !== lastDir) {
          lastDir = dir;
          flow.textContent = '';
          flow.dataset.dir = dir;
          const arrow = K.el('span', { class: 'bt-flow-a' }, K.el('i'), K.el('i'), K.el('i'));
          if (dir === 'in') { flow.append(node('plug'), arrow, node('battery')); flowTx.textContent = 'entrando na bateria'; }
          else if (dir === 'out') { flow.append(node('battery'), arrow, node('btLaptop')); flowTx.textContent = 'saindo da bateria pro Mac'; }
          else if (dir === 'direct') { flow.append(node('plug'), arrow, node('btLaptop')); flowTx.textContent = 'O Mac usa o carregador direto e a bateria descansa.'; }
          else if (dir === 'idle') { flow.append(node('battery'), arrow, node('btLaptop')); flowTx.textContent = 'Quase nada saindo agora.'; }
          else { flowTx.textContent = 'O Mac não informou a energia agora.'; }
          t.ic.className = 'head-ic' + (dir === 'out' ? ' s2' : dir === 'in' ? ' s1' : '');
        }
        /* carregador e bateria em linhas separadas: 12,6 V é da bateria, não do carregador */
        adapter.textContent = '';
        const a = b.adapter;
        if (b.pluggedIn == null) { /* sem leitura da tomada: não afirma nada sobre o carregador */ }
        else if (b.pluggedIn) {
          adapter.appendChild(K.el('span', null, a && isNum(a.watts) && a.watts > 0 ? `Carregador de ${K.fmt.num(a.watts)} W` : 'Carregador ligado'));
          if (a && isNum(a.voltageV) && isNum(a.currentA)) adapter.appendChild(K.el('span', { class: 'bt-adapter-d num' }, `Carregador: ${K.fmt.num(a.voltageV, 0)} V · ${K.fmt.num(a.currentA, a.currentA % 1 ? 1 : 0)} A`));
        } else adapter.appendChild(K.el('span', null, 'Sem carregador'));
        if (isNum(b.voltageV) && isNum(b.amperageMa)) {
          const amp = Math.abs(b.amperageMa) / 1000;
          adapter.appendChild(K.el('span', { class: 'bt-adapter-d num' }, `Bateria: ${K.fmt.num(b.voltageV, 1)} V · ${amp < 0.05 ? '0' : K.fmt.num(amp, 1)} A`));
        }
      },
    };
  }

  function forecastTile(p) {
    const t = tile('crystal', 'Previsão', 260);
    const n = K.el('span', { class: 'num' });
    const unit = K.el('small');
    t.val.append(n, unit);
    const bar = K.el('div', { class: 'bt-fc-bar' });
    const marks = K.el('div', { class: 'meter-marks bt-fc-marks' });
    const when = K.el('div', { class: 'bt-fc-when' });
    t.vis.append(bar, marks, when);
    let lastKey = null;
    return {
      node: t.node,
      update(b, first) {
        const pj = p.projection || localProjection(b);
        const key = JSON.stringify([pj.method, pj.cyclesTo80, pj.dateTo80, pj.wearPerCycle, b.cycles, b.healthPct]);
        if (key === lastKey) return;
        lastKey = key;
        bar.textContent = ''; marks.textContent = ''; when.textContent = '';
        t.vis.hidden = false;
        t.val.classList.remove('word');
        const h = b.healthPct;
        if (!isNum(h) || !isNum(b.cycles)) {
          K.readOr(n, null);
          unit.textContent = '';
          t.vis.hidden = true;
          t.txt.textContent = 'Sem a saúde e os ciclos da bateria agora, não dá pra estimar.';
          return;
        }
        n.classList.remove('no-read');
        if (h <= 80) {
          t.val.classList.add('word');
          n.textContent = 'Já passou';
          unit.textContent = 'dos 80%';
          t.vis.hidden = true;
          t.txt.textContent = 'A Apple já considera gasta. Ela continua funcionando, só dura menos por carga.';
          return;
        }
        if (pj.method === 'sem-dados' || !isNum(pj.cyclesTo80)) {
          t.val.classList.add('word');
          n.textContent = 'Cedo demais';
          unit.textContent = '';
          t.vis.hidden = true;
          t.txt.textContent = 'Ainda não dá pra estimar: a bateria quase não gastou. Volte daqui a alguns ciclos.';
          return;
        }
        countTo(n, pj.cyclesTo80, (v) => '~' + K.fmt.num(v, 0), first);
        unit.textContent = 'ciclos até 80%';
        const done = isNum(b.cycles) ? b.cycles : 0;
        const total = done + pj.cyclesTo80;
        if (total > 0) {
          const f = (done / total) * 100;
          bar.append(K.el('span', { class: 'bt-fc-done', style: { width: f + '%' } }), K.el('span', { class: 'bt-fc-now', style: { left: f + '%' } }));
          marks.append(K.el('span', null, 'nova'), K.el('span', null, 'hoje'), K.el('span', null, '80%'));
          marks.children[1].style.left = clamp(f, 12, 88) + '%';
        }
        if (isNum(pj.dateTo80)) {
          when.append(icon('btCalendar'), K.el('span', null, 'por volta de ' + K.fmt.monthYear(pj.dateTo80)));
        }
        if (pj.method === 'historico') t.txt.textContent = 'Pela tendência dos seus dias de uso. É estimativa: calor e jeito de usar mudam o ritmo.';
        else t.txt.textContent = `Pelo desgaste médio até hoje (${K.fmt.num(pj.wearPerCycle, 3)} ponto por ciclo). É estimativa: calor e uso mudam o ritmo.`;
      },
    };
  }

  /* ---------- energia ao vivo ---------- */
  function wattDomain(pts) {
    let lo = 0, hi = 0;
    for (const q of pts) if (isNum(q.y)) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    const r = (v) => { const a = Math.abs(v); const s = a <= 20 ? 5 : a <= 60 ? 10 : 20; return Math.ceil(a / s) * s; };
    return { yMin: -Math.max(10, r(lo)), yMax: Math.max(10, r(hi)) };
  }

  function livePart(p) {
    const c = card('bt-livecard', 320);
    const nowV = K.el('span', { class: 'bt-now-v num' }, '—');
    const nowL = K.el('span', { class: 'bt-now-l' }, 'agora');
    const btn = K.el('button', { class: 'btn small bt-pause', type: 'button' });
    const paint = () => {
      btn.innerHTML = K.icon(p.live.paused ? 'play' : 'pause');
      btn.appendChild(document.createTextNode(p.live.paused ? 'Continuar' : 'Pausar'));
      btn.setAttribute('aria-pressed', String(p.live.paused));
      if (p.liveBadge) p.liveBadge.classList.toggle('paused', p.live.paused);
      if (p.liveText) p.liveText.textContent = p.live.paused ? 'Pausado' : 'Ao vivo';
    };
    p.live = { pts: [], paused: false, chart: null };
    btn.addEventListener('click', () => {
      K.sound.plop();
      p.live.paused = !p.live.paused;
      paint();
      if (!p.live.paused) draw();
    });
    paint();
    c.appendChild(head('btWave', 'Energia ao vivo', 'Watts entrando ou saindo da bateria, a cada 2 segundos.',
      K.el('div', { class: 'bt-live-side' }, K.el('span', { class: 'bt-now' }, nowL, nowV), btn)));
    const box = K.el('div', { class: 'bt-livechart' });
    c.appendChild(box);
    const note = K.el('p', { class: 'bt-note' });
    c.appendChild(note);

    function draw() {
      const pts = p.live.pts;
      const opts = Object.assign({ points: pts }, wattDomain(pts));
      if (pts.length) { opts.xMax = pts[pts.length - 1].x; opts.xMin = opts.xMax - (LIVE_POINTS - 1) * (LIVE_MS / 1000); }
      if (!p.live.chart) {
        p.live.chart = keep(p, K.charts.line(box, Object.assign({
          name: 'Energia', color: 'var(--s2)',
          yZero: true,
          tipFormat: (v) => wattsTxt(v),
          yFormat: (v) => (v > 0 ? '+' : '') + K.charts.num(v, Number.isInteger(v) ? 0 : 1) + ' W',
          xFormat: 'ago',
          signs: ['entrando', 'saindo'],
          yTicks: 4,
          gap: 12,
          gapStyle: 'none',
          height: 200,
          table: { xLabel: 'Quando', order: 'desc' },
          empty: p.live.noWatts ? 'O Mac não está informando a energia da bateria agora.' : 'Medindo… o primeiro número chega em 2 segundos.',
          ariaLabel: 'Energia da bateria nos últimos 3 minutos',
        }, opts)));
      } else p.live.chart.update(opts);
    }

    let lastNote = null;
    return {
      node: c,
      update(b) {
        const f = K.fmt.flow(b.watts, b.pluggedIn);
        nowV.parentNode.hidden = !f;
        K.readOr(nowV, f ? f.value : null, (v) => v);
        setText(nowL, !f ? 'agora' : f.dir === 'in' ? 'agora, entrando' : f.dir === 'out' ? 'agora, saindo' : 'agora');
        if (!isNum(b.watts) && !p.live.pts.length) {
          if (p.live.chart) p.live.chart.update({ empty: 'O Mac não está informando a energia da bateria agora.' });
          else p.live.noWatts = true;
        }
        if (isNum(b.watts) && isNum(b.readAt)) {
          const pts = p.live.pts;
          if (!pts.length || b.readAt > pts[pts.length - 1].x + 0.5) {
            pts.push({ x: b.readAt, y: Math.round(b.watts * 10) / 10 });
            if (pts.length > LIVE_POINTS) pts.splice(0, pts.length - LIVE_POINTS);
          }
        }
        if (!p.live.paused) draw();
        const k = b.isCharging ? 'c' : b.pluggedIn ? 'p' : b.pluggedIn == null ? 'x' : 'b';
        if (k !== lastNote) {
          lastNote = k;
          note.textContent = k === 'c' ? 'Acima do zero é energia entrando. Perto de cheia, o macOS vai diminuindo a força pra poupar a bateria.'
            : k === 'p' ? 'Na tomada e sem carregar, a linha fica perto do zero: o Mac usa o carregador direto e a bateria só descansa.'
              : k === 'x' ? 'Acima do zero é energia entrando na bateria; abaixo, a bateria gastando.'
                : 'Abaixo do zero é a bateria gastando. Os picos são o Mac trabalhando mais forte (abrir app, vídeo, compilar).';
        }
      },
    };
  }

  /* ---------- células ---------- */
  function cellsPart(p) {
    const c = card('bt-cellscard', 380);
    c.appendChild(head('cells', 'Células', 'Tensão de cada célula agora.'));
    /* o que importa é a diferença entre elas: ela é o número do cartão */
    const spreadN = K.el('span', { class: 'num' });
    const top = K.el('div', { class: 'bt-cells-top' },
      K.el('div', { class: 'bt-cells-v' }, spreadN, K.el('small', null, 'de diferença')));
    const verdict = K.el('div', { class: 'bt-verdict' });
    top.appendChild(verdict);
    const row = K.el('div', { class: 'bt-cells' });
    const txt = K.el('p', { class: 'bt-note' });
    /* cartão largo: número e explicação à esquerda, pilhas à direita; estreito: uma coisa embaixo da outra */
    c.append(K.el('div', { class: 'bt-cells-body' }, K.el('div', { class: 'bt-cells-info' }, top, txt), row));
    let n = -1;
    let parts = [];
    let lastV = null;
    return {
      node: c,
      update(b) {
        const cells = Array.isArray(b.cellsMv) ? b.cellsMv.filter(isNum) : [];
        row.classList.toggle('is-empty', !cells.length);
        if (!cells.length) {
          if (n !== 0) {
            n = 0; row.textContent = ''; verdict.textContent = '';
            top.hidden = true;
            row.appendChild(K.el('div', { class: 'empty' }, 'Este Mac não informa a tensão de cada célula.'));
            txt.textContent = '';
          }
          return;
        }
        top.hidden = false;
        if (cells.length !== n) {
          n = cells.length;
          row.textContent = '';
          parts = cells.map((_, i) => {
            const fill = K.el('span', { class: 'bt-cell-fill' });
            const v = K.el('span', { class: 'bt-cell-v num' });
            const tag = K.el('span', { class: 'bt-cell-tag' });
            const el = K.el('div', { class: 'bt-cell' },
              K.el('span', { class: 'bt-cell-cap' }),
              K.el('span', { class: 'bt-cell-body' }, fill, K.el('span', { class: 'bt-cell-n' }, String(i + 1))),
              v, tag);
            row.appendChild(el);
            return { fill, v, tag, el };
          });
        }
        const hi = Math.max(...cells), lo = Math.min(...cells);
        const spread = isNum(b.cellSpreadMv) ? b.cellSpreadMv : hi - lo;
        cells.forEach((mv, i) => {
          const q = parts[i];
          /* cheias até a carga de agora (sem a carga, estima pela tensão) */
          const frac = isNum(b.percent) ? b.percent / 100 : (mv - 3000) / 1200;
          q.fill.style.height = clamp(frac, 0.04, 1) * 100 + '%';
          setText(q.v, K.fmt.num(mv / 1000, 3) + ' V');
          setText(q.tag, spread > 20 && mv === lo ? 'a mais baixa' : '');
          q.el.classList.toggle('low', spread > 20 && mv === lo);
        });
        setText(spreadN, K.fmt.num(spread) + ' mV');
        const vd = cellVerdict(spread);
        const key = vd ? vd.label + spread : 'x';
        if (key !== lastV) {
          lastV = key;
          verdict.textContent = '';
          if (vd) verdict.appendChild(K.statusPill(vd.tone, vd.label, vd.icon));
          txt.textContent = vd ? `${vd.txt} Até 20 mV entre a mais alta e a mais baixa é o normal.` : '';
        }
      },
    };
  }

  /* ---------- carga dos últimos 7 dias ---------- */
  function chargeStats(carga, bands, lo, hi) {
    let covered = 0, plugged = 0, full = 0, min = null;
    const start = Math.max(lo, carga.length ? carga[0].t : hi);
    covered = Math.max(0, hi - start);
    for (const bd of bands) plugged += Math.max(0, Math.min(bd.to, hi) - Math.max(bd.from, start));
    for (let i = 0; i < carga.length; i++) {
      const q = carga[i];
      if (q.t < start) continue;
      if (isNum(q.pct)) min = min == null ? q.pct : Math.min(min, q.pct);
      const next = carga[i + 1];
      if (next && q.plugged && q.pct >= 99) full += Math.max(0, Math.min(next.t, hi) - q.t);
    }
    return { share: covered > 0 ? plugged / covered : null, full, min, covered };
  }

  function dayRows(carga, bands, hi) {
    const rows = [];
    const d = new Date(hi * 1000);
    d.setHours(0, 0, 0, 0);
    const first = carga.length ? carga[0].t : hi;
    for (let i = 0; i < 8; i++) {
      const a = d.getTime() / 1000;
      const nx = new Date(d); nx.setDate(nx.getDate() + 1);
      const z = Math.min(nx.getTime() / 1000, hi);
      if (z <= first) break;
      let mn = null, mx = null;
      for (const q of carga) if (q.t >= a && q.t < z && isNum(q.pct)) { mn = mn == null ? q.pct : Math.min(mn, q.pct); mx = mx == null ? q.pct : Math.max(mx, q.pct); }
      let pl = 0;
      for (const bd of bands) pl += Math.max(0, Math.min(bd.to, z) - Math.max(bd.from, a));
      const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      rows.push([`${wd}, ${K.fmt.day(a)}`, mn == null ? '—' : K.fmt.pct(mn, 0), mx == null ? '—' : K.fmt.pct(mx, 0), hoursTxt(pl)]);
      d.setDate(d.getDate() - 1);
    }
    return rows;
  }

  const FONTE = { macos: 'do registro do macOS', kamurafy: 'medido pelo Kamurafy', agora: 'leitura de agora' };

  function chargePart(p) {
    const c = card('bt-chargecard', 440);
    const chips = K.el('div', { class: 'bt-chips' });
    c.appendChild(head('chart', 'Carga nos últimos 7 dias', 'Quanto de carga ela teve e quando esteve na tomada.'));
    const box = K.el('div', { class: 'bt-chargechart' }, K.el('div', { class: 'loading' }, 'Lendo o histórico do macOS… (leva uns segundos na primeira vez)'));
    const note = K.el('p', { class: 'bt-note' });
    c.append(chips, box, note);

    function chip(label, value) {
      return K.el('span', { class: 'bt-chip' }, K.el('span', { class: 'bt-chip-v num' }, value), K.el('span', { class: 'bt-chip-l' }, label));
    }

    return {
      node: c,
      fail(e) {
        box.textContent = '';
        box.appendChild(K.el('div', { class: 'error-box bt-err' },
          K.el('span', null, 'Não consegui ler o histórico agora. ' + ((e && e.message) || '')),
          K.el('button', { class: 'btn small', type: 'button', onclick: () => { K.sound.plop(); box.textContent = ''; box.appendChild(K.el('div', { class: 'loading' }, 'Tentando de novo…')); loadHistory(p); } }, 'Tentar de novo')));
      },
      draw(h, b) {
        box.textContent = '';
        const now = Date.now() / 1000;
        const lo = now - 7 * DAY;
        const carga = ((h && h.carga) || []).filter((q) => q && isNum(q.t) && q.t >= lo - DAY).slice();
        if (b && isNum(b.percent) && isNum(b.readAt) && (!carga.length || b.readAt > carga[carga.length - 1].t + 60)) {
          carga.push({ t: b.readAt, pct: b.percent, plugged: !!b.pluggedIn, fonte: 'agora' });
        }
        const bands = K.charts.runs(carga, (q) => q.plugged, { label: 'Na tomada' });
        keep(p, K.charts.area(box, {
          name: 'Carga',
          points: carga.map((q) => ({ x: q.t, y: q.pct, fonte: q.fonte })),
          yMin: 0, yMax: 100,
          yFormat: (v) => K.fmt.pct(v, 0),
          xMin: lo, xMax: now,
          bands,
          bandStyle: 'track',
          gap: 3 * 3600,
          gapLabel: 'horas sem leitura',
          height: 240,
          tooltip: (x, hits, def) => {
            const raw = hits[0] && hits[0].raw;
            if (raw && FONTE[raw.fonte]) def.rows.push({ value: '', name: FONTE[raw.fonte] });
            return def;
          },
          table: {
            rows: () => ({ head: ['Dia', 'Menor', 'Maior', 'Na tomada (estimado)'], rows: dayRows(carga, bands, now), order: 'mais recentes primeiro' }),
          },
          empty: 'O macOS ainda não tem histórico de carga pra mostrar. O Kamurafy começa a anotar assim que fica aberto.',
          ariaLabel: 'Carga da bateria nos últimos 7 dias',
        }));

        const stt = chargeStats(carga, bands, lo, now);
        p.plugShare = stt.share;
        chips.textContent = '';
        if (carga.length > 1) {
          if (stt.share != null) chips.appendChild(chip('do tempo na tomada', '~' + K.fmt.num(stt.share * 100, 0) + '%'));
          if (stt.full >= 3600) chips.appendChild(chip('parada em 100%', K.fmt.roughDuration(stt.full)));
          if (stt.min != null) chips.appendChild(chip('a mais baixa', K.fmt.pct(stt.min, 0)));
        }
        const onlyMac = carga.every((q) => q.fonte !== 'kamurafy');
        note.textContent = onlyMac
          ? 'Antes do Kamurafy, os pontos vêm do registro do próprio macOS, que anota a carga quando o Mac dorme, acorda ou muda de tomada. Por isso eles aparecem de tempos em tempos. Com o Kamurafy aberto, ele anota a cada 5 minutos. Os números do topo são estimativas.'
          : 'Os pontos mais antigos vêm do registro do próprio macOS (quando o Mac dorme, acorda ou muda de tomada); com o Kamurafy aberto, ele anota a cada 5 minutos. Os números do topo são estimativas.';
      },
    };
  }

  /* ---------- saúde ao longo do tempo ---------- */
  const HEALTH_DAYS = 14;   // antes disso, o gráfico é saúde × ciclos (tem sentido desde o 1º dia)

  function healthPart(p) {
    const c = card('bt-healthcard', 500);
    const hd = head('heart', 'Saúde ao longo do tempo', 'Um ponto por dia, com a linha dos 80%.');
    const sub = hd.querySelector('.card-sub');
    c.appendChild(hd);
    const box = K.el('div', { class: 'bt-healthchart' }, K.el('div', { class: 'loading' }, 'Juntando os dias…'));
    const notes = K.el('div', { class: 'bt-hnotes' });
    c.append(box, notes);

    const pct = (v) => K.fmt.pct(v, 1);
    const yFormat = (v) => K.fmt.pct(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 1);
    const REF = [{ y: 80, label: '80% · a Apple considera gasta abaixo disso', short: '80%' }];

    /** poucos dias: saúde × ciclos, de nova (0 ciclos, 100%) até hoje, e o ritmo até os 80% */
    function byCycles(b, pj) {
      const h = b.healthPct, cy = b.cycles;
      const series = [{ name: 'Saúde', points: [{ x: 0, y: 100, tag: 'nova' }, { x: cy, y: h, tag: 'hoje', maxMah: b.maxMah }], dots: true, format: pct, endLabel: `hoje · ${pct(h)}` }];
      let xMax = Math.max(cy * 1.15, 50);
      if (h > 80 && isNum(pj.cyclesTo80) && pj.cyclesTo80 > 0) {
        const end = cy + pj.cyclesTo80;
        series.push({ name: 'No ritmo de hoje', dash: true, points: [{ x: cy, y: h }, { x: end, y: 80, tag: 'previsao' }],
          endLabel: `~${K.fmt.num(pj.cyclesTo80)} ciclos`, format: (v) => '≈ ' + K.fmt.pct(v, 0) });
        xMax = end * 1.04;
      }
      sub.textContent = 'Saúde × ciclos: de quando era nova até hoje, e o ritmo até os 80%.';
      return {
        series, xType: 'num', xMin: 0, xMax,
        xFormat: (v) => K.fmt.num(v),
        tipTitle: (x) => (x === 0 ? 'Nova · 0 ciclos' : `${K.fmt.num(x)} ciclos`),
        tooltip: (x, hits, def) => {
          const raw = hits[0] && hits[0].raw;
          if (raw && raw.tag === 'nova') def.rows.push({ value: '', name: 'quando saiu da fábrica' });
          if (raw && raw.tag === 'hoje' && isNum(raw.maxMah)) def.rows.push({ value: K.fmt.num(raw.maxMah) + ' mAh', name: 'guardados hoje' });
          if (raw && raw.tag === 'previsao') def.rows.push({ value: '', name: 'se o desgaste seguir no ritmo de hoje' });
          return def;
        },
        table: { xLabel: 'Ciclos', order: 'asc' },
        ariaLabel: 'Saúde da bateria pelos ciclos, de nova até hoje, com a projeção até 80%',
      };
    }

    /** 2 semanas ou mais: um ponto por dia; o eixo termina hoje (ou na data prevista pros 80%) */
    function byDays(s, pj) {
      const now = Date.now() / 1000;
      const series = [{ name: 'Saúde', points: s, format: pct, dots: s.length <= 60 }];
      let xMax = now;
      if (isNum(pj.dateTo80) && s.length) {
        const u = s[s.length - 1];
        series.push({ name: 'Projeção', dash: true, points: [{ x: u.x, y: u.y }, { x: pj.dateTo80, y: 80 }],
          endLabel: '~' + K.fmt.monthYear(pj.dateTo80), format: (v) => '≈ ' + K.fmt.pct(v, 0) });
        xMax = Math.max(now, pj.dateTo80);
      }
      sub.textContent = 'Um ponto por dia, com a linha dos 80%.';
      return {
        series, xMin: Math.min(s[0].x, now - HEALTH_DAYS * DAY), xMax,
        tipTitle: K.fmt.day,
        tooltip: (x, hits, def) => {
          const raw = hits[0] && hits[0].raw;
          if (raw && isNum(raw.maxMah)) def.rows.push({ value: K.fmt.num(raw.maxMah) + ' mAh', name: 'guardados' });
          if (raw && isNum(raw.cycles)) def.rows.push({ value: K.fmt.num(raw.cycles), name: 'ciclos' });
          return def;
        },
        table: { xLabel: 'Dia' },
        ariaLabel: 'Saúde da bateria ao longo do tempo',
      };
    }

    return {
      node: c,
      fail() {
        box.textContent = '';
        box.appendChild(K.el('div', { class: 'empty' }, 'Sem o histórico agora. Tente abrir a tela de novo daqui a pouco.'));
      },
      draw(h, b) {
        box.textContent = '';
        notes.textContent = '';
        const s = ((h && h.saude) || []).filter((d) => d && isNum(d.t) && isNum(d.healthPct)).map((d) => ({ x: d.t, y: d.healthPct, maxMah: d.maxMah, cycles: d.cycles }));
        const pj = p.projection || {};
        const cyclesMode = s.length < HEALTH_DAYS && isNum(b.healthPct) && isNum(b.cycles) && b.cycles > 0;
        let o;
        if (cyclesMode) o = Object.assign(byCycles(b, pj), { yMax: 100 });
        else if (s.length) o = byDays(s, pj);
        else o = { series: [], ariaLabel: 'Saúde da bateria ao longo do tempo' };
        keep(p, K.charts.line(box, Object.assign({
          yFormat, refs: REF, height: 210,
          empty: 'Sem leitura de saúde ainda. O Kamurafy anota um ponto por dia enquanto está aberto.',
        }, o)));

        if (cyclesMode) {
          notes.appendChild(K.el('div', { class: 'tip bt-tipnote' }, icon('clock'),
            K.el('p', null, 'A reta é a média desde que ela era nova. A curva de verdade aparece com os pontos diários: o Kamurafy anota um por dia enquanto está aberto.')));
        }
        const m = pj.method;
        let how;
        if (isNum(b.healthPct) && b.healthPct <= 80) how = 'Ela já passou dos 80%, então não tem mais previsão pra fazer: daqui pra frente o que importa é se a carga ainda dura o que você precisa no dia.';
        else if (m === 'historico') how = `Como calculo a previsão: uma reta pelos seus ${K.fmt.num(pj.daysOfData)} dias de pontos, até onde ela cruza os 80%.`;
        else if (m === 'ciclos' && isNum(b.healthPct)) {
          how = `Como calculo a previsão: até hoje ela perdeu ${K.fmt.num(100 - b.healthPct, 1)} pontos em ${K.fmt.num(b.cycles)} ciclos, uns ${K.fmt.num(pj.wearPerCycle, 3)} por ciclo. Mantido esse ritmo, faltam ~${K.fmt.num(pj.cyclesTo80)} ciclos até 80%.`;
          how += isNum(pj.dateTo80) ? ' A data sai de quantos ciclos você faz por mês.' : ' A data aparece depois de 2 semanas, quando eu souber quantos ciclos você faz por mês.';
        } else if (!isNum(b.healthPct)) how = 'Sem a saúde da bateria agora, não dá pra calcular o ritmo.';
        else how = 'Ainda não dá pra prever: a bateria quase não gastou.';
        notes.appendChild(K.el('p', { class: 'bt-note' }, how + ' Calor e jeito de usar mudam o ritmo, então é estimativa, não promessa.'));
      },
    };
  }

  /* ---------- quem mais gasta ---------- */
  function appsPart(p) {
    const c = card('bt-appscard', 560);
    c.appendChild(head('apps', 'Quem mais gasta bateria', 'Agora, pelo impacto energético. Atualiza a cada 20 segundos.'));
    const box = K.el('div', { class: 'bt-appschart' }, K.el('div', { class: 'loading' }, 'Olhando os apps…'));
    const note = K.el('p', { class: 'bt-note' }, 'Impacto energético é a mesma medida do Monitor de Atividade: não é watt, serve pra comparar um app com outro. Na bateria, fechar o que está no topo e você não está usando é o que mais ajuda.');
    c.append(box, note);
    let ch = null;
    return {
      node: c,
      fail(e) {
        if (ch) return;   // já tem lista: mantém a última
        box.textContent = '';
        box.appendChild(K.el('div', { class: 'empty' }, 'Não consegui olhar os apps agora. Tento de novo em alguns segundos.'));
      },
      draw(list) {
        const items = K.energyItems(list, { min: 0.1 });
        const opts = {
          items, color: 'var(--s2)', valueName: 'de impacto', labelName: 'App', labelWidth: 240, table: true,
          format: (v) => K.fmt.num(v, v < 10 ? 1 : 0),
          empty: 'Nenhum app gastando energia de verdade agora. Tudo calmo.',
        };
        if (!ch) { box.textContent = ''; ch = keep(p, K.charts.bars(box, opts)); } else ch.update(opts);
      },
    };
  }

  /* ---------- avisos ---------- */
  function alertsPart(p, settings) {
    const c = card('bt-alertscard', 620);
    c.appendChild(head('bell', 'Avisos', 'Eu te chamo na hora certa, com uma notificação.'));
    const ok = !!settings;
    const s = Object.assign({ aviso80: true, limiteAviso: 80, avisoQuente: true }, settings || {});
    const err = K.el('p', { class: 'bt-err-t', hidden: true });
    const t1 = K.el('b');
    const nTitle = K.el('span', { class: 'bt-notif-t' });
    const nBody = K.el('span', { class: 'bt-notif-b' });
    const preview = K.el('div', { class: 'bt-notif-wrap' },
      K.el('span', { class: 'bt-notif-l' }, 'É assim que o aviso aparece:'),
      K.el('div', { class: 'bt-notif', 'aria-hidden': 'true' },
        K.el('span', { class: 'bt-notif-app', html: K.logo() }),
        K.el('div', { class: 'bt-notif-txt' },
          K.el('div', { class: 'bt-notif-top' }, K.el('span', null, 'Kamurafy'), K.el('span', { class: 'bt-notif-when' }, 'agora')),
          nTitle, nBody)));
    const paintT1 = () => {
      t1.textContent = `Me avisa quando chegar em ${s.limiteAviso}%`;
      /* mesmo texto que o Swift manda (Sampler.swift) */
      nTitle.textContent = `Chegou em ${s.limiteAviso}%!`;
      nBody.textContent = `Pode tirar da tomada. Parar por volta de ${s.limiteAviso}% ajuda a bateria a durar mais.`;
      preview.classList.toggle('off', !s.aviso80);
    };
    paintT1();
    const sw1 = K.el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': String(!!s.aviso80), 'aria-label': 'Aviso de carga', disabled: !ok });
    const sw2 = K.el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': String(!!s.avisoQuente), 'aria-label': 'Aviso de calor', disabled: !ok });
    const lims = K.el('div', { class: 'bt-lims', role: 'radiogroup', 'aria-label': 'Limite do aviso de carga' });
    const list = LIMITES.includes(s.limiteAviso) ? LIMITES : LIMITES.concat([s.limiteAviso]).sort((a, b) => a - b);
    const paintLims = () => {
      lims.classList.toggle('off', !s.aviso80);
      for (const btn of lims.children) {
        const on = +btn.dataset.v === s.limiteAviso;
        btn.setAttribute('aria-checked', String(on));
        btn.disabled = !ok || !s.aviso80;
      }
    };
    for (const v of list) {
      lims.appendChild(K.el('button', {
        class: 'bt-lim', type: 'button', role: 'radio', dataset: { v },
        onclick: () => save({ limiteAviso: v }, () => { s.limiteAviso = v; paintT1(); paintLims(); }),
      }, v + '%'));
    }

    async function save(patch, apply) {
      K.sound.plop();
      const before = Object.assign({}, s);
      apply();
      err.hidden = true;
      try {
        const v = await K.settings.set(patch);
        if (v) Object.assign(s, v);
      } catch (e) {
        Object.assign(s, before);
        sw1.setAttribute('aria-checked', String(!!s.aviso80));
        sw2.setAttribute('aria-checked', String(!!s.avisoQuente));
        paintT1(); paintLims();
        err.textContent = 'Não consegui salvar agora: ' + ((e && e.message) || 'erro desconhecido');
        err.hidden = false;
        K.sound.oops();
      }
    }
    sw1.addEventListener('click', () => {
      const v = sw1.getAttribute('aria-checked') !== 'true';
      save({ aviso80: v }, () => { s.aviso80 = v; sw1.setAttribute('aria-checked', String(v)); paintT1(); paintLims(); });
    });
    sw2.addEventListener('click', () => {
      const v = sw2.getAttribute('aria-checked') !== 'true';
      save({ avisoQuente: v }, () => { s.avisoQuente = v; sw2.setAttribute('aria-checked', String(v)); });
    });
    paintLims();

    c.append(
      K.el('div', { class: 'setting bt-setting' },
        K.el('div', { class: 'setting-text' }, t1,
          K.el('span', null, 'Com o carregador ligado, aviso quando a carga passar do limite, pra você tirar da tomada se quiser.')),
        sw1),
      K.el('div', { class: 'bt-limrow' }, K.el('span', { class: 'bt-limrow-l' }, 'Avisar em'), lims),
      preview,
      K.el('div', { class: 'setting bt-setting' },
        K.el('div', { class: 'setting-text' }, K.el('b', null, 'Me avisa se esquentar'),
          K.el('span', null, 'Se a bateria passar de 45 °C em duas leituras seguidas, eu te chamo.')),
        sw2),
      err,
      K.el('p', { class: 'bt-note' }, ok ? 'Os avisos funcionam enquanto o Kamurafy estiver aberto.' : 'Não consegui ler suas configurações agora. Abra a tela de novo daqui a pouco.'));
    return { node: c };
  }

  /* ---------- cuidados (conforme o estado real) ---------- */
  function tipsFor(b, p) {
    const out = [];
    const t = b.temperatureC;
    if (b.status === 'trocar') {
      out.push({ ic: 'btWrench', tone: 'crit', t: 'Hora de uma revisão', d: 'O macOS recomenda revisão da bateria. Procure a Apple ou uma assistência autorizada. Se notar o Mac deformado ou o trackpad levantando, pare de usar e leve logo.' });
    } else if (b.status === 'gasta') {
      out.push({ ic: 'btWrench', tone: 'serious', t: 'Ela já guarda menos', d: 'Abaixo de 80% a bateria dura menos por carga, mas continua segura. Se incomodar, a troca numa assistência autorizada resolve.' });
    }
    if (isNum(t) && t >= 40) {
      out.push({ ic: 'flame', tone: 'serious', t: `Tá quente agora (${K.fmt.temp(t)})`, d: 'Calor é o que mais gasta bateria. Tire o Mac de cima de cama ou almofada, deixe as saídas de ar livres e feche o que estiver pesado.' });
    }
    if (b.optimizedChargingEngaged) {
      out.push({ ic: 'btShield', tone: 'good', t: 'Carregamento otimizado em ação', d: 'O macOS segurou a carga em 80% e completa perto da hora que você costuma tirar da tomada. Pode deixar assim.' });
    }
    const vive = b.pluggedIn || (isNum(p.plugShare) && p.plugShare >= 0.5);
    if (vive) {
      const share = isNum(p.plugShare) && p.plugShare >= 0.5 ? ` Nos últimos dias, ela passou ~${K.fmt.num(p.plugShare * 100, 0)}% do tempo na tomada.` : '';
      out.push({ ic: 'plug', t: 'Vive na tomada? 20–80% é o ideal', d: 'A bateria sofre menos entre 20% e 80%. Ficar parada em 100% o dia todo, ainda mais com calor, é o que mais desgasta.' + share });
    } else {
      out.push({ ic: 'battery', t: 'Entre 20% e 80% ela sofre menos', d: 'Não precisa ficar contando: é só evitar zerar com frequência e evitar deixar dias em 100% na tomada.' });
    }
    if (!b.optimizedChargingEngaged) {
      out.push({ ic: 'btShield', t: 'Deixe o Carregamento otimizado ligado', d: 'O macOS aprende sua rotina e segura a carga em 80% quando você vai ficar muito tempo na tomada. Confira em Ajustes do Sistema › Bateria, no ⓘ de Saúde da Bateria.' });
    }
    if (b.lowPowerMode) {
      out.push({ ic: 'leaf', t: 'Modo pouca energia ligado', d: b.pluggedIn
        ? 'Ele faz a carga render mais segurando um pouco o processador e o brilho. Na tomada, pode desligar se quiser o Mac mais rápido.'
        : 'Boa: ele faz a carga render mais segurando um pouco o processador e o brilho.' });
    } else if (!b.pluggedIn && isNum(b.percent) && b.percent <= 30) {
      out.push({ ic: 'leaf', t: 'Carga acabando?', d: 'O Modo pouca energia (Ajustes do Sistema › Bateria) segura um pouco o processador e o brilho pra carga render mais.' });
    }
    if (!(isNum(t) && t >= 40)) {
      out.push({ ic: 'btSun', t: 'Fuja do calor', d: 'Sol, carro fechado e cobertor são os maiores inimigos da bateria, principalmente carregando.' });
    }
    out.push({ ic: 'btTarget', t: 'Limite automático de carga', d: 'Parar sozinho em 80% vem numa próxima versão do Kamurafy. Por enquanto, o aviso de carga faz esse papel.', soon: true });
    return out.slice(0, 5);
  }

  function tipsPart(p) {
    const c = card('bt-tipscard', 680);
    c.appendChild(head('leaf', 'Cuidados', 'Dicas pro seu caso, pelo que a bateria está mostrando agora.'));
    const list = K.el('div', { class: 'bt-tips' });
    c.appendChild(list);
    let lastKey = null;
    return {
      node: c,
      update(b) {
        const tips = tipsFor(b, p);
        const key = JSON.stringify(tips.map((x) => x.t + x.d));
        if (key === lastKey) return;
        lastKey = key;
        list.textContent = '';
        for (const x of tips) {
          list.appendChild(K.el('div', { class: 'bt-tip' + (x.tone ? ' ' + x.tone : '') },
            K.el('span', { class: 'bt-tip-ic', html: K.icon(x.ic) }),
            K.el('div', { class: 'bt-tip-b' },
              K.el('div', { class: 'bt-tip-t' }, x.t, x.soon ? K.el('span', { class: 'bt-soon' }, 'em breve') : null),
              K.el('p', null, x.d))));
        }
      },
    };
  }

  /* ================= telas especiais ================= */

  function renderNoBattery(p, b, info) {
    const c = card('bt-nobat', 0);
    const art = K.el('div', { class: 'bt-nobat-art' });
    c.appendChild(art);
    const model = info && info.model ? info.model : null;
    /* um MacBook "sem bateria" não é Mac de mesa: é bateria sem leitura (removida ou com defeito) */
    const laptop = K.isLaptop(info);
    p.mascot = K.mascot(art, { size: 220, state: laptop
      ? { pct: null, tone: 'none', face: 'worried', label: 'Mascote do Kamurafy preocupado: não achou a bateria' }
      : { pct: null, plugged: true, face: 'happy', label: 'Mascote do Kamurafy ligado na tomada, sem bateria' } });
    c.append(
      K.el('h2', null, laptop ? 'Não achei a bateria' : 'Este Mac vive na tomada'),
      K.el('p', null, laptop
        ? `Não consegui ler a bateria deste ${K.fmt.model(model) || 'MacBook'}. Se ela foi removida ou está com defeito, vale levar numa assistência autorizada.`
        : `Não achei bateria ${model ? 'neste ' + K.fmt.model(model) : 'aqui'}. É um Mac de mesa, como iMac, Mac mini ou Mac Studio, então não tem saúde de bateria pra cuidar.`),
      K.el('p', { class: 'muted' }, 'O resto do Kamurafy funciona normal: no Painel você acompanha processador, memória e disco.'),
      K.el('button', { class: 'btn gold', type: 'button', onclick: () => { K.sound.plop(); location.hash = '#/painel'; } }, 'Ir pro Painel', K.el('span', { html: K.icon('arrow') })));
    p.el.appendChild(c);
  }

  function renderFail(p, e) {
    const c = card('bt-nobat bt-fail', 0);
    const art = K.el('div', { class: 'bt-nobat-art' });
    c.appendChild(art);
    p.mascot = K.mascot(art, { size: 180, state: { pct: null, face: 'worried' } });
    c.append(
      K.el('h2', null, 'Não consegui ler a bateria agora'),
      K.el('p', null, 'Às vezes o macOS demora pra responder logo depois de acordar. ' + ((e && e.message) || '')),
      K.el('button', { class: 'btn gold', type: 'button', onclick: () => {
        K.sound.plop();
        const el = p.el;
        K.pages.bateria.destroy();
        el.textContent = '';
        K.pages.bateria.render(el);
      } }, K.el('span', { html: K.icon('cycle') }), 'Tentar de novo'));
    p.el.appendChild(c);
    K.sound.oops();
  }

  /* ================= dados ================= */

  async function loadHistory(p) {
    try {
      const h = await K.api('battery.history', { dias: 7 });
      if (!p.alive) return;
      p.history = h || {};
      if (h && h.projection) p.projection = Object.assign({}, h.projection);
      p.charge.draw(p.history, p.b);
      p.health.draw(p.history, p.b);
      p.forecast.update(p.b, false);
      p.tips.update(p.b);
    } catch (e) {
      if (!p.alive) return;
      p.charge.fail(e);
      p.health.fail(e);
    }
  }

  async function loadApps(p) {
    if (!p.alive) return;
    if (document.hidden && !snap()) { p.appsTimer = setTimeout(() => loadApps(p), APPS_MS); return; }
    try {
      const list = await K.api('battery.energyApps', { limite: 8 });
      if (!p.alive) return;
      p.apps.draw(list);
    } catch (e) {
      if (!p.alive) return;
      p.apps.fail(e);
    }
    if (p.alive) p.appsTimer = setTimeout(() => loadApps(p), APPS_MS);
  }

  function apply(p, b, first) {
    p.b = b;
    for (const part of p.live_parts) {
      try { part.update(b, first); } catch (e) { console.error('bateria: ' + (e && (e.stack || e.message))); }
    }
  }

  async function tick(p) {
    if (!p.alive) return;
    if (!document.hidden || snap()) {
      try {
        const b = await K.api('battery.now');
        if (!p.alive) return;
        if (b && b.present) apply(p, b, false);
      } catch (e) { /* uma leitura perdida não quebra a tela */ }
    }
    if (p.alive) p.liveTimer = setTimeout(() => tick(p), LIVE_MS);
  }

  /* ================= página ================= */

  K.pages.bateria = {
    title: 'Bateria',

    async render(el) {
      if (P) K.pages.bateria.destroy();
      const p = P = { el, alive: true, charts: [], mascot: null, b: null, projection: null, plugShare: null, live_parts: [] };

      let b, info;
      try {
        [b, info] = await Promise.all([
          K.api('battery.now'),
          K.cached('battery.info', null, 3600e3).catch(() => null),
        ]);
      } catch (e) {
        if (!p.alive) return;
        el.appendChild(pageHead(p, null));
        p.liveBadge.hidden = true;
        renderFail(p, e);
        return;
      }
      if (!p.alive) return;
      el.appendChild(pageHead(p, info));
      if (!b || !b.present) { if (p.liveBadge) p.liveBadge.hidden = true; renderNoBattery(p, b, info); return; }

      let settings = K.settings.value;
      if (!settings) settings = await K.settings.load().catch(() => null);
      if (!p.alive) return;

      const hero = heroPart(p, b);
      const tiles = [cyclesTile(p), tempTile(p), energyTile(p), (p.forecast = forecastTile(p))];
      const live = livePart(p);
      const cells = cellsPart(p);
      p.charge = chargePart(p);
      p.health = healthPart(p);
      p.apps = appsPart(p);
      const alerts = alertsPart(p, settings);
      p.tips = tipsPart(p);

      el.appendChild(sectionNav(p));
      hero.node.dataset.secao = 'resumo';
      el.appendChild(hero.node);
      el.appendChild(K.el('div', { class: 'bt-tiles' }, tiles.map((t) => t.node)));
      el.appendChild(K.el('div', { class: 'bt-row bt-row-live', dataset: { secao: 'ao-vivo' } }, live.node, cells.node));
      p.charge.node.dataset.secao = 'historico';
      el.appendChild(p.charge.node);
      p.apps.node.dataset.secao = 'apps';
      el.appendChild(K.el('div', { class: 'bt-row bt-row-hist' }, p.health.node, p.apps.node));
      alerts.node.dataset.secao = 'avisos';
      p.tips.node.dataset.secao = 'cuidados';
      el.appendChild(K.el('div', { class: 'bt-row bt-row-care' }, alerts.node, p.tips.node));

      p.live_parts = [hero].concat(tiles, [live, cells, p.tips]);
      apply(p, b, true);

      /* histórico e apps em paralelo: as ferramentas que o Kamurafy roda (pmset, top) saem da lista */
      loadHistory(p);
      loadApps(p);
      p.liveTimer = setTimeout(() => tick(p), LIVE_MS);

      /* veio de outra tela pedindo uma parte (#/bateria?secao=apps) */
      const want = /[?&]secao=([\w-]+)/.exec(location.hash);
      if (want) setTimeout(() => { if (p.alive) scrollToSection(p, want[1], false); }, 60);
    },

    destroy() {
      const p = P;
      P = null;
      if (!p) return;
      p.alive = false;
      if (p.offScroll) p.offScroll();
      clearTimeout(p.liveTimer);
      clearTimeout(p.appsTimer);
      for (const ch of p.charts) { try { ch.destroy(); } catch (e) { /* já foi */ } }
      p.charts = [];
      if (p.mascot) { try { p.mascot.destroy(); } catch (e) { /* já foi */ } }
      K.tooltip.hide();
    },
  };
})();
