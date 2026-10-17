// 商品名から内容量（g または ml の合計）を読み取る。
// 読み取れない・候補が食い違うときは null を返し、人の確認に回す。

const UNITS = {
  weight: { kg: 1000, g: 1 },
  volume: { ml: 1, l: 1000 },
};

const COUNT_WORDS = '(?:袋|個|パック|箱|本|缶|束|食|p)?';

export function parseAmount(name, measure = 'weight') {
  const units = UNITS[measure];
  if (!units) throw new Error(`measure は weight か volume にしてください: ${measure}`);

  const text = name.normalize('NFKC').toLowerCase();
  const unitPattern = Object.keys(units).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})(?![a-z])(?:\\s*[×x*]\\s*(\\d+)\\s*${COUNT_WORDS})?`,
    'g',
  );

  const totals = new Set();
  for (const m of text.matchAll(re)) {
    const count = m[3] ? parseInt(m[3], 10) : 1;
    totals.add(Math.round(parseFloat(m[1]) * units[m[2]] * count));
  }
  // 「500g×2袋（計1kg）」のように同じ合計を指す表記は1つとみなす
  return totals.size === 1 ? [...totals][0] : null;
}

export function formatAmount(amount, measure = 'weight') {
  const [big, small] = measure === 'volume' ? ['L', 'ml'] : ['kg', 'g'];
  return amount >= 1000 && amount % 100 === 0
    ? `${amount / 1000}${big}`
    : `${amount.toLocaleString('ja-JP')}${small}`;
}

// 値段の表示：割り切れるときは「.0」を付けず、千の位に区切りを入れる（288 / 37.8 / 1,396）
export function formatYen(x) {
  return x.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}
