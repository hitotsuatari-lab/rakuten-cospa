// data/*.json から一覧ページ（docs/）と動画の概要欄テキスト（out/）を作る。
// 使い方: node src/build.mjs

import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { formatAmount, formatYen } from './amount.mjs';
import { outDir } from './outdir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'out');

const config = await loadSiteConfig();
const pages = [];
for (const file of (await readdir(path.join(ROOT, 'data'))).filter((f) => f.endsWith('.json'))) {
  const page = JSON.parse(await readFile(path.join(ROOT, 'data', file), 'utf8'));
  // 動画（videos/<slug>.json）で表示名を指定していれば、概要欄と一覧でも同じ名前を使う
  try {
    page.labels = JSON.parse(await readFile(path.join(ROOT, 'videos', file), 'utf8')).labels ?? {};
  } catch {
    page.labels = {};
  }
  pages.push(page);
}
pages.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));

await mkdir(DOCS, { recursive: true });
await mkdir(OUT, { recursive: true });
await writeFile(path.join(DOCS, '.nojekyll'), '');
await writeFile(path.join(DOCS, 'style.css'), css());
const site = await makeChannelAssets();
for (const p of pages) p.thumb = await makeThumbnail(p);
await writeFile(path.join(DOCS, 'index.html'), indexHtml(pages));
for (const p of pages) {
  await writeFile(path.join(DOCS, `${p.slug}.html`), topicHtml(p));
  // 動画と同じ日付とテーマのフォルダ（out/20261016_rice/ など）に入れる
  await mkdir(outDir(p), { recursive: true });
  await writeFile(path.join(outDir(p), '概要欄.txt'), description(p));
  await mkdir(path.join(outDir(p), 'インスタ'), { recursive: true });
  await writeFile(path.join(outDir(p), 'インスタ', 'キャプション.txt'), instaCaption(p));
}
console.log(`${pages.length} ページを docs/ に、概要欄テキストを out/<取得日>_<テーマ>/ に作りました`);

function topicHtml(p) {
  const max = Math.max(...p.ranking.map((r) => r.perServing));
  const rows = p.ranking
    .map(
      (r, i) => `
    <li class="item${i === 0 ? ' top' : ''}">
      <div class="rank">${i + 1}<span>位</span></div>
      <div class="body">
        <p class="name">${esc(shortName(r.name, 60))}</p>
        <p class="meta">${esc(r.shop)}｜${r.price.toLocaleString('ja-JP')}円 / ${formatAmount(r.amount, p.measure)}（${r.servings}食分）</p>
        <div class="per"><strong>${formatYen(r.perServing)}</strong>円 <span>/ ${esc(p.servingLabel)}</span></div>
        <div class="bar"><div style="width:${Math.round((r.perServing / max) * 100)}%"></div></div>
        ${r.reviewCount ? `<p class="review">レビュー ★${r.reviewAverage}（${r.reviewCount.toLocaleString('ja-JP')}件）</p>` : ''}
        <a class="btn" href="${esc(r.url)}" target="_blank" rel="sponsored noopener">楽天で見る</a>
      </div>
    </li>`,
    )
    .join('');
  return layout(
    p.title,
    `
  <a class="back" href="./">← 比較の一覧</a>
  <h1>${esc(p.title)}</h1>
  <p class="date">${formatDate(p.fetchedAt)} 時点の価格・安い順</p>
  ${p.sample ? '<p class="sample">これはサンプルデータです。実在の商品ではありません。</p>' : ''}
  <ol class="ranking">${rows}
  </ol>
  <p class="note">価格は調査時点のものです。最新の価格・送料はリンク先の商品ページで確認してください。${esc(p.servingLabel)}あたりの値段は、商品名に書かれた内容量から計算しています。</p>`,
  );
}

