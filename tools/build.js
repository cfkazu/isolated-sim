// ブラウザでそのまま開ける 1 ファイル版（dist/index.html）をつくる。
// CSS をインラインにし、ES モジュールを依存順に連結して 1 つの <script type="module"> にまとめる。
// 使い方: node tools/build.js [--fragment]
//   --fragment  <!doctype>/<html>/<head>/<body> を付けない（外側の骨組みを自動で付けるホスティング向け）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fragment = process.argv.includes('--fragment');

// main.js から import をたどり、依存される側が先に来る順（帰りがけ順）に並べる
function moduleOrder(entry) {
  const order = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(join(root, file), 'utf8');
    for (const m of src.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)) {
      visit(posix.normalize(posix.join(posix.dirname(file), m[1])));
    }
    order.push(file);
  };
  visit(entry);
  return order;
}
const MODULES = moduleOrder('src/main.js');

const declared = new Map();
const js = MODULES.map((file) => {
  let src = readFileSync(join(root, file), 'utf8');
  src = src.replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '');
  src = src.replace(/^export (?=(const|let|function|class|async function) )/gm, '');
  if (/^(import|export)\b/m.test(src)) throw new Error(`${file}: 変換できない import/export が残っている`);
  // モジュール間でトップレベルの名前がぶつかると連結後に壊れるので検出する
  for (const m of src.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (declared.has(m[1])) throw new Error(`トップレベルの名前 ${m[1]} が ${declared.get(m[1])} と ${file} で重複`);
    declared.set(m[1], file);
  }
  return `// ── ${file} ──\n${src}`;
}).join('\n');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/\s*<script type="module" src="src\/main.js"><\/script>\s*/, '\n');
const inner = `${title}\n<style>\n${css}</style>\n${body}<script type="module">\n${js}</script>\n`;
const out = fragment
  ? inner
  : `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n${title}\n<style>\n${css}</style>\n</head>\n<body>${body}<script type="module">\n${js}</script>\n</body>\n</html>\n`;

mkdirSync(join(root, 'dist'), { recursive: true });
const dest = join(root, 'dist', fragment ? 'island.html' : 'index.html');
writeFileSync(dest, out);
console.log(`${dest} (${(out.length / 1024).toFixed(0)} KB, ${MODULES.length} モジュール)`);
