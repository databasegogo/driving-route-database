# Environment Setup

## Required Software

- PostgreSQL
- PostGIS
- pgRouting
- DBeaver
- WSL Ubuntu
- Git

## Database Name

目前開發使用的 database：

```text
osm

Coordinate System
目前主要空間資料SRID:
EPSG:4326

PostgreSQL Extensions
Database 需啟用以下 extensions：
SQL:
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
Notes:

本專案使用 PostGIS 儲存道路與事故點空間資料，並使用 pgRouting 建立 graph topology，以支援 Dijkstra / 
A* 路徑演算法。
