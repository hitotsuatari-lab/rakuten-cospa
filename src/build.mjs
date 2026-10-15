// data/*.json から一覧ページ（docs/）と動画の概要欄テキスト（out/）を作る。
// 使い方: node src/build.mjs

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAmount } from './amount.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'out');

const config = await loadSiteConfig();
const pages = [];
for (const file of (await readdir(path.join(ROOT, 'data'))).filter((f) => f.endsWith('.json'))) {
  pages.push(JSON.parse(await readFile(path.join(ROOT, 'data', file), 'utf8')));
}
pages.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));

await mkdir(DOCS, { recursive: true });
await mkdir(OUT, { recursive: true });
await writeFile(path.join(DOCS, '.nojekyll'), '');
await writeFile(path.join(DOCS, 'style.css'), css());
await writeFile(path.join(DOCS, 'index.html'), indexHtml(pages));
for (const p of pages) {
  await writeFile(path.join(DOCS, `${p.slug}.html`), topicHtml(p));
  await writeFile(path.join(OUT, `${p.slug}-概要欄.txt`), description(p));
}
console.log(`${pages.length} ページを docs/ に、概要欄テキストを out/ に作りました`);

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
        <div class="per"><strong>${r.perServing.toFixed(1)}</strong>円 <span>/ ${esc(p.servingLabel)}</span></div>
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

// 一番新しい比較（＝最新の動画）を上に大きく出し、残りを一覧にする
function indexHtml(list) {
  const [latest, ...rest] = list;
  const top = latest?.ranking[0];
  const featured = latest
    ? `
  <a class="featured" href="${esc(latest.slug)}.html">
    <span class="badge">最新の比較</span>
    <span class="ft">${esc(latest.title)}</span>
    ${top ? `<span class="fs">1位 ${esc(shortName(top.name, 24))}　${esc(latest.servingLabel)} ${top.perServing.toFixed(1)}円</span>` : ''}
    <span class="fd">${formatDate(latest.fetchedAt)} 時点${latest.sample ? '・サンプル' : ''}</span>
    <span class="btn">ランキングを見る</span>
  </a>`
    : '';
  const items = rest
    .map(
      (p) => `
    <li><a href="${esc(p.slug)}.html"><span class="t">${esc(p.title)}</span><span class="d">${formatDate(p.fetchedAt)}${p.sample ? '・サンプル' : ''}</span></a></li>`,
    )
    .join('');
  return layout(
    config.siteName,
    `
  <h1>${esc(config.siteName)}</h1>
  <p class="lead">楽天の売れ筋を「1個あたり・1食あたり」の値段で比べています。動画で紹介した商品はここから見られます。</p>${featured}
  ${rest.length ? `<h2>これまでの比較</h2>
  <ul class="topics">${items}
  </ul>` : ''}`,
  );
}

function layout(title, main) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<p class="pr">PR｜このページは楽天アフィリエイトを利用しています</p>
<main>${main}
</main>
<footer>${esc(config.siteName)}</footer>
</body>
</html>
`;
}

function description(p) {
  const lines = p.ranking.map(
    (r, i) => `${i + 1}位 ${shortName(r.name, 28)}　${p.servingLabel} ${r.perServing.toFixed(1)}円`,
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
.featured{display:block;margin:16px 0 8px;padding:18px;background:var(--card);border:2px solid var(--accent);border-radius:14px;color:var(--text);text-decoration:none}
.featured span{display:block}
.featured .badge{display:inline-block;font-size:12px;font-weight:600;color:var(--btn-text);background:var(--accent);padding:2px 10px;border-radius:999px}
.featured .ft{font-size:20px;font-weight:700;margin-top:8px}
.featured .fs{font-size:14px;margin-top:4px}
.featured .fd{font-size:13px;color:var(--sub)}
.featured .btn{display:inline-block}
h2{font-size:16px;margin:24px 0 8px;color:var(--sub);font-weight:600}
.topics{list-style:none;padding:0}
.topics a{display:flex;justify-content:space-between;gap:12px;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;color:var(--text);text-decoration:none}
.topics .d{color:var(--sub);font-size:13px;white-space:nowrap}
footer{text-align:center;color:var(--sub);font-size:12px;padding:24px 0}
`;
}
