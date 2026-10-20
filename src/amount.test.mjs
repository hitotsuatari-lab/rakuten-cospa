import assert from 'node:assert/strict';
import { parseAmount, formatAmount } from './amount.mjs';

const cases = [
  ['業務用パスタ 5kg', 5000],
  ['スパゲッティ 500g×2袋', 1000],
  ['パスタ ５００ｇ×４袋 セット', 2000],
  ['パスタ 4.5kg（500g×9袋）', 4500],
  ['パスタ 2kg 1.6mm', 2000],
  ['パスタ 1kg 500g 選べる', null],
  ['パスタソース お試しセット', null],
];
for (const [name, expected] of cases) assert.equal(parseAmount(name), expected, name);

assert.equal(parseAmount('天然水 2L×9本', 'volume'), 18000);
assert.equal(parseAmount('お茶 500ml×24本', 'volume'), 12000);
assert.equal(formatAmount(4500), '4.5kg');
assert.equal(formatAmount(750), '750g');

console.log('amount: すべてOK');

import { parseCount } from './amount.mjs';
assert.deepEqual(parseCount('おせち 三段重 全46品目 3人前', '品'), { n: 46, label: '46品' });
assert.deepEqual(parseCount('6.5寸三段和風おせち 【43品目・3〜4人前】', '人前'), { n: 4, label: '3〜4人前' });
assert.equal(parseCount('おせち 2人前 3人前 三段重', '人前'), null);
assert.deepEqual(parseCount('クリスマスケーキ ５号 いちご', '号'), { n: 5, label: '5号' });
assert.equal(parseCount('ケーキ 4号 5号 選べる', '号'), null);
console.log('count: すべてOK');
