// 楽天アフィリエイトのリンクを、管理画面の「リンク作成」と同じ形で作る（2026-11-07 から）。
//   https://hb.afl.rakuten.co.jp/ichiba/<アフィリエイトID>/?pc=<商品ページのURL>
// それまでは楽天APIが返す affiliateUrl をそのまま使っていたが、APIで使ったIDが
// 管理画面のアカウントのIDと違い、報酬が本人のアカウントに付かないおそれがあったため。
// アフィリエイトIDは site.json の "linkAffiliateId"（リンクに入る公開の値なので、秘密ではない）。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function linkAffiliateId() {
  const site = JSON.parse(readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
  if (!/^[0-9a-f]{8}(\.[0-9a-f]{8}){3}$/i.test(site.linkAffiliateId ?? '')) {
    throw new Error('site.json の linkAffiliateId（楽天アフィリエイトの管理画面のリンクに入っているID）が正しくありません');
  }
  return site.linkAffiliateId;
}

// 商品ページのURL（item.rakuten.co.jp/<店>/<商品>/）から、アフィリエイトリンクを作る
export function rakutenLink(itemUrl, affiliateId = linkAffiliateId()) {
  const clean = itemUrl.split('?')[0];
  return `https://hb.afl.rakuten.co.jp/ichiba/${affiliateId}/?pc=${encodeURIComponent(clean)}&link_type=hybrid_url`;
}

// 前の形のリンク（楽天APIの affiliateUrl）から、商品ページのURLを取り出す
export function itemUrlOf(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'item.rakuten.co.jp') return url;
    const pc = u.searchParams.get('pc');
    return pc && /item\.rakuten\.co\.jp/.test(pc) ? pc : null;
  } catch {
    return null;
  }
}
