# ガチャガチャ情報サイト

トレカ抽選ナビと同じ作りです。`data/` のファイルを書き換えると、GitHub Actions が自動でページを作り、Cloudflare Pages に公開します。

## フォルダの中身

| 場所 | 中身 | 誰が触る |
|---|---|---|
| `data/items.json` | 商品の文字データ（日本語・英語） | Claude |
| `images/` | 商品画像（`商品id.jpg` で置けば自動で表示） | Gemini |
| `data/stores.json` | 店舗 | Gemini |
| `data/stock.json` | 在庫 | Gemini |
| `data/site.json` | サイト名・アフィリエイトID・お問い合わせ先 | 運営者 |
| `src/` | ページを作る仕組み・デザイン | Claude |
| `.github/workflows/deploy.yml` | 自動公開の設定 | Claude |

Geminiへの説明は `GEMINI_GUIDE.md`、商品データの書き方は `DATA_GUIDE.md` にまとまっています。

## 最初の設定（1回だけ）

1. （Cloudflare の Pages プロジェクトは初回公開時に自動で作られる）
2. GitHub のリポジトリ → Settings → Secrets and variables → Actions で次を登録
   - Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（抽選ナビと同じ値でOK）
   - Variables：`CF_PROJECT_NAME`（1で付けた名前）、`SITE_URL`（例：`https://gacha-site.pages.dev`）
3. `data/site.json` の `amazon_tag`・`rakuten_affiliate_id`・`contact_url` を入れる

## 公開されるページ

日本語はサイト直下、英語は `/en/` 以下に同じページができます。ヘッダーの「EN／日本語」ボタンで、今見ているページの別の言語版に移ります。


- トップ（診断・新着・人気ランキング・ジャンル）
- 商品ページ（近い順の在庫店・Amazon/楽天ボタン・構造化データ）
- 発売カレンダー、ジャンル別、メーカー別
- よくある質問（FAQPage構造化データ）、運営者情報
- sitemap.xml、robots.txt
