(function(){var C={settings:{aviso80:true,limiteAviso:80,avisoQuente:true,som:true,iconeNaBarra:true,porcentagemNaBarra:true,soNaBarra:false},login:'desligado',aprovar:false,notif:'permitido',falhaGet:false,falhaSet:false,falhaLogin:false,semBateria:false};window.__cen=C;
/* Ajustes com a ponte de mentira: nada muda de verdade (nem ajustes, nem item de início, nem aviso).
   Variações pelo js-extra, que roda antes de a tela subir: ex. 'C.login="precisa-aprovar";C.notif="negado"'.
   C.falhaGet / C.falhaSet / C.falhaLogin simulam erro; C.aprovar faz o ligar cair em "precisa-aprovar";
   C.semBateria vira Mac de mesa. Clique depois com setTimeout (ex.: K.$('#aj-avisos .switch').click()). */
__EXTRA__
var real=K.api;function ok(v){return new Promise(function(r){setTimeout(function(){r(JSON.parse(JSON.stringify(v)))},30)})}function err(m){return new Promise(function(_,j){setTimeout(function(){j(new Error(m))},30)})}
function mb(){var s=C.settings;return{abrirNoLogin:C.login,barra:s.iconeNaBarra,porcentagem:s.porcentagemNaBarra,soNaBarra:s.soNaBarra}}
function nt(){return{permitido:C.notif==='permitido'||C.notif==='provisorio',estado:C.notif}}
K.api=function(c,a){
if(c==='settings.get')return C.falhaGet?err('o Swift não respondeu (teste)'):ok(C.settings);
if(c==='settings.set'){if(C.falhaSet)return err('o disco não deixou gravar (teste)');Object.assign(C.settings,a||{});return ok(C.settings)}
if(c==='menubar.status')return ok(mb());
if(c==='menubar.loginItem'){if(C.falhaLogin)return err('O macOS não deixou: operação não permitida (teste).');C.login=a&&a.ligar?(C.aprovar?'precisa-aprovar':'ligado'):'desligado';return ok(mb())}
if(c==='notify.status'||c==='notify.test')return ok(nt());
if(c==='open.settings'||c==='open.url'||c==='app.show')return ok({ok:true});
if(c==='optimize.startupToggle'||c==='optimize.quit'||c==='optimize.run'||c==='uninstall.run'||c==='cleanup.clean'||c==='cleanup.purge'||c==='cleanup.emptyTrash')return err('recusado no cenário de teste');
if(C.semBateria&&c==='battery.now')return ok({present:false,status:'sem-bateria',percent:0,pluggedIn:true,designCycles:1000,cellsMv:[]});
if(C.semBateria&&c==='battery.info')return ok({model:'Mac mini (2018)',modelId:'Macmini8,1',designCycles:1000});
return real(c,a)};
K.cached=function(c,a){return K.api(c,a)};document.getElementById('sidebar').innerHTML='';document.dispatchEvent(new Event('DOMContentLoaded'));})();void 0
