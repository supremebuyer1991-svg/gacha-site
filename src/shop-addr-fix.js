// みんなが追加したお店で、住所に町名が入っていないもの（「大阪府和泉市1」など）を、
// ピンの位置から国土地理院の住所変換で「都道府県＋市区町村＋町名・丁目」に直す SQL を作る
const SITE = process.env.SITE_URL || "https://gachapla.com";
const UA = { "User-Agent": `GachaSiteBot/1.0 (+${SITE})` };
const bad = (a) => !a || /^(.{2,3}[都道府県])?[^都道府県\d]{1,8}?[市区町村郡]\s*[\d０-９\-－]*$/.test(String(a).trim());
async function muniTable() {
  const js = await (await fetch("https://maps.gsi.go.jp/js/muni.js", { headers: UA })).text();
  const t = {};
  for (const m of js.matchAll(/\["?(\d+)"?\]\s*=\s*'([^']*)'/g)) { const p = m[2].split(","); t[Number(m[1])] = (p[1] || "") + (p[3] || "").replace(/\s|　/g, ""); }
  return t;
}
async function reverse(lat, lng, muni) {
  const r = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`, { headers: UA })).json();
  const x = r && r.results; if (!x) return "";
  const base = muni[Number(x.muniCd)] || ""; if (!base) return "";
  return base + (x.lv01Nm && x.lv01Nm !== "－" ? x.lv01Nm : "");
}
module.exports = async function shopAddrFixSql() {
  try {
    const d = await (await fetch(`${SITE}/api/shopdump`, { headers: UA })).json();
    const list = (d.shops || []).filter((s) => s.src === "user" && s.lat && s.lng && bad(s.address)).slice(0, 30);
    if (!list.length) return "";
    const muni = await muniTable();
    const out = [];
    for (const s of list) {
      const a = await reverse(s.lat, s.lng, muni).catch(() => "");
      if (!a || a === s.address) continue;
      const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
      out.push(`UPDATE shops SET address = ${q(a)} WHERE id = ${q(s.id)} AND address = ${q(s.address || "")};`);
      console.error(`住所を直します：${s.name}「${s.address || "(空)"}」→「${a}」`);
      await new Promise((r) => setTimeout(r, 500));
    }
    return out.join("\n") + (out.length ? "\n" : "");
  } catch (e) { console.error("住所の見直しをとばしました：" + e.message); return ""; }
};
