/* ガチャプラネット：発売週のお知らせ（Web Push）を受け取る Service Worker。
 * 通知を出すのと、押したときにページを開くだけ（ページのキャッシュや通信の横取りはしない）。build.js が dist/sw.js にコピーする */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

// 同じサイトの住所だけ開く（ほかのサイトの住所が来たらトップへ）
function safeUrl(u) {
  try {
    var x = new URL(u || "/", self.location.origin);
    return x.origin === self.location.origin ? x.href : self.location.origin + "/";
  } catch (e) { return self.location.origin + "/"; }
}

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  var title = d.title || "ガチャプラネット";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: d.icon || "/images/icons/icon-192.png",
    badge: "/images/icons/icon-192.png",
    tag: d.tag || "gacha-week",
    data: { url: safeUrl(d.url) }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = safeUrl(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url === url && "focus" in c) return c.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
