/*
 * Web Push（発売週のお知らせ）の暗号まわり。ライブラリなし・WebCrypto だけで動く
 * （Cloudflare の Worker・Pages Functions と、テスト用の Node 22 の両方から使う）
 * - RFC 8291：通知の中身の暗号化（aes128gcm）
 * - RFC 8292：VAPID（送り主の証明。ES256 の JWT）
 * VAPID の鍵は D1 の push_keys（id=1）に入れておく。無ければ最初に使うときに作る（GitHub の設定はいらない）
 */
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const b64u = (buf) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (str) => {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const hmac = async (key, data) => {
  const k = await subtle().importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, data));
};
// 非圧縮の公開鍵（65バイト）と秘密の d から JWK を作る
export const jwkFromRaw = (raw, d) => {
  const r = raw instanceof Uint8Array ? raw : unb64u(raw);
  const jwk = { kty: "EC", crv: "P-256", x: b64u(r.slice(1, 33)), y: b64u(r.slice(33, 65)), ext: true };
  if (d) jwk.d = typeof d === "string" ? d : b64u(d);
  return jwk;
};

/* ---------- RFC 8291：中身の暗号化 ----------
 * ua_public（端末の p256dh）・auth_secret（端末の auth）宛てに payload を暗号化して、送る本文（バイト列）を返す。
 * テストのときだけ salt と送り側の鍵（asKeys: { publicRaw, privateJwk }）を固定できる */
export async function encryptPayload({ p256dh, auth, payload, salt, asKeys, rs = 4096 }) {
  const uaPublic = p256dh instanceof Uint8Array ? p256dh : unb64u(p256dh);
  const authSecret = auth instanceof Uint8Array ? auth : unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error("bad subscription keys");
  const plain = typeof payload === "string" ? enc.encode(payload) : payload;
  if (plain.length + 1 + 16 + 86 > rs) throw new Error("payload too large");
  salt = salt ? (salt instanceof Uint8Array ? salt : unb64u(salt)) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  let asPrivate, asPublic;
  if (asKeys) {
    asPublic = asKeys.publicRaw instanceof Uint8Array ? asKeys.publicRaw : unb64u(asKeys.publicRaw);
    asPrivate = await subtle().importKey("jwk", asKeys.privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const kp = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivate = kp.privateKey;
    asPublic = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  }
  const uaKey = await subtle().importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));
  // ikm = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  // RFC 8188：CEK と NONCE
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await subtle().importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(plain, new Uint8Array([2])); // 1つだけの（最後の）レコード
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, padded));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

// テスト用：受け取り側として復号する（ua の秘密鍵が必要）
export async function decryptPayload({ body, uaPublic, uaPrivateJwk, auth }) {
  const b = body instanceof Uint8Array ? body : unb64u(body);
  const salt = b.slice(0, 16), idlen = b[20], asPublic = b.slice(21, 21 + idlen), ct = b.slice(21 + idlen);
  const uaPub = uaPublic instanceof Uint8Array ? uaPublic : unb64u(uaPublic);
  const priv = await subtle().importKey("jwk", uaPrivateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const asKey = await subtle().importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: asKey }, priv, 256));
  const prkKey = await hmac(auth instanceof Uint8Array ? auth : unb64u(auth), ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPub, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await subtle().importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const p = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, ct));
  let end = p.length - 1;
  while (end >= 0 && p[end] === 0) end--;
  if (p[end] !== 2) throw new Error("bad padding");
  return p.slice(0, end);
}

/* ---------- RFC 8292：VAPID ---------- */
export async function generateVapidKeys() {
  const kp = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicRaw = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const privateJwk = await subtle().exportKey("jwk", kp.privateKey);
  return { publicRaw: b64u(publicRaw), privateJwk };
}

// D1 から VAPID の鍵を読む。無ければ作って保存する（同時に作られても、先に入ったほうを使う）
export async function getVapidKeys(DB, { create = true } = {}) {
  let row = await DB.prepare("SELECT public_raw, private_jwk FROM push_keys WHERE id = 1").first();
  if (!row && create) {
    const k = await generateVapidKeys();
    await DB.prepare("INSERT OR IGNORE INTO push_keys (id, public_raw, private_jwk, created_at) VALUES (1, ?1, ?2, ?3)")
      .bind(k.publicRaw, JSON.stringify(k.privateJwk), new Date().toISOString()).run();
    row = await DB.prepare("SELECT public_raw, private_jwk FROM push_keys WHERE id = 1").first();
  }
  if (!row) return null;
  return { publicRaw: row.public_raw, privateJwk: JSON.parse(row.private_jwk) };
}

// VAPID の JWT（ES256。WebCrypto の署名は r||s の形なので、そのまま JWS に使える）
export async function vapidJWT({ audience, subject, privateJwk, expSec }) {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const exp = expSec || Math.floor(Date.now() / 1000) + 12 * 3600;
  const body = b64u(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const key = await subtle().importKey("jwk", { ...privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

/* ---------- 送る ----------
 * sub: { endpoint, p256dh, auth }。jwtCache（Map）を渡すと、同じ送り先（プッシュサービス）には同じ JWT を使い回す。
 * 戻り値は HTTP の状態番号（404・410 は「この登録はもう無い」） */
export async function sendPush(sub, data, { vapid, subject, ttl = 86400, jwtCache, fetchImpl } = {}) {
  const audience = new URL(sub.endpoint).origin;
  let jwt = jwtCache && jwtCache.get(audience);
  if (!jwt) {
    jwt = await vapidJWT({ audience, subject, privateJwk: vapid.privateJwk });
    if (jwtCache) jwtCache.set(audience, jwt);
  }
  const body = await encryptPayload({ p256dh: sub.p256dh, auth: sub.auth, payload: JSON.stringify(data) });
  const res = await (fetchImpl || fetch)(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicRaw}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

/* ---------- 登録の確認（Pages Functions から使う） ---------- */
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
export function validEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false;
  let u; try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(h) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com$/.test(h);
}
export function validKeys(p256dh, auth) {
  try {
    if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 120 || auth.length > 40) return false;
    const p = unb64u(p256dh), a = unb64u(auth);
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch { return false; }
}
