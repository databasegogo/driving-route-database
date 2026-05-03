-- 02_create_graph_tables.sql
-- Build graph edge table from OSM roads.

DROP TABLE IF EXISTS road_edges_guishan;

CREATE TABLE road_edges_guishan AS
SELECT
  ogc_fid AS edge_id,
  name,
  fclass,
  oneway,
  maxspeed,
  bridge,
  tunnel,
  geom,
  ST_Length(geom::geography) AS length
FROM roads_guishan;

ALTER TABLE road_edges_guishan ADD COLUMN source INTEGER;
ALTER TABLE road_edges_guishan ADD COLUMN target INTEGER;
ALTER TABLE road_edges_guishan ADD COLUMN cost DOUBLE PRECISION;
ALTER TABLE road_edges_guishan ADD COLUMN reverse_cost DOUBLE PRECISION;

UPDATE road_edges_guishan
SET
  cost = length,
  reverse_cost =
    CASE
      WHEN oneway IN ('yes', '1', 'true', 't') THEN -1
      ELSE length
    END;

SELECT pgr_createtopology(
  'road_edges_guishan',
  0.00001,
  'geom',
  'edge_id'
);
