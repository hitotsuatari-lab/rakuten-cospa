// 比較データ（data/*.json）に、楽天の商品画像のURLと、送料無料・ポイント倍率の情報を足す。値段や順位は変えない。
// 使い方: node src/add-images.mjs
// 商品ページのURL（item.rakuten.co.jp/<店>/<商品>/）から商品コードを作り、楽天APIで1件ずつ聞く。
// 画像と送料の情報がそろっている商品は聞かない。

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));

let added = 0;
let missed = 0;
for (const file of (await readdir(path.join(ROOT, 'data'))).filter((f) => f.endsWith('.json'))) {
  const p = path.join(ROOT, 'data', file);
  const data = JSON.parse(await readFile(p, 'utf8'));
  let changed = false;
  for (const r of data.ranking) {
    if (r.image && r.postageFlag !== undefined) continue;
    const code = itemCodeOf(r.url);
    // 商品コードで聞き、だめなら（URLの末尾が商品コードと違う店がある）店の中を商品名で探す
    const item = code ? (await lookupItem({ itemCode: code })) ?? (await searchInShop(code, r.name)) : undefined;
    if (item) {
      r.image ??= imageOf(item);
      r.postageFlag = item.postageFlag;
      r.pointRate = item.pointRate;
      r.pointRateEndTime = item.pointRateEndTime || undefined;
      changed = true;
      added++;
    } else {
      missed++;
      console.log(`  商品が見つからない: ${file} ${r.name.slice(0, 30)}`);
    }
  }
  if (changed) await writeFile(p, JSON.stringify(data, null, 2) + '\n');
}
console.log(`${added} 件に画像・送料・ポイントの情報を足しました${missed ? `（見つからない ${missed} 件）` : ''}`);

// アフィリエイトURLの pc=（または商品ページのURLそのもの）から「店:商品」の商品コードを作る
function itemCodeOf(url) {
  let target = url;
  try {
    const u = new URL(url);
    target = u.searchParams.get('pc') ?? url;
  } catch {
    return null;
  }
  const m = target.match(/item\.rakuten\.co\.jp\/([^/]+)\/([^/?]+)/);
  return m ? `${m[1]}:${m[2]}` : null;
}

async function lookupItem(params) {
  const items = await search(params);
  return items[0];
}

// 店の中を、商品名の最初のほうの言葉で探し、商品ページのURLが同じものを選ぶ
async function searchInShop(code, name) {
  const [shop, id] = code.split(':');
  const words = name
    .replace(/【[^】]*】|\[[^\]]*\]|［[^］]*］|＼[^／]*／|（[^）]*）|\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3)
    .join(' ');
  const items = await search({ shopCode: shop, keyword: words || name.slice(0, 20), hits: '30' });
  return items.find((it) => (it.itemUrl ?? '').includes(`/${shop}/${id}/`));
}

async function search(params) {
  await new Promise((r) => setTimeout(r, 1100)); // 1秒に1回までの制限を守る
  const q = new URLSearchParams({
    format: 'json',
    formatVersion: '2',
    applicationId: config.applicationId,
    accessKey: config.accessKey,
    ...params,
  });
  const res = await fetch(`${ENDPOINT}?${q}`, {
    headers: { Origin: new URL(config.siteUrl).origin, Referer: config.siteUrl },
  });
  const body = await res.json().catch(() => ({}));
  return body.Items ?? [];
}

function imageOf(item) {
  const raw = item?.mediumImageUrls?.[0];
  const img = typeof raw === 'string' ? raw : raw?.imageUrl;
  return img ? img.replace(/_ex=\d+x\d+/, '_ex=240x240') : undefined;
}
