-- 07_create_3nf_tables.sql
-- Build normalized 3NF-like core tables from processing results

DROP TABLE IF EXISTS edge_risk_score CASCADE;
DROP TABLE IF EXISTS accident_edge_match CASCADE;
DROP TABLE IF EXISTS accident CASCADE;
DROP TABLE IF EXISTS accident_severity CASCADE;
DROP TABLE IF EXISTS road_edge CASCADE;
DROP TABLE IF EXISTS road CASCADE;
DROP TABLE IF EXISTS district CASCADE;

-- 1. District
CREATE TABLE district (
  district_id INTEGER PRIMARY KEY,
  osm_id TEXT,
  name TEXT NOT NULL,
  admin_level TEXT,
  geom geometry(Geometry, 4326)
);

INSERT INTO district (
  district_id,
  osm_id,
  name,
  admin_level,
  geom
)
SELECT
  gid AS district_id,
  osm_id::TEXT,
  name::TEXT,
  fclass::TEXT AS admin_level,
  geom
FROM adminareas
WHERE name = '龜山區'
  AND fclass = 'admin_level7';

CREATE INDEX district_geom_idx
ON district
USING GIST (geom);

-- 2. Road
CREATE TABLE road (
  road_id INTEGER PRIMARY KEY,
  osm_id TEXT,
  name TEXT,
  road_class TEXT,
  district_id INTEGER NOT NULL REFERENCES district(district_id),
  oneway TEXT,
  maxspeed SMALLINT,
  bridge TEXT,
  tunnel TEXT,
  geom geometry(Geometry, 4326)
);

INSERT INTO road (
  road_id,
  osm_id,
  name,
  road_class,
  district_id,
  oneway,
  maxspeed,
  bridge,
  tunnel,
  geom
)
SELECT
  r.gid AS road_id,
  r.osm_id::TEXT,
  r.name::TEXT,
  r.fclass::TEXT AS road_class,
  d.district_id,
  r.oneway::TEXT,
  r.maxspeed,
  r.bridge::TEXT,
  r.tunnel::TEXT,
  r.geom
FROM roads_guishan r
CROSS JOIN district d
WHERE d.name = '龜山區';

CREATE INDEX road_geom_idx
ON road
USING GIST (geom);

-- 3. Road edge
CREATE TABLE road_edge (
  edge_id INTEGER PRIMARY KEY,
  road_id INTEGER NOT NULL REFERENCES road(road_id),
  source INTEGER,
  target INTEGER,
  cost DOUBLE PRECISION,
  reverse_cost DOUBLE PRECISION,
  length DOUBLE PRECISION,
  geom geometry(Geometry, 4326)
);

INSERT INTO road_edge (
  edge_id,
  road_id,
  source,
  target,
  cost,
  reverse_cost,
  length,
  geom
)
SELECT
  e.edge_id,
  e.edge_id AS road_id,
  e.source,
  e.target,
  e.cost,
  e.reverse_cost,
  e.length,
  e.geom
FROM road_edges_guishan e
JOIN road r
  ON r.road_id = e.edge_id;

CREATE INDEX road_edge_geom_idx
ON road_edge
USING GIST (geom);

-- 4. Accident severity
CREATE TABLE accident_severity (
  severity_id SERIAL PRIMARY KEY,
  severity_code TEXT UNIQUE NOT NULL,
  severity_name TEXT NOT NULL
);

INSERT INTO accident_severity (
  severity_code,
  severity_name
)
VALUES
  ('A1', '死亡事故'),
  ('A2', '受傷事故'),
  ('A3', '財損事故')
ON CONFLICT (severity_code) DO NOTHING;

-- 5. Accident
CREATE TABLE accident (
  accident_id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_accident_id INTEGER NOT NULL,
  severity_id INTEGER NOT NULL REFERENCES accident_severity(severity_id),
  district_id INTEGER NOT NULL REFERENCES district(district_id),
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  geom geometry(Geometry, 4326),
  UNIQUE (source_type, source_accident_id)
);

INSERT INTO accident (
  source_type,
  source_accident_id,
  severity_id,
  district_id,
  longitude,
  latitude,
  geom
)
SELECT
  'A1' AS source_type,
  a.accident_id AS source_accident_id,
  s.severity_id,
  d.district_id,
  a.longitude,
  a.latitude,
  a.geom
FROM accident_records_a1_guishan a
JOIN accident_severity s
  ON s.severity_code = 'A1'
CROSS JOIN district d
WHERE d.name = '龜山區';

