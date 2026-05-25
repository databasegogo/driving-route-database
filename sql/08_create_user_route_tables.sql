-- 08_create_user_route_tables.sql
-- Create user, preference, route planning, and practice history tables

DROP TABLE IF EXISTS user_practice_history CASCADE;
DROP TABLE IF EXISTS route_segment CASCADE;
DROP TABLE IF EXISTS route CASCADE;
DROP TABLE IF EXISTS route_request CASCADE;
DROP TABLE IF EXISTS user_route_preference CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;
DROP TABLE IF EXISTS user_level CASCADE;

-- 1. User Level
CREATE TABLE user_level (
  user_level_id SERIAL PRIMARY KEY,
  level_code    TEXT UNIQUE NOT NULL,
  level_name    TEXT NOT NULL,
  risk_weight   INTEGER NOT NULL,
  min_score     INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO user_level (level_code, level_name, risk_weight, min_score, description)
VALUES
  ('BEGINNER',    '新手駕駛', 80,    0, '剛取得駕照，優先選擇低風險路段'),
  ('NORMAL',      '一般駕駛', 40,  500, '有基本駕駛經驗，平衡距離與風險'),
  ('EXPERIENCED', '熟練駕駛', 10, 2000, '駕駛經驗豐富，接近一般導航');

-- 2. App User
CREATE TABLE app_user (
  user_id       SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  birth_date    DATE,
  license_date  DATE,
  address       TEXT,
  home_lat      DECIMAL(10,8),
  home_lng      DECIMAL(11,8),
  user_level_id INTEGER NOT NULL REFERENCES user_level(user_level_id),
  total_score   INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX app_user_email_idx ON app_user(email);
CREATE INDEX app_user_level_idx ON app_user(user_level_id);

-- 3. User Route Preference (weak entity)
CREATE TABLE user_route_preference (
  user_id      INTEGER PRIMARY KEY REFERENCES app_user(user_id),
  avoid_bridge BOOLEAN NOT NULL DEFAULT false,
  avoid_tunnel BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Route Request
CREATE TABLE route_request (
  request_id    SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES app_user(user_id),
  user_level_id INTEGER NOT NULL REFERENCES user_level(user_level_id),
  start_lng     DOUBLE PRECISION NOT NULL,
  start_lat     DOUBLE PRECISION NOT NULL,
  end_lng       DOUBLE PRECISION NOT NULL,
  end_lat       DOUBLE PRECISION NOT NULL,
  start_geom    geometry(Point, 4326),
  end_geom      geometry(Point, 4326),
  risk_weight   INTEGER NOT NULL,
  avoid_bridge  BOOLEAN NOT NULL DEFAULT false,
  avoid_tunnel  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX route_request_user_idx   ON route_request(user_id);
CREATE INDEX route_request_geom_s_idx ON route_request USING GIST(start_geom);
CREATE INDEX route_request_geom_e_idx ON route_request USING GIST(end_geom);

-- 5. Route
CREATE TABLE route (
  route_id         SERIAL PRIMARY KEY,
  request_id       INTEGER NOT NULL REFERENCES route_request(request_id),
  route_name       TEXT,
  total_distance_m DOUBLE PRECISION,
  total_base_cost  DOUBLE PRECISION,
  total_risk_score DOUBLE PRECISION,
  total_final_cost DOUBLE PRECISION,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX route_request_idx ON route(request_id);

-- 6. Route Segment (weak entity)
CREATE TABLE route_segment (
  route_id            INTEGER NOT NULL REFERENCES route(route_id),
  sequence_order      INTEGER NOT NULL,
  edge_id             INTEGER NOT NULL REFERENCES road_edge(edge_id),
  segment_distance_m  DOUBLE PRECISION,
  segment_base_cost   DOUBLE PRECISION,
  segment_risk_score  DOUBLE PRECISION,
  segment_final_cost  DOUBLE PRECISION,
  PRIMARY KEY (route_id, sequence_order)
);

CREATE INDEX route_segment_edge_idx ON route_segment(edge_id);

-- 7. User Practice History
CREATE TABLE user_practice_history (
  practice_id         SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES app_user(user_id),
  route_id            INTEGER REFERENCES route(route_id),
  practice_time       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status              TEXT NOT NULL DEFAULT 'in_progress',
  selected_difficulty TEXT NOT NULL,
  score_earned        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX practice_user_idx  ON user_practice_history(user_id);
CREATE INDEX practice_route_idx ON user_practice_history(route_id);

-- Verification
SELECT 'user_level'             AS table_name, COUNT(*) AS count FROM user_level
UNION ALL
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
