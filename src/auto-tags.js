/*
 * 商品名から、診断用のタグ（ジャンルの細かい項目・年代・性別）を仮に付ける。
 * すでにタグがある商品は変えない。自動で付けたものには tags_auto: true が付き、毎晩Claudeが見直す。
 */
"use strict";
const AGE = {
  "10": /ちいかわ|ホロライブ|すとぷり|NCT|aespa|RIIZE|SKZOO|ハイキュー|フリーレン|チェンソー|ポケモン|ポケットモンスター|ピクミン|マリオ|MINECRAFT|ソニック|サンリオ|プリキュア|アイカツ|しばんばん|おぱんちゅ|mofusand|学園アイドルマスター|ブルーロック|呪術|Poppy|コナン|妖怪ウォッチ|アンパンマン|ドラえもん|しんちゃん|ちびまる子/,
  "20": /ちいかわ|ホロライブ|すとぷり|NCT|aespa|RIIZE|SKZOO|ハイキュー|フリーレン|チェンソー|ジョジョ|ポケモン|ポケットモンスター|サンリオ|ディズニー|ピクサー|ラブライブ|アイドリッシュ|MyGO|ぼっち|学園アイドルマスター|mofusand|おぱんちゅ|赤見かるび|NIKKE|逆転裁判|銀魂|タコピー|とんがり帽子|メイドインアビス|超かぐや姫|コナン|MARVEL|ウマ娘/,
  "30": /たまごっち|おジャ魔女|カードキャプター|ケロロ|デジモン|ポケットモンスター|ハム太郎|ジュエルペット|きらりん|ナルミヤ|メゾピアノ|ドラゴンボール|ONE PIECE|ワンピの実|サンリオ|ディズニー|ピクサー|銀魂|ジョジョ|HUNTER|犬夜叉|桜蘭|いちご100|ガンダム|ソニック|マクロス|パワーパフ|MINECRAFT|ミニチュア|STAR WARS|ハリー・ポッター/,
  "40": /ガンダム|ドラゴンボール|ウルトラ|ライダー|マクロス|ジョジョ|ゴジラ|PEANUTS|パワーパフ|ケアベア|グレムリン|ミニチュア|クローズ|WORST|犬夜叉|STAR WARS|パチンコ|ZETT|昆虫|骨格|図鑑|ちびまる子|ハリー・ポッター|HOT WHEELS|ニャンちゅう/,
  "50": /昭和|レトロ|ゴジラ|ウルトラ|ライダー|ドラえもん|ちびまる子|ミニチュア|模型|骨格|図鑑|パチンコ|木彫り|ピジョン|Pigeon|コンタック|チロル|ZETT|電車|JR|クワガタ/,
};
const GENDER = {
  female: /サンリオ|キティ|マイメロ|クロミ|ポチャッコ|シナモ|ちいかわ|ディズニー|ピクサー|プリキュア|おジャ魔女|カードキャプター|ジュエルペット|きらりん|アイカツ|ナルミヤ|メゾピアノ|チャーム|アクセサリー|ポーチ|リング|コスメ|パウダー|ミラー|バッグ|ぬいぐるみ|ふわふわ|NCT|RIIZE|SKZOO|すとぷり|アイドリッシュ|桜蘭|mofusand|おぱんちゅ|ヘアコーム|ビーズ|シュガーバニーズ|ケアベア|パワーパフ|MINITEEN|otome/,
  male: /ガンダム|ゴジラ|ライダー|ウルトラ|ドラゴンボール|ONE PIECE|ワンピの実|HG|ロボ|メカ|怪獣|クローズ|WORST|STAR WARS|MARVEL|ZETT|グローブ|HOT WHEELS|ソニック|MINECRAFT|パチンコ|クワガタ|昆虫|骨格|キングダム|HUNTER|ジョジョ|NIKKE|マクロス|電車|JR|aespa|学園アイドルマスター|ラブライブ|ホロライブ/,
};
module.exports = function autoTag(items, groups) {
  const subs = [];
  for (const g of groups || []) for (const x of g.subs) subs.push({ key: `${g.slug}:${x.slug}`, rx: new RegExp(x.match, "i") });
  let n = 0;
  for (const it of items) {
    if (it.q_subs && it.q_ages && it.q_genders) continue;
    const name = it.name || "";
    it.q_subs = subs.filter((s) => s.rx.test(name)).map((s) => s.key);
    let ages = Object.keys(AGE).filter((a) => AGE[a].test(name));
    if (!ages.length) ages = ["20", "30", "40"]; // 分からないものは大人のコレクター層
    it.q_ages = ages;
    let gs = Object.keys(GENDER).filter((k) => GENDER[k].test(name));
    if (!gs.length) gs = ["female", "male"];
    it.q_genders = gs;
    it.tags_auto = true;
    n++;
  }
  return n;
};
