/* Kamurafy — utilidades: namespace K, montagem de DOM segura, formatação pt-BR. */
'use strict';

window.K = window.K || {};
K.pages = K.pages || {};

/**
 * Cria elemento. Texto sempre via textContent (nome de processo, de app etc.
 * vem de fora e nunca vai por innerHTML).
 *   K.el('div', {class: 'card', onclick: fn, dataset: {id: 1}}, 'texto', outroEl)
 * Pra SVG confiável (ícones do próprio app) use {html: K.icon('bolt')}.
 */
K.el = function (tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

K.$ = (sel, root) => (root || document).querySelector(sel);
K.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===== formatação (pt-BR) ===== */
K.fmt = {
  /** 7895 → "7.895"; 89.8 → "89,8" (casas: quantas decimais) */
  num(v, casas = 0) {
    if (v == null || Number.isNaN(v)) return '—';
    return Number(v).toLocaleString(K.locale || 'pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  },
  /** 89.8 → "89,8%"; carga: K.fmt.pct(100, 0) → "100%" */
  pct(v, casas = 1) {
    if (v == null) return '—';
    return K.fmt.num(v, casas) + '%';
  },
  /** bytes em base 10, como o Finder: 401751961600 → "401,8 GB" */
  bytes(v, casas) {
    if (v == null) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, n = Number(v);
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    const c = casas != null ? casas : (n >= 100 || i === 0 ? 0 : 1);
    return K.fmt.num(n, c) + ' ' + u[i];
  },
  /**
   * Memória em base 2, como o Monitor de Atividade e a Apple: 17179869184 → "16 GB" (com casas 0),
   * 13.8e9 → "12,9 GB". Painel, Varredura, Otimizar e o balão usam esta mesma função, pra os
   * números nunca se desencontrarem. Disco e arquivos continuam em K.fmt.bytes (base 10, como o Finder).
   */
  mem(v, casas) {
    if (v == null || !isFinite(v)) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, n = Math.abs(Number(v));
    while (n >= 1000 && i < u.length - 1) { n /= 1024; i++; }
    const c = casas != null ? casas : (i >= 3 && n < 100 ? 1 : 0);
    return K.fmt.num(n, c) + ' ' + u[i];
  },
  /**
   * Núcleos do processador, do mesmo jeito em todas as telas (system.now.cpu):
   *   Intel i7 → "6 núcleos (12 linhas de execução)"; Apple M2 → "8 núcleos (4 de desempenho + 4 de eficiência)"
   *   curto: "6 núcleos". Sem leitura: ''.
   */
  cores(c, curto) {
    if (!c) return '';
    const ok = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
    const lg = ok(c.cores), fis = ok(c.physicalCores), p = ok(c.performanceCores), e = ok(c.efficiencyCores);
    const n = fis || (p && e ? p + e : null) || lg;
    if (!n) return '';
    const base = `${K.fmt.num(n)} ${n === 1 ? K.t('núcleo') : K.t('núcleos')}`;
    if (curto) return base;
    if (p && e) return K.t('{0} ({1} de desempenho + {2} de eficiência)', base, K.fmt.num(p), K.fmt.num(e));
    if (fis && lg && lg > fis) return K.t('{0} ({1} linhas de execução)', base, K.fmt.num(lg));
    return base;
  },
  /** minutos → "48 min", "2 h 5 min" (espaço que não quebra: "min" nunca fica sozinho na linha) */
  mins(m) {
    if (m == null) return '—';
    m = Math.round(m);
    if (m < 60) return m + K.t('\u00a0min');
    const h = Math.floor(m / 60), r = m % 60;
    return r ? K.t('{0}\u00a0h\u00a0{1}\u00a0min', h, r) : K.t('{0}\u00a0h', h);
  },
  /** segundos → "2 dias e 3 h", "5 h 10 min" */
  duration(s) {
    if (s == null) return '—';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}\u00a0${d === 1 ? K.t('dia') : K.t('dias')}${h ? K.t(' e {0}\u00a0h', h) : ''}`;
    if (h > 0) return K.t('{0}\u00a0h{1}', h, m ? K.t('\u00a0{0}\u00a0min', m) : '');
    return K.t('{0}\u00a0min', m);
  },
  /** segundos → número redondo pra estimativa: "~12 h", "~3 dias" (arredonda, não corta) */
  roughDuration(s) {
    if (s == null || !isFinite(s)) return '—';
    if (s < 3600) return '~' + Math.max(1, Math.round(s / 60)) + K.t('\u00a0min');
    if (s < 48 * 3600) return '~' + Math.round(s / 3600) + K.t('\u00a0h');
    return '~' + Math.round(s / 86400) + K.t('\u00a0dias');
  },
  /** Unix (s) → "24 set" */
  day(t) {
    return new Date(t * 1000).toLocaleDateString(K.locale || 'pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  },
  /** Unix (s) → "set de 2027" */
  monthYear(t) {
    return new Date(t * 1000).toLocaleDateString(K.locale || 'pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  },
  /** Unix (s) → "23:41" */
  time(t) {
    return new Date(t * 1000).toLocaleTimeString(K.locale || 'pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
  /** Unix (s) → "qua, 23:41" */
  dayTime(t) {
    const d = new Date(t * 1000);
    const wd = d.toLocaleDateString(K.locale || 'pt-BR', { weekday: 'short' }).replace('.', '');
    return `${wd}, ${K.fmt.time(t)}`;
  },
  /** watts sem sinal (o sentido vai em palavras, com K.fmt.flow): −14.2 → "14 W" */
  watts(w) {
    if (w == null) return '—';
    return K.fmt.num(Math.abs(w), Math.abs(w) < 10 ? 1 : 0) + ' W';
  },
  /** energia da bateria em número + verbo: {value: "14 W", verb: "saindo da bateria", dir} */
  flow(w, plugged) {
    if (typeof w !== 'number' || !isFinite(w)) return null;
    if (Math.abs(w) < 0.3) return { value: K.t('0 W'), verb: plugged ? K.t('a bateria está descansando') : K.t('quase nada saindo'), dir: plugged ? 'direct' : 'idle' };
    return w > 0 ? { value: K.fmt.watts(w), verb: K.t('entrando na bateria'), dir: 'in' } : { value: K.fmt.watts(w), verb: K.t('saindo da bateria'), dir: 'out' };
  },
  /** temperatura sem casa decimal (a casa seria precisão falsa): 30.9 → "31 °C" */
  temp(c) {
    if (c == null) return '—';
    return K.fmt.num(c, 0) + K.t(' °C');
  },
  /** "MacBook Pro (16-inch, 2019)" → "MacBook Pro 16″ (2019)"; o resto passa como veio */
  model(m) {
    if (!m) return '';
    const g = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(m));
    if (!g) return String(m);
    const parts = g[2].split(/\s*,\s*/).filter(Boolean);
    const i = parts.findIndex((x) => /^\d+(?:[.,]\d+)?-inch$/i.test(x));
    if (i < 0) return String(m);
    const inch = parts.splice(i, 1)[0].replace(/-inch$/i, '').replace('.', ',');
    return `${g[1]} ${inch}″${parts.length ? ` (${parts.join(', ')})` : ''}`;
  },
};

/* ===== status de bateria (vem do Swift em battery.now.status) ===== */
K.batteryStatus = {
  'saudavel': { label: K.t('Saudável'), tone: 'good', icon: 'check' },
  'de-olho': { label: K.t('De olho'), tone: 'warn', icon: 'eye' },
  'gasta': { label: K.t('Gasta'), tone: 'serious', icon: 'alert' },
  'trocar': { label: K.t('Hora de trocar'), tone: 'crit', icon: 'alert' },
  'sem-bateria': { label: K.t('Sem bateria'), tone: 'warn', icon: 'plug' },
  /* o Mac não mediu a saúde agora: não dá pra dizer que está saudável */
  'desconhecida': { label: K.t('Sem leitura'), tone: 'none', icon: 'info' },
};

/** Status que a interface mostra. Sem leitura de saúde, "saudavel" vira "desconhecida"
    (o Swift antigo mandava "saudavel" mesmo sem medir). */
K.batStatusKey = function (b) {
  if (!b) return 'desconhecida';
  if (b.present === false) return 'sem-bateria';
  const hasHealth = typeof b.healthPct === 'number' && isFinite(b.healthPct);
  const s = b.status;
  if (!K.batteryStatus[s]) return 'desconhecida';
  if (s === 'saudavel' && !hasHealth) return 'desconhecida';
  return s;
};
K.batStatus = (b) => K.batteryStatus[K.batStatusKey(b)];
/**
 * Na tomada, o macOS diz "não está carregando" mas ainda entra energia na bateria (ela está
 * completando os últimos pontinhos devagar). Aí a tela diz "terminando de encher", nunca
 * "descansando" com "5,5 W entrando" do lado: uma verdade só pra tela inteira.
 */
K.batTopping = (b) => !!b && !!b.pluggedIn && !b.isCharging && !b.fullyCharged
  && typeof b.watts === 'number' && isFinite(b.watts) && b.watts > 0.3;
/** Modelo é notebook? ("MacBook…"): aí "sem bateria" é bateria sem leitura, não Mac de mesa */
K.isLaptop = (info) => /macbook/i.test(String((info && (info.model || info.modelId)) || ''));

/* ===== nomes de processos do macOS em português ===== */
/**
 * Processo solto (sem janela) com nome técnico → nome que dá pra entender, com o técnico entre
 * parênteses. É a mesma tabela do Swift (Energy.friendly) e mais alguns que aparecem muito no
 * Otimizar, pra Bateria, Varredura, balão e Otimizar falarem a mesma língua. Nome que o Swift já
 * traduziu (ou que não está na tabela) passa como veio. Só pra processo: app tem nome próprio.
 */
K.procName = (function () {
  const T = {
    WindowServer: K.t('Tela e janelas (WindowServer)'), kernel_task: K.t('Núcleo do macOS (kernel_task)'),
    mds: K.t('Spotlight (mds)'), mds_stores: K.t('Spotlight (mds_stores)'), mdworker: K.t('Spotlight (mdworker)'),
    mdworker_shared: K.t('Spotlight (mdworker)'), corespotlightd: K.t('Spotlight (corespotlightd)'), Spotlight: K.t('Spotlight'),
    coreaudiod: K.t('Som do sistema (coreaudiod)'), deleted: K.t('Limpeza automática do macOS (deleted)'),
    bluetoothd: K.t('Bluetooth (bluetoothd)'), backupd: K.t('Time Machine (backupd)'), photoanalysisd: K.t('Fotos: análise (photoanalysisd)'),
    cloudd: K.t('iCloud (cloudd)'), bird: K.t('iCloud Drive (bird)'), softwareupdated: K.t('Atualização do macOS'),
    launchd: K.t('Sistema (launchd)'), hidd: K.t('Teclado e trackpad (hidd)'), TouchBarServer: K.t('Touch Bar'),
    coreduetd: K.t('Sugestões do sistema (coreduetd)'), containermanagerd: K.t('Apps em contêiner (containermanagerd)'),
    trustd: K.t('Certificados (trustd)'), nsurlsessiond: K.t('Downloads em segundo plano (nsurlsessiond)'),
    powerd: K.t('Energia (powerd)'), tccd: K.t('Privacidade (tccd)'), SystemUIServer: K.t('Barra de menus (SystemUIServer)'),
    'com.apple.WebKit.WebContent': K.t('Páginas da web (WebKit)'), 'com.apple.WebKit.GPU': K.t('Páginas da web: vídeo (WebKit)'),
    'com.apple.WebKit.Networking': K.t('Páginas da web: rede (WebKit)'), ContainerMetadataExtractor: K.t('Arquivos: leitura de metadados'),
    /* só aqui (ainda não estão no Swift) */
    fontd: K.t('Fontes (fontd)'), lsd: K.t('Abrir com (lsd)'), launchservicesd: K.t('Abrir com (launchservicesd)'),
    runningboardd: K.t('Controle de apps (runningboardd)'), swcd: K.t('Links de apps (swcd)'), logd: K.t('Registros do sistema (logd)'),
    cfprefsd: K.t('Preferências (cfprefsd)'), XProtectPluginService: K.t('Proteção contra vírus (XProtect)'), XprotectService: K.t('Proteção contra vírus (XProtect)'),
    syspolicyd: K.t('Segurança de apps (syspolicyd)'), opendirectoryd: K.t('Contas de usuário (opendirectoryd)'), configd: K.t('Rede (configd)'),
    mDNSResponder: K.t('Rede: nomes (mDNSResponder)'), airportd: K.t('Wi-Fi (airportd)'), locationd: K.t('Localização (locationd)'),
    sharingd: K.t('AirDrop e Handoff (sharingd)'), rapportd: K.t('Aparelhos por perto (rapportd)'), loginwindow: K.t('Tela de entrada (loginwindow)'),
    ControlCenter: K.t('Central de Controle'), NotificationCenter: K.t('Central de Notificações'), UserEventAgent: K.t('Eventos do sistema (UserEventAgent)'),
    distnoted: K.t('Avisos internos (distnoted)'), secd: K.t('Chaves (secd)'), securityd: K.t('Chaves (securityd)'), notifyd: K.t('Avisos internos (notifyd)'),
    thermalmonitord: K.t('Temperatura (thermalmonitord)'), diskarbitrationd: K.t('Discos (diskarbitrationd)'), fseventsd: K.t('Mudanças em arquivos (fseventsd)'),
    'com.apple.AppleUserHIDDrivers': K.t('Teclado e mouse (drivers HID)'), WindowManager: K.t('Janelas (WindowManager)'), universalaccessd: K.t('Acessibilidade (universalaccessd)'),
  };
  return function (nome) {
    const s = String(nome == null ? '' : nome).trim();
    /* nome que o Swift já mandou amigável (em português) também passa pelo catálogo */
    return Object.prototype.hasOwnProperty.call(T, s) ? T[s] : K.t(s);
  };
})();

/* ===== quem gasta energia (battery.energyApps) → itens do gráfico de barras ===== */
(function () {
  /* ferramentas que o próprio Kamurafy roda pra medir: só aparecem por causa dele */
  const HELPERS = new Set(['top', 'pmset', 'ioreg', 'system_profiler', 'sysctl', 'vm_stat', 'df', 'powermetrics', 'ps']);
  const ICON_BY_NAME = [
    [/tela|janela|windowserver/i, 'screen'],
    [/\bsom\b|áudio|audio/i, 'soundOn'],
    [/icloud|nuvem|cloud|\bbird\b/i, 'cloud'],
    [/spotlight|\bmds|índice|indexa/i, 'scan'],
  ];
  /**
   * Limpa e junta a lista: tira as ferramentas de medição, soma o "Conteúdo da Internet de X"
   * (processo de páginas web do app X) no próprio X, marca o Kamurafy como "este app" e troca
   * nome que é só número de versão por "Processo sem nome". Texto continua indo por textContent.
   *   K.energyItems(lista, {min: 0.1}) → [{label, value, icon, note, isApp}]
   */
  K.energyItems = function (list, o) {
    const min = (o && o.min != null) ? o.min : 0.1;
    const by = new Map();
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || typeof a.power !== 'number' || !isFinite(a.power)) continue;
      let name = String(a.name || '').trim();
      if (!a.isApp && HELPERS.has(name.toLowerCase())) continue;
      if (!a.isApp) name = K.procName(name);
      /* app que a pessoa abriu (Terminal, Notas, Finder) é app, mesmo morando em /System/Applications:
         "do sistema" fica só pro que roda escondido */
      let note = a.isSelf ? 'este app' : a.isApp ? (a.isSystem ? 'app da Apple' : null) : 'do sistema';
      let key;
      const web = /^Conteúdo da Internet de (.+)$/i.exec(name) || /^(.+?) Web Content$/i.exec(name);
      if (web) { name = web[1].trim(); note = null; }
      if (a.isSelf || /^kamurafy$/i.test(name)) { name = K.t('Kamurafy'); note = 'este app'; key = 'kamurafy'; }
      else if (!name || /^[\d.]+$/.test(name)) {
        note = name ? K.t('versão {0}', name) : null;
        key = 'pid:' + a.pid;
        name = K.t('Processo sem nome');
      } else key = name.toLowerCase();
      const cur = by.get(key);
      if (cur) {
        cur.value += a.power;
        if (a.isApp) { cur.isApp = true; if (cur.note === 'do sistema') cur.note = null; }
        if (a.icon && !(typeof cur.icon === 'string' && cur.icon.indexOf('data:') === 0)) cur.icon = a.icon;
        continue;
      }
      let icon = a.icon || null;
      if (!icon) {
        const hit = ICON_BY_NAME.find(([re]) => re.test(name));
        icon = hit ? hit[1] : a.isApp || web ? 'apps' : 'cpu';
      }
      by.set(key, { label: name, value: a.power, icon, note, isApp: !!a.isApp || !!web });
    }
    return Array.from(by.values()).filter((x) => x.value >= min).sort((x, y) => y.value - x.value);
  };
})();

/* ===== Faxina: o que já vem marcado (Faxina, Varredura e Painel usam a mesma regra) ===== */
/**
 * Sugestão do Swift (`selecionado`) com uma trava a mais: cache de app sem app conhecido
 * (`categoria: 'caches'` e `app` vazio) não vem marcado. Costuma ser serviço do macOS sem o
 * prefixo com.apple (askpermissiond, Maps…) ou ferramenta de terminal que pode estar rodando.
 * A pessoa ainda pode marcar na mão.
 */
K.cleanSuggested = function (it) {
  if (!it || !it.selecionado || it.appAberto || it.semAcesso) return false;
  if (it.categoria === 'caches' && !it.app) return false;
  return true;
};

/** Etiqueta de status (ícone + texto). tone: good | warn | serious | crit */
K.statusPill = function (tone, text, iconName, big) {
  return K.el('span', { class: `status ${tone}${big ? ' big' : ''}`, html: K.icon(iconName || K.toneIcon(tone)) }, text);
};
K.toneIcon = (tone) => ({ good: 'check', warn: 'eye', serious: 'alert', crit: 'alert' }[tone] || 'info');

/** Valor que pode faltar: número formatado, ou "sem leitura" apagado (nunca um "—" preto). */
K.readOr = function (node, v, fmt, missing) {
  node.classList.toggle('no-read', v == null || (typeof v === 'number' && !isFinite(v)));
  node.textContent = v == null || (typeof v === 'number' && !isFinite(v)) ? (missing || K.t('sem leitura')) : fmt(v);
  return node;
};

/** Anima um número de 0 até o valor (respeita reduzir movimento). */
K.countUp = function (node, to, format, ms = 900) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('snap');
  if (reduce || to == null) { node.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = format(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/* ===== caixa de marcar (três estados) ===== */
/**
 * Caixa de marcar desenhada (button role=checkbox). state: true | false | 'mixed'.
 *   const c = K.checkbox({ state: true, label: 'Marcar Spotify', onchange: () => … })
 *   c.set(false)            // muda o desenho (não chama onchange)
 *   c.set('mixed', true)    // segundo argumento: desabilitada
 * O clique só chama onchange: quem decide o novo estado é a página (ela chama set).
 */
K.checkbox = function (o) {
  o = o || {};
  const node = K.el('button', {
    class: 'kcheck' + (o.class ? ' ' + o.class : ''), type: 'button', role: 'checkbox',
    'aria-label': o.label || null, title: o.title || null,
    html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="kc-tick" d="m6 12.6 4 4 8-9"/><path class="kc-dash" d="M6.5 12h11"/></svg>',
  });
  node.set = function (state, disabled) {
    node.setAttribute('aria-checked', state === 'mixed' ? 'mixed' : state ? 'true' : 'false');
    node.disabled = !!disabled;
    return node;
  };
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.disabled) return;
    if (o.onchange) o.onchange(e);
  });
  node.set(o.state, o.disabled);
  return node;
};

/* ===== confirmação (modal próprio: o WKWebView não mostra confirm()) ===== */
/**
 * Pergunta antes de fazer algo que mexe em arquivo. Devolve Promise<boolean>.
 *   const ok = await K.confirm({
 *     title: 'Mandar 2,3 GB pra Lixeira?',
 *     text: 'Uma frase explicando.',                    // opcional
 *     body: nó | [nós],                                   // opcional (resumo, lista)
 *     note: { icon: 'fxUndo', text: 'Dá pra desfazer…', tone: 'good' | 'crit' },   // opcional
 *     ok: 'Mandar pra Lixeira', cancel: 'Agora não',
 *     tone: 'gold' | 'danger',                            // danger: botão vermelho, foco no Cancelar
 *     icon: 'fxTrash',                                    // ícone do selo do título
 *     ack: 'Entendi que não dá pra desfazer',             // opcional: precisa marcar pra liberar o botão
 *     mascot: 'happy' | 'worried' | …                     // opcional: mascote pequeno ao lado
 *   })
 * Esc, clique fora e "Cancelar" devolvem false. Só um aberto por vez (abrir outro cancela o anterior).
 * K.confirm.close(valor) fecha por código (testes); K.confirm.isOpen() diz se há um aberto.
 */
K.confirm = (function () {
  let cur = null;

  function close(value) {
    if (!cur) return;
    const c = cur;
    cur = null;
    document.removeEventListener('keydown', c.onKey, true);
    if (c.mascot) { try { c.mascot.destroy(); } catch (e) { /* já foi */ } }
    const calm = document.documentElement.classList.contains('snap') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) c.back.remove();
    else { c.back.classList.add('out'); setTimeout(() => c.back.remove(), 170); }
    if (c.prev && document.contains(c.prev) && c.prev.focus) { try { c.prev.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
    c.resolve(!!value);
  }

  function open(o) {
    o = o || {};
    if (cur) close(false);
    const danger = o.tone === 'danger';
    return new Promise((resolve) => {
      const id = 'kmodal-' + Math.random().toString(36).slice(2, 8);
      const okBtn = K.el('button', { class: 'btn ' + (danger ? 'danger' : 'gold') + ' kmodal-ok', type: 'button', onclick: () => close(true) },
        o.ok || K.t('Confirmar'));
      const cancelBtn = K.el('button', { class: 'btn kmodal-cancel', type: 'button', onclick: () => close(false) }, o.cancel || K.t('Cancelar'));
      let ackBox = null;
      if (o.ack) {
        okBtn.disabled = true;
        const chk = K.checkbox({ state: false, label: o.ack, onchange: () => {
          const on = chk.getAttribute('aria-checked') !== 'true';
          chk.set(on);
          okBtn.disabled = !on;
          K.sound.tick();
        } });
        ackBox = K.el('div', { class: 'kmodal-ack' }, chk,
          K.el('span', { onclick: () => chk.click() }, o.ack));
      }
      const body = [];
      if (o.text) body.push(K.el('p', { class: 'kmodal-text', id: id + '-d' }, o.text));
      if (o.body) body.push(...[].concat(o.body).filter(Boolean));
      /* o aviso fica fora da parte que rola: em janela baixa, "Não dá pra desfazer" nunca some */
      const note = o.note
        ? K.el('div', { class: 'kmodal-note ' + (o.note.tone || (danger ? 'crit' : 'good')), html: K.icon(o.note.icon || (danger ? 'alert' : 'check')) },
          K.el('p', null, o.note.text))
        : null;
      const art = o.mascot ? K.el('div', { class: 'kmodal-mascot', 'aria-hidden': 'true' }) : null;
      const dialog = K.el('div', {
        class: 'kmodal' + (danger ? ' is-danger' : '') + (art ? ' has-mascot' : ''), role: 'alertdialog', 'aria-modal': 'true',
        'aria-labelledby': id + '-t', 'aria-describedby': o.text ? id + '-d' : null,
      },
        K.el('div', { class: 'kmodal-head' },
          K.el('span', { class: 'kmodal-ic' + (danger ? ' crit' : ''), html: K.icon(o.icon || (danger ? 'alert' : 'info')) }),
          K.el('h2', { id: id + '-t' }, o.title || K.t('Tem certeza?'))),
        K.el('div', { class: 'kmodal-body' }, body),
        note,
        ackBox,
        K.el('div', { class: 'kmodal-foot' }, cancelBtn, okBtn),
        art);
      const back = K.el('div', { class: 'kmodal-back', onclick: (e) => { if (e.target === back) close(false); } }, dialog);
      document.body.appendChild(back);
      const c = { back, dialog, resolve, prev: document.activeElement, mascot: null };
      if (art && K.mascot) {
        try { c.mascot = K.mascot(art, { size: 104, state: { pct: 72, tone: danger ? 'warn' : 'good', face: o.mascot === true ? (danger ? 'worried' : 'happy') : o.mascot } }); } catch (e) { /* sem mascote */ }
      }
      c.onKey = (e) => {
        if (cur !== c) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
        if (e.key === 'Tab') {
          const f = K.$$('button:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog);
          if (!f.length) return;
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        }
      };
      document.addEventListener('keydown', c.onKey, true);
      cur = c;
      /* perigo: o foco começa no Cancelar (Enter sem querer não apaga nada) */
      const first = danger || o.ack ? cancelBtn : okBtn;
      setTimeout(() => { if (cur === c) first.focus({ preventScroll: true }); }, 30);
      K.tooltip && K.tooltip.hide && K.tooltip.hide();
    });
  }

  open.close = close;
  open.isOpen = () => !!cur;
  return open;
})();

/* ===== cartão de erro (o mesmo desenho em todas as telas) ===== */
/**
 * Quando uma leitura falha e a tela não tem o que mostrar: rosa, mascote preocupado, o motivo em
 * português e o botão ouro "Tentar de novo" com a dica de quanto demora.
 *   K.errorCard({
 *     title: 'Não consegui listar os apps',
 *     reason: 'o Swift não respondeu',       // o motivo (sem ponto final); vira "O motivo: …. Nada foi mexido."
 *     text: 'Frase própria',                  // opcional: troca a frase inteira (ex.: telas que só leem)
 *     retry: () => …, retryLabel: 'Tentar de novo', retryHint: 'Leva uns 8 segundos.',
 *     compact: true,                          // opcional: sem mascote, pra caber dentro de um cartão
 *     mascot: { pct: null, tone: 'none' },    // opcional: estado do mascote (bateria sem leitura = cinza)
 *   })
 * Devolve o nó (section.card.kerr); o mascote é montado junto e some com o nó.
 */
K.errorCard = function (o) {
  o = o || {};
  const reason = String(o.reason == null ? '' : o.reason).trim().replace(/[.!\s]+$/, '');
  const text = o.text != null ? o.text : K.t('O motivo: {0}. Nada foi mexido.', reason || K.t('erro desconhecido'));
  const act = o.retry ? K.el('div', { class: 'kerr-act' },
    K.el('button', { class: 'btn gold' + (o.compact ? ' small' : ''), type: 'button', html: K.icon('cycle'),
      onclick: (e) => { if (K.sound) K.sound.plop(); o.retry(e); } }, o.retryLabel || K.t('Tentar de novo')),
    o.retryHint ? K.el('span', { class: 'kerr-hint' }, o.retryHint) : null) : null;
  const art = o.compact ? K.el('span', { class: 'head-ic crit kerr-ic', html: K.icon('alert') }) : K.el('div', { class: 'kerr-art', 'aria-hidden': 'true' });
  const node = K.el('section', { class: 'card kerr' + (o.compact ? ' is-compact' : '') + (o.class ? ' ' + o.class : ''), role: 'alert' },
    art,
    K.el('div', { class: 'kerr-text' },
      K.el(o.compact ? 'h3' : 'h2', null, o.title || K.t('Não consegui ler agora')),
      K.el('p', null, text),
      act));
  if (!o.compact && K.mascot) {
    /* o.mascot muda o estado (ex.: {pct: null, tone: 'none'} quando o que falhou foi a leitura da bateria) */
    try { K.mascot(art, { size: o.mascotSize || 124, state: Object.assign({ pct: 62, tone: 'good', face: 'worried', label: K.t('Mascote do Kamurafy preocupado') }, o.mascot || {}) }); } catch (e) { /* sem mascote */ }
  }
  return node;
};

/* ===== foco que não se perde quando a tela se redesenha ===== */
/**
 * Roda paint() (que refaz parte da tela) e devolve o foco do teclado pro mesmo controle, se ele
 * estava dentro de root. Acha o controle de novo pelo id, pelo data-fk ou pela posição entre os
 * focáveis. Sem isso o foco cai no BODY e quem usa teclado ou leitor de tela perde o lugar.
 */
K.keepFocus = function (root, paint, fallback) {
  const FOCUS = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"]), [id][tabindex="-1"]';
  const a = document.activeElement;
  const inside = !!(root && a && a !== document.body && root.contains(a));
  let sel = null, idx = -1, sig = '';
  if (inside) {
    if (a.id) sel = '#' + (window.CSS && CSS.escape ? CSS.escape(a.id) : a.id);
    else if (a.dataset && a.dataset.fk) sel = `[data-fk="${a.dataset.fk}"]`;
    idx = K.$$(FOCUS, root).indexOf(a);
    sig = a.tagName + '|' + (a.textContent || '').trim().slice(0, 40);
  }
  const r = paint();
  if (inside) {
    let t = sel ? root.querySelector(sel) : null;
    /* pela posição, só se for o "mesmo" controle (mesma tag e mesmo texto) */
    if (!t && idx >= 0) {
      const c = K.$$(FOCUS, root)[idx];
      if (c && c.tagName + '|' + (c.textContent || '').trim().slice(0, 40) === sig) t = c;
    }
    if (!t && fallback) t = root.querySelector(fallback);
    if (t && t !== document.activeElement && t.focus) { try { t.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
  }
  return r;
};

/* ===== textos dos avisos (Bateria e Ajustes dizem igual) ===== */
K.avisosTxt = {
  carga: (lim) => K.t('Me avisa quando chegar em {0}%', lim),
  cargaSub: K.t('Uma vez por carga, com o carregador ligado. Parar antes dos 100% ajuda a bateria a durar mais.'),
  quente: K.t('Me avisa se a bateria esquentar'),
  quenteSub: K.t('Acima de 45 °C em duas leituras seguidas. Só aviso de novo depois que ela esfriar.'),
};
