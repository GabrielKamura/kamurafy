#!/usr/bin/env node
// Lista os textos da interface e do Swift que ainda não têm tradução em ui/i18n/<idioma>.json.
//   node tools/i18n-faltando.mjs            → relatório (sai com 0 mesmo faltando)
//   node tools/i18n-faltando.mjs --falhar   → sai com 1 se faltar algo (pra usar no CI)
//   node tools/i18n-faltando.mjs --json     → só a lista de chaves que faltam, em JSON
// A chave é o texto em português que está no código: K.t('...') no JS e L("...") no Swift.
// Texto novo: escreva K.t('Frase com {0} variável', valor) e rode isto pra ver o que traduzir.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);

function arquivos(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(p, ext));
    else if (p.endsWith(ext) && !p.includes('galeria') && !p.endsWith('i18n.js')) out.push(p);
  }
  return out;
}

/** desfaz os escapes de um texto entre aspas (JS ou Swift) */
function sem(s) {
  return s.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|n|t|'|"|\\)/g, (m, c, h1, h2) => {
    if (h1 || h2) return String.fromCodePoint(parseInt(h1 || h2, 16));
    return { n: '\n', t: '\t', "'": "'", '"': '"', '\\': '\\' }[c] ?? m;
  });
}

const chaves = new Map();   // chave → primeiro lugar onde aparece
function achar(file, re) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(re)) {
    const k = sem(m[1]);
    if (k.includes('\\(')) continue;   // interpolação do Swift não é chave
    if (!chaves.has(k)) chaves.set(k, `${path.relative(raiz, file)}:${src.slice(0, m.index).split('\n').length}`);
  }
}
for (const f of arquivos(path.join(raiz, 'ui/js'), '.js')) {
  achar(f, /K\.t\(\s*'((?:[^'\\]|\\.)*)'/g);
  achar(f, /K\.t\(\s*"((?:[^"\\]|\\.)*)"/g);
}
for (const f of arquivos(path.join(raiz, 'app/Sources'), '.swift')) achar(f, /\bL\("((?:[^"\\]|\\.)*)"/g);

let faltam = 0;
const lista = {};
for (const lang of ['en', 'es']) {
  const d = JSON.parse(fs.readFileSync(path.join(raiz, `ui/i18n/${lang}.json`), 'utf8'));
  const sem_ = [...chaves.keys()].filter((k) => typeof d[k] !== 'string' || !d[k]);
  lista[lang] = sem_;
  faltam += sem_.length;
  if (!args.includes('--json')) {
    console.log(`${lang}: ${chaves.size} textos no código, ${sem_.length} sem tradução`);
    for (const k of sem_.slice(0, 40)) console.log(`  ${JSON.stringify(k)}  (${chaves.get(k)})`);
    if (sem_.length > 40) console.log(`  … e mais ${sem_.length - 40}`);
  }
}
if (args.includes('--json')) console.log(JSON.stringify(lista, null, 1));
process.exitCode = args.includes('--falhar') && faltam ? 1 : 0;
