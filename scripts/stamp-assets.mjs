// Adds ?v=<version> to the site's own CSS/JS URLs in the deployed copy, so a
// new deploy never mixes with files a browser cached from the last one.
// Runs in the Pages workflow on the checked-out files (nothing is committed).
//
//   node scripts/stamp-assets.mjs <version>

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v = process.argv[2] || Date.now().toString(36);

const stampHtml = s => s.replace(/(href|src)="((?!https?:)[^"?#]+\.(?:css|js))"/g, `$1="$2?v=${v}"`);
const stampJs = s => s
    .replace(/(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3?v=${v}$2`)
    .replace(/new URL\((['"])(\.{1,2}\/[^'"?]+\.css)\1/g, `new URL($1$2?v=${v}$1`);

const files = ['index.html', 'script.js', ...(await fs.readdir(path.join(root, 'room'))).filter(f => f.endsWith('.js')).map(f => `room/${f}`)];
for (const f of files) {
    const p = path.join(root, f);
    const src = await fs.readFile(p, 'utf8');
    const out = f.endsWith('.html') ? stampHtml(src) : stampJs(src);
    if (out !== src) await fs.writeFile(p, out);
}
console.log(`stamped ${files.length} files with v=${v}`);
