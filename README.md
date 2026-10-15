# 楽天コスパ比較ページ

楽天の商品を「1食あたり・1個あたり」の値段で比べて、一覧ページ（GitHub Pages）と動画の概要欄テキストを自動で作ります。

```
topics/pasta.json  ─(fetch)→  data/pasta.json  ─(build)→  docs/pasta.html（公開ページ）
  何を比べるか          楽天APIの結果                    out/pasta-概要欄.txt
```

## 毎回の使い方

```
node src/fetch.mjs topics/pasta.json   楽天から取得して data/ に保存
node src/build.mjs                     docs/ と out/ を作り直す
node src/serve.mjs                     http://localhost:8080/ で公開前に確認
node src/prepare-upload.mjs            公開してよいファイルだけを ../upload-github/ に集める
```

1. `fetch` の結果に出る上位5件の **商品名と内容量が正しいか目で確認**します（読み違いは公開前に直す）
2. `build` してページを確認します
3. `prepare-upload` でできた `upload-github` フォルダの中身を、GitHubの「Add file → Upload files」にドラッグすると、数分で公開ページに反映されます

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
