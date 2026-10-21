// 投稿用の成果物を入れるフォルダ: out/<データを取った日付>_<テーマ>/（例: out/20261016_rice/）
// 動画（render.mjs）と概要欄（build.mjs）が同じデータから同じフォルダを決められるよう、日付は取得日を使う。

// YouTube に投稿し終えたフォルダは、名前の最後に「_投稿済」を付ける（2026-10-21 に本人が決めた）。付いていればそちらを使う。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function outDir(data) {
  const ymd = new Date(data.fetchedAt)
    .toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '');
  const dir = path.join(ROOT, 'out', `${ymd}_${data.slug}`);
  return fs.existsSync(dir + '_投稿済') ? dir + '_投稿済' : dir;
}
