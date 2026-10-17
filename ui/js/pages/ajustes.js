/* Kamurafy — Ajustes (rota "ajustes", botão com a engrenagem no rodapé da barra lateral).
   Cartões: Sons · Barra de menus · Abrir junto com o Mac · Avisos (bateria e vigia) · Privacidade · Sobre.
   No Sobre, quanto o próprio Kamurafy pesa agora (app.weight, lido ao abrir a página).
   Tudo salva na hora (settings.set / menubar.loginItem), sem botão de salvar: a tela muda
   primeiro e volta como estava se o Swift não aceitar, com o motivo no próprio cartão.
   Ao voltar pra janela (ex.: depois de aprovar algo nos Ajustes do Sistema), relê o que o
   macOS decide sozinho: abrir com o Mac e notificações. Prefixo CSS .aj-. */
'use strict';

(function () {
  Object.assign(K.ICONS, {
    ajBar: '<rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="M2.5 9.2h19"/><path d="M14.3 6.6h4.2"/>',
    ajPower: '<path d="M12 3.5v7.5"/><path d="M7.2 6.3a7.5 7.5 0 1 0 9.6 0"/>',
    ajShield: '<path d="M12 3 4.8 5.8v5.6c0 4.4 3 7.9 7.2 9.4 4.2-1.5 7.2-5 7.2-9.4V5.8Z"/><path d="m9 12.1 2.2 2.2 4-4.4"/>',
    ajFolder: '<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.9l2.2 2.4h7.5A2.2 2.2 0 0 1 21 9.6v7.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 16.8Z"/>',
    ajExt: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M17.5 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h4"/>',
    ajNoCloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.6 9.2 4.7 4.7 0 0 0 7 18.5Z"/><path d="M4 4.5 20 19.5"/>',
    ajNoUser: '<circle cx="12" cy="8.3" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/><path d="M4 4.5 20 19.5"/>',
    ajNoEye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 4.5 20 19.5"/>',
    ajDisk: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="11.5" r="4"/><path d="M6.5 17h2"/><path d="M14.8 8.7 17.5 6"/>',
  });

  const DEFAULTS = { aviso80: true, limiteAviso: 80, avisoQuente: true, som: true, iconeNaBarra: true, porcentagemNaBarra: true, soNaBarra: false, vigia: true };
  /* o mesmo texto do cartão "Vigia" no Otimizar › Por que tá lento? */
  const VIGIA_T = 'Me avisar quando um app ficar no talo ou a memória chegar no limite';
  const LIMITES = [70, 75, 80, 85, 90];
  const DATA_DIR = '~/Library/Application Support/Kamurafy';
  const LINKS = {
    gpl: 'https://www.gnu.org/licenses/gpl-3.0.html',
    fredoka: 'https://github.com/hafontia/Fredoka-One',
    rough: 'https://roughjs.com',
  };

  let host = null;
  let token = 0;
  let S = null;            // cópia local das configurações (o que a tela mostra)
  let loaded = false;      // settings.get respondeu? (sem isso, os interruptores ficam travados)
  let V = {};              // nós da tela que mudam
  let mascots = [];
  let savedTimer = null;
  let listeners = [];
  let lastRefresh = 0;

  const msgOf = (e) => (e && e.message ? String(e.message) : 'erro desconhecido');
  const calm = () => document.documentElement.classList.contains('snap') || matchMedia('(prefers-reduced-motion: reduce)').matches;

  function withTimeout(p, ms) {
    return Promise.race([p, K.sleep(ms).then(() => { throw new Error('demorou demais pra responder'); })]);
  }

  /* ================= peças ================= */

  function card(id, icon, title, sub, extraClass, delay) {
    const c = K.el('section', { class: `card aj-card aj-${id} pop-in${extraClass ? ' ' + extraClass : ''}`, id: 'aj-' + id, 'aria-labelledby': `aj-${id}-t` });
    c.style.animationDelay = (delay || 0) + 'ms';
    c.appendChild(K.el('div', { class: 'card-head aj-chead' },
      K.el('div', { class: 'aj-chead-main' },
        K.el('span', { class: 'head-ic', html: K.icon(icon) }),
        K.el('div', { class: 'aj-chead-t' },
          K.el('h2', { id: `aj-${id}-t` }, title),
          sub ? K.el('div', { class: 'card-sub' }, sub) : null))));
    return c;
  }

  /** interruptor (role=switch); quem decide o novo estado é o onflip(novoValor) */
  function makeSwitch(label, onflip) {
    const sw = K.el('button', { class: 'switch', role: 'switch', type: 'button', 'aria-checked': 'false', 'aria-label': label });
    sw.addEventListener('click', () => { if (!sw.disabled) onflip(sw.getAttribute('aria-checked') !== 'true'); });
    sw.paint = (on, disabled) => { sw.setAttribute('aria-checked', String(!!on)); sw.disabled = !!disabled; };
    return sw;
  }

  /** linha de ajuste: título + explicação à esquerda, controle à direita */
  function setting(titleNode, textNode, control, extraClass) {
    return K.el('div', { class: 'setting aj-setting' + (extraClass ? ' ' + extraClass : '') },
      K.el('div', { class: 'setting-text' }, titleNode, textNode), control);
  }

  function errLine() { return K.el('p', { class: 'aj-err', role: 'alert', hidden: true }); }
  function showErr(node, text) { if (!node) return; node.textContent = text; node.hidden = false; }
  function hideErr(node) { if (node) node.hidden = true; }

  function extBtn(label, url, cls) {
    return K.el('button', { class: 'btn small ' + (cls || 'ghost') + ' aj-ext', type: 'button', html: K.icon('ajExt'),
      title: 'Abre no navegador',
      onclick: () => { K.sound.plop(); K.api('open.url', { url }).catch(() => K.sound.oops()); } }, label);
  }

  function openPane(painel, errNode) {
    K.sound.plop();
    K.api('open.settings', { painel }).catch((e) => {
      K.sound.oops();
      showErr(errNode, 'Não consegui abrir os Ajustes do Sistema agora (' + msgOf(e) + '). Dá pra abrir pelo menu da Apple › Ajustes do Sistema.');
    });
  }

  /** "Salvo" no cabeçalho: aparece um instante depois de cada mudança aceita */
  function flashSaved() {
    if (!V.saved) return;
    V.saved.hidden = false;
    V.saved.classList.remove('aj-bump');
    void V.saved.offsetWidth;
    V.saved.classList.add('aj-bump');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { if (V.saved) V.saved.hidden = true; }, 2200);
  }

  /**
   * Salva uma mudança nas configurações. A tela muda na hora; se o Swift recusar, volta.
   *   save({ aviso80: false }, errNode)
   */
  async function save(patch, errNode) {
    if (!loaded) return;
    K.sound.plop();
    const before = Object.assign({}, S);
    Object.assign(S, patch);
    paintAll();
    hideErr(errNode);
    try {
      const v = await K.settings.set(patch);
      if (v) Object.assign(S, v);
      paintAll();
      flashSaved();
      if (K.shell && K.shell.announce) K.shell.announce();
    } catch (e) {
      Object.assign(S, before);
      paintAll();
      K.sound.oops();
      showErr(errNode, `Não consegui salvar agora (${msgOf(e)}). Voltei como estava: tente de novo daqui a pouco.`);
    }
  }

  /* ================= cartões ================= */

  /* ---------- sons ---------- */
  function soundCard(delay) {
    const c = card('sons', 'soundOn', 'Sons', 'Uns barulhinhos de desenho animado, bem baixinhos.', null, delay);
    const err = errLine();
    V.swSom = makeSwitch('Sons da interface', async (on) => {
      if (!loaded) return;
      hideErr(err);
      try {
        /* a parte síncrona já liga/desliga o som; o plop sai com o som ligado */
        const saving = K.shell && K.shell.setSound ? K.shell.setSound(on) : ((K.sound.enabled = on), K.settings.set({ som: on }));
        if (on) K.sound.plop();
        await saving;
        S.som = on;
        flashSaved();
      } catch (e) {
        K.sound.oops();
        showErr(err, `Não consegui salvar agora (${msgOf(e)}). Voltei como estava.`);
      }
      S.som = K.sound.enabled;
      paintSound();
    });
    V.hear = K.el('button', { class: 'btn small aj-hear', type: 'button', html: K.icon('play'),
      onclick: () => { if (K.sound.enabled) K.sound.tada(); } }, 'Ouvir');
    V.somTx = K.el('span');
    c.append(
      setting(K.el('b', null, 'Sons da interface'), V.somTx, K.el('div', { class: 'aj-ctl' }, V.hear, V.swSom)),
      err);
    return c;
  }
  function paintSound() {
    if (!V.swSom) return;
    const on = !!S.som;
    V.swSom.paint(on, !loaded);
    V.hear.disabled = !on || !loaded;
    V.hear.title = on ? 'Toca o som de quando a varredura termina' : 'Ligue o som pra ouvir';
    V.somTx.textContent = on
      ? 'Um plop nos cliques e um tadá quando a varredura termina. Nada toca ao passar o mouse.'
      : 'Desligados. O Kamurafy fica em silêncio (os avisos do macOS têm o som deles, à parte).';
  }

  /* ---------- barra de menus ---------- */

  /** desenho da bateria como o Swift faz lá no alto (MenuBar.icon): pct null = sem bateria (só o
      contorno); raio na tomada. Números viram número aqui antes de entrar no SVG. */
  function batGlyph(pct, plugged) {
    let fill = '';
    if (pct != null && isFinite(Number(pct))) {
      const w = Math.max(1.5, (Math.max(0, Math.min(100, Number(pct))) / 100) * 17);
      fill = `<rect x="4" y="4.5" width="${w.toFixed(1)}" height="9" rx="2" class="aj-mb-fill"/>`;
    }
    const bolt = plugged ? '<path class="aj-mb-bolt" d="M13.2 3.3 8.6 9.6h3.1l-1 5.1 4.7-6.4h-3.1Z"/>' : '';
    return `<svg viewBox="0 0 28 18" aria-hidden="true"><rect x="1.5" y="2" width="22" height="14" rx="4" class="aj-mb-shell"/><path d="M25.8 6.8v4.4" class="aj-mb-tip"/>${fill}${bolt}</svg>`;
  }

  function menubarCard(delay) {
    const c = card('barra', 'ajBar', 'Barra de menus', 'A bateria sempre à vista, lá no alto da tela.', null, delay);
    const err = errLine();
    /* prévia: o canto direito da barra de menus, com o ícone do Kamurafy destacado */
    V.mbOurs = K.el('span', { class: 'aj-mb-ours' });
    V.mbPin = K.el('span', { class: 'aj-mb-pin' }, 'Kamurafy');
    const now = Date.now() / 1000;
    const wd = new Date().toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    V.mbPrev = K.el('div', { class: 'aj-mb-wrap' },
      K.el('span', { class: 'aj-mb-l' }, 'Lá no alto fica assim:'),
      K.el('div', { class: 'aj-mb', 'aria-hidden': 'true' },
        K.el('span', { class: 'aj-mb-fade' }),
        K.el('span', { class: 'aj-mb-slot' }, V.mbOurs, V.mbPin),
        K.el('span', { class: 'aj-mb-ic', html: K.icon('scan') }),
        K.el('span', { class: 'aj-mb-clock' }, `${wd} ${K.fmt.time(now)}`)));

    V.swIcone = makeSwitch('Mostrar a bateria na barra de menus', (on) => save({ iconeNaBarra: on }, err));
    V.swPct = makeSwitch('Mostrar a porcentagem', (on) => save({ porcentagemNaBarra: on }, err));
    V.swSo = makeSwitch('Ficar só na barra de menus', (on) => save({ soNaBarra: on }, err));
    V.pctTx = K.el('span');
    V.soTx = K.el('span');
    c.append(
      V.mbPrev,
      setting(K.el('b', null, 'Mostrar a bateria na barra de menus'),
        K.el('span', null, 'Do lado do relógio. Um clique nele abre um resumo rápido da bateria.'), V.swIcone),
      (V.rowPct = setting(K.el('b', null, 'Mostrar a porcentagem'), V.pctTx, V.swPct)),
      (V.rowSo = setting(K.el('b', null, 'Ficar só na barra de menus'), V.soTx, V.swSo)),
      err);
    return c;
  }
  function paintMenubar() {
    if (!V.swIcone) return;
    const icon = !!S.iconeNaBarra;
    V.swIcone.paint(icon, !loaded);
    V.swPct.paint(!!S.porcentagemNaBarra, !loaded || !icon);
    V.swSo.paint(!!S.soNaBarra, !loaded || !icon);
    V.rowPct.classList.toggle('is-off', !icon);
    V.rowSo.classList.toggle('is-off', !icon);
    V.pctTx.textContent = icon ? 'O número da carga ao lado do desenho. Desligado, fica só o desenho.' : 'Liga junto com o ícone na barra.';
    V.soTx.textContent = icon
      ? 'Ao fechar a janela, o Kamurafy sai do Dock e continua lá no alto, medindo a bateria e mandando os avisos. Pra abrir de novo, é só clicar no ícone.'
      : 'Precisa do ícone na barra ligado: sem ele, não teria por onde abrir de novo.';

    /* prévia */
    const b = V.bat;
    V.mbOurs.textContent = '';
    V.mbOurs.classList.toggle('is-empty', !icon);
    V.mbPin.hidden = !icon;
    if (!icon) {
      V.mbOurs.appendChild(K.el('span', { class: 'aj-mb-none' }, 'sem ícone'));
      return;
    }
    /* sem leitura agora: mostra um exemplo (80%); sem bateria (Mac de mesa): só o contorno, sem número */
    const none = !!b && b.present === false;
    const has = !!b && !none && typeof b.percent === 'number';
    const pct = has ? b.percent : none ? null : 80;
    V.mbOurs.appendChild(K.el('span', { class: 'aj-mb-bat', html: batGlyph(pct, !!b && (b.isCharging || b.pluggedIn)) }));
    if (S.porcentagemNaBarra && pct != null) V.mbOurs.appendChild(K.el('span', { class: 'aj-mb-pct num' }, K.fmt.pct(pct, 0)));
  }

  /* ---------- abrir junto com o Mac ---------- */
  function loginCard(delay) {
    const c = card('login', 'ajPower', 'Abrir junto com o Mac', 'Pra ninguém precisar lembrar de abrir.', null, delay);
    V.loginErr = errLine();
    V.swLogin = makeSwitch('Abrir o Kamurafy quando eu entrar no Mac', (on) => setLogin(on));
    V.loginPill = K.el('span', { class: 'aj-login-pill' });
    V.loginBox = K.el('div', { class: 'aj-login-box' });
    c.append(
      setting(K.el('b', null, 'Abrir quando eu entrar no Mac', V.loginPill),
        K.el('span', null, 'Ele começa quietinho (na barra de menus, se estiver ligada) e acompanha a bateria o dia todo. É leve: só acorda quando a carga muda e uma vez por minuto.'),
        V.swLogin),
      V.loginBox,
      V.loginErr);
    return c;
  }

  async function setLogin(on) {
    K.sound.plop();
    hideErr(V.loginErr);
    const before = V.mb;
    V.mb = Object.assign({}, V.mb || {}, { abrirNoLogin: on ? 'ligado' : 'desligado' });
    V.loginBusy = true;
    paintLogin();
    try {
      const r = await K.api('menubar.loginItem', { ligar: on });
      V.mb = r || V.mb;
      V.loginBusy = false;
      paintLogin();
      if (V.mb.abrirNoLogin === 'precisa-aprovar') K.sound.tick();
      else flashSaved();
    } catch (e) {
      V.mb = before;
      V.loginBusy = false;
      paintLogin();
      K.sound.oops();
      const m = msgOf(e);
      const why = m.replace(/^O macOS não deixou:\s*/i, '').replace(/\.$/, '');
      showErr(V.loginErr, /^Só no app aberto/.test(m)
        ? 'Isso só dá pra mudar com o Kamurafy aberto de verdade (não no modo de teste).'
        : `O macOS não deixou mudar agora (${why}). Dá pra fazer na mão em Ajustes do Sistema › Geral › Itens de Início.`);
    }
  }

  function paintLogin() {
    if (!V.swLogin) return;
    const st = V.mb ? V.mb.abrirNoLogin : null;
    const on = st === 'ligado' || st === 'precisa-aprovar';
    V.swLogin.paint(on, !st || st === 'indisponivel' || V.loginBusy);
    V.loginPill.textContent = '';
    V.loginBox.textContent = '';
    V.loginBox.hidden = true;
    const box = (tone, icon, text, btn) => {
      V.loginBox.hidden = false;
      V.loginBox.className = 'aj-login-box aj-note-box ' + tone;
      V.loginBox.appendChild(K.el('span', { class: 'aj-note-ic', html: K.icon(icon) }));
      V.loginBox.appendChild(K.el('p', null, text));
      if (btn) V.loginBox.appendChild(btn);
    };
    const paneBtn = (label) => K.el('button', { class: 'btn small gold', type: 'button', onclick: () => openPane('itens-login', V.loginErr) },
      label, K.el('span', { class: 'btn-ic', html: K.icon('arrow') }));
    if (st === 'ligado') {
      V.loginPill.appendChild(K.statusPill('good', 'Ligado', 'check'));
    } else if (st === 'precisa-aprovar') {
      V.loginPill.appendChild(K.statusPill('warn', 'Falta aprovar', 'eye'));
      box('warn', 'info', 'O macOS guardou o pedido, mas ele só vale depois que você ligar o Kamurafy em Ajustes do Sistema › Geral › Itens de Início. Volte aqui depois: eu confiro sozinho.',
        paneBtn('Abrir Itens de Início'));
    } else if (st === 'indisponivel') {
      V.loginPill.appendChild(K.statusPill('none', 'Indisponível', 'info'));
      box('none', 'info', 'O macOS não deixou esta cópia do Kamurafy se registrar. Costuma acontecer quando ele não está na pasta Aplicativos: mova pra lá, abra de novo e tente outra vez.', null);
    } else if (!st) {
      V.loginPill.appendChild(K.statusPill('none', 'Sem leitura', 'info'));
      box('none', 'info', 'Não consegui ver agora se ele abre junto com o Mac.',
        K.el('button', { class: 'btn small', type: 'button', html: K.icon('cycle'), onclick: () => { K.sound.plop(); refreshSystem(true); } }, 'Ver de novo'));
    }
  }

  /* ---------- avisos da bateria ---------- */
  function alertsCard(delay) {
    const c = card('avisos', 'bell', 'Avisos', 'Eu te chamo na hora certa, com uma notificação do macOS.', null, delay);
    const err = errLine();
    V.t80 = K.el('b');
    V.sw80 = makeSwitch('Aviso de carga', (on) => save({ aviso80: on }, err));
    V.swHot = makeSwitch('Aviso de calor', (on) => save({ avisoQuente: on }, err));
    V.swVigia = makeSwitch(VIGIA_T, (on) => save({ vigia: on }, err));
    V.lims = K.el('div', { class: 'aj-lims', role: 'radiogroup', 'aria-label': 'Avisar quando a carga chegar em' });
    V.limErr = err;
    V.limRow = K.el('div', { class: 'aj-limrow' }, K.el('span', { class: 'aj-limrow-l' }, 'Avisar em'), V.lims);

    V.notifPill = K.el('span', { class: 'aj-notif-pill' });
    V.notifTx = K.el('span');
    V.notifBtns = K.el('div', { class: 'aj-ctl aj-notif-btns' });
    V.notifErr = errLine();
    V.alertNote = K.el('p', { class: 'aj-note' });
    c.append(
      setting(V.t80, K.el('span', null, K.avisosTxt.cargaSub), V.sw80),
      V.limRow,
      setting(K.el('b', null, K.avisosTxt.quente),
        K.el('span', null, K.avisosTxt.quenteSub), V.swHot),
      setting(K.el('b', null, VIGIA_T),
        K.el('span', null, 'Olho a cada minuto. Processo do macOS fica de fora.'), V.swVigia),
      setting(K.el('b', null, 'Notificações do macOS', V.notifPill), V.notifTx, V.notifBtns, 'aj-notif'),
      err, V.notifErr, V.alertNote);
    return c;
  }
  function paintAlerts() {
    if (!V.sw80) return;
    V.t80.textContent = K.avisosTxt.carga(S.limiteAviso);
    V.sw80.paint(!!S.aviso80, !loaded);
    V.swHot.paint(!!S.avisoQuente, !loaded);
    V.swVigia.paint(S.vigia !== false, !loaded);
    const list = LIMITES.includes(S.limiteAviso) ? LIMITES : LIMITES.concat([S.limiteAviso]).sort((a, b) => a - b);
    if (V.lims.childElementCount !== list.length) {
      V.lims.textContent = '';
      for (const v of list) {
        V.lims.appendChild(K.el('button', {
          class: 'aj-lim num', type: 'button', role: 'radio', dataset: { v },
          onclick: () => { if (S.limiteAviso !== v) save({ limiteAviso: v }, V.limErr); },
          onkeydown: (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const btns = K.$$('.aj-lim', V.lims);
            const i = btns.indexOf(e.currentTarget) + (e.key === 'ArrowRight' ? 1 : -1);
            if (btns[i]) { btns[i].focus(); btns[i].click(); }
          },
        }, v + '%'));
      }
    }
    for (const btn of V.lims.children) {
      const on = +btn.dataset.v === S.limiteAviso;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
      btn.disabled = !loaded || !S.aviso80;
    }
    V.limRow.classList.toggle('is-off', !S.aviso80);

    const desk = V.bat && V.bat.present === false && !K.isLaptop(V.info);
    V.alertNote.textContent = desk
      ? 'Este Mac não tem bateria: os avisos de carga e de calor ficam guardados sem ter o que avisar.'
      : 'Os avisos funcionam enquanto o Kamurafy estiver aberto, mesmo com a janela fechada.';
  }

  function paintNotif(justTested) {
    if (!V.notifTx) return;
    const st = V.notif;
    V.notifPill.textContent = '';
    V.notifBtns.textContent = '';
    const testBtn = () => K.el('button', { class: 'btn small', type: 'button', html: K.icon('bell'), onclick: testNotif }, 'Mandar um teste');
    const paneBtn = (label, gold) => K.el('button', { class: 'btn small' + (gold ? ' gold' : ''), type: 'button', onclick: () => openPane('notificacoes', V.notifErr) }, label);
    if (!st) {
      V.notifPill.appendChild(K.statusPill('none', 'Sem leitura', 'info'));
      V.notifTx.textContent = 'Não consegui ver se estão liberadas agora.';
      V.notifBtns.appendChild(K.el('button', { class: 'btn small', type: 'button', html: K.icon('cycle'), onclick: () => { K.sound.plop(); refreshSystem(true); } }, 'Ver de novo'));
      return;
    }
    if (st.estado === 'permitido') {
      V.notifPill.appendChild(K.statusPill('good', 'Liberadas', 'check'));
      V.notifTx.textContent = justTested ? 'Mandei um aviso de teste agora. Chegou aí no canto da tela?' : 'Os avisos chegam como banner, mesmo com o Kamurafy na frente.';
      V.notifBtns.appendChild(testBtn());
    } else if (st.estado === 'provisorio') {
      V.notifPill.appendChild(K.statusPill('warn', 'Em silêncio', 'eye'));
      V.notifTx.textContent = justTested
        ? 'Mandei um teste: ele foi direto pra Central de Notificações, sem banner.'
        : 'Chegam só na Central de Notificações, sem aparecer na tela. Pra ver na hora, escolha "Banners" nos Ajustes.';
      V.notifBtns.append(testBtn(), paneBtn('Abrir Ajustes', true));
    } else if (st.estado === 'negado') {
      V.notifPill.appendChild(K.statusPill('serious', 'Desligadas', 'alert'));
      V.notifTx.textContent = 'Estão desligadas pro Kamurafy, então nenhum aviso chega. Dá pra ligar em Ajustes do Sistema › Notificações › Kamurafy.';
      V.notifBtns.appendChild(paneBtn('Abrir Ajustes', true));
    } else if (st.estado === 'nao-pedido') {
      V.notifPill.appendChild(K.statusPill('none', 'Ainda não pedi', 'info'));
      V.notifTx.textContent = 'O macOS pergunta na primeira vez que o Kamurafy abre se pode mostrar meus avisos. Quando aparecer, responda "Permitir".';
    } else {
      V.notifPill.appendChild(K.statusPill('none', 'Indisponíveis', 'info'));
      V.notifTx.textContent = 'Esta cópia do Kamurafy não consegue mandar notificações.';
    }
  }

  async function testNotif() {
    K.sound.plop();
    hideErr(V.notifErr);
    try {
      V.notif = await K.api('notify.test');
      paintNotif(true);
    } catch (e) {
      K.sound.oops();
      showErr(V.notifErr, `Não consegui mandar o teste agora (${msgOf(e)}).`);
    }
  }

  /* ---------- privacidade ---------- */
  function privacyCard(delay) {
    const c = card('privacidade', 'ajShield', 'Privacidade', 'O que o Kamurafy vê, o que ele guarda e onde.', 'aj-wide', delay);
    const err = errLine();
    const fact = (icon, title, text) => K.el('li', { class: 'aj-fact' },
      K.el('span', { class: 'aj-fact-ic', html: K.icon(icon) }),
      K.el('span', null, K.el('b', null, title), text));
    const left = K.el('div', { class: 'aj-priv-main' },
      K.el('p', { class: 'aj-priv-lead' }, 'Nada sai do seu Mac.'),
      K.el('ul', { class: 'aj-facts' },
        fact('ajNoCloud', 'Não manda nada pra internet.', ' Os únicos links (como o da Apple sobre troca de bateria) abrem no seu navegador, e só quando você clica.'),
        fact('ajNoUser', 'Sem conta e sem login.', ' Não tem cadastro nem assinatura.'),
        fact('ajNoEye', 'Sem anúncio e sem rastreamento.', ' Ninguém fica sabendo o que você faz aqui, nem eu.')),
      K.el('div', { class: 'aj-where' },
        K.el('span', { class: 'aj-where-l' }, 'Onde ficam os dados'),
        K.el('div', { class: 'aj-path' },
          K.el('span', { class: 'aj-path-ic', html: K.icon('ajFolder') }),
          K.el('code', { class: 'aj-path-t selectable' }, DATA_DIR)),
        K.el('ul', { class: 'aj-where-list' },
          K.el('li', null, 'o histórico da carga e da saúde da bateria (é o que desenha os gráficos);'),
          K.el('li', null, 'a lista do que a Faxina e o Desinstalar mandaram pra Lixeira (é o que deixa desfazer).')),
        K.el('p', { class: 'aj-note' }, 'Estes ajustes ficam nas preferências do próprio macOS. Se apagar a pasta, o histórico some de vez e o Kamurafy começa a anotar do zero.')));

    const right = K.el('div', { class: 'aj-fda' },
      K.el('div', { class: 'aj-fda-head' },
        K.el('span', { class: 'aj-fda-ic', html: K.icon('ajDisk') }),
        K.el('div', null,
          K.el('h3', null, 'Acesso Total ao Disco'),
          K.el('div', { class: 'aj-fda-tags' },
            K.el('span', { class: 'sticker aj-fda-tag' }, 'opcional'),
            V.fdaPill = K.el('span', { class: 'aj-fda-pill', 'aria-live': 'polite' })))),
      K.el('p', null, 'Sem ele, o macOS pergunta pasta por pasta (Downloads, Mesa, Documentos) e esconde algumas pastas protegidas. A Faxina e o Desinstalar pulam o que não conseguem ler e avisam "sem acesso".'),
      K.el('p', null, 'Com ele, os dois enxergam essas pastas também. Continua valendo a regra: eu só olho, e nada sai sem você marcar e confirmar.'),
      K.el('p', { class: 'aj-fda-how' }, 'Lá, ligue o Kamurafy na lista (ou clique em + e escolha ele na pasta Aplicativos). Dá pra tirar a qualquer hora, no mesmo lugar.'),
      K.el('button', { class: 'btn gold aj-fda-btn', type: 'button', html: K.icon('lock'), onclick: () => openPane('privacidade-disco', err) },
        'Abrir Acesso Total ao Disco'),
      err);
    c.appendChild(K.el('div', { class: 'aj-priv' }, left, right));
    return c;
  }

  /* ---------- sobre ---------- */
  function aboutCard(delay) {
    /* sem o cabeçalho padrão: o nome do app é o título do cartão */
    const c = K.el('section', { class: 'card aj-card aj-sobre aj-wide pop-in', id: 'aj-sobre', 'aria-labelledby': 'aj-sobre-t' });
    c.style.animationDelay = (delay || 0) + 'ms';
    const v = V.ver;
    const verTxt = v && v.version ? `Versão ${v.version}${v.build ? ` (${v.build})` : ''}` : 'Versão sem leitura';
    const mBox = K.el('div', { class: 'aj-about-mascot' });
    const stage = K.el('div', { class: 'aj-about-stage' }, mBox, K.el('span', { class: 'sticker aj-about-hi' }, 'oi!'));
    const credit = (title, who, lic, url) => K.el('li', { class: 'aj-credit' },
      K.el('div', { class: 'aj-credit-t' }, K.el('b', null, title), K.el('span', null, who)),
      K.el('span', { class: 'aj-lic' }, lic),
      extBtn('Ver', url));
    c.appendChild(K.el('div', { class: 'aj-about' },
      stage,
      K.el('div', { class: 'aj-about-main' },
        K.el('span', { class: 'aj-where-l' }, 'Sobre'),
        K.el('div', { class: 'aj-about-name' },
          K.el('span', { class: 'aj-about-logo', html: K.logo() }),
          K.el('h2', { class: 'aj-about-title', id: 'aj-sobre-t' }, 'Kamurafy')),
        K.el('div', { class: 'row wrap aj-about-tags' },
          K.el('span', { class: 'sticker aj-ver num' }, verTxt),
          v && v.publico === false ? K.el('span', { class: 'aj-devtag' }, 'versão de desenvolvimento') : null),
        K.el('p', { class: 'aj-about-lead' }, 'Cuida do seu Mac e, principalmente, da sua bateria. Grátis, de código aberto e sem assinatura.'),
        weightLine(V.weight),
        K.el('p', { class: 'aj-about-by', html: K.icon('heart') }, K.el('span', null, 'Feito por Gabriel Kamura.'))),
      K.el('div', { class: 'aj-about-side' },
        K.el('span', { class: 'aj-where-l' }, 'Licença e créditos'),
        K.el('ul', { class: 'aj-credits' },
          credit('Kamurafy', 'Gabriel Kamura', 'GPL-3.0', LINKS.gpl),
          credit('Fonte Fredoka', 'The Fredoka Project Authors', 'OFL 1.1', LINKS.fredoka),
          credit('Rough.js', 'Preet Shihn', 'MIT', LINKS.rough)),
        K.el('p', { class: 'aj-note' }, 'GPL-3.0: dá pra usar, estudar, mudar e distribuir, desde que o que você distribuir também tenha o código aberto. Mac e macOS são marcas da Apple; o Kamurafy não tem ligação com ela.'))));
    const b = V.bat;
    const pct = b && b.present !== false && typeof b.percent === 'number' ? b.percent : 78;
    try { mascots.push(K.mascot(mBox, { size: 130, state: { pct, tone: 'good', face: 'joy', label: 'Mascote do Kamurafy, feliz' } })); } catch (e) { /* sem mascote */ }
    return c;
  }

  /** "Agora eu uso 0,4% de um núcleo e 180 MB de memória." (app.weight; sem leitura, a linha some) */
  function weightLine(w) {
    const ok = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
    if (!w || !ok(w.cpu) || !ok(w.memBytes)) return null;
    const cpu = w.cpu <= 0 ? '0%' : K.fmt.pct(w.cpu, w.cpu < 10 ? 1 : 0);
    return K.el('p', { class: 'aj-weight', html: K.icon('leaf'),
      title: 'Somando o app e os processos do WebKit dele. 100% seria um núcleo inteiro trabalhando.' },
    K.el('span', null, `Agora eu uso ${cpu} de um núcleo e ${K.fmt.mem(w.memBytes)} de memória.`));
  }

  /* ================= tela ================= */

  function paintAll() {
    paintSound();
    paintMenubar();
    paintAlerts();
  }

  /** relê o que o macOS decide fora daqui (aprovar item de início, liberar notificações) */
  async function refreshSystem(force) {
    const my = token;
    if (!force && performance.now() - lastRefresh < 1500) return;
    lastRefresh = performance.now();
    const [mb, nt] = await Promise.allSettled([withTimeout(K.api('menubar.status'), 6000), withTimeout(K.api('notify.status'), 6000)]);
    if (my !== token || !host) return;
    if (mb.status === 'fulfilled' && mb.value) V.mb = mb.value;
    else if (force) V.mb = null;
    if (nt.status === 'fulfilled' && nt.value) V.notif = nt.value;
    else if (force) V.notif = null;
    if (!V.loginBusy) paintLogin();
    paintNotif();
    checkFda(force);
  }

  /**
   * Acesso Total ao Disco está ligado? O macOS só deixa ler a Lixeira com ele, então a leitura da
   * Lixeira (cleanup.trashInfo) serve de teste. Na caixa de areia (testes) a Lixeira é de mentira:
   * aí não afirma nada.
   */
  let fdaAt = 0;
  async function checkFda(force) {
    if (!V.fdaPill) return;
    if (!force && performance.now() - fdaAt < 10000) return;
    fdaAt = performance.now();
    const my = token;
    let t = null;
    try { t = await withTimeout(K.api('cleanup.trashInfo'), 12000); } catch (e) { t = null; }
    if (my !== token || !host || !V.fdaPill) return;
    V.fdaPill.textContent = '';
    if (!t || t.caixaDeAreia) return;
    const on = !!t.legivel;
    V.fdaPill.appendChild(K.statusPill(on ? 'good' : 'none', on ? 'Ligado' : 'Desligado', on ? 'check' : 'lock'));
    V.fdaPill.title = on ? 'Ligado: consegui ler a Lixeira, que o macOS só mostra com esse acesso.'
      : 'Desligado: o macOS não deixou eu ler a Lixeira, que só aparece com esse acesso. Tudo bem, é opcional.';
  }

  function listen(target, ev, fn) {
    target.addEventListener(ev, fn);
    listeners.push([target, ev, fn]);
  }

  async function reload() {
    const my = ++token;
    host.textContent = '';
    for (const m of mascots) { try { m.destroy(); } catch (e) { /* já foi */ } }
    mascots = [];
    V = {};
    const [s, mb, nt, b, info, ver, wt] = await Promise.allSettled([
      withTimeout(K.settings.load(), 6000),
      withTimeout(K.api('menubar.status'), 6000),
      withTimeout(K.api('notify.status'), 6000),
      withTimeout(K.cached('battery.now', null, 5000), 6000),
      withTimeout(K.cached('battery.info', null, 600000), 6000),
      K.appVersion ? Promise.resolve(K.appVersion) : withTimeout(K.api('app.version'), 6000),
      withTimeout(K.api('app.weight'), 6000),
    ]);
    if (my !== token || !host) return;
    loaded = s.status === 'fulfilled' && !!s.value;
    S = Object.assign({}, DEFAULTS, loaded ? s.value : K.settings.value || {});
    if (!loaded) S.som = K.sound.enabled;
    V.mb = mb.status === 'fulfilled' ? mb.value : null;
    V.notif = nt.status === 'fulfilled' ? nt.value : null;
    V.bat = b.status === 'fulfilled' ? b.value : null;
    V.info = info.status === 'fulfilled' ? info.value : null;
    V.ver = ver.status === 'fulfilled' ? ver.value : null;
    V.weight = wt.status === 'fulfilled' ? wt.value : null;
    paint();
  }

  function paint() {
    V.saved = K.el('span', { class: 'aj-saved', role: 'status', hidden: true }, K.statusPill('good', 'Salvo', 'check'));
    host.appendChild(K.el('header', { class: 'page-head aj-head', 'data-drag': true },
      K.el('div', null,
        K.el('h1', null, 'Ajustes'),
        K.el('p', null, 'Do seu jeito. Tudo salva na hora, sem botão de salvar.')),
      K.el('div', { class: 'aj-head-side', 'aria-live': 'polite' }, V.saved)));

    if (!loaded) {
      /* o mesmo cartão de erro das outras telas, compacto (o resto da tela continua embaixo) */
      const c = K.errorCard({ compact: true, class: 'aj-loadfail pop-in', title: 'Não consegui ler seus ajustes agora',
        text: 'Deixei os interruptores travados pra não salvar nada errado. Nada foi mexido.', retry: () => { reload(); }, retryHint: 'Leva um segundo.' });
      host.appendChild(c);
    }

    let n = 0;
    const d = () => 60 + n++ * 70;
    /* a bateria é a estrela: os avisos abrem a tela. Na janela estreita vira uma coluna só,
       nesta mesma ordem */
    const colA = K.el('div', { class: 'aj-col' }, alertsCard(d()), soundCard(d()));
    const colB = K.el('div', { class: 'aj-col' }, menubarCard(d()), loginCard(d()));
    host.appendChild(K.el('div', { class: 'aj-grid' }, colA, colB, privacyCard(d()), aboutCard(d())));
    paintAll();
    paintLogin();
    paintNotif();
    checkFda(true);
  }

  K.pages.ajustes = {
    title: 'Ajustes',
    async render(el) {
      host = el;
      listen(window, 'focus', () => refreshSystem(false));
      listen(document, 'visibilitychange', () => { if (!document.hidden) refreshSystem(false); });
      /* o som também muda pelo botão da barra lateral */
      listen(window, 'kamurafy:settings', (e) => {
        if (!S || !host) return;
        const v = e && e.detail;
        if (v && typeof v === 'object') Object.assign(S, v);
        paintAll();
      });
      await reload();
    },
    destroy() {
      token++;
      for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
      listeners = [];
      for (const m of mascots) { try { m.destroy(); } catch (e) { /* já foi */ } }
      mascots = [];
      clearTimeout(savedTimer);
      host = null;
      V = {};
    },
  };
})();
