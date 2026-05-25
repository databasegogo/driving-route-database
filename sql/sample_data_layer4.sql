-- sample_data_layer4.sql
-- Sample data for Layer 4 tables (for report / demo purposes)

-- =====================
-- 1. app_user
-- =====================
-- password_hash = sha256('demo1234')
INSERT INTO app_user
  (username, email, password_hash, birth_date, license_date, address, home_lat, home_lng, user_level_id, total_score, role)
VALUES
  ('王小明', 'ming@example.com',
   '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
   '2000-05-15', '2024-03-10', '桃園市龜山區文化一路100號',
   24.9985, 121.3012, 1, 0, 'user'),

  ('李美華', 'hua@example.com',
   '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
   '1998-11-22', '2022-06-01', '桃園市龜山區龜山一路200號',
   25.0010, 121.3150, 2, 650, 'user'),

  ('陳志強', 'chen@example.com',
   '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
   '1990-03-08', '2012-09-20', '桃園市龜山區復興一路50號',
   24.9920, 121.2980, 3, 3200, 'user'),

  ('admin', 'admin@example.com',
   '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
   NULL, NULL, NULL,
   NULL, NULL, 1, 0, 'admin');

-- =====================
-- 2. user_route_preference
-- =====================
INSERT INTO user_route_preference (user_id, avoid_bridge, avoid_tunnel)
VALUES
  (1, true,  true),   -- 新手：避橋避隧道
  (2, true,  false),  -- 一般：只避橋
  (3, false, false),  -- 熟練：不避任何
  (4, false, false);  -- admin

-- =====================
-- 3. route_request
-- =====================
INSERT INTO route_request
  (user_id, user_level_id, start_lng, start_lat, end_lng, end_lat,
   start_geom, end_geom, risk_weight, avoid_bridge, avoid_tunnel)
VALUES
  (1, 1,
   121.3012, 24.9985,
   121.3350, 25.0100,
   ST_SetSRID(ST_Point(121.3012, 24.9985), 4326),
   ST_SetSRID(ST_Point(121.3350, 25.0100), 4326),
   80, true, true),

  (2, 2,
   121.3150, 25.0010,
   121.2980, 24.9920,
   ST_SetSRID(ST_Point(121.3150, 25.0010), 4326),
   ST_SetSRID(ST_Point(121.2980, 24.9920), 4326),
   40, true, false),

  (3, 3,
   121.2980, 24.9920,
   121.3500, 25.0200,
   ST_SetSRID(ST_Point(121.2980, 24.9920), 4326),
   ST_SetSRID(ST_Point(121.3500, 25.0200), 4326),
   10, false, false);

-- =====================
-- 4. route
-- =====================
INSERT INTO route
  (request_id, route_name, total_distance_m, total_base_cost, total_risk_score, total_final_cost)
VALUES
  (1, '安全路線', 4250.5, 4250.5, 12.3,  5234.5),
  (2, '建議路線', 3820.0, 3820.0, 18.7,  4568.0),
  (3, '最短路線', 3100.0, 3100.0, 45.2,  3552.0);

-- =====================
-- 5. route_segment（每條路線取3個 edge 示意）
-- =====================
INSERT INTO route_segment
  (route_id, sequence_order, edge_id, segment_distance_m, segment_base_cost, segment_risk_score, segment_final_cost)
VALUES
  (1, 1, 185311,  27.47,  27.47,  0.0,   27.47),
  (1, 2, 308262,  46.31,  46.31,  0.5,   86.31),
  (1, 3, 301551, 149.56, 149.56,  0.2,  165.56),

  (2, 1, 373719, 105.80, 105.80,  1.2,  153.80),
  (2, 2, 463648, 141.69, 141.69,  0.8,  173.69),
  (2, 3, 185311,  27.47,  27.47,  0.0,   27.47),

  (3, 1, 308262,  46.31,  46.31,  2.1,   67.31),
  (3, 2, 301551, 149.56, 149.56,  3.5,  184.56),
  (3, 3, 373719, 105.80, 105.80,  4.2,  147.80);

-- =====================
-- 6. user_practice_history
-- =====================
INSERT INTO user_practice_history
  (user_id, route_id, practice_time, status, selected_difficulty, score_earned)
VALUES
  (1, 1, '2026-05-20 09:30:00', 'completed',   'BEGINNER',    4),
  (1, 1, '2026-05-21 10:00:00', 'completed',   'BEGINNER',    4),
  (2, 2, '2026-05-19 14:00:00', 'completed',   'NORMAL',     15),
  (2, 2, '2026-05-22 16:30:00', 'abandoned',   'NORMAL',      0),
  (3, 3, '2026-05-18 08:00:00', 'completed',   'EXPERIENCED', 9),
  (1, 2, '2026-05-23 11:00:00', 'in_progress', 'BEGINNER',    0);

-- =====================
-- 驗證
-- =====================
SELECT 'app_user',              COUNT(*) FROM app_user
UNION ALL
SELECT 'user_route_preference', COUNT(*) FROM user_route_preference
UNION ALL
SELECT 'route_request',         COUNT(*) FROM route_request
UNION ALL
SELECT 'route',                 COUNT(*) FROM route
UNION ALL
SELECT 'route_segment',         COUNT(*) FROM route_segment
UNION ALL
SELECT 'user_practice_history', COUNT(*) FROM user_practice_history;
