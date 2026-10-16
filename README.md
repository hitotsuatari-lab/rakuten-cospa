# 楽天コスパ比較ページ

楽天の商品を「1食あたり・1個あたり」の値段で比べて、一覧ページ（GitHub Pages）と動画の概要欄テキストを自動で作ります。

```
topics/pasta.json  ─(fetch)→  data/pasta.json  ─(build)→  docs/pasta.html（公開ページ）
  何を比べるか          楽天APIの結果                    out/<日付>_pasta/概要欄.txt
```

## 毎回の使い方

```
node src/fetch.mjs topics/pasta.json   楽天から取得して data/ に保存
node src/build.mjs                     docs/ と out/ を作り直す
node src/serve.mjs                     http://localhost:8080/ で公開前に確認
node src/publish.mjs                   build してから、公開してよいファイルだけを GitHub に送る（1〜2分で公開ページに反映）
node video/render.mjs videos/pasta.json  読み上げ付きの縦型ショートを out/<日付>_pasta/ショート動画.mp4 に書き出す（約2分半）
```

YouTubeに投稿するものは、データを取った日付とテーマのフォルダ `out/<日付>_<テーマ>/`（例 `out/20261016_rice/`）にまとまります（`ショート動画.mp4` と `概要欄.txt`）。別の日に取り直すと、新しい日付のフォルダができます。

動画を作る前に **VOICEVOX のアプリを起動**しておきます（声は青山龍星。`video/voice.json` で変更）。
読み上げの品名がおかしいときは、`videos/pasta.json` の `speakNames` に `{"5": "バリラ スパゲッティ 5キロ"}` のように順位ごとに書くと置き換わります。
背景の写真は `videos/pasta.json` の `background` の場所に置きます（png・jpg どちらでも可）。無ければ無地の背景になります。
`node video/make-background.mjs videos/pasta.json` を実行すると、`backgroundScene` の説明から Codex が作ります（2〜3分。動画の書き出しと同時に実行しないこと）。
BGMは `video/bgm.json` の曲を小さく重ねます（音量は `volume`、0.12 が標準）。

動画の「つかみ」と「ひとこと」は `videos/pasta.json` で書き換えます。「ひとこと」は自分の判断を書く場所なので、毎回自分の言葉にしてください（量産動画と判定されにくくなります）。

1. `fetch` の結果に出る上位5件の **商品名と内容量が正しいか目で確認**します（読み違いは公開前に直す）
2. `build` してページを確認します
3. `publish` で GitHub に送ると、1〜2分で公開ページに反映されます
   - 送るのは `../upload-github/`（GitHub とつながったフォルダ）に集めた公開用ファイルだけで、config.json は入りません
   - GitHub のログイン情報は Windows の資格情報マネージャーが覚えています。ログインし直しを求められたら、ターミナルで `upload-github` フォルダに移って `git push origin HEAD` を実行し、ブラウザでログインします

新しい比較を増やすときは、`topics/pasta.json` をコピーして `slug`（ファイル名になる英字）、`title`、`keyword`、`perServing`（1食・1回分の量）を書き換えます。
液体（水・洗剤など）は `"measure": "volume"`、`perServing` は ml で指定します。

## 最初の準備（1回だけ）

順番が大事です。**公開ページのURLが決まってから、楽天のアプリを登録**します。

### 1. GitHubで公開ページを作る
1. GitHub（github.com）で無料アカウントを作る
2. 新しいリポジトリを `rakuten-cospa` という名前で、**Public** で作る
3. `node src/prepare-upload.mjs` を実行し、できた `upload-github` フォルダの中身を「uploading an existing file」の画面にドラッグする
   - ブラウザからのアップロードは `.gitignore` を無視します。**このフォルダ（rakuten-cospa）を直接ドラッグしない**こと（config.json が混ざるため）
4. リポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` と `/docs` にして Save
5. 数分後、`https://（ユーザー名）.github.io/rakuten-cospa/` でページが見られるようになる

### 2. 楽天のIDを取る
1. 楽天アフィリエイト（affiliate.rakuten.co.jp）にログインし、**アフィリエイトID** を確認する
2. 楽天ウェブサービス（webservice.rakuten.co.jp）でアプリを新規登録し、**アプリID** と **アクセスキー** を控える
   - 登録時のWebサイトURLには、手順1で決まった公開ページのURLを入れる
   - 2026年に仕様が変わり、このURLと一致しないとAPIが使えません（画面の項目名は変わることがあります）

### 3. config.json を作る
`config.example.json` をコピーして `config.json` という名前にし、4つの値を書き込みます。
`siteUrl` は手順1の公開ページのURL（最後の `/` まで）です。

## うまくいかないとき

| 表示されるエラー | 対処 |
|---|---|
| `HTTP_REFERRER_MISSING` / `NOT_ALLOWED` | config.json の `siteUrl` と、楽天のアプリ設定に登録したURLを完全に同じにする |
| 429 | アクセスしすぎ。少し待ってから実行する |
| 内容量を読み取れず除外 | 商品名に量が書かれていない商品。必要なら `keyword` や `exclude` を調整する |

## 守ること
- ページと概要欄には **PR表記** を必ず入れる（自動で入ります。消さないこと）
- 価格は調査時点のもの。古いページは定期的に `fetch` し直す
- 内容量の自動計算は間違えることがあるので、**公開前に必ず目で確認**する
