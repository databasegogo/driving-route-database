-- 09_routing_helpers.sql
-- Build helper tables for routing performance.
-- Must run AFTER 07_create_3nf_tables.sql (depends on road_edge).

-- ── Main connected component nodes ───────────────────────────────
-- pgRouting graph has multiple disconnected components.
-- This table contains only nodes in the LARGEST component,
-- ensuring start/end nodes are always mutually reachable.

DROP TABLE IF EXISTS main_component_nodes;

CREATE TABLE main_component_nodes AS
SELECT node
FROM pgr_connectedComponents(
  'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
)
WHERE component = (
  SELECT component
  FROM pgr_connectedComponents(
    'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
  )
  GROUP BY component
  ORDER BY COUNT(*) DESC
  LIMIT 1
);

CREATE INDEX main_component_nodes_idx ON main_component_nodes(node);

-- Verify
SELECT COUNT(*) AS main_component_node_count FROM main_component_nodes;
