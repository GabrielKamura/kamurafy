/* Kamurafy — ícones desenhados à mão (traço grosso, pontas redondas).
   Todos em viewBox 24×24 e usam currentColor. Uso: K.icon('bolt') → string SVG. */
'use strict';

K.ICONS = {
  scan: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/><path d="M8 8.2c.8-.9 1.8-1.3 3-1.2"/>',
  battery: '<rect x="2.5" y="7" width="16.5" height="10" rx="3"/><path d="M21.5 10.5v3"/><path d="M6 10.2v3.6M9.3 10.2v3.6"/>',
  gauge: '<path d="M3.5 16.5a8.5 8.5 0 1 1 17 0"/><path d="M12 16.5l4-5.5"/><circle cx="12" cy="16.5" r="1.4"/><path d="M6 13.2l1 .6M18 13.2l-1 .6M12 8.2v1.3"/>',
  broom: '<path d="M19.5 3.5 12.8 10.2"/><path d="M10.4 9.4c1.9-.4 3.6 1.3 3.2 3.2l-.8 3.6c-.3 1.4-1.9 2.2-3.2 1.5l-4.3-2.2c-1.1-.6-1.3-2-.5-2.9Z"/><path d="M6.5 16.6 4 20.5M9.3 18l-1.6 3M4.6 13.9l-2.1 2.2"/>',
  rocket: '<path d="M14.5 4.5c2.8-1.1 5-1 5-1s.1 2.2-1 5l-5.8 5.8-4-4Z"/><path d="M8.7 10.3 5.2 9.9l-2 2 3.7 1.4M13.7 15.3l.4 3.5-2 2-1.4-3.7"/><circle cx="15.3" cy="8.7" r="1.3"/><path d="M5.6 16.9c-1.4.5-2.1 2.6-2.1 3.6 1 0 3.1-.7 3.6-2.1"/>',
  box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z"/>',
  plug: '<path d="M8.5 3v4.5M15.5 3v4.5"/><path d="M6 7.5h12v3.2a6 6 0 0 1-12 0Z"/><path d="M12 16.7V21"/>',
  thermo: '<path d="M14 14.2V5a2 2 0 0 0-4 0v9.2a4 4 0 1 0 4 0Z"/><path d="M12 9.5v6"/><circle cx="12" cy="17.3" r="1.4"/>',
  cycle: '<path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12a8 8 0 0 1 13.7-5.6"/><path d="M18.2 2.8v3.9h-3.9M5.8 21.2v-3.9h3.9"/>',
  crystal: '<circle cx="12" cy="10.5" r="6.5"/><path d="M7 18.5h10l1.2 2.5H5.8Z"/><path d="M9.3 8.3c.6-1 1.5-1.5 2.6-1.6"/>',
  cells: '<rect x="3" y="6" width="5" height="13" rx="1.6"/><rect x="9.5" y="6" width="5" height="13" rx="1.6"/><rect x="16" y="6" width="5" height="13" rx="1.6"/><path d="M4.5 4h2M11 4h2M17.5 4h2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7.8 12.3 2.8 2.8 5.6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  alert: '<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="16.9" r=".6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-8.9-9.2C2.2 7.6 4.3 4.5 7.5 4.5c2 0 3.5 1.2 4.5 2.8 1-1.6 2.5-2.8 4.5-2.8 3.2 0 5.3 3.1 4.4 6.3C19.5 15.4 12 20 12 20Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  memory: '<rect x="2.5" y="7" width="19" height="9" rx="2"/><path d="M6.5 10v3M10 10v3M13.5 10v3M17 10v3M5 16v2.5M9 16v2.5M15 16v2.5M19 16v2.5"/>',
  disk: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="11.5" r="4"/><circle cx="12" cy="11.5" r=".8"/><path d="M6.5 17h2"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.5 6.1 6.5 6.8-4 .7-5.9 2.6-6.5 6.8-.6-4.2-2.5-6.1-6.5-6.8C9.5 9.1 11.4 7.2 12 3Z"/><path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
  arrow: '<path d="M4 12h15.5M14 6.5l5.5 5.5-5.5 5.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  leaf: '<path d="M5 19c-1-6.5 3.2-13 15-14 .6 11-6 15.5-12.5 14.5"/><path d="M5 19c3-4.5 6-7 9.5-9"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.8 3-5.6 3.8-9.3 2.5 1.6 3.4 3.8 3.3 5.8 1-.7 1.6-2 1.7-3.2 2.2 1.7 4.2 4.2 4.2 6.9 0 3.4-2.6 6-6.5 6Z"/>',
  chart: '<path d="M3.5 20.5h17"/><path d="M4.5 16.5 9 11l3.5 3.2 7-8.2"/><circle cx="19.5" cy="6" r=".6"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
  apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
};

K.icon = function (name, extraClass) {
  const body = K.ICONS[name] || K.ICONS.info;
  return `<svg class="ic${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
};

/** Logo do Kamurafy: bateria sorridente com um brilho. */
K.logo = function () {
  return `<svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="5" y="12" width="34" height="26" rx="8" fill="#ffd23f" stroke="#fff" stroke-width="3.5"/>
    <path d="M42.5 20.5v9" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="16" cy="24" r="2.4" fill="#000"/><circle cx="28" cy="24" r="2.4" fill="#000"/>
    <path d="M17.5 30c2.6 2.4 6.4 2.4 9 0" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M40 3.5c.5 3 1.8 4.3 4.5 4.8-2.7.5-4 1.8-4.5 4.8-.5-3-1.8-4.3-4.5-4.8 2.7-.5 4-1.8 4.5-4.8Z" fill="#ffd23f"/>
  </svg>`;
};