// YouTubeのチャンネルページと同じ並び：バナー → アイコンと名前 → ショートの一覧（新しい順に左上から）
function indexHtml(list) {
  const cards = list
    .map((p, i) => {
      const top = p.ranking[0];
      const thumb = p.thumb
        ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">`
        : `<span class="thumb-text">${esc(p.title)}</span>`;
      return `
    <li><a href="${esc(p.slug)}.html">
      <div class="thumb">${thumb}${i === 0 ? '<span class="new">最新</span>' : ''}</div>
      <p class="st">${esc(p.title)}</p>
      <p class="sm">${top ? `1位 ${esc(p.labels[1] ?? shortName(top.name, 18))} ${formatYen(top.perServing)}円・` : ''}${formatDate(p.fetchedAt)}${p.sample ? '・サンプル' : ''}</p>
    </a></li>`;
    })
    .join('');
  return layout(
    config.siteName,
    `
  ${site.banner ? `<div class="ch-banner"><img src="${esc(site.banner)}" alt=""></div>` : ''}
  <div class="ch-head">
    ${site.icon ? `<img class="ch-icon" src="${esc(site.icon)}" alt="">` : ''}
    <div class="ch-info">
      <h1>${esc(config.siteName)}</h1>
      <p class="ch-meta">${esc(site.handle ?? '')}${site.handle ? '・' : ''}ショート ${list.length} 本</p>
      ${site.description ? `<p class="ch-desc">${esc(site.description)}</p>` : ''}
      ${site.youtubeUrl ? `<a class="ch-yt" href="${esc(site.youtubeUrl)}" target="_blank" rel="noopener">YouTubeチャンネルを見る</a>` : ''}
    </div>
  </div>
  <nav class="ch-tabs"><span class="on">ショート</span></nav>
  <ul class="shorts">${cards}
  </ul>`,
    'wide',
  );
}

// チャンネルのアイコンとバナーを、ページ用の大きさにして docs/assets/ に置く
async function makeChannelAssets() {
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(path.join(ROOT, 'site.json'), 'utf8'));
  } catch {}
  await mkdir(path.join(DOCS, 'assets'), { recursive: true });
  const make = async (src, dest, vf) => {
    if (!src || !(await exists(path.resolve(ROOT, src)))) return null;
    const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', path.resolve(ROOT, src), '-vf', vf, '-q:v', '3', path.join(DOCS, 'assets', dest)]);
    return r.status === 0 ? `assets/${dest}` : null;
  };
  return {
    ...cfg,
    icon: await make(cfg.icon, 'icon.jpg', 'scale=176:176'),
    // パソコンのYouTubeと同じく、バナーは中央の帯（文字の入った部分）だけを使う
    banner: await make(cfg.banner, 'banner.jpg', 'crop=2048:338:0:407,scale=1600:-2'),
  };
}

// その比較のいちばん新しい動画の最初の画面（1.5秒目）をサムネイルにする
async function makeThumbnail(p) {
  let dirs = [];
  try {
    dirs = (await readdir(OUT)).filter((d) => d.endsWith(`_${p.slug}`)).sort().reverse();
  } catch {}
  for (const d of dirs) {
    const video = path.join(OUT, d, 'ショート動画.mp4');
    if (!(await exists(video))) continue;
    await mkdir(path.join(DOCS, 'thumbs'), { recursive: true });
    const r = spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-ss', '1.5', '-i', video, '-frames:v', '1',
      '-vf', 'scale=360:640', '-q:v', '3', path.join(DOCS, 'thumbs', `${p.slug}.jpg`)]);
    // 作り直したときにブラウザが古い画像を出さないよう、日付を付ける
    if (r.status === 0) return `thumbs/${p.slug}.jpg?v=${d.split('_')[0]}`;
  }
  return null;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// site.json の gaId（Googleアナリティクスの測定ID「G-」で始まる）があれば、全ページに計測タグを入れる。
