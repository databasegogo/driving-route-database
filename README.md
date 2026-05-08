# Driving Route Database

本專題建立一套以 PostgreSQL、PostGIS、pgRouting 為核心的道路資料庫，用於處理 OSM 道路資料、行政區資料、交通事故資料，並產生龜山區道路圖資與道路風險分數。

目前資料庫主要支援：

- 匯入 OSM roads / adminareas
- 篩選龜山區道路
- 建立 pgRouting graph topology
- 匯入 A1 / A2 交通事故資料
- 將事故點對應到最近道路 edge
- 建立道路風險分數表

---

## 1. System Requirements

請先安裝：

- Docker
- Docker Compose
- Git
- DBeaver Community Edition（建議，用於查看資料庫）

本專案不要求使用者在本機手動安裝 PostgreSQL、PostGIS 或 pgRouting。  
資料庫環境會由 Docker 建立。

---

## 2. Project Structure

```text
driving-route-database/
├── Dockerfile
├── docker-compose.yml
├── README.md
├── .gitignore
├── data/
│   ├── README.md
│   ├── .gitkeep
│   └── raw/
│       └── .gitkeep
├── docs/
├── exports/
│   └── schema_only.sql
├── setup/
│   ├── init_db.sh
│   └── import_accidents.sh
└── sql/
    ├── 01_create_extensions.sql
    ├── 02_filter_guishan.sql
    ├── 03_create_graph_tables.sql
    ├── 04_import_accidents.sql
    ├── 05_match_accident_to_edge.sql
    └── 06_edge_risk_v1.sql