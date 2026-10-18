/* Kamurafy — o mascote: a bateria sorridente do logo, grande e expressiva.
   Toda a animação é CSS/SVG (charts.css, seção "mascote"); o JS só troca classes.
   Desliga com prefers-reduced-motion e no modo foto (html.snap).

     const m = K.mascot(el, { size: 220 })
     m.set({ pct: 76, tone: 'good', charging: true, plugged: true })
     m.set({ hot: true })          // junta com o estado anterior
     m.destroy()

   estado: pct (0–100, carga; null = sem leitura), tone ('good'|'warn'|'serious'|'crit'|'none', cor
   do líquido pela SAÚDE; 'none' = saúde sem leitura, líquido neutro), charging, plugged, full, hot, face? ('happy'|'worried'|'sad'|'cry'|
   'sleep'|'hot'|'joy'), label? (texto pro leitor de tela). API em docs/graficos.md. */
'use strict';

(function () {
  let uid = 0;
  const TONES = ['good', 'warn', 'serious', 'crit', 'none'];
  const TONE_TXT = { good: K.t('saúde boa'), warn: K.t('saúde pedindo atenção'), serious: K.t('bateria gasta'), crit: K.t('hora de trocar a bateria'), none: K.t('saúde sem leitura agora') };

  /* geometria (viewBox 0 0 260 200) */
  const BX = 24, BY = 40, BW = 176, BH = 128, BR = 38;

  function wave(amp, len, x0, x1) {
    let d = K.t('M{0} 0', x0);
    const n = Math.ceil((x1 - x0) / len) * 2;
    d += K.t(' q{0} {1} {2} 0', len / 4, -amp, len / 2);
    for (let i = 1; i < n; i++) d += K.t(' t{0} 0', len / 2);
    return d;
  }

  const DROP = K.t('M0 -8 C3 -3 6 0 6 4 A6 6 0 0 1 -6 4 C-6 0 -3 -3 0 -8 Z');
  const STAR = K.t('M0 -16 C2 -5 5 -2 16 0 C5 2 2 5 0 16 C-2 5 -5 2 -16 0 C-5 -2 -2 -5 0 -16 Z');
  const ZED = K.t('M0 0 h10 l-10 12 h10');
  const FACE = 1.2;   // rosto maior que no logo: mais expressivo
  const BOLT = 1.7;

  function template(id) {
    const front = wave(5, 56, -56, 330);
    const back = wave(4, 72, -72, 340);
    return `
<svg class="km-svg" viewBox="0 0 260 200" role="img" aria-label="Mascote do Kamurafy">
  <defs>
    <clipPath id="km-clip-${id}"><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="${BR}"/></clipPath>
    <clipPath id="km-mouth-${id}"><path d="M97 110 Q112 134 127 110 Q112 115.5 97 110 Z"/></clipPath>
  </defs>

  <g class="km-cable">
    <path class="km-cord" d="M231 104 C252 104 246 152 256 202"/>
    <rect class="km-plug" x="217" y="95" width="15" height="18" rx="4"/>
    <path class="km-prong" d="M232 99.5h5M232 108.5h5"/>
  </g>

  <g class="km-body">
    <g class="km-shadow">
      <rect x="${BX + 8}" y="${BY + 8}" width="${BW}" height="${BH}" rx="${BR}"/>
      <rect x="200" y="90" width="28" height="44" rx="11"/>
    </g>
    <rect class="km-nub" x="192" y="82" width="28" height="44" rx="11"/>
    <rect class="km-fillbg" x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="${BR}"/>

    <g clip-path="url(#km-clip-${id})">
      <g class="km-level">
        <g class="km-back"><path class="km-wave-back" d="${back} V210 H-72 Z"/></g>
        <g class="km-bubbles">
          <circle class="b1" cx="60" cy="50" r="4.5"/><circle class="b2" cx="112" cy="64" r="3.2"/>
          <circle class="b3" cx="158" cy="46" r="5"/><circle class="b4" cx="136" cy="72" r="2.6"/>
        </g>
        <g class="km-front">
          <path class="km-wave-front" d="${front} V210 H-56 Z"/>
          <path class="km-crest" d="${front}" transform="translate(0 4)"/>
        </g>
      </g>
      <path class="km-shine" d="M46 74 Q46 58 62 56"/>
      <circle class="km-shine-dot" cx="46" cy="87" r="3.8"/>
    </g>

    <rect class="km-o km-outline" x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="${BR}"/>

    <g class="km-face"><g transform="translate(112 104) scale(${FACE}) translate(-112 -104)">
      <g class="km-cheeks">
        <ellipse cx="66" cy="113" rx="11.5" ry="7"/><ellipse cx="158" cy="113" rx="11.5" ry="7"/>
      </g>

      <g class="km-part" data-faces="happy worried sad cry hot">
        <g class="km-eyes">
          <g class="km-eye"><circle cx="88" cy="95" r="10.5"/><circle class="km-glint" cx="91.8" cy="91" r="3.7"/></g>
          <g class="km-eye"><circle cx="136" cy="95" r="10.5"/><circle class="km-glint" cx="139.8" cy="91" r="3.7"/></g>
        </g>
      </g>
      <g class="km-part km-strokes" data-faces="sleep">
        <path d="M77 96 Q88 104 99 96"/><path d="M125 96 Q136 104 147 96"/>
      </g>
      <g class="km-part km-strokes" data-faces="joy">
        <path d="M78 100 Q88 86 98 100"/><path d="M126 100 Q136 86 146 100"/>
      </g>

      <g class="km-part km-strokes km-brows" data-faces="worried hot">
        <path d="M75 79 L98 73"/><path d="M126 73 L149 79"/>
      </g>
      <g class="km-part km-strokes km-brows" data-faces="sad cry">
        <path d="M76 81 Q86 76 98 72"/><path d="M126 72 Q138 76 148 81"/>
      </g>

      <g class="km-part" data-faces="happy">
        <path class="km-mouth-fill" d="M97 110 Q112 134 127 110 Q112 115.5 97 110 Z"/>
        <ellipse class="km-tongue" cx="112" cy="120.5" rx="7" ry="3.6" clip-path="url(#km-mouth-${id})"/>
      </g>
      <g class="km-part" data-faces="joy">
        <path class="km-mouth-fill" d="M93 106 Q112 138 131 106 Q112 113 93 106 Z"/>
        <ellipse class="km-tongue" cx="112" cy="119" rx="9" ry="4.4"/>
      </g>
      <g class="km-part km-strokes" data-faces="worried">
        <path d="M98 119 q7 -6 14 0 t14 0"/>
      </g>
      <g class="km-part km-strokes" data-faces="sad cry">
        <path d="M99 124 Q112 111 125 124"/>
      </g>
      <g class="km-part km-strokes" data-faces="sleep">
        <path d="M104 116 Q112 121.5 120 116"/>
      </g>
      <g class="km-part" data-faces="hot">
        <path class="km-mouth-fill" d="M98 110 Q112 127 126 110 Q112 114 98 110 Z"/>
        <path class="km-tongue km-tongue-out" d="M105.5 116 v6 a6.5 6.5 0 0 0 13 0 v-6 Z"/>
      </g>

      <g class="km-part km-tear" data-faces="cry"><g class="km-drip"><path d="${DROP}" transform="translate(80 111)"/></g></g>
      <g class="km-part km-sweat" data-faces="hot">
        <g class="km-drip d1"><path d="${DROP}" transform="translate(66 74) scale(.9)"/></g>
        <g class="km-drip d2"><path d="${DROP}" transform="translate(158 66) scale(.75)"/></g>
      </g>
    </g></g>

    <g class="km-bolt"><g class="km-zap">
      <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z" transform="translate(92 124) scale(${BOLT})"/>
    </g></g>
  </g>

  <g class="km-part km-steam" data-faces="hot">
    <g class="st1"><path d="M92 30 q-6 -6 0 -12 t0 -12"/></g><g class="st2"><path d="M114 26 q-6 -6 0 -12 t0 -12"/></g><g class="st3"><path d="M136 30 q-6 -6 0 -12 t0 -12"/></g>
  </g>
  <g class="km-part km-zzz" data-faces="sleep">
    <g class="z z1"><path d="${ZED}" transform="translate(190 30) scale(.8)"/></g>
    <g class="z z2"><path d="${ZED}" transform="translate(207 14) scale(1.05)"/></g>
    <g class="z z3"><path d="${ZED}" transform="translate(228 -6) scale(1.3)"/></g>
  </g>
  <g class="km-part km-stars" data-faces="happy joy">
    <g class="tw s1"><path d="${STAR}" transform="translate(232 30)"/></g>
    <g class="tw s2"><path d="${STAR}" transform="translate(248 62) scale(.5)"/></g>
  </g>
</svg>`;
  }

  K.mascot = function (el, opts) {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!el) throw new Error(K.t('K.mascot: elemento não encontrado'));
    opts = opts || {};
    if (el._km && el._km.destroy) el._km.destroy();
    const id = ++uid;
    const size = Math.max(40, Math.round(opts.size || 200));
    /* traço: mais grosso no pequeno (como ícone), proporcional no grande */
    const strokePx = 2.2 + size * 0.0115;
    const unit = 260 / size;
    const wrap = K.el('div', { class: 'km' + (size < 110 ? ' small' : ''), style: { width: size + 'px' } });
    wrap.style.setProperty('--km-sw', (strokePx * unit).toFixed(2) + 'px');
    wrap.style.setProperty('--km-fw', (strokePx * unit * 0.8).toFixed(2) + 'px');
    wrap.style.setProperty('--km-ffw', (strokePx * unit * 0.8 / FACE).toFixed(2) + 'px');
    /* cada mascote pisca num tempo diferente */
    wrap.style.setProperty('--km-blink-delay', (-Math.random() * 6).toFixed(2) + 's');
    wrap.innerHTML = template(id);
    el.textContent = '';
    el.appendChild(wrap);
    const svg = wrap.firstElementChild;
    const level = wrap.querySelector('.km-level');
    const parts = Array.from(wrap.querySelectorAll('.km-part'));
    const boltPath = wrap.querySelector('.km-bolt path');
    boltPath.style.strokeWidth = (strokePx * unit * 0.72 / BOLT).toFixed(2) + 'px';

    let state = { pct: null, tone: 'good', charging: false, plugged: false, full: false, hot: false, face: null };
    let first = true;
    let curPct = null;
    /* próximo quadro, com timer de reserva (janela escondida não roda rAF) */
    const soon = (fn) => {
      let done = false;
      const run = () => { if (!done) { done = true; fn(); } };
      requestAnimationFrame(() => requestAnimationFrame(run));
      setTimeout(run, 70);
    };

    function levelY(pct) {
      if (pct == null) return BY + BH + 12;
      if (pct >= 99.5) return BY - 10;
      return BY + BH * (1 - pct / 100);
    }

    function faceOf(s) {
      if (s.face) return s.face;
      if (s.hot) return 'hot';
      if (s.full && s.plugged) return 'sleep';
      return { good: 'happy', warn: 'worried', serious: 'sad', crit: 'cry' }[s.tone] || 'happy';
    }

    function set(novo) {
      state = Object.assign({}, state, novo || {});
      const s = state;
      const pct = s.pct == null || !isFinite(s.pct) ? null : Math.max(0, Math.min(100, +s.pct));
      const tone = TONES.includes(s.tone) ? s.tone : 'good';
      const face = faceOf(s);
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('snap') || document.hidden;

      for (const t of TONES) wrap.classList.toggle('t-' + t, t === tone);
      wrap.classList.toggle('charging', !!s.charging);
      wrap.classList.toggle('plugged', !!(s.plugged || s.charging));
      wrap.classList.toggle('hot', face === 'hot');
      wrap.classList.toggle('full', pct != null && pct >= 99.5);
      wrap.classList.toggle('nodata', pct == null);
      wrap.dataset.face = face;
      for (const p of parts) p.classList.toggle('on', p.dataset.faces.split(' ').includes(face));

      const y = levelY(pct);
      if (first && !calm) {
        /* primeira vez: enche de baixo pra cima */
        level.style.transition = 'none';
        level.style.transform = `translateY(${BY + BH + 12}px)`;
        level.getBoundingClientRect();
        soon(() => { level.style.transition = ''; level.style.transform = `translateY(${levelY(curPct)}px)`; });
      } else {
        if (first) level.style.transition = 'none';
        level.style.transform = `translateY(${y}px)`;
        if (first) { level.getBoundingClientRect(); soon(() => { level.style.transition = ''; }); }
      }
      curPct = pct;
      first = false;

      const bits = [];
      bits.push(pct == null ? K.t('sem leitura de carga') : K.t('bateria em {0}%', Math.round(pct)));
      if (s.charging) bits.push('carregando');
      else if (s.plugged && pct != null && pct >= 99.5) bits.push(K.t('cheia na tomada'));
      else if (s.plugged) bits.push(K.t('na tomada'));
      if (face === 'hot') bits.push(K.t('com calor'));
      bits.push(TONE_TXT[tone]);
      svg.setAttribute('aria-label', s.label || K.t('Mascote do Kamurafy: ') + bits.join(', '));
      return api;
    }

    const api = {
      el: wrap,
      set,
      get: () => Object.assign({}, state),
      destroy() { el.textContent = ''; delete el._km; },
    };
    el._km = api;
    const init = Object.assign({}, opts.state || opts);
    delete init.size;
    set(init);
    return api;
  };
})();