// 「楽天で見る」のクリックは、アナリティクスの拡張計測（外部リンクのクリック）で自動で数えられる
function analyticsTag() {
  if (!site.gaId || !/^G-[A-Z0-9]+$/.test(site.gaId)) return '';
  return `
<script async src="https://www.googletagmanager.com/gtag/js?id=${site.gaId}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${site.gaId}');</script>`;
}

function layout(title, main, mainClass = '') {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="style.css">${analyticsTag()}
</head>
<body>
<p class="pr">PR｜このページは楽天アフィリエイトを利用しています</p>
<main${mainClass ? ` class="${mainClass}"` : ''}>${main}
</main>
<footer>${esc(config.siteName)}${site.gaId ? '<br><small>このサイトはアクセス解析にGoogleアナリティクス（Cookie）を使っています。集めた情報は個人を特定しない形で、サイトの改善に使います。</small>' : ''}</footer>
</body>
</html>
`;
}

function description(p) {
  const lines = p.ranking.map(
    (r, i) => `${i + 1}位 ${p.labels[i + 1] ?? shortName(r.name, 28)}　${p.servingLabel} ${formatYen(r.perServing)}円`,
  );
  return `【${p.title}】※PR
比較した商品の一覧はプロフィールのリンクから
${new URL(`${p.slug}.html`, config.siteUrl)}

${lines.join('\n')}

※価格は${formatDate(p.fetchedAt)}時点です。最新の価格は楽天の商品ページで確認してください。
※楽天アフィリエイトを利用しています。
※動画の一部はAIツールを使って作成しています。
${config.voiceCredit ? `音声: ${config.voiceCredit}\n` : ''}
#楽天 #コスパ #節約 #${config.siteName}
`;
}

// インスタのリール用。リンクは押せないので「プロフのリンク」へ案内する。
// ハッシュタグは少なめ（多すぎると表示されにくい／上限がある）。PR表記は1行目に置く
function instaCaption(p) {
  const name = p.name ?? p.title.split(/[ 　]/)[0];
  const lines = p.ranking.map(
    (r, i) => `${i + 1}位 ${p.labels[i + 1] ?? shortName(r.name, 24)}　${formatYen(r.perServing)}円`,
  );
  return `#PR 楽天アフィリエイトを利用しています

楽天で売れてる${name}、${p.servingLabel}あたり最安はどれ？

${lines.join('\n')}
（${p.servingLabel}あたりの値段）

比較した商品の一覧は、プロフィールのリンクから
→ 一覧の「${name}」のページへ

※価格は${formatDate(p.fetchedAt)}時点です。最新の価格は楽天の商品ページで確認してください。
※動画の一部はAIツールを使って作成しています。
${config.voiceCredit ? `音声: ${config.voiceCredit}\n` : ''}
#楽天 #コスパ #節約 #${name} #${config.siteName}
`;
}

// 【送料無料】などの飾りを外して短くする
function shortName(name, max) {
  const s = name
    .replace(/【[^】]*】|\[[^\]]*\]|［[^］]*］|＼[^／]*／|★|☆|◆|■/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'long' });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function loadSiteConfig() {
  // 動画の読み上げに使う声のクレジット（VOICEVOXの利用条件）
  let voiceCredit = null;
  try {
    voiceCredit = JSON.parse(await readFile(path.join(ROOT, 'video', 'voice.json'), 'utf8')).credit;
  } catch {}
  for (const name of ['config.json', 'config.example.json']) {
    try {
      const cfg = JSON.parse(await readFile(path.join(ROOT, name), 'utf8'));
      return { siteName: cfg.siteName ?? '比較ページ', siteUrl: cfg.siteUrl, voiceCredit };
    } catch {}
  }
  throw new Error('config.json も config.example.json も見つかりません');
}

function css() {
  return `:root{--bg:#f4faf7;--card:#fff;--text:#04342c;--sub:#3d6b60;--line:#cfe8de;--accent:#0f6e56;--bar:#5dcaa5;--btn:#0f6e56;--btn-text:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d1a17;--card:#14241f;--text:#e1f5ee;--sub:#9fc9bb;--line:#24443a;--accent:#5dcaa5;--bar:#1d9e75;--btn:#5dcaa5;--btn-text:#04342c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI",sans-serif;line-height:1.7}
main{max-width:640px;margin:0 auto;padding:8px 16px 32px}
.pr{margin:0;padding:6px 16px;font-size:12px;color:var(--sub);background:var(--card);border-bottom:1px solid var(--line);text-align:center}
h1{font-size:22px;margin:16px 0 4px;font-weight:600}
.lead,.date,.note{color:var(--sub);font-size:14px}
.sample{background:#faeeda;color:#633806;padding:8px 12px;border-radius:8px;font-size:14px}
.back{color:var(--accent);font-size:14px;text-decoration:none}
.ranking{list-style:none;padding:0;margin:16px 0}
.item{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.item.top{border:2px solid var(--accent)}
.rank{font-size:26px;font-weight:700;color:var(--accent);min-width:44px;line-height:1.2}
.rank span{font-size:13px}
.body{flex:1;min-width:0}
.name{margin:0;font-size:15px;font-weight:600;overflow-wrap:anywhere}
.meta,.review{margin:2px 0;font-size:13px;color:var(--sub)}
.per{margin-top:6px;font-size:14px}
.per strong{font-size:24px}
.per span{color:var(--sub)}
.bar{height:8px;background:var(--line);border-radius:4px;margin:4px 0 6px;overflow:hidden}
.bar div{height:100%;background:var(--bar)}
.item.top .bar div{background:var(--accent)}
.btn{display:inline-block;margin-top:8px;padding:8px 18px;background:var(--btn);color:var(--btn-text);border-radius:8px;text-decoration:none;font-size:14px;font-weight:600}
main.wide{max-width:1100px}
.ch-banner{margin-top:8px;border-radius:14px;overflow:hidden;aspect-ratio:6.2/1;min-height:72px}
.ch-banner img{width:100%;height:100%;object-fit:cover;display:block}
.ch-head{display:flex;gap:16px;align-items:center;margin:16px 0 8px}
.ch-icon{width:88px;height:88px;border-radius:50%;flex:none}
.ch-info{min-width:0}
.ch-info h1{margin:0;font-size:24px;font-weight:700;line-height:1.3}
.ch-meta{margin:2px 0;font-size:13px;color:var(--sub)}
.ch-desc{margin:4px 0 8px;font-size:14px;color:var(--sub)}
.ch-yt{display:inline-block;padding:7px 16px;border-radius:999px;background:var(--text);color:var(--bg);font-size:13px;font-weight:600;text-decoration:none}
.ch-tabs{border-bottom:1px solid var(--line);margin:12px 0 16px}
.ch-tabs .on{display:inline-block;padding:8px 2px;font-weight:700;border-bottom:3px solid var(--text)}
.shorts{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 10px}
.shorts a{color:var(--text);text-decoration:none;display:block}
.thumb{position:relative;aspect-ratio:9/16;border-radius:12px;overflow:hidden;background:var(--line)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font-weight:700}
.thumb .new{position:absolute;top:8px;right:8px;background:var(--accent);color:var(--btn-text);font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px}
.st{margin:6px 0 0;font-size:14px;font-weight:600;line-height:1.4}
.sm{margin:2px 0 0;font-size:12px;color:var(--sub);line-height:1.4}
@media (min-width:640px){.shorts{grid-template-columns:repeat(3,minmax(0,1fr))}.ch-icon{width:120px;height:120px}.ch-info h1{font-size:30px}}
@media (min-width:900px){.shorts{grid-template-columns:repeat(5,minmax(0,1fr))}}
footer{text-align:center;color:var(--sub);font-size:12px;padding:24px 0}
`;
}
