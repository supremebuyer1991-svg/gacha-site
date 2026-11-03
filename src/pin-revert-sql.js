// data/pin-reverts.json（戻したいピン直しの番号の一覧）から、D1 で元の位置に戻す SQL を作る
// その直しのあと、ほかの人がまた直していたら（今の位置が違えば）何もしない
const fs = require("fs"), path = require("path");
let list = [];
try { list = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "pin-reverts.json"), "utf8")).moves || []; } catch {}
const out = [];
for (const id of list) {
  const n = Number(id); if (!Number.isInteger(n) || n <= 0) continue;
  const m = `(SELECT %s FROM pin_moves WHERE id = ${n})`;
  out.push(`UPDATE shops SET lat = ${m.replace("%s", "from_lat")}, lng = ${m.replace("%s", "from_lng")} WHERE id = ${m.replace("%s", "shop_id")} AND lat = ${m.replace("%s", "lat")} AND lng = ${m.replace("%s", "lng")};`);
}
process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
