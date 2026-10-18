/* Kamurafy — boas-vindas (primeira abertura): três passos com o mascote.
     1. a bateria e o aviso dos 80% (liga/desliga o aviso; mostra se as notificações estão liberadas)
     2. a barra de menus (liga "abrir junto com o Mac": menubar.loginItem)
     3. o Acesso Total ao Disco, que é opcional (só abre os Ajustes do Sistema)
   Aparece uma vez só: a marca fica no localStorage (persiste entre aberturas) e também vai em
   settings.set({boasVindas: true}), que o Swift ignora até ter esse campo (ver docs/ponte.md).
   Nunca abre sozinha no modo foto; pra testar: K.boasVindas.open(passo). */
'use strict';

(function () {
  const KEY = 'kamurafy.boasVindas';
  const snap = () => document.documentElement.classList.contains('snap');
  const calm = () => snap() || matchMedia('(prefers-reduced-motion: reduce)').matches;

  Object.assign(K.ICONS, {
    kwBar: '<rect x="2.5" y="3.5" width="19" height="4" rx="1.5"/><path d="M15.5 5.5h3"/><rect x="11" y="10" width="10.5" height="10.5" rx="2.5"/><path d="M13.8 14h5M13.8 17h3"/>',
    kwDisk: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r=".6"/><path d="M17 16.5h.1"/>',
  });

  function seen() {
    try { if (localStorage.getItem(KEY) === '1') return true; } catch (e) { /* sem armazenamento */ }
    const s = K.settings && K.settings.value;
    return !!(s && s.boasVindas === true);
  }
  function markSeen() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* sem armazenamento */ }
    /* o Swift de hoje ignora campo que não conhece; quando ele guardar, vale entre reinstalações */
    if (K.settings && K.settings.set) K.settings.set({ boasVindas: true }).catch(() => {});
  }

  let cur = null;

  function sw(label, on, onflip) {
    const b = K.el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label });
    b.addEventListener('click', () => { if (!b.disabled) onflip(b.getAttribute('aria-checked') !== 'true', b); });
    return b;
  }
  function line(tone, icon, text) {
    return K.el('p', { class: 'kw-line ' + (tone || ''), html: K.icon(icon || 'info') }, K.el('span', null, text));
  }

  /* ---------- passo 1: bateria e aviso dos 80% ---------- */
  function stepBattery(box) {
    const s = (K.settings && K.settings.value) || {};
    const lim = s.limiteAviso || 80;
    const msg = K.el('div', { class: 'kw-msg' });
    const toggle = sw(K.avisosTxt.carga(lim), s.aviso80 !== false, async (on, b) => {
      K.sound.tick();
      b.setAttribute('aria-checked', String(on));
      try { await K.settings.set({ aviso80: on }); } catch (e) {
        b.setAttribute('aria-checked', String(!on));
        msg.replaceChildren(line('crit', 'alert', K.t('Não consegui salvar agora. Dá pra mudar depois, em Ajustes.')));
      }
    });
    const notif = K.el('div', { class: 'kw-notif' }, K.el('span', { class: 'loading' }, K.t('Vendo se posso mostrar avisos…')));
    box.append(
      K.el('div', { class: 'kw-setting' },
        K.el('div', { class: 'kw-setting-t' }, K.el('b', null, K.avisosTxt.carga(lim)),
          K.el('span', null, K.t('Uma vez por carga, com o carregador ligado.'))),
        toggle),
      notif, msg);
    (async () => {
      let st = null;
      try { st = await K.api('notify.status'); } catch (e) { st = null; }
      if (!cur) return;
      notif.textContent = '';
      if (!st) { notif.appendChild(line('none', 'info', K.t('Não consegui ver se posso mostrar avisos. Confira depois, em Ajustes.'))); return; }
      if (st.permitido) {
        notif.append(line('good', 'check', st.estado === 'provisorio' ? K.t('Notificações liberadas, no modo discreto.') : K.t('Notificações liberadas: os avisos vão chegar.')),
          K.el('button', { class: 'btn small', type: 'button', html: K.icon('bell'),
            onclick: async () => { K.sound.plop(); try { await K.api('notify.test'); } catch (e) { /* sem teste */ } } }, K.t('Mandar um de teste')));
      } else if (st.estado === 'negado') {
        notif.append(line('warn', 'alert', K.t('Notificações desligadas: o aviso não chega.')),
          K.el('button', { class: 'btn small gold', type: 'button',
            onclick: () => { K.sound.plop(); K.api('open.settings', { painel: 'notificacoes' }).catch(() => {}); } }, K.t('Abrir Ajustes')));
      } else if (st.estado === 'nao-pedido') {
        notif.appendChild(line('none', 'bell', K.t('O macOS vai pedir permissão. Responda “Permitir”.')));
      } else {
        notif.appendChild(line('none', 'info', K.t('Os avisos não estão disponíveis nesta versão.')));
      }
    })();
  }

  /* ---------- passo 2: barra de menus e abrir junto com o Mac ---------- */
  function stepMenubar(box) {
    const msg = K.el('div', { class: 'kw-msg' });
    const toggle = sw(K.t('Abrir o Kamurafy junto com o Mac'), false, async (on, b) => {
      K.sound.tick();
      b.disabled = true;
      b.setAttribute('aria-checked', String(on));
      msg.textContent = '';
      try {
        const r = await K.api('menubar.loginItem', { ligar: on });
        paint(r);
        if (r && r.abrirNoLogin === 'precisa-aprovar') {
          msg.appendChild(line('warn', 'info', K.t('Falta aprovar em Ajustes do Sistema › Geral › Itens de Início.')));
        }
      } catch (e) {
        b.setAttribute('aria-checked', String(!on));
        const m = String((e && e.message) || '');
        msg.appendChild(/só no app aberto/i.test(m)
          ? line('none', 'info', K.t('Modo de teste: aqui eu só mostro.'))
          : line('crit', 'alert', K.t('Não deu pra mudar agora. Tente depois, em Ajustes.')));
      }
      b.disabled = false;
    });
    function paint(st) {
      const s = st && st.abrirNoLogin;
      toggle.setAttribute('aria-checked', String(s === 'ligado' || s === 'precisa-aprovar'));
      toggle.disabled = !s || s === 'indisponivel';
      if (s === 'indisponivel') {
        msg.replaceChildren(line('none', 'info', K.t('Esta cópia não pode se registrar. Mova o Kamurafy pra pasta Aplicativos e abra de novo.')));
      }
    }
    box.append(
      K.el('div', { class: 'kw-bar', 'aria-hidden': 'true' },
        K.el('span', { class: 'kw-bar-apple' }),
        K.el('span', { class: 'kw-bar-gap' }),
        K.el('span', { class: 'kw-bar-me', html: K.icon('battery') }, '80%'),
        K.el('span', { class: 'kw-bar-clock' }, K.t('qui 10:42')),
        K.el('span', { class: 'kw-bar-arrow' }, K.t('eu fico aqui'))),
      K.el('div', { class: 'kw-setting' },
        K.el('div', { class: 'kw-setting-t' }, K.el('b', null, K.t('Abrir o Kamurafy junto com o Mac')),
          K.el('span', null, K.t('Os avisos só chegam comigo aberto.'))),
        toggle),
      msg);
    toggle.disabled = true;
    K.api('menubar.status').then((st) => { if (cur) paint(st); }).catch(() => { if (cur) { toggle.disabled = true; } });
  }

  /* ---------- passo 3: Acesso Total ao Disco (opcional) ---------- */
  function stepDisk(box) {
    const msg = K.el('div', { class: 'kw-msg' });
    box.append(
      K.el('ul', { class: 'kw-list' },
        K.el('li', { html: K.icon('eye') }, K.el('span', null, K.t('Com ou sem ela, nada sai sem você confirmar.'))),
        K.el('li', { html: K.icon('lock') }, K.el('span', null, K.t('Dá pra tirar a qualquer hora, nos Ajustes do Sistema.')))),
      K.el('div', { class: 'kw-row' },
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('lock'),
          onclick: () => {
            K.sound.plop();
            K.api('open.settings', { painel: 'privacidade-disco' })
              .then(() => { msg.replaceChildren(line('good', 'check', K.t('Abri os Ajustes. Ligue o Kamurafy na lista, ou clique em + e escolha ele.'))); })
              .catch(() => { msg.replaceChildren(line('crit', 'alert', K.t('Não consegui abrir agora. Fica em Ajustes do Sistema › Privacidade e Segurança › Acesso Total ao Disco.'))); });
          } }, K.t('Abrir Acesso Total ao Disco')),
        K.el('span', { class: 'kw-hint' }, K.t('ou depois, em Ajustes'))),
      msg);
  }

  const STEPS = [
    { icon: 'bell', kicker: K.t('Oi! Eu sou o Kamurafy'), title: K.t('Eu cuido da bateria do seu Mac'),
      text: K.t('Parar a carga antes do 100% ajuda a bateria a durar mais. Eu te aviso na hora.'),
      face: 'happy', paint: stepBattery },
    { icon: 'kwBar', kicker: K.t('Sempre à mão'), title: K.t('Eu fico na barra de menus'),
      text: K.t('Um clique no meu ícone, do lado do relógio, mostra a carga e quem está gastando.'),
      face: 'joy', paint: stepMenubar },
    { icon: 'kwDisk', kicker: K.t('Sem pressa'), title: K.t('Acesso Total ao Disco é opcional'),
      text: K.t('Deixa eu olhar as pastas que o macOS protege. Sem ela, tudo funciona.'),
      face: 'happy', paint: stepDisk },
  ];

  function close(done) {
    if (!cur) return;
    const c = cur;
    cur = null;
    document.removeEventListener('keydown', c.onKey, true);
    if (c.mascot) { try { c.mascot.destroy(); } catch (e) { /* já foi */ } }
    if (calm()) c.back.remove();
    else { c.back.classList.add('out'); setTimeout(() => c.back.remove(), 180); }
    /* aberta por teste (modo foto) nunca marca como vista: senão a pessoa nunca veria */
    if (done !== 'test' && c.how !== 'test' && !snap()) markSeen();
    if (c.prev && document.contains(c.prev) && c.prev.focus) { try { c.prev.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
  }

  function paintStep(c, i) {
    c.i = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[c.i];
    c.icon.innerHTML = K.icon(st.icon);
    c.kicker.textContent = st.kicker;
    c.title.textContent = st.title;
    c.text.textContent = st.text;
    c.body.textContent = '';
    st.paint(c.body);
    c.dots.forEach((d, k) => { d.classList.toggle('on', k === c.i); d.setAttribute('aria-current', k === c.i ? 'step' : 'false'); });
    c.count.textContent = K.t('{0} de {1}', c.i + 1, STEPS.length);
    c.back2.hidden = c.i === 0;
    const last = c.i === STEPS.length - 1;
    c.next.textContent = '';
    c.next.append(last ? K.t('Bora começar') : K.t('Continuar'), K.el('span', { class: 'btn-ic', html: K.icon('arrow') }));
    c.skip.hidden = last;
    if (c.mascot) c.mascot.set({ face: st.face });
    c.card.classList.toggle('is-last', last);
    if (!calm() && c.panel.animate) c.panel.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  function open(step, how) {
    if (cur) close('test');
    const c = { i: 0, prev: document.activeElement, how };
    c.icon = K.el('span', { class: 'kw-ic', 'aria-hidden': 'true' });
    c.kicker = K.el('span', { class: 'sticker kw-kicker' });
    c.title = K.el('h2', { id: 'kw-title' });
    c.text = K.el('p', { class: 'kw-text', id: 'kw-text' });
    c.body = K.el('div', { class: 'kw-body' });
    c.panel = K.el('div', { class: 'kw-panel' }, K.el('div', { class: 'kw-head' }, c.icon, K.el('div', null, c.kicker, c.title)), c.text, c.body);
    c.dots = STEPS.map((s, k) => K.el('button', { class: 'kw-dot', type: 'button', 'aria-label': K.t('Passo {0}: {1}', k + 1, s.title), onclick: () => { K.sound.tick(); paintStep(c, k); } }));
    c.count = K.el('span', { class: 'kw-count' });
    c.skip = K.el('button', { class: 'btn small ghost kw-skip', type: 'button', onclick: () => { K.sound.tick(); close(); } }, K.t('Pular'));
    c.back2 = K.el('button', { class: 'btn kw-prev', type: 'button', onclick: () => { K.sound.tick(); paintStep(c, c.i - 1); } }, K.t('Voltar'));
    c.next = K.el('button', { class: 'btn gold kw-next', type: 'button', onclick: () => {
      K.sound.plop();
      if (c.i >= STEPS.length - 1) { K.sound.tada(); close(); } else paintStep(c, c.i + 1);
    } });
    c.art = K.el('div', { class: 'kw-art', 'aria-hidden': 'true' }, K.el('div', { class: 'kw-mascot' }),
      K.el('span', { class: 'kw-spark s1' }), K.el('span', { class: 'kw-spark s2' }), K.el('span', { class: 'kw-spark s3' }));
    c.card = K.el('div', { class: 'kw', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'kw-title', 'aria-describedby': 'kw-text' },
      c.art, c.panel,
      K.el('div', { class: 'kw-foot' },
        K.el('div', { class: 'kw-dots' }, c.dots, c.count),
        K.el('div', { class: 'kw-acts' }, c.skip, c.back2, c.next)));
    c.back = K.el('div', { class: 'kw-back' }, c.card);
    document.body.appendChild(c.back);
    try { c.mascot = K.mascot(c.art.firstChild, { size: 168, state: { pct: 80, tone: 'good', charging: true, plugged: true, face: 'happy', label: K.t('Mascote do Kamurafy dando oi') } }); } catch (e) { c.mascot = null; }
    c.onKey = (e) => {
      if (cur !== c) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        const f = K.$$('button:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])', c.card).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', c.onKey, true);
    cur = c;
    paintStep(c, step || 0);
    setTimeout(() => { if (cur === c) c.next.focus({ preventScroll: true }); }, 40);
  }

  K.boasVindas = {
    /** abre na primeira vez (fora do modo foto) */
    maybe() { if (!snap() && K.inApp && !seen()) setTimeout(() => { if (!seen()) open(0); }, 600); },
    /** só testes: abre num passo (0–2) sem marcar como visto */
    open(step) { open(step || 0, 'test'); },
    next() { if (cur) paintStep(cur, cur.i + 1); },
    close() { close(cur && cur.how === 'test' ? 'test' : undefined); },
    isOpen: () => !!cur,
  };
})();
