const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch();
  for (const [f, w, h] of [["icon", 800, 800], ["header", 1500, 500]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: f === "header" ? 2 : 1 });
    await p.goto("file://" + path.resolve(__dirname, f + ".html"), { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.resolve(__dirname, f + ".png") });
  }
  await b.close();
})();
