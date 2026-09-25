/* Kamurafy — gráficos desenhados à mão no estilo cartum.
   Traço do rough.js com aspereza baixa e seed fixa (não treme a cada redesenho).
   API completa e exemplos: docs/graficos.md. Regras visuais: docs/design.md.

   Todas as funções recebem um elemento (ou seletor), limpam o que havia nele,
   redesenham sozinhas quando a largura muda (ResizeObserver) e devolvem
   { el, update(novasOpts), destroy() }. Sem dados → mostram .empty com mensagem. */
'use strict';

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const SEED = 7;
  const DAY = 86400;
  const TABLE_STEP = 25;
  let uid = 0;

  const C = (K.charts = K.charts || {});

  /* Ordem categórica validada pra daltonismo (a ordem é o que garante a separação).
     1–2 são as séries da casa; use nessa ordem, nunca em ciclo. */
  C.palette = ['var(--s1)', 'var(--s2)', '#1baf7a', '#4a3aa7', '#e87ba4', '#eda100', '#008300', '#e34948'];

  /* ================= utilidades ================= */

  function sv(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v != null && v !== false) n.setAttribute(k, v); }
    if (parent) parent.appendChild(n);
    return n;
  }
  function stext(parent, x, y, str, cls, anchor) {
    const t = sv('text', { x: r1(x), y: r1(y), class: cls, 'text-anchor': anchor || null }, parent);
    t.textContent = str;
    return t;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const crisp = (v) => Math.round(v) + 0.5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /** roda fn no próximo quadro; se a janela estiver escondida (rAF parado), roda por timer. */
  function soon(fn) {
    let done = false;
    const run = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 70);
  }
  C.soon = soon;

  function calm() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('snap') || document.hidden;
  }

  function asEl(el) {
    const n = typeof el === 'string' ? document.querySelector(el) : el;
    if (!n || !n.appendChild) throw new Error('K.charts: elemento não encontrado');
    return n;
  }

  const TONE_VAR = {
    good: '--st-good', warn: '--st-warn', serious: '--st-serious', crit: '--st-crit',
    gold: '--gold', ink: '--ink', s1: '--s1', s2: '--s2', panel: '--panel',
  };
  const SOFT_VAR = { good: '--st-good-soft', warn: '--st-warn-soft', serious: '--st-serious-soft', crit: '--st-crit-soft', gold: '--gold-soft' };

  /** 'var(--s1)', '--s1', 'good', '#abc' → cor de verdade (o rough.js precisa do valor). */
  function col(c, fallback) {
    let v = c || fallback || '--ink';
    if (TONE_VAR[v]) v = TONE_VAR[v];
    const m = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
    const name = m ? m[1] : (v.indexOf('--') === 0 ? v : null);
    if (name) return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
    return v;
  }
  C.color = col;

  function rgba(hex, a) {
    const h = String(hex).trim();
    let m = /^#([0-9a-f]{3})$/i.exec(h);
    if (m) { const s = m[1]; return rgba('#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2], a); }
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
    if (m) return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
    m = /^rgba?\(([^)]+)\)$/.exec(h);
    if (m) { const p = m[1].split(',').slice(0, 3).join(','); return `rgba(${p},${a})`; }
    return h;
  }
  /** luminância relativa aproximada (pra escolher texto branco ou tinta sobre uma cor) */
  function lum(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
    if (!m) return 1;
    const f = (x) => { x = parseInt(x, 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
  }

  let mctx = null;
  let fontFam = null;
  function textW(str, px) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    if (!fontFam) fontFam = getComputedStyle(document.body).fontFamily;
    mctx.font = `${px}px ${fontFam}`;
    return mctx.measureText(String(str)).width;
  }

  const minus = (s) => String(s).replace(/^-/, '−');
  function fmtNum(v, casas) {
    if (!isNum(v)) return '—';
    return minus(Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  }
  function decimalsOf(step) {
    const s = String(+Number(step).toPrecision(6));
    const i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(3, s.length - i - 1);
  }
  C.num = fmtNum;

  /* ---------- escala "redonda" ---------- */
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceScale(min, max, count, fixLo, fixHi) {
    if (fixLo != null) min = fixLo;
    if (fixHi != null) max = fixHi;
    if (min === max) { const pad = Math.abs(min) * 0.1 || 1; if (fixLo == null) min -= pad; if (fixHi == null) max += pad; }
    if (min > max) { const t = min; min = max; max = t; }
    if (fixLo == null || fixHi == null) {
      /* testa algumas contagens e fica com a que desperdiça menos espaço */
      let best = null;
      for (let c = Math.max(2, count - 1); c <= count + 2; c++) {
        const o = niceScale1(min, max, c, fixLo, fixHi);
        if (o.ticks.length > Math.max(6, count + 2)) continue;
        if (!best || o.hi - o.lo < best.hi - best.lo - 1e-9) best = o;
      }
      if (best) return best;
    }
    return niceScale1(min, max, count, fixLo, fixHi);
  }
  function niceScale1(min, max, count, fixLo, fixHi) {
    const step = niceStep((max - min) / Math.max(1, count));
    const lo = fixLo != null ? fixLo : Math.floor(min / step + 1e-9) * step;
    const hi = fixHi != null ? fixHi : Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return { lo, hi: hi === lo ? lo + step : hi, step, ticks };
  }

  /* ---------- tempo (rótulos pt-BR) ---------- */
  const WD = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const MON = (d) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const HM = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const HMS = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const T_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, DAY, 2 * DAY, 7 * DAY, 14 * DAY];

  function agoText(d, prefix) {
    d = Math.max(0, Math.round(d));
    if (d < 3) return 'agora';
    const p = prefix ? 'há ' : '−';
    if (d < 60) return `${p}${d} s`;
    if (d < 3600) {
      /* 90 s vira "1,5 min" (antes arredondava pra "2 min" e repetia o rótulo vizinho) */
      const m = d / 60;
      const inteiro = Math.abs(m - Math.round(m)) < 0.05;
      return `${p}${inteiro || m >= 10 ? Math.round(m) : fmtNum(m, 1)} min`;
    }
    const h = d / 3600;
    return `${p}${fmtNum(h, h < 10 && Math.abs(h - Math.round(h)) > 0.05 ? 1 : 0)} h`;
  }

  function timeLabel(t, step, span, first) {
    const d = new Date(t * 1000);
    if (step >= 28 * DAY) {
      const m = MON(d);
      return d.getMonth() === 0 || (first && span > 300 * DAY) ? `${m} ${d.getFullYear()}` : m;
    }
    const midnight = d.getHours() === 0 && d.getMinutes() === 0;
    if (step >= DAY || (midnight && step >= 3600)) return span <= 8.5 * DAY ? `${WD(d)} ${d.getDate()}` : `${d.getDate()} ${MON(d)}`;
    if (step < 60) return HMS(d);
    return HM(d);
  }

  function timeTicks(lo, hi, maxN, ago) {
    const span = hi - lo;
    const out = [];
    let step = T_STEPS.find((s) => span / s <= maxN);
    if (ago) {
      step = step || 30 * DAY;
      for (let t = hi; t >= lo - 1e-6; t -= step) out.unshift({ v: t, label: agoText(hi - t) });
      return out;
    }
    if (step && step < DAY) {
      const off = -new Date(lo * 1000).getTimezoneOffset() * 60;
      for (let t = Math.ceil((lo + off) / step) * step - off; t <= hi + 1e-6; t += step) out.push({ v: t });
    } else if (step) {
      const d = new Date(lo * 1000); d.setHours(0, 0, 0, 0);
      if (d.getTime() / 1000 < lo - 1e-6) d.setDate(d.getDate() + 1);
      const nd = Math.round(step / DAY);
      while (d.getTime() / 1000 <= hi + 1e-6) { out.push({ v: d.getTime() / 1000 }); d.setDate(d.getDate() + nd); }
    } else {
      const months = [1, 2, 3, 6, 12, 24, 60].find((m) => span / (m * 30.44 * DAY) <= maxN) || 120;
      step = months * 30.44 * DAY;
      const d = new Date(lo * 1000); d.setHours(0, 0, 0, 0); d.setDate(1);
      if (d.getTime() / 1000 < lo - 1e-6) d.setMonth(d.getMonth() + 1);
      if (months > 1) while (d.getMonth() % Math.min(months, 12) !== 0) d.setMonth(d.getMonth() + 1);
      while (d.getTime() / 1000 <= hi + 1e-6) { out.push({ v: d.getTime() / 1000 }); d.setMonth(d.getMonth() + months); }
    }
    out.forEach((o, i) => { o.label = timeLabel(o.v, step, span, i === 0); });
    return out;
  }

  /** título padrão da dica pra eixo de tempo */
  function tipTime(t, medianDx, span, ago, xhi) {
    if (ago) return agoText(xhi - t, true);
    const d = new Date(t * 1000);
    const date = `${WD(d)}, ${d.getDate()} ${MON(d)}`;
    if (medianDx >= DAY * 0.9) return date;
    if (span > DAY * 0.9 || medianDx == null) return `${date} · ${HM(d)}`;
    if (medianDx < 60) return HMS(d);
    return HM(d);
  }

  /** junta itens seguidos que passam no teste em faixas {from, to, label} (ex.: "na tomada"). */
  C.runs = function (list, test, o) {
    o = o || {};
    const key = o.x || 't';
    const gap = o.gap != null ? o.gap : Infinity;
    const out = [];
    let cur = null;
    const arr = (list || []).filter((p) => p && isNum(p[key]));
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const next = arr[i + 1];
      const on = !!test(p, i);
      if (cur && (!on || p[key] - cur.to > gap)) { out.push(cur); cur = null; }
      if (on) {
        if (!cur) cur = { from: p[key], to: p[key], label: o.label || '', color: o.color };
        cur.to = next && next[key] - p[key] <= gap ? next[key] : p[key];
      }
    }
    if (cur) out.push(cur);
    return out.filter((b) => b.to > b.from || o.keepPoints);
  };

  /* ================= casca comum ================= */

  function mount(el, kind) {
    el = asEl(el);
    if (el._kc && el._kc.destroy) { try { el._kc.destroy(); } catch (e) { /* já foi */ } }
    el.textContent = '';
    el.classList.add('kc', 'kc-t-' + kind);
    const h = {
      el, width: 0, first: true, dead: false, render: null,
      clear() { el.textContent = ''; h.untip(); },
      /* dica flutuante só deste gráfico (não apaga a dica de outro) */
      tip(x, y, title, rows) { h.tipOn = true; K.tooltip.show(x, y, title, rows); },
      untip() { if (h.tipOn) { h.tipOn = false; if (K.tooltip) K.tooltip.hide(); } },
      onLeave: null,
      empty(msg, mini) {
        el.appendChild(K.el('div', { class: 'empty kc-empty' + (mini ? ' kc-mini' : '') }, msg));
      },
      rerender() { if (!h.dead && h.render) { h.render(); if (el.childNodes.length) h.first = false; } },
      destroy() {
        if (h.dead) return;
        h.dead = true;
        ro.disconnect();
        if (h.onDestroy) h.onDestroy();
        h.untip();
        el.removeEventListener('pointerleave', onLeave);
        el.textContent = '';
        el.classList.remove('kc', 'kc-t-' + kind);
        delete el._kc;
      },
    };
    /* saiu do gráfico inteiro: some com a dica mesmo que o SVG tenha sido trocado no meio */
    const onLeave = () => { if (h.onLeave) h.onLeave(); else h.untip(); };
    el.addEventListener('pointerleave', onLeave);
    const ro = new ResizeObserver(() => {
      if (h.dead) return;
      if (!el.isConnected) return;
      const w = Math.floor(el.clientWidth);
      if (w > 0 && w !== h.width) { h.width = w; h.rerender(); }
    });
    ro.observe(el);
    h.width = Math.floor(el.clientWidth);
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => { fontFam = null; h.rerender(); });
    }
    return h;
  }

  function api(h, opts, extra) {
    const o = {
      el: h.el,
      update(novas) { if (novas) Object.assign(opts, novas); h.rerender(); return o; },
      destroy() { h.destroy(); },
    };
    if (extra) Object.assign(o, extra);
    h.el._kc = o;
    return o;
  }

  /** rodapé: legenda (esquerda) + botão "ver números" (direita) + tabela */
  function footer(h, legendItems, tableModel, st) {
    const hasLegend = legendItems && legendItems.length;
    if (!hasLegend && !tableModel) return;
    const foot = K.el('div', { class: 'kc-foot' });
    if (hasLegend) {
      const lg = K.el('div', { class: 'legend kc-legend' });
      for (const it of legendItems) lg.appendChild(legendItem(it));
      foot.appendChild(lg);
    } else foot.appendChild(K.el('span'));
    let box = null;
    if (tableModel) {
      const btn = K.el('button', { class: 'btn small ghost kc-tbtn', type: 'button', 'aria-expanded': String(!!st.open) });
      const paint = () => {
        btn.innerHTML = K.icon('table');
        btn.appendChild(document.createTextNode(st.open ? 'Esconder números' : 'Ver números'));
        btn.setAttribute('aria-expanded', String(!!st.open));
      };
      paint();
      btn.addEventListener('click', () => {
        st.open = !st.open;
        st.rows = TABLE_STEP;
        paint();
        drawTable(box, tableModel, st);
      });
      foot.appendChild(btn);
    }
    h.el.appendChild(foot);
    if (tableModel) {
      box = K.el('div', { class: 'kc-table' });
      h.el.appendChild(box);
      drawTable(box, tableModel, st);
    }
  }

  function legendItem(it) {
    const key = K.el('i', { class: 'kc-key kc-key-' + (it.kind || 'area') });
    const c = it.color;
    if (it.kind === 'line') key.style.background = c;
    else if (it.kind === 'dash') key.style.backgroundImage = `repeating-linear-gradient(90deg, ${c} 0 6px, transparent 6px 10px)`;
    else if (it.kind === 'dots') key.style.backgroundImage = `repeating-linear-gradient(90deg, ${c} 0 2px, transparent 2px 6px)`;
    else if (it.kind === 'area') { key.style.background = rgba(c, 0.18); key.style.borderTopColor = c; }
    else key.style.background = c;
    const s = K.el('span', { class: 'kc-li' }, key, K.el('span', null, it.name));
    if (it.value != null) s.appendChild(K.el('b', { class: 'kc-li-v' }, it.value));
    return s;
  }

  function drawTable(box, model, st) {
    box.textContent = '';
    if (!st.open) { box.hidden = true; return; }
    box.hidden = false;
    const m = typeof model === 'function' ? model() : model;
    const t = K.el('table', { class: 'table kc-tbl' });
    const trh = K.el('tr');
    m.head.forEach((hd, i) => trh.appendChild(K.el('th', { class: i && m.numeric !== false ? 'r' : null, scope: 'col' }, hd)));
    t.appendChild(K.el('thead', null, trh));
    const tb = K.el('tbody');
    const rows = m.rows.slice(0, st.rows);
    for (const r of rows) {
      const tr = K.el('tr');
      r.forEach((c, i) => tr.appendChild(K.el('td', { class: i && m.numeric !== false ? 'r' : null }, c == null ? '—' : c)));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    box.appendChild(t);
    if (m.rows.length > st.rows) {
      const falta = m.rows.length - st.rows;
      const more = K.el('div', { class: 'kc-more' },
        K.el('span', { class: 'muted' }, `Mostrando ${fmtNum(st.rows, 0)} de ${fmtNum(m.rows.length, 0)}${m.order ? ' · ' + m.order : ''}`),
        K.el('button', {
          class: 'btn small', type: 'button',
          onclick: () => { st.rows += Math.max(TABLE_STEP, Math.min(100, falta)); drawTable(box, model, st); },
        }, `Mostrar mais ${fmtNum(Math.min(falta, Math.max(TABLE_STEP, Math.min(100, falta))), 0)}`));
      box.appendChild(more);
    } else if (m.note) {
      box.appendChild(K.el('div', { class: 'kc-more muted' }, m.note));
    }
  }

  function rough1(svg) { return rough.svg(svg); }
  const RL = (o) => Object.assign({ roughness: 0.6, bowing: 0.5, seed: SEED, disableMultiStroke: true, preserveVertices: true }, o);

  /* =========================================================
     Linha e área: K.charts.line(el, opts) / K.charts.area(el, opts)
     ========================================================= */

  function normSeries(opts, kind) {
    const raw = opts.series || (opts.points ? [{ name: opts.name, points: opts.points, color: opts.color, format: opts.seriesFormat }] : []);
    let prevColor = null;
    let solidIdx = 0;
    return raw.filter(Boolean).map((s, i) => {
      const dash = !!s.dash;
      let c = s.color;
      if (!c) c = dash && prevColor ? prevColor : C.palette[Math.min(solidIdx, C.palette.length - 1)];
      if (!dash) solidIdx++;
      const color = col(c);
      prevColor = c;
      const points = (s.points || [])
        .filter((p) => p && isNum(+p.x))
        .map((p) => ({ x: +p.x, y: p.y == null || !isFinite(p.y) ? null : +p.y, raw: p }))
        .sort((a, b) => a.x - b.x);
      const byX = new Map();
      for (const p of points) if (p.y != null) byX.set(p.x, p);
      return {
        name: s.name || (i === 0 ? '' : `Série ${i + 1}`),
        color, dash, points, byX,
        area: s.area != null ? !!s.area : (kind === 'area' && !dash),
        width: s.width || 2.5,
        format: s.format || null,
        endLabel: s.endLabel != null ? s.endLabel : (i === 0 && !dash),
        dots: !!s.dots,
      };
    });
  }

  /** quebra a série em trechos: y null = buraco explícito; distância > gap = buraco (Mac dormindo).
      Cada trecho sabe se veio depois de um buraco por distância (seg.afterGap). */
  function splitSegments(points, gap) {
    const segs = [];
    let cur = [];
    let prev = null;
    let byGap = false;
    const push = () => { if (cur.length) { cur.afterGap = byGap; segs.push(cur); } cur = []; };
    for (const p of points) {
      if (p.y == null) { push(); prev = null; byGap = false; continue; }
      if (prev && p.x - prev.x > gap) { push(); byGap = true; }
      else if (!cur.length && !prev) byGap = false;
      cur.push(p);
      prev = p;
    }
    push();
    return segs;
  }

  function autoGap(points, mdx) {
    return points.length >= 8 && mdx ? mdx * 6 : Infinity;
  }

  function medianDx(points) {
    const d = [];
    for (let i = 1; i < points.length; i++) { const v = points[i].x - points[i - 1].x; if (v > 0) d.push(v); }
    if (!d.length) return null;
    d.sort((a, b) => a - b);
    return d[Math.floor(d.length / 2)];
  }

  function xy(kind, el, opts0) {
    const h = mount(el, kind);
    const opts = Object.assign({}, opts0);
    const st = { open: false, rows: TABLE_STEP };
    let hover = null;
    let raf = 0;
    let safety = 0;

    h.onDestroy = () => { cancelAnimationFrame(raf); clearTimeout(safety); };

    h.render = function () {
      const W = h.width;
      if (!W) return;
      h.clear();
      const series = normSeries(opts, kind);
      const pts = [];
      for (const s of series) for (const p of s.points) if (p.y != null) pts.push(p);
      if (!pts.length) { hover = null; h.empty(opts.empty || 'Ainda não há dados pra mostrar aqui.'); return; }

      const H = opts.height || 220;
      const first = series.find((s) => s.points.length) || series[0];
      const mdx = medianDx(first.points);
      const isTime = opts.xType ? opts.xType === 'time' : pts[0].x > 1e8;
      const ago = opts.xFormat === 'ago';

      /* ---- domínio X ---- */
      let xlo = Infinity, xhi = -Infinity;
      for (const p of pts) { if (p.x < xlo) xlo = p.x; if (p.x > xhi) xhi = p.x; }
      if (opts.xMin != null) xlo = +opts.xMin;
      if (opts.xMax != null) xhi = +opts.xMax;
      if (!(xhi > xlo)) { const pad = isTime ? 3 * DAY : 1; xlo -= pad; xhi += pad; }
      const span = xhi - xlo;

      /* ---- domínio Y ---- */
      const refs = (opts.refs || []).filter((r) => r && isNum(r.y));
      let ylo = Infinity, yhi = -Infinity;
      for (const p of pts) { if (p.x < xlo || p.x > xhi) continue; if (p.y < ylo) ylo = p.y; if (p.y > yhi) yhi = p.y; }
      if (!isFinite(ylo)) { ylo = 0; yhi = 1; }
      for (const r of refs) if (r.inDomain !== false) { ylo = Math.min(ylo, r.y); yhi = Math.max(yhi, r.y); }
      const yZero = opts.yZero != null ? opts.yZero : kind === 'area';
      if (yZero) { ylo = Math.min(ylo, 0); yhi = Math.max(yhi, 0); }
      {
        /* folga de 6% pra linha não encostar na borda (sem inventar negativo) */
        const pad = (yhi - ylo) * 0.06;
        if (pad > 0) {
          if (!(yZero && ylo === 0)) ylo = ylo >= 0 && ylo - pad < 0 ? 0 : ylo - pad;
          if (!(yZero && yhi === 0)) yhi = yhi <= 0 && yhi + pad > 0 ? 0 : yhi + pad;
        }
      }
      const nT = opts.yTicks || clamp(Math.round((H - 50) / 44), 2, 6);
      const ys = niceScale(ylo, yhi, nT, opts.yMin, opts.yMax);
      ylo = ys.lo; yhi = ys.hi;
      const dec = decimalsOf(ys.step);
      const yFmt = opts.yFormat || ((v) => fmtNum(v, dec));
      const tipFmt = opts.tipFormat || opts.yFormat || ((v) => fmtNum(v, Math.max(1, dec)));

      /* ---- margens ---- */
      const FS = 12;
      const yLabels = ys.ticks.map((t) => yFmt(t));
      const padL = Math.ceil(Math.max(20, ...yLabels.map((s) => textW(s, FS)))) + 12;
      const padT = 14;
      /* faixas como fita abaixo do eixo (bandStyle: 'track'): o fundo do gráfico fica limpo */
      const bandTrack = opts.bandStyle === 'track';
      const TRACK = { top: 8, h: 9 };
      const padB = 30 + (bandTrack ? TRACK.top + TRACK.h - 2 : 0);
      const ends = [];
      for (const s of series) {
        if (!s.endLabel) continue;
        let last = null;
        for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i].y != null && s.points[i].x <= xhi) { last = s.points[i]; break; }
        if (!last) continue;
        const txt = typeof s.endLabel === 'string' ? s.endLabel
          : typeof s.endLabel === 'function' ? s.endLabel(last.y, last.raw)
            : (s.format || tipFmt)(last.y, last.raw);
        ends.push({ s, p: last, txt, w: textW(txt, 13) });
      }
      let padR = 12;
      const plotW0 = W - padL - padR;
      for (const e of ends) {
        const frac = (e.p.x - xlo) / span;
        const need = 12 + e.w + 4 - (1 - frac) * plotW0;
        /* rótulo comprido demais pra margem: vai por cima do ponto, sem roubar largura */
        if (need > W * 0.2) { e.inside = true; padR = Math.max(padR, 10); continue; }
        if (need > padR) padR = Math.ceil(need);
      }
      const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
      const pw = Math.max(10, x1 - x0), ph = Math.max(10, y1 - y0);
      const sx = (x) => x0 + ((x - xlo) / span) * pw;
      const sy = (y) => y1 - ((y - ylo) / (yhi - ylo)) * ph;
      const ix = (px) => xlo + ((px - x0) / pw) * span;

      /* ---- SVG ---- */
      const id = ++uid;
      const svg = sv('svg', {
        class: 'kc-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0,
        'aria-label': opts.ariaLabel || opts.title || series.map((s) => s.name).filter(Boolean).join(', ') || 'Gráfico',
      });
      const rs = rough1(svg);
      const ink = col('--ink');
      const ink2 = col('--ink-2');

      /* faixas de fundo */
      const bands = (opts.bands || []).filter((b) => b && isNum(b.from) && isNum(b.to));
      const gB = sv('g', { class: 'kc-bands' }, svg);
      for (const b of bands) {
        const a = Math.max(b.from, xlo), z = Math.min(b.to, xhi);
        if (z <= a) continue;
        const r = bandTrack
          ? sv('rect', { x: r1(sx(a)), y: y1 + TRACK.top, width: Math.max(3, r1(sx(z) - sx(a))), height: TRACK.h, rx: 4, class: 'kc-band kc-band-track' }, gB)
          : sv('rect', { x: r1(sx(a)), y: y0, width: Math.max(1.5, r1(sx(z) - sx(a))), height: ph, class: 'kc-band' }, gB);
        if (b.color) r.style.fill = col(b.color);
      }
      const xLabelY = y1 + 19 + (bandTrack ? TRACK.top + TRACK.h - 2 : 0);

      /* grade e eixo Y */
      const gG = sv('g', { class: 'kc-grid' }, svg);
      for (const t of ys.ticks) {
        const y = sy(t);
        if (Math.abs(y - y1) > 1) sv('line', { x1: x0, x2: x1, y1: crisp(y), y2: crisp(y), class: 'kc-gridline' }, gG);
        stext(gG, x0 - 8, y + 4, yFmt(t), 'kc-tick', 'end');
      }

      /* eixo X */
      const maxN = Math.max(2, Math.floor(pw / (isTime ? (span < 600 ? 84 : 74) : 64)));
      let xt;
      if (isTime) xt = timeTicks(xlo, xhi, maxN, ago);
      else {
        const n = niceScale(xlo, xhi, maxN, null, null);
        xt = n.ticks.filter((v) => v >= xlo - 1e-9 && v <= xhi + 1e-9).map((v) => ({ v, label: fmtNum(v, decimalsOf(n.step)) }));
      }
      if (typeof opts.xFormat === 'function') xt.forEach((t) => { t.label = opts.xFormat(t.v); });
      for (const t of xt) { t.px = sx(t.v); t.w = textW(t.label, FS); }
      for (let guard = 0; guard < 5; guard++) {
        let clash = false;
        for (let i = 1; i < xt.length; i++) if (xt[i].px - xt[i].w / 2 < xt[i - 1].px + xt[i - 1].w / 2 + 10) { clash = true; break; }
        if (!clash) break;
        xt = xt.filter((_, i) => i % 2 === 0);
      }
      const gX = sv('g', { class: 'kc-xaxis' }, svg);
      for (const t of xt) {
        if (t.px < x0 - 1 || t.px > x1 + 1) continue;
        sv('line', { x1: crisp(t.px), x2: crisp(t.px), y1: y1, y2: y1 + 5, class: 'kc-xtick' }, gX);
        const lx = clamp(t.px, t.w / 2 + 2, W - t.w / 2 - 2);
        stext(gX, lx, xLabelY, t.label, 'kc-tick', 'middle');
      }

      /* linha do zero (valores negativos) */
      if (ylo < 0 && yhi > 0) {
        const yz = sy(0);
        sv('line', { x1: x0, x2: x1, y1: crisp(yz), y2: crisp(yz), class: 'kc-zero' }, svg);

      }

      /* linha de base (traço à mão) */
      const base = rs.line(x0 - 2, y1, x1 + 2, y1, { stroke: ink, strokeWidth: 2, roughness: 0.7, bowing: 0.4, seed: SEED });
      base.setAttribute('class', 'kc-base');
      svg.appendChild(base);

      /* linhas de referência */
      const gR = sv('g', { class: 'kc-refs' }, svg);
      for (const r of refs) {
        if (r.y < ylo || r.y > yhi) continue;
        const y = sy(r.y);
        const c = r.color ? col(r.color) : r.tone ? col(r.tone) : ink2;
        const g = rs.line(x0, y, x1, y, RL({ stroke: c, strokeWidth: 1.7, strokeLineDash: [7, 6], roughness: 0.4 }));
        g.setAttribute('class', 'kc-ref');
        gR.appendChild(g);
      }

      /* dados (recortados na área do gráfico) */
      const clipId = 'kc-clip-' + id;
      const clipRect = sv('rect', { x: x0 - 6, y: y0 - 8, width: pw + 12 + padR, height: ph + 10 }, sv('clipPath', { id: clipId }, sv('defs', null, svg)));
      const gD = sv('g', { class: 'kc-data', 'clip-path': `url(#${clipId})` }, svg);
      const yb = sy(clamp(0, ylo, yhi));
      const gapStyle = opts.gapStyle || 'dots';
      let hasGap = false;

      for (const s of series) {
        const gap = opts.gap === false ? Infinity : opts.gap != null ? +opts.gap : autoGap(s.points, medianDx(s.points));
        const segs = splitSegments(s.points, gap);
        /* buraco por distância (ex.: Mac dormindo): ligação pontilhada fininha, sem área */
        if (gapStyle === 'dots') {
          for (let k = 1; k < segs.length; k++) {
            if (!segs[k].afterGap) continue;
            const a = segs[k - 1][segs[k - 1].length - 1], b = segs[k][0];
            const l = sv('line', { x1: r1(sx(a.x)), y1: r1(sy(a.y)), x2: r1(sx(b.x)), y2: r1(sy(b.y)), class: 'kc-gapline' }, gD);
            l.style.stroke = s.color;
            hasGap = true;
          }
        }
        if (s.area) {
          for (const seg of segs) {
            if (seg.length < 2) continue;
            let d = `M${r1(sx(seg[0].x))},${r1(yb)}`;
            for (const p of seg) d += `L${r1(sx(p.x))},${r1(sy(p.y))}`;
            d += `L${r1(sx(seg[seg.length - 1].x))},${r1(yb)}Z`;
            const a = sv('path', { d, class: 'kc-fill' }, gD);
            a.style.fill = s.color;
          }
        }
        for (const seg of segs) {
          if (seg.length === 1) {
            const c = sv('circle', { cx: r1(sx(seg[0].x)), cy: r1(sy(seg[0].y)), r: segs.length > 1 && gapStyle === 'dots' ? 2.4 : 3.2, class: 'kc-lone' }, gD);
            c.style.fill = s.color;
            continue;
          }
          const g = rs.linearPath(seg.map((p) => [sx(p.x), sy(p.y)]), RL({
            stroke: s.color, strokeWidth: s.width, strokeLineDash: s.dash ? [8, 6] : undefined,
            roughness: seg.length > 200 ? 0.45 : 0.6,
          }));
          g.setAttribute('class', 'kc-line' + (s.dash ? ' kc-dash' : ''));
          gD.appendChild(g);
          if (s.dots) for (const p of seg) {
            const c = sv('circle', { cx: r1(sx(p.x)), cy: r1(sy(p.y)), r: 3.5, class: 'kc-pt' }, gD);
            c.style.fill = s.color;
          }
        }
      }

      /* posição dos rótulos do último ponto (antes, pra ninguém trombar com eles) */
      const boxes = [];
      for (const e of ends) {
        const px = sx(e.p.x), py = sy(e.p.y);
        let ty = clamp(py + 4.5, y0 + 9, y1 - 3);
        let tx = px + 10, anchor = 'start';
        if (e.inside || tx + e.w > W - 2) {
          tx = px - 4; anchor = 'end';
          ty = py - 12 < y0 + 8 ? py + 22 : py - 12;
          if (tx - e.w < x0) { tx = Math.max(x0 + 2, px - e.w / 2); anchor = 'start'; }
        }
        Object.assign(e, { px, py, tx, ty, anchor });
        const lx = anchor === 'end' ? tx - e.w : tx;
        boxes.push({ a: lx - 4, b: lx + e.w + 4, t: ty - 13, u: ty + 4 });
        boxes.push({ a: px - 7, b: px + 7, t: py - 7, u: py + 7 });
      }
      const hit = (bx) => boxes.some((o) => bx.a < o.b && bx.b > o.a && bx.t < o.u && bx.u > o.t);

      /* rótulos das linhas de referência, por cima dos dados (com halo) */
      for (const r of refs) {
        if (r.y < ylo || r.y > yhi) continue;
        const y = sy(r.y);
        const full = r.label != null ? r.label : yFmt(r.y);
        if (!full) continue;
        const short = r.short || yFmt(r.y);
        const right = r.align === 'right';
        const cands = [];
        for (const lbl of full === short ? [full] : [full, short]) {
          if (textW(lbl, 12) > pw - 24) continue;
          if (y - y0 >= 16) cands.push({ lbl, ty: y - 7 });
          if (y1 - y >= 18) cands.push({ lbl, ty: y + 16 });
        }
        let pick = null;
        for (const c of cands) {
          const w = textW(c.lbl, 12);
          const lx = right ? x1 - 6 - w : x0 + 8;
          if (!hit({ a: lx, b: lx + w, t: c.ty - 12, u: c.ty + 3 })) { pick = c; break; }
        }
        if (!pick) pick = cands[cands.length - 1] || { lbl: short, ty: y - 7 };
        const t = stext(svg, right ? x1 - 6 : x0 + 8, pick.ty, pick.lbl, 'kc-ref-label', right ? 'end' : null);
        const w = textW(pick.lbl, 12), lx = right ? x1 - 6 - w : x0 + 8;
        boxes.push({ a: lx, b: lx + w, t: pick.ty - 12, u: pick.ty + 3 });
        if (r.title) t.appendChild(sv('title')).textContent = r.title;
      }

      /* sentido dos valores (acima/abaixo do zero), por cima dos dados com halo */
      if (opts.signs && ylo < 0 && yhi > 0) {
        const [pos, neg] = opts.signs;
        if (pos && sy(0) - y0 > 24) stext(svg, x0 + 8, y0 + 12, '↑ ' + pos, 'kc-sign');
        if (neg && y1 - sy(0) > 24) stext(svg, x0 + 8, y1 - 8, '↓ ' + neg, 'kc-sign');
      }

      /* rótulo do último ponto */
      const gE = sv('g', { class: 'kc-ends' }, svg);
      for (const e of ends) {
        const dot = sv('circle', { cx: r1(e.px), cy: r1(e.py), r: 5, class: 'kc-end-dot' + (e.s.dash ? ' hollow' : '') }, gE);
        if (!e.s.dash) dot.style.fill = e.s.color; else dot.style.stroke = e.s.color;
        stext(gE, e.tx, e.ty, e.txt, 'kc-end-label', e.anchor);
      }

      /* ---- camada de dica (crosshair) ---- */
      const xs = Array.from(new Set(pts.filter((p) => p.x >= xlo && p.x <= xhi).map((p) => p.x))).sort((a, b) => a - b);
      const gH = sv('g', { class: 'kc-hover', visibility: 'hidden' }, svg);
      const cross = sv('line', { y1: y0, y2: y1, class: 'kc-cross' }, gH);
      const dots = series.map((s) => { const c = sv('circle', { r: 5.5, class: 'kc-hdot' }, gH); c.style.fill = s.color; return c; });
      sv('rect', { x: x0 - 8, y: 0, width: pw + 16, height: H, class: 'kc-hit' }, svg);

      function nearest(v) {
        let a = 0, b = xs.length - 1;
        while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] < v) a = m; else b = m; }
        return Math.abs(xs[a] - v) <= Math.abs(xs[b] - v) ? a : b;
      }
      const defaultTitle = (x) => (isTime ? tipTime(x, mdx, span, ago, xhi) : fmtNum(x, decimalsOf(niceStep(span / 5))));
      const titleOf = opts.tipTitle || defaultTitle;

      function showAt(i) {
        if (!xs.length) return;
        i = clamp(i, 0, xs.length - 1);
        const xv = xs[i];
        hover = xv;
        const px = sx(xv);
        cross.setAttribute('x1', r1(px)); cross.setAttribute('x2', r1(px));
        let top = Infinity;
        const rows = [];
        const hits = [];
        series.forEach((s, k) => {
          const p = s.byX.get(xv);
          if (!p) { dots[k].setAttribute('visibility', 'hidden'); return; }
          const py = sy(p.y);
          dots[k].setAttribute('visibility', 'visible');
          dots[k].setAttribute('cx', r1(px)); dots[k].setAttribute('cy', r1(py));
          top = Math.min(top, py);
          rows.push({ value: (s.format || tipFmt)(p.y, p.raw), name: s.name, color: s.color });
          hits.push({ series: s.name, x: p.x, y: p.y, raw: p.raw });
        });
        const band = bands.find((b) => xv >= b.from && xv <= b.to);
        let title = titleOf(xv);
        if (band && band.label) title += ' · ' + band.label;
        let out = { title, rows };
        if (opts.tooltip) { const o = opts.tooltip(xv, hits, out); if (o) out = Object.assign(out, o); }
        gH.setAttribute('visibility', 'visible');
        const r = svg.getBoundingClientRect();
        h.tip(r.left + px, r.top + (isFinite(top) ? top : y0 + ph / 2), out.title, out.rows);
        if (opts.onHover) opts.onHover(xv, hits);
      }
      function hide() {
        hover = null;
        gH.setAttribute('visibility', 'hidden');
        h.untip();
        if (opts.onHover) opts.onHover(null, []);
      }
      h.onLeave = hide;
      svg.addEventListener('pointermove', (ev) => {
        const r = svg.getBoundingClientRect();
        showAt(nearest(ix(ev.clientX - r.left)));
      });
      svg.addEventListener('pointerleave', hide);
      svg.addEventListener('focus', () => showAt(hover != null ? nearest(hover) : xs.length - 1));
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', (ev) => {
        const i = hover != null ? nearest(hover) : xs.length - 1;
        const jump = ev.shiftKey ? Math.max(1, Math.round(xs.length / 10)) : 1;
        if (ev.key === 'ArrowLeft') { showAt(i - jump); ev.preventDefault(); }
        else if (ev.key === 'ArrowRight') { showAt(i + jump); ev.preventDefault(); }
        else if (ev.key === 'Home') { showAt(0); ev.preventDefault(); }
        else if (ev.key === 'End') { showAt(xs.length - 1); ev.preventDefault(); }
        else if (ev.key === 'Escape') hide();
      });

      const plot = K.el('div', { class: 'kc-plot', style: { height: H + 'px' } });
      plot.appendChild(svg);
      h.el.appendChild(plot);
      if (hover != null && xs.length) showAt(nearest(hover));

      /* entrada: revela da esquerda pra direita só no primeiro desenho */
      if (h.first && !calm()) {
        const full = pw + 12 + padR;
        clipRect.setAttribute('width', 0);
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 750);
          clipRect.setAttribute('width', full * (1 - Math.pow(1 - k, 3)));
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        /* janela escondida não roda rAF: garante o gráfico inteiro mesmo assim */
        clearTimeout(safety);
        safety = setTimeout(() => { cancelAnimationFrame(raf); clipRect.setAttribute('width', full); }, 900);
      }

      /* ---- legenda + tabela ---- */
      const legendOn = opts.legend != null ? !!opts.legend : (series.length > 1 || bands.some((b) => b.label));
      const legend = [];
      if (legendOn) {
        for (const s of series) if (s.name) legend.push({ name: s.name, color: s.color, kind: s.dash ? 'dash' : s.area ? 'area' : 'line' });
        const seen = new Set();
        for (const b of bands) {
          if (!b.label || seen.has(b.label)) continue;
          seen.add(b.label);
          legend.push({ name: b.label, color: b.color ? col(b.color) : col(bandTrack ? '--gold' : '--kc-band'), kind: bandTrack ? 'track' : 'band' });
        }
        if (hasGap && opts.gapLabel) legend.push({ name: opts.gapLabel, color: series[0].color, kind: 'dots' });
        for (const r of refs) if (r.legend) legend.push({ name: r.legend, color: r.color ? col(r.color) : r.tone ? col(r.tone) : ink2, kind: 'dash' });
      }
      let model = null;
      if (opts.table !== false) {
        const to = typeof opts.table === 'object' ? opts.table : {};
        model = () => {
          if (to.rows) return to.rows();
          const order = to.order || (isTime ? 'desc' : 'asc');
          const list = order === 'desc' ? xs.slice().reverse() : xs;
          const head = [to.xLabel || (isTime ? 'Quando' : 'x')].concat(series.map((s) => s.name || 'Valor'));
          if (bands.some((b) => b.label)) head.push(to.bandLabel || 'Situação');
          const hasBands = head.length > series.length + 1;
          const rows = list.map((xv) => {
            const row = [(to.xFormat || titleOf)(xv)];
            for (const s of series) { const p = s.byX.get(xv); row.push(p ? (s.format || tipFmt)(p.y, p.raw) : null); }
            if (hasBands) { const b = bands.find((bb) => xv >= bb.from && xv <= bb.to); row.push(b ? b.label : '—'); }
            return row;
          });
          return { head, rows, order: order === 'desc' ? 'mais recentes primeiro' : '' };
        };
      }
      footer(h, legend, model, st);
    };

    h.rerender();
    return api(h, opts);
  }

  C.line = (el, opts) => xy('line', el, opts);
  C.area = (el, opts) => xy('area', el, opts);

  /* =========================================================
     Barras horizontais: K.charts.bars(el, {items, format, ...})
     ========================================================= */

  function barPath(x, y, w, t, r) {
    r = Math.min(r, w / 2, t / 2);
    return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + t - r}A${r},${r} 0 0 1 ${x + w - r},${y + t}H${x}Z`;
  }

  function iconBox(icon) {
    const box = K.el('span', { class: 'kb-icon' });
    if (typeof icon === 'string' && /^data:image\//.test(icon)) {
      box.appendChild(K.el('img', { src: icon, alt: '', width: 28, height: 28, draggable: 'false' }));
    } else if (typeof icon === 'string' && K.ICONS && K.ICONS[icon]) {
      box.classList.add('sym');
      box.innerHTML = K.icon(icon);
    } else {
      box.classList.add('sym');
      box.innerHTML = K.icon('apps');
    }
    return box;
  }

  C.bars = function (el, opts0) {
    const h = mount(el, 'bars');
    const opts = Object.assign({}, opts0);
    const st = { open: false, rows: TABLE_STEP };

    h.render = function () {
      const W = h.width;
      if (!W) return;
      h.clear();
      const items = (opts.items || []).filter((it) => it && isNum(+it.value)).map((it) => Object.assign({}, it, { value: +it.value }));
      if (!items.length) { h.empty(opts.empty || 'Nada pra mostrar agora.'); return; }
      const fmt = opts.format || ((v) => fmtNum(v, Math.abs(v) < 10 ? 1 : 0));
      const color = col(opts.color, 'var(--s1)');
      const max = opts.max != null ? +opts.max : Math.max(0, ...items.map((i) => i.value)) || 1;
      const total = items.reduce((a, i) => a + Math.max(0, i.value), 0);
      const hasIcon = opts.icons != null ? !!opts.icons : items.some((i) => i.icon);
      const iconW = hasIcon ? 30 : 0;
      const gap = 12;
      /* nomes: 1,4 parte; barras: 1 parte (nome comprido quebra em até 2 linhas, sem "…") */
      const avail = W - iconW - (hasIcon ? gap : 0) - gap;
      const labelW = Math.round(clamp((avail * 1.4) / 2.4, 90, opts.labelWidth || 260));
      const trackW = Math.max(40, avail - labelW);
      const valW = Math.ceil(Math.max(...items.map((i) => textW(fmt(i.value, i), 15)))) + 12;
      const barMax = Math.max(16, trackW - valW);
      const thick = Math.min(24, opts.thickness || 20);
      const twoLines = items.some((i) => textW(i.label || '', 15) > labelW - 2);
      const hasNote = items.some((i) => i.note);
      const rowH = Math.max(thick + 14, (twoLines ? 35 : 18) + (hasNote ? 16 : 0) + 8);
      const cols = `${hasIcon ? iconW + 'px ' : ''}${labelW}px ${trackW}px`;
      const ink = col('--ink');

      const list = K.el('div', { class: 'kb-list', role: 'list', 'aria-label': opts.ariaLabel || opts.title || null });
      items.forEach((it, i) => {
        const row = K.el('div', { class: 'kb-row', role: 'listitem', tabindex: 0, style: { gridTemplateColumns: cols, gap: gap + 'px', height: rowH + 'px' } });
        if (hasIcon) row.appendChild(iconBox(it.icon));
        const lab = K.el('div', { class: 'kb-label' }, K.el('span', { class: 'kb-name', title: it.label || '' }, it.label || '—'));
        if (it.note) lab.appendChild(K.el('span', { class: 'kb-note', title: it.note }, it.note));
        row.appendChild(lab);

        const track = K.el('div', { class: 'kb-track' });
        const frac = clamp(Math.max(0, it.value) / max, 0, 1);
        const bw = it.value > 0 ? Math.max(4, frac * barMax) : 0;
        const svg = sv('svg', { class: 'kb-svg', width: trackW, height: rowH, viewBox: `0 0 ${trackW} ${rowH}`, 'aria-hidden': 'true' });
        const top = (rowH - thick) / 2;
        sv('line', { x1: 1.25, x2: 1.25, y1: 0, y2: rowH, class: 'kb-base' }, svg);
        if (bw > 0) {
          const g = sv('g', { class: 'kb-bar' }, svg);
          const d = barPath(2.5, top, bw, thick, 7);
          const f = sv('path', { d, class: 'kb-fill' }, g);
          f.style.fill = it.color ? col(it.color) : color;
          const o = rough1(svg).path(d, { stroke: ink, strokeWidth: 2.4, roughness: 0.5, bowing: 0.3, seed: SEED + i, fill: 'none', disableMultiStroke: true });
          o.setAttribute('class', 'kb-outline');
          g.appendChild(o);
          if (h.first && !calm()) { g.classList.add('kb-grow'); g.style.animationDelay = i * 55 + 'ms'; }
        }
        track.appendChild(svg);
        track.appendChild(K.el('span', { class: 'kb-val', style: { left: Math.round(bw + 11) + 'px' } }, fmt(it.value, it)));
        row.appendChild(track);

        const show = () => {
          row.classList.add('hot');
          const r = svg.getBoundingClientRect();
          const rows = [{ value: fmt(it.value, it), name: opts.valueName || '', color: it.color ? col(it.color) : color }];
          if (opts.share !== false && total > 0 && items.length > 1) rows.push({ value: fmtNum((Math.max(0, it.value) / total) * 100, 0) + '%', name: opts.shareName || 'do total da lista' });
          if (it.note) rows.push({ value: '', name: it.note });
          h.tip(r.left + bw + 2, r.top + top, it.label || '', rows);
        };
        const hide = () => { row.classList.remove('hot'); h.untip(); };
        row.addEventListener('pointerenter', show);
        row.addEventListener('pointerleave', hide);
        row.addEventListener('focus', show);
        row.addEventListener('blur', hide);
        list.appendChild(row);
      });
      h.el.appendChild(list);

      const model = opts.table ? () => ({
        head: [opts.labelName || 'Nome', opts.valueName || 'Valor'].concat(items.some((i) => i.note) ? ['Detalhe'] : []),
        rows: items.map((i) => [i.label || '—', fmt(i.value, i)].concat(items.some((x) => x.note) ? [i.note || '—'] : [])),
        numeric: true,
      }) : null;
      footer(h, opts.legend || null, model, st);
    };

    h.rerender();
    return api(h, opts);
  };

  /* =========================================================
     Mostrador semicircular: K.charts.gauge(el, {value, min, max, zones, format, label})
     ========================================================= */

  function arcPt(cx, cy, r, t) {
    const a = Math.PI + t * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcD(cx, cy, r, t0, t1) {
    const [ax, ay] = arcPt(cx, cy, r, t0);
    const [bx, by] = arcPt(cx, cy, r, Math.min(t1, 0.99999));
    return `M${r1(ax)},${r1(ay)}A${r},${r} 0 0 1 ${r1(bx)},${r1(by)}`;
  }

  C.gauge = function (el, opts0) {
    const h = mount(el, 'gauge');
    const opts = Object.assign({}, opts0);
    let lastT = null;

    h.render = function () {
      if (!h.width) return;
      h.clear();
      const min = opts.min != null ? +opts.min : 0;
      const max = opts.max != null ? +opts.max : 100;
      const v = opts.value;
      const has = isNum(v);
      const fmt = opts.format || ((x) => fmtNum(x, 0) + '%');
      let zones = (opts.zones || [{ to: max, tone: 's1' }]).slice().sort((a, b) => a.to - b.to);
      let from = min;
      zones = zones.map((z) => { const o = Object.assign({}, z, { from }); from = z.to; return o; });
      const t = has ? clamp((v - min) / (max - min), 0, 1) : 0;
      const zone = has ? (zones.find((z) => v <= z.to) || zones[zones.length - 1]) : null;
      const size = opts.size || 240;

      const wrap = K.el('div', { class: 'kg', style: { maxWidth: size + 'px' } });
      const VW = 220, VH = 136, cx = 110, cy = 112, R = 96, bw = 22, rm = R - bw / 2;
      const svg = sv('svg', { class: 'kg-svg', viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': `${opts.label || 'Medidor'}: ${has ? fmt(v) : 'sem leitura'}${zone && zone.label ? ', ' + zone.label : ''}` });
      const rs = rough1(svg);
      const ink = col('--ink');

      /* faixas (zonas) em tom claro */
      for (const z of zones) {
        const a = clamp((z.from - min) / (max - min), 0, 1), b = clamp((z.to - min) / (max - min), 0, 1);
        if (b <= a) continue;
        const p = sv('path', { d: arcD(cx, cy, rm, a, b), class: 'kg-zone' }, svg);
        p.style.stroke = col(SOFT_VAR[z.tone] || z.soft || z.tone, '--panel');
        p.style.strokeWidth = bw;
      }
      /* progresso na cor forte da zona atual */
      const prog = sv('path', { d: arcD(cx, cy, rm, 0, 1), class: 'kg-prog', pathLength: 100 }, svg);
      prog.style.stroke = zone ? col(zone.tone) : 'transparent';
      prog.style.strokeWidth = bw - 10;
      if (opts.fill === false) prog.style.display = 'none';
      const startT = lastT != null ? lastT : 0;
      const instant = calm();
      prog.style.strokeDashoffset = String(100 - (instant ? t : startT) * 100);
      if (!has) prog.style.visibility = 'hidden';

      /* folga de 2px entre zonas */
      for (const z of zones.slice(0, -1)) {
        const tt = clamp((z.to - min) / (max - min), 0, 1);
        const [ax, ay] = arcPt(cx, cy, rm - bw / 2 - 1, tt), [bx, by] = arcPt(cx, cy, rm + bw / 2 + 1, tt);
        sv('line', { x1: r1(ax), y1: r1(ay), x2: r1(bx), y2: r1(by), class: 'kg-gap' }, svg);
      }
      /* contorno à mão */
      const [o0x, o0y] = arcPt(cx, cy, R, 0), [o1x, o1y] = arcPt(cx, cy, R, 0.99999);
      const ri = R - bw;
      const [i1x, i1y] = arcPt(cx, cy, ri, 0.99999), [i0x, i0y] = arcPt(cx, cy, ri, 0);
      const outline = `M${r1(o0x)},${r1(o0y)}A${R},${R} 0 0 1 ${r1(o1x)},${r1(o1y)}L${r1(i1x)},${r1(i1y)}A${ri},${ri} 0 0 0 ${r1(i0x)},${r1(i0y)}Z`;
      const og = rs.path(outline, { stroke: ink, strokeWidth: 3, roughness: 0.55, bowing: 0.4, seed: SEED, fill: 'none' });
      og.setAttribute('class', 'kg-outline');
      svg.appendChild(og);

      /* rótulos das pontas */
      const endFmt = opts.endFormat || fmt;
      stext(svg, cx - rm, cy + 16, endFmt(min), 'kg-end', 'middle');
      stext(svg, cx + rm, cy + 16, endFmt(max), 'kg-end', 'middle');

      /* ponteiro */
      const needle = sv('g', { class: 'kg-needle' }, svg);
      const L = rm + 2;
      sv('path', { d: `M${cx + 12},${cy} L${cx},${cy - 6.5} L${cx - L},${cy} L${cx},${cy + 6.5} Z`, class: 'kg-needle-body' }, needle);
      needle.style.transformOrigin = `${cx}px ${cy}px`;
      needle.style.transform = `rotate(${(instant ? t : startT) * 180}deg)`;
      if (!has) needle.style.opacity = '.25';
      sv('circle', { cx, cy, r: 10, class: 'kg-hub' }, svg);
      sv('circle', { cx: cx - 3, cy: cy - 3, r: 2.6, class: 'kg-hub-glint' }, svg);

      wrap.appendChild(svg);
      const txt = K.el('div', { class: 'kg-text' },
        K.el('div', { class: 'kg-val' }, has ? fmt(v) : '—'));
      if (opts.label) txt.appendChild(K.el('div', { class: 'kg-label' }, opts.label));
      if (zone && zone.label && opts.pill !== false) txt.appendChild(K.statusPill(zone.tone, zone.label, zone.icon));
      else if (!has && opts.empty) txt.appendChild(K.el('div', { class: 'kg-label muted' }, opts.empty));
      wrap.appendChild(txt);
      h.el.appendChild(wrap);

      if (!instant && has) {
        svg.getBoundingClientRect();
        soon(() => {
          needle.style.transform = `rotate(${t * 180}deg)`;
          prog.style.strokeDashoffset = String(100 - t * 100);
        });
      }
      lastT = has ? t : lastT;

      /* dica: explica as faixas */
      const tip = () => {
        const r = svg.getBoundingClientRect();
        const rows = [{ value: has ? fmt(v) : '—', name: opts.label || '', color: zone ? col(zone.tone) : null }];
        for (const z of zones) if (z.label) rows.push({ value: `${fmtNum(z.from, 0)}–${endFmt(z.to)}`, name: z.label, color: col(z.tone) });
        h.tip(r.left + r.width / 2, r.top + 8, opts.tipTitle || opts.label || 'Faixas', rows);
      };
      svg.addEventListener('pointerenter', tip);
      svg.addEventListener('pointerleave', () => h.untip());
    };

    h.rerender();
    return api(h, opts);
  };

  /* =========================================================
     Minilinha: K.charts.spark(el, values, opts)
     ========================================================= */

  C.spark = function (el, values, opts0) {
    const h = mount(el, 'spark');
    const opts = Object.assign({}, opts0);
    let vals = values || [];

    h.render = function () {
      const W = h.width;
      if (!W) return;
      h.clear();
      const H = opts.height || 40;
      const pts = vals.map((v, i) => (v != null && typeof v === 'object' ? { x: +v.x, y: v.y == null ? null : +v.y } : { x: i, y: v == null ? null : +v }));
      const ok = pts.filter((p) => isNum(p.y));
      if (!ok.length) { h.empty(opts.empty || 'sem dados', true); return; }
      const color = col(opts.color, 'var(--s1)');
      let lo = opts.min != null ? opts.min : Math.min(...ok.map((p) => p.y));
      let hi = opts.max != null ? opts.max : Math.max(...ok.map((p) => p.y));
      if (opts.ref != null) { lo = Math.min(lo, opts.ref); hi = Math.max(hi, opts.ref); }
      if (hi === lo) { lo -= 1; hi += 1; }
      const xlo = pts[0].x, xhi = pts[pts.length - 1].x;
      const pad = 5;
      /* um valor só: fica na ponta direita (é "o mais recente") */
      const sx = (x) => (xhi === xlo ? W - pad : pad + ((x - xlo) / (xhi - xlo)) * (W - pad * 2));
      const sy = (y) => H - pad - ((y - lo) / (hi - lo)) * (H - pad * 2);
      const svg = sv('svg', { class: 'kc-svg ksp-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.ariaLabel || 'Minigráfico' });
      const rs = rough1(svg);
      if (opts.ref != null) sv('line', { x1: 0, x2: W, y1: crisp(sy(opts.ref)), y2: crisp(sy(opts.ref)), class: 'ksp-ref' }, svg);
      const segs = splitSegments(pts, Infinity);
      for (const seg of segs) {
        if (opts.area !== false && seg.length > 1) {
          const base = sy(clamp(opts.base != null ? opts.base : lo, lo, hi));
          let d = `M${r1(sx(seg[0].x))},${r1(base)}`;
          for (const p of seg) d += `L${r1(sx(p.x))},${r1(sy(p.y))}`;
          d += `L${r1(sx(seg[seg.length - 1].x))},${r1(base)}Z`;
          const a = sv('path', { d, class: 'kc-fill' }, svg);
          a.style.fill = color;
        }
        if (seg.length > 1) {
          const g = rs.linearPath(seg.map((p) => [sx(p.x), sy(p.y)]), RL({ stroke: color, strokeWidth: opts.width || 2, roughness: 0.5 }));
          g.setAttribute('class', 'kc-line');
          svg.appendChild(g);
        }
      }
      const last = ok[ok.length - 1];
      if (opts.dot !== false) {
        const d = sv('circle', { cx: r1(sx(last.x)), cy: r1(sy(last.y)), r: 3.6, class: 'ksp-dot' }, svg);
        d.style.fill = color;
      }
      const gH = sv('g', { visibility: 'hidden' }, svg);
      const cross = sv('line', { y1: 0, y2: H, class: 'kc-cross' }, gH);
      const hd = sv('circle', { r: 4, class: 'kc-hdot' }, gH);
      hd.style.fill = color;
      const fmt = opts.format || ((v) => fmtNum(v, Math.abs(v) < 10 ? 1 : 0));
      svg.addEventListener('pointermove', (ev) => {
        const r = svg.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        let best = ok[0];
        for (const p of ok) if (Math.abs(sx(p.x) - mx) < Math.abs(sx(best.x) - mx)) best = p;
        const px = sx(best.x), py = sy(best.y);
        cross.setAttribute('x1', r1(px)); cross.setAttribute('x2', r1(px));
        hd.setAttribute('cx', r1(px)); hd.setAttribute('cy', r1(py));
        gH.setAttribute('visibility', 'visible');
        const i = pts.indexOf(best);
        const title = opts.labels ? opts.labels[i] : opts.tipTitle ? opts.tipTitle(best.x, i) : null;
        h.tip(r.left + px, r.top + py, title || '', [{ value: fmt(best.y), name: opts.name || '', color }]);
      });
      svg.addEventListener('pointerleave', () => { gH.setAttribute('visibility', 'hidden'); h.untip(); });
      h.el.appendChild(K.el('div', { class: 'kc-plot', style: { height: H + 'px' } }, svg));
    };

    h.rerender();
    const o = api(h, opts);
    o.update = function (v, more) {
      if (Array.isArray(v)) vals = v;
      else if (v && typeof v === 'object') { if (v.values) vals = v.values; more = Object.assign({}, v); delete more.values; }
      if (more) Object.assign(opts, more);
      h.rerender();
      return o;
    };
    return o;
  };

  /* =========================================================
     Barra empilhada: K.charts.stack(el, {segments, total, format})
     ========================================================= */

  C.stack = function (el, opts0) {
    const h = mount(el, 'stack');
    const opts = Object.assign({}, opts0);
    const st = { open: false, rows: TABLE_STEP };

    h.render = function () {
      const W = h.width;
      if (!W) return;
      h.clear();
      const segs = (opts.segments || []).filter((s) => s && isNum(+s.value) && +s.value > 0).map((s, i) => Object.assign({}, s, { value: +s.value, c: col(s.color || C.palette[Math.min(i, C.palette.length - 1)]) }));
      let sum = segs.reduce((a, s) => a + s.value, 0);
      if (opts.restName && isNum(+opts.total) && +opts.total - sum > +opts.total * 0.002) {
        segs.push({ name: opts.restName, value: +opts.total - sum, c: col(opts.restColor || 'var(--panel)'), note: opts.restNote });
        sum = +opts.total;
      }
      const total = opts.total != null ? Math.max(+opts.total, sum) : sum;
      if (!segs.length || !(total > 0)) { h.empty(opts.empty || 'Sem dados pra dividir aqui.'); return; }
      const fmt = opts.format || ((v) => fmtNum(v, Math.abs(v) < 10 ? 1 : 0));
      const pctOf = (v) => (v / total) * 100;
      const pctTxt = (v) => { const p = pctOf(v); return (p > 0 && p < 1 ? '<1' : fmtNum(p, 0)) + '%'; };
      const H = opts.height || 30;
      const inner = W - 6;

      const bar = K.el('div', { class: 'ks-bar', style: { height: H + 'px' }, role: 'img', 'aria-label': opts.ariaLabel || segs.map((s) => `${s.name} ${fmt(s.value)}`).join(', ') });
      const legend = K.el('div', { class: 'ks-legend' });
      let acc = 0;
      const pairs = [];
      segs.forEach((s, i) => {
        const left = (acc / total) * inner;
        let w = (s.value / total) * inner;
        const lastFull = i === segs.length - 1 && Math.abs(acc + s.value - total) < total * 1e-6;
        const gw = lastFull ? w : w - 2;
        const seg = K.el('div', { class: 'ks-seg', tabindex: 0, style: { left: r1(left) + 'px', width: Math.max(2, r1(gw)) + 'px', background: s.c } });
        if (opts.inside !== false && textW(s.name, 13) + 16 < gw && H >= 24) {
          const lbl = K.el('span', { class: 'ks-in' }, s.name);
          lbl.style.color = lum(s.c) > 0.4 ? col('--ink') : '#fff';
          seg.appendChild(lbl);
        }
        bar.appendChild(seg);
        acc += s.value;

        const sw = K.el('i', { class: 'ks-sw' });
        sw.style.background = s.c;
        const item = K.el('div', { class: 'ks-item', tabindex: -1 },
          sw,
          K.el('span', { class: 'ks-name' }, s.name),
          K.el('span', { class: 'ks-v' }, fmt(s.value)),
          K.el('span', { class: 'ks-p' }, pctTxt(s.value)));
        if (s.note) item.appendChild(K.el('span', { class: 'ks-note' }, s.note));
        legend.appendChild(item);
        pairs.push({ seg, item, s });
      });

      for (const { seg, item, s } of pairs) {
        const on = () => {
          seg.classList.add('hot'); item.classList.add('hot');
          const r = seg.getBoundingClientRect();
          const rows = [{ value: fmt(s.value), name: pctTxt(s.value) + ' do total', color: s.c }];
          if (s.note) rows.push({ value: '', name: s.note });
          h.tip(r.left + r.width / 2, r.top, s.name, rows);
        };
        const off = () => { seg.classList.remove('hot'); item.classList.remove('hot'); h.untip(); };
        for (const n of [seg, item]) {
          n.addEventListener('pointerenter', on);
          n.addEventListener('pointerleave', off);
        }
        seg.addEventListener('focus', on);
        seg.addEventListener('blur', off);
      }

      h.el.appendChild(bar);
      if (opts.scale !== false && opts.totalLabel) {
        h.el.appendChild(K.el('div', { class: 'ks-scale' }, K.el('span', null, fmt(0)), K.el('span', null, opts.totalLabel)));
      }
      if (opts.legend !== false) h.el.appendChild(legend);
      const model = opts.table ? () => ({
        head: [opts.labelName || 'Parte', opts.valueName || 'Valor', '% do total'],
        rows: segs.map((s) => [s.name, fmt(s.value), pctTxt(s.value)]).concat(total > sum ? [[opts.restName || 'Resto', fmt(total - sum), pctTxt(total - sum)]] : []),
      }) : null;
      footer(h, null, model, st);
    };

    h.rerender();
    return api(h, opts);
  };

  /* =========================================================
     Anel de progresso: K.charts.ring(el, {value, max, tone, label})
     ========================================================= */

  C.ring = function (el, opts0) {
    const h = mount(el, 'ring');
    const opts = Object.assign({}, opts0);
    let lastT = null;

    h.render = function () {
      if (!h.width) return;
      h.clear();
      const size = opts.size || 150;
      const max = opts.max != null ? +opts.max : 100;
      const v = opts.value;
      const has = isNum(v);
      const t = has ? clamp(v / (max || 1), 0, 1) : 0;
      const th = opts.thickness || 16;
      const sw = Math.max(1.6, (3 * 100) / size);
      const rm = 50 - sw / 2 - 1.5 - th / 2;
      const circ = 2 * Math.PI * rm;
      const wrap = K.el('div', { class: 'kr' + (opts.busy ? ' busy' : ''), style: { width: size + 'px', height: size + 'px' } });
      const svg = sv('svg', { class: 'kr-svg', viewBox: '0 0 100 100', role: 'img', 'aria-label': `${opts.label || 'Progresso'}: ${has ? Math.round(t * 100) + '%' : '—'}` });
      const track = sv('circle', { cx: 50, cy: 50, r: rm, class: 'kr-track' }, svg);
      track.style.strokeWidth = th;
      const prog = sv('circle', { cx: 50, cy: 50, r: rm, class: 'kr-prog', transform: 'rotate(-90 50 50)' }, svg);
      prog.style.stroke = col(opts.tone || 'gold');
      prog.style.strokeWidth = th - 6;
      prog.style.strokeDasharray = `${circ} ${circ}`;
      const instant = calm();
      const startT = lastT != null ? lastT : 0;
      prog.style.strokeDashoffset = String(circ * (1 - (instant ? t : startT)));
      if (!has || t === 0) prog.style.visibility = 'hidden';
      if (opts.busy) {
        const b = sv('circle', { cx: 50, cy: 50, r: rm, class: 'kr-spin' }, svg);
        b.style.stroke = col(opts.tone || 'gold');
        b.style.strokeWidth = th - 6;
        b.style.strokeDasharray = `${circ * 0.22} ${circ}`;
      }
      const rs = rough1(svg);
      const ink = col('--ink');
      for (const r of [rm + th / 2, rm - th / 2]) {
        const g = rs.circle(50, 50, r * 2, { stroke: ink, strokeWidth: sw, roughness: 0.45, bowing: 0.3, seed: SEED, fill: 'none' });
        g.setAttribute('class', 'kr-outline');
        svg.appendChild(g);
      }
      wrap.appendChild(svg);
      const fmt = opts.format || ((val) => fmtNum((val / (max || 1)) * 100, 0) + '%');
      const center = K.el('div', { class: 'kr-center' });
      const val = K.el('div', { class: 'kr-val', style: { fontSize: Math.round(size * (opts.label ? 0.2 : 0.24)) + 'px' } }, opts.text != null ? opts.text : has ? fmt(v) : '—');
      center.appendChild(val);
      if (opts.label && size >= 96) center.appendChild(K.el('div', { class: 'kr-label', style: { fontSize: Math.max(12, Math.round(size * 0.085)) + 'px' } }, opts.label));
      wrap.appendChild(center);
      h.el.appendChild(wrap);
      if (opts.sub) h.el.appendChild(K.el('div', { class: 'kr-sub' }, opts.sub));

      if (!instant && has) { svg.getBoundingClientRect(); soon(() => { prog.style.strokeDashoffset = String(circ * (1 - t)); }); }
      lastT = has ? t : lastT;

      svg.addEventListener('pointerenter', () => {
        const r = svg.getBoundingClientRect();
        h.tip(r.left + r.width / 2, r.top + 6, opts.label || '', [{ value: has ? fmt(v) : '—', name: opts.tipName || (has && opts.max != null && opts.maxFormat ? `de ${opts.maxFormat(max)}` : ''), color: col(opts.tone || 'gold') }]);
      });
      svg.addEventListener('pointerleave', () => h.untip());
    };

    h.rerender();
    return api(h, opts);
  };
})();
