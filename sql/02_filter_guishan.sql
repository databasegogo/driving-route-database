-- 03_filter_guishan.sql
-- Filter OSM roads by Guishan District boundary.
-- Guishan District adminareas.ogc_fid = 8066

DROP TABLE IF EXISTS roads_guishan;

CREATE TABLE roads_guishan AS
SELECT r.*
FROM roads r
JOIN adminareas g
  ON ST_Intersects(r.geom, g.geom)
WHERE g.ogc_fid = 8066;

-- Check geometry type
SELECT
  COUNT(*) AS total_rows,
  ST_GeometryType(geom) AS geom_type
FROM roads_guishan
GROUP BY ST_GeometryType(geom);
