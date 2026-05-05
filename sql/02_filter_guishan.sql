DROP TABLE IF EXISTS roads_guishan;

CREATE TABLE roads_guishan AS
SELECT r.*
FROM roads r
JOIN adminareas g
  ON ST_Intersects(r.geom, g.geom)
WHERE g.name = '龜山區'
  AND g.fclass = 'admin_level7';

CREATE INDEX roads_guishan_geom_idx
ON roads_guishan
USING GIST (geom);

SELECT COUNT(*) AS roads_guishan_count
FROM roads_guishan;
