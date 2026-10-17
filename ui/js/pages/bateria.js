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
    if (!isNum(w)) return K.t('sem leitura');
    if (Math.abs(w) < 0.05) return K.t('0 W');
    return K.fmt.watts(w) + (w > 0 ? ' entrando' : ' saindo');
  }
  const hoursTxt = (s) => {
    if (!isNum(s) || s < 60) return K.t('0 min');
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
    { from: TEMP_MIN, to: 35, tone: 'good', label: K.t('Tranquila'), icon: 'check', txt: K.t('Abaixo de 35 °C é o ideal.') },
    { from: 35, to: 40, tone: 'warn', label: K.t('Morna'), icon: 'eye', txt: K.t('Normal com o Mac trabalhando.') },
    { from: 40, to: 45, tone: 'serious', label: K.t('Quente'), icon: 'flame', txt: K.t('Calor acelera o desgaste. Feche o que estiver pesado.') },
    { from: 45, to: TEMP_MAX, tone: 'crit', label: K.t('Muito quente'), icon: 'alert', txt: K.t('Quente demais. Deixe esfriar, longe de almofada e cobertor.') },
  ];
  const tempZone = (t) => (isNum(t) ? TEMP.find((z) => t < z.to) || TEMP[TEMP.length - 1] : null);

  function cellVerdict(spread) {
    if (!isNum(spread)) return null;
    if (spread <= 20) return { tone: 'good', icon: 'check', label: K.t('Equilibradas'), txt: K.t('Parelhas, como numa bateria saudável.') };
    if (spread <= 50) return { tone: 'warn', icon: 'eye', label: K.t('Leve diferença'), txt: K.t('Uma célula um pouco atrás. Costuma se acertar depois de uma carga completa.') };
    return { tone: 'serious', icon: 'alert', label: K.t('Desequilibradas'), txt: K.t('Uma célula bem diferente faz a carga acabar antes. Se durar dias, vale uma revisão.') };
  }

  const APPLE = {
    normal: { tone: 'good', icon: 'btShield', label: K.t('Normal'), txt: K.t('O macOS não vê problema.') },
    revisao: { tone: 'crit', icon: 'alert', label: K.t('Revisão recomendada'), txt: K.t('O próprio macOS sugere levar pra revisão.') },
    falha: { tone: 'crit', icon: 'alert', label: K.t('Falha registrada'), txt: K.t('O chip da bateria registrou uma falha permanente.') },
  };

  /** o que a bateria está fazendo agora, em uma linha */
  function stateOf(b) {
    const pct = b.percent;
    const hot = isNum(b.temperatureC) && b.temperatureC >= 40;
    let r;
    if (b.isCharging == null && b.pluggedIn == null) {
      /* o Mac não disse se está na tomada: não dá pra afirmar "na bateria" */
      r = { key: 'unknown', icon: 'info', title: K.t('Tomada sem leitura'), sub: K.t('o Mac não informou agora'), bubble: '' };
    } else if (b.isCharging) {
      let t;
      if (b.optimizedChargingEngaged) t = K.t('no ritmo otimizado do macOS');
      else if (isNum(b.minutesToFull) && b.minutesToFull > 0) t = K.t('cheia em {0}', K.fmt.mins(b.minutesToFull));
      else if (b.finishingCharge) t = K.t('terminando devagar');
      else t = K.t('calculando o tempo…');
      r = { key: 'charging', icon: 'bolt', title: K.t('Carregando'), sub: t, bubble: K.t('Enchendo o tanque!') };
    } else if (b.pluggedIn) {
      if (K.batTopping(b)) r = { key: 'topping', icon: 'bolt', title: K.t('Na tomada'), sub: K.t('terminando de encher, devagar'), bubble: K.t('Quase cheia!') };
      else if (b.fullyCharged || (isNum(pct) && pct >= 99)) r = { key: 'full', icon: 'moon', title: K.t('Cheia e na tomada'), sub: K.t('descansando'), bubble: K.t('Zzz… tô cheia.') };
      else if (b.optimizedChargingEngaged) r = { key: 'held', icon: 'plug', title: K.t('Na tomada'), sub: K.t('o macOS segurou a carga'), bubble: K.t('Segurando aqui.') };
      else r = { key: 'plugged', icon: 'plug', title: K.t('Na tomada'), sub: K.t('sem carregar agora'), bubble: K.t('Só descansando.') };
    } else {
      const m = isNum(b.minutesToEmpty) && b.minutesToEmpty > 0 && b.minutesToEmpty < 48 * 60 ? b.minutesToEmpty : null;
      r = { key: 'battery', icon: 'battery', title: K.t('Na bateria'), sub: m ? K.t('dura mais {0}', K.fmt.mins(m)) : K.t('calculando quanto dura…'), bubble: isNum(pct) && pct <= 20 ? K.t('Tô ficando fraquinha…') : K.t('Tô firme!') };
    }
    const sk = K.batStatusKey(b);
    if (hot) { r.sub += K.t(' · quente'); r.bubble = K.t('Ufa, que calor!'); }
    else if (sk === 'trocar') r.bubble = K.t('Tô pedindo revisão.');
    else if (sk === 'gasta' && r.key !== 'full') r.bubble = K.t('Já guardo menos que antes.');
    else if (sk === 'desconhecida' && r.key !== 'charging') r.bubble = K.t('Não consegui medir minha saúde.');
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
    p.liveText = K.el('span', null, K.t('Ao vivo'));
    const live = K.el('span', { class: 'live-badge', role: 'status', title: K.t('Lendo a bateria a cada 2 segundos') }, K.el('i', { class: 'live-dot' }), p.liveText);
    p.liveBadge = live;
    const side = K.el('div', { class: 'bt-head-side' });
    if (info && info.model) side.appendChild(K.el('span', { class: 'sticker bt-model', title: info.model }, K.fmt.model(info.model)));
    side.appendChild(live);
    return K.el('header', { class: 'page-head bt-head', 'data-drag': true },
      K.el('div', null,
        K.el('h1', null, K.t('Bateria')),
        K.el('p', null, K.t('Como ela está e como fazer durar mais.'))),
      side);
  }

  /* ---------- fichas de seção (grudam no topo ao rolar) ---------- */
  const SECTIONS = [
    { id: 'resumo', label: K.t('Resumo'), icon: 'heart' },
    { id: 'ao-vivo', label: K.t('Ao vivo'), icon: 'btWave' },
    { id: 'historico', label: K.t('Histórico'), icon: 'chart' },
    { id: 'avisos', label: K.t('Avisos'), icon: 'bell' },
    { id: 'cuidados', label: K.t('Cuidados'), icon: 'leaf' },
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
    const bar = K.el('nav', { class: 'bt-nav', 'aria-label': K.t('Partes da tela') });
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
      K.el('div', { class: 'bt-charge' }, chargeN, K.el('span', { class: 'bt-charge-u' }, '%'), K.el('span', { class: 'bt-charge-l' }, K.t('de carga'))),
      K.el('div', { class: 'bt-state' }, stateIc, stateTx));

    const healthN = K.el('span', { class: 'bt-hn num' });
    const healthU = K.el('span', { class: 'bt-hu' }, '%');
    const pillBox = K.el('div', { class: 'bt-hpill' });
    const txt = K.el('p', { class: 'bt-htxt' });
    const meterBox = K.el('div', { class: 'bt-hm-box' });
    const appleBox = K.el('div', { class: 'bt-apple' });
    let osc = null;
    const right = K.el('div', { class: 'bt-health' },
      K.el('div', { class: 'bt-eyebrow' }, K.t('Saúde da bateria')),
      K.el('div', { class: 'bt-hrow' }, K.el('div', { class: 'bt-hval hero-value' }, healthN, healthU), pillBox),
      txt, meterBox,
      K.el('div', { class: 'bt-hfoot' },
        appleBox,
        (osc = K.el('p', { class: 'bt-osc' }, icon('info'),
          K.el('span', null, K.t('Oscila 1 ou 2 pontos entre cargas: vale a tendência.'))))));
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
        lost >= 0.5 ? K.el('span', { class: 'bt-hm-capr' }, K.t(' · perdeu {0}% desde nova', K.fmt.num(lost, 0))) : null);
      meterBox.appendChild(K.el('div', { class: 'bt-hm', role: 'img', 'aria-label': K.t('Saúde {0} da capacidade de fábrica; a marca de 80% é onde a Apple considera gasta.', K.fmt.pct(h)) },
        cap,
        K.el('div', { class: 'bt-hm-bar' }, track, K.el('i', { class: 'bt-hm-mark', style: { left: '80%' } })),
        K.el('div', { class: 'bt-hm-scale' },
          K.el('span', { style: { left: '0' } }, '0%'),
          K.el('span', { class: 'bt-hm-ml', style: { right: '20%' } }, K.t('gasta abaixo de 80%')),
          K.el('span', { style: { right: '0' } }, '100%'))));
    }

    function update(b, first) {
      const st = statusOf(b);
      const s = stateOf(b);
      const full = !!(b.pluggedIn && !b.isCharging && isNum(b.percent) && b.percent >= 99) && !K.batTopping(b);
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
        if (!isNum(h)) setText(healthN, K.t('Sem leitura'));
        else if (first) countTo(healthN, h, (v) => K.fmt.num(v, 1), true);
        else setText(healthN, K.fmt.num(h, 1));
        healthN.classList.remove('no-read');
        healthU.hidden = !isNum(h);
        if (osc) osc.hidden = !isNum(h);
        pillBox.textContent = '';
        if (isNum(h) || b.status === 'trocar') pillBox.appendChild(K.statusPill(st.tone, st.label, st.icon, true));
        txt.textContent = '';
        if (isNum(b.maxMah) && isNum(b.designMah)) {
          txt.append(K.t('Guarda '), K.el('span', { class: 'bt-strong' }, K.fmt.num(b.maxMah) + ' mAh'),
            ' dos ', K.el('span', { class: 'bt-strong' }, K.fmt.num(b.designMah) + ' mAh'),
            K.t(' de fábrica.'));
        } else if (isNum(h)) {
          txt.append(K.t('Quanto ela ainda guarda da capacidade de fábrica.'));
        } else {
          txt.append(K.t('O Mac não informou a capacidade agora. Tente de novo daqui a pouco.'));
        }
        meter(h);
        last.h = h; last.status = b.status;
      }
      if (first || b.appleCondition !== last.cond) {
        appleBox.textContent = '';
        const a = APPLE[b.appleCondition];
        appleBox.appendChild(K.el('span', { class: 'bt-apple-l' }, K.t('Condição pela Apple')));
        if (a) {
          appleBox.appendChild(K.statusPill(a.tone, a.label, a.icon));
          appleBox.appendChild(K.el('span', { class: 'bt-apple-t' }, a.txt));
        } else appleBox.appendChild(K.el('span', { class: 'bt-apple-t' }, K.t('Não informada por este Mac.')));
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
    const t = tile('cycle', K.t('Ciclos'), 80);
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
        if (!isNum(c)) t.txt.textContent = K.t('O Mac não informou os ciclos.');
        else if (isNum(d) && c >= d) t.txt.textContent = K.t('Passou dos {0} ciclos previstos: só indica desgaste.', K.fmt.num(d));
        else t.txt.textContent = K.t('Um ciclo é 100% de carga gasta, mesmo em partes.');
      },
    };
  }

  function tempTile(p) {
    const t = tile('thermo', K.t('Temperatura'), 140);
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
          t.txt.textContent = z ? z.txt : K.t('O Mac não informou a temperatura.');
          t.ic.className = 'head-ic' + (z && z.tone !== 'good' ? ' ' + z.tone : '');
        }
      },
    };
  }

  function energyTile(p) {
    const t = tile('bolt', K.t('Energia'), 200);
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
          if (dir === 'in') { flow.append(node('plug'), arrow, node('battery')); flowTx.textContent = K.t('entrando na bateria'); }
          else if (dir === 'out') { flow.append(node('battery'), arrow, node('btLaptop')); flowTx.textContent = K.t('saindo da bateria pro Mac'); }
          else if (dir === 'direct') { flow.append(node('plug'), arrow, node('btLaptop')); flowTx.textContent = K.t('O Mac usa o carregador direto e a bateria descansa.'); }
          else if (dir === 'idle') { flow.append(node('battery'), arrow, node('btLaptop')); flowTx.textContent = K.t('Quase nada saindo agora.'); }
          else { flowTx.textContent = K.t('O Mac não informou a energia agora.'); }
          t.ic.className = 'head-ic' + (dir === 'out' ? ' s2' : dir === 'in' ? ' s1' : '');
        }
        /* na tomada sem carregar, o medidor diz quanto o Mac inteiro puxa do carregador */
        if (dir === 'direct') {
          flowTx.textContent = isNum(b.systemWatts)
            ? K.t('O Mac puxa {0} direto do carregador.', K.fmt.watts(b.systemWatts))
            : K.t('O Mac usa o carregador direto e a bateria descansa.');
        }
        /* carregador e bateria em linhas separadas: 12,6 V é da bateria, não do carregador */
        adapter.textContent = '';
        const a = b.adapter;
        if (b.pluggedIn == null) { /* sem leitura da tomada: não afirma nada sobre o carregador */ }
        else if (b.pluggedIn) {
          adapter.appendChild(K.el('span', null, a && isNum(a.watts) && a.watts > 0 ? K.t('Carregador de {0} W', K.fmt.num(a.watts)) : K.t('Carregador ligado')));
          if (a && isNum(a.voltageV) && isNum(a.currentA)) adapter.appendChild(K.el('span', { class: 'bt-adapter-d num' }, K.t('Carregador: {0} V · {1} A', K.fmt.num(a.voltageV, 0), K.fmt.num(a.currentA, a.currentA % 1 ? 1 : 0))));
        } else adapter.appendChild(K.el('span', null, K.t('Sem carregador')));
        if (isNum(b.voltageV) && isNum(b.amperageMa)) {
          const amp = Math.abs(b.amperageMa) / 1000;
          adapter.appendChild(K.el('span', { class: 'bt-adapter-d num' }, K.t('Bateria: {0} V · {1} A', K.fmt.num(b.voltageV, 1), amp < 0.05 ? '0' : K.fmt.num(amp, 1))));
        }
      },
    };
  }

  function forecastTile(p) {
    const t = tile('crystal', K.t('Previsão'), 260);
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
          t.txt.textContent = K.t('Sem saúde e ciclos agora, não dá pra estimar.');
          return;
        }
        n.classList.remove('no-read');
        if (h <= 80) {
          t.val.classList.add('word');
          n.textContent = K.t('Já passou');
          unit.textContent = K.t('dos 80%');
          t.vis.hidden = true;
          t.txt.textContent = K.t('Continua funcionando, só dura menos por carga.');
          return;
        }
        if (pj.method === 'sem-dados' || !isNum(pj.cyclesTo80)) {
          t.val.classList.add('word');
          n.textContent = K.t('Cedo demais');
          unit.textContent = '';
          t.vis.hidden = true;
          t.txt.textContent = K.t('Quase não gastou. Volte daqui a alguns ciclos.');
          return;
        }
        countTo(n, pj.cyclesTo80, (v) => '~' + K.fmt.num(v, 0), first);
        unit.textContent = K.t('ciclos até 80%');
        const done = isNum(b.cycles) ? b.cycles : 0;
        const total = done + pj.cyclesTo80;
        if (total > 0) {
          const f = (done / total) * 100;
          bar.append(K.el('span', { class: 'bt-fc-done', style: { width: f + '%' } }), K.el('span', { class: 'bt-fc-now', style: { left: f + '%' } }));
          marks.append(K.el('span', null, K.t('nova')), K.el('span', null, K.t('hoje')), K.el('span', null, '80%'));
          marks.children[1].style.left = clamp(f, 12, 88) + '%';
        }
        if (isNum(pj.dateTo80)) {
          when.append(icon('btCalendar'), K.el('span', null, K.t('por volta de ') + K.fmt.monthYear(pj.dateTo80)));
        }
        if (pj.method === 'historico') t.txt.textContent = K.t('Estimativa pela tendência dos seus dias.');
        else t.txt.textContent = K.t('Estimativa pelo desgaste médio até hoje.');
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
    const nowL = K.el('span', { class: 'bt-now-l' }, K.t('agora'));
    const btn = K.el('button', { class: 'btn small bt-pause', type: 'button' });
    const paint = () => {
      btn.innerHTML = K.icon(p.live.paused ? 'play' : 'pause');
      btn.appendChild(document.createTextNode(p.live.paused ? K.t('Continuar') : K.t('Pausar')));
      btn.setAttribute('aria-pressed', String(p.live.paused));
      if (p.liveBadge) p.liveBadge.classList.toggle('paused', p.live.paused);
      if (p.liveText) p.liveText.textContent = p.live.paused ? K.t('Pausado') : K.t('Ao vivo');
    };
    p.live = { pts: [], paused: false, chart: null };
    btn.addEventListener('click', () => {
      K.sound.plop();
      p.live.paused = !p.live.paused;
      paint();
      if (!p.live.paused) draw();
    });
    paint();
    c.appendChild(head('btWave', K.t('Energia ao vivo'), K.t('Watts entrando ou saindo, a cada 2 segundos.'),
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
          name: K.t('Energia'), color: 'var(--s2)',
          yZero: true,
          tipFormat: (v) => wattsTxt(v),
          yFormat: (v) => (v > 0 ? '+' : '') + K.charts.num(v, Number.isInteger(v) ? 0 : 1) + ' W',
          xFormat: 'ago',
          signs: [K.t('entrando'), K.t('saindo')],
          yTicks: 4,
          gap: 12,
          gapStyle: 'none',
          height: 200,
          table: { xLabel: K.t('Quando'), order: 'desc' },
          empty: p.live.noWatts ? K.t('O Mac não está informando a energia da bateria agora.') : K.t('Medindo… o primeiro número chega em 2 segundos.'),
          ariaLabel: K.t('Energia da bateria nos últimos 3 minutos'),
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
        setText(nowL, !f ? 'agora' : f.dir === 'in' ? K.t('agora, entrando') : f.dir === 'out' ? K.t('agora, saindo') : 'agora');
        if (!isNum(b.watts) && !p.live.pts.length) {
          if (p.live.chart) p.live.chart.update({ empty: K.t('O Mac não está informando a energia da bateria agora.') });
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
        const k = b.isCharging || K.batTopping(b) ? 'c' : b.pluggedIn ? 'p' : b.pluggedIn == null ? 'x' : 'b';
        if (k !== lastNote) {
          lastNote = k;
          note.textContent = k === 'c' ? K.t('Acima do zero, entrando. Perto de cheia, o macOS carrega mais devagar.')
            : k === 'p' ? K.t('Perto do zero: o Mac usa o carregador direto.')
              : k === 'x' ? K.t('Acima do zero, entrando; abaixo, gastando.')
                : K.t('Abaixo do zero, gastando. Os picos são o Mac trabalhando mais forte.');
        }
      },
    };
  }

  /* ---------- células ---------- */
  function cellsPart(p) {
    const c = card('bt-cellscard', 380);
    c.appendChild(head('cells', K.t('Células'), K.t('Tensão de cada célula agora.')));
    /* o que importa é a diferença entre elas: ela é o número do cartão */
    const spreadN = K.el('span', { class: 'num' });
    const top = K.el('div', { class: 'bt-cells-top' },
      K.el('div', { class: 'bt-cells-v' }, spreadN, K.el('small', null, K.t('de diferença'))));
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
            row.appendChild(K.el('div', { class: 'empty' }, K.t('Este Mac não informa a tensão de cada célula.')));
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
          setText(q.tag, spread > 20 && mv === lo ? K.t('a mais baixa') : '');
          q.el.classList.toggle('low', spread > 20 && mv === lo);
        });
        setText(spreadN, K.fmt.num(spread) + ' mV');
        const vd = cellVerdict(spread);
        const key = vd ? vd.label + spread : 'x';
        if (key !== lastV) {
          lastV = key;
          verdict.textContent = '';
          if (vd) verdict.appendChild(K.statusPill(vd.tone, vd.label, vd.icon));
          txt.textContent = vd ? K.t('{0} Até 20 mV é normal.', vd.txt) : '';
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
      const wd = d.toLocaleDateString(K.locale || 'pt-BR', { weekday: 'short' }).replace('.', '');
      rows.push([`${wd}, ${K.fmt.day(a)}`, mn == null ? '—' : K.fmt.pct(mn, 0), mx == null ? '—' : K.fmt.pct(mx, 0), hoursTxt(pl)]);
      d.setDate(d.getDate() - 1);
    }
    return rows;
  }

  const FONTE = { macos: K.t('do registro do macOS'), kamurafy: K.t('medido pelo Kamurafy'), agora: K.t('leitura de agora') };

  function chargePart(p) {
    const c = card('bt-chargecard', 440);
    const chips = K.el('div', { class: 'bt-chips' });
    c.appendChild(head('chart', K.t('Carga nos últimos 7 dias'), null));
    const box = K.el('div', { class: 'bt-chargechart' }, K.el('div', { class: 'loading' }, K.t('Lendo o histórico do macOS…')));
    const note = K.el('p', { class: 'bt-note' });
    c.append(chips, box, note);

    function chip(label, value) {
      return K.el('span', { class: 'bt-chip' }, K.el('span', { class: 'bt-chip-v num' }, value), K.el('span', { class: 'bt-chip-l' }, label));
    }

    return {
      node: c,
      fail(e) {
        box.textContent = '';
        /* o mesmo cartão de erro das outras telas, na versão compacta (cabe dentro do cartão) */
        box.appendChild(K.errorCard({ compact: true, title: K.t('Não consegui ler o histórico agora'), reason: (e && e.message) || K.t('o macOS não respondeu'),
          retry: () => { box.textContent = ''; box.appendChild(K.el('div', { class: 'loading' }, K.t('Tentando de novo…'))); loadHistory(p); },
          retryHint: K.t('Leva uns 4 segundos.') }));
      },
      draw(h, b) {
        box.textContent = '';
        const now = Date.now() / 1000;
        const lo = now - 7 * DAY;
        const carga = ((h && h.carga) || []).filter((q) => q && isNum(q.t) && q.t >= lo - DAY).slice();
        if (b && isNum(b.percent) && isNum(b.readAt) && (!carga.length || b.readAt > carga[carga.length - 1].t + 60)) {
          carga.push({ t: b.readAt, pct: b.percent, plugged: !!b.pluggedIn, fonte: 'agora' });
        }
        const bands = K.charts.runs(carga, (q) => q.plugged, { label: K.t('Na tomada') });
        keep(p, K.charts.area(box, {
          name: K.t('Carga'),
          points: carga.map((q) => ({ x: q.t, y: q.pct, fonte: q.fonte })),
          yMin: 0, yMax: 100,
          yFormat: (v) => K.fmt.pct(v, 0),
          xMin: lo, xMax: now,
          bands,
          bandStyle: 'track',
          gap: 3 * 3600,
          gapLabel: K.t('horas sem leitura'),
          height: 240,
          tooltip: (x, hits, def) => {
            const raw = hits[0] && hits[0].raw;
            if (raw && FONTE[raw.fonte]) def.rows.push({ value: '', name: FONTE[raw.fonte] });
            return def;
          },
          table: {
            rows: () => ({ head: [K.t('Dia'), K.t('Menor'), K.t('Maior'), K.t('Na tomada (estimado)')], rows: dayRows(carga, bands, now), order: K.t('mais recentes primeiro') }),
          },
          empty: K.t('Ainda sem histórico. Eu anoto enquanto fico aberto.'),
          ariaLabel: K.t('Carga da bateria nos últimos 7 dias'),
        }));

        const stt = chargeStats(carga, bands, lo, now);
        p.plugShare = stt.share;
        chips.textContent = '';
        if (carga.length > 1) {
          if (stt.share != null) chips.appendChild(chip(K.t('do tempo na tomada'), '~' + K.fmt.num(stt.share * 100, 0) + '%'));
          if (stt.full >= 3600) chips.appendChild(chip(K.t('parada em 100%'), K.fmt.roughDuration(stt.full)));
          if (stt.min != null) chips.appendChild(chip(K.t('a mais baixa'), K.fmt.pct(stt.min, 0)));
        }
        const onlyMac = carga.every((q) => q.fonte !== 'kamurafy');
        note.textContent = onlyMac
          ? K.t('Pontos do registro do macOS, de tempos em tempos. Com o Kamurafy aberto, anoto a cada 5 minutos.')
          : K.t('Os pontos antigos são do macOS. Com o Kamurafy aberto, anoto a cada 5 minutos.');
      },
    };
  }

  /* ---------- saúde ao longo do tempo ---------- */
  const HEALTH_DAYS = 14;   // antes disso, o gráfico é saúde × ciclos (tem sentido desde o 1º dia)

  function healthPart(p) {
    const c = card('bt-healthcard', 500);
    const hd = head('heart', K.t('Saúde ao longo do tempo'), K.t('Um ponto por dia, com a linha dos 80%.'));
    const sub = hd.querySelector('.card-sub');
    c.appendChild(hd);
    const box = K.el('div', { class: 'bt-healthchart' }, K.el('div', { class: 'loading' }, K.t('Juntando os dias…')));
    const notes = K.el('div', { class: 'bt-hnotes' });
    c.append(box, notes);

    const pct = (v) => K.fmt.pct(v, 1);
    const yFormat = (v) => K.fmt.pct(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 1);
    const REF = [{ y: 80, label: K.t('80% · a Apple considera gasta abaixo disso'), short: '80%' }];

    /** poucos dias: saúde × ciclos, de nova (0 ciclos, 100%) até hoje, e o ritmo até os 80% */
    function byCycles(b, pj) {
      const h = b.healthPct, cy = b.cycles;
      const series = [{ name: K.t('Saúde'), points: [{ x: 0, y: 100, tag: 'nova' }, { x: cy, y: h, tag: 'hoje', maxMah: b.maxMah }], dots: true, format: pct, endLabel: K.t('hoje · {0}', pct(h)) }];
      let xMax = Math.max(cy * 1.15, 50);
      if (h > 80 && isNum(pj.cyclesTo80) && pj.cyclesTo80 > 0) {
        const end = cy + pj.cyclesTo80;
        series.push({ name: K.t('No ritmo de hoje'), dash: true, points: [{ x: cy, y: h }, { x: end, y: 80, tag: 'previsao' }],
          /* o ponto fica em ~420 no eixo: o rótulo diz onde ele está (o "faltam ~171" fica no cartão Previsão) */
          endLabel: K.t('80% em ~{0} ciclos', K.fmt.num(end)), format: (v) => '≈ ' + K.fmt.pct(v, 0) });
        xMax = end * 1.04;
      }
      sub.textContent = K.t('Saúde por ciclos, de nova até hoje.');
      return {
        series, xType: 'num', xMin: 0, xMax,
        xFormat: (v) => K.fmt.num(v),
        tipTitle: (x) => (x === 0 ? K.t('Nova · 0 ciclos') : `${K.fmt.num(x)} ciclos`),
        tooltip: (x, hits, def) => {
          const raw = hits[0] && hits[0].raw;
          if (raw && raw.tag === 'nova') def.rows.push({ value: '', name: K.t('quando saiu da fábrica') });
          if (raw && raw.tag === 'hoje' && isNum(raw.maxMah)) def.rows.push({ value: K.fmt.num(raw.maxMah) + ' mAh', name: K.t('guardados hoje') });
          if (raw && raw.tag === 'previsao') def.rows.push({ value: '', name: K.t('se o desgaste seguir no ritmo de hoje') });
          return def;
        },
        table: { xLabel: K.t('Ciclos'), order: 'asc' },
        ariaLabel: K.t('Saúde da bateria pelos ciclos, de nova até hoje, com a projeção até 80%'),
      };
    }

    /** 2 semanas ou mais: um ponto por dia; o eixo termina hoje (ou na data prevista pros 80%) */
    function byDays(s, pj) {
      const now = Date.now() / 1000;
      const series = [{ name: K.t('Saúde'), points: s, format: pct, dots: s.length <= 60 }];
      let xMax = now;
      if (isNum(pj.dateTo80) && s.length) {
        const u = s[s.length - 1];
        series.push({ name: K.t('Projeção'), dash: true, points: [{ x: u.x, y: u.y }, { x: pj.dateTo80, y: 80 }],
          endLabel: '~' + K.fmt.monthYear(pj.dateTo80), format: (v) => '≈ ' + K.fmt.pct(v, 0) });
        xMax = Math.max(now, pj.dateTo80);
      }
      sub.textContent = K.t('Um ponto por dia, com a linha dos 80%.');
      return {
        series, xMin: Math.min(s[0].x, now - HEALTH_DAYS * DAY), xMax,
        tipTitle: K.fmt.day,
        tooltip: (x, hits, def) => {
          const raw = hits[0] && hits[0].raw;
          if (raw && isNum(raw.maxMah)) def.rows.push({ value: K.fmt.num(raw.maxMah) + ' mAh', name: K.t('guardados') });
          if (raw && isNum(raw.cycles)) def.rows.push({ value: K.fmt.num(raw.cycles), name: K.t('ciclos') });
          return def;
        },
        table: { xLabel: K.t('Dia') },
        ariaLabel: K.t('Saúde da bateria ao longo do tempo'),
      };
    }

    return {
      node: c,
      fail() {
        box.textContent = '';
        box.appendChild(K.el('div', { class: 'empty' }, K.t('Sem o histórico agora. Tente de novo daqui a pouco.')));
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
        else o = { series: [], ariaLabel: K.t('Saúde da bateria ao longo do tempo') };
        keep(p, K.charts.line(box, Object.assign({
          yFormat, refs: REF, height: 210,
          empty: K.t('Sem leitura de saúde ainda. Eu anoto um ponto por dia.'),
        }, o)));

        if (cyclesMode) {
          notes.appendChild(K.el('div', { class: 'tip bt-tipnote' }, icon('clock'),
            K.el('p', null, K.t('A reta é a média desde nova. A curva aparece com os pontos diários.'))));
        }
        const m = pj.method;
        let how;
        if (isNum(b.healthPct) && b.healthPct <= 80) how = K.t('Já passou dos 80%: agora importa se a carga aguenta o seu dia.');
        else if (m === 'historico') how = K.t('Previsão por uma reta nos seus {0} dias de pontos. É estimativa, não promessa.', K.fmt.num(pj.daysOfData));
        else if (m === 'ciclos' && isNum(b.healthPct)) {
          how = K.t('Perdeu {0} pontos em {1} ciclos. Nesse ritmo, faltam ~{2} ciclos até 80%. É estimativa, não promessa.', K.fmt.num(100 - b.healthPct, 1), K.fmt.num(b.cycles), K.fmt.num(pj.cyclesTo80));
          if (!isNum(pj.dateTo80)) how += K.t(' A data aparece depois de 2 semanas.');
        } else if (!isNum(b.healthPct)) how = K.t('Sem a saúde agora, não dá pra calcular o ritmo.');
        else how = K.t('Quase não gastou: ainda não dá pra prever.');
        notes.appendChild(K.el('p', { class: 'bt-note' }, how));
      },
    };
  }

  /* ---------- quem mais gasta ---------- */
  function appsPart(p) {
    const c = card('bt-appscard', 560);
    c.appendChild(head('apps', K.t('Quem mais gasta bateria'), K.t('Impacto energético agora, a cada 20 segundos.')));
    const box = K.el('div', { class: 'bt-appschart' }, K.el('div', { class: 'loading' }, K.t('Olhando os apps…')));
    const note = K.el('p', { class: 'bt-note' }, K.t('A medida do Monitor de Atividade: não é watt, serve pra comparar.'));
    c.append(box, note);
    let ch = null;
    return {
      node: c,
      fail(e) {
        if (ch) return;   // já tem lista: mantém a última
        box.textContent = '';
        box.appendChild(K.el('div', { class: 'empty' }, K.t('Não consegui olhar os apps agora. Tento de novo em alguns segundos.')));
      },
      draw(list) {
        const items = K.energyItems(list, { min: 0.1 });
        const opts = {
          items, color: 'var(--s2)', valueName: K.t('de impacto'), labelName: K.t('App'), labelWidth: 240, table: true,
          format: (v) => K.fmt.num(v, v < 10 ? 1 : 0),
          empty: K.t('Tudo calmo: nenhum app gastando agora.'),
        };
        if (!ch) { box.textContent = ''; ch = keep(p, K.charts.bars(box, opts)); } else ch.update(opts);
      },
    };
  }

  /* ---------- avisos ---------- */
  function alertsPart(p, settings) {
    const c = card('bt-alertscard', 620);
    c.appendChild(head('bell', K.t('Avisos'), K.t('Uma notificação na hora certa.')));
    const ok = !!settings;
    const s = Object.assign({ aviso80: true, limiteAviso: 80, avisoQuente: true }, settings || {});
    const err = K.el('p', { class: 'bt-err-t', hidden: true });
    const t1 = K.el('b');
    const nTitle = K.el('span', { class: 'bt-notif-t' });
    const nBody = K.el('span', { class: 'bt-notif-b' });
    const preview = K.el('div', { class: 'bt-notif-wrap' },
      K.el('span', { class: 'bt-notif-l' }, K.t('É assim que o aviso aparece:')),
      K.el('div', { class: 'bt-notif', 'aria-hidden': 'true' },
        K.el('span', { class: 'bt-notif-app', html: K.logo() }),
        K.el('div', { class: 'bt-notif-txt' },
          K.el('div', { class: 'bt-notif-top' }, K.el('span', null, K.t('Kamurafy')), K.el('span', { class: 'bt-notif-when' }, K.t('agora'))),
          nTitle, nBody)));
    const paintT1 = () => {
      t1.textContent = K.avisosTxt.carga(s.limiteAviso);
      /* mesmo texto que o Swift manda (Sampler.swift) */
      nTitle.textContent = K.t('Chegou em {0}%!', s.limiteAviso);
      nBody.textContent = K.t('Pode tirar da tomada. Parar por volta de {0}% ajuda a bateria a durar mais.', s.limiteAviso);
      preview.classList.toggle('off', !s.aviso80);
    };
    paintT1();
    const sw1 = K.el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': String(!!s.aviso80), 'aria-label': K.t('Aviso de carga'), disabled: !ok });
    const sw2 = K.el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': String(!!s.avisoQuente), 'aria-label': K.t('Aviso de calor'), disabled: !ok });
    const lims = K.el('div', { class: 'bt-lims', role: 'radiogroup', 'aria-label': K.t('Limite do aviso de carga') });
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
        err.textContent = K.t('Não consegui salvar agora: ') + ((e && e.message) || K.t('erro desconhecido'));
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

    /* as notificações do macOS estão liberadas pro Kamurafy? */
    const notifTx = K.el('span');
    const notifBtns = K.el('div', { class: 'row bt-notif-btns' });
    const notif = K.el('div', { class: 'setting bt-setting bt-notif-status' },
      K.el('div', { class: 'setting-text' }, K.el('b', null, K.t('Notificações do macOS')), notifTx), notifBtns);
    async function paintNotif(justTested) {
      let st = null;
      try { st = await K.api('notify.status'); } catch (e) { /* sem leitura */ }
      notifBtns.textContent = '';
      if (!st) { notifTx.textContent = K.t('Não consegui ver se estão liberadas.'); return; }
      if (st.permitido) {
        notifTx.textContent = justTested ? K.t('Mandei um aviso de teste agora. Chegou aí?') : K.t('Liberadas. Quer ver como chega?');
        notifBtns.appendChild(K.el('button', { class: 'btn small', type: 'button', html: K.icon('bell'),
          onclick: async () => { K.sound.plop(); try { await K.api('notify.test'); } catch (e) { /* ignora */ } paintNotif(true); } }, K.t('Testar aviso')));
      } else if (st.estado === 'negado') {
        notifTx.textContent = K.t('Desligadas: os avisos não chegam.');
        notifBtns.appendChild(K.el('button', { class: 'btn small gold', type: 'button',
          onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'notificacoes' }).catch(() => {}); } }, K.t('Abrir Ajustes')));
      } else if (st.estado === 'nao-pedido') {
        notifTx.textContent = K.t('O macOS vai pedir permissão. Responda "Permitir".');
      } else {
        notifTx.textContent = K.t('Indisponíveis nesta versão.');
      }
    }

    c.append(
      K.el('div', { class: 'setting bt-setting' },
        K.el('div', { class: 'setting-text' }, t1,
          K.el('span', null, K.avisosTxt.cargaSub)),
        sw1),
      K.el('div', { class: 'bt-limrow' }, K.el('span', { class: 'bt-limrow-l' }, K.t('Avisar em')), lims),
      preview,
      K.el('div', { class: 'setting bt-setting' },
        K.el('div', { class: 'setting-text' }, K.el('b', null, K.avisosTxt.quente),
          K.el('span', null, K.avisosTxt.quenteSub)),
        sw2),
      notif,
      err,
      K.el('p', { class: 'bt-note' }, ok ? K.t('Os avisos chegam com o Kamurafy aberto, mesmo de janela fechada.') : K.t('Não consegui ler suas configurações agora. Abra a tela de novo daqui a pouco.')));
    paintNotif();
    return { node: c };
  }

  /* ---------- cuidados (conforme o estado real) ---------- */
  function tipsFor(b, p) {
    const out = [];
    const t = b.temperatureC;
    if (b.status === 'trocar') {
      out.push({ ic: 'btWrench', tone: 'crit', t: K.t('Hora de uma revisão'), d: 'Procure uma assistência autorizada. Se o Mac estufar ou o trackpad levantar, pare de usar e leve logo.' });
    } else if (b.status === 'gasta') {
      out.push({ ic: 'btWrench', tone: 'serious', t: K.t('Ela já guarda menos'), d: 'Dura menos por carga, mas continua segura. Se incomodar, a troca resolve.' });
    }
    if (isNum(t) && t >= 40) {
      out.push({ ic: 'flame', tone: 'serious', t: K.t('Tá quente agora ({0})', K.fmt.temp(t)), d: 'Deixe as saídas de ar livres e feche o que estiver pesado.' });
    }
    if (b.optimizedChargingEngaged) {
      out.push({ ic: 'btShield', tone: 'good', t: K.t('Carregamento otimizado em ação'), d: 'O macOS segurou em 80% e completa perto da hora de você sair. Pode deixar.' });
    }
    const vive = b.pluggedIn || (isNum(p.plugShare) && p.plugShare >= 0.5);
    if (vive) {
      const share = isNum(p.plugShare) && p.plugShare >= 0.5 ? K.t(' Nos últimos dias: ~{0}% do tempo na tomada.', K.fmt.num(p.plugShare * 100, 0)) : '';
      out.push({ ic: 'plug', t: K.t('Vive na tomada? 20–80% é o ideal'), d: K.t('Ficar parada em 100% o dia todo é o que mais desgasta.') + share });
    } else {
      out.push({ ic: 'battery', t: K.t('Entre 20% e 80% ela sofre menos'), d: 'Evite zerar sempre e passar dias em 100%.' });
    }
    if (!b.optimizedChargingEngaged) {
      out.push({ ic: 'btShield', t: K.t('Deixe o Carregamento otimizado ligado'), d: 'Segura a carga em 80% quando você fica muito na tomada (Ajustes do Sistema › Bateria).' });
    }
    if (b.lowPowerMode) {
      out.push({ ic: 'leaf', t: K.t('Modo pouca energia ligado'), d: b.pluggedIn
        ? K.t('Segura o processador e o brilho. Na tomada, pode desligar.')
        : K.t('Boa: segura o processador e o brilho pra carga render.') });
    } else if (!b.pluggedIn && isNum(b.percent) && b.percent <= 30) {
      out.push({ ic: 'leaf', t: K.t('Carga acabando?'), d: 'O Modo pouca energia (Ajustes do Sistema › Bateria) faz a carga render mais.' });
    }
    if (!(isNum(t) && t >= 40)) {
      out.push({ ic: 'btSun', t: K.t('Fuja do calor'), d: 'Sol, carro fechado e cobertor são os maiores inimigos da bateria.' });
    }
    out.push({ ic: 'btTarget', t: K.t('Limite automático de carga'), d: 'Por enquanto, o aviso de carga faz esse papel.', soon: true });
    return out.slice(0, 5);
  }

  function tipsPart(p) {
    const c = card('bt-tipscard', 680);
    c.appendChild(head('leaf', K.t('Cuidados'), K.t('Pro seu caso, pelo que a bateria mostra agora.')));
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
              K.el('div', { class: 'bt-tip-t' }, x.t, x.soon ? K.el('span', { class: 'bt-soon' }, K.t('em breve')) : null),
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
      ? { pct: null, tone: 'none', face: 'worried', label: K.t('Mascote do Kamurafy preocupado: não achou a bateria') }
      : { pct: null, plugged: true, face: 'happy', label: K.t('Mascote do Kamurafy ligado na tomada, sem bateria') } });
    c.append(
      K.el('h2', null, laptop ? K.t('Não achei a bateria') : K.t('Este Mac vive na tomada')),
      K.el('p', null, laptop
        ? K.t('Não consegui ler a bateria deste {0}. Se continuar assim, vale uma assistência autorizada.', K.fmt.model(model) || 'MacBook')
        : K.t('Mac de mesa não tem bateria pra cuidar. O resto do Kamurafy funciona normal.')),
      K.el('button', { class: 'btn gold', type: 'button', onclick: () => { K.sound.plop(); location.hash = '#/painel'; } }, K.t('Ver ao vivo'), K.el('span', { html: K.icon('arrow') })));
    p.el.appendChild(c);
  }

  function renderFail(p, e) {
    /* o mesmo cartão de erro de todas as telas (K.errorCard) */
    const c = K.errorCard({
      title: K.t('Não consegui ler a bateria agora'),
      text: K.t('O motivo: {0}. Nada foi mexido.', String((e && e.message) || K.t('o macOS não respondeu')).trim().replace(/[.!\s]+$/, '')),
      retry: () => {
        const el = p.el;
        K.pages.bateria.destroy();
        el.textContent = '';
        K.pages.bateria.render(el);
      },
      retryHint: K.t('Leva um segundo.'),
      mascot: { pct: null, tone: 'none' },   // sem leitura: o mascote fica cinza, sem carga inventada
    });
    c.classList.add('pop-in');
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
    title: K.t('Bateria'),

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
