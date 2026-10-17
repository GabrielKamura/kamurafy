/* Kamurafy — ponte com o Swift. Contrato de cada comando em docs/ponte.md. */
'use strict';

K.inApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kamurafy);

/**
 * Chama um comando do lado Swift e devolve o objeto já decodificado.
 *   const b = await K.api('battery.now')
 * Erros viram exceção com a mensagem do Swift.
 */
K.api = async function (cmd, args) {
  if (!K.inApp) throw new Error('Fora do app: abra pelo Kamurafy.app (ou tools/foto.sh).');
  let raw;
  try {
    raw = await window.webkit.messageHandlers.kamurafy.postMessage({ cmd, args: args || {} });
  } catch (e) {
    /* a mensagem do Swift vem em português; a tradução fica no catálogo (o original segue em e.original) */
    const msg = String((e && e.message) || e);
    const err = new Error(K.t ? K.t(msg) : msg);
    err.original = msg;
    throw err;
  }
  return raw == null ? null : JSON.parse(raw);
};

/** Mesma coisa, mas guarda a resposta por alguns segundos (várias partes da tela pedem o mesmo). */
K.cached = (function () {
  const store = new Map();
  return async function (cmd, args, ttlMs = 3000) {
    const key = cmd + JSON.stringify(args || {});
    const hit = store.get(key);
    if (hit && performance.now() - hit.t < ttlMs) return hit.p;
    const p = K.api(cmd, args);
    store.set(key, { t: performance.now(), p });
    p.catch(() => store.delete(key));
    return p;
  };
})();

/** Configurações (settings.get / settings.set), com cópia local pra leitura rápida. */
K.settings = {
  value: null,
  async load() { this.value = await K.api('settings.get'); return this.value; },
  async set(patch) { this.value = await K.api('settings.set', patch); return this.value; },
};
