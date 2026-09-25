(function(){
/* Foto na fonte da versão pública (Fredoka), sem a More Sugar. Uso:
     tools/foto.sh bateria build/fotos/x.png 1180x2000 "$(cat tools/cenarios/fredoka.js)"
   ou junto com outro cenário, no lugar do __EXTRA__ dele:
     tools/cenario.sh tools/cenarios/otimizar.js otimizar x.png 1180x1400 "$(cat tools/cenarios/fredoka.js)"
   O __EXTRA__ daqui roda depois (ex.: "K.otimizar.tab('pesando')"). */
var st = document.createElement('style');
st.textContent = ":root{--font:'Fredoka',ui-rounded,system-ui,-apple-system,sans-serif !important}";
(document.head || document.documentElement).appendChild(st);
try { document.fonts.load("500 16px Fredoka"); document.fonts.load("600 16px Fredoka"); document.fonts.load("700 16px Fredoka"); } catch (e) {}
__EXTRA__;
})();void 0
