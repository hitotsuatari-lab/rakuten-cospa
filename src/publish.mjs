// 公開ページを作り直して、GitHub に送る（数分で https://hitotsuatari-lab.github.io/rakuten-cospa/ に反映）。
// 使い方: node src/publish.mjs
// 初回だけ、GitHub へのログイン画面（ブラウザ）が出るので本人がログインする。以後は Windows が覚えている。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUpload, DEST } from './prepare-upload.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIT = ['C:/Program Files/Git/cmd/git.exe', 'git'].find((g) => g === 'git' || existsSync(g));

run(process.execPath, [path.join(ROOT, 'src', 'build.mjs')], ROOT);
await prepareUpload();

git('add', '-A');
if (git('status', '--porcelain').trim() === '') {
  console.log('変更がないので、送るものはありませんでした。');
  process.exit(0);
}
const stamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
git('commit', '-q', '-m', `ページを更新（${stamp}）`);
git('push', '-q', 'origin', 'HEAD');
console.log('GitHub に送りました。1〜2分で公開ページに反映されます。');

function git(...args) {
  return run(GIT, args, DEST);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`失敗しました: ${path.basename(cmd)} ${args.join(' ')}\n${r.stderr || r.stdout}`);
    process.exit(1);
  }
  if (cmd === process.execPath) process.stdout.write(r.stdout);
  return r.stdout;
}
