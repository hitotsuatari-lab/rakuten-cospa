// GitHubのWeb画面にドラッグするための「公開してよいファイルだけ」のフォルダを作る。
// ブラウザからのアップロードは .gitignore を無視するので、config.json が混ざらないようにここで選り分ける。
// 使い方: node src/prepare-upload.mjs → ../upload-github/ ができる

import { cp, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.resolve(ROOT, '..', 'upload-github');
const INCLUDE = ['docs', 'src', 'data', 'topics', 'README.md', 'package.json', 'config.example.json', '.gitignore'];

await rm(DEST, { recursive: true, force: true });
for (const name of INCLUDE) {
  await cp(path.join(ROOT, name), path.join(DEST, name), { recursive: true });
}

// 念のため、アクセスキーがどこにも入っていないことを確かめる
// （アプリIDは楽天が返すアフィリエイトリンクの rafcid に最初から含まれる公開前提の値なので対象外）
const secrets = await readSecrets();
for (const file of await listFiles(DEST)) {
  const text = await readFile(file, 'utf8');
  if (secrets.some((s) => text.includes(s))) {
    await rm(DEST, { recursive: true, force: true });
    console.error(`秘密の値が含まれていたため中止しました: ${path.relative(DEST, file)}`);
    process.exit(1);
  }
}

console.log(`アップロード用フォルダを作りました: ${DEST}`);
console.log('この中身をすべて選んで、GitHubの「Upload files」画面にドラッグしてください。');

async function readSecrets() {
  try {
    const cfg = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
    return [cfg.accessKey].filter((s) => s && !String(s).startsWith('ここに'));
  } catch {
    return [];
  }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}
