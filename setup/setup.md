# 環境建置說明（Docker / Windows）

本專案使用 Docker 執行 PostgreSQL + PostGIS + pgRouting，
不需要在本機手動安裝資料庫。

---

## 必要工具

| 工具 | 下載 |
|------|------|
| Docker Desktop | https://www.docker.com/products/docker-desktop |
| Python 3.10+ | https://www.python.org |
| Node.js 18+ | https://nodejs.org |
| Git | https://git-scm.com |
| DBeaver（建議）| https://dbeaver.io |

---

## 資料準備

在執行任何腳本前，先準備以下檔案：

```
driving-route-database/
├── data/
│   ├── gis_osm_roads_free_1.shp        ← OSM 道路（+ .dbf .shx .prj）
│   ├── gis_osm_adminareas_a_free_1.shp ← OSM 行政區（+ .dbf .shx .prj）
│   └── raw/
│       ├── accidents_a1.csv            ← 交通事故 A1 資料
│       └── accidents_a2.csv            ← 交通事故 A2 資料
```

**OSM 資料下載**：https://download.geofabrik.de/asia/taiwan.html  
**事故資料**：政府開放資料平台（交通部）

---

## 建置步驟

### 1. 啟動 Docker 容器

```bash
docker-compose up -d
```

### 2. 初始化路網資料庫

```bash
# macOS / Linux
bash setup/init_db.sh

# Windows（WSL）
bash setup/init_db.sh
```

此腳本會執行：
- SQL 01：啟用擴充
- 匯入 OSM roads / adminareas
- SQL 02：篩選龜山區
- SQL 03：建立 pgRouting topology

### 3. 匯入事故資料與建立應用資料表

```bash
bash setup/import_accidents.sh
```

此腳本會執行：
- SQL 04：匯入事故 CSV
- SQL 05：事故對應道路 edge
- SQL 06：計算道路風險分數
- SQL 07：建立正規化核心資料表
- SQL 08：建立使用者與路線資料表
- SQL 09：建立路由輔助資料表

---

## DBeaver 連線設定

| 項目 | 值 |
|------|----|
| Host | localhost |
| Port | **5433** |
| Database | gisdb |
| Username | postgres |
| Password | 123456 |

---

## 常見錯誤

### shp2pgsql: command not found
確認 Docker container 有正常啟動，shp2pgsql 需在 container 內執行。

### could not connect to server
確認 Docker Desktop 已開啟，且 container 名稱為 `driving_route_db`。

### ON_ERROR_STOP
若 import_accidents.sh 中途停止，表示前一個步驟有錯誤，
先確認 init_db.sh 有成功完成再重跑。
