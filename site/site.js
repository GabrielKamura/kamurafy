/* Kamurafy — site: o mascote do topo dá uma dica a cada toque, e o botão copia a linha do Homebrew.
   Sem isto o site funciona igual. Os textos seguem o lang da página (en ou pt-BR). */
'use strict';
(function () {
  var pt = (document.documentElement.lang || '').toLowerCase().indexOf('pt') === 0;

  var mascote = document.querySelector('.mascote');
  var km = mascote && mascote.querySelector('.km');
  var balao = document.querySelector('.balao');
  if (mascote && km && balao) {
    var frases = pt ? [
      'Oi! Deixa a bateria comigo.',
      'Entre 20% e 80% eu sofro menos.',
      'Calor e 100% o dia todo me cansam.',
      '50% hoje + 50% amanhã = 1 ciclo.',
      'Tudo que eu vejo fica no seu Mac.'
    ] : [
      'Hi! Leave the battery to me.',
      'Between 20% and 80% I wear out slower.',
      'Heat and 100% all day tire me out.',
      '50% today + 50% tomorrow = 1 cycle.',
      'Everything I see stays on your Mac.'
    ];
    var i = 0;
    var volta = 0;

    mascote.setAttribute('role', 'button');
    mascote.setAttribute('tabindex', '0');
    mascote.setAttribute('aria-label', pt
      ? 'Mascote do Kamurafy. Toque pra ouvir uma dica.'
      : 'Kamurafy mascot. Tap for a tip.');

    var dica = function () {
      i = (i + 1) % frases.length;
      balao.textContent = frases[i];
      km.dataset.face = 'joy';
      mascote.classList.remove('pulo');
      void mascote.offsetWidth;
      mascote.classList.add('pulo');
      clearTimeout(volta);
      volta = setTimeout(function () { km.dataset.face = 'happy'; }, 1400);
    };

    mascote.addEventListener('click', dica);
    mascote.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dica(); }
    });
  }

  // botão "Copiar": só aparece onde a área de transferência funciona (https ou localhost)
  if (navigator.clipboard && window.isSecureContext) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copiar]'), function (btn) {
      var rotulo = btn.querySelector('span');
      if (!rotulo) return;
      var original = rotulo.textContent;
      var timer = 0;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(btn.getAttribute('data-copiar')).then(function () {
          rotulo.textContent = btn.getAttribute('data-ok') || original;
          clearTimeout(timer);
          timer = setTimeout(function () { rotulo.textContent = original; }, 1800);
        }, function () {});
      });
    });
  }
})();
