-- 10_bridge_gaps.sql
-- 在孤立路段與主路網之間插入虛擬橋接邊，解決體育大學等區域
-- 因 OSM 資料 gap > pgr_createTopology tolerance 而無法路由的問題。
--
-- 執行時機：07_create_3nf_tables.sql 與 09_routing_helpers.sql 之後
-- 可重複執行（idempotent）：先清除前一次的橋接資料再重建

-- ── 0. 清除前一次橋接資料 ─────────────────────────────────────────────────
DELETE FROM road_edge WHERE edge_id >= 9000000;
DELETE FROM road       WHERE road_id = 9000001;

-- ── 0b. 修補 road_edge 裡 geom = NULL 的邊（OSM 資料缺漏）─────────────────
-- geom 為 NULL 的邊仍會參與路由，但 ST_AsGeoJSON(NULL) 讓前端渲染出現斷點。
-- 用 source/target 頂點座標拉一條直線填補，保持視覺連續。
UPDATE road_edge re
SET    geom = ST_SetSRID(ST_MakeLine(vsrc.the_geom, vtgt.the_geom), 4326)
FROM   road_edges_guishan_vertices_pgr vsrc,
       road_edges_guishan_vertices_pgr vtgt
WHERE  vsrc.id = re.source
  AND  vtgt.id = re.target
  AND  re.geom IS NULL;

SELECT '=== NULL geom 邊修補完成 ===' AS info;
SELECT COUNT(*) AS still_null_after_fix FROM road_edge WHERE geom IS NULL;

-- ── 1. 各連通分量大小（暫存表） ────────────────────────────────────────────
DROP TABLE IF EXISTS _comp;
CREATE TEMP TABLE _comp AS
SELECT node, component, COUNT(*) OVER (PARTITION BY component) AS comp_size
FROM pgr_connectedComponents(
  'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
);

-- 診斷：橋接前分量分佈
SELECT '=== 橋接前分量大小分佈 ===' AS info;
SELECT component, comp_size
FROM _comp
GROUP BY component, comp_size
ORDER BY comp_size DESC
LIMIT 10;

-- ── 2. 找橋接節點對 ─────────────────────────────────────────────────────────
-- 策略：對每個「非最大分量」的節點，找最大分量中距離最近的節點
-- 若距離 ≤ 80m → 建立橋接
-- 每個孤立分量只橋接一條邊（最近的那對），以保持圖的簡潔
DROP TABLE IF EXISTS _bridge_pairs;
CREATE TEMP TABLE _bridge_pairs AS
WITH main_comp_id AS (
  -- 最大分量 id
  SELECT component
  FROM _comp
  GROUP BY component
  ORDER BY COUNT(*) DESC
  LIMIT 1
),
main_nodes AS (
  SELECT c.node, v.the_geom
  FROM _comp c
  JOIN road_edges_guishan_vertices_pgr v ON v.id = c.node
  WHERE c.component = (SELECT component FROM main_comp_id)
),
isolated_nodes AS (
  SELECT c.node, c.component AS iso_comp, v.the_geom
  FROM _comp c
  JOIN road_edges_guishan_vertices_pgr v ON v.id = c.node
  WHERE c.component != (SELECT component FROM main_comp_id)
)
-- DISTINCT ON (iso_comp)：每個孤立分量只取最近的那對節點
SELECT DISTINCT ON (iso.iso_comp)
  iso.node         AS from_node,
  mn.node          AS to_node,
  iso.the_geom     AS from_geom,
  mn.the_geom      AS to_geom,
  ST_Distance(iso.the_geom::geography, mn.the_geom::geography) AS dist_m
FROM isolated_nodes iso
CROSS JOIN LATERAL (
  -- KNN：找最近的主分量節點（GiST index 加速）
  SELECT m.node, m.the_geom
  FROM main_nodes m
  ORDER BY iso.the_geom <-> m.the_geom
  LIMIT 1
) mn
WHERE ST_Distance(iso.the_geom::geography, mn.the_geom::geography) <= 80
ORDER BY iso.iso_comp, dist_m;

SELECT '=== 找到橋接對數量 ===' AS info;
SELECT COUNT(*) AS bridge_edges_to_insert FROM _bridge_pairs;

-- ── 3. 插入虛擬道路紀錄（所有橋接邊共用一個 road） ─────────────────────────
INSERT INTO road (
  road_id, osm_id, name, road_class,
  district_id, oneway, maxspeed, bridge, tunnel, geom
)
VALUES (
  9000001,
  'virtual_bridge',
  '(路網連通補丁)',
  'residential',
  (SELECT district_id FROM district ORDER BY district_id LIMIT 1),
  'B',   -- bidirectional
  30,
  'F',
  'F',
  NULL
);

-- ── 4. 插入橋接邊到 road_edge ─────────────────────────────────────────────
INSERT INTO road_edge (
  edge_id, road_id, source, target,
  cost, reverse_cost, length, geom
)
SELECT
  9000000 + ROW_NUMBER() OVER (ORDER BY from_node) AS edge_id,
  9000001                                          AS road_id,
  from_node                                        AS source,
  to_node                                          AS target,
  dist_m                                           AS cost,
  dist_m                                           AS reverse_cost,
  dist_m                                           AS length,
  ST_SetSRID(ST_MakeLine(from_geom, to_geom), 4326) AS geom
FROM _bridge_pairs;

SELECT '=== 橋接邊已插入 ===' AS info;
SELECT COUNT(*) AS inserted FROM road_edge WHERE edge_id >= 9000000;

-- ── 5. 重建 main_component_nodes ──────────────────────────────────────────
DROP TABLE IF EXISTS main_component_nodes;
CREATE TABLE main_component_nodes AS
WITH all_comp AS (
  SELECT node, component
  FROM pgr_connectedComponents(
    'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
  )
)
SELECT node
FROM all_comp
WHERE component IN (
  SELECT component FROM all_comp
  GROUP BY component
  HAVING COUNT(*) >= 5
);

CREATE INDEX main_component_nodes_idx ON main_component_nodes(node);

-- ── 6. 結果確認 ────────────────────────────────────────────────────────────
SELECT '=== 橋接後可路由節點數 ===' AS info;
SELECT COUNT(*) AS routable_nodes FROM main_component_nodes;

SELECT '=== 橋接後分量大小分佈 ===' AS info;
WITH all_comp AS (
  SELECT node, component
  FROM pgr_connectedComponents(
    'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
  )
)
SELECT component, COUNT(*) AS node_count
FROM all_comp
GROUP BY component
ORDER BY node_count DESC
LIMIT 10;
