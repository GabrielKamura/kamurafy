/* Kamurafy — idiomas (carrega antes de todo o resto: o util.js já usa o K.t). O texto do código é a chave (português do Brasil); a tradução vem do
   catálogo ui/i18n/<idioma>.json, que o Swift entrega antes da página (window.KAMURAFY_I18N),
   então até as constantes das páginas saem traduzidas. Sem tradução, fica o português.
     K.t('Bateria')                          → "Battery"
     K.t('Usa {0} do processador', cores)  → {0}, {1}… viram os argumentos */
'use strict';

window.K = window.K || {};

(function () {
  const lang = typeof window.KAMURAFY_LANG === 'string' ? window.KAMURAFY_LANG : 'pt-BR';
  const dict = window.KAMURAFY_I18N && typeof window.KAMURAFY_I18N === 'object' ? window.KAMURAFY_I18N : null;
  const has = Object.prototype.hasOwnProperty;

  K.lang = lang;
  /* números e datas no jeito de cada idioma: 89,8 · 89.8 */
  K.locale = lang === 'en' ? 'en-US' : lang;
  document.documentElement.lang = lang;

  K.t = function (key, ...args) {
    let s = dict && has.call(dict, key) && typeof dict[key] === 'string' && dict[key] ? dict[key] : key;
    if (args.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m));
    return s;
  };
})();
