# Gemini向け データ登録ガイド

このリポジトリはガチャガチャ情報サイトです（日本語ページと、/en/ 以下の英語ページを自動で作ります）。サイトの見た目とページ作成は自動化済みです。
**あなた（Gemini）の担当は、`data/` のファイルに商品・店舗・在庫を書き込み、`images/` に画像を置くことだけです。**
`src/` と `.github/` のファイルは変更しないでください。

`main` ブランチに変更を送ると、GitHub Actions が自動でページを作り直して公開します。

---

## 1. 商品 `data/items.json`

商品1つが `{ … }` 1つです。配列 `[ … ]` の中に追加してください。

```json
{
  "id": "bandai-kissaten-mini-2026-11",
  "name": "純喫茶メニューミニチュアコレクション",
  "name_en": "Retro Café Menu Miniatures",
  "maker": "バンダイ",
  "maker_en": "Bandai",
  "price": 400,
  "release": "2026-11",
  "genre": "miniature",
  "moods": ["real"],
  "tags": ["食品サンプル", "純喫茶", "クリームソーダ"],
  "tags_en": ["food replica", "retro café", "cream soda"],
  "lineup": 6,
  "image": "images/bandai-kissaten-mini-2026-11.jpg",
  "official_url": "https://…",
  "store_search_url": "https://…",
  "popularity": 80,
  "added": "2026-11-01",
  "description": "クリームソーダやナポリタンなど、喫茶店メニューを手のひらサイズで再現したシリーズ。",
  "description_en": "Cream soda, Napolitan spaghetti and other classic Japanese café dishes in palm-sized miniature."
}
```

| 項目 | 必須 | 書き方 |
|---|---|---|
| `id` | ◯ | 半角英小文字・数字・ハイフンのみ。一度決めたら変えない（ページのURLになる）。重複禁止 |
| `name` | ◯ | 商品名 |
| `maker` | ◯ | メーカー名。表記を毎回そろえる（「バンダイ」「BANDAI」を混ぜない） |
| `price` | ◯ | 1回の価格（円）。数字だけ |
| `release` | ◯ | 発売月。`"2026-11"` の形 |
| `genre` | ◯ | 次のどれか1つ：`anime`（アニメ・キャラ）`miniature`（リアルミニチュア）`animal`（動物）`retro`（昭和レトロ）`other`（その他） |
| `moods` | | 診断用。次から0〜複数：`kawaii`（かわいい・癒し）`real`（リアル・精密）`funny`（ネタ・おもしろ）`cool`（かっこいい・渋い） |
| `tags` | | サイトに「AIタグ」として表示。3〜6個が目安 |
| `lineup` | | 全何種か。数字だけ |
| `image` | | `images/商品id.jpg` のように書く。空なら仮の画像が出る |
| `official_url` | | メーカー公式の商品ページ |
| `store_search_url` | | 公式の店舗検索ページ（あれば） |
| `popularity` | | 人気ランキング用の点数（0〜100）。大きいほど上位 |
| `added` | | サイトに載せた日。`"2026-11-01"` の形。7日以内なら「NEW」が付く |
| `description` | | 紹介文。1〜2文。**メーカーの文章をそのまま写さず、自分の言葉で書く** |
| `name_en` | ◯推奨 | 英語の商品名（英語ページ用）。空だと英語ページに日本語名が出る |
| `maker_en` | | 英語のメーカー名（例 `Bandai`、`Takara Tomy A.R.T.S`） |
| `tags_en` | | 英語のタグ |
| `description_en` | | 英語の紹介文。日本に来た外国人が読む前提で、わかりやすい英語で |

## 2. 画像 `images/`

- ファイル名は `商品id.jpg`（または `.webp` `.png`）
- 正方形、横800px程度、1枚300KB以下を目安に
- `items.json` の `image` にパスを書く

## 3. 店舗 `data/stores.json`

```json
{ "id": "s-ikebukuro-001", "name": "店舗名", "name_en": "Shop name", "prefecture": "東京都", "address": "住所", "address_en": "Higashi-Ikebukuro, Toshima-ku", "lat": 35.7295, "lng": 139.7193 }
```

- `name_en` `address_en` は英語ページ用（空でもOK。英語ページには日本語名も一緒に表示されるので、お店の人に見せられる）

- `id` は半角英小文字・数字・ハイフン。重複禁止
- `prefecture` は「東京都」「大阪府」のように正式名
- `lat`（緯度）`lng`（経度）は数字。近い順の並べ替えに使う

## 4. 在庫 `data/stock.json`

```json
{
  "updated_at": "2026-11-01T18:00:00+09:00",
  "stock": [
    { "item_id": "bandai-kissaten-mini-2026-11", "store_id": "s-ikebukuro-001", "status": "in_stock" }
  ]
}
```

- `updated_at`：情報を集めた日時（サイトに「○時時点」と表示される）
- `status`：`in_stock`（在庫あり）`few`（残りわずか）`out_of_stock`（売り切れ）のどれか
- `item_id` と `store_id` は、items.json / stores.json にある id を使う

## 5. サイト設定 `data/site.json`

人間が決める設定です。`sample_mode` は本番データに入れ替えたら `false` にしてください（「サンプル表示中」の帯が消えます）。

## 6. 送る前のチェック

```
node src/build.js
```

`⚠ 注意` が出たら、その内容を直してから送ってください。書き方が間違った商品はサイトに載りません。

## 7. 守ること

- 情報の取得は、各メーカー・各サイトの利用条件と、運営者が得た許可の範囲で行う
- gashapon.jp（バンダイ公式）は、許可なしの自動取得と、画像・文章の転載が利用条件で禁止されている
- 自動取得をする場合は、間隔をあけ、回数は最小限に（在庫は1日2〜3回程度まで）
