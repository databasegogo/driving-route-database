-- 05_match_accident_to_edge.sql
-- Match accident points to nearest road edge.

-- A1: nearest edge
UPDATE accident_records_a1_guishan a
SET nearest_edge_id = (
  SELECT e.edge_id
  FROM road_edges_guishan e
  ORDER BY a.geom <-> e.geom
  LIMIT 1
);

-- A1: distance to edge in meters
UPDATE accident_records_a1_guishan a
SET distance_to_edge_m = (
  SELECT ST_Distance(a.geom::geography, e.geom::geography)
  FROM road_edges_guishan e
  WHERE e.edge_id = a.nearest_edge_id
);

-- A2: nearest edge
UPDATE accident_records_a2_guishan a
SET nearest_edge_id = (
  SELECT e.edge_id
  FROM road_edges_guishan e
  ORDER BY a.geom <-> e.geom
  LIMIT 1
);

-- A2: distance to edge in meters
UPDATE accident_records_a2_guishan a
SET distance_to_edge_m = (
  SELECT ST_Distance(a.geom::geography, e.geom::geography)
  FROM road_edges_guishan e
  WHERE e.edge_id = a.nearest_edge_id
);

-- Quality check
SELECT
  'A1' AS dataset,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 20) AS within_20m,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 50) AS within_50m,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 100) AS within_100m,
  COUNT(*) FILTER (WHERE distance_to_edge_m > 100) AS over_100m
FROM accident_records_a1_guishan

UNION ALL

SELECT
  'A2' AS dataset,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 20) AS within_20m,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 50) AS within_50m,
  COUNT(*) FILTER (WHERE distance_to_edge_m <= 100) AS within_100m,
  COUNT(*) FILTER (WHERE distance_to_edge_m > 100) AS over_100m
FROM accident_records_a2_guishan;
