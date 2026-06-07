-- 09_routing_helpers.sql
-- Build helper tables for routing performance.
-- Must run AFTER 07_create_3nf_tables.sql (depends on road_edge).

-- ── Main connected component nodes ───────────────────────────────
-- pgRouting graph has multiple disconnected components.
-- This table contains only nodes in the LARGEST component,
-- ensuring start/end nodes are always mutually reachable.

DROP TABLE IF EXISTS main_component_nodes;

-- 納入所有節點數 >= 5 的連通分量（不只最大分量）
-- 龜山區 OSM 路網有許多社區巷弄因幾何 gap 而形成獨立分量，
-- 擴展閾值讓這些社區路也能被 snap 和路由使用。
-- 起終點若位於不同分量，pgr_ksp 會回傳空路徑（前端顯示 NO_PATH_FOUND）。
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

-- Verify
SELECT COUNT(*) AS routable_node_count FROM main_component_nodes;

-- 各分量大小分佈（除錯用）
SELECT component, COUNT(*) AS node_count
FROM pgr_connectedComponents(
  'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
)
GROUP BY component
ORDER BY node_count DESC
LIMIT 20;
