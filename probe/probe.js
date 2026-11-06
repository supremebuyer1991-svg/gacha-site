const fs = require("fs");
const UA = "Mozilla/5.0 (compatible; GachaSiteBot/1.0; +https://gachapla.com)";
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": UA } }); return await r.text(); };
(async () => {
  fs.mkdirSync("probe/html", { recursive: true });
  fs.writeFileSync("probe/html/bandai-item.html", await get("https://gashapon.jp/products/detail.php?jan_code=4582770069136000"));
  await new Promise((r) => setTimeout(r, 1500));
  fs.writeFileSync("probe/html/bandai-item2.html", await get("https://gashapon.jp/products/detail.php?jan_code=4582770055498000"));
})();
