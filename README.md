# 新手路徑王 — 龜山區新手駕駛練習路線系統

以 PostgreSQL + PostGIS + pgRouting 為核心，結合 FastAPI 後端與 React 前端，
提供新手駕駛在桃園市龜山區的練習路線規劃、風險評估與練習紀錄管理。

---

## 系統架構

```
frontend/    React + Vite + Leaflet（使用者介面）
backend/     FastAPI + psycopg2（API 伺服器）
sql/         PostgreSQL + PostGIS + pgRouting（資料庫）
Docker       PostgreSQL 容器（port 5433）
```

---

## 環境需求

| 工具 | 用途 |
|------|------|
| Docker Desktop | 執行 PostgreSQL 資料庫容器 |
| Python 3.10+ | 執行後端 |
| Node.js 18+ | 執行前端 |
| Git | 版本控制 |
| DBeaver（建議）| 操作資料庫 |

---

## 從頭建立步驟

### Step 1：Clone 專案

```bash
git clone https://github.com/databasegogo/driving-route-database.git
cd driving-route-database
```

---

### Step 2：啟動資料庫（Docker）

```bash
docker-compose up -d
```

確認容器正常執行：
```bash
docker ps
# 應看到 driving_route_db 容器，port 5433
```

連線資訊：
| 項目 | 值 |
|------|----|
| Host | localhost |
| Port | 5433 |
| Database | gisdb |
| Username | postgres |
| Password | 123456 |

---

### Step 3：準備原始資料

下載並放置以下檔案（詳見 `data/README.md`）：

```
data/
├── gis_osm_roads_free_1.shp        ← 從 Geofabrik 下載
├── gis_osm_adminareas_a_free_1.shp ← 從 Geofabrik 下載
└── raw/
    ├── accidents_a1.csv            ← 從政府開放資料下載
    └── accidents_a2.csv
```

---

### Step 4：執行建置腳本

```bash
# 匯入 OSM 道路資料 + 執行 SQL 01~03
bash setup/init_db.sh

# 匯入事故資料 + 執行 SQL 04~09
bash setup/import_accidents.sh
```

> 詳細說明見 `setup/setup.md`

---

### Step 5：安裝後端套件

```bash
cd backend
pip install -r requirements.txt
```

---

### Step 6：啟動後端

```bash
cd backend
uvicorn main:app --reload
```

後端啟動後可至 `http://localhost:8000/docs` 查看 API 文件。

---

### Step 7：安裝前端套件

```bash
cd frontend
npm install
```

---

### Step 8：啟動前端

```bash
cd frontend
npm run dev
```

開啟瀏覽器至 `http://localhost:5173`

---

## 日常啟動（已建立過後）

每次使用只需：

```bash
# 1. 啟動資料庫
docker start driving_route_db

# 2. 啟動後端（在 backend/ 資料夾）
uvicorn main:app --reload

# 3. 啟動前端（在 frontend/ 資料夾）
npm run dev
```

---

## API 端點總覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/auth/register` | 註冊 |
| POST | `/auth/login` | 登入 |
| GET  | `/user/me` | 取得個人資料 |
| PUT  | `/user/preference` | 更新路線偏好 |
| POST | `/route/plan` | 規劃練習路線（回傳 3 條） |
| GET  | `/route/{id}` | 取得路線詳情 |
| POST | `/practice/complete` | 完成練習、計算得分 |
| GET  | `/practice/history` | 查看練習紀錄 |
| PUT  | `/practice/{id}/favorite` | 切換愛心收藏 |

---

## 難度與等級對照

| 等級 | 最低分數 | 可選難度 | Risk Weight |
|------|---------|---------|-------------|
| 新手駕駛（BEGINNER） | 0 | ⭐ | 80 |
| 一般駕駛（NORMAL） | 500 | ⭐⭐ | 40 |
| 熟練駕駛（EXPERIENCED） | 2000 | ⭐⭐⭐ | 10 |

---

## 專案成員

桃園市龜山區新手駕駛路線規劃系統
