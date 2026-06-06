# Database Schema

本資料庫分為四層架構：

```
Layer 1：原始資料（OSM + 事故 CSV）
Layer 2：處理層（龜山區篩選、拓撲建立、事故對應）
Layer 3：正規化核心資料表（3NF）
Layer 4：應用層資料表（使用者、路線、練習紀錄）
```

---

## Layer 1 — 原始資料表

### roads
原始 OSM 台灣道路資料（由 shp2pgsql 匯入）。

| 欄位 | 說明 |
|------|------|
| gid | Primary Key |
| name | 道路名稱 |
| fclass | 道路分類（motorway, residential...） |
| oneway | 單向設定 |
| maxspeed | 速限 |
| bridge | 橋樑標記 |
| tunnel | 隧道標記 |
| geom | LineString (SRID 4326) |

### adminareas
原始 OSM 行政區資料。

| 欄位 | 說明 |
|------|------|
| gid | Primary Key |
| name | 行政區名稱 |
| fclass | 層級（admin_level7 = 區） |
| geom | Polygon (SRID 4326) |

---

## Layer 2 — 處理層

### roads_guishan
龜山區道路（由 roads 篩選）。

### road_edges_guishan
pgRouting graph edge 表。

| 欄位 | 說明 |
|------|------|
| edge_id | Primary Key |
| source | 起點 node id |
| target | 終點 node id |
| cost | 正向行駛成本（= length） |
| reverse_cost | 反向行駛成本（單行道為 -1） |
| length | 路段長度（公尺） |
| bridge | 橋樑標記 |
| tunnel | 隧道標記 |
| geom | LineString |

### road_edges_guishan_vertices_pgr
pgRouting 自動產生的節點表（7,727 個節點）。

| 欄位 | 說明 |
|------|------|
| id | Node id |
| the_geom | Point |

### accident_records_a1 / a2
正規化後的事故資料（含 geom）。

### accident_records_a1_guishan / a2_guishan
龜山區範圍內的事故，含 nearest_edge_id、distance_to_edge_m。

### edge_risk_guishan
路段風險彙整（中間處理表）。

---

## Layer 3 — 正規化核心資料表

### district
| 欄位 | 說明 |
|------|------|
| district_id | PK |
| name | 龜山區 |
| geom | Polygon |

### road
| 欄位 | 說明 |
|------|------|
| road_id | PK |
| name | 道路名稱 |
| road_class | 道路分類 |
| district_id | FK → district |
| oneway / maxspeed / bridge / tunnel | 道路屬性 |
| geom | LineString |

### road_edge
| 欄位 | 說明 |
|------|------|
| edge_id | PK |
| road_id | FK → road |
| source / target | 節點 id |
| cost / reverse_cost | 行駛成本 |
| length | 路段長度（公尺） |
| geom | LineString |

### accident_severity
| 欄位 | 說明 |
|------|------|
| severity_id | PK |
| severity_code | A1 / A2 / A3 |
| severity_name | 死亡 / 受傷 / 財損 |

### accident
| 欄位 | 說明 |
|------|------|
| accident_id | PK |
| source_type | A1 / A2 |
| severity_id | FK → accident_severity |
| district_id | FK → district |
| longitude / latitude / geom | 位置 |

### accident_edge_match
事故與路段的對應關係。

| 欄位 | 說明 |
|------|------|
| match_id | PK |
| accident_id | FK → accident |
| edge_id | FK → road_edge |
| distance_to_edge_m | 事故點到路段距離 |

### edge_risk_score
路段風險分數表。

| 欄位 | 說明 |
|------|------|
| edge_id | PK, FK → road_edge |
| accident_count | 事故總數 |
| a1_count / a2_count | 各類型事故數 |
| severity_score | 加權嚴重度（A1×3, A2×2） |
| accident_density | 每公里事故數 |
| risk_score | 最終風險分數（用於 routing cost） |

### main_component_nodes
最大連通圖的節點（1,082 個），路線規劃只在這裡面找起終點。

---

## Layer 4 — 應用層資料表

### user_level
| 欄位 | 說明 |
|------|------|
| user_level_id | PK |
| level_code | BEGINNER / NORMAL / EXPERIENCED |
| risk_weight | 路線風險權重（80 / 40 / 10） |
| min_score | 升等所需最低分數（0 / **150** / **300**）|

> v1.3.0 起閾值由 0/500/2000 調整為 **0/150/300**，與前端 `getMaxDifficulty(total_score)` 對齊。

### app_user
| 欄位 | 說明 |
|------|------|
| user_id | PK |
| username / email / password_hash | 帳號資訊 |
| birth_date / license_date / address | 個人資料 |
| user_level_id | FK → user_level |
| total_score | 累積總分 |
| role | user / admin |

### user_route_preference
使用者路線偏好設定（弱實體）。

| 欄位 | 說明 |
|------|------|
| user_id | PK, FK → app_user |
| avoid_bridge / avoid_tunnel | 是否避橋/隧道 |
| max_distance_m | 距離上限（NULL = 不限） |

### route_request
每次路線規劃的請求紀錄。

| 欄位 | 說明 |
|------|------|
| request_id | PK |
| user_id / user_level_id | 使用者與當下等級 |
| start_lng/lat / end_lng/lat | 起終點座標 |
| start_geom / end_geom | 起終點幾何 |
| risk_weight | 此次使用的風險權重 |
| avoid_bridge / avoid_tunnel | 此次偏好設定快照 |
| max_distance_m | 此次距離上限 |

### route
每條規劃出的路線（一個 request 對應最多 3 條）。

| 欄位 | 說明 |
|------|------|
| route_id | PK |
| request_id | FK → route_request |
| route_name | 例：BEGINNER 路線 1 |
| total_distance_m | 總距離（公尺） |
| total_base_cost / total_risk_score / total_final_cost | 成本彙整 |
| estimated_duration_sec | 預估行駛時間（秒） |

### route_segment
路線的每個路段（弱實體）。

| 欄位 | 說明 |
|------|------|
| route_id | FK → route |
| sequence_order | 路段順序 |
| edge_id | FK → road_edge |
| segment_distance_m / segment_base_cost / segment_risk_score / segment_final_cost | 路段成本 |

### user_practice_history
使用者練習紀錄。

| 欄位 | 說明 |
|------|------|
| practice_id | PK |
| user_id / route_id | FK |
| practice_time | 練習開始時間 |
| end_time | 練習結束時間 |
| status | completed / in_progress / abandoned |
| selected_difficulty | 此次選擇的難度 |
| score_earned | 獲得分數（基本分 + time_bonus） |
| time_bonus | 在預估時間內完成的加分（基本分 × 50%） |
| is_favorite | 愛心收藏 |
| gps_verified | GPS 偵測到達終點（true = 全額計分，不受當日限制）|
| terminated_early | 使用者提前終止練習（折扣計分 × 0.8）|
