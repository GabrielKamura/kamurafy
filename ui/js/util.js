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
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
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
  /** minutos → "48 min", "2 h 5 min" (espaço que não quebra: "min" nunca fica sozinho na linha) */
  mins(m) {
    if (m == null) return '—';
    m = Math.round(m);
    if (m < 60) return m + '\u00a0min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}\u00a0h\u00a0${r}\u00a0min` : `${h}\u00a0h`;
  },
  /** segundos → "2 dias e 3 h", "5 h 10 min" */
  duration(s) {
    if (s == null) return '—';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}\u00a0${d === 1 ? 'dia' : 'dias'}${h ? ` e ${h}\u00a0h` : ''}`;
    if (h > 0) return `${h}\u00a0h${m ? `\u00a0${m}\u00a0min` : ''}`;
    return `${m}\u00a0min`;
  },
  /** segundos → número redondo pra estimativa: "~12 h", "~3 dias" (arredonda, não corta) */
  roughDuration(s) {
    if (s == null || !isFinite(s)) return '—';
    if (s < 3600) return '~' + Math.max(1, Math.round(s / 60)) + '\u00a0min';
    if (s < 48 * 3600) return '~' + Math.round(s / 3600) + '\u00a0h';
    return '~' + Math.round(s / 86400) + '\u00a0dias';
  },
  /** Unix (s) → "24 set" */
  day(t) {
    return new Date(t * 1000).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  },
  /** Unix (s) → "set de 2027" */
  monthYear(t) {
    return new Date(t * 1000).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  },
  /** Unix (s) → "23:41" */
  time(t) {
    return new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
  /** Unix (s) → "qua, 23:41" */
  dayTime(t) {
    const d = new Date(t * 1000);
    const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
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
    if (Math.abs(w) < 0.3) return { value: '0 W', verb: plugged ? 'a bateria está descansando' : 'quase nada saindo', dir: plugged ? 'direct' : 'idle' };
    return w > 0 ? { value: K.fmt.watts(w), verb: 'entrando na bateria', dir: 'in' } : { value: K.fmt.watts(w), verb: 'saindo da bateria', dir: 'out' };
  },
  /** temperatura sem casa decimal (a casa seria precisão falsa): 30.9 → "31 °C" */
  temp(c) {
    if (c == null) return '—';
    return K.fmt.num(c, 0) + ' °C';
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
  'saudavel': { label: 'Saudável', tone: 'good', icon: 'check' },
  'de-olho': { label: 'De olho', tone: 'warn', icon: 'eye' },
  'gasta': { label: 'Gasta', tone: 'serious', icon: 'alert' },
  'trocar': { label: 'Hora de trocar', tone: 'crit', icon: 'alert' },
  'sem-bateria': { label: 'Sem bateria', tone: 'warn', icon: 'plug' },
  /* o Mac não mediu a saúde agora: não dá pra dizer que está saudável */
  'desconhecida': { label: 'Sem leitura', tone: 'none', icon: 'info' },
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
/** Modelo é notebook? ("MacBook…"): aí "sem bateria" é bateria sem leitura, não Mac de mesa */
K.isLaptop = (info) => /macbook/i.test(String((info && (info.model || info.modelId)) || ''));

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
      let note = a.isSelf ? 'este app' : a.isSystem ? 'do sistema' : a.isApp ? null : 'do sistema';
      let key;
      const web = /^Conteúdo da Internet de (.+)$/i.exec(name) || /^(.+?) Web Content$/i.exec(name);
      if (web) { name = web[1].trim(); note = null; }
      if (a.isSelf || /^kamurafy$/i.test(name)) { name = 'Kamurafy'; note = 'este app'; key = 'kamurafy'; }
      else if (!name || /^[\d.]+$/.test(name)) {
        note = name ? `versão ${name}` : null;
        key = 'pid:' + a.pid;
        name = 'Processo sem nome';
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
  node.textContent = v == null || (typeof v === 'number' && !isFinite(v)) ? (missing || 'sem leitura') : fmt(v);
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
        o.ok || 'Confirmar');
      const cancelBtn = K.el('button', { class: 'btn kmodal-cancel', type: 'button', onclick: () => close(false) }, o.cancel || 'Cancelar');
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
          K.el('h2', { id: id + '-t' }, o.title || 'Tem certeza?')),
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
