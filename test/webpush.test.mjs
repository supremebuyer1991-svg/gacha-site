// Web Push の暗号のテスト（node --test test/）
// RFC 8291 Section 5 の例と同じ結果になるか、VAPID の署名が正しく検証できるか
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptPayload, decryptPayload, jwkFromRaw, generateVapidKeys, vapidJWT, b64u, unb64u, validEndpoint, validKeys } from "../lib/webpush.js";

const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

test("RFC 8291 Section 5 test vector (aes128gcm)", async () => {
  const body = await encryptPayload({
    p256dh: V.uaPublic, auth: V.auth, payload: V.plaintext, salt: V.salt,
    asKeys: { publicRaw: V.asPublic, privateJwk: jwkFromRaw(V.asPublic, V.asPrivate) },
  });
  assert.equal(b64u(body), V.body);
});

test("decrypting the RFC body gives the plaintext", async () => {
  const p = await decryptPayload({ body: V.body, uaPublic: V.uaPublic, uaPrivateJwk: jwkFromRaw(V.uaPublic, V.uaPrivate), auth: V.auth });
  assert.equal(new TextDecoder().decode(p), V.plaintext);
});

test("random-key round trip", async () => {
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const msg = JSON.stringify({ title: "ガチャプラネット", body: "今週発売：テスト ほか2件", url: "/mylist" });
  const body = await encryptPayload({ p256dh: b64u(uaPub), auth: b64u(auth), payload: msg });
  const p = await decryptPayload({ body, uaPublic: uaPub, uaPrivateJwk: await crypto.subtle.exportKey("jwk", ua.privateKey), auth });
  assert.equal(new TextDecoder().decode(p), msg);
});

test("VAPID JWT (ES256) verifies with the public key", async () => {
  const k = await generateVapidKeys();
  assert.equal(unb64u(k.publicRaw).length, 65);
  const jwt = await vapidJWT({ audience: "https://fcm.googleapis.com", subject: "https://gachapla.com/about", privateJwk: k.privateJwk });
  const [h, b, s] = jwt.split(".");
  const claims = JSON.parse(new TextDecoder().decode(unb64u(b)));
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "https://gachapla.com/about");
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const pub = await crypto.subtle.importKey("raw", unb64u(k.publicRaw), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(s), new TextEncoder().encode(`${h}.${b}`));
  assert.ok(ok);
});

test("endpoint / key validation", () => {
  assert.ok(validEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  assert.ok(validEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc"));
  assert.ok(validEndpoint("https://web.push.apple.com/QAbc"));
  assert.ok(!validEndpoint("http://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(!validEndpoint("https://evil.example.com/fcm.googleapis.com"));
  assert.ok(!validEndpoint("https://notify.windows.com.evil.com/x"));
  assert.ok(!validEndpoint("https://fcm.googleapis.com:8443/x"));
  assert.ok(validKeys(V.uaPublic, V.auth));
  assert.ok(!validKeys(V.auth, V.auth));
});
