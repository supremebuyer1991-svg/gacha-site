export const json = (data, status = 200, maxAge = 300) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
});
// 書き込んだ人を見分ける符号（IPアドレスなどから作る、元に戻せない文字。IPそのものは保存しない）
export async function whoHash(request, salt) {
  const raw = `${request.headers.get("CF-Connecting-IP") || ""}|${request.headers.get("User-Agent") || ""}|${salt}|gacha-planet`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const todayJST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 名前などに使えない文字（URL・タグ）が入っていないか
export const cleanText = (s, max) => {
  const t = String(s || "").normalize("NFKC").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  if (!t || t.length > max || /https?:|www\.|@|\.com|\.jp/i.test(t)) return null;
  return t;
};
