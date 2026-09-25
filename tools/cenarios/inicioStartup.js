(function(){
/* Varredura com itens de início de mentira (só leitura) pra ver o atalho pro Otimizar.
   js-extra: 'K.scan()' (ESPERA=12000). Com FALHA=1; antes do K.scan() o optimize.startup falha; ATRASO=7900; faz a lista chegar depois do resultado. */
var FALHA=0,ATRASO=300;

var L=[{id:'a',label:'com.spotify.client.startuphelper',nome:'Spotify',app:'Spotify',origem:'ajudante',ligado:true,rodando:true,editavel:true},
{id:'b',label:'com.getdropbox.dropbox.helper',nome:'Dropbox',app:'Dropbox',origem:'ajudante',ligado:true,rodando:true,editavel:true},
{id:'c',label:'com.getdropbox.dropbox.updater',nome:'Dropbox',app:'Dropbox',origem:'agente',ligado:true,rodando:false,editavel:true},
{id:'d',label:'us.zoom.updater',nome:'zoom.us',app:'zoom.us',origem:'agente',ligado:true,rodando:false,editavel:true},
{id:'e',label:'com.exemplo.agente',nome:'com.exemplo.agente',origem:'agente',ligado:true,rodando:false,editavel:true},
{id:'f',label:'com.docker.helper',nome:'Docker',app:'Docker',origem:'ajudante',ligado:false,rodando:false,editavel:true},
{id:'g',label:'com.adobe.daemon',nome:'Adobe',app:'Adobe',origem:'sistema',ligado:true,rodando:true,editavel:false}];
var real=K.api;K.api=function(c,a){if(c==='optimize.startup'){if(FALHA)return new Promise(function(_,j){setTimeout(function(){j(new Error('o Swift não respondeu (teste)'))},30)});return new Promise(function(r){setTimeout(function(){r(JSON.parse(JSON.stringify(L)))},ATRASO)})}
if(c==='optimize.startupToggle'||c==='optimize.quit'||c==='optimize.run')return Promise.reject(new Error('recusado no cenário de teste'));return real(c,a)};
__EXTRA__
})();void 0
