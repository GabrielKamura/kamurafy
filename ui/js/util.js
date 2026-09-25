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
  /** minutos → "48 min", "2 h 5 min" */
  mins(m) {
    if (m == null) return '—';
    m = Math.round(m);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  },
  /** segundos → "2 dias e 3 h", "5 h 10 min" */
  duration(s) {
    if (s == null) return '—';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d} ${d === 1 ? 'dia' : 'dias'}${h ? ` e ${h} h` : ''}`;
    if (h > 0) return `${h} h${m ? ` ${m} min` : ''}`;
    return `${m} min`;
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
  /** watts com sinal explicado: 7.7 → "7,7 W" */
  watts(w) {
    if (w == null) return '—';
    return K.fmt.num(Math.abs(w), Math.abs(w) < 10 ? 1 : 0) + ' W';
  },
  temp(c) {
    if (c == null) return '—';
    return K.fmt.num(c, 1) + ' °C';
  },
};

/* ===== status de bateria (vem do Swift em battery.now.status) ===== */
K.batteryStatus = {
  'saudavel': { label: 'Saudável', tone: 'good', icon: 'check' },
  'de-olho': { label: 'De olho', tone: 'warn', icon: 'eye' },
  'gasta': { label: 'Gasta', tone: 'serious', icon: 'alert' },
  'trocar': { label: 'Hora de trocar', tone: 'crit', icon: 'alert' },
  'sem-bateria': { label: 'Sem bateria', tone: 'warn', icon: 'plug' },
};

/** Etiqueta de status (ícone + texto). tone: good | warn | serious | crit */
K.statusPill = function (tone, text, iconName, big) {
  return K.el('span', { class: `status ${tone}${big ? ' big' : ''}`, html: K.icon(iconName || K.toneIcon(tone)) }, text);
};
K.toneIcon = (tone) => ({ good: 'check', warn: 'eye', serious: 'alert', crit: 'alert' }[tone] || 'info');

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
