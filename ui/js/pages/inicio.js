/* Kamurafy — Varredura (rota "inicio"), a tela de entrada.
   Três momentos na mesma tela:
     parado     → saudação, botão redondo enorme "Escanear" e a lista do que ele confere;
     escaneando → o botão vira um anel de progresso e cada passo ganha ✓ com o que achou;
     resultado  → resumo ("Tudo certo por aqui!" / "Achei N pontos de atenção") e cartões.
   K.scan() começa a varredura (usado nos testes com tools/foto.sh); K.scanReset() volta pro botão.
   Regras de status honestas: só vira "atenção" o que de fato pede alguma ação.
   A varredura só LÊ: o passo "Sujeira" usa cleanup.scan (caches, programação e registros; nunca
   Downloads, que faria o macOS pedir permissão) e o passo "Velocidade" usa speed.diagnose.
   O único lugar que mexe em algo é o botão "Deixar voando" do resumo: mostra antes (K.confirm com
   caixinhas), e só faz o que a pessoa deixou marcado: caches que a Faxina já traria marcados vão
   pra Lixeira (cleanup.clean), apps no talo recebem o pedido de fechar (optimize.quit, como o
   Cmd+Q) e o aviso dos 80% é ligado (settings.set). */
'use strict';

(function () {
  Object.assign(K.ICONS, {
    laptop: '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.8"/><path d="M2.5 18h19l-.9 1.3a1.6 1.6 0 0 1-1.3.7H4.7a1.6 1.6 0 0 1-1.3-.7Z"/>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M9.5 20.5h5M12 16v4.5"/>',
    party: '<path d="M4 20.5 8.2 8.8l7 7Z"/><path d="M13.5 7.5c.6-1.6 1.9-2.3 3.6-2.1M16.5 11.5c1.4-.9 2.9-.9 4.2.2M11 4.5v-1M20 8.5h1M18.8 3.8l.7-.7"/>',
    kzUndo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
  });

  const STEP_MIN = 750;          // cada passo fica pelo menos isso na tela (dá tempo de ver)
  const STEP_MAX = 9000;         // passo que passa disso vira "sem leitura" e a varredura segue
  const KEEP_S = 15 * 60;        // resultado continua na tela por 15 min ao voltar pra cá
  const RANK = { good: 0, warn: 1, serious: 2, crit: 3 };
  const GB = 1e9;                // base 10, como o Finder e o K.fmt.bytes
  const DIRT_TIP = GB;           // até aqui a sujeira é "tranquilo"; acima vira sugestão (nunca alarme)
  const DIRT_CAT_MS = 9000;      // cada categoria que passa disso fica de fora (as outras seguem)
  const STARTUP_MIN = 3;         // itens de início: até 2 é o normal; a partir daqui vira atalho pro Otimizar
  const STARTUP_MS = 8000;       // a leitura dos itens de início roda por fora: demorou, fica sem o atalho
  const FLY_MIN = 50e6;          // "Deixar voando" só leva os caches quando somam isso ou mais (base 10)
  const FLY_STEP_MIN = 600;      // cada passo do "Deixar voando" fica pelo menos isso na tela
  const FLY_CHECK_MS = 1500;     // espera antes de conferir se os apps fecharam mesmo

  const STEPS = [
    { id: 'bateria', name: 'Bateria', icon: 'battery', desc: 'saúde, ciclos e carga', doing: 'Olhando a bateria…', route: 'bateria', run: stepBattery },
    { id: 'energia', name: 'Energia', icon: 'bolt', desc: 'quem mais gasta agora', doing: 'Vendo quem gasta energia…', route: 'bateria', run: stepEnergy },
    { id: 'memoria', name: 'Memória', icon: 'memory', desc: 'folgada ou apertada', doing: 'Medindo a memória…', route: 'painel', run: stepMemory },
    { id: 'cpu', name: 'Processador', icon: 'cpu', desc: 'uso e temperatura', doing: 'Sentindo o processador…', route: 'painel', run: stepCpu },
    { id: 'velocidade', name: 'Velocidade', icon: 'gauge', desc: 'o que deixa lento agora', doing: 'Vendo o que pesa…', route: 'otimizar?aba=lento', run: stepSpeed },
    { id: 'disco', name: 'Disco', icon: 'disk', desc: 'quanto espaço sobra', doing: 'Medindo o disco…', route: 'painel', run: stepDisk },
    { id: 'sujeira', name: 'Sujeira', icon: 'broom', desc: 'caches e registros sobrando', doing: 'Procurando sujeira…', route: 'faxina', run: stepDirt,
      max: DIRT_CAT_MS * 3 + 2000 },
  ];
  const DIRT_STEP = STEPS.find((s) => s.id === 'sujeira');
  const SPEED_STEP = STEPS.find((s) => s.id === 'velocidade');
  const COUNT_PT = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

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
  const byIdOf = (results) => { const o = {}; for (const r of results || []) o[r.id] = r; return o; };
  /* nome que vem de fora (app, processo): caractere que muda a direção do texto vira �, e no meio
     de uma frase o nome vai isolado (FSI…PDI), como na Faxina. Sempre por textContent. */
  const safeName = (s) => String(s == null ? '' : s).replace(/[؜‎‏‪-‮⁦-⁩]/g, '�').trim();
  const inl = (s) => '⁨' + safeName(s) + '⁩';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** motivo que o Swift mandou → pedaço de frase (sem UUID, sem ponto final, minúscula) */
  function whyTxt(m) {
    let s = String(m || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim().replace(/[.!]+$/, '');
    if (/não está mais na lista/i.test(s)) s = 'a lista mudou: escaneie de novo';
    if (!s) return 'motivo desconhecido';
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  /** memória em base 2, como o Monitor de Atividade ("16 GB", não "17,2 GB"): a mesma função do
      Painel, do Otimizar e do balão */
  const gib = (v, casas) => K.fmt.mem(v, casas);

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

  /* ================= sujeira: olhada rápida pra Varredura e pro Painel =================
     K.dirt.check({fresh, maxAgeMs, onCat}) → {at, sel, bytes, cats, errs, incompleto}
       sel   = bytes que a Faxina já traz marcados (o seguro); bytes = tudo que achou
       ids / idsBytes = os IDs desses itens marcados (pro "Deixar voando") e quanto somam
       cats  = [{id, titulo, bytes, sel, incompleto, top: {nome, bytes} | null}] (só as que responderam)
       errs  = [{id, nome, msg}] (categorias que não deu pra ver)
     Só lê (cleanup.scan), uma categoria por vez. Sem nenhuma categoria lida, rejeita.
     O resultado é esquecido quando a pessoa passa pela Faxina (lá ela pode ter limpado):
     K.dirt.gen muda e quem guardou um número sabe que ele ficou velho. */
  K.dirt = (function () {
    const CATS = ['caches', 'dev', 'logs'];
    const NAMES = { caches: 'caches de apps', dev: 'caches de programação', logs: 'registros' };
    let last = null, running = null, gen = 0;

    async function run(onCat) {
      const my = gen;
      const out = { at: 0, sel: 0, bytes: 0, cats: [], errs: [], incompleto: false, ids: [], idsBytes: 0, paths: {} };
      for (const id of CATS) {
        if (onCat) { try { onCat(id, NAMES[id]); } catch (e) { /* só aviso de progresso */ } }
        try {
          const c = await withTimeout(K.api('cleanup.scan', { categoria: id }), DIRT_CAT_MS);
          if (!c || num(c.bytes) == null) throw new Error('resposta vazia');
          /* o que vem marcado segue a mesma regra da Faxina (K.cleanSuggested), pra o número bater */
          const pick = K.cleanSuggested || ((it) => !!it && it.selecionado);
          const list = Array.isArray(c.itens) ? c.itens : null;
          const sel = list ? list.reduce((a, it) => a + (pick(it) && num(it.bytes) ? it.bytes : 0), 0) : num(c.bytesSelecionados) || 0;
          let top = null;
          for (const it of list || []) {
            if (pick(it) && num(it.bytes) && (!top || it.bytes > top.bytes)) top = it;
            /* só IDs que o Swift devolveu, e só do que a Faxina traria marcado */
            if (pick(it) && typeof it.id === 'string' && it.id) { out.ids.push(it.id); out.idsBytes += num(it.bytes) || 0; out.paths[it.id] = String(it.caminho || ''); }
          }
          out.cats.push({
            id, titulo: c.titulo || NAMES[id], bytes: c.bytes, sel, incompleto: !!c.incompleto,
            /* nome e app vêm de fora: quem mostrar usa textContent */
            /* caractere que muda a direção do texto (U+202E…) vira � pra não inverter a frase */
            top: top ? { nome: String(top.app || top.nome || '').replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '\uFFFD'), bytes: top.bytes } : null,
          });
          out.sel += sel;
          out.bytes += c.bytes;
          if (c.incompleto) out.incompleto = true;
        } catch (e) {
          out.errs.push({ id, nome: NAMES[id], msg: e && e.message ? String(e.message) : '' });
        }
      }
      out.at = Date.now();
      if (!out.cats.length) {
        const e = out.errs.find((x) => x.msg);
        throw new Error(e ? e.msg : 'o Mac não respondeu');
      }
      if (my === gen) last = out;
      return out;
    }

    return {
      NAMES,
      get gen() { return gen; },
      get last() { return last; },
      check(o) {
        o = o || {};
        if (!o.fresh) {
          if (o.maxAgeMs && last && Date.now() - last.at < o.maxAgeMs) return Promise.resolve(last);
          if (running) return running;
        }
        const p = run(o.onCat);
        running = p;
        const done = () => { if (running === p) running = null; };
        p.then(done, done);
        return p;
      },
      forget() { gen++; last = null; running = null; },
    };
  })();
  /* passou pela Faxina (entrando ou saindo): o número de sujeira guardado ficou velho */
  window.addEventListener('hashchange', (e) => {
    if (/^#\/faxina\b/.test(location.hash) || /#\/faxina\b/.test((e && e.oldURL) || '')) K.dirt.forget();
  });

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
    ctx.disk = anDisk(s && s.disk);
    return ctx.disk;
  }
  async function stepDirt(ctx) {
    const d = await K.dirt.check({ fresh: true, onCat: (id, nome) => ctx.progress && ctx.progress(`Olhando ${nome}…`) });
    ctx.dirtGen = K.dirt.gen;
    return anDirt(d, ctx.disk);
  }
  async function stepSpeed() {
    return anSpeed(await K.api('speed.diagnose'));
  }

  /* ---------- itens de início (Otimizar): leitura à parte, nunca segura a varredura ---------- */
  /** Começa a ler optimize.startup (só leitura) e devolve {done, value, p}. Falhou ou demorou: value null. */
  function startupPeek() {
    const box = { done: false, value: null, p: null };
    box.p = withTimeout(K.api('optimize.startup'), STARTUP_MS)
      .then(anStartup)
      .catch((e) => { console.warn('varredura/itens de início: ' + (e && e.message)); return null; })
      .then((v) => { box.done = true; box.value = v; return v; });
    return box;
  }

  /** Conta o que abre sozinho com o Mac e que dá pra desligar pelo Otimizar (sem senha).
      Ajudantes do mesmo app contam uma vez só. Nome vem de fora: quem mostrar usa textContent. */
  function anStartup(list) {
    if (!Array.isArray(list)) return null;
    const groups = new Map();
    for (const it of list) {
      if (!it || !it.ligado || !it.editavel) continue;
      const raw = String(it.app || it.nome || it.label || '').trim();
      if (!raw) continue;
      const name = raw.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '\uFFFD');
      const key = name.toLowerCase();
      if (!groups.has(key)) groups.set(key, { name, named: !!it.app });
    }
    const all = Array.from(groups.values());
    return { n: all.length, names: all.filter((g) => g.named).map((g) => g.name) };
  }

  function chargeText(b) {
    const p = num(b.percent) != null ? K.fmt.pct(b.percent, 0) : 'carga sem leitura';
    if (b.isCharging == null && b.pluggedIn == null) return `${p}, sem leitura da tomada`;
    if (b.isCharging) return `${p}, carregando` + (num(b.minutesToFull) ? ` (cheia em ${K.fmt.mins(b.minutesToFull)})` : '');
    if (K.batTopping(b)) return `${p}, terminando de encher`;
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
          say: 'Não consegui ler a bateria deste MacBook. Se continuar assim, vale uma assistência autorizada.',
        });
      }
      return Object.assign(r, {
        none: true, tone: null, pill: { label: 'Mac de mesa', icon: 'desktop' }, snippet: 'sem bateria',
        say: 'Este Mac vive na tomada: não tem bateria pra medir.',
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
    if (key === 'trocar') say = 'O macOS pede revisão. Vale levar numa assistência autorizada.';
    else if (key === 'gasta') say = 'Abaixo dos 80% que a Apple usa como limite: a carga dura menos.';
    else if (key === 'de-olho' && dc && cyc != null && cyc >= dc * 0.8) say = `Já são ${K.fmt.num(cyc)} de ${K.fmt.num(dc)} ciclos previstos. Vale acompanhar.`;
    else if (key === 'de-olho') say = 'Funciona bem, mas vale acompanhar: abaixo de 80% a Apple considera gasta.';
    else if (key === 'desconhecida') say = 'O Mac não informou a saúde agora. Tente de novo daqui a pouco.';
    else say = 'A Apple só considera gasta abaixo de 80%. Está tranquilo.';

    let tip = null;
    if (hot) tip = { icon: 'thermo', text: `Está quente (${K.fmt.temp(b.temperatureC)}). Deixe as saídas de ar livres: calor é o que mais gasta bateria.` };
    else if (b.pluggedIn && b.percent >= 99 && !b.optimizedChargingEngaged) tip = { id: 'otimizado', icon: 'leaf', text: 'Ficar sempre em 100% desgasta mais. Ligue o Carregamento otimizado (Ajustes do Sistema › Bateria).' };

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
        say: 'Nenhum app gastando de verdade agora.' });
    }
    const name = top.label;
    const sys = top.note === 'do sistema';
    const desk = !b || b.present === false;
    const onBattery = !desk && !b.pluggedIn;
    const heavy = top.value >= 60;
    const tone = heavy && onBattery ? 'warn' : 'good';
    let say;
    if (heavy && onBattery && sys) say = `${name}, do sistema, está puxando bastante. Costuma passar sozinho.`;
    else if (heavy && onBattery) say = `${name} está puxando bastante. Fechar ajuda a bateria durar mais.`;
    else if (heavy && desk) say = sys ? `${name}, do sistema, é quem mais gasta. Num Mac de mesa, só esquenta um pouco.` : `${name} é quem mais gasta. Num Mac de mesa, só esquenta um pouco.`;
    else if (heavy) say = sys ? `${name}, do sistema, é quem mais gasta. Na tomada, não pesa na bateria.` : `${name} é quem mais gasta. Na tomada, não pesa na bateria.`;
    else say = sys ? `${name}, do sistema, é quem mais gasta. Nada fora do normal.` : `${name} é quem mais gasta. Nada fora do normal.`;
    return Object.assign(r, {
      tone, say, top: name, heavy,
      pill: tone === 'warn' ? { label: 'Tem app puxando', icon: 'flame' } : { label: 'Tranquilo', icon: 'check' },
      snippet: `${name} na frente`,
      note: 'Impacto energético do macOS: serve pra comparar, não é watt.',
    });
  }

  const PRESSURE = {
    normal: { tone: 'good', label: 'Folgada', icon: 'check',
      say: 'Usar bastante memória é normal. O que conta é a pressão, e ela está baixa.' },
    atencao: { tone: 'warn', label: 'Apertada', icon: 'eye',
      say: 'O Mac já usa o disco pra dar conta. Fechar abas e apps parados alivia.' },
    critica: { tone: 'serious', label: 'No limite', icon: 'alert',
      say: 'Sem folga: o Mac usa o disco no lugar dela. Feche o que não estiver usando.' },
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
    normal: { txt: 'fresco', tone: 'good' },   // a mesma régua do Painel: Fresco · Morno · Quente · Crítico
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
      say = 'Muito quente: o Mac já segura a velocidade. Dê uma pausa no que é pesado.';
    } else if (th && th.tone === 'warn') {
      pill = { label: 'Esquentando', icon: 'thermo' };
      say = 'O macOS pode diminuir a velocidade pra esfriar. Deixe as saídas de ar livres.';
    } else if (busy) {
      pill = { label: 'A todo vapor', icon: 'eye' };
      say = 'Normal enquanto algo pesado roda. Se seguir assim parado, veja quem está puxando.';
    } else if (working) {
      pill = { label: 'Trabalhando', icon: 'check' };
      say = 'Trabalhando, mas com folga.';
    } else {
      pill = { label: 'Tranquilo', icon: 'check' };
      say = 'O processador está folgado.';
    }
    const cores = cpu ? K.fmt.cores(cpu, true) : '';
    return {
      id: 'cpu', tone, pill, say, busy,
      value: usage, valueFmt: (v) => K.fmt.pct(v, 0), sub: 'em uso agora' + (cores ? ` · ${cores}` : ''),
      meter: usage, meterTone: busy ? 'warn' : null,
      facts: th ? [{ icon: 'thermo', text: `Calor do Mac: ${th.txt}` }] : [],
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
      say = 'Quase sem espaço. Vale tirar arquivos grandes que você não usa.';
    } else if (tone === 'warn') {
      pill = { label: 'Ficando cheio', icon: 'eye' };
      say = 'Abaixo de 10% livre, o Mac pode ficar lento.';
    } else if (free >= 40) {
      pill = { label: 'Espaço de sobra', icon: 'check' };
      say = 'Bem acima dos 10 a 20% que o macOS gosta de ter livres.';
    } else {
      pill = { label: 'Espaço ok', icon: 'check' };
      say = 'O macOS gosta de ter de 10 a 20% livres. Por enquanto, ok.';
    }
    return {
      id: 'disco', tone, pill, say,
      value: avail, valueFmt: (v) => K.fmt.bytes(v), sub: `livres de ${K.fmt.bytes(total)} (${K.fmt.num(free, 0)}%)`,
      meter: 100 - free, meterLabel: 'ocupado',
      snippet: `${K.fmt.bytes(avail)} livres`,
    };
  }

  /* ---------- velocidade (speed.diagnose): o veredito manda no tom ---------- */
  const SPEED = {
    voando: { tone: 'good', label: 'Voando!', icon: 'rocket', say: 'Só coisa leve rodando agora.' },
    deboa: { tone: 'good', label: 'De boa', icon: 'check', say: 'Uma coisinha ou outra pesando, nada que trave.' },
    pesado: { tone: 'warn', label: 'Tá pesado', icon: 'eye', say: 'Dá pra aliviar sem reiniciar o Mac.' },
    travando: { tone: 'serious', label: 'Tá travando', icon: 'alert', say: 'Comece pelo primeiro da lista: é o que mais ajuda.' },
  };
  const FUNDO = {
    spotlight: { icon: 'scan', text: 'Spotlight indexando' },
    timemachine: { icon: 'clock', text: 'Time Machine copiando' },
    fotos: { icon: 'screen', text: 'Fotos analisando' },
    icloud: { icon: 'cloud', text: 'iCloud sincronizando' },
    atualizacao: { icon: 'cycle', text: 'macOS atualizando' },
  };
  /** ícone de app que veio do Swift: só data:image (nada de endereço de fora) */
  const appIcon = (s) => (typeof s === 'string' && /^data:image\/(png|jpeg|gif|tiff|webp|svg\+xml);base64,/i.test(s) ? s : null);

  /** um achado em poucas palavras: {icon, img?, text, sub, tone}. Nome vem de fora: textContent. */
  function speedLine(f, rep) {
    const tone = ['warn', 'serious', 'crit'].includes(f.tom) ? f.tom : 'warn';
    const nm = safeName(f.nome) || 'Um app';
    const out = (o) => Object.assign({ tone, sub: '' }, o);
    switch (f.tipo) {
      case 'processo':
      case 'navegador':
        if (f.detalhe === 'memoria') {
          return out({ icon: 'memory', img: appIcon(f.icon), text: `${nm} enchendo a memória`, sub: num(f.memBytes) ? `${gib(f.memBytes)} de memória` : 'ocupando bastante memória' });
        }
        return out({ icon: 'cpu', img: appIcon(f.icon), text: `${nm} no talo`, sub: num(f.cpu) != null ? `${K.fmt.pct(f.cpu, 0)} de CPU no último minuto` : 'puxando o processador' });
      case 'memoria':
        if (f.detalhe === 'critica') return out({ icon: 'memory', text: 'Memória no limite', sub: 'o Mac usa o disco no lugar dela' });
        if (f.detalhe === 'swap') return out({ icon: 'memory', text: 'Memória usando o disco', sub: num(f.valor) ? `${gib(f.valor)} guardados no disco` : 'o Mac guarda parte no disco' });
        return out({ icon: 'memory', text: 'Memória apertada', sub: 'o Mac já começou a comprimir' });
      case 'fundo': {
        const x = FUNDO[f.detalhe] || { icon: 'cycle', text: 'macOS trabalhando' };
        return out({ icon: x.icon, text: x.text, sub: 'passa sozinho' });
      }
      case 'calor': {
        const lim = num(rep && rep.limiteCPU);
        const sub = lim != null && lim < 100 ? `processador segurado em ${K.fmt.pct(lim, 0)}`
          : f.detalhe === 'critico' ? 'o Mac está muito quente' : f.detalhe === 'quente' ? 'o Mac está quente' : 'o macOS segura pra esfriar';
        return out({ icon: 'thermo', text: 'Calor freando', sub });
      }
      case 'economia': return out({ icon: 'leaf', text: 'Pouca Energia ligado', sub: 'deixa o Mac mais lento de propósito' });
      case 'disco': return out({ icon: 'disk', text: 'Disco quase cheio', sub: num(f.valor) ? `${K.fmt.bytes(f.valor)} livres` : 'pouco espaço sobrando' });
      case 'reiniciar': return out({ icon: 'cycle', text: num(f.valor) ? `Ligado há ${K.fmt.num(f.valor, 0)} dias` : 'Muito tempo sem reiniciar', sub: 'reiniciar alivia' });
      case 'inicio': return out({ icon: 'rocket', text: `${num(f.processos) || 'Vários'} itens abrem com o Mac`, sub: 'dá pra desligar em Velocidade' });
      default: return out({ icon: 'gauge', text: 'Algo pesando', sub: '' });
    }
  }

  function anSpeed(rep) {
    const v = rep && SPEED[rep.veredito];
    if (!v) throw new Error('o Mac não disse o que pesa');
    const finds = (Array.isArray(rep.achados) ? rep.achados : []).filter((f) => f && typeof f === 'object');
    const lines = finds.slice(0, 2).map((f) => speedLine(f, rep));
    return {
      id: 'velocidade', rep, tone: v.tone, pill: { label: v.label, icon: v.icon }, lines,
      say: finds.length ? v.say : 'Nada pesando agora.',
      snippet: v.label + (lines.length ? ' · ' + lines[0].text : ''),
      note: 'Média do último minuto.',
    };
  }

  const DIRT_COLOR = { caches: K.charts.palette[0], dev: K.charts.palette[1], logs: K.charts.palette[2] };
  const DIRT_SHORT = { caches: 'Caches de apps', dev: 'Caches de programação', logs: 'Registros' };
  /** "3,2 GB" com espaço que não quebra (a unidade nunca fica sozinha na linha) */
  const gbNb = (v) => K.fmt.bytes(v).replace(' ', '\u00a0');

  /** Sujeira nunca vira "atenção": até 1 GB é tranquilo; acima é sugestão (tom "tip", dourado).
      Cache volta com o tempo e não é o que deixa o Mac lento, então o texto não promete milagre. */
  function anDirt(d, disk) {
    const r = { id: 'sujeira', sel: d.sel, found: d.bytes, cats: d.cats, errs: d.errs, partial: d.errs.length > 0 || d.incompleto,
      ids: (d.ids || []).slice(), idsBytes: num(d.idsBytes) || 0, paths: d.paths || {} };
    const big = d.cats.slice().sort((a, b) => b.sel - a.sel)[0];
    let top = null;
    for (const c of d.cats) if (c.top && c.top.nome && (!top || c.top.bytes > top.bytes)) top = c.top;
    const tight = !!(disk && !disk.error && RANK[disk.tone] > 0);
    const selTxt = gbNb(d.sel);
    r.tight = tight;
    r.facts = [];
    if (top && d.sel > 0 && top.bytes >= 1e7) r.facts.push({ icon: 'box', text: `O maior: ${top.nome}, ${gbNb(top.bytes)}` });
    if (d.errs.length) r.facts.push({ icon: 'info', text: `Não deu pra ver: ${listPt(d.errs.map((e) => e.nome))}` });
    else if (d.incompleto) r.facts.push({ icon: 'info', text: 'Parei de contar no meio: o número é o mínimo' });
    r.note = 'Em Espaço você revisa item por item, e tudo vai pra Lixeira.';

    if (d.bytes <= 0) {
      return Object.assign(r, { tone: 'good', pill: { label: 'Limpinho', icon: 'check' }, snippet: 'nada sobrando', value: null, note: null,
        say: 'Não achei cache nem registro sobrando.' });
    }
    if (d.sel <= 0) {
      /* sem nada marcado, a barra seria 100% "pra você decidir": não diz nada, fica de fora */
      return Object.assign(r, { tone: 'good', pill: { label: 'Nada marcado', icon: 'check' }, snippet: 'nada pra tirar sozinho', value: null, noStack: true,
        say: r.partial ? `Achei pelo menos ${gbNb(d.bytes)}, mas nada que eu tiraria sozinho.` : `Achei ${gbNb(d.bytes)}, mas nada que eu tiraria sozinho.` });
    }
    const out = { value: d.sel, snippet: `${selTxt} pra liberar`, sub: r.partial ? 'pra liberar, pelo menos' : 'pra liberar com segurança' };
    if (d.sel < DIRT_TIP) {
      return Object.assign(r, out, { tone: 'good', pill: { label: 'Tranquilo', icon: 'check' },
        say: 'Pouca coisa: dá pra deixar pra outro dia.' });
    }
    const bigName = K.dirt.NAMES[big.id], bigGb = gbNb(big.sel);
    const say = tight
      ? `Quem mais pesa: ${bigName}, ${bigGb}. Com o disco apertado, é um bom começo.`
      : `Quem mais pesa: ${bigName}, ${bigGb}. Não é urgente: é só espaço de volta.`;
    return Object.assign(r, out, { tone: 'tip', pill: { label: 'Dá pra liberar', icon: 'sparkle' }, say });
  }

  function errResult(step, e) {
    const msg = e && e.message ? String(e.message) : '';
    if (step.id === 'sujeira') {
      return {
        id: step.id, error: true, tone: null, pill: { label: 'Não consegui ver', icon: 'info' }, snippet: 'não consegui ver',
        say: `Não consegui ver a sujeira agora${msg ? ` (${msg})` : ''}. Não mexi em nada.`,
      };
    }
    return {
      id: step.id, error: true, tone: null, pill: { label: 'Sem leitura', icon: 'info' }, snippet: 'não deu pra ler',
      say: `Não consegui ler agora${msg ? ` (${msg})` : ''}. Tente de novo daqui a pouco.`,
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
      full: !!b.pluggedIn && !b.isCharging && b.percent >= 99 && !K.batTopping(b), hot: num(b.temperatureC) != null && b.temperatureC >= 40,
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
    ui.p = K.el('p', null, `Confiro ${COUNT_PT[STEPS.length] || STEPS.length} coisas em uns segundos. Só olho, não apago nada.`);
    host.appendChild(K.el('header', { class: 'page-head kz-head', 'data-drag': true },
      K.el('div', { class: 'kz-head-text' }, ui.hello, ui.h1, ui.p)));

    /* botão enorme + anel (escondido até começar) */
    ui.go = K.el('button', { class: 'kz-go', type: 'button', 'aria-label': 'Escanear o Mac', onclick: () => runScan() },
      /* reflexo só no alto do botão: o texto ocupa de 50% a 63% da altura */
      K.el('span', { class: 'kz-go-shine', 'aria-hidden': 'true', html: '<svg viewBox="0 0 100 100"><path d="M18 35 Q22 21 36 14"/><circle cx="14.5" cy="43" r="2.3"/></svg>' }),
      K.el('span', { class: 'kz-go-ic', html: K.icon('scan') }),
      K.el('span', { class: 'kz-go-label' }, 'Escanear'),
      K.el('span', { class: 'kz-go-sub' }, 'leva uns 10 segundos'));
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
      /* Mac de mesa e sugestão (sujeira) usam o ícone da etiqueta; o resto, o do tom */
      const own = res && (res.none || tone === 'tip');
      const icon = state === 'err' ? 'info' : own ? (res.pill && res.pill.icon) || 'info' : K.toneIcon(tone);
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
    ui.p.textContent = 'Só olhando, sem mexer em nada.';
    if (ui.bubble) ui.bubble.hidden = true;
    ui.listHead.textContent = 'Conferindo';
    ui.mascot.set({ face: 'happy' });
    ui.steps.forEach((s, i) => setStep(i, 'wait'));
    const ring = K.charts.ring(ui.ringBox, { value: 0, tone: 'gold', text: '', label: 'Escaneando o Mac', busy: true, size, thickness: 13 });
    charts.push(ring);

    const ctx = {};
    const results = [];
    const startup = startupPeek();
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
      /* passo comprido (a sujeira lê três categorias) conta o que está olhando no lugar da descrição */
      ctx.progress = (t) => { if (my === token && ui.steps && ui.steps[i]) ui.steps[i].desc.textContent = t; };
      const [out] = await Promise.allSettled([withTimeout(Promise.resolve().then(() => s.run(ctx)), s.max || STEP_MAX), K.sleep(STEP_MIN)]);
      ctx.progress = null;
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
    last = { results, at: nowS(), took: (performance.now() - t0) / 1000, dirtGen: ctx.dirtGen != null ? ctx.dirtGen : K.dirt.gen,
      startup: startup.done ? startup.value : null };
    if (ctx.b) machine = Object.assign({}, machine, { b: ctx.b });
    K.sound.tada();
    paintResult(true);
    /* os itens de início ainda não responderam: o atalho entra depois, se vier */
    if (!startup.done) {
      const mine = last;
      startup.p.then((v) => {
        if (!v || my !== token || last !== mine) return;
        mine.startup = v;
        if (mode === 'result' && ui.actsSlot && summaryOf(mine.results).kind !== 'fail') {
          const byId = {};
          for (const r of mine.results) byId[r.id] = r;
          fillActs(byId);
        }
      });
    }
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
    const w = worst(...att.map((r) => r.tone));
    const total = results.length - skipped.length;
    const out = { att, errs, w };
    if (!read.length) {
      out.kind = 'fail';
      out.title = 'Não consegui ler o Mac agora';
      out.sub = 'Nenhuma leitura respondeu. Às vezes o macOS demora logo depois de acordar.';
      out.face = 'worried';
      return out;
    }
    if (att.length) {
      out.kind = 'att';
      out.title = att.length === 1 ? 'Achei 1 ponto de atenção' : `Achei ${att.length} pontos de atenção`;
      out.sub = 'Nada de pânico: cada cartão diz o que fazer.';
      out.face = RANK[w] >= RANK.serious ? 'worried' : 'happy';
    } else if (missing.length) {
      out.kind = 'partial';
      const n = total - missing.length;
      out.title = `Li ${n} de ${total} coisas`;
      out.sub = 'O que deu pra ler está em ordem.';
      out.face = 'happy';
    } else {
      out.kind = 'ok';
      out.title = 'Tudo certo por aqui!';
      out.sub = 'Nada pede sua atenção agora.';
      /* sujeira não é problema: vira só um "se quiser" no fim */
      const dirt = results.find((r) => r.id === 'sujeira' && r.tone === 'tip');
      if (dirt) out.sub = `Nada pede sua atenção. Se quiser, dá pra liberar ${gbNb(dirt.sel)} em Espaço.`;
      out.face = 'joy';
    }
    if (missing.length) out.sub += ` Sem leitura: ${listPt(missing.map((r) => lower(r.id)))}.`;
    return out;
  }

  function paintResult(fresh) {
    clearCharts();
    mode = 'result';
    host.innerHTML = '';
    host.dataset.mode = 'result';
    ui = {};
    const results = last.results;
    const byId = byIdOf(results);
    const sm = summaryOf(results);

    /* o resumo é pintado por paintSum (resultado normal, "deixando voando…" ou a comemoração) */
    ui.sumWhenTxt = fresh ? `Feita agora, em ${K.fmt.num(last.took, 0)} s` : `Feita às ${K.fmt.time(last.at)}`;
    const art = K.el('div', { class: 'kz-sum-art' });
    ui.sumWhen = K.el('span', { class: 'sticker kz-when' }, ui.sumWhenTxt);
    ui.sumTitle = K.el('h1', { tabindex: '-1' }, sm.title);
    ui.sumSub = K.el('p', { 'aria-live': 'polite' }, sm.sub);
    ui.sumAct = K.el('div', { class: 'kz-sum-act' });
    ui.sum = K.el('section', { class: 'card gold kz-sum pop-in', 'data-drag': true },
      ...sparkles(4),
      art,
      K.el('div', { class: 'kz-sum-text' }, ui.sumWhen, ui.sumTitle, ui.sumSub, ui.sumAct));
    host.appendChild(ui.sum);
    const bat = byId.bateria;
    const mState = batteryState(bat && bat.b, { face: sm.face, full: false });
    ui.sumCharging = !!mState.charging;
    ui.sumMascot = K.mascot(art, { size: 132, state: mState });
    mascots.push(ui.sumMascot);
    paintSum();

    /* "o que dá pra fazer" fica num lugar fixo (a sujeira pode ser relida depois da Faxina) */
    ui.actsSlot = K.el('div', { class: 'kz-acts-slot' });
    host.appendChild(ui.actsSlot);
    if (sm.kind !== 'fail') fillActs(byId);

    /* cartões: o que pede atenção vem primeiro, com uma figurinha "olhe aqui" */
    const desk = !!(bat && bat.none);
    const cards = [];
    cards.push({ r: bat || errResult(STEPS[0]), make: (r, st) => batteryCard(r, st) });
    cards.push({ r: byId.energia || errResult(STEPS[1]), make: (r, st) => energyCard(r, st, desk) });
    for (const id of ['memoria', 'cpu', 'disco']) {
      const step = STEPS.find((x) => x.id === id);
      cards.push({ r: byId[id] || errResult(step), make: (r, st) => plainCard(step, r, st) });
    }
    /* velocidade e sujeira ocupam a largura toda (a grade de 3 não fica com buraco) */
    cards.push({ r: byId.velocidade || errResult(SPEED_STEP), make: (r, st) => (ui.speedCard = speedCard(r, st)) });
    cards.push({ r: byId.sujeira || errResult(DIRT_STEP), make: (r, st) => (ui.dirtCard = dirtCard(r, st)) });
    const order = cards.map((c, i) => ({ c, i, a: isAttention(c.r) ? RANK[c.r.tone] : 0 }))
      .sort((x, y) => y.a - x.a || x.i - y.i);
    const grid = K.el('div', { class: 'kz-grid' });
    let n = 0;
    const delay = () => ({ animationDelay: 140 + n++ * 90 + 'ms' });
    for (const o of order) {
      const node = o.c.make(o.c.r, delay());
      if (o.a > 0) markAtt(node);
      grid.appendChild(node);
    }
    host.appendChild(grid);
    runAfterMount();
    const strip = macStrip();
    if (strip) host.appendChild(strip);
    if (fresh) setTimeout(() => { if (host && mode === 'result') host.closest('.view').scrollTop = 0; }, 0);
  }

  function markAtt(node) {
    node.classList.add('is-att');
    node.appendChild(K.el('span', { class: 'sticker kz-look', 'aria-hidden': 'true' }, 'olhe aqui'));
  }

  /* ---------- o resumo: resultado · "deixando voando…" · comemoração ---------- */
  function paintSum() {
    if (!ui.sum || !last) return;
    const F = last.fly;
    const working = !!F && F.phase === 'working';
    const flew = !!F && F.phase === 'done';
    const sm = summaryOf(last.results);
    const hadFocus = ui.sum.contains(document.activeElement);
    ui.sum.classList.toggle('is-working', working);
    ui.sum.classList.toggle('is-flew', flew);
    ui.sum.classList.toggle('is-fail', !F && sm.kind === 'fail');
    ui.sum.classList.toggle('no-sparks', working || (flew ? !F.ok : !(sm.kind === 'ok' || sm.kind === 'att')));
    ui.sumAct.textContent = '';
    const again = K.el('button', { class: 'btn ink kz-again', type: 'button', html: K.icon('cycle'), onclick: () => runScan() },
      !F && (sm.kind === 'fail' || sm.kind === 'partial') ? 'Tentar de novo' : 'Escanear de novo');
    let face;
    if (working) {
      ui.sumWhen.textContent = 'Fazendo agora';
      ui.sumTitle.textContent = 'Deixando o Mac voando…';
      /* a lista já mostra o passo da vez: o subtítulo não repete (o leitor de tela ouve pelo status) */
      ui.sumSub.textContent = F.checking ? 'Conferindo como ficou…' : 'Um de cada vez. Já já termino.';
      ui.sumAct.appendChild(flyList(F));
      ui.sumAct.appendChild(K.el('span', { class: 'kz-sr', role: 'status' }, F.now || ''));
      face = 'happy';
    } else if (flew) {
      ui.sumWhen.textContent = `Feito às ${K.fmt.time(F.at)}`;
      ui.sumTitle.textContent = F.title;
      ui.sumSub.textContent = F.text;
      ui.sumAct.appendChild(again);
      if (F.moved) {
        ui.sumAct.appendChild(K.el('button', { class: 'kz-link', type: 'button', html: K.icon('kzUndo'), onclick: () => go('faxina?aba=lixeira') },
          'Desfazer no Espaço'));
      }
      face = F.ok ? 'joy' : 'worried';
    } else {
      ui.sumWhen.textContent = ui.sumWhenTxt;
      ui.sumTitle.textContent = sm.title;
      ui.sumSub.textContent = sm.sub;
      const plan = sm.kind !== 'fail' ? flyPlan(byIdOf(last.results)) : null;
      if (plan && plan.any) {
        /* o principal é o "Deixar voando"; o escanear de novo vira secundário (branco) */
        again.className = 'btn kz-again';
        ui.sumAct.appendChild(K.el('button', { class: 'btn gold kz-fly', type: 'button', html: K.icon('rocket'), onclick: () => askFly() }, 'Deixar voando'));
      }
      ui.sumAct.appendChild(again);
      face = sm.face;
    }
    if (ui.sumMascot) ui.sumMascot.set({ face, charging: working || ui.sumCharging });
    /* o botão clicado sumiu: o foco vai pro título, sem pular a tela */
    if (hadFocus && !ui.sum.contains(document.activeElement)) ui.sumTitle.focus({ preventScroll: true });
  }

  /* ================= "Deixar voando" ================= */

  /** O que dá pra fazer agora com um clique. Só com o que a varredura leu:
        caches  = os itens que a Faxina já traria marcados (K.cleanSuggested: nada de app aberto,
                  Downloads, grandes ou duplicados), se somarem FLY_MIN ou mais;
        apps    = achados do speed.diagnose com acao 'encerrar' por CPU (no talo);
        aviso   = aviso dos 80% desligado, só em Mac com bateria. */
  function flyPlan(byId) {
    const plan = { caches: null, apps: [], aviso: null, any: false };
    const dirt = byId.sujeira;
    if (dirt && !dirt.error && dirt.ids && dirt.ids.length && dirt.idsBytes >= FLY_MIN) {
      plan.caches = { ids: dirt.ids.slice(), bytes: dirt.idsBytes, paths: dirt.paths || {} };
    }
    const sp = byId.velocidade;
    if (sp && !sp.error && sp.rep && Array.isArray(sp.rep.achados)) {
      const seen = new Set();
      for (const f of sp.rep.achados) {
        if (!f || f.acao !== 'encerrar' || f.detalhe !== 'cpu' || typeof f.alvo !== 'string' || !f.alvo || seen.has(f.alvo)) continue;
        seen.add(f.alvo);
        plan.apps.push({ alvo: f.alvo, nome: safeName(f.nome) || 'app sem nome', cpu: num(f.cpu), icon: appIcon(f.icon) });
      }
    }
    const bat = byId.bateria;
    const b = bat && !bat.error && !bat.none && !bat.missing ? bat.b : null;
    const s = K.settings.value;
    if (b && b.present !== false && s && s.aviso80 === false) plan.aviso = { limite: num(s.limiteAviso) || 80 };
    plan.any = !!(plan.caches || plan.apps.length || plan.aviso);
    return plan;
  }

  /** Mostra antes (caixinhas) e só faz o que ficou marcado. Apps vêm desmarcados: fechar pode
      perder coisa sem salvar. */
  async function askFly() {
    if (!last || mode !== 'result' || (last.fly && last.fly.phase === 'working')) return;
    const L = last;
    const plan = flyPlan(byIdOf(L.results));
    if (!plan.any) return;
    K.sound.plop();
    const rows = [];
    let okBtn = null;
    const sync = () => { if (okBtn) okBtn.disabled = !rows.some((r) => r.on); };
    function row(o) {
      const r = { key: o.key, app: o.app || null, on: !!o.on };
      const chk = K.checkbox({ state: r.on, label: o.label, onchange: () => { r.on = !r.on; chk.set(r.on); K.sound.tick(); sync(); } });
      const ic = K.el('span', { class: 'kz-fly-ic' + (o.img ? ' has-img' : ''), 'aria-hidden': 'true' });
      if (o.img) ic.appendChild(K.el('img', { src: o.img, alt: '' })); else ic.innerHTML = K.icon(o.icon);
      const li = K.el('li', { class: 'kz-fly-row' }, chk, ic,
        K.el('span', { class: 'kz-fly-text' }, K.el('b', null, o.title), K.el('span', null, o.sub)),
        o.value ? K.el('b', { class: 'kz-fly-val num' }, o.value) : null);
      li.addEventListener('click', (e) => { if (!e.target.closest('.kcheck')) chk.click(); });
      rows.push(r);
      return li;
    }
    const list = K.el('ul', { class: 'kz-fly-list' });
    if (plan.caches) {
      const n = plan.caches.ids.length;
      list.appendChild(row({ key: 'caches', on: true, icon: 'broom', label: 'Mandar os caches pra Lixeira',
        title: 'Caches pra Lixeira', sub: `${K.fmt.num(n)} ${n === 1 ? 'item' : 'itens'} que os apps recriam sozinhos`, value: gbNb(plan.caches.bytes) }));
    }
    for (const a of plan.apps) {
      list.appendChild(row({ key: 'app', app: a, on: false, icon: 'cpu', img: a.icon, label: `Fechar ${a.nome}`,
        title: `Fechar ${a.nome}`, sub: `No talo${a.cpu != null ? `: ${K.fmt.pct(a.cpu, 0)} de CPU` : ' agora'} · pode pedir pra salvar` }));
    }
    if (plan.aviso) {
      list.appendChild(row({ key: 'aviso', on: true, icon: 'bell', label: `Ligar o aviso dos ${plan.aviso.limite}%`,
        title: `Ligar o aviso dos ${plan.aviso.limite}%`, sub: 'Te chamo quando a carga chegar lá' }));
    }
    const asking = K.confirm({
      title: 'Deixar o Mac voando?',
      text: 'Marque o que eu faço agora.',
      body: list,
      note: plan.caches ? { icon: 'kzUndo', tone: 'good', text: 'Os caches vão pra Lixeira: dá pra desfazer no Espaço.' } : null,
      ok: 'Fazer agora', cancel: 'Agora não', icon: 'rocket', mascot: 'happy',
    });
    /* o modal já está na tela (monta na hora): o botão só libera com algo marcado */
    const dlg = list.closest('.kmodal');
    okBtn = dlg ? dlg.querySelector('.kmodal-ok') : null;
    sync();
    const ok = await asking;
    if (!ok || last !== L || (L.fly && L.fly.phase === 'working')) return;
    const pick = {
      caches: plan.caches && rows.some((r) => r.key === 'caches' && r.on) ? plan.caches : null,
      apps: rows.filter((r) => r.key === 'app' && r.on).map((r) => r.app),
      aviso: plan.aviso && rows.some((r) => r.key === 'aviso' && r.on) ? plan.aviso : null,
    };
    if (!pick.caches && !pick.apps.length && !pick.aviso) return;
    runFly(L, pick);
  }

  /** Faz um passo de cada vez; falha em um não para os outros. O resumo mostra o andamento. */
  async function runFly(L, pick) {
    const F = { phase: 'working', tasks: [], now: '', at: 0 };
    if (pick.caches) {
      const g = gbNb(pick.caches.bytes);
      F.tasks.push({ key: 'caches', icon: 'broom', text: `Mandar ${g} de caches pra Lixeira`, doing: `Mandando ${g} de caches pra Lixeira…`, state: 'wait' });
    }
    for (const a of pick.apps) {
      F.tasks.push({ key: 'app', app: a, icon: 'cpu', img: a.icon, text: `Fechar ${a.nome}`, doing: `Pedindo pra ${inl(a.nome)} fechar…`, state: 'wait' });
    }
    if (pick.aviso) {
      F.tasks.push({ key: 'aviso', icon: 'bell', text: `Ligar o aviso dos ${pick.aviso.limite}%`, doing: `Ligando o aviso dos ${pick.aviso.limite}%…`, state: 'wait' });
    }
    L.fly = F;
    const here = () => last === L && L.fly === F && mode === 'result' && !!host && !!ui.sum;
    const paint = () => { if (here()) paintSum(); };
    paint();

    const out = { moved: 0, movedN: 0, cacheFails: [], cacheErr: null, cleaned: false, closed: [], asked: [], appFails: [], aviso: false, avisoErr: null };
    for (const t of F.tasks) {
      t.state = 'on';
      F.now = t.doing;
      paint();
      const t0 = performance.now();
      try {
        if (t.key === 'caches') {
          /* só IDs que o Swift devolveu na varredura; ele confere tudo de novo e manda pra Lixeira */
          const res = await K.api('cleanup.clean', { ids: pick.caches.ids });
          out.cleaned = true;
          const moved = (res && Array.isArray(res.movidos)) ? res.movidos : [];
          out.movedN = moved.length;
          out.moved = num(res && res.bytes) != null ? res.bytes : moved.reduce((a, m) => a + (num(m && m.bytes) || 0), 0);
          out.cacheFails = (res && Array.isArray(res.falhas)) ? res.falhas : [];
          t.state = moved.length ? 'done' : 'err';
          try { window.dispatchEvent(new CustomEvent('kamurafy:limpou', { detail: { origem: 'varredura', ids: moved.map((m) => m && m.id).filter(Boolean), caminhos: moved.map((m) => m && pick.caches.paths && pick.caches.paths[m.id]).filter(Boolean) } })); } catch (e) { /* ninguém ouvindo */ }
        } else if (t.key === 'app') {
          const res = await K.api('optimize.quit', { id: t.app.alvo });
          if (res && res.ok) {
            (/já tinha fechado/i.test(res.mensagem || '') ? out.closed : out.asked).push(t.app);
            t.state = 'done';
          } else {
            out.appFails.push({ app: t.app, why: whyTxt(res && res.mensagem) || 'o app não quis fechar' });
            t.state = 'err';
          }
        } else if (t.key === 'aviso') {
          await K.settings.set({ aviso80: true });
          out.aviso = true;
          t.state = 'done';
        }
      } catch (e) {
        const why = whyTxt(e && e.message);
        t.state = 'err';
        if (t.key === 'caches') out.cacheErr = why;
        else if (t.key === 'app') out.appFails.push({ app: t.app, why });
        else out.avisoErr = why;
      }
      const rest = FLY_STEP_MIN - (performance.now() - t0);
      if (rest > 0) await K.sleep(rest);
      if (here()) { if (t.state === 'err') K.sound.oops(); else K.sound.tick(); }
      paint();
    }

    /* pedir pra fechar não é fechar: confere se saíram mesmo (e relê a velocidade) */
    let rep2 = null;
    if (out.asked.length || out.closed.length) {
      F.now = 'Conferindo como ficou…';
      F.checking = true;
      paint();
      await K.sleep(FLY_CHECK_MS);
      try { rep2 = await withTimeout(K.api('speed.diagnose'), STEP_MAX); } catch (e) { rep2 = null; }
      if (rep2 && Array.isArray(rep2.achados)) {
        const still = new Set(rep2.achados.filter((f) => f && (f.tipo === 'processo' || f.tipo === 'navegador')).map((f) => safeName(f.nome)));
        out.closed.push(...out.asked.filter((a) => !still.has(a.nome)));
        out.asked = out.asked.filter((a) => still.has(a.nome));
      }
    }
    if (rep2 && last === L) {
      try {
        const r = anSpeed(rep2);
        const i = L.results.findIndex((x) => x.id === 'velocidade');
        if (i >= 0) L.results[i] = r; else L.results.push(r);
      } catch (e) { /* fica a leitura de antes */ }
    }

    Object.assign(F, flyText(out, pick), { phase: 'done', at: nowS(), moved: out.movedN > 0 });
    if (here()) {
      if (F.ok) K.sound.tada(); else K.sound.oops();
      paintSum();
      if (rep2) replaceSpeed();
      fillActs(byIdOf(L.results));
    }
    /* a sujeira mudou: o número guardado (Varredura, Painel) ficou velho */
    if (out.cleaned) {
      K.dirt.forget();
      if (here()) refreshDirt('depois de mandar os caches pra Lixeira');
    }
  }

  /** "Pronto! Mandei 2,1 GB de caches pra Lixeira, fechei 1 app e liguei o aviso dos 80%." Só o que aconteceu. */
  function flyText(out, pick) {
    const done = [];
    if (out.movedN) done.push(`mandei ${gbNb(out.moved)} de caches pra Lixeira`);
    if (out.closed.length) done.push(out.closed.length === 1 ? 'fechei 1 app' : `fechei ${out.closed.length} apps`);
    if (out.asked.length) done.push(out.asked.length === 1 ? `pedi pra ${inl(out.asked[0].nome)} fechar` : `pedi pra ${out.asked.length} apps fecharem`);
    if (out.aviso) done.push(`liguei o aviso dos ${pick.aviso.limite}%`);
    const fails = [];
    if (out.cacheErr) fails.push(`mandar os caches pra Lixeira (${out.cacheErr})`);
    else if (out.cleaned && !out.movedN) fails.push(`mandar os caches pra Lixeira (${out.cacheFails.length ? whyTxt(out.cacheFails[0].motivo) : 'nada saiu do lugar'})`);
    else if (out.cacheFails.length) {
      const n = out.cacheFails.length;
      fails.push(`mandar ${n === 1 ? '1 item' : `${K.fmt.num(n)} itens`} de cache (${whyTxt(out.cacheFails[0].motivo)})`);
    }
    for (const f of out.appFails) fails.push(`fechar ${inl(f.app.nome)} (${f.why})`);
    if (out.avisoErr) fails.push(`ligar o aviso (${out.avisoErr})`);
    const ok = done.length > 0;
    let text = ok ? cap(listPt(done)) + '.' : 'Nada foi mexido.';
    if (fails.length) text += ` Não consegui ${listPt(fails)}.`;
    if (out.asked.length) text += out.asked.length === 1 ? ' Se ele perguntar se quer salvar, responda na janela dele.' : ' Se algum perguntar se quer salvar, responda na janela dele.';
    return { ok, title: ok ? 'Pronto!' : 'Não consegui fazer nada agora', text };
  }

  /** andamento dentro do resumo: um passo por linha (espera · fazendo · feito · não deu) */
  function flyList(F) {
    return K.el('ol', { class: 'kz-fly-steps' }, F.tasks.map((t) => {
      const icon = t.state === 'done' ? 'check' : t.state === 'err' ? 'alert' : t.icon;
      const bub = K.el('span', { class: 'kz-fly-bub', 'aria-hidden': 'true' });
      if (t.img && (t.state === 'wait' || t.state === 'on')) bub.appendChild(K.el('img', { src: t.img, alt: '' }));
      else bub.innerHTML = K.icon(icon);
      const st = { wait: 'na fila', on: 'fazendo', done: 'feito', err: 'não deu' }[t.state] || '';
      return K.el('li', { class: 'kz-fly-step', dataset: { state: t.state } }, bub,
        K.el('span', null, t.text), K.el('span', { class: 'kz-sr' }, ` (${st})`));
    }));
  }

  /* ---------- cartão da velocidade (largura toda) ---------- */
  function speedCard(r, style) {
    const step = SPEED_STEP;
    const c = K.el('article', { class: 'card kz-res kz-speed pop-in', style });
    c.appendChild(cardHead(step, r));
    c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
    if (!r.error && r.lines && r.lines.length) {
      c.appendChild(K.el('div', { class: 'kz-res-kicker' }, 'O que mais pesa agora'));
      c.appendChild(K.el('ul', { class: 'kz-sf-row' }, r.lines.map((l) => {
        const bub = K.el('span', { class: `kz-sf-bub t-${l.tone}`, 'aria-hidden': 'true' });
        if (l.img) bub.appendChild(K.el('img', { src: l.img, alt: '' })); else bub.innerHTML = K.icon(l.icon);
        return K.el('li', { class: 'kz-sf' }, bub,
          K.el('span', { class: 'kz-sf-text' }, K.el('b', null, l.text), l.sub ? K.el('span', null, l.sub) : null));
      })));
    }
    c.appendChild(K.el('div', { class: 'kz-res-foot' },
      r.note && !r.error ? K.el('p', { class: 'kz-note kz-speed-note' }, r.note) : null,
      K.el('button', { class: 'btn small' + (isAttention(r) ? ' gold' : ''), type: 'button', onclick: () => go(step.route) },
        'Ver o que pesa', K.el('span', { class: 'btn-ic', html: K.icon('arrow') }))));
    return c;
  }

  /** troca o cartão da velocidade no lugar (depois de fechar apps), sem refazer a tela */
  function replaceSpeed() {
    const old = ui.speedCard;
    const r = last && last.results.find((x) => x.id === 'velocidade');
    if (!old || !old.parentNode || !r) return;
    const node = speedCard(r, null);
    node.classList.remove('pop-in');
    if (isAttention(r)) markAtt(node);
    old.replaceWith(node);
    ui.speedCard = node;
  }

  /* ---------- "o que dá pra fazer agora": até 3 ações seguras, de um clique ---------- */
  function actionsFor(byId) {
    const out = [];
    const bat = byId.bateria, en = byId.energia, cpu = byId.cpu, disk = byId.disco, mem = byId.memoria;
    const dirt = byId.sujeira && !byId.sujeira.error && byId.sujeira.sel >= DIRT_TIP ? byId.sujeira : null;
    const freeUp = dirt ? `Liberar ${gbNb(dirt.sel)}` : null;
    const b = bat && !bat.error && !bat.none && !bat.missing ? bat.b : null;
    if (b && (bat.key === 'trocar' || bat.key === 'gasta')) {
      out.push({ icon: 'btWrench', tone: bat.tone, title: 'Trocar a bateria', text: 'A Apple mostra preço e onde levar pro seu modelo.',
        btn: 'Ver opções de troca', run: () => K.api('open.url', { url: 'https://support.apple.com/pt-br/mac/repair' }).catch(() => {}) });
    }
    /* só quando algo está puxando de verdade: com tudo tranquilo, "ver quem está puxando" com fogo
       desmentiria o "nada pede sua atenção" lá de cima */
    if (en && !en.error && en.top && (en.tone !== 'good' || (cpu && cpu.busy))) {
      out.push({ icon: 'flame', tone: en.tone !== 'good' ? en.tone : null, title: 'Ver quem está puxando', text: `${en.top} está na frente agora.`,
        btn: 'Ver a lista', run: () => go(b ? 'bateria?secao=apps' : 'painel') });
    }
    const diskTight = disk && !disk.error && disk.tone !== 'good';
    if (diskTight && dirt) {
      /* disco apertado e sujeira de sobra: a ação do disco já leva pra Faxina */
      out.push({ icon: 'broom', tone: disk.tone, title: freeUp, text: 'Disco apertado: sai de caches e registros, com segurança.',
        btn: 'Ver e limpar', run: () => go('faxina') });
    } else if (diskTight) {
      out.push({ icon: 'disk', tone: disk.tone, title: 'Liberar espaço', text: 'Veja quanto sobra e o que ocupa.', btn: 'Ver o disco', run: () => go('painel') });
    }
    if (mem && !mem.error && mem.tone !== 'good') {
      out.push({ icon: 'memory', tone: mem.tone, title: 'Aliviar a memória', text: 'Fechar abas e apps parados é o que mais ajuda.',
        btn: 'Ver quem pesa', run: () => go('otimizar?aba=pesando') });
    }
    if (dirt && !diskTight) {
      out.push({ icon: 'broom', title: freeUp, text: 'Caches e registros que os apps recriam. Tudo vai pra Lixeira.',
        btn: 'Ver e limpar', run: () => go('faxina') });
    }
    if (b && b.pluggedIn) {
      const s = K.settings.value;
      if (s && s.aviso80 === false) {
        out.push({ icon: 'bell', title: `Aviso dos ${s.limiteAviso || 80}%`, text: 'Te chamo quando a carga chegar lá.',
          btn: 'Ligar o aviso', toggle: true });
      } else if (!b.optimizedChargingEngaged && b.percent >= 99) {
        out.push({ id: 'otimizado', icon: 'btShield', title: 'Carregamento otimizado', text: 'O macOS pode segurar a carga em 80% pra você.',
          btn: 'Abrir Ajustes', run: () => K.api('open.settings', { painel: 'bateria' }).catch(() => go('bateria?secao=cuidados')) });
      }
    }
    const su = last && last.startup;
    if (su && su.n >= STARTUP_MIN) {
      /* sem alarme: ter alguns é normal. Só mostra quantos são e onde decidir */
      const shown = su.names.slice(0, 2);
      const rest = su.n - shown.length;
      const who = shown.length ? listPt(rest > 0 ? shown.concat([`mais ${rest}`]) : shown) + '. ' : '';
      out.push({ icon: 'rocket', title: `${su.n} ${su.names.length === su.n ? 'apps abrem' : 'itens abrem'} com o Mac`,
        text: `${who}Dá pra desligar e religar depois.`,
        btn: 'Ver em Velocidade', run: () => go('otimizar?aba=login') });
    }
    if (b && out.length && out.length < 3) {
      const s = K.settings.value;
      if (s && s.aviso80) out.push({ icon: 'bell', title: `Aviso dos ${s.limiteAviso || 80}%`, text: 'Te chamo quando a carga chegar lá.', done: 'Ligado', btn: 'Mudar', run: () => go('bateria?secao=avisos') });
    }
    return out.slice(0, 3);
  }

  function fillActs(byId) {
    if (!ui.actsSlot) return;
    ui.actsSlot.textContent = '';
    const acts = actionsFor(byId);
    /* a mesma dica não aparece duas vezes: se virou ação lá em cima, sai do cartão da bateria */
    ui.actIds = new Set(acts.map((a) => a.id).filter(Boolean));
    if (ui.batTip) ui.batTip.hidden = !!(ui.batTip.dataset.id && ui.actIds.has(ui.batTip.dataset.id));
    if (acts.length) ui.actsSlot.appendChild(actionsBlock(acts));
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
            /* o "Deixar voando" do resumo não oferece mais o aviso (e some, se era só isso) */
            if (!(last && last.fly)) paintSum();
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
    if (r.tip) {
      ui.batTip = K.el('div', { class: 'tip kz-tip', html: K.icon(r.tip.icon), dataset: { id: r.tip.id || '' } }, K.el('p', null, r.tip.text));
      ui.batTip.hidden = !!(r.tip.id && ui.actIds && ui.actIds.has(r.tip.id));
      c.appendChild(ui.batTip);
    }
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
        empty: 'Tudo calmo: ninguém gastando agora.',
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

  /** Sujeira: o número que vai pra Faxina, dividido por tipo. Largura toda, no fim da grade. */
  function dirtCard(r, style) {
    const step = DIRT_STEP;
    const c = K.el('article', { class: 'card kz-res kz-dirt pop-in' + (r.tone === 'tip' ? ' is-tip' : ''), style });
    c.appendChild(cardHead(step, r));
    if (!r.error) {
      const main = K.el('div', { class: 'kz-dirt-main' });
      if (r.value != null) main.appendChild(K.el('div', { class: 'kz-val-row' }, valueEl(r.value, (v) => K.fmt.bytes(v)), K.el('span', { class: 'kz-val-sub' }, r.sub)));
      main.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
      const f = factsEl(r.facts);
      if (f) main.appendChild(f);
      const body = K.el('div', { class: 'kz-dirt-body' }, main);
      if (r.found > 0 && !r.noStack && r.cats && r.cats.length) {
        const box = K.el('div', { class: 'kz-dirt-stack' });
        body.appendChild(K.el('div', { class: 'kz-dirt-side' },
          K.el('div', { class: 'kz-res-kicker' }, 'Por tipo ', K.el('span', { class: 'muted' }, '(o colorido já vem marcado)')),
          box));
        afterMount.push(() => {
          const ch = K.charts.stack(box, {
            segments: r.cats.map((x) => ({ name: DIRT_SHORT[x.id] || x.titulo, value: x.sel, color: DIRT_COLOR[x.id] })),
            total: r.found, restName: 'Não marcado (você decide)', restColor: 'var(--panel)', restNote: 'app aberto ou vale olhar antes',
            format: (v) => K.fmt.bytes(v), height: 30,
            ariaLabel: 'Sujeira por tipo: o que já vem marcado e o que fica pra você decidir',
          });
          charts.push(ch);
          c._chart = ch;
        });
      } else body.classList.add('is-single');
      c.appendChild(body);
    } else {
      c.appendChild(K.el('p', { class: 'kz-res-say' }, r.say));
    }
    const label = !r.error && r.sel > 0 ? 'Ver e limpar' : 'Abrir o Espaço';
    c.appendChild(K.el('div', { class: 'kz-res-foot' },
      r.note ? K.el('p', { class: 'kz-note kz-dirt-note' }, r.note) : null,
      K.el('button', { class: 'btn small' + (r.tone === 'tip' ? ' gold' : ''), type: 'button', onclick: () => go(step.route) },
        label, K.el('span', { class: 'btn-ic', html: K.icon('arrow') }))));
    return c;
  }

  function runAfterMount() {
    const todo = afterMount;
    afterMount = [];
    for (const fn of todo) { try { fn(); } catch (e) { console.error('varredura/gráfico: ' + (e.stack || e.message)); } }
  }

  /** Voltou da Faxina com um resultado guardado (ou o "Deixar voando" mandou caches pra Lixeira):
      relê só a sujeira e troca o cartão, as ações e o resumo no lugar, sem refazer a tela.
      `depois` completa a nota ("Conferi de novo às 14:32, depois da Faxina"). Só lê. */
  async function refreshDirt(depois) {
    const my = token;
    const old = ui.dirtCard;
    if (old) old.appendChild(K.el('span', { class: 'sticker kz-look kz-redo', role: 'status' }, 'conferindo de novo…'));
    const byId = () => { const o = {}; for (const r of last.results) o[r.id] = r; return o; };
    let res;
    try {
      const d = await K.dirt.check({ fresh: true });
      if (my !== token || !last) return;
      res = anDirt(d, byId().disco);
    } catch (e) {
      if (my !== token || !last) return;
      res = errResult(DIRT_STEP, e);
    }
    if (mode !== 'result' || !host) return;
    /* o resumo diz "Feita às…": o cartão avisa que este número é mais novo */
    const again = depois ? `Conferi de novo às ${K.fmt.time(nowS())}, ${depois}.` : `Conferi de novo às ${K.fmt.time(nowS())}.`;
    res.note = res.note ? `${again} ${res.note}` : again;
    const i = last.results.findIndex((r) => r.id === 'sujeira');
    if (i >= 0) last.results[i] = res; else last.results.push(res);
    last.dirtGen = K.dirt.gen;
    if (old && old.parentNode) {
      if (old._chart) {
        try { old._chart.destroy(); } catch (e) { /* já foi */ }
        charts = charts.filter((x) => x !== old._chart);
      }
      const node = dirtCard(res, null);
      old.replaceWith(node);
      ui.dirtCard = node;
      runAfterMount();
    }
    /* o resumo se repinta (no meio do "Deixar voando" ou na comemoração, ele continua como está) */
    paintSum();
    if (summaryOf(last.results).kind !== 'fail') fillActs(byId());
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
    title: 'Início',
    async render(el) {
      host = el;
      token++;
      await loadMachine();
      if (host !== el) return;
      if (!pendingScan && last && nowS() - last.at < KEEP_S) {
        paintResult(false);
        if (last.dirtGen !== K.dirt.gen) refreshDirt();
      } else paintIdle();
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
