CREATE TABLE IF NOT EXISTS stock (item_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- 入荷の記録：店ごとに、最初に見つけた日時・いま在庫があるか・補充（在庫復活）回数
CREATE TABLE IF NOT EXISTS seen (item_id TEXT NOT NULL, shop TEXT NOT NULL, pref TEXT, name TEXT, first_seen TEXT NOT NULL, last_seen TEXT, in_now INTEGER DEFAULT 1, restocks INTEGER DEFAULT 0, baseline INTEGER DEFAULT 0, PRIMARY KEY (item_id, shop));
-- 商品ごとのまとめ：最初に観測した日時、補充回数の合計、在庫のある店の数、最後に動きがあった日時
CREATE TABLE IF NOT EXISTS item_obs (item_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, restocks INTEGER DEFAULT 0, in_count INTEGER DEFAULT 0, last_change TEXT, last_kind TEXT);
-- ハート投票
CREATE TABLE IF NOT EXISTS votes (item_id TEXT PRIMARY KEY, n INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vote_log (item_id TEXT NOT NULL, who TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (item_id, who, day));
-- みんなのガチャマップ：お店（公式の取扱店は自動で、みんなが足したお店は src='user'）
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, name TEXT NOT NULL, pref TEXT, address TEXT, lat REAL, lng REAL, src TEXT DEFAULT 'bandai', created_at TEXT, hidden INTEGER DEFAULT 0, flags INTEGER DEFAULT 0, who TEXT);
-- みんなの報告：在庫（in/out）、台数（machines）、閉店（closed）、ここに無い（wrong）
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT, item_name TEXT, value TEXT, created_at TEXT NOT NULL, who TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reports_shop ON reports (shop_id, created_at);
CREATE INDEX IF NOT EXISTS reports_who ON reports (who, created_at);
CREATE INDEX IF NOT EXISTS seen_shop ON seen (lower(shop));
-- お店へのコメント（自由文。NGワードは受け付けない。通報が3人から来たら隠す）
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, who TEXT NOT NULL, flags INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS comments_shop ON comments (shop_id, created_at);
CREATE TABLE IF NOT EXISTS comment_flags (comment_id INTEGER NOT NULL, who TEXT NOT NULL, PRIMARY KEY (comment_id, who));
-- お店の☆評価（1人1店1つ。つけ直すと上書き）
CREATE TABLE IF NOT EXISTS ratings (shop_id TEXT NOT NULL, who TEXT NOT NULL, stars INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (shop_id, who));
-- ピンの位置の手直し（だれでもOK。記録を残して、あとで戻せるように）
CREATE TABLE IF NOT EXISTS pin_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id TEXT NOT NULL, who TEXT NOT NULL, from_lat REAL, from_lng REAL, lat REAL NOT NULL, lng REAL NOT NULL, created_at TEXT NOT NULL);
-- 発売週のお知らせ（Web Push）：通知の送り先と、★で保存したガチャの番号だけ。「お知らせをやめる」で消える
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'ja', favorites TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_sent_week TEXT, who TEXT);
CREATE INDEX IF NOT EXISTS push_subs_week ON push_subs (last_sent_week);
CREATE INDEX IF NOT EXISTS push_subs_who ON push_subs (who, created_at);
-- 通知の送り主の鍵（VAPID）。最初に使うときに自動で作る（1つだけ）
CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY, public_raw TEXT NOT NULL, private_jwk TEXT NOT NULL, created_at TEXT);

CREATE TABLE IF NOT EXISTS contrib (token TEXT PRIMARY KEY, who TEXT, created_at TEXT);
-- お知らせの設定：選んだ都道府県と、どのお知らせを受け取るか（どれも本人がオンにしたものだけ。rel＝★のガチャの発売週〔これまでのお知らせ〕、stock＝入荷・在庫復活、lottery＝抽選開始、weekly＝毎週の新作まとめ）、きょう送った数
CREATE TABLE IF NOT EXISTS push_opt (endpoint TEXT PRIMARY KEY, prefs TEXT NOT NULL DEFAULT '[]', rel INTEGER NOT NULL DEFAULT 1, stock INTEGER NOT NULL DEFAULT 0, lottery INTEGER NOT NULL DEFAULT 0, weekly INTEGER NOT NULL DEFAULT 0, sent_day TEXT, sent_n INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
-- ★のガチャ（商品の番号から、待っている人をすぐ引けるように push_subs.favorites を写したもの）
CREATE TABLE IF NOT EXISTS push_fav (item_id TEXT NOT NULL, endpoint TEXT NOT NULL, PRIMARY KEY (item_id, endpoint));
CREATE INDEX IF NOT EXISTS push_fav_ep ON push_fav (endpoint);
-- お店のお知らせ：kind='item'（このお店×この商品の入荷・在庫復活）、kind='kw'（このお店に、名前に kw を含む商品が初めて入荷）
CREATE TABLE IF NOT EXISTS push_watch (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, kind TEXT NOT NULL, shop TEXT NOT NULL, item_id TEXT NOT NULL DEFAULT '', kw TEXT NOT NULL DEFAULT '', shop_name TEXT, item_name TEXT, created_at TEXT NOT NULL, UNIQUE (endpoint, kind, shop, item_id, kw));
CREATE INDEX IF NOT EXISTS push_watch_shop ON push_watch (shop);
-- 在庫の動き・抽選の開始（だれかが待っているものだけ書く。まとめたら消す）
CREATE TABLE IF NOT EXISTS push_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, item_id TEXT NOT NULL, shop TEXT NOT NULL DEFAULT '', shop_name TEXT, pref TEXT, info TEXT, created_at TEXT NOT NULL);
-- 送る予定のお知らせ（送ったら消す）
CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS push_queue_ep ON push_queue (endpoint);
-- 最近送ったもの（同じ商品のお知らせを繰り返さないため。3日で消す）
CREATE TABLE IF NOT EXISTS push_sent (endpoint TEXT NOT NULL, k TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (endpoint, k));
