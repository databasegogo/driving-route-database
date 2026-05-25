# Environment Setup

## Required Software

- PostgreSQL
- PostGIS
- pgRouting
- DBeaver
- WSL Ubuntu
- Git

## Database Name

本專案使用 Docker 部署，database 名稱：

```text
gisdb
```

## Coordinate System

目前主要空間資料 SRID：

```text
EPSG:4326
```

## PostgreSQL Extensions

Database 需啟用以下 extensions：

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
```

## Notes

本專案使用 PostGIS 儲存道路與事故點空間資料，並使用 pgRouting 建立 graph topology，以支援 Dijkstra / A* 路徑演算法。
