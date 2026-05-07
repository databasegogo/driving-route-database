# Driving Route Database

## Project Overview

本專案建立一套以 PostgreSQL、PostGIS、pgRouting 為核心的道路資料庫系統，用於支援駕駛路線推薦與風險評估。

目前資料範圍以「桃園市龜山區」作為測試區域，使用 OpenStreetMap 道路資料建立 graph，並整合政府公開交通事故資料 A1 / A2，將事故點對應至道路 edge，作為後續風險權重與路線推薦的基礎。

## Tech Stack

- PostgreSQL
- PostGIS
- pgRouting
- DBeaver
- WSL Ubuntu
- Git / GitHub

## Current Progress

已完成：

- 匯入 OSM roads / adminareas
- 建立 road_edges_guishan
- 使用 pgRouting 建立 source / target topology
- 建立 road_edges_guishan_vertices_pgr
- 匯入 A1 / A2 交通事故資料
- 建立事故點 geom
- 篩選龜山區事故資料
- 將事故點對應至最近 road edge
- 建立初版 edge_risk_guishan
- 匯出 schema_only.sql

尚未完成：

- risk_score 正規化策略定案
- difficulty_score 難度模型
- traffic flow 歷史車流量整合
- routing cost function
- Dijkstra / A* 路線推薦整合

## Main Tables

| Table | Purpose |
|---|---|
| roads | 原始 OSM 道路資料 |
| adminareas | 原始 OSM 行政區資料 |
| roads_guishan | 龜山區道路資料 |
| road_edges_guishan | 龜山區 graph edge 表 |
| road_edges_guishan_vertices_pgr | pgRouting 產生的 node 表 |
| accident_records_a1 | A1 原始事故資料 |
| accident_records_a2 | A2 原始事故資料 |
| accident_records_a1_guishan | 龜山區 A1 事故資料 |
| accident_records_a2_guishan | 龜山區 A2 事故資料 |
| accident_records_all_guishan | A1 + A2 合併事故資料 |
| edge_risk_guishan | edge 層級風險資料 |

## SQL Execution Order

建議依照以下順序執行 SQL：

```text
sql/01_create_extensions.sql
sql/02_filter_guishan.sql
sql/03_create_graph_table.sql
sql/04_import_accidents.sql
sql/05_match_accident_to_edge.sql
sql/06_edge_risk_v1.sql

## docker 第一階段
docker-compose up -d --build
./setup/init_db.sh

DBeaver：

Host: localhost
Port: 5433
Database: gisdb
Username: postgres
Password: 123456

請先從 Google Drive 下載：
- accidents_a1.csv
- accidents_a2.csv

下載後放到：
data/raw/accidents_a1.csv
data/raw/accidents_a2.csv

再執行：
./setup/import_accidents.sh