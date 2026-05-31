-- 03_create_graph_tables.sql
-- Build graph edge table from OSM roads.

DROP TABLE IF EXISTS road_edges_guishan;

CREATE TABLE road_edges_guishan AS
SELECT
  gid AS edge_id,
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

-- tolerance 0.0001 度（約 11 公尺）確保節點正確合併，圖連通
SELECT pgr_createtopology(
  'road_edges_guishan',
  0.0001,
  'geom',
  'edge_id'
);

-- 重建頂點表（確保 road_edges_guishan_vertices_pgr 有資料）
SELECT pgr_createVerticesTable(
  'road_edges_guishan',
  'geom',
  'source',
  'target'
);
