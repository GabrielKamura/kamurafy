/* Kamurafy — site: o mascote do topo dá uma dica a cada toque. Sem isto o site funciona igual. */
'use strict';
(function () {
  var mascote = document.querySelector('.mascote');
  var km = mascote && mascote.querySelector('.km');
  var balao = document.querySelector('.balao');
  if (!mascote || !km || !balao) return;

  var frases = [
    'Oi! Deixa a bateria comigo.',
    'Entre 20% e 80% eu sofro menos.',
    'Calor e 100% o dia todo me cansam.',
    '50% hoje + 50% amanhã = 1 ciclo.',
    'Tudo que eu vejo fica no seu Mac.'
  ];
  var i = 0;
  var volta = 0;

  mascote.setAttribute('role', 'button');
  mascote.setAttribute('tabindex', '0');
  mascote.setAttribute('aria-label', 'Mascote do Kamurafy. Toque pra ouvir uma dica.');

  function dica() {
    i = (i + 1) % frases.length;
    balao.textContent = frases[i];
    km.dataset.face = 'joy';
    mascote.classList.remove('pulo');
    void mascote.offsetWidth;
    mascote.classList.add('pulo');
    clearTimeout(volta);
    volta = setTimeout(function () { km.dataset.face = 'happy'; }, 1400);
  }

  mascote.addEventListener('click', dica);
  mascote.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dica(); }
  });
})();
