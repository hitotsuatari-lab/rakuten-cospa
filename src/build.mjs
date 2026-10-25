// data/*.json から一覧ページ（docs/）と動画の投稿情報（out/<取得日>_<テーマ>/投稿情報.txt）を作る。
// 使い方: node src/build.mjs

import { readFile, writeFile, mkdir, readdir, access, rm } from 'node:fs/promises';
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
    const video = JSON.parse(await readFile(path.join(ROOT, 'videos', file), 'utf8'));
    page.labels = video.labels ?? {};
    page.commentDraft = video.commentDraft === true;
    // 動画の「ひとこと」を比較ページにも出す（仮の文のときは出さない）
    page.comment = page.commentDraft ? [] : (video.comment ?? []);
  } catch {
    page.labels = {};
  }
  // 分野（食品・季節・日用品など）は topics/<slug>.json の "category"。無ければ食品
  try {
    page.category = JSON.parse(await readFile(path.join(ROOT, 'topics', file), 'utf8')).category ?? 'food';
  } catch {
    page.category = 'food';
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
await writeFile(path.join(DOCS, 'index.html'), indexHtml(pages, null));
// 分野ごとの一覧ページ（例 food.html）。比較が1本もない分野は、タブもページも作らない
for (const c of usedCategories()) {
  if (pages.some((p) => p.slug === c.id)) throw new Error(`分野のID「${c.id}」が比較のslugと同じです。site.json の categories を直してください`);
  await writeFile(path.join(DOCS, `${c.id}.html`), indexHtml(pages.filter((p) => p.category === c.id), c));
}
for (const p of pages) {
  await writeFile(path.join(DOCS, `${p.slug}.html`), topicHtml(p));
  // 動画と同じ日付とテーマのフォルダ（out/20261016_rice/ など）に入れる
  await mkdir(outDir(p), { recursive: true });
  // 投稿の画面で上から順に入力できる形（YouTube自動作成の投稿情報.txt と同じ形。2026-10-22 に本人が頼んだ）
  await writeFile(path.join(outDir(p), '投稿情報.txt'), '﻿' + postInfo(p));
  await rm(path.join(outDir(p), '概要欄.txt'), { force: true });
  await mkdir(path.join(outDir(p), 'インスタ'), { recursive: true });
  await writeFile(path.join(outDir(p), 'インスタ', 'キャプション.txt'), instaCaption(p));
  await writeFile(path.join(outDir(p), 'インスタ', 'ストーリーズ用リンク.txt'), storyLink(p));
  await makeThreadsPost(p);
}
console.log(`${pages.length} ページを docs/ に、投稿情報.txt を out/<取得日>_<テーマ>/ に作りました`);

// 比較ページ。SNSから来た人がスマホの最初の画面で決められるよう、
// 一番上に「結論」（1位の写真・値段・大きなボタン）、次に動画の「ひとこと」、その下にランキング。
// 結論の枠が見えなくなったら、画面の下に1位のボタンを出す。
// 楽天へのリンクには data-pos（結論／順位／下のボタン）を付け、アナリティクスで「どこが押されたか」を数える
function topicHtml(p) {
  const max = Math.max(...p.ranking.map((r) => r.perServing));
  const nameOf = (r, i, n) => p.labels[i + 1] ?? shortName(r.name, n);
  const amountOf = (r) =>
    r.amountLabel ? esc(r.amountLabel) : `${formatAmount(r.amount, p.measure)}${p.servingLabel.includes('食') ? `（${r.servings}食分）` : ''}`;
  const link = (r, pos, cls, inner) =>
    `<a class="${cls}" href="${esc(r.url)}" target="_blank" rel="sponsored noopener" data-pos="${pos}">${inner}</a>`;
  const rows = p.ranking
    .map(
      (r, i) => `
    <li class="item${i === 0 ? ' top' : ''}">
      <div class="rank">${i + 1}<span>位</span></div>
      <div class="body">
        <p class="name">${esc(nameOf(r, i, 60))}</p>
        <p class="meta">${esc(r.shop)}｜${r.price.toLocaleString('ja-JP')}円 / ${amountOf(r)}</p>
        ${badges(r)}
        <div class="per"><strong>${formatYen(r.perServing)}</strong>円 <span>/ ${esc(p.servingLabel)}</span></div>
        <div class="bar"><div style="width:${Math.round((r.perServing / max) * 100)}%"></div></div>
        ${r.reviewCount ? `<p class="review">レビュー ★${r.reviewAverage}（${r.reviewCount.toLocaleString('ja-JP')}件）</p>` : ''}
        ${link(r, `rank${i + 1}`, 'btn', '楽天で見る')}
      </div>
      ${r.image ? link(r, `rank${i + 1}-pic`, 'pic', `<img src="${esc(r.image)}" alt="${esc(nameOf(r, i, 30))}" loading="lazy">`) : ''}
    </li>`,
    )
    .join('');
  const top = p.ranking[0];
  const hero = top
    ? `
  <section class="hero" id="hero">
    <p class="hero-label">結論：${esc(p.servingLabel)}あたり最安は</p>
    ${top.image ? link(top, 'hero-pic', 'hero-pic', `<img src="${esc(top.image)}" alt="${esc(nameOf(top, 0, 30))}">`) : ''}
    <p class="hero-name">${esc(nameOf(top, 0, 40))}</p>
    <p class="hero-per"><strong>${formatYen(top.perServing)}</strong>円 <span>/ ${esc(p.servingLabel)}</span></p>
    <p class="hero-meta">${top.price.toLocaleString('ja-JP')}円・${amountOf(top)}${top.reviewCount ? `・★${top.reviewAverage}（${top.reviewCount.toLocaleString('ja-JP')}件）` : ''}</p>
    ${badges(top)}
    ${link(top, 'hero', 'hero-btn', '楽天で1位の商品を見る')}
    <a class="hero-more" href="#ranking">2位〜${p.ranking.length}位も見る ↓</a>
  </section>`
    : '';
  const comment = p.comment?.length
    ? `
  <section class="comment">
    <p class="comment-tag">ひとこと</p>
    ${p.comment.map((l) => `<p>${esc(l)}</p>`).join('\n    ')}
  </section>`
    : '';
  const sticky = top
    ? `
  <div class="sticky" id="sticky" hidden>
    <span class="sticky-text">1位 ${esc(nameOf(top, 0, 18))}<br><b>${formatYen(top.perServing)}円</b> / ${esc(p.servingLabel)}</span>
    ${link(top, 'sticky', 'sticky-btn', '楽天で見る')}
  </div>`
    : '';
  return layout(
    p.title,
    `
  <a class="back" href="./">← 比較の一覧</a>
  <h1>${esc(p.title)}</h1>
  <p class="date">${formatDate(p.fetchedAt)} 時点の価格・安い順</p>
  ${p.sample ? '<p class="sample">これはサンプルデータです。実在の商品ではありません。</p>' : ''}${hero}${comment}
  <h2 class="rank-title" id="ranking">${esc(p.servingLabel)}あたりの値段ランキング</h2>
  <ol class="ranking">${rows}
  </ol>
  <p class="note">価格は調査時点のものです。最新の価格・送料・ポイントはリンク先の商品ページで確認してください。${esc(p.servingLabel)}あたりの値段は、商品名に書かれた内容量から計算しています。</p>${sticky}`,
  );
}

// 「送料込み」と「ポイント◯倍」の印。ポイントは期限が過ぎたらページ側の小さなスクリプトで隠す
function badges(r) {
  const b = [];
  if (r.postageFlag === 0) b.push('<span class="badge">送料込み</span>');
  if (r.pointRate > 1 && r.pointRateEndTime) {
    const end = r.pointRateEndTime.replace(' ', 'T') + ':00+09:00';
    if (new Date(end) > new Date()) {
      const [, m, d, hm] = r.pointRateEndTime.match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/) ?? [];
      b.push(`<span class="badge pt" data-end="${end}">ポイント${r.pointRate}倍${m ? `（${+m}/${+d} ${hm}まで）` : ''}</span>`);
    }
  }
  return b.length ? `<p class="badges">${b.join('')}</p>` : '';
}

