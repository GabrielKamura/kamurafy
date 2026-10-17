/* Kamurafy — tela provisória dos módulos que ainda vão chegar: o que ele vai fazer e como
   (sem prometer data nem milagre). */
'use strict';

(function () {
  const WHAT = {
    faxina: {
      title: K.t('Espaço com você no controle'),
      text: K.t('Você marca, e só vai pra Lixeira o que escolher.'),
      bits: [K.t('Mostra antes'), K.t('Vai pra Lixeira'), K.t('Nada do sistema')],
    },
    otimizar: {
      title: K.t('Velocidade sem mágica'),
      text: K.t('Nada muda sem você confirmar.'),
      bits: [K.t('Itens de início'), K.t('Segundo plano'), K.t('Você confirma')],
    },
    desinstalar: {
      title: K.t('Desinstalar de verdade'),
      text: K.t('O app e as sobras vão pra Lixeira. Dá pra desfazer.'),
      bits: [K.t('App + sobras'), K.t('Vai pra Lixeira'), K.t('Dá pra desfazer')],
    },
  };

  let mascot = null;

  K.pages.embreve = {
    async render(el, ctx) {
      const r = (ctx && ctx.route) || { id: '', label: K.t('Em breve'), icon: 'sparkle' };
      const w = WHAT[r.id] || { title: K.t('Chega numa próxima versão'), text: K.t('Esse módulo está sendo construído.'), bits: [] };
      el.appendChild(K.el('header', { class: 'page-head', 'data-drag': true },
        K.el('div', null, K.el('h1', null, r.label), K.el('p', null, K.t('Chega numa próxima versão do Kamurafy.')))));

      const art = K.el('div', { class: 'soon-art' });
      const mBox = K.el('div', { class: 'soon-mascot' });
      art.append(mBox, K.el('span', { class: 'soon-icon', html: K.icon(r.icon || 'sparkle') }));
      el.appendChild(K.el('section', { class: 'card soon-card pop-in' },
        art,
        K.el('div', { class: 'soon-text' },
          K.el('span', { class: 'sticker soon-tag' }, K.t('em breve')),
          K.el('h2', null, w.title),
          K.el('p', null, w.text),
          w.bits.length ? K.el('ul', { class: 'soon-bits' }, w.bits.map((b) => K.el('li', { html: K.icon('check') }, b))) : null,
          K.el('button', { class: 'btn gold', type: 'button', onclick: () => { K.sound.plop(); location.hash = '#/bateria'; } },
            K.t('Ver a bateria'), K.el('span', { class: 'btn-ic', html: K.icon('arrow') })))));
      mascot = K.mascot(mBox, { size: 170, state: { pct: 70, tone: 'good', face: 'happy', label: K.t('Mascote do Kamurafy, animado com o que vem aí') } });
    },
    destroy() {
      if (mascot) { try { mascot.destroy(); } catch (e) { /* já foi */ } }
      mascot = null;
    },
  };
})();
