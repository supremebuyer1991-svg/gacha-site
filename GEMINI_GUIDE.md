# Gemini向け 作業ガイド

このリポジトリはガチャガチャ情報サイトです（日本語ページと、/en/ 以下の英語ページを自動で作ります）。
作業は次のように分担しています。

| 担当 | やること |
|---|---|
| **Gemini（あなた）** | **商品画像を `images/` に置く**、店舗と在庫のデータ（`data/stores.json`・`data/stock.json`） |
| Claude | 商品の文字データ（`data/items.json`：商品名・価格・発売月・英語名・タグなど）、サイトの仕組み |

**`data/items.json`・`src/`・`.github/` は変更しないでください。**
`main` ブランチに変更を送ると、GitHub Actions が自動でページを作り直して公開します。

---

## 1. 商品画像 `images/`（メインの作業）

1. `data/items.json` を開き、画像が必要な商品の `id` を確認する
2. その商品の画像を **`images/商品id.jpg`** という名前で置く
   - 例：id が `bandai-kissaten-mini-2026-11` なら `images/bandai-kissaten-mini-2026-11.jpg`
   - `.webp` `.png` でもよい
3. それだけで、サイトに自動で表示される（`items.json` を書き換える必要はない）

画像の決まり：
- 正方形、横800px程度
- 1枚300KB以下を目安に（重いとサイトが遅くなる）
- 商品全体（ラインナップがわかる画像）が望ましい

画像がまだない商品は、どれかを調べるには：`items.json` の各 `id` について、`images/` に同じ名前のファイルがあるかを見る。

## 2. 店舗 `data/stores.json`

```json
{ "id": "s-ikebukuro-001", "name": "店舗名", "name_en": "Shop name", "prefecture": "東京都", "address": "住所", "address_en": "Higashi-Ikebukuro, Toshima-ku", "lat": 35.7295, "lng": 139.7193 }
```

- `id` は半角英小文字・数字・ハイフン。重複禁止
- `prefecture` は「東京都」「大阪府」のように正式名
- `lat`（緯度）`lng`（経度）は数字。近い順の並べ替えに使う
- `name_en` `address_en` は英語ページ用（空でもOK。英語ページには日本語名も一緒に出る）

## 3. 在庫 `data/stock.json`

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
- `item_id` は items.json の id、`store_id` は stores.json の id を使う

## 4. 送る前のチェック

```
node src/build.js
```

`⚠ 注意` が出たら、その内容を直してから送ってください。

## 5. 守ること

- 画像や情報の取得は、各メーカー・各サイトの利用条件と、運営者が得た許可の範囲で行う
- gashapon.jp（バンダイ公式）は、許可なしの自動取得と、画像・文章の転載が利用条件で禁止されている
- 自動取得をする場合は、間隔をあけ、回数は最小限に（在庫は1日2〜3回程度まで）
