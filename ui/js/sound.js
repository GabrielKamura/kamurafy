/* Kamurafy — sons sintetizados na hora (WebAudio), nada de arquivo de áudio.
   Respeitam a configuração "som". Uso: K.sound.plop(), .tada(), .tick(), .oops(), .whoosh() */
'use strict';

K.sound = (function () {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.18, slideTo, delay = 0 } = {}) {
    if (!enabled || document.documentElement.classList.contains('snap')) return;
    const a = ac();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  return {
    set enabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    /** clique de botão */
    plop() { tone(620, 0.09, { slideTo: 320, vol: 0.16 }); },
    /** passo de uma varredura */
    tick() { tone(1200, 0.04, { type: 'triangle', vol: 0.07 }); },
    /** terminou algo bom */
    tada() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.14, delay: i * 0.09 }));
    },
    /** algo deu errado */
    oops() { tone(300, 0.16, { type: 'square', vol: 0.06, slideTo: 180 }); tone(220, 0.2, { type: 'square', vol: 0.05, slideTo: 140, delay: 0.14 }); },
    /** troca de página */
    whoosh() { tone(900, 0.12, { type: 'sine', vol: 0.05, slideTo: 1600 }); },
  };
})();
