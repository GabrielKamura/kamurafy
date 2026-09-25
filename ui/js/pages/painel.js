/* Kamurafy — Painel: o Mac ao vivo (processador, memória, disco, bateria e sistema).
   system.now a cada 2 s e battery.now a cada 5 s. O DOM é montado uma vez; depois só troca
   texto e classes no lugar (os gráficos redesenham por dentro, sem piscar). Um gráfico com o
   mouse em cima espera o mouse sair pra atualizar, pra dica não sumir enquanto a pessoa lê. */
'use strict';

(function () {
  Object.assign(K.ICONS, {
    laptop: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="2"/><path d="M2.5 15h19l-1.2 3.2a1.5 1.5 0 0 1-1.4 1H5.1a1.5 1.5 0 0 1-1.4-1Z"/>',
    window: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9h18"/><path d="M6.2 6.8h.1M8.7 6.8h.1"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 6.4l2.4-1.8M9.6 19.4 12 17.6l2.4 1.8"/>',
    swap: '<path d="M4 8.5h14.5M15 5l3.5 3.5L15 12"/><path d="M20 15.5H5.5M9 12l-3.5 3.5L9 19"/>',
    stack3: '<path d="M12 3.5 21 8l-9 4.5L3 8Z"/><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',
  });

  const SYS_MS = 2000;
  const BAT_MS = 5000;
  const SLOTS = 60;                      // 60 leituras × 2 s = 2 min na minilinha

  const snap = () => document.documentElement.classList.contains('snap');
  const calm = () => snap() || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v) => (isNum(v) ? v : null);

  /* processador alto um instante não é defeito: nunca vermelho, no máximo "a todo vapor" */
  const CPU_ZONES = [
    { to: 60, tone: 'good', label: 'Tranquilo' },
    { to: 90, tone: 'warn', label: 'Trabalhando' },
    { to: 100, tone: 'serious', label: 'A todo vapor' },
  ];
  const DIRT_WAIT = 2500;    // a olhada na sujeira começa depois das leituras rápidas do começo
  const DIRT_AGE = 120000;   // reaproveita a olhada (da Varredura ou daqui) por 2 min
  const SEED_N = 7;          // leituras rápidas ao abrir, pra minilinha não nascer vazia
  const SEED_MS = 300;
  const SPARK_MIN = 10;      // antes disso, média e pico ainda não dizem muito

  const THERMAL_ORDER = ['normal', 'morno', 'quente', 'critico'];
  const THERMAL = {
    normal: { label: 'Fresco', tone: 'good', icon: 'snow',
      text: 'Fresco e tranquilo. Nada está segurando o desempenho.' },
    morno: { label: 'Morno', tone: 'warn', icon: 'thermo',
      text: 'Um pouco aquecido, o que é comum com o Mac trabalhando ou carregando. Por enquanto o desempenho não muda.' },
    quente: { label: 'Quente', tone: 'serious', icon: 'flame',
      text: 'Esquentou: o macOS já está segurando o processador pra esfriar. Deixe as saídas de ar livres e alivie os apps pesados.' },
    critico: { label: 'Crítico', tone: 'crit', icon: 'flame',
      text: 'Muito quente: o Mac fica bem mais lento pra se proteger. Feche o que estiver pesado e deixe ele respirar num lugar fresco.' },
  };

  const PRESSURE = {
    normal: { label: 'Pressão normal', tone: 'good', icon: 'check',
      text: 'Tem memória de sobra pro que está aberto.' },
    atencao: { label: 'Pressão alta', tone: 'warn', icon: 'eye',
      text: 'Está apertado: o macOS está comprimindo e usando o disco pra dar conta. Fechar abas e apps pesados alivia.' },
    critica: { label: 'Pressão crítica', tone: 'crit', icon: 'alert',
      text: 'Falta memória e o Mac pode engasgar. Feche o que não estiver usando.' },
  };

  const MAC_NAMES = { 11: 'Big Sur', 12: 'Monterey', 13: 'Ventura', 14: 'Sonoma', 15: 'Sequoia', 26: 'Tahoe' };

  /* ---------- formatação ---------- */

  /** Memória em base 2, como o Monitor de Atividade e a Apple ("16 GB"): a mesma função das outras
      telas (K.fmt.mem). Disco usa K.fmt.bytes (base 10). */
  const mem = (v, casas) => K.fmt.mem(v, casas);
  /* começa assim, apagado, até a primeira leitura (nunca um travessão preto) */
  const WAIT = 'medindo…';
  const pctTxt = (v) => (isNum(v) ? K.fmt.pct(v, v > 0 && v < 10 ? 1 : 0) : '—');
  const pct0 = (v) => (isNum(v) ? K.fmt.pct(v, 0) : '—');

  /** "MacBook Pro (16-inch, 2019)" → "MacBook Pro 16″ (2019)" (o mesmo formato das outras telas) */
  function niceModel(m, id) {
    if (!m) return id || 'Mac';
    return K.fmt.model(m);
  }
  function macOSName(v) {
    if (!v) return '—';
    const n = MAC_NAMES[parseInt(v, 10)];
    return n ? `macOS ${n} ${v}` : `macOS ${v}`;
  }
  function ago(sec) {
    sec = Math.round(sec);
    if (sec <= 1) return 'agora';
    if (sec < 60) return `há ${sec} s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    return s ? `há ${m} min ${s} s` : `há ${m} min`;
  }

  /* ---------- estado da página ---------- */

  let S = null;

  function txt(node, s) {
    if (node && node.textContent !== s) node.textContent = s;
  }

  /** número que desliza do valor anterior pro novo (sem refazer o elemento) */
  function tween(node, to, fmt, ms) {
    if (!node) return;
    const from = node._v;
    node._v = to;
    if (node._raf) { cancelAnimationFrame(node._raf); node._raf = 0; }
    /* sem valor: "sem leitura" apagado, nunca um travessão preto */
    if (!isNum(to)) { K.readOr(node, null); return; }
    node.classList.remove('no-read');
    if (!isNum(from) || from === to || calm()) { txt(node, fmt(to)); return; }
    const t0 = performance.now(), dur = ms || 600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      node._raf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    node._raf = requestAnimationFrame(step);
  }

  /** etiqueta de status que só troca quando o conteúdo muda */
  function pill(holder, tone, text, icon, big) {
    const key = [tone, text, icon, big].join('|');
    if (holder._k === key) return;
    holder._k = key;
    holder.textContent = '';
    if (!text) return;
    if (tone) holder.appendChild(K.statusPill(tone, text, icon, big));
    else holder.appendChild(K.el('span', { class: 'status pn-neutral' + (big ? ' big' : ''), html: K.icon(icon || 'info') }, text));
  }

  /** guarda o gráfico pra destruir depois e segura a atualização enquanto o mouse está em cima */
  function live(chart) {
    const me = S;
    me.charts.push(chart);
    const w = {
      chart, hover: false, pending: null,
      set(fn) { if (w.hover) w.pending = fn; else fn(chart); },
    };
    const on = () => { w.hover = true; };
    chart.el.addEventListener('pointerenter', on);
    chart.el.addEventListener('pointermove', on);
    chart.el.addEventListener('pointerleave', () => {
      w.hover = false;
      const p = w.pending;
      w.pending = null;
      if (p && !me.dead) p(chart);
    });
    return w;
  }

  /** laço com setTimeout (nunca empilha chamadas lentas); pula quando pausado ou com a janela escondida */
  function every(ms, fn) {
    const me = S;                      // o laço é desta montagem da página, não da próxima
    const job = { id: 0, busy: false };
    const tick = async () => {
      job.id = 0;
      if (me.dead || job.busy) return;
      if (!me.paused && !(document.hidden && !snap())) {
        job.busy = true;
        try { await fn(me); } catch (e) { /* fn já trata */ }
        job.busy = false;
      }
      if (!me.dead && !job.id) job.id = setTimeout(tick, ms);
    };
    /* lê agora (ao continuar, ao voltar pra janela); se já está lendo, deixa terminar */
    job.kick = () => {
      if (me.dead || job.busy) return;
      clearTimeout(job.id);
      job.id = 0;
      tick();
    };
    job.id = setTimeout(tick, ms);
    me.jobs.push(job);
    return job;
  }

  /* =========================================================
     montagem (uma vez só)
     ========================================================= */

  function card(area, icon, title, sub, delay) {
    const side = K.el('div', { class: 'pn-head-side' });
    const head = K.el('div', { class: 'card-head pn-card-head' },
      K.el('div', { class: 'pn-title' },
        K.el('span', { class: 'head-ic', html: K.icon(icon) }),
        K.el('div', { class: 'pn-title-text' }, K.el('h2', null, title), sub || null)),
      side);
    const c = K.el('section', { class: `card pn-card pn-${area} pop-in`, 'aria-label': title, style: { animationDelay: (delay || 0) + 'ms' } }, head);
    return { c, side };
  }

  function build(el, R) {
    /* cabeçalho */
    R.live = K.el('span', { class: 'live-badge', role: 'status' },
      K.el('i', { class: 'live-dot' }), R.liveText = K.el('span', null, 'Ao vivo'));
    R.pauseBtn = K.el('button', { class: 'btn small pn-pause', type: 'button', onclick: togglePause });
    paintPause(R);
    el.appendChild(K.el('header', { class: 'page-head', 'data-drag': true },
      K.el('div', null,
        K.el('h1', null, 'Painel'),
        K.el('p', null, 'O seu Mac agora, ao vivo. Os números se atualizam sozinhos a cada 2 segundos.')),
      K.el('div', { class: 'pn-head-right' }, R.live, R.pauseBtn)));

    /* erro de leitura: o mesmo cartão das outras telas, na versão compacta (a página tenta de novo sozinha) */
    R.error = K.el('div', { class: 'pn-error', hidden: true });
    el.appendChild(R.error);

    const grid = K.el('div', { class: 'pn-grid' });
    el.appendChild(grid);

    /* ----- processador ----- */
    R.cpuSub = K.el('div', { class: 'card-sub no-read-sub' }, 'lendo o chip…');
    const cpu = card('cpu', 'cpu', 'Processador', R.cpuSub, 0);
    R.cores = K.el('span', { class: 'sticker pn-cores', hidden: true });
    cpu.side.appendChild(R.cores);

    R.gaugeEl = K.el('div', { class: 'pn-gauge' });
    R.sparkEl = K.el('div', { class: 'pn-spark' });
    R.splitEl = K.el('div', { class: 'pn-split' });
    const splitNum = (cls, ref, name, note) => K.el('div', { class: 'pn-sn' },
      K.el('i', { class: 'pn-sw ' + cls }),
      K.el('div', null,
        R[ref] = K.el('div', { class: 'pn-sn-v num no-read' }, WAIT),
        K.el('div', { class: 'pn-sn-name' }, name),
        K.el('div', { class: 'pn-sn-note' }, note)));
    R.peak = K.el('span', { class: 'pn-mini-note num' }, '');
    const side = K.el('div', { class: 'pn-cpu-side' },
      K.el('div', { class: 'pn-mini-head' }, K.el('span', { class: 'pn-mini-title' }, 'Últimos 2 minutos')),
      R.sparkEl,
      K.el('div', { class: 'pn-axis' }, K.el('span', null, '−2 min'), R.peak, K.el('span', null, 'agora')),
      K.el('div', { class: 'pn-mini-head pn-mt' }, K.el('span', { class: 'pn-mini-title' }, 'Quem está usando')),
      R.splitEl,
      R.splitNums = K.el('div', { class: 'pn-split-nums', hidden: true },
        splitNum('s1', 'user', 'Apps', 'seus programas'),
        splitNum('s2', 'sys', 'Sistema', 'o próprio macOS'),
        splitNum('idle', 'idle', 'Parado', 'folga pra usar')));
    cpu.c.appendChild(K.el('div', { class: 'pn-cpu-body' },
      K.el('div', { class: 'pn-gauge-col' }, R.gaugeEl, R.cpuNote = K.el('p', { class: 'pn-note' }, 'Média do chip todo: 100% seria todos os núcleos no máximo ao mesmo tempo.')),
      side));

    /* temperatura (estado térmico do macOS) */
    R.thermSteps = {};
    const scale = K.el('div', { class: 'pn-therm-scale', role: 'list', 'aria-label': 'Escala de temperatura do macOS' });
    for (const k of THERMAL_ORDER) {
      const t = THERMAL[k];
      const s = K.el('span', { class: `pn-step ${t.tone}`, role: 'listitem', html: K.icon(t.icon) }, K.el('span', null, t.label));
      R.thermSteps[k] = s;
      scale.appendChild(s);
    }
    R.thermText = K.el('p', { class: 'pn-therm-text' }, 'Perguntando ao macOS…');
    cpu.c.appendChild(K.el('div', { class: 'pn-therm' },
      K.el('div', { class: 'pn-therm-head' },
        K.el('span', { class: 'pn-therm-ico', html: K.icon('thermo') }),
        K.el('div', { class: 'pn-therm-t' },
          K.el('h3', null, 'Temperatura do Mac'),
          R.thermText)),
      scale));
    grid.appendChild(cpu.c);

    /* ----- bateria (resumo): a saúde é o número grande; a carga vai numa linha menor ----- */
    const bat = card('bat', 'battery', 'Bateria', null, 70);
    R.mascotEl = K.el('div', { class: 'pn-bat-m' });
    R.batHealthBig = K.el('div', { class: 'pn-big num no-read' }, WAIT);
    R.batHealthLab = K.el('div', { class: 'stat-label' }, 'de saúde');
    R.batPill = K.el('div', { class: 'pn-pill' });
    R.batState = K.el('div', { class: 'pn-bat-state' }, 'Lendo a bateria…');
    R.batSub = K.el('div', { class: 'pn-bat-sub' }, '');
    R.batCycles = K.el('div', { class: 'pn-kv-v num no-read' }, WAIT);
    R.batCyclesSub = K.el('div', { class: 'pn-kv-sub' }, '');
    R.batTemp = K.el('div', { class: 'pn-kv-v num no-read' }, WAIT);
    R.batTempSub = K.el('div', { class: 'pn-kv-sub' }, '');
    R.batRows = K.el('div', { class: 'pn-bat-rows' },
      K.el('div', { class: 'pn-kv2' },
        K.el('div', { class: 'pn-kv' }, K.el('div', { class: 'pn-kv-k' }, 'Ciclos'), R.batCycles, R.batCyclesSub),
        K.el('div', { class: 'pn-kv' }, K.el('div', { class: 'pn-kv-k' }, 'Temperatura'), R.batTemp, R.batTempSub)));
    R.batLink = K.el('button', {
      class: 'btn gold small pn-bat-link', type: 'button', html: K.icon('arrow'),
      onclick: () => { K.sound.plop(); location.hash = '#/bateria'; },
    });
    R.batLink.insertBefore(K.el('span', null, 'Ver tudo da bateria'), R.batLink.firstChild);
    R.batRetry = K.el('button', {
      class: 'btn small gold pn-bat-retry', type: 'button', html: K.icon('cycle'), hidden: true,
      onclick: () => { K.sound.plop(); txt(R.batState, 'Tentando de novo…'); if (S) pollBattery(S, true); },
    }, 'Tentar de novo');
    /* a carga das últimas 24 h enche o cartão (sem vão amarelo embaixo de Ciclos e Temperatura) */
    R.batChartEl = K.el('div', { class: 'pn-bat-chart' }, K.el('div', { class: 'loading pn-bat-chart-wait' }, 'Juntando a carga do dia…'));
    R.batChart = K.el('div', { class: 'pn-bat-24' },
      K.el('div', { class: 'pn-mini-head' }, K.el('span', { class: 'pn-mini-title' }, 'Carga em 24 h'),
        K.el('span', { class: 'pn-bat-key' }, K.el('i', { 'aria-hidden': 'true' }), 'na tomada')),
      R.batChartEl);
    bat.c.appendChild(K.el('div', { class: 'pn-bat-body' },
      K.el('div', { class: 'pn-bat-hero' },
        R.mascotEl,
        K.el('div', { class: 'pn-bat-num' }, R.batHealthBig, R.batHealthLab, R.batPill)),
      K.el('div', { class: 'pn-bat-status' }, R.batState, R.batSub),
      R.batRows,
      R.batChart,
      R.batLink, R.batRetry));
    grid.appendChild(bat.c);

    /* ----- memória ----- */
    R.memSub = K.el('div', { class: 'card-sub' }, 'Lendo…');
    const mm = card('mem', 'memory', 'Memória', R.memSub, 140);
    R.memPill = K.el('div', { class: 'pn-pill' });
    mm.side.appendChild(R.memPill);
    R.memUsed = K.el('span', { class: 'pn-big num no-read' }, WAIT);
    R.memOf = K.el('span', { class: 'pn-of' }, '');
    R.pressText = K.el('div', { class: 'stat-sub' }, '');
    R.memReady = K.el('div', { class: 'pn-kpi-v num no-read' }, WAIT);
    R.swap = K.el('div', { class: 'pn-kpi-v num no-read' }, WAIT);
    R.swapText = K.el('div', { class: 'pn-kpi-sub' }, '');
    mm.c.appendChild(K.el('div', { class: 'pn-mem-top' },
      K.el('div', { class: 'pn-mem-used' },
        K.el('div', { class: 'stat-label' }, 'Em uso agora'),
        K.el('div', { class: 'pn-bigline' }, R.memUsed, R.memOf),
        R.pressText),
      K.el('div', { class: 'pn-kpis' },
        K.el('div', { class: 'pn-kpi' },
          K.el('div', { class: 'pn-kpi-k', html: K.icon('sparkle') }, K.el('span', null, 'Pronta pra usar')),
          R.memReady,
          K.el('div', { class: 'pn-kpi-sub' }, 'livre + cache que o macOS devolve')),
        K.el('div', { class: 'pn-kpi' },
          K.el('div', { class: 'pn-kpi-k', html: K.icon('swap') }, K.el('span', null, 'Swap no disco')),
          R.swap,
          R.swapText))));
    R.memStackEl = K.el('div', { class: 'pn-memstack' });
    mm.c.appendChild(R.memStackEl);
    mm.c.appendChild(K.el('div', { class: 'tip pn-tip', html: K.icon('info') },
      K.el('p', null, 'O cache é memória que o macOS devolve sozinho quando algum app precisa, então não precisa “liberar RAM”. Memória livre sobrando é memória parada: ver pouca livre é normal e até bom.')));
    grid.appendChild(mm.c);

    /* ----- disco ----- */
    R.diskName = K.el('div', { class: 'card-sub' }, 'Lendo…');
    const dk = card('disk', 'disk', 'Disco', R.diskName, 210);
    R.diskPill = K.el('div', { class: 'pn-pill' });
    dk.side.appendChild(R.diskPill);
    R.ringEl = K.el('div', { class: 'pn-ring' });
    R.diskFree = K.el('span', { class: 'pn-big num no-read' }, WAIT);
    R.diskPurge = K.el('div', { class: 'pn-disk-line' }, '');
    R.diskAvail = K.el('div', { class: 'stat-sub' }, '');
    dk.c.appendChild(K.el('div', { class: 'pn-disk-body' },
      R.ringEl,
      K.el('div', { class: 'pn-disk-stats' },
        K.el('div', { class: 'stat-label' }, 'Livre pra usar'),
        K.el('div', { class: 'pn-bigline' }, R.diskFree),
        R.diskPurge,
        R.diskAvail)));
    /* ponte pra Faxina: uma estimativa que só lê (cleanup.scan), sem segurar o painel */
    R.faxText = K.el('span', { class: 'pn-fax-sub' }, 'Vendo quanto dá pra liberar…');
    R.faxBtn = K.el('button', {
      class: 'btn small pn-fax-btn', type: 'button', html: K.icon('arrow'),
      onclick: () => { K.sound.plop(); location.hash = '#/faxina'; },
    });
    R.faxBtnText = K.el('span', null, 'Abrir a Faxina');
    R.faxBtn.insertBefore(R.faxBtnText, R.faxBtn.firstChild);
    R.fax = K.el('div', { class: 'pn-fax', dataset: { state: 'wait' } },
      K.el('span', { class: 'pn-fax-ic', html: K.icon('broom') }),
      K.el('div', { class: 'pn-fax-t' }, K.el('b', null, 'Faxina'), R.faxText),
      R.faxBtn);
    dk.c.appendChild(R.fax);
    R.diskTip = K.el('p', null, '');
    dk.c.appendChild(K.el('div', { class: 'tip pn-tip pn-disktip', html: K.icon('info') }, R.diskTip));
    grid.appendChild(dk.c);

    /* ----- sistema ----- */
    const sy = card('sys', 'laptop', 'Este Mac', K.el('div', { class: 'card-sub' }, 'o que tem por baixo do capô'), 280);
    const row = (icon, k, ref, subRef) => K.el('div', { class: 'pn-sys-row' },
      K.el('span', { class: 'pn-sys-ico', html: K.icon(icon) }),
      K.el('div', { class: 'pn-sys-t' },
        K.el('div', { class: 'pn-sys-k' }, k),
        R[ref] = K.el('div', { class: 'pn-sys-v selectable no-read' }, 'lendo…'),
        subRef ? (R[subRef] = K.el('div', { class: 'pn-sys-sub selectable' }, '')) : null));
    sy.c.appendChild(K.el('div', { class: 'pn-sys-list' },
      row('laptop', 'Modelo', 'model', 'modelId'),
      row('cpu', 'Processador', 'chip', 'chipSub'),
      row('memory', 'Memória', 'ram', null),
      row('disk', 'Armazenamento', 'storage', 'storageSub'),
      row('window', 'Sistema', 'os', null),
      row('clock', 'Ligado há', 'uptime', 'uptimeSub')));
    R.upTip = K.el('div', { class: 'tip pn-tip pn-uptip', html: K.icon('moon'), hidden: true },
      K.el('p', null, 'Mais de uma semana sem reiniciar. Um reinício fecha processos esquecidos e termina atualizações; não é mágica, mas ajuda.'));
    sy.c.appendChild(R.upTip);
    grid.appendChild(sy.c);
  }

  /** leitura falhou: cartão de erro compacto (o mesmo desenho das outras telas), sem parênteses dentro de parênteses */
  function showError(R, msg) {
    const m = String(msg == null ? '' : msg).trim().replace(/[.!\s]+$/, '') || 'o macOS não respondeu';
    const text = `Não deu pra ler o Mac agora: ${m}. Tento de novo sozinho em instantes.`;
    if (!R.errCard) {
      R.errCard = K.errorCard({ compact: true, title: 'Sem leitura agora', text, retryLabel: 'Tentar agora',
        retry: () => { if (S && !S.dead) for (const j of S.jobs) j.kick(); } });
      R.error.appendChild(R.errCard);
    } else txt(R.errCard.querySelector('.kerr-text p'), text);
  }

  function paintPause(R) {
    const b = R.pauseBtn;
    const p = S && S.paused;
    b.innerHTML = K.icon(p ? 'play' : 'pause');
    b.appendChild(K.el('span', null, p ? 'Continuar' : 'Pausar'));
    b.setAttribute('aria-pressed', String(!!p));
    b.title = p ? 'Voltar a ler o Mac ao vivo' : 'Congelar os números pra olhar com calma';
  }

  function paintLive() {
    const R = S.R;
    const mode = S.paused ? 'paused' : S.failing ? 'stale' : 'live';
    R.live.classList.toggle('paused', mode === 'paused');
    R.live.classList.toggle('stale', mode === 'stale');
    txt(R.liveText, mode === 'paused' ? 'Pausado' : mode === 'stale' ? 'Sem leitura, tentando de novo' : 'Ao vivo');
  }

  function togglePause() {
    if (!S) return;
    K.sound.plop();
    S.paused = !S.paused;
    paintPause(S.R);
    paintLive();
    if (!S.paused) for (const j of S.jobs) j.kick();   // volta na hora, sem esperar o intervalo
  }

  /* =========================================================
     leitura
     ========================================================= */

  async function pollSystem(me) {
    try {
      const s = await K.api('system.now');
      if (S !== me || me.dead || me.frozen) return;
      S.failing = false;
      S.R.error.hidden = true;
      applySystem(s);
    } catch (e) {
      if (S !== me || me.dead) return;
      S.failing = true;
      S.R.error.hidden = false;
      showError(S.R, e && e.message || e);
    }
    paintLive();
  }

  async function pollBattery(me, now) {
    try {
      const b = now ? await K.api('battery.now') : await K.cached('battery.now', null, 4000);
      if (S !== me || me.dead || me.frozen) return;
      applyBattery(b);
    } catch (e) {
      if (S !== me || me.dead) return;
      if (!S.bat) applyBattery(null, e);
    }
  }

  /** algumas leituras rápidas logo ao abrir, pra minilinha já nascer com forma */
  async function seed(me) {
    for (let i = 0; i < SEED_N - 1; i++) {
      await K.sleep(SEED_MS);
      if (S !== me || me.dead || me.frozen || me.paused) return;
      try {
        const s = await K.api('system.now');
        if (S !== me || me.dead || me.frozen) return;
        S.failing = false;
        applySystem(s);
      } catch (e) { return; }
    }
  }

  /* ---------- processador ---------- */

  function applyCpu(s) {
    const R = S.R;
    const c = s.cpu || {};
    const usage = num(c.usagePct);
    const t = isNum(s.readAt) ? s.readAt : Date.now() / 1000;

    /* história: buraco quando passou tempo demais (pausado, janela escondida) */
    if (S.lastT != null && t - S.lastT > (SYS_MS / 1000) * 2.6) S.hist.push(null);
    S.hist.push(usage != null ? { t, v: usage } : null);
    S.lastT = t;
    if (S.hist.length > SLOTS) S.hist = S.hist.slice(-SLOTS);
    paintSpark();

    S.gauge.set((ch) => ch.update({ value: usage }));

    const user = num(c.userPct), sys = num(c.systemPct);
    const idle = usage != null ? Math.max(0, 100 - usage) : null;
    S.split.set((ch) => ch.update({
      segments: [
        { name: 'Apps', value: user, color: 'var(--s1)', note: 'o que os seus programas pedem' },
        { name: 'Sistema', value: sys, color: 'var(--s2)', note: 'o próprio macOS' },
      ],
    }));
    R.splitNums.hidden = usage == null;   /* sem leitura: a barra vazia já diz; três "sem leitura" seguidos só poluem */
    tween(R.user, user, pctTxt, 500);
    tween(R.sys, sys, pctTxt, 500);
    tween(R.idle, idle, pctTxt, 500);

    const coresTxt = K.fmt.cores(c);
    const chip = c.chip || null;
    R.cpuSub.classList.remove('no-read-sub');
    txt(R.cpuSub, chip || 'Chip não identificado');
    R.cores.hidden = !coresTxt;
    if (coresTxt) {
      /* o mesmo texto do "Este Mac" e da Varredura: núcleos de verdade, e as linhas de execução entre parênteses */
      txt(R.cores, coresTxt);
      R.cores.title = isNum(c.physicalCores) && isNum(c.cores) && c.cores > c.physicalCores
        ? `No Intel com Hyper-Threading, cada núcleo roda duas linhas de execução ao mesmo tempo: o Monitor de Atividade conta ${c.cores} "núcleos".` : '';
    }
    if (usage != null && usage > 90) txt(R.cpuNote, 'Normal enquanto algo pesado roda. Se ficar assim com o Mac parado, veja quem está puxando.');
    else txt(R.cpuNote, 'Média do chip todo: 100% seria todos os núcleos no máximo ao mesmo tempo.');
  }

  function paintSpark() {
    const R = S.R;
    const h = S.hist;
    const pad = SLOTS - h.length;
    const values = new Array(SLOTS).fill(null);
    const labels = new Array(SLOTS).fill('');
    const lastT = S.lastT;
    h.forEach((p, i) => {
      if (!p) return;
      values[pad + i] = p.v;
      labels[pad + i] = lastT != null ? ago(lastT - p.t) : '';
    });
    const ok = h.filter(Boolean);
    if (ok.length >= SPARK_MIN) {
      const peak = Math.max(...ok.map((p) => p.v));
      const avg = ok.reduce((a, p) => a + p.v, 0) / ok.length;
      txt(R.peak, `média ${pct0(avg)} · pico ${pct0(peak)}`);
    } else {
      txt(R.peak, ok.length ? 'juntando pontos…' : '');
    }
    S.spark.set((ch) => ch.update(values, { labels }));
  }

  /* ---------- temperatura ---------- */

  function applyThermal(key) {
    const R = S.R;
    const t = THERMAL[key];
    for (const k of THERMAL_ORDER) {
      const on = k === key;
      R.thermSteps[k].classList.toggle('on', on);
      if (on) R.thermSteps[k].setAttribute('aria-current', 'true');
      else R.thermSteps[k].removeAttribute('aria-current');
    }
    txt(R.thermText, t ? t.text : 'O macOS não informou a temperatura agora.');
  }

  /* ---------- memória ---------- */

  function applyMemory(m) {
    const R = S.R;
    if (!m || !isNum(m.totalBytes)) {
      txt(R.memSub, 'Não deu pra ler a memória');
      tween(R.memUsed, null); txt(R.memOf, '');
      tween(R.memReady, null); tween(R.swap, null); txt(R.swapText, '');
      txt(R.pressText, '');
      pill(R.memPill, null, '');
      S.memStack.set((ch) => ch.update({ segments: [], total: null, empty: 'O macOS não informou a memória agora. Tentando de novo…' }));
      return;
    }
    const parts = [m.appBytes, m.wiredBytes, m.compressedBytes].filter(isNum);
    const used = isNum(m.usedBytes) ? m.usedBytes : parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    txt(R.memSub, `${mem(m.totalBytes, 0)} no total`);
    tween(R.memUsed, used, (v) => mem(v));
    txt(R.memOf, `de ${mem(m.totalBytes, 0)}`);

    const ready = (isNum(m.freeBytes) || isNum(m.cachedBytes)) ? (num(m.freeBytes) || 0) + (num(m.cachedBytes) || 0) : null;
    tween(R.memReady, ready, (v) => mem(v));

    const swap = num(m.swapUsedBytes);
    tween(R.swap, swap, (v) => (v === 0 ? 'nada' : mem(v)));
    const pr = m.pressure;
    const swapBig = swap != null && swap > 2 * 1024 ** 3;
    txt(R.swapText, swap == null ? 'o macOS não informou'
      : swap === 0 ? 'nada foi pro disco: sobra memória'
        : swapBig && pr && pr !== 'normal' ? 'bastante: sinal de que a memória está curta'
          : 'um pouco é normal, o macOS guarda o que está parado');

    const p = PRESSURE[pr];
    if (p) pill(R.memPill, p.tone, p.label, p.icon);
    else pill(R.memPill, null, 'Pressão sem leitura', 'info');
    txt(R.pressText, p ? p.text : 'O macOS não informou a pressão de memória agora.');

    S.memStack.set((ch) => ch.update({
      segments: [
        /* só cores da casa (verde é de status): cache é azul lavado porque é memória devolvível */
        { name: 'Apps', value: m.appBytes, color: 'var(--s1)', note: 'o que os programas estão usando' },
        { name: 'Fixa', value: m.wiredBytes, color: 'var(--ink-2)', note: 'o sistema não solta' },
        { name: 'Comprimida', value: m.compressedBytes, color: 'var(--s2)', note: 'espremida pra caber mais' },
        { name: 'Cache de arquivos', value: m.cachedBytes, color: 'var(--s1-wash)', note: 'o macOS devolve sozinho' },
        { name: 'Livre', value: m.freeBytes, color: 'var(--panel)' },
      ],
      total: m.totalBytes,
    }));
  }

  /* ---------- disco ---------- */

  function applyDisk(d) {
    const R = S.R;
    if (!d || !isNum(d.totalBytes) || d.totalBytes <= 0) {
      txt(R.diskName, 'Não deu pra ler o disco');
      tween(R.diskFree, null); txt(R.diskPurge, ''); txt(R.diskAvail, ''); txt(R.diskTip, 'O macOS gosta de ter uns 10 a 20% do disco livre pra atualizações e memória extra.');
      pill(R.diskPill, null, '');
      S.ring.set((ch) => ch.update({ value: null, sub: '' }));
      return;
    }
    const total = d.totalBytes;
    const free = num(d.freeBytes);
    const avail = isNum(d.availableBytes) ? d.availableBytes : free;
    const used = isNum(d.usedBytes) ? d.usedBytes : avail != null ? total - avail : null;
    const purge = free != null && avail != null ? Math.max(0, avail - free) : null;
    txt(R.diskName, d.name || `Disco de ${K.fmt.bytes(total)}`);
    R.diskName.title = d.name ? `${d.name} · ${K.fmt.bytes(total)}` : '';

    const key = [used, total].join('|');
    if (S.diskKey !== key) {
      S.diskKey = key;
      S.ring.set((ch) => ch.update({
        value: used, max: total,
        sub: used != null ? `${K.fmt.bytes(used)} de ${K.fmt.bytes(total)} ocupados` : '',
      }));
    }
    /* o número principal é o mesmo da Varredura: o que dá pra usar (inclui o que o macOS libera) */
    tween(R.diskFree, avail, (v) => K.fmt.bytes(v));
    txt(R.diskPurge, purge != null && purge >= 1e8 ? `Inclui ${K.fmt.bytes(purge)} que o macOS libera sozinho quando precisar.` : '');
    txt(R.diskAvail, purge != null && purge >= 1e8
      ? 'Esse extra vem de caches e cópias do iCloud que o sistema apaga por conta própria.'
      : '');

    const share = avail != null ? avail / total : null;
    if (share == null) pill(R.diskPill, null, '');
    else if (share < 0.05) pill(R.diskPill, 'crit', 'Quase cheio', 'alert');
    else if (share < 0.1) pill(R.diskPill, 'serious', 'Pouco espaço', 'alert');
    else if (share < 0.2) pill(R.diskPill, 'warn', 'Enchendo', 'eye');
    else pill(R.diskPill, 'good', 'Espaço de sobra', 'check');
    R.diskPill.title = 'O macOS gosta de ter pelo menos uns 10% livres pra atualizações e memória virtual.';
    txt(R.diskTip, share == null ? 'O macOS gosta de ter uns 10 a 20% do disco livre pra atualizações e memória extra.'
      : `O macOS gosta de ter uns 10 a 20% do disco livre pra atualizações e memória extra. Aqui estão livres ${K.fmt.num(share * 100, 0)}%${share >= 0.2 ? ', folga de sobra.' : share >= 0.1 ? ': ainda dá, mas vale ficar de olho.' : ': está apertado, vale tirar arquivos grandes que você não usa.'}`);
  }

  /** estimativa da Faxina: caches, programação e registros (só lê; K.dirt mora na Varredura) */
  async function estimateDirt(me) {
    const R = me.R;
    if (!K.dirt) { paintDirt(R, null); return; }
    try {
      const d = await K.dirt.check({ maxAgeMs: DIRT_AGE });
      if (S !== me || me.dead) return;
      paintDirt(R, d);
    } catch (e) {
      if (S !== me || me.dead) return;
      paintDirt(R, null);
    }
  }

  function paintDirt(R, d) {
    const sel = d && isNum(d.sel) ? d.sel : null;
    const least = d && (d.incompleto || (d.errs && d.errs.length)) ? 'pelo menos ' : '';
    let state, text;
    if (sel == null) {
      state = 'none';
      text = 'Você vê tudo antes e decide o que sai.';
    } else if (sel >= 1e9) {
      state = 'tip';
      text = `Dá pra liberar ${least}${K.fmt.bytes(sel).replace(' ', '\u00a0')} em caches e registros, com segurança.`;
    } else if (sel >= 1e8) {
      state = 'ok';
      text = `Só ${least}${K.fmt.bytes(sel).replace(' ', '\u00a0')} em caches e registros: nada que pese no disco.`;
    } else {
      state = 'ok';
      text = 'Quase nada de cache ou registro sobrando agora.';
    }
    R.fax.dataset.state = state;
    txt(R.faxText, text);
    R.faxBtn.classList.toggle('gold', state === 'tip');
    txt(R.faxBtnText, state === 'tip' ? 'Ver e limpar' : 'Abrir a Faxina');
  }

  /* ---------- sistema ---------- */

  function applyInfo(s) {
    const R = S.R;
    txt(R.model, niceModel(s.model, s.modelId));
    txt(R.modelId, s.model && s.modelId ? s.modelId : '');
    const c = s.cpu || {};
    K.readOr(R.chip, c.chip || null, (v) => v);
    txt(R.chipSub, K.fmt.cores(c));
    const m = s.memory || {}, d = s.disk || {};
    K.readOr(R.ram, num(m.totalBytes), (v) => mem(v, 0));
    K.readOr(R.storage, num(d.totalBytes), (v) => K.fmt.bytes(v));
    txt(R.storageSub, d.name ? `disco “${d.name}”` : '');
    K.readOr(R.os, s.macOS || null, macOSName);
    const up = num(s.uptimeSec);
    K.readOr(R.uptime, up, (v) => K.fmt.duration(v));
    txt(R.uptimeSub, up != null ? 'desde ' + K.fmt.dayTime((isNum(s.readAt) ? s.readAt : Date.now() / 1000) - up) : '');
    R.upTip.hidden = !(up != null && up > 7 * 86400);
  }

  function applySystem(s) {
    S.sys = s || {};
    applyCpu(S.sys);
    applyThermal(S.sys.thermalState || (S.bat && S.bat.thermalState) || null);
    applyMemory(S.sys.memory);
    applyDisk(S.sys.disk);
    applyInfo(S.sys);
  }

  /* ---------- bateria ---------- */

  function batWords(b) {
    if (b.isCharging == null && b.pluggedIn == null) return ['Tomada sem leitura', 'O Mac não informou se está no carregador agora.'];
    if (K.batTopping(b)) return ['Terminando de encher', 'Na tomada, entrando devagar na bateria até completar.'];
    if (!b.isCharging && b.pluggedIn && (b.fullyCharged || b.percent >= 99)) {
      return ['Cheia na tomada', 'O carregador alimenta o Mac direto e a bateria descansa.'];
    }
    if (b.isCharging) {
      if (b.finishingCharge) return ['Terminando a carga', 'O macOS vai devagar no fim pra poupar a bateria.'];
      return ['Carregando', isNum(b.minutesToFull) && b.minutesToFull > 0 ? `Cheia em uns ${K.fmt.mins(b.minutesToFull)}.` : 'Calculando quanto falta…'];
    }
    if (b.pluggedIn) {
      return ['Na tomada, sem carregar', b.optimizedChargingEngaged
        ? 'Carga otimizada: o macOS segurou a carga pra poupar a bateria.'
        : 'O macOS pausou a carga por enquanto.'];
    }
    return ['Na bateria', isNum(b.minutesToEmpty) && b.minutesToEmpty > 0
      ? `Dá uns ${K.fmt.mins(b.minutesToEmpty)} no ritmo de agora.`
      : 'Calculando quanto dura…'];
  }

  function applyBattery(b, err) {
    const R = S.R;
    S.bat = b;
    R.bat.classList.toggle('pn-baterr', !b);
    R.batRetry.hidden = !!b;
    if (!b) {
      /* não leu: mascote preocupado, cartão enxuto e um jeito de tentar de novo */
      S.mascot.set({ pct: null, tone: 'none', face: 'worried', charging: false, plugged: false, full: false, hot: false });
      txt(R.batHealthBig, '');
      txt(R.batState, 'Não deu pra ler a bateria');
      txt(R.batSub, 'Às vezes o macOS demora pra responder logo depois de acordar.' + (err ? ` O motivo: ${String(err.message || err).trim().replace(/[.!\s]+$/, '')}.` : ''));
      pill(R.batPill, null, '');
      R.batRows.hidden = true;
      R.batLink.hidden = true;
      R.batChart.hidden = true;
      return;
    }
    if (!b.present) {
      S.mascot.set({ pct: null, tone: 'good', face: null, charging: false, plugged: true, full: false, hot: false });
      R.bat.classList.add('pn-nobat');
      txt(R.batHealthBig, '');
      txt(R.batState, 'Este Mac não tem bateria');
      txt(R.batSub, 'Ele vive na tomada, então não há bateria pra cuidar. Processador, memória e disco seguem aqui do lado, ao vivo do mesmo jeito.');
      pill(R.batPill, null, 'Sem bateria', 'plug');
      R.batRows.hidden = true;
      R.batLink.hidden = true;
      R.batChart.hidden = true;
      return;
    }
    R.bat.classList.remove('pn-nobat');
    R.batRows.hidden = false;
    R.batLink.hidden = false;
    R.batChart.hidden = false;
    if (!S.histAsked) setTimeout(() => { if (S && !S.dead) loadBatHistory(S); }, snap() ? 0 : 1200);
    const st = K.batStatus(b);
    const pct = num(b.percent);
    const h = num(b.healthPct);
    const full = !!(b.pluggedIn && !b.isCharging && pct != null && pct >= 99) && !K.batTopping(b);
    S.mascot.set({
      pct, tone: st.tone, face: null, charging: !!b.isCharging, plugged: !!b.pluggedIn, full,
      hot: isNum(b.temperatureC) && b.temperatureC >= 40,
    });
    R.batHealthBig.classList.toggle('pn-none', h == null);
    if (h == null) { R.batHealthBig._v = null; R.batHealthBig.classList.remove('no-read'); txt(R.batHealthBig, 'Sem leitura'); }
    else tween(R.batHealthBig, h, (v) => K.fmt.pct(v, 1), 700);
    txt(R.batHealthLab, h == null ? 'de saúde agora' : 'de saúde');
    if (h != null || K.batStatusKey(b) === 'trocar') pill(R.batPill, st.tone, st.label, st.icon);
    else pill(R.batPill, null, '');
    const [state, sub] = batWords(b);
    txt(R.batState, (pct != null ? pct0(pct) + ' · ' : '') + state);
    txt(R.batSub, sub);
    txt(R.batCycles, isNum(b.cycles) ? K.fmt.num(b.cycles) : 'sem leitura');
    R.batCycles.classList.toggle('no-read', !isNum(b.cycles));
    txt(R.batCyclesSub, isNum(b.designCycles) ? `de ${K.fmt.num(b.designCycles)} previstos` : 'cargas completas');
    const tc = num(b.temperatureC);
    txt(R.batTemp, tc != null ? K.fmt.temp(tc) : 'sem leitura');
    R.batTemp.classList.toggle('no-read', tc == null);
    txt(R.batTempSub, tc == null ? '' : tc >= 40 ? 'quente: deixe esfriar' : tc >= 35 ? 'morna, tudo bem' : 'tranquila');
    if (!S.sys || !S.sys.thermalState) applyThermal(b.thermalState || null);
  }

  /** carga das últimas 24 h no cartão da bateria (battery.history: o mesmo cache da tela Bateria) */
  async function loadBatHistory(me) {
    if (me.histAsked) return;
    me.histAsked = true;
    let h = null;
    try { h = await K.cached('battery.history', { dias: 7 }, 600000); } catch (e) { h = null; }
    if (S !== me || me.dead) return;
    const R = me.R;
    const now = Date.now() / 1000;
    const pts = ((h && h.carga) || []).filter((p) => p && isNum(p.t) && p.t >= now - 86400 - 7200);
    R.batChartEl.textContent = '';
    const ch = K.charts.area(R.batChartEl, {
      name: 'Carga',
      points: pts.map((p) => ({ x: p.t, y: isNum(p.pct) ? p.pct : null, plugged: p.plugged })),
      yMin: 0, yMax: 100, yTicks: 1,
      yFormat: (v) => K.fmt.pct(v, 0),
      xMin: now - 86400, xMax: now,
      bands: K.charts.runs(pts, (p) => p.plugged, { label: 'Na tomada' }),
      bandStyle: 'track',
      legend: false,
      height: 84,
      table: false,
      empty: h ? 'O macOS ainda não anotou a carga das últimas 24 horas.' : 'Não consegui ler o histórico agora.',
      ariaLabel: 'Carga da bateria nas últimas 24 horas',
    });
    me.charts.push(ch);
  }

  /* =========================================================
     página
     ========================================================= */

  K.pages.painel = {
    title: 'Painel',

    async render(el) {
      if (S) K.pages.painel.destroy();
      const R = {};
      S = { R, charts: [], jobs: [], hist: [], lastT: null, dead: false, paused: false, failing: false, sys: null, bat: null, diskKey: null, frozen: false };
      const me = S;
      build(el, R);
      R.bat = el.querySelector('.pn-bat');

      /* gráficos montados vazios; a primeira leitura preenche */
      S.gauge = live(K.charts.gauge(R.gaugeEl, { value: null, zones: CPU_ZONES, label: 'uso de CPU', size: 250, empty: 'Medindo…' }));
      S.spark = live(K.charts.spark(R.sparkEl, [], { min: 0, max: 100, height: 64, format: pctTxt, name: 'uso de CPU', color: 'var(--s1)', empty: 'medindo…', ariaLabel: 'Uso de CPU nos últimos 2 minutos' }));
      S.split = live(K.charts.stack(R.splitEl, { segments: [], total: 100, restName: 'Parado', format: pctTxt, legend: false, inside: false, height: 20, empty: 'medindo…', ariaLabel: 'Divisão do uso de CPU' }));
      S.memStack = live(K.charts.stack(R.memStackEl, { segments: [], total: null, restName: 'Outros', format: (v) => mem(v), height: 36, empty: 'Lendo a memória…' }));
      S.ring = live(K.charts.ring(R.ringEl, { value: null, max: 100, tone: 's1', label: 'ocupado', size: 150, sub: '' }));
      S.mascot = K.mascot(R.mascotEl, { size: 96, state: { pct: null, tone: 'good' } });

      const [s, b] = await Promise.allSettled([K.api('system.now'), K.cached('battery.now', null, 4000)]);
      if (me.dead) return;
      if (s.status === 'fulfilled') applySystem(s.value);
      else {
        S.failing = true;
        R.error.hidden = false;
        showError(R, s.reason && s.reason.message || s.reason);
        applyThermal(null);
      }
      if (b.status === 'fulfilled') applyBattery(b.value);
      else applyBattery(null, b.reason);
      paintLive();

      /* a leitura a cada 2 s começa depois das leituras rápidas do começo */
      if (s.status === 'fulfilled') seed(me).then(() => { if (!me.dead) every(SYS_MS, pollSystem); });
      else every(SYS_MS, pollSystem);
      every(BAT_MS, pollBattery);
      me.dirtTimer = setTimeout(() => { if (!me.dead) estimateDirt(me); }, snap() ? 0 : DIRT_WAIT);
      S.onVis = () => { if (!document.hidden && S && !S.dead && !S.paused) for (const j of S.jobs) j.kick(); };
      document.addEventListener('visibilitychange', S.onVis);
    },

    destroy() {
      if (!S) return;
      S.dead = true;
      for (const j of S.jobs) clearTimeout(j.id);
      clearTimeout(S.dirtTimer);
      if (S.onVis) document.removeEventListener('visibilitychange', S.onVis);
      for (const c of S.charts) { try { c.destroy(); } catch (e) { /* já foi */ } }
      if (S.mascot) { try { S.mascot.destroy(); } catch (e) { /* já foi */ } }
      S = null;
    },

    /** Só pra testes (modo foto): congela a leitura e mostra estes dados.
        K.pages.painel.feed({ system, battery, cpu: [números] }) — campo ausente não muda. */
    feed(d) {
      if (!S || !d) return;
      S.frozen = true;
      S.paused = true;
      paintPause(S.R);
      paintLive();
      if (Array.isArray(d.cpu)) {
        const t = Date.now() / 1000;
        S.hist = d.cpu.slice(-SLOTS + 1).map((v, i, a) => (v == null ? null : { t: t - (a.length - i) * 2, v }));
        S.lastT = S.hist.length ? t - 2 : null;
      }
      if ('system' in d) applySystem(d.system);
      if ('battery' in d) applyBattery(d.battery);
    },
  };
})();
