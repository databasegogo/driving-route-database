-- 04_import_accidents.sql
-- Import accident CSV, normalize fields, create geometry, and filter Guishan accidents

DROP TABLE IF EXISTS accident_records_a1_guishan;
DROP TABLE IF EXISTS accident_records_a2_guishan;
DROP TABLE IF EXISTS accident_records_a1;
DROP TABLE IF EXISTS accident_records_a2;
DROP TABLE IF EXISTS accident_records_a1_raw;
DROP TABLE IF EXISTS accident_records_a2_raw;

-- Raw tables: use generic column names because source CSV has many Chinese headers
-- c05 = 事故類別名稱
-- c50 = 經度
-- c51 = 緯度

CREATE UNLOGGED TABLE accident_records_a1_raw (
  c01 TEXT, c02 TEXT, c03 TEXT, c04 TEXT, c05 TEXT,
  c06 TEXT, c07 TEXT, c08 TEXT, c09 TEXT, c10 TEXT,
  c11 TEXT, c12 TEXT, c13 TEXT, c14 TEXT, c15 TEXT,
  c16 TEXT, c17 TEXT, c18 TEXT, c19 TEXT, c20 TEXT,
  c21 TEXT, c22 TEXT, c23 TEXT, c24 TEXT, c25 TEXT,
  c26 TEXT, c27 TEXT, c28 TEXT, c29 TEXT, c30 TEXT,
  c31 TEXT, c32 TEXT, c33 TEXT, c34 TEXT, c35 TEXT,
  c36 TEXT, c37 TEXT, c38 TEXT, c39 TEXT, c40 TEXT,
  c41 TEXT, c42 TEXT, c43 TEXT, c44 TEXT, c45 TEXT,
  c46 TEXT, c47 TEXT, c48 TEXT, c49 TEXT, c50 TEXT,
  c51 TEXT, c52 TEXT
);

CREATE UNLOGGED TABLE accident_records_a2_raw (
  c01 TEXT, c02 TEXT, c03 TEXT, c04 TEXT, c05 TEXT,
  c06 TEXT, c07 TEXT, c08 TEXT, c09 TEXT, c10 TEXT,
  c11 TEXT, c12 TEXT, c13 TEXT, c14 TEXT, c15 TEXT,
  c16 TEXT, c17 TEXT, c18 TEXT, c19 TEXT, c20 TEXT,
  c21 TEXT, c22 TEXT, c23 TEXT, c24 TEXT, c25 TEXT,
  c26 TEXT, c27 TEXT, c28 TEXT, c29 TEXT, c30 TEXT,
  c31 TEXT, c32 TEXT, c33 TEXT, c34 TEXT, c35 TEXT,
  c36 TEXT, c37 TEXT, c38 TEXT, c39 TEXT, c40 TEXT,
  c41 TEXT, c42 TEXT, c43 TEXT, c44 TEXT, c45 TEXT,
  c46 TEXT, c47 TEXT, c48 TEXT, c49 TEXT, c50 TEXT,
  c51 TEXT, c52 TEXT
);

COPY accident_records_a1_raw
FROM '/data/raw/accidents_a1.csv'
WITH (
  FORMAT csv,
  HEADER true,
  ENCODING 'UTF8'
);

COPY accident_records_a2_raw
FROM '/data/raw/accidents_a2.csv'
WITH (
  FORMAT csv,
  HEADER true,
  ENCODING 'UTF8'
);

-- Normalized accident tables
CREATE TABLE accident_records_a1 (
  accident_id SERIAL PRIMARY KEY,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  severity TEXT,
  geom geometry(Point, 4326)
);

CREATE TABLE accident_records_a2 (
  accident_id SERIAL PRIMARY KEY,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  severity TEXT,
  geom geometry(Point, 4326)
);

INSERT INTO accident_records_a1 (longitude, latitude, severity, geom)
SELECT
  c50::DOUBLE PRECISION AS longitude,
  c51::DOUBLE PRECISION AS latitude,
  c05 AS severity,
  ST_SetSRID(ST_MakePoint(c50::DOUBLE PRECISION, c51::DOUBLE PRECISION), 4326) AS geom
FROM accident_records_a1_raw
WHERE c50 ~ '^[0-9]+(\.[0-9]+)?$'
  AND c51 ~ '^[0-9]+(\.[0-9]+)?$'
  AND c50::DOUBLE PRECISION BETWEEN 119 AND 123
  AND c51::DOUBLE PRECISION BETWEEN 21 AND 26;

INSERT INTO accident_records_a2 (longitude, latitude, severity, geom)
SELECT
  c50::DOUBLE PRECISION AS longitude,
  c51::DOUBLE PRECISION AS latitude,
  c05 AS severity,
  ST_SetSRID(ST_MakePoint(c50::DOUBLE PRECISION, c51::DOUBLE PRECISION), 4326) AS geom
FROM accident_records_a2_raw
WHERE c50 ~ '^[0-9]+(\.[0-9]+)?$'
  AND c51 ~ '^[0-9]+(\.[0-9]+)?$'
  AND c50::DOUBLE PRECISION BETWEEN 119 AND 123
  AND c51::DOUBLE PRECISION BETWEEN 21 AND 26;

CREATE INDEX accident_records_a1_geom_idx
ON accident_records_a1
USING GIST (geom);

CREATE INDEX accident_records_a2_geom_idx
ON accident_records_a2
USING GIST (geom);

-- Filter accidents inside Guishan District
DROP TABLE IF EXISTS accident_records_a1_guishan;
CREATE TABLE accident_records_a1_guishan AS
SELECT a.*
FROM accident_records_a1 a
JOIN adminareas g
  ON ST_Covers(g.geom, a.geom)
WHERE g.name = '龜山區'
  AND g.fclass = 'admin_level7';

DROP TABLE IF EXISTS accident_records_a2_guishan;
CREATE TABLE accident_records_a2_guishan AS
SELECT a.*
FROM accident_records_a2 a
JOIN adminareas g
  ON ST_Covers(g.geom, a.geom)
WHERE g.name = '龜山區'
  AND g.fclass = 'admin_level7';

CREATE INDEX accident_records_a1_guishan_geom_idx
ON accident_records_a1_guishan
USING GIST (geom);

CREATE INDEX accident_records_a2_guishan_geom_idx
ON accident_records_a2_guishan
USING GIST (geom);

ALTER TABLE accident_records_a1_guishan
  ADD COLUMN IF NOT EXISTS nearest_edge_id INTEGER,
  ADD COLUMN IF NOT EXISTS distance_to_edge_m DOUBLE PRECISION;

ALTER TABLE accident_records_a2_guishan
  ADD COLUMN IF NOT EXISTS nearest_edge_id INTEGER,
  ADD COLUMN IF NOT EXISTS distance_to_edge_m DOUBLE PRECISION;

-- Verify result
SELECT COUNT(*) AS accident_records_a1_raw_count
FROM accident_records_a1_raw;

SELECT COUNT(*) AS accident_records_a2_raw_count
FROM accident_records_a2_raw;

SELECT COUNT(*) AS accident_records_a1_count
FROM accident_records_a1;

SELECT COUNT(*) AS accident_records_a2_count
FROM accident_records_a2;

SELECT COUNT(*) AS accident_records_a1_guishan_count
FROM accident_records_a1_guishan;

SELECT COUNT(*) AS accident_records_a2_guishan_count
FROM accident_records_a2_guishan;
