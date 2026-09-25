/* Kamurafy — tela provisória dos módulos que ainda vão chegar. */
'use strict';

K.pages.embreve = {
  async render(el, ctx) {
    const r = (ctx && ctx.route) || { label: 'Em breve', icon: 'sparkle' };
    el.appendChild(K.el('header', { class: 'page-head', 'data-drag': true },
      K.el('div', null, K.el('h1', null, r.label), K.el('p', null, 'Esse módulo está sendo construído.'))));
    el.appendChild(K.el('div', { class: 'card soon-card pop-in' },
      K.el('div', { class: 'soon-icon float', html: K.icon(r.icon || 'sparkle') }),
      K.el('h2', null, 'Chega na próxima versão'),
      K.el('p', { class: 'soft' }, 'Enquanto isso, dá uma olhada na saúde da sua bateria.'),
      K.el('button', { class: 'btn gold', html: K.icon('battery'), onclick: () => { location.hash = '#/bateria'; } }, 'Ver bateria')));
  },
};
