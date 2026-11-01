# 商品データの書き方（Claude担当）

`data/items.json` に商品1つを `{ … }` 1つで追加する。画像は Gemini が `images/商品id.jpg` に置くので、`image` は空でよい。

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
  "official_url": "https://…",
  "store_search_url": "",
  "popularity": 80,
  "added": "2026-11-01",
  "description": "自分の言葉で1〜2文。",
  "description_en": "Plain English for visitors to Japan, 1–2 sentences."
}
```

| 項目 | 必須 | 書き方 |
|---|---|---|
| `id` | ◯ | 半角英小文字・数字・ハイフン。「メーカー-内容-発売年月」の形。一度決めたら変えない（URLと画像名になる） |
| `name` / `name_en` | ◯ | 商品名（日本語・英語） |
| `maker` / `maker_en` | ◯ | メーカー名。表記を毎回そろえる |
| `price` | ◯ | 1回の価格（円）。数字だけ |
| `release` | ◯ | 発売月 `"2026-11"` |
| `genre` | ◯ | `anime` `miniature` `animal` `retro` `other` のどれか |
| `moods` | | `kawaii` `real` `funny` `cool` から0〜複数（診断用） |
| `tags` / `tags_en` | | 3〜6個 |
| `lineup` | | 全何種か |
| `popularity` | | 人気ランキング用 0〜100 |
| `added` | | 掲載日。7日以内は「NEW」 |
| `description` / `description_en` | | メーカーの文章をそのまま写さず、自分の言葉で |

追加後は `node src/build.js` で `⚠ 注意` が出ないことを確かめてから `main` に送る。
