# Database Schema

## Overview

本資料庫以 PostGIS + pgRouting 為核心，將道路資料轉換為 graph 結構，並整合交通事故資料以建立風險模型。

---

## Core Tables

### roads

原始 OSM 道路資料。

| Column | Description |
|---|---|
| ogc_fid | primary key |
| name | 道路名稱 |
| fclass | 道路分類 |
| oneway | 單向/雙向 |
| maxspeed | 速限 |
| bridge | 是否為橋 |
| tunnel | 是否為隧道 |
| geom | LineString |

---

### adminareas

行政區資料（OSM）。

| Column | Description |
|---|---|
| ogc_fid | primary key |
| name | 行政區名稱 |
| fclass | 層級（admin_level） |
| geom | Polygon |

---

## Processed Tables

### roads_guishan

龜山區道路資料（由 roads 篩選）。

---

### road_edges_guishan

Graph edge 表。

| Column | Description |
|---|---|
| edge_id | primary key |
| source | 起點 node |
| target | 終點 node |
| length | 距離（公尺） |
| cost | 基本成本 |
| reverse_cost | 反向成本 |
| geom | LineString |

---

### road_edges_guishan_vertices_pgr

Graph node 表（pgRouting 自動產生）。

| Column | Description |
|---|---|
| id | node id |
| geom | Point |

---

## Accident Tables

### accident_records_a1

A1（死亡）事故資料。

---

### accident_records_a2

A2（受傷）事故資料。

---

### accident_records_a1_guishan

龜山區 A1。

---

### accident_records_a2_guishan

龜山區 A2。

---

### accident_records_all_guishan

A1 + A2 合併。

| Column | Description |
|---|---|
| nearest_edge_id | 對應 edge |
| severity | 嚴重度 |

---

## Risk Table

### edge_risk_guishan

道路風險表（edge level）。

| Column | Description |
|---|---|
| edge_id | 對應 edge |
| accident_count | 事故數 |
| severity_score | 嚴重度加權 |
| accident_density | 每公里事故數 |

---

## Notes

- graph 建立基於 pgRouting topology
- accident → edge mapping 使用最近距離
- risk 模型仍在調整中
