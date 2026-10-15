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
