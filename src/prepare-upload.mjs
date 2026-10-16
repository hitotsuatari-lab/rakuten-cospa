// GitHubに送る「公開してよいファイルだけ」のフォルダ（../upload-github/）を作り直す。
// upload-github は GitHub のリポジトリとつながっている（.git がある）ので、.git だけは残して中身を入れ替える。
// config.json が混ざらないように、送るものは INCLUDE に書いたものだけ。
// 使い方: node src/prepare-upload.mjs（ふだんは publish.mjs から呼ばれる）

import { cp, rm, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEST = path.resolve(ROOT, '..', 'upload-github');
const INCLUDE = ['docs', 'src', 'data', 'topics', 'README.md', 'package.json', 'config.example.json', '.gitignore'];

export async function prepareUpload() {
  await clearExceptGit();
  for (const name of INCLUDE) {
    await cp(path.join(ROOT, name), path.join(DEST, name), { recursive: true });
  }

  // 念のため、アクセスキーがどこにも入っていないことを確かめる
  // （アプリIDは楽天が返すアフィリエイトリンクの rafcid に最初から含まれる公開前提の値なので対象外）
  const secrets = await readSecrets();
  for (const file of await listFiles(DEST)) {
    const text = await readFile(file, 'utf8');
    if (secrets.some((s) => text.includes(s))) {
      await clearExceptGit();
      throw new Error(`秘密の値が含まれていたため中止しました: ${path.relative(DEST, file)}`);
    }
  }
}

async function clearExceptGit() {
  let entries = [];
  try {
    entries = await readdir(DEST);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name !== '.git') await rm(path.join(DEST, name), { recursive: true, force: true });
  }
}

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
    if (entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

// 直接実行されたとき
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await prepareUpload();
    console.log(`公開用フォルダを作り直しました: ${DEST}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
