# Gemini向け 作業ガイド

このリポジトリはガチャガチャ情報サイトです（日本語ページと、/en/ 以下の英語ページを自動で作ります）。
作業は次のように分担しています。

| 担当 | やること |
|---|---|
| **Gemini（あなた）** | 店舗と在庫のデータ（`data/stores.json`・`data/stock.json`） |
| Claude | 商品データ（`data/items.json`）、サイトの仕組み |
| 自動 | 商品画像（公式ページから取り込み）、店舗の緯度経度（住所から計算） |

**`data/items.json`・`src/`・`.github/` は変更しないでください。**
`main` ブランチに変更を送ると、GitHub Actions が自動でページを作り直して公開します。

---

## 1. 商品画像

**作業は不要です。** Claudeが items.json に公式の商品ページ（official_url）を登録すると、公開のときに自動で画像が取り込まれます。

## 2. 店舗 `data/stores.json`

```json
{ "id": "s-tokyo-gashapon-ikebukuro", "name": "ガシャポンのデパート 池袋総本店", "name_en": "Gashapon Department Store Ikebukuro", "prefecture": "東京都", "address": "東京都豊島区東池袋3-1-3 サンシャインシティ ワールドインポートマートビル3F", "address_en": "3F World Import Mart Bldg., Sunshine City, 3-1-3 Higashi-Ikebukuro, Toshima-ku", "source_url": "https://（その店舗が載っている公式の店舗ページ）" }
```

- **店名・住所は、各チェーン公式サイトの店舗一覧から一字一句そのまま書き写す。記憶や推測で書かない**
- **`source_url`（情報元のページ）は必須。** 書き写した公式ページのURLを入れる
- **`lat` `lng`（緯度経度）は書かない。** 住所から自動で計算される
- 住所は「番地」と「建物名・階」の間に半角スペースを1つ入れる（位置の計算は番地までで行うため）
- `id` は半角英小文字・数字・ハイフン。重複禁止
- `prefecture` は「東京都」「大阪府」のように正式名
- `name_en` `address_en` は英語ページ用（空でもOK）

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
- 在庫の情報元も、公式の店舗検索など、確かめられるところだけ

## 4. 送る前のチェック

```
node src/build.js
```

`⚠ 注意` が出たら、その内容を直してから送ってください。

## 5. 守ること

- 画像や情報の取得は、各メーカー・各サイトの利用条件と、運営者が得た許可の範囲で行う
- gashapon.jp（バンダイ公式）は、許可なしの自動取得と、画像・文章の転載が利用条件で禁止されている
- 自動取得をする場合は、間隔をあけ、回数は最小限に（在庫は1日2〜3回程度まで）
