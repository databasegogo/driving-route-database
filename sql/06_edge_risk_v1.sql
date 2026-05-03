-- 06_edge_risk_v1.sql
-- Build edge-level risk table from A1/A2 accident records.

DROP TABLE IF EXISTS accident_records_all_guishan;

CREATE TABLE accident_records_all_guishan AS
SELECT
  nearest_edge_id,
  severity
FROM accident_records_a1_guishan

UNION ALL

SELECT
  nearest_edge_id,
  severity
FROM accident_records_a2_guishan;

DROP TABLE IF EXISTS edge_risk_guishan;

CREATE TABLE edge_risk_guishan AS
SELECT
  nearest_edge_id AS edge_id,
  COUNT(*) AS accident_count,
  SUM(
    CASE
      WHEN severity = 'A1' THEN 3
      WHEN severity = 'A2' THEN 2
      WHEN severity = 'A3' THEN 1
      ELSE 1
    END
  ) AS severity_score
FROM accident_records_all_guishan
WHERE nearest_edge_id IS NOT NULL
GROUP BY nearest_edge_id;

ALTER TABLE edge_risk_guishan
  ADD COLUMN accident_density DOUBLE PRECISION;

UPDATE edge_risk_guishan r
SET accident_density = r.accident_count / (
  GREATEST(e.length, 50) / 1000.0
)
FROM road_edges_guishan e
WHERE r.edge_id = e.edge_id;

-- Check high-risk edges
SELECT
  r.edge_id,
  r.accident_count,
  r.severity_score,
  e.length,
  r.accident_density
FROM edge_risk_guishan r
JOIN road_edges_guishan e
  ON r.edge_id = e.edge_id
ORDER BY r.accident_density DESC
LIMIT 20;
