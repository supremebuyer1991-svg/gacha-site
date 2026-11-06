// 古いURL（gacha-site.pages.dev）と www 付きで来た人を、https://gachapla.com の同じページへ移す
const MAIN = "gachapla.com";
const OLD = new Set(["gacha-site.pages.dev", "www.gachapla.com"]);
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (OLD.has(url.hostname)) {
    url.hostname = MAIN;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  // メーカーページの古い住所
  const OLD_MAKER = { m6d1o3r: "bandai", msa91sy: "takara-tomy-arts", m1naz36j: "kitan-club", m6cf4er: "qualia", m1j8hcqh: "bushiroad" };
  const mm = url.pathname.match(/^(\/en)?\/maker\/(m[a-z0-9]+?)(?:\.html)?$/);
  if (mm && OLD_MAKER[mm[2]]) return Response.redirect(`https://${MAIN}${mm[1] || ""}/maker/${OLD_MAKER[mm[2]]}`, 301);
  // 統合したページの古い住所
  const sm = url.pathname.match(/^(\/en)?\/series\/([a-z-]+?)(?:\.html)?$/);
  if (sm) return Response.redirect(`https://${MAIN}${sm[1] || ""}/chara/${sm[2]}`, 301);
  if (/^(\/en)?\/chara\/sanrio-characters-all(\.html)?$/.test(url.pathname)) return Response.redirect(`https://${MAIN}${url.pathname.startsWith("/en/") ? "/en" : ""}/chara/sanrio`, 301);
  return next();
}
