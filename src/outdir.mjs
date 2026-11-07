// 投稿用の成果物を入れるフォルダ: out/<データを取った日付>_<テーマ>/（例: out/20261016_rice/）
// 動画（render.mjs）と概要欄（build.mjs）が同じデータから同じフォルダを決められるよう、日付は取得日を使う。

// YouTube に投稿し終えたフォルダは、名前の最後に「_投稿済」を付ける（2026-10-21 に本人が決めた）。付いていればそちらを使う。
// 2026-11-04 から、投稿済みのフォルダは Google ドライブ（DRIVE_DONE）へ移す（PC の容量が小さいため。本人が決めた）。
// 移したフォルダの名前は out/ドライブへ移したもの.txt に1行ずつ残す（スキル toukouzumi-katazuke の move-to-drive.ps1 が書く）。
// ドライブが起動していないときも「移したもの」と分かるよう、ドライブにあるかではなく、この一覧で判断する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'out');
export const DRIVE_DONE = 'G:\\マイドライブ\\Claudeの仕事\\Shorts完成品\\投稿済み\\ひとつあたり研究所';
const MOVED_LIST = path.join(OUT, 'ドライブへ移したもの.txt');

function movedNames() {
  try {
    return fs.readFileSync(MOVED_LIST, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function outDir(data) {
  const ymd = new Date(data.fetchedAt)
    .toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '');
  const dir = path.join(OUT, `${ymd}_${data.slug}`);
  if (fs.existsSync(dir + '_投稿済')) return dir + '_投稿済';
  if (movedNames().includes(path.basename(dir) + '_投稿済')) return path.join(DRIVE_DONE, path.basename(dir) + '_投稿済');
  return dir;
}

// ドライブへ移した（投稿が終わった）フォルダか
export function isMoved(dir) {
  return path.dirname(dir) === DRIVE_DONE;
}
