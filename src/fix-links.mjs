// 今ある比較データ（data/*.json）の楽天リンクを、管理画面と同じ形（本人のアフィリエイトID入り）に作り直す。
// 値段や順位は変えない。使い方: node src/fix-links.mjs
// 2026-11-07 に、楽天APIのリンクのIDが管理画面のアカウントのIDと違うと分かったために作った。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rakutenLink, itemUrlOf } from './afflink.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fixed = 0;
const missed = [];
for (const file of (await readdir(path.join(ROOT, 'data'))).filter((f) => f.endsWith('.json'))) {
  const p = path.join(ROOT, 'data', file);
  const data = JSON.parse(await readFile(p, 'utf8'));
  for (const r of data.ranking) {
    const item = r.itemUrl ?? itemUrlOf(r.url);
    if (!item) {
      missed.push(`${file} ${r.name.slice(0, 30)}`);
      continue;
    }
    r.itemUrl = item.split('?')[0];
    r.url = rakutenLink(r.itemUrl);
    fixed++;
  }
  await writeFile(p, JSON.stringify(data, null, 2) + '\n');
}
console.log(`${fixed} 本のリンクを作り直しました${missed.length ? `（商品ページが分からない ${missed.length} 本）` : ''}`);
missed.forEach((m) => console.log('  ' + m));