// site.json の categories のうち、比較が1本以上ある分野（並びは site.json の順）
function usedCategories() {
  return (site.categories ?? []).filter((c) => pages.some((p) => p.category === c.id));
}

// YouTubeのチャンネルページと同じ並び：バナー → アイコンと名前 → タブ → ショートの一覧（新しい順に左上から）。
// active が null ならトップ（すべて）、分野を渡すとその分野だけの一覧になる
function indexHtml(list, active) {
  const newest = pages[0];
  const tabs = [`<a href="./"${active ? '' : ' class="on"'}>すべて</a>`]
    .concat(usedCategories().map((c) => `<a href="${esc(c.id)}.html"${active?.id === c.id ? ' class="on"' : ''}>${esc(c.name)}</a>`))
    .join('');
  const cards = list
    .map((p) => {
      const i = p === newest ? 0 : 1;
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
    active ? `${active.name}｜${config.siteName}` : config.siteName,
    `
  ${site.banner ? `<div class="ch-banner"><img src="${esc(site.banner)}" alt=""></div>` : ''}
  <div class="ch-head">
    ${site.icon ? `<img class="ch-icon" src="${esc(site.icon)}" alt="">` : ''}
    <div class="ch-info">
      <h1>${esc(config.siteName)}</h1>
      <p class="ch-meta">${esc(site.handle ?? '')}${site.handle ? '・' : ''}ショート ${pages.length} 本</p>
      ${site.description ? `<p class="ch-desc">${esc(site.description)}</p>` : ''}
      ${site.youtubeUrl ? `<a class="ch-yt" href="${esc(site.youtubeUrl)}" target="_blank" rel="noopener">YouTubeチャンネルを見る</a>` : ''}
    </div>
  </div>
  ${active ? '' : latestBox(newest)}
  <nav class="ch-tabs">${tabs}</nav>
  <ul class="shorts">${cards}
  </ul>`,
    'wide',
  );
}

// トップ（すべて）の一番上に出す「最新の動画の比較」。YouTubeのリンク欄から来た人が、
// 見たばかりの動画の1位にすぐ行けるよう、比較ページと楽天の1位の両方へのボタンを置く
function latestBox(p) {
  if (!p) return '';
  const top = p.ranking[0];
  return `
  <section class="latest">
    ${p.thumb ? `<a class="latest-thumb" href="${esc(p.slug)}.html"><img src="${esc(p.thumb)}" alt=""></a>` : ''}
    <div class="latest-body">
      <p class="latest-label">最新の比較</p>
      <p class="latest-title">${esc(p.title)}</p>
      ${top ? `<p class="latest-top">1位 ${esc(p.labels[1] ?? shortName(top.name, 24))}<br><b>${formatYen(top.perServing)}円</b> / ${esc(p.servingLabel)}</p>` : ''}
      <div class="latest-btns">
        ${top ? `<a class="go" href="${esc(top.url)}" target="_blank" rel="sponsored noopener" data-pos="latest-top1">楽天で1位を見る</a>` : ''}
        <a class="see" href="${esc(p.slug)}.html">5位まで比べる</a>
      </div>
    </div>
  </section>`;
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
    dirs = (await readdir(OUT)).filter((d) => d.endsWith(`_${p.slug}`) || d.endsWith(`_${p.slug}_投稿済`)).sort().reverse();
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

// ページ共通の小さなスクリプト
// ・期限が過ぎた「ポイント◯倍」を隠す（ページは作った時のままなので、見た時点で判断する）
// ・結論の枠が画面から消えたら、下に1位のボタンを出す
// ・楽天へのリンクが押されたら、どのボタンか（data-pos）をアナリティクスに「rakuten_click」として送る
function pageScript() {
  return `
document.querySelectorAll('.pt[data-end]').forEach(function(e){if(new Date(e.dataset.end)<new Date())e.remove();});
var hero=document.getElementById('hero'),sticky=document.getElementById('sticky');
if(hero&&sticky&&'IntersectionObserver' in window){new IntersectionObserver(function(es){sticky.hidden=es[0].isIntersecting;}).observe(hero);document.body.classList.add('has-sticky');}
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a[data-pos]');if(a&&window.gtag)gtag('event','rakuten_click',{pos:a.dataset.pos,page:location.pathname});});
`;
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
<script>${pageScript()}</script>
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

// YouTube Studio で上から順に入力するための1枚。コピーする部分は「ここから」「ここまで」で囲む
function postInfo(p) {
  const name = p.name ?? p.title.split(/[ 　]/)[0];
  const block = (s) => `――――― ここから ―――――\n${s.trim()}\n――――― ここまで ―――――`;
  const tags = ['楽天', 'コスパ', '節約', '比較', name, `${p.servingLabel}あたり`, config.siteName];
  return `YouTube の「作成」→「ショート動画をアップロード」で、上から順に入力してください。
「ここから」と「ここまで」の間をコピーして貼り付けます（線そのものは入れません）。
${p.commentDraft ? '\n★ 動画の「ひとこと」が仮の文のままです（videos の commentDraft）。投稿の前に書き換えて、動画を作り直してください。\n' : ''}
■ 動画ファイル
ショート動画.mp4

■ タイトル（100文字以内）
${block(`楽天で売れてる${name}、${p.servingLabel}あたり最安は？`)}

ほかのタイトル案（こちらに差し替えても大丈夫です）:
・【${p.title}】
・${name}は${p.servingLabel}あたりいくら？楽天の売れ筋を比べてみた

■ 説明
${block(description(p))}

■ サムネイル
ショートは動画の中の場面から選びます（スマホの YouTube アプリで、アップロードのときに選べます）

■ 視聴者
いいえ、子ども向けではありません

■ 詳細 → タグ（カンマ区切りのまま貼り付け）
${block(tags.join(','))}

■ 詳細 → 言語
日本語

■ 詳細 → カテゴリ
ハウツーとスタイル

■ 詳細 → 有料プロモーション
チェックを入れる（楽天アフィリエイトの紹介動画のため。日本のステマ規制対策）

■ 詳細 → 改変されたコンテンツ
いいえ（値段のランキングと背景の絵で、実在の人物・出来事と見間違える映像ではないため）

■ 公開設定
まず「非公開」か「限定公開」で上げ、スマホで見て問題なければ「公開」または「予約」に

■ インスタ（リール）
インスタ フォルダの リール動画.mp4 と キャプション.txt を使います（BGMはインスタのアプリで付けます）
リールを出したら、ストーリーズにも載せて「リンク」スタンプを付けます（貼るURLは インスタ フォルダの ストーリーズ用リンク.txt）

■ Threads
Threads投稿文.txt の文を投稿します（SNS投稿ランチャーの下書きにも入っています）。比較ページへのリンク付きです
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

// SNSから比較ページへ直接案内するURL。入口ごとの目印（utm）で、アナリティクスでどこから来たかを見分ける
function pageUrl(p, source, medium) {
  const u = new URL(`${p.slug}.html`, config.siteUrl);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', p.slug);
  return u.toString();
}

// インスタのストーリーズの「リンク」スタンプに貼るURL（ストーリーズのリンクは押せる）
function storyLink(p) {
  return `インスタのストーリーズに、リール動画（またはその一部）を載せて「リンク」スタンプを付け、次のURLを貼ってください。
スタンプの文字は「1位の商品を見る」などにすると押されやすくなります。

${pageUrl(p, 'instagram', 'story')}
`;
}

// Threads の投稿文（本文のリンクが押せる）。比較1本につき1回だけ、SNS投稿ランチャーの受け取りフォルダに置く。
// 同じフォルダに「Threads投稿文.txt」があれば作り直さない（ランチャーの下書きが何度も増えないように）
async function makeThreadsPost(p) {
  const LAUNCHER_INBOX = 'C:/SNS投稿ランチャー/受け取り';
  const marker = path.join(outDir(p), 'Threads投稿文.txt');
  if (await exists(marker)) return;
  const name = p.name ?? p.title.split(/[ 　]/)[0];
  const url = pageUrl(p, 'threads', 'social');
  const body = (n) => {
    const lines = p.ranking.slice(0, n).map((r, i) => `${i + 1}位 ${p.labels[i + 1] ?? shortName(r.name, 20)}　${formatYen(r.perServing)}円`);
    return [
      `【PR】楽天で売れてる${name}、${p.servingLabel}あたり最安はどれ？`,
      '',
      ...lines,
      ...(p.comment?.length ? ['', p.comment.join('。').replace(/。。/g, '。')] : []),
      '',
      `${p.ranking.length}位までの比較と商品はこちら`,
      url,
      '',
      '楽天アフィリエイトを利用しています',
      '#楽天',
    ].join('\n');
  };
  // Threads は1投稿500文字まで。長いときは載せる順位を減らす
  let n = 3;
  while (n > 1 && body(n).length > 500) n--;
  const text = body(n);
  await writeFile(marker, text + '\n');
  if (await exists(LAUNCHER_INBOX)) {
    const ymd = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '');
    const posted = path.basename(outDir(p)).endsWith('_投稿済');
    const json = { 分野: '楽天', テーマ: `${p.title}（${posted ? 'YouTube投稿済み' : 'YouTube未投稿'}）`, 投稿: [{ 投稿先: 'Threads', 本文: text }] };
    await writeFile(path.join(LAUNCHER_INBOX, `${ymd}_楽天_${name}.json`), JSON.stringify(json, null, 2));
  }
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
.pic{flex:none;width:96px;height:96px;border-radius:10px;overflow:hidden;background:#fff;border:1px solid var(--line);align-self:flex-start}
.pic img{width:100%;height:100%;object-fit:contain;display:block}
@media (min-width:640px){.pic{width:128px;height:128px}}
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
.hero{background:var(--card);border:2px solid var(--accent);border-radius:16px;padding:16px;margin:14px 0;text-align:center}
.hero-label{margin:0;font-size:14px;font-weight:700;color:var(--accent)}
.hero-pic{display:block;width:180px;height:180px;margin:10px auto;border-radius:12px;overflow:hidden;background:#fff;border:1px solid var(--line)}
.hero-pic img{width:100%;height:100%;object-fit:contain;display:block}
.hero-name{margin:4px 0 0;font-size:17px;font-weight:700;line-height:1.4}
.hero-per{margin:2px 0;font-size:15px}.hero-per strong{font-size:34px}.hero-per span{color:var(--sub)}
.hero-meta{margin:0;font-size:13px;color:var(--sub)}
.hero .badges{justify-content:center}
.hero-btn{display:block;margin:12px 0 6px;padding:14px;background:#bf0000;color:#fff;border-radius:12px;text-decoration:none;font-size:17px;font-weight:700}
.hero-more{font-size:14px;color:var(--accent);text-decoration:none}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}
.badge{font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;background:#e1f5ee;color:#085041}
.badge.pt{background:#fdecec;color:#a10000}
.comment{background:var(--card);border-left:4px solid var(--accent);border-radius:0;padding:10px 14px;margin:0 0 14px}
.comment-tag{margin:0 0 4px;font-size:12px;font-weight:700;color:var(--accent)}
.comment p{margin:0;font-size:15px}
.rank-title{font-size:17px;margin:20px 0 8px}
.sticky{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border-top:1px solid var(--line);box-shadow:0 -4px 12px rgba(0,0,0,.08);z-index:10}
.sticky[hidden]{display:none}
.sticky-text{flex:1;font-size:13px;line-height:1.4}.sticky-text b{font-size:16px}
.sticky-btn{flex:none;padding:10px 16px;background:#bf0000;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}
body.has-sticky footer{padding-bottom:90px}
.latest{display:flex;gap:14px;background:var(--card);border:2px solid var(--accent);border-radius:16px;padding:14px;margin:16px 0 4px}
.latest-thumb{flex:none;width:110px;aspect-ratio:9/16;border-radius:10px;overflow:hidden;background:var(--line)}
.latest-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.latest-body{min-width:0;display:flex;flex-direction:column;gap:4px}
.latest-label{margin:0;font-size:12px;font-weight:700;color:var(--accent)}
.latest-title{margin:0;font-size:17px;font-weight:700;line-height:1.4}
.latest-top{margin:0;font-size:14px}
.latest-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.latest-btns a{padding:9px 14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px}
.latest-btns .go{background:#bf0000;color:#fff}.latest-btns .see{background:var(--bg);color:var(--accent);border:1px solid var(--accent)}
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
.ch-tabs{border-bottom:1px solid var(--line);margin:12px 0 16px;white-space:nowrap;overflow-x:auto}
.ch-tabs a{display:inline-block;padding:8px 2px;margin-right:22px;color:var(--sub);font-weight:600;text-decoration:none;border-bottom:3px solid transparent}
.ch-tabs a.on{color:var(--text);font-weight:700;border-bottom-color:var(--text)}
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
