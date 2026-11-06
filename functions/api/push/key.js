// 発売週のお知らせ：ブラウザが通知を登録するときに使う公開鍵（VAPID）。無ければここで作る
import { json } from "../../../lib/api-util.js";
import { getVapidKeys } from "../../../lib/webpush.js";
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503, 0);
  try {
    const k = await getVapidKeys(env.DB);
    return json({ ok: true, key: k.publicRaw }, 200, 3600);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }, 503, 0);
  }
}
