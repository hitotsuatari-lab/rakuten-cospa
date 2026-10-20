// 楽天市場商品検索API（2026年の新仕様）から商品を取り、1食あたりの値段で並べて data/<slug>.json に保存する。
// 使い方: node src/fetch.mjs topics/pasta.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAmount, parseCount } from './amount.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

const topicArg = process.argv[2];
if (!topicArg) {
  console.error('使い方: node src/fetch.mjs topics/pasta.json');
  process.exit(1);
}

const config = await loadConfig();
const topic = JSON.parse(await readFile(path.resolve(ROOT, topicArg), 'utf8'));
const measure = topic.measure ?? 'weight';

const rawItems = [];
for (let page = 1; page <= (topic.pages ?? 1); page++) {
  if (page > 1) await sleep(1100); // 1秒に1回までの制限を守る
  rawItems.push(...(await searchItems(page)));
}

const seen = new Set();
const ranked = [];
const needsCheck = [];
for (const item of rawItems) {
  if (seen.has(item.itemCode)) continue;
  seen.add(item.itemCode);
  if ((topic.exclude ?? []).some((w) => item.itemName.includes(w))) continue;
  // "must" に書いた言葉が商品名に無いものは除く（クリスマスケーキに「お歳暮」のケーキが混ざるのを防ぐ）
  if ((topic.must ?? []).some((w) => !item.itemName.includes(w))) continue;

  const { amount, amountLabel } = readAmount(item.itemName);
  if (!amount) {
    needsCheck.push(item.itemName);
    continue;
  }
  const servings = amount / (topic.perServing ?? 1);
  ranked.push({
    name: item.itemName,
    shop: item.shopName,
    price: item.itemPrice,
    amount,
    ...(amountLabel ? { amountLabel } : {}),
    servings: Math.round(servings * 10) / 10,
    perServing: Math.round((item.itemPrice / servings) * 10) / 10,
    url: item.affiliateUrl || item.itemUrl,
    reviewCount: item.reviewCount,
    reviewAverage: item.reviewAverage,
  });
}

ranked.sort((a, b) => a.perServing - b.perServing);

const out = {
  slug: topic.slug,
  title: topic.title,
  name: topic.name,
  measure,
  perServing: topic.perServing,
  servingLabel: topic.servingLabel,
  fetchedAt: new Date().toISOString(),
  sample: false,
  ranking: ranked.slice(0, topic.top ?? 5),
};

await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(path.join(ROOT, 'data', `${topic.slug}.json`), JSON.stringify(out, null, 2) + '\n');

console.log(`取得 ${rawItems.length} 件 → 比較できた ${ranked.length} 件、上位 ${out.ranking.length} 件を保存しました`);
out.ranking.forEach((r, i) => console.log(`  ${i + 1}位 ${r.perServing}円  ${r.name.slice(0, 40)}`));
if (needsCheck.length) {
  console.log(`\n内容量を読み取れず除外した商品 ${needsCheck.length} 件（必要なら topics の exclude や商品名を確認）:`);
  needsCheck.slice(0, 10).forEach((n) => console.log(`  - ${n.slice(0, 60)}`));
}
console.log('\n※公開前に、上位の商品名と内容量が正しいか目で確認してください。');

// 重さ・量（weight / volume）か、数（count）。数のときは topic の "unit"（品・人前・号など）を数える。
// "goToPersons": true なら、ケーキの号を少なめの人数の目安にする（号×2−6：4号＝2人分、5号＝4人分、6号＝6人分）。
// お店の表示（「5号 3〜4人」など）に近い、控えめな数にしている
function readAmount(name) {
  if (measure !== 'count') return { amount: parseAmount(name, measure) };
  const c = parseCount(name, topic.unit, topic.range ?? 'max');
  if (!c) return {};
  if (topic.goToPersons) {
    if (c.n < 4 || c.label.includes('〜')) return {};
    const persons = c.n * 2 - 6;
    return { amount: persons, amountLabel: `${c.label}（${persons}人分）` };
  }
  return { amount: c.n, amountLabel: c.label };
}

async function searchItems(page) {
  const params = new URLSearchParams({
    format: 'json',
    formatVersion: '2',
    applicationId: config.applicationId,
    accessKey: config.accessKey,
    affiliateId: config.affiliateId,
    keyword: topic.keyword,
    hits: String(topic.hits ?? 30),
    page: String(page),
    sort: topic.sort ?? '-reviewCount',
    availability: '1',
  });
  // 新仕様では、アプリ設定に登録したサイトURLと一致する Origin / Referer が必要
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Origin: new URL(config.siteUrl).origin, Referer: config.siteUrl },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors || body.error) {
    const msg = body.errors?.errorMessage ?? body.error_description ?? body.error ?? res.statusText;
    let hint = '';
    if (/REFERRER/.test(msg)) {
      hint = '\n→ config.json の siteUrl と、楽天ウェブサービスのアプリ設定に登録したサイトURLを同じにしてください。';
    } else if (res.status === 429) {
      hint = '\n→ アクセスが多すぎます。少し待ってから実行してください。';
    } else if (/applicationId|accessKey|wrong_parameter/i.test(msg)) {
      hint = '\n→ config.json の applicationId / accessKey が正しいか確認してください。';
    }
    throw new Error(`楽天APIエラー (${res.status}): ${msg}${hint}`);
  }
  return body.Items ?? [];
}

async function loadConfig() {
  let cfg;
  try {
    cfg = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
  } catch {
    console.error('config.json がありません。config.example.json をコピーして config.json を作り、IDを書き込んでください。');
    process.exit(1);
  }
  const missing = ['applicationId', 'accessKey', 'affiliateId', 'siteUrl'].filter(
    (k) => !cfg[k] || String(cfg[k]).startsWith('ここに'),
  );
  if (missing.length) {
    console.error(`config.json の次の項目が未入力です: ${missing.join(', ')}`);
    process.exit(1);
  }
  // 形式が違うIDでもAPIはリンクを返すが、押すと楽天のトップに飛ばされ報酬が付かない
  if (!/^[0-9a-f]{8}(\.[0-9a-f]{8}){3}$/i.test(cfg.affiliateId)) {
    console.error('config.json の affiliateId の形式が違います（例: 1a2b3c4d.5e6f7a8b.9c0d1e2f.3a4b5c6d）。「ID」などの文字や空白が混ざっていないか確認してください。');
    process.exit(1);
  }
  return cfg;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
