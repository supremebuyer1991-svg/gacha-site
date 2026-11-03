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
  return next();
}
