/* Kamurafy — casca da interface: barra lateral, rotas, arrastar a janela, aviso de pronto.
   Cada página é K.pages.<rota> = { title, async render(el), destroy() }.
   render() só resolve depois que a página desenhou com dados (o modo foto espera isso). */
'use strict';

(function () {
  const ROUTES = [
    { id: 'inicio', label: 'Varredura', icon: 'scan' },
    { id: 'bateria', label: 'Bateria', icon: 'battery', star: true },
    { id: 'painel', label: 'Painel', icon: 'gauge' },
    { section: 'Limpeza e cuidado', soon: true },
    { id: 'faxina', label: 'Faxina', icon: 'broom', soon: true },
    { id: 'otimizar', label: 'Otimizar', icon: 'rocket', soon: true },
    { id: 'desinstalar', label: 'Desinstalar', icon: 'box', soon: true },
    { id: 'galeria', label: 'Galeria de componentes', icon: 'sparkle', hidden: true },  // só pra testes
  ];

  let current = null;
  let readySent = false;
  /* versão pra distribuir: esconde os módulos que ainda não existem (a casca diz com app.version.publico) */
  let publico = false;

  function routeFromHash() {
    const id = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.find((r) => r.id === id) ? id : 'inicio';
  }

  function buildSidebar() {
    const side = K.$('#sidebar');
    side.innerHTML = '';
    side.appendChild(K.el('div', { class: 'brand', 'data-drag': true, html: K.logo() },
      K.el('span', { class: 'brand-name' }, 'Kamurafy')));

    const nav = K.el('nav', { class: 'nav', 'aria-label': 'Seções' });
    for (const r of ROUTES) {
      if (r.hidden) continue;
      if (publico && r.soon) continue;
      if (r.section) {
        /* um selo só pra seção inteira, em vez de um "em breve" em cada item */
        nav.appendChild(K.el('div', { class: 'nav-label' }, r.section, r.soon ? K.el('span', { class: 'soon' }, 'em breve') : null));
        continue;
      }
      const item = K.el('button', {
        class: 'nav-item' + (r.soon ? ' is-soon' : ''), dataset: { route: r.id }, html: K.icon(r.icon),
        title: r.soon ? `${r.label}: chega numa próxima versão` : null,
        onclick: () => { if (location.hash !== '#/' + r.id) { K.sound.plop(); location.hash = '#/' + r.id; } },
      }, K.el('span', null, r.label));
      if (r.star) item.appendChild(K.el('span', { class: 'star', html: K.icon('star') }));
      nav.appendChild(item);
    }
    side.appendChild(nav);

    const foot = K.el('div', { class: 'sidebar-foot' });
    foot.appendChild(K.el('div', { id: 'side-battery', class: 'side-battery', role: 'button', tabindex: 0, 'aria-label': 'Ver a bateria' },
      K.el('span', { class: 'side-bat-wait' }, 'Lendo a bateria…')));
    const soundBtn = K.el('button', { class: 'nav-item side-sound', id: 'side-sound', onclick: toggleSound });
    foot.appendChild(soundBtn);
    side.appendChild(foot);
    paintSound();
  }

  function paintSound() {
    const b = K.$('#side-sound');
    if (!b) return;
    const on = K.sound.enabled;
    b.innerHTML = K.icon(on ? 'soundOn' : 'soundOff');
    b.appendChild(K.el('span', null, on ? 'Som ligado' : 'Som desligado'));
    b.setAttribute('aria-pressed', String(on));
  }

  async function toggleSound() {
    K.sound.enabled = !K.sound.enabled;
    paintSound();
    K.sound.plop();
    try { await K.settings.set({ som: K.sound.enabled }); } catch (e) { console.warn('som:', e.message); }
  }

  async function paintSideBattery() {
    const box = K.$('#side-battery');
    if (!box) return;
    const open = () => { if (location.hash !== '#/bateria') { K.sound.plop(); location.hash = '#/bateria'; } };
    box.onclick = open;
    box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    try {
      const b = await K.cached('battery.now', null, 5000);
      box.innerHTML = '';
      if (!b || !b.present) {
        const info = await K.cached('battery.info', null, 600000).catch(() => null);
        const laptop = K.isLaptop(info);
        box.innerHTML = '';
        box.appendChild(K.el('div', { class: 'side-bat-row' },
          K.el('span', { class: 'side-bat-icon', html: K.icon(laptop ? 'battery' : 'plug') }), K.el('span', { class: 'side-bat-word' }, laptop ? 'Sem leitura' : 'Sem bateria')));
        box.appendChild(K.el('div', { class: 'side-bat-sub' }, laptop ? 'Não achei a bateria' : 'Mac de mesa'));
        return;
      }
      const st = K.batStatus(b);
      box.appendChild(K.el('div', { class: 'side-bat-row' },
        K.el('span', { class: 'side-bat-icon', html: K.icon(b.pluggedIn ? 'bolt' : 'battery') }),
        K.el('span', { class: 'side-bat-pct' }, b.percent != null ? K.fmt.pct(b.percent, 0) : '—'),
        K.el('span', { class: `side-bat-dot ${st.tone}`, title: st.label })));
      box.appendChild(K.el('div', { class: 'side-bat-sub' },
        b.healthPct != null ? `Saúde ${K.fmt.pct(b.healthPct)} · ${st.label}` : 'Saúde sem leitura agora'));
    } catch (e) {
      box.innerHTML = '';
      box.appendChild(K.el('div', { class: 'side-bat-row' },
        K.el('span', { class: 'side-bat-icon', html: K.icon('battery') }), K.el('span', { class: 'side-bat-word' }, 'Sem leitura')));
      box.appendChild(K.el('div', { class: 'side-bat-sub' }, 'Tento de novo em 30 s'));
    }
  }

  function markActive(id) {
    for (const b of K.$$('.nav-item[data-route]')) b.classList.toggle('active', b.dataset.route === id);
  }

  async function go() {
    const id = routeFromHash();
    markActive(id);
    if (current && current.page && current.page.destroy) {
      try { current.page.destroy(); } catch (e) { console.error(e); }
    }
    K.tooltip.hide();
    const view = K.$('#view');
    view.scrollTop = 0;
    view.innerHTML = '';
    const host = K.el('div', { class: `page page-${id}` });
    view.appendChild(host);
    const page = K.pages[id] || K.pages.embreve;
    current = { id, page };
    document.title = `${(ROUTES.find((r) => r.id === id) || {}).label || 'Kamurafy'} · Kamurafy`;
    try {
      await page.render(host, { id, route: ROUTES.find((r) => r.id === id) });
    } catch (e) {
      console.error('render ' + id + ': ' + (e && (e.stack || e.message) || e));
      host.appendChild(K.el('div', { class: 'error-box' }, 'Algo deu errado nesta tela: ' + (e && e.message || e)));
    }
    if (!readySent) {
      readySent = true;
      K.api('app.ready').catch(() => {});
    }
  }

  /* arrastar a janela pelas áreas vazias marcadas com data-drag */
  function setupDrag() {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (!t.closest('[data-drag]')) return;
      if (t.closest('button, a, input, select, textarea, [data-nodrag], .chart, .card')) return;
      if (e.detail === 2) { K.api('window.zoom').catch(() => {}); return; }
      K.api('window.drag').catch(() => {});
    });
  }

  /* ===== dica flutuante única, usada pelos gráficos ===== */
  K.tooltip = {
    /** rows: [{value, name, color}] — o valor vem primeiro, o nome depois */
    show(x, y, title, rows) {
      const tt = K.$('#tooltip');
      tt.innerHTML = '';
      if (title) tt.appendChild(K.el('div', { class: 'tt-title' }, title));
      for (const r of rows || []) {
        const row = K.el('div', { class: 'tt-row' });
        if (r.color) row.appendChild(K.el('i', { class: 'tt-key', style: { background: r.color } }));
        row.appendChild(K.el('span', { class: 'tt-val' }, r.value));
        if (r.name) row.appendChild(K.el('span', { class: 'tt-name' }, r.name));
        tt.appendChild(row);
      }
      tt.hidden = false;
      const w = tt.offsetWidth, h = tt.offsetHeight;
      let left = x + 16, top = y - h - 12;
      if (left + w > innerWidth - 8) left = x - w - 16;
      if (top < 8) top = y + 16;
      tt.style.left = left + 'px';
      tt.style.top = top + 'px';
    },
    hide() { const tt = K.$('#tooltip'); if (tt) tt.hidden = true; },
  };

  async function boot() {
    if (!K.inApp) {
      document.body.innerHTML = '<div style="padding:40px;font-size:20px">Abra pelo Kamurafy.app 🙂</div>';
      return;
    }
    try {
      const s = await K.settings.load();
      K.sound.enabled = s.som && !document.documentElement.classList.contains('snap');
    } catch (e) { console.warn('settings:', e.message); }
    try { const v = await K.api('app.version'); publico = !!(v && v.publico); } catch (e) { /* sem versão: mostra tudo */ }
    buildSidebar();
    setupDrag();
    paintSideBattery();
    setInterval(paintSideBattery, 30000);
    window.addEventListener('hashchange', go);
    await go();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
