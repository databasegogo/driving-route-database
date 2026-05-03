-- 04_import_accidents.sql
-- Prepare accident tables (geom + Guishan filtering)

-- 1) Ensure geom exists (SRID 4326)
UPDATE accident_records_a1
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE geom IS NULL;

UPDATE accident_records_a2
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE geom IS NULL;

-- 2) Filter Guishan (adminareas.ogc_fid = 8066)
DROP TABLE IF EXISTS accident_records_a1_guishan;
CREATE TABLE accident_records_a1_guishan AS
SELECT a.*
FROM accident_records_a1 a
JOIN adminareas g
  ON ST_Contains(g.geom, a.geom)
WHERE g.ogc_fid = 8066;

DROP TABLE IF EXISTS accident_records_a2_guishan;
CREATE TABLE accident_records_a2_guishan AS
SELECT a.*
FROM accident_records_a2 a
JOIN adminareas g
  ON ST_Contains(g.geom, a.geom)
WHERE g.ogc_fid = 8066;

-- 3) Ensure mapping columns exist
ALTER TABLE accident_records_a1_guishan
  ADD COLUMN IF NOT EXISTS nearest_edge_id INTEGER,
  ADD COLUMN IF NOT EXISTS distance_to_edge_m DOUBLE PRECISION;

ALTER TABLE accident_records_a2_guishan
  ADD COLUMN IF NOT EXISTS nearest_edge_id INTEGER,
  ADD COLUMN IF NOT EXISTS distance_to_edge_m DOUBLE PRECISION;
