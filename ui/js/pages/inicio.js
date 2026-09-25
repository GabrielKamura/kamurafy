/* Kamurafy — Varredura (rota "inicio"), a tela de entrada.
   Três momentos na mesma tela:
     parado     → saudação, botão redondo enorme "Escanear" e a lista do que ele confere;
     escaneando → o botão vira um anel de progresso e cada passo ganha ✓ com o que achou;
     resultado  → resumo ("Tudo certo por aqui!" / "Achei N pontos de atenção") e cartões.
   K.scan() começa a varredura (usado nos testes com tools/foto.sh); K.scanReset() volta pro botão.
   Regras de status honestas: só vira "atenção" o que de fato pede alguma ação. */
'use strict';

(function () {
  Object.assign(K.ICONS, {
    laptop: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.8"/><path d="M2.5 18h19l-.9 1.3a1.6 1.6 0 0 1-1.3.7H4.7a1.6 1.6 0 0 1-1.3-.7Z"/>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M9.5 20.5h5M12 16v4.5"/>',
    party: '<path d="M4 20.5 8.2 8.8l7 7Z"/><path d="M13.5 7.5c.6-1.6 1.9-2.3 3.6-2.1M16.5 11.5c1.4-.9 2.9-.9 4.2.2M11 4.5v-1M20 8.5h1M18.8 3.8l.7-.7"/>',
  });

  const STEP_MIN = 750;          // cada passo fica pelo menos isso na tela (dá tempo de ver)
  const STEP_MAX = 9000;         // passo que passa disso vira "sem leitura" e a varredura segue
  const KEEP_S = 15 * 60;        // resultado continua na tela por 15 min ao voltar pra cá
  const RANK = { good: 0, warn: 1, serious: 2, crit: 3 };

  const STEPS = [
    { id: 'bateria', name: 'Bateria', icon: 'battery', desc: 'saúde, ciclos e carga', doing: 'Olhando a bateria…', route: 'bateria', run: stepBattery },
    { id: 'energia', name: 'Energia', icon: 'bolt', desc: 'quem mais gasta agora', doing: 'Vendo quem gasta energia…', route: 'bateria', run: stepEnergy },
    { id: 'memoria', name: 'Memória', icon: 'memory', desc: 'folgada ou apertada', doing: 'Medindo a memória…', route: 'painel', run: stepMemory },
    { id: 'cpu', name: 'Processador', icon: 'cpu', desc: 'uso e temperatura', doing: 'Sentindo o processador…', route: 'painel', run: stepCpu },
    { id: 'disco', name: 'Disco', icon: 'disk', desc: 'quanto espaço sobra', doing: 'Medindo o disco…', route: 'painel', run: stepDisk },
  ];

  let host = null;
  let mode = 'idle';             // idle | scanning | result
  let token = 0;                 // muda a cada varredura/saída: passo velho não mexe na tela
  let last = null;               // {results, at, took}
  let machine = null;            // {b, info, sys} lidos ao abrir a tela
  let pendingScan = false;
  let ui = {};
  let charts = [];
  let mascots = [];
  let afterMount = [];           // gráficos só montam com o cartão já na tela (senão o 1º desenho cai no ResizeObserver)

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const worst = (...ts) => ts.filter((t) => t in RANK).sort((a, b) => RANK[b] - RANK[a])[0] || 'good';
  const isAttention = (r) => r && !r.error && !r.none && RANK[r.tone] > 0;
  const nowS = () => Date.now() / 1000;
  const go = (route) => { K.sound.plop(); location.hash = '#/' + route; };

  /** memória em base 2, como o Monitor de Atividade ("16 GB", não "17,2 GB") */
  function gib(v, casas) {
    if (v == null) return '—';
    const g = v / 1073741824;
    return K.fmt.num(g, casas != null ? casas : g < 100 ? 1 : 0) + ' GB';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Boa noite, coruja!';
    if (h < 12) return 'Bom dia!';
    if (h < 18) return 'Boa tarde!';
    return 'Boa noite!';
  }

  function withTimeout(p, ms) {
    return Promise.race([p, K.sleep(ms).then(() => { throw new Error('demorou demais pra responder'); })]);
  }

  /* ================= leitura e análise de cada área ================= */

  async function stepBattery(ctx) {
    ctx.b = await K.api('battery.now');
    return anBattery(ctx.b);
  }
  async function stepEnergy(ctx) {
    const apps = await K.api('battery.energyApps', { limite: 5 });
    return anEnergy(apps, ctx.b);
  }
  async function stepMemory(ctx) {
    ctx.sys = await K.api('system.now');
    return anMemory(ctx.sys && ctx.sys.memory);
  }
  async function stepCpu(ctx) {
    /* uso = média desde a leitura anterior (o passo da memória), então mede o "agora" */
    ctx.sys = await K.api('system.now');
    return anCpu(ctx.sys && ctx.sys.cpu, (ctx.sys && ctx.sys.thermalState) || (ctx.b && ctx.b.thermalState));
  }
  async function stepDisk(ctx) {
    const s = await K.api('system.now');
    return anDisk(s && s.disk);
  }

  function chargeText(b) {
    const p = num(b.percent) != null ? K.fmt.pct(b.percent, 0) : '—';
    if (b.isCharging == null && b.pluggedIn == null) return `${p}, sem leitura da tomada`;
    if (b.isCharging) return `${p}, carregando` + (num(b.minutesToFull) ? ` (cheia em ${K.fmt.mins(b.minutesToFull)})` : '');
    if (b.pluggedIn && (b.fullyCharged || b.percent >= 99)) return `${p}, cheia na tomada`;
    if (b.pluggedIn) return `${p}, na tomada sem carregar`;
    return `${p}, na bateria` + (num(b.minutesToEmpty) ? ` (uns ${K.fmt.mins(b.minutesToEmpty)})` : '');
  }

  function anBattery(b) {
    const r = { id: 'bateria', b };
    if (!b || b.present === false || b.status === 'sem-bateria') {
      if (K.isLaptop(machine && machine.info)) {
        /* notebook sem bateria à vista: é leitura que faltou (ou bateria removida), não Mac de mesa */
        return Object.assign(r, {
          unknown: true, missing: true, tone: 'none', key: 'desconhecida', pill: { label: 'Sem leitura', icon: 'info' }, snippet: 'bateria sem leitura',
          say: 'Não consegui ler a bateria deste MacBook. Se ela foi removida ou está com defeito, vale levar numa assistência autorizada.',
        });
      }
      return Object.assign(r, {
        none: true, tone: null, pill: { label: 'Mac de mesa', icon: 'desktop' }, snippet: 'sem bateria',
        say: 'Este Mac não tem bateria, então aqui não tem o que medir. Ligado direto na tomada, isso não é problema nenhum.',
      });
    }
    const key = K.batStatusKey(b);
    const st = K.batteryStatus[key];
    const h = num(b.healthPct);
    const hTxt = h != null ? K.fmt.pct(h, h % 1 ? 1 : 0) : null;
    const cyc = num(b.cycles), dc = num(b.designCycles);
    const hot = num(b.temperatureC) != null && b.temperatureC >= 40;
    let tone = st.tone, pill = { label: st.label, icon: st.icon };
    if (hot && !(RANK[tone] >= RANK.warn)) { tone = 'warn'; pill = { label: 'Com calor', icon: 'thermo' }; }

    let say;
    if (key === 'trocar') say = 'O próprio macOS está pedindo revisão da bateria. Vale levar numa assistência autorizada pra conferir.';
    else if (key === 'gasta') say = `Ela guarda ${hTxt || 'menos'} da carga de quando era nova, abaixo dos 80% que a Apple usa como limite. A carga dura menos; trocar é uma opção quando isso incomodar.`;
    else if (key === 'de-olho' && dc && cyc != null && cyc >= dc * 0.8) say = `Já são ${K.fmt.num(cyc)} ciclos, perto dos ${K.fmt.num(dc)} pra que ela foi feita. Ainda funciona bem, mas vale acompanhar.`;
    else if (key === 'de-olho') say = `Ela guarda ${hTxt || 'um pouco menos'} da carga de quando era nova. Funciona bem, mas já vale acompanhar: abaixo de 80% a Apple considera gasta.`;
    else if (key === 'desconhecida') say = 'O Mac não informou a saúde da bateria agora, então não dá pra dizer como ela está. Tente escanear de novo daqui a pouco.';
    else say = `Ela guarda ${hTxt} da carga de quando era nova. A Apple só considera gasta abaixo de 80%, então está tranquilo.`;

    let tip = null;
    if (hot) tip = { icon: 'thermo', text: `Está quente (${K.fmt.temp(b.temperatureC)}), e calor é o que mais desgasta bateria. Deixe o Mac numa superfície dura, com as saídas de ar livres.` };
    else if (b.pluggedIn && b.percent >= 99 && !b.optimizedChargingEngaged) tip = { icon: 'leaf', text: 'Ficar em 100% o tempo todo desgasta um pouco mais. Se o Mac vive na tomada, deixe ligado o Carregamento otimizado (Ajustes do Sistema › Bateria).' };

    const side = [];
    side.push({ icon: b.isCharging ? 'bolt' : b.pluggedIn ? 'plug' : 'battery', label: 'Carga agora',
      value: num(b.percent) != null ? K.fmt.pct(b.percent, 0) : null, sub: chargeText(b).replace(/^[^,]*,\s*/, '') });
    side.push({ icon: 'cycle', label: 'Ciclos', value: cyc != null ? K.fmt.num(cyc) : null, sub: cyc == null ? 'o Mac não informou' : dc ? `de ${K.fmt.num(dc)} previstos` : 'contados pelo Mac' });
    const t = num(b.temperatureC);
    side.push({ icon: 'thermo', label: 'Temperatura', value: t != null ? K.fmt.temp(t) : null, sub: t == null ? 'o Mac não informou' : hot ? 'da bateria, quente' : t >= 35 ? 'da bateria, morna' : 'da bateria, tranquila' });
    return Object.assign(r, { tone, pill, key, unknown: key === 'desconhecida', health: h, snippet: hTxt ? `${hTxt} de saúde` : 'saúde sem leitura', say, tip, side });
  }

  function anEnergy(apps, b) {
    const r = { id: 'energia' };
    const list = K.energyItems(apps, { min: 0.5 });
    r.apps = list.slice(0, 3);
    /* o próprio Kamurafy gasta durante a varredura: o veredito olha pro primeiro que não é ele */
    const top = list.find((a) => a.note !== 'este app');
    if (!top) {
      return Object.assign(r, { tone: 'good', pill: { label: 'Tudo calmo', icon: 'check' }, snippet: 'tudo calmo',
        say: 'Ninguém está gastando energia de verdade agora. Tudo calmo.' });
    }
    const name = top.label;
    const sys = top.note === 'do sistema';
    const desk = !b || b.present === false;
    const onBattery = !desk && !b.pluggedIn;
    const heavy = top.value >= 60;
    const tone = heavy && onBattery ? 'warn' : 'good';
    const who = sys ? `${name}, do sistema,` : name;
    let say;
    if (heavy && onBattery && sys) say = `${who} está puxando bastante. Costuma passar sozinho; se durar muito, reiniciar o Mac costuma resolver.`;
    else if (heavy && onBattery) say = `${name} está puxando bastante. Se não estiver usando agora, fechar ajuda a bateria durar mais.`;
    else if (heavy && desk) say = `${sys ? 'Quem mais gasta é ' + name + ', do sistema' : name + ' é quem mais gasta'}. Num Mac de mesa isso só esquenta um pouco mais.`;
    else if (heavy) say = `${sys ? 'Quem mais gasta é ' + name + ', do sistema' : name + ' é quem mais gasta'}. Na tomada isso não pesa na bateria, mas conta quando você sair dela.`;
    else say = sys ? `Quem mais gasta agora é ${name}, do sistema. Nada fora do normal.` : `${name} é quem mais gasta agora, mas nada fora do normal.`;
    return Object.assign(r, {
      tone, say, top: name, heavy,
      pill: tone === 'warn' ? { label: 'Tem app puxando', icon: 'flame' } : { label: 'Tranquilo', icon: 'check' },
      snippet: `${name} na frente`,
      note: 'Impacto energético do macOS: serve pra comparar, não é watt.',
    });
  }

  const PRESSURE = {
    normal: { tone: 'good', label: 'Folgada', icon: 'check',
      say: 'Usar boa parte da memória é normal: o macOS aproveita pra deixar tudo rápido. O que importa é a pressão, e ela está baixa.' },
    atencao: { tone: 'warn', label: 'Apertada', icon: 'eye',
      say: 'Está ficando apertada, e o Mac já começou a comprimir e usar o disco. Fechar abas e apps parados alivia.' },
    critica: { tone: 'serious', label: 'No limite', icon: 'alert',
      say: 'Está sem folga e o Mac usa muito o disco no lugar dela, o que deixa tudo lento. Feche o que não estiver usando.' },
  };

  function anMemory(m) {
    if (!m || !num(m.totalBytes)) throw new Error('o macOS não informou a memória');
    const p = PRESSURE[m.pressure] || PRESSURE.normal;
    const used = num(m.usedBytes);
    const pct = used != null ? (used / m.totalBytes) * 100 : null;
    return {
      id: 'memoria', tone: p.tone, pill: { label: p.label, icon: p.icon }, say: p.say,
      value: used, valueFmt: (v) => gib(v), sub: `em uso, de ${gib(m.totalBytes, 0)}`,
      meter: pct, snippet: `${gib(used)} · ${p.label.toLowerCase()}`,
    };
  }

  const THERMAL = {
    normal: { txt: 'fresco', tone: 'good' },
    morno: { txt: 'morno', tone: 'good' },
    quente: { txt: 'quente', tone: 'warn' },
    critico: { txt: 'muito quente', tone: 'crit' },
  };

  function anCpu(cpu, thermal) {
    const usage = cpu ? num(cpu.usagePct) : null;
    const th = THERMAL[thermal] || null;
    if (usage == null && !th) throw new Error('o macOS não informou o processador');
    /* processador alto num instante não é defeito: no máximo "atenção", nunca vermelho */
    const busy = usage != null && usage >= 90;
    const working = usage != null && usage >= 60;
    const tone = worst(busy ? 'warn' : 'good', th ? th.tone : 'good');
    let pill, say;
    if (th && th.tone === 'crit') {
      pill = { label: 'Quente demais', icon: 'flame' };
      say = 'O Mac está muito quente e já segura a velocidade pra se proteger. Dê uma pausa no que é pesado e deixe as saídas de ar livres.';
    } else if (th && th.tone === 'warn') {
      pill = { label: 'Esquentando', icon: 'thermo' };
      say = 'O Mac está quente, e o macOS pode diminuir a velocidade pra esfriar. Vale deixar as saídas de ar livres.';
    } else if (busy) {
      pill = { label: 'A todo vapor', icon: 'eye' };
      say = 'Normal enquanto algo pesado roda. Se ficar assim com o Mac parado, veja no Painel quem está puxando.';
    } else if (working) {
      pill = { label: 'Trabalhando', icon: 'check' };
      say = 'O processador está trabalhando, mas ainda com folga.';
    } else {
      pill = { label: 'Tranquilo', icon: 'check' };
      say = 'O processador está folgado.';
    }
    const cores = cpu && num(cpu.cores);
    return {
      id: 'cpu', tone, pill, say, busy,
      value: usage, valueFmt: (v) => K.fmt.pct(v, 0), sub: 'em uso agora' + (cores ? ` · ${cores} núcleos` : ''),
      meter: usage, meterTone: busy ? 'warn' : null,
      facts: th ? [{ icon: 'thermo', text: `Temperatura do Mac: ${th.txt}` }] : [],
      note: 'É a leitura geral do macOS, não um sensor em graus.',
      snippet: [usage != null ? K.fmt.pct(usage, 0) : null, th ? th.txt : null].filter(Boolean).join(' · '),
    };
  }

  function anDisk(d) {
    const total = d ? num(d.totalBytes) : null;
    const avail = d ? (num(d.availableBytes) != null ? d.availableBytes : num(d.freeBytes)) : null;
    if (!total || avail == null) throw new Error('o macOS não informou o disco');
    const free = clamp((avail / total) * 100, 0, 100);
    const tone = free < 10 ? 'crit' : free < 20 ? 'warn' : 'good';
    let pill, say;
    if (tone === 'crit') {
      pill = { label: 'Quase cheio', icon: 'alert' };
      say = 'Quase sem espaço. O macOS precisa de folga pra memória extra e atualizações: vale tirar arquivos grandes que você não usa.';
    } else if (tone === 'warn') {
      pill = { label: 'Ficando cheio', icon: 'eye' };
      say = 'Está ficando cheio. Abaixo de 10% livre o Mac pode ficar lento e as atualizações podem não caber.';
    } else if (free >= 40) {
      pill = { label: 'Espaço de sobra', icon: 'check' };
      say = 'O macOS gosta de ter uns 10 a 20% livres pra trabalhar folgado, e você está bem acima disso.';
    } else {
      pill = { label: 'Espaço ok', icon: 'check' };
      say = 'O macOS gosta de ter uns 10 a 20% livres pra trabalhar folgado. Por enquanto está ok.';
    }
    return {
      id: 'disco', tone, pill, say,
      value: avail, valueFmt: (v) => K.fmt.bytes(v), sub: `livres pra usar, de ${K.fmt.bytes(total)} (${K.fmt.num(free, 0)}%)`,
      meter: 100 - free, meterLabel: 'ocupado',
      note: 'Conta também o que o macOS libera sozinho quando precisa.',
      snippet: `${K.fmt.bytes(avail)} livres`,
    };
  }

  function errResult(step, e) {
    const msg = e && e.message ? String(e.message) : '';
    return {
      id: step.id, error: true, tone: null, pill: { label: 'Sem leitura', icon: 'info' }, snippet: 'não deu pra ler',
      say: `Não consegui ler agora${msg ? ` (${msg})` : ''}. Tente escanear de novo daqui a pouco.`,
    };
  }

  /* ================= peças de tela ================= */

  function clearCharts() {
    for (const c of charts) { try { c.destroy(); } catch (e) { /* já foi */ } }
    for (const m of mascots) { try { m.destroy(); } catch (e) { /* já foi */ } }
    charts = [];
    mascots = [];
    afterMount = [];
  }

  function batteryState(b, extra) {
    if (!b || b.present === false) {
      const desk = !!b && !K.isLaptop(machine && machine.info);
      return Object.assign({ pct: null, tone: desk ? 'good' : 'none', charging: false, plugged: desk, full: false, hot: false }, extra);
    }
    const st = K.batStatus(b);
    return Object.assign({
      pct: num(b.percent), tone: st.tone, charging: !!b.isCharging, plugged: !!b.pluggedIn,
      full: !!b.pluggedIn && !b.isCharging && b.percent >= 99, hot: num(b.temperatureC) != null && b.temperatureC >= 40,
    }, extra);
  }

  function macStrip() {
    const m = machine || {};
    const info = m.info || {}, sys = m.sys || {};
    const bits = [];
    const model = info.model || sys.model;
    if (model) bits.push(K.fmt.model(model));
    const chip = info.chip || (sys.cpu && sys.cpu.chip);
    if (chip) bits.push(chip);
    if (sys.macOS) bits.push('macOS ' + sys.macOS);
    if (num(sys.uptimeSec)) bits.push('ligado há ' + K.fmt.duration(sys.uptimeSec));
    if (!bits.length) return null;
    const desk = m.b && m.b.present === false && !K.isLaptop(m.info);
    const strip = K.el('footer', { class: 'kz-mac', html: K.icon(desk ? 'desktop' : 'laptop') });
    bits.forEach((t, i) => {
      if (i) strip.appendChild(K.el('i', { class: 'kz-mac-dot', 'aria-hidden': 'true' }));
      strip.appendChild(K.el('span', null, t));
    });
    return strip;
  }

  function sparkles(n) {
    const star = 'M12 1.5c.9 6 3.6 8.7 9.5 9.8v1.4c-5.9 1.1-8.6 3.8-9.5 9.8h-1c-.9-6-3.6-8.7-9.5-9.8v-1.4C7.4 10.2 10.1 7.5 11 1.5Z';
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(K.el('span', {
        class: `kz-spark s${i + 1}`, 'aria-hidden': 'true',
        html: `<svg viewBox="0 0 24 24"><path d="${star}"/></svg>`,
      }));
    }
    return out;
  }

  /* ---------- parado ---------- */

  /** o que o mascote diz na entrada: a saúde da bateria (a estrela do app) já aparece aqui */
  function idleLine(b) {
    if (!b) return 'Bora dar uma geral?';
    if (b.present === false) return K.isLaptop(machine && machine.info) ? 'Não achei minha bateria.\nBora ver o resto?' : 'Sem bateria por aqui.\nBora dar uma geral?';
    const key = K.batStatusKey(b);
    const h = num(b.healthPct);
    const hTxt = h != null ? K.fmt.pct(h, h % 1 ? 1 : 0) : null;
    if (key === 'trocar') return 'O macOS pediu revisão da bateria.\nBora ver o resto?';
    if (key === 'desconhecida' || !hTxt) return 'Não consegui medir minha saúde agora.\nBora ver o resto?';
    if (key === 'gasta') return `Tô com ${hTxt} de saúde, já guardo menos.\nBora ver o resto?`;
    if (key === 'de-olho') return `Tô com ${hTxt} de saúde.\nBora conferir o resto?`;
    return `Tô com ${hTxt} de saúde.\nBora ver o resto?`;
  }

  function paintIdle() {
    clearCharts();
    mode = 'idle';
    host.innerHTML = '';
    host.dataset.mode = 'idle';
    ui = {};

    ui.hello = K.el('span', { class: 'sticker kz-hello' }, greeting());
    ui.h1 = K.el('h1', null, K.el('span', null, 'Bora dar uma geral'), ' ', K.el('span', null, 'no seu Mac?'));
    ui.p = K.el('p', null, 'Confiro cinco coisas em uns segundos. Só olho, não apago nada.');
    host.appendChild(K.el('header', { class: 'page-head kz-head', 'data-drag': true },
      K.el('div', { class: 'kz-head-text' }, ui.hello, ui.h1, ui.p)));

    /* botão enorme + anel (escondido até começar) */
    ui.go = K.el('button', { class: 'kz-go', type: 'button', 'aria-label': 'Escanear o Mac', onclick: () => runScan() },
      /* reflexo só no alto do botão: o texto ocupa de 50% a 63% da altura */
      K.el('span', { class: 'kz-go-shine', 'aria-hidden': 'true', html: '<svg viewBox="0 0 100 100"><path d="M18 35 Q22 21 36 14"/><circle cx="14.5" cy="43" r="2.3"/></svg>' }),
      K.el('span', { class: 'kz-go-ic', html: K.icon('scan') }),
      K.el('span', { class: 'kz-go-label' }, 'Escanear'),
      K.el('span', { class: 'kz-go-sub' }, 'leva uns 5 segundos'));
    ui.ringBox = K.el('div', { class: 'kz-ring' });
    ui.ringIc = K.el('span', { class: 'kz-ring-ic', html: K.icon('battery') });
    ui.ringPct = K.el('span', { class: 'kz-ring-pct num' }, '0%');
    ui.ringMid = K.el('div', { class: 'kz-ring-mid', 'aria-hidden': 'true' }, ui.ringIc, ui.ringPct);
    ui.now = K.el('div', { class: 'kz-now', role: 'status', 'aria-live': 'polite' }, '');

    /* o mascote mora no canto do botão, com um balão de fala */
    const b = machine && machine.b;
    const mBox = K.el('div', { class: 'kz-orb-mascot' });
    ui.bubble = K.el('div', { class: 'kz-bubble' }, idleLine(b));
    const orb = K.el('div', { class: 'kz-orb' },
      K.el('span', { class: 'kz-orbit', 'aria-hidden': 'true' }),
      K.el('span', { class: 'kz-halo', 'aria-hidden': 'true' }),
      ...sparkles(3),
      K.el('div', { class: 'kz-go-wrap' }, ui.go),
      K.el('div', { class: 'kz-ring-wrap' }, ui.ringBox, ui.ringMid),
      ui.now, mBox, ui.bubble);
    /* na entrada ele recebe acordado (cheio na tomada ele dormiria) */
    const small = innerHeight < 760;
    const mascot = K.mascot(mBox, { size: small ? 100 : 120, state: Object.assign(batteryState(b), { full: false }) });
    mascots.push(mascot);
    ui.mascot = mascot;
    ui.go.addEventListener('mouseenter', () => { if (mode === 'idle') mascot.set({ face: 'joy' }); });
    ui.go.addEventListener('mouseleave', () => { if (mode === 'idle') mascot.set({ face: null }); });

    ui.listHead = K.el('b', null, 'O que eu confiro');
    ui.listCount = K.el('span', { class: 'kz-count num' }, '');
    const ol = K.el('ol', { class: 'kz-steps' });
    ui.steps = STEPS.map((s, i) => {
      const bub = K.el('span', { class: 'kz-bub', html: K.icon(s.icon) });
      const snip = K.el('span', { class: 'kz-snip' });
      const desc = K.el('span', { class: 'kz-desc' }, s.desc);
      const row = K.el('li', { class: 'kz-step pop-in', dataset: { state: 'idle' }, style: { animationDelay: 120 + i * 70 + 'ms' } },
        bub, K.el('span', { class: 'kz-step-text' }, K.el('b', null, s.name), desc), snip);
      ol.appendChild(row);
      return { row, bub, snip, desc };
    });
    const list = K.el('div', { class: 'kz-list' }, K.el('div', { class: 'kz-list-head' }, ui.listHead, ui.listCount), ol);

    ui.stage = K.el('section', { class: 'kz-stage', 'data-drag': true }, orb, list);
    host.appendChild(ui.stage);
    const strip = macStrip();
    if (strip) host.appendChild(strip);
  }

  function setStep(i, state, res) {
    const s = ui.steps && ui.steps[i];
    if (!s) return;
    s.row.dataset.state = state;
    s.bub.className = 'kz-bub';
    if (state === 'on') {
      s.snip.textContent = '';
      s.desc.textContent = STEPS[i].doing;
    } else if (state === 'done' || state === 'err') {
      s.desc.textContent = STEPS[i].desc;
      const tone = res && res.tone;
      const icon = state === 'err' ? 'info' : res && res.none ? (res.pill && res.pill.icon) || 'info' : K.toneIcon(tone);
      s.bub.innerHTML = K.icon(icon);
      s.bub.classList.add(state === 'err' || !tone ? 't-none' : 't-' + tone, 'kz-bump');
      s.snip.textContent = (res && res.snippet) || '';
      s.snip.title = s.snip.textContent;
    }
  }

  /* ---------- varredura ---------- */

  async function runScan() {
    if (!host || mode === 'scanning') return;
    /* no Mac, clique de mouse não foca botão: botão focado aqui = veio do teclado */
    const act = document.activeElement;
    const byKeyboard = !!(act && act.tagName === 'BUTTON' && host.contains(act));
    if (mode !== 'idle' || !ui.stage) paintIdle();
    const my = ++token;
    mode = 'scanning';
    host.dataset.mode = 'scanning';
    K.sound.plop();
    const t0 = performance.now();

    const size = ui.go.offsetWidth || 220;
    ui.stage.classList.add('is-scanning');
    ui.hello.textContent = 'Varrendo…';
    ui.h1.textContent = 'Dando uma geral…';
    ui.p.textContent = 'Só olhando, sem mexer em nada. Mais uns segundinhos.';
    if (ui.bubble) ui.bubble.hidden = true;
    ui.listHead.textContent = 'Conferindo';
    ui.mascot.set({ face: 'happy' });
    ui.steps.forEach((s, i) => setStep(i, 'wait'));
    const ring = K.charts.ring(ui.ringBox, { value: 0, tone: 'gold', text: '', label: 'Varredura', busy: true, size, thickness: 13 });
    charts.push(ring);

    const ctx = {};
    const results = [];
    for (let i = 0; i < STEPS.length; i++) {
      if (my !== token) return;
      const s = STEPS[i];
      setStep(i, 'on');
      ui.now.textContent = s.doing;
      ui.ringIc.innerHTML = K.icon(s.icon);
      ui.ringIc.classList.remove('kz-bump');
      void ui.ringIc.offsetWidth;
      ui.ringIc.classList.add('kz-bump');
      ui.listCount.textContent = `${i + 1} de ${STEPS.length}`;
      const [out] = await Promise.allSettled([withTimeout(Promise.resolve().then(() => s.run(ctx)), STEP_MAX), K.sleep(STEP_MIN)]);
      if (my !== token) return;
      let res;
      if (out.status === 'fulfilled' && out.value) res = out.value;
      else {
        res = errResult(s, out.reason);
        console.warn(`varredura/${s.id}: ${out.reason && out.reason.message}`);
      }
      results.push(res);
      setStep(i, res.error ? 'err' : 'done', res);
      if (res.error) K.sound.oops(); else K.sound.tick();
      const pct = Math.round(((i + 1) / STEPS.length) * 100);
      ring.update({ value: pct, busy: i < STEPS.length - 1 });
      ui.ringPct.textContent = pct + '%';
    }

    ring.update({ value: 100, busy: false, tone: 'good' });
    ui.ringIc.innerHTML = K.icon('check');
    ui.now.textContent = 'Pronto!';
    ui.p.textContent = 'Juntando o que achei…';
    await K.sleep(650);
    if (my !== token) return;
    last = { results, at: nowS(), took: (performance.now() - t0) / 1000 };
    if (ctx.b) machine = Object.assign({}, machine, { b: ctx.b });
    K.sound.tada();
    paintResult(true);
    if (byKeyboard && ui.sumTitle) ui.sumTitle.focus({ preventScroll: true });
  }

  /* ---------- resultado ---------- */

  const lower = (id) => ({ bateria: 'saúde da bateria' }[id] || STEPS.find((s) => s.id === id).name.toLowerCase());
  const listPt = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);

  /** título, texto e rosto do resumo: nunca diz "tudo certo" do que não conseguiu ler */
  function summaryOf(results) {
    const att = results.filter(isAttention);
    const errs = results.filter((r) => r.error);
    const missing = results.filter((r) => r.error || r.unknown);
    const skipped = results.filter((r) => r.none);
    const read = results.filter((r) => !r.error && !r.none);
    const ok = read.filter((r) => !isAttention(r) && !r.unknown);
    const w = worst(...att.map((r) => r.tone));
    const total = results.length - skipped.length;
    const deskNote = skipped.length ? ' (este Mac não tem bateria)' : '';
    const out = { att, errs, w };
    if (!read.length) {
      out.kind = 'fail';
      out.title = 'Não consegui ler o Mac agora';
      out.sub = `Nenhuma das ${total} leituras respondeu. Às vezes o macOS demora logo depois de acordar: tente de novo daqui a pouco.`;
      out.face = 'worried';
      return out;
    }
    if (att.length) {
      out.kind = 'att';
      out.title = att.length === 1 ? 'Achei 1 ponto de atenção' : `Achei ${att.length} pontos de atenção`;
      out.sub = `${ok.length ? `${ok.length} em ordem e ${att.length} pra olhar com calma. ` : ''}Nada de pânico: cada cartão diz o que é e o que dá pra fazer.`;
      out.face = RANK[w] >= RANK.serious ? 'worried' : 'happy';
    } else if (missing.length) {
      out.kind = 'partial';
      const n = total - missing.length;
      out.title = `Li ${n} de ${total} coisas${deskNote}`;
      out.sub = `O que deu pra ler está em ordem, mas não dá pra falar do resto.`;
      out.face = 'happy';
    } else {
      out.kind = 'ok';
      out.title = 'Tudo certo por aqui!';
      out.sub = skipped.length
        ? `Conferi ${total} coisas${deskNote} e está tudo em ordem. Nada pede sua atenção agora.`
        : `Conferi as ${total} coisas e está tudo em ordem. Nada pede sua atenção agora.`;
      out.face = 'joy';
    }
    if (missing.length) out.sub += ` Ficou sem leitura: ${listPt(missing.map((r) => lower(r.id)))}. Vale escanear de novo daqui a pouco.`;
    return out;
  }

  function paintResult(fresh) {
    clearCharts();
    mode = 'result';
    host.innerHTML = '';
    host.dataset.mode = 'result';
    ui = {};
    const results = last.results;
    const byId = {};
    for (const r of results) byId[r.id] = r;
    const sm = summaryOf(results);

    const when = fresh ? `Feita agora, em ${K.fmt.num(last.took, 0)} s` : `Feita às ${K.fmt.time(last.at)}`;
    const art = K.el('div', { class: 'kz-sum-art' });
    const again = K.el('button', { class: 'btn ink kz-again', type: 'button', html: K.icon('cycle'), onclick: () => runScan() },
      sm.kind === 'fail' || sm.kind === 'partial' ? 'Tentar de novo' : 'Escanear de novo');
    const sum = K.el('section', { class: `card gold kz-sum pop-in${sm.kind === 'fail' ? ' is-fail' : ''}`, 'data-drag': true },
      ...(sm.kind === 'ok' || sm.kind === 'att' ? sparkles(4) : []),
      art,
      K.el('div', { class: 'kz-sum-text' },
        K.el('span', { class: 'sticker kz-when' }, when),
        (ui.sumTitle = K.el('h1', { tabindex: '-1' }, sm.title)),
        K.el('p', null, sm.sub),
        K.el('div', { class: 'kz-sum-act' }, again)));
    host.appendChild(sum);
    const bat = byId.bateria;
    mascots.push(K.mascot(art, { size: 132, state: batteryState(bat && bat.b, { face: sm.face, full: false }) }));

    if (sm.kind !== 'fail') {
      const acts = actionsFor(byId);
      if (acts.length) host.appendChild(actionsBlock(acts));
    }

    /* cartões: o que pede atenção vem primeiro, com uma figurinha "olhe aqui" */
    const desk = !!(bat && bat.none);
    const cards = [];
    cards.push({ r: bat || errResult(STEPS[0]), make: (r, st) => batteryCard(r, st) });
    cards.push({ r: byId.energia || errResult(STEPS[1]), make: (r, st) => energyCard(r, st, desk) });
    for (const id of ['memoria', 'cpu', 'disco']) {
      const step = STEPS.find((x) => x.id === id);
      cards.push({ r: byId[id] || errResult(step), make: (r, st) => plainCard(step, r, st) });
    }
    const order = cards.map((c, i) => ({ c, i, a: isAttention(c.r) ? RANK[c.r.tone] : 0 }))
      .sort((x, y) => y.a - x.a || x.i - y.i);
    const grid = K.el('div', { class: 'kz-grid' });
    let n = 0;
    const delay = () => ({ animationDelay: 140 + n++ * 90 + 'ms' });
    for (const o of order) {
      const node = o.c.make(o.c.r, delay());
      if (o.a > 0) { node.classList.add('is-att'); node.appendChild(K.el('span', { class: 'sticker kz-look', 'aria-hidden': 'true' }, 'olhe aqui')); }
      grid.appendChild(node);
    }
    grid.appendChild(faxinaCard(delay()));
    host.appendChild(grid);
    const todo = afterMount;
    afterMount = [];
    for (const fn of todo) { try { fn(); } catch (e) { console.error('varredura/gráfico: ' + (e.stack || e.message)); } }
    const strip = macStrip();
    if (strip) host.appendChild(strip);
    if (fresh) setTimeout(() => { if (host && mode === 'result') host.closest('.view').scrollTop = 0; }, 0);
  }

  /* ---------- "o que dá pra fazer agora": até 3 ações seguras, de um clique ---------- */
  function actionsFor(byId) {
    const out = [];
    const bat = byId.bateria, en = byId.energia, cpu = byId.cpu, disk = byId.disco, mem = byId.memoria;
    const b = bat && !bat.error && !bat.none && !bat.missing ? bat.b : null;
    if (b && (bat.key === 'trocar' || bat.key === 'gasta')) {
      out.push({ icon: 'btWrench', tone: bat.tone, title: 'Trocar a bateria', text: 'A Apple mostra preço e onde levar pro seu modelo.',
        btn: 'Ver opções de troca', run: () => K.api('open.url', { url: 'https://support.apple.com/pt-br/mac/repair' }).catch(() => {}) });
    }
    if (en && !en.error && en.top && (en.tone !== 'good' || en.heavy || (cpu && cpu.busy))) {
      out.push({ icon: 'flame', tone: en.tone !== 'good' ? en.tone : null, title: 'Ver quem está puxando', text: `${en.top} está na frente agora.`,
        btn: 'Ver a lista', run: () => go(b ? 'bateria?secao=apps' : 'painel') });
    }
    if (disk && !disk.error && disk.tone !== 'good') {
      out.push({ icon: 'disk', tone: disk.tone, title: 'Liberar espaço', text: 'Veja no Painel quanto sobra e o que o macOS libera sozinho.', btn: 'Ver o disco', run: () => go('painel') });
    }
    if (mem && !mem.error && mem.tone !== 'good') {
      out.push({ icon: 'memory', tone: mem.tone, title: 'Aliviar a memória', text: 'Fechar abas e apps parados é o que mais ajuda.', btn: 'Ver a memória', run: () => go('painel') });
    }
    if (b && b.pluggedIn) {
      const s = K.settings.value;
      if (s && s.aviso80 === false) {
        out.push({ icon: 'bell', title: `Aviso dos ${s.limiteAviso || 80}%`, text: 'Te chamo quando a carga chegar lá, pra tirar da tomada se quiser.',
          btn: 'Ligar o aviso', toggle: true });
      } else if (!b.optimizedChargingEngaged && b.percent >= 99) {
        out.push({ icon: 'btShield', title: 'Carregamento otimizado', text: 'Ficar sempre em 100% desgasta mais. O macOS pode segurar em 80% pra você.',
          btn: 'Ver como ligar', run: () => go('bateria?secao=cuidados') });
      }
    }
    if (b && out.length && out.length < 3) {
      const s = K.settings.value;
      if (s && s.aviso80) out.push({ icon: 'bell', title: `Aviso dos ${s.limiteAviso || 80}%`, text: 'Já está ligado: te chamo quando a carga chegar lá.', done: 'Ligado', btn: 'Mudar', run: () => go('bateria?secao=avisos') });
    }
    return out.slice(0, 3);
  }

  function actionsBlock(acts) {
    const row = K.el('div', { class: 'kz-acts-row' });
    acts.forEach((a, i) => {
      const btn = K.el('button', { class: 'btn small' + (a.done ? '' : ' gold'), type: 'button' }, a.btn, K.el('span', { class: 'btn-ic', html: K.icon('arrow') }));
      const item = K.el('div', { class: 'kz-act pop-in' + (a.tone ? ' t-' + a.tone : ''), style: { animationDelay: 80 + i * 70 + 'ms' } },
        K.el('span', { class: 'head-ic' + (a.tone ? ' ' + a.tone : ''), html: K.icon(K.ICONS[a.icon] ? a.icon : 'sparkle') }),
        K.el('div', { class: 'kz-act-text' },
          K.el('b', null, a.title, a.done ? K.statusPill('good', a.done, 'check') : null),
          K.el('span', null, a.text)),
        btn);
      if (a.toggle) {
        btn.firstChild.textContent = a.btn;
        btn.querySelector('.btn-ic').remove();
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await K.settings.set({ aviso80: true });
            K.sound.tada();
            item.querySelector('.kz-act-text span').textContent = 'Ligado! Te chamo quando a carga chegar lá.';
            item.querySelector('.kz-act-text b').appendChild(K.statusPill('good', 'Ligado', 'check'));
            btn.remove();
          } catch (e) {
            K.sound.oops();
            btn.disabled = false;
            item.querySelector('.kz-act-text span').textContent = 'Não consegui ligar agora: ' + ((e && e.message) || 'erro desconhecido');
          }
        });
      } else btn.addEventListener('click', () => { K.sound.plop(); a.run(); });
      row.appendChild(item);
    });
    return K.el('section', { class: 'kz-acts', 'aria-label': 'O que dá pra fazer agora' },
      K.el('h2', { class: 'kz-acts-title' }, 'O que dá pra fazer agora'), row);
  }

  function cardHead(step, r) {
    return K.el('div', { class: 'kz-res-head' },
      K.el('span', { class: 'head-ic', html: K.icon(step.icon) }),
      K.el('div', { class: 'kz-res-title' },
        K.el('h2', null, step.name),
        r.pill ? K.statusPill(r.error || r.none ? 'none' : r.tone, r.pill.label, r.pill.icon) : null));
  }

  function cardFoot(step, label, extra) {
    return K.el('div', { class: 'kz-res-foot' },
      extra || null,
      K.el('button', { class: 'btn small', type: 'button', onclick: () => go(step.route) },
        label || 'Ver detalhes', K.el('span', { class: 'btn-ic', html: K.icon('arrow') })));
  }

  function meterEl(pct, tone, mark) {
    const fill = K.el('div', { class: `meter-fill ${tone || ''}`, style: { width: '0%' } });
    const wrap = K.el('div', { class: 'kz-meter' }, K.el('div', { class: 'meter' }, fill));
    if (mark != null) {
      wrap.appendChild(K.el('span', { class: 'kz-mark', style: { left: mark + '%' }, 'aria-hidden': 'true' }));
      wrap.appendChild(K.el('span', { class: 'kz-mark-label', style: { left: mark + '%' } }, K.fmt.pct(mark, 0)));
    }
    const target = pct == null ? 0 : clamp(pct, 0, 100);
    if (target === 0) fill.style.visibility = 'hidden';
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('snap');
    if (calm) fill.style.width = target + '%';
    else K.charts.soon(() => { fill.style.width = target + '%'; });
    return wrap;
  }

  function factsEl(facts) {
    if (!facts || !facts.length) return null;
    return K.el('div', { class: 'kz-facts' }, facts.map((f) => K.el('span', { class: 'kz-fact', html: K.icon(f.icon) }, f.text)));
  }

  function valueEl(v, fmt, cls) {
    const n = K.el('span', { class: cls || 'kz-val num' }, '');
    if (v == null) K.readOr(n, null);
    else K.countUp(n, v, fmt, 900);
    return n;
  }

  function batteryCard(r, style) {
    const step = STEPS[0];
    if (r.none) {
      /* Mac de mesa: cartão compacto, sem botão pra uma tela vazia */
      const c = K.el('article', { class: 'card kz-res kz-bat-compact pop-in', style });
      c.appendChild(cardHead(step, r));
      c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
      return c;
    }
    const c = K.el('article', { class: 'card kz-res kz-bat pop-in', style });
    c.appendChild(cardHead(step, r));
    if (r.error || r.missing) {
      c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
    } else {
      const main = K.el('div', { class: 'kz-bat-main' },
        r.health == null
          ? K.el('div', { class: 'kz-hero-none' }, 'Saúde sem leitura agora')
          : K.el('div', { class: 'kz-hero-row' },
            valueEl(r.health, (v) => K.fmt.pct(v, r.health % 1 ? 1 : 0), 'kz-hero num'),
            K.el('span', { class: 'kz-hero-lab' }, 'de saúde', K.el('small', null, 'da capacidade de fábrica'))));
      /* a barra da saúde fica na cor da saúde (calor não pinta a saúde de amarelo) */
      const hTone = K.batStatus(r.b).tone;
      if (r.health != null) main.appendChild(meterEl(r.health, hTone, 80));
      main.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
      const side = K.el('ul', { class: 'kz-bat-side' }, (r.side || []).map((f) =>
        K.el('li', null,
          K.el('span', { class: 'kz-side-ic', html: K.icon(f.icon) }),
          K.el('span', { class: 'kz-side-text' },
            K.el('span', { class: 'kz-side-lab' }, f.label),
            K.readOr(K.el('span', { class: 'kz-side-val num' }), f.value, (v) => v),
            K.el('span', { class: 'kz-side-sub' }, f.sub)))));
      c.appendChild(K.el('div', { class: 'kz-bat-body' }, main, side));
    }
    if (r.tip) c.appendChild(K.el('div', { class: 'tip kz-tip', html: K.icon(r.tip.icon) }, K.el('p', null, r.tip.text)));
    c.appendChild(cardFoot(step, 'Ver a bateria'));
    return c;
  }

  function energyCard(r, style, wide) {
    const step = STEPS[1];
    const c = K.el('article', { class: 'card kz-res kz-energy pop-in' + (wide ? ' kz-wide' : ''), style });
    c.appendChild(cardHead(step, r));
    if (!r.error && r.apps && r.apps.length) {
      c.appendChild(K.el('div', { class: 'kz-res-kicker', title: r.note || '' }, 'Quem mais gasta agora ', K.el('span', { class: 'muted' }, '(impacto energético, não é watt)')));
      const box = K.el('div', { class: 'kz-bars' });
      c.appendChild(box);
      afterMount.push(() => charts.push(K.charts.bars(box, {
        items: r.apps,
        color: 'var(--s2)', valueName: 'de impacto', labelName: 'App', labelWidth: wide ? 260 : 170, thickness: 14,
        format: (v) => K.fmt.num(v, v < 10 ? 1 : 0),
        table: true,
        empty: 'Ninguém gastando energia de verdade agora. Tudo calmo.',
        ariaLabel: 'Apps que mais gastam energia agora',
      })));
    }
    c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
    if (r.note && !(r.apps && r.apps.length)) c.appendChild(K.el('p', { class: 'kz-note' }, r.note));
    c.appendChild(cardFoot(step, null));
    return c;
  }

  function plainCard(step, r, style) {
    const c = K.el('article', { class: `card kz-res kz-${step.id} pop-in`, style });
    c.appendChild(cardHead(step, r));
    if (!r.error) {
      c.appendChild(K.el('div', { class: 'kz-val-row' }, valueEl(r.value, r.valueFmt), K.el('span', { class: 'kz-val-sub' }, r.sub)));
      if (r.meter != null) c.appendChild(meterEl(r.meter, r.meterTone || (r.tone === 'good' ? 's1' : r.tone)));
      const f = factsEl(r.facts);
      if (f) c.appendChild(f);
    }
    c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
    if (r.note && !r.error) c.appendChild(K.el('p', { class: 'kz-note' }, r.note));
    c.appendChild(cardFoot(step));
    return c;
  }

  function faxinaCard(style) {
    const c = K.el('article', { class: 'card kz-res kz-fax pop-in', style },
      K.el('span', { class: 'head-ic', html: K.icon('broom') }),
      K.el('div', { class: 'kz-fax-text' },
        K.el('div', { class: 'kz-fax-title' }, K.el('h2', null, 'Faxina'), K.el('span', { class: 'sticker kz-soon' }, 'em breve')),
        K.el('p', { class: 'kz-res-say' }, 'Caches velhos, downloads esquecidos e restos de apps. Vou mostrar tudo antes, e só vai pra Lixeira o que você marcar.')),
      K.el('button', { class: 'btn small', type: 'button', onclick: () => go('faxina') }, 'Ver o que vem aí', K.el('span', { class: 'btn-ic', html: K.icon('arrow') })));
    return c;
  }

  /* ================= página ================= */

  async function loadMachine() {
    const [b, info, sys] = await Promise.allSettled([
      K.cached('battery.now', null, 5000),
      K.cached('battery.info', null, 600000),
      K.api('system.now'),
    ]);
    machine = {
      b: b.status === 'fulfilled' ? b.value : null,
      info: info.status === 'fulfilled' ? info.value : null,
      sys: sys.status === 'fulfilled' ? sys.value : null,
    };
  }

  K.pages.inicio = {
    title: 'Varredura',
    async render(el) {
      host = el;
      token++;
      await loadMachine();
      if (host !== el) return;
      if (!pendingScan && last && nowS() - last.at < KEEP_S) paintResult(false);
      else paintIdle();
      if (pendingScan) { pendingScan = false; setTimeout(() => runScan(), 300); }
    },
    destroy() {
      token++;
      clearCharts();
      host = null;
      mode = 'idle';
      ui = {};
    },
  };

  /** Começa a varredura (se já estiver varrendo, não faz nada). Não devolve Promise (o modo foto chama direto). */
  K.scan = function () {
    if (host && document.body.contains(host)) { runScan(); return; }
    pendingScan = true;
    location.hash = '#/inicio';
  };

  /** Esquece o último resultado e volta pro botão de escanear. */
  K.scanReset = function () {
    token++;
    last = null;
    pendingScan = false;
    if (host && document.body.contains(host)) paintIdle();
  };
})();
