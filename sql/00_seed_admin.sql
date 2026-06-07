-- ============================================================
-- 管理者帳號 Seed（每台機器執行一次）
-- Email   : yp123@gmail.com
-- 密碼    : 000000
-- ============================================================
-- ⚠️  此檔案需在 01_*.sql 之後執行（app_user 表必須先建立）
-- ⚠️  idempotent：若帳號已存在則略過，不會重複插入

INSERT INTO app_user (username, email, password_hash, birth_date, license_date, role, user_level_id)
VALUES (
  'admin',
  'yp123@gmail.com',
  '$2b$12$kRYoUKLcVn./dR3YxWuePuZn8e.aiwrZiQYofqwtvHA3YwWDwvCre',
  '1990-01-01',
  '2020-01-01',
  'admin',
  1
)
ON CONFLICT (email) DO NOTHING;

-- 確認結果
SELECT username, email, role FROM app_user WHERE email = 'yp123@gmail.com';
