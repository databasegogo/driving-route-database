# Data Pipeline

## 概覽

```
OSM Shapefile（roads, adminareas）
        ↓  shp2pgsql
Layer 1：原始資料表（roads, adminareas, accident_records）
        ↓  SQL 02-03
Layer 2：處理層（roads_guishan, road_edges_guishan, 事故對應）
        ↓  SQL 04-06
Layer 2：風險計算（edge_risk_score）
        ↓  SQL 07
Layer 3：正規化核心表（district, road, road_edge, accident, edge_risk_score）
        ↓  SQL 08
Layer 4：應用層（user_level, app_user, route, user_practice_history...）
        ↓  SQL 09
輔助表：main_component_nodes（確保路線連通性）
```

---

## 各步驟說明

### SQL 01 — 啟用擴充
```sql
CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;
CREATE EXTENSION pgrouting;
```

---

### OSM 匯入 — shp2pgsql
```bash
shp2pgsql -I -s 4326 gis_osm_roads_free_1.shp roads | psql -d gisdb
shp2pgsql -I -s 4326 gis_osm_adminareas_a_free_1.shp adminareas | psql -d gisdb
```

---

### SQL 02 — 篩選龜山區
```sql
CREATE TABLE roads_guishan AS
SELECT r.* FROM roads r
JOIN adminareas g ON ST_Intersects(r.geom, g.geom)
WHERE g.name = '龜山區' AND g.fclass = 'admin_level7';
```

---

### SQL 03 — 建立 pgRouting Topology
```sql
SELECT pgr_createtopology(
  'road_edges_guishan',
  0.0001,       -- tolerance：約 11 公尺，確保節點正確合併
  'geom',
  'edge_id'
);

SELECT pgr_createVerticesTable(
  'road_edges_guishan', 'geom', 'source', 'target'
);
```

產生：
- `road_edges_guishan_vertices_pgr`：7,727 個節點
- `road_edges_guishan.source` / `.target`：已填入節點 id

---

### SQL 04 — 匯入事故資料
從 CSV 匯入 A1（死亡）和 A2（受傷）事故資料，建立 geom 欄位。

---

### SQL 05 — 事故對應 Edge
```sql
UPDATE accident_records_a1_guishan a
SET nearest_edge_id = (
  SELECT e.edge_id FROM road_edges_guishan e
  ORDER BY a.geom <-> e.geom LIMIT 1
);
```

---

### SQL 06 — 計算道路風險
```sql
risk_score = severity_score / (edge_length_km)
-- A1 事故 × 3 權重，A2 事故 × 2 權重
```

---

### SQL 07 — 正規化 3NF 資料表
將 Layer 2 的處理結果整理為正規化的核心資料表：
- district, road, road_edge
- accident_severity, accident, accident_edge_match
- edge_risk_score

---

### SQL 08 — 應用層資料表
建立使用者系統與路線規劃所需的表格：
- user_level（含升等門檻）
- app_user, user_route_preference
- route_request, route, route_segment
- user_practice_history

---

### SQL 09 — 路由輔助表
```sql
CREATE TABLE main_component_nodes AS
SELECT node FROM pgr_connectedComponents(...)
WHERE component = (最大的連通圖);
```

路網有多個孤立的小片段，共 7,727 個節點但最大連通圖只有 **1,082 個節點**。
路線規劃的起終點節點都限制在這 1,082 個節點內，確保一定找得到路。

---

## Routing Cost 公式

```
final_cost = base_cost + risk_score × risk_weight

risk_weight：
  BEGINNER    = 80  （最重視安全）
  NORMAL      = 40
  EXPERIENCED = 10  （最接近一般導航）

avoid_bridge / avoid_tunnel：
  True → 該路段 cost 強制設為 999999（幾乎不會選到）
```

---

## 計分公式

```
base_score  = floor(distance_km) × difficulty_weight
time_bonus  = floor(base_score × 0.5)  -- 僅在預估時間內完成才有
score_earned = base_score + time_bonus

difficulty_weight：BEGINNER=1, NORMAL=2, EXPERIENCED=3

estimated_duration_sec = distance_m ÷ (30km/h) × 1.2 緩衝
```
