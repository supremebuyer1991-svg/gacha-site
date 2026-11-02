CREATE TABLE IF NOT EXISTS stock (item_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL, count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- 入荷の記録：店ごとに、最初に見つけた日時・いま在庫があるか・補充（在庫復活）回数
CREATE TABLE IF NOT EXISTS seen (item_id TEXT NOT NULL, shop TEXT NOT NULL, pref TEXT, name TEXT, first_seen TEXT NOT NULL, last_seen TEXT, in_now INTEGER DEFAULT 1, restocks INTEGER DEFAULT 0, baseline INTEGER DEFAULT 0, PRIMARY KEY (item_id, shop));
-- 商品ごとのまとめ：最初に観測した日時、補充回数の合計、在庫のある店の数、最後に動きがあった日時
CREATE TABLE IF NOT EXISTS item_obs (item_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, restocks INTEGER DEFAULT 0, in_count INTEGER DEFAULT 0, last_change TEXT, last_kind TEXT);
-- ハート投票
CREATE TABLE IF NOT EXISTS votes (item_id TEXT PRIMARY KEY, n INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS vote_log (item_id TEXT NOT NULL, who TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (item_id, who, day));