INSERT INTO accident (
  source_type,
  source_accident_id,
  severity_id,
  district_id,
  longitude,
  latitude,
  geom
)
SELECT
  'A2' AS source_type,
  a.accident_id AS source_accident_id,
  s.severity_id,
  d.district_id,
  a.longitude,
  a.latitude,
  a.geom
FROM accident_records_a2_guishan a
JOIN accident_severity s
  ON s.severity_code = 'A2'
CROSS JOIN district d
WHERE d.name = '龜山區';

CREATE INDEX accident_geom_idx
ON accident
USING GIST (geom);

-- 6. Accident to road edge match
CREATE TABLE accident_edge_match (
  match_id SERIAL PRIMARY KEY,
  accident_id INTEGER NOT NULL REFERENCES accident(accident_id),
  edge_id INTEGER NOT NULL REFERENCES road_edge(edge_id),
  distance_to_edge_m DOUBLE PRECISION,
  UNIQUE (accident_id, edge_id)
);

INSERT INTO accident_edge_match (
  accident_id,
  edge_id,
  distance_to_edge_m
)
SELECT
  n.accident_id,
  a.nearest_edge_id,
  a.distance_to_edge_m
FROM accident n
JOIN accident_records_a1_guishan a
  ON n.source_type = 'A1'
 AND n.source_accident_id = a.accident_id
JOIN road_edge e
  ON e.edge_id = a.nearest_edge_id
WHERE a.nearest_edge_id IS NOT NULL;

INSERT INTO accident_edge_match (
  accident_id,
  edge_id,
  distance_to_edge_m
)
SELECT
  n.accident_id,
  a.nearest_edge_id,
  a.distance_to_edge_m
FROM accident n
JOIN accident_records_a2_guishan a
  ON n.source_type = 'A2'
 AND n.source_accident_id = a.accident_id
JOIN road_edge e
  ON e.edge_id = a.nearest_edge_id
WHERE a.nearest_edge_id IS NOT NULL;

-- 7. Edge risk score
CREATE TABLE edge_risk_score (
  edge_id INTEGER PRIMARY KEY REFERENCES road_edge(edge_id),
  accident_count INTEGER NOT NULL,
  a1_count INTEGER NOT NULL,
  a2_count INTEGER NOT NULL,
  severity_score INTEGER NOT NULL,
  accident_density DOUBLE PRECISION,
  risk_score DOUBLE PRECISION NOT NULL
);

INSERT INTO edge_risk_score (
  edge_id,
  accident_count,
  a1_count,
  a2_count,
  severity_score,
  accident_density,
  risk_score
)
SELECT
  re.edge_id,
  COUNT(aem.accident_id)::INTEGER AS accident_count,
  COUNT(*) FILTER (WHERE s.severity_code = 'A1')::INTEGER AS a1_count,
  COUNT(*) FILTER (WHERE s.severity_code = 'A2')::INTEGER AS a2_count,
  (
    COUNT(*) FILTER (WHERE s.severity_code = 'A1') * 3
    + COUNT(*) FILTER (WHERE s.severity_code = 'A2') * 2
  )::INTEGER AS severity_score,
  (
    COUNT(aem.accident_id)::DOUBLE PRECISION
    / (GREATEST(re.length, 50) / 1000.0)
  ) AS accident_density,
  (
    (
      COUNT(*) FILTER (WHERE s.severity_code = 'A1') * 3
      + COUNT(*) FILTER (WHERE s.severity_code = 'A2') * 2
    )::DOUBLE PRECISION
    / (GREATEST(re.length, 50) / 1000.0)
  ) AS risk_score
FROM road_edge re
LEFT JOIN accident_edge_match aem
  ON re.edge_id = aem.edge_id
LEFT JOIN accident a
  ON aem.accident_id = a.accident_id
LEFT JOIN accident_severity s
  ON a.severity_id = s.severity_id
GROUP BY re.edge_id, re.length;

-- Verification
SELECT 'district' AS table_name, COUNT(*) AS count FROM district
UNION ALL
SELECT 'road', COUNT(*) FROM road
UNION ALL
SELECT 'road_edge', COUNT(*) FROM road_edge
UNION ALL
SELECT 'accident_severity', COUNT(*) FROM accident_severity
UNION ALL
SELECT 'accident', COUNT(*) FROM accident
UNION ALL
SELECT 'accident_edge_match', COUNT(*) FROM accident_edge_match
UNION ALL
SELECT 'edge_risk_score', COUNT(*) FROM edge_risk_score;
