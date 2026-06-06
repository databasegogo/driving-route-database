# Changelog

## [v1.2.0] - 2026-06-06

### 安全性修復（Security）

| 項目 | 說明 |
|------|------|
| 密碼雜湊 | SHA-256 → **bcrypt**（含 salt，防彩虹表攻擊）|
| JWT 金鑰 | 硬寫字串 → 從 **環境變數 `JWT_SECRET_KEY`** 讀取 |
| 500 錯誤 | 不再回傳 `str(e)`，統一回傳 `INTERNAL_SERVER_ERROR` |
| Email 驗證 | 新增 Pydantic `EmailStr` 格式驗證（需安裝 `email-validator`）|
| 輸入長度限制 | `username` 1–26、`password` 6–26、`email` ≤ 100 字元；前端超過 20 字顯示計數器，到達上限時轉紅警告 |
| 日期格式驗證 | `birth_date` / `license_date` 強制 `YYYY-MM-DD` 格式 |
| 刷分防護 | GPS 驗證到達終點 → 全額計分、不限次數；提前終止 → 折扣計分、不限次數；兩者皆否 → 同路線當天只計分一次 |
| 計時作弊防護 | `actual_duration_sec < 10` 秒視為無效，不計算 time_bonus |

---

### 新功能（Features）

#### 後端

- **新增 `GET /district/boundary`**：回傳龜山區行政區 GeoJSON（`MultiPolygon`）
- **路線去重複**：`pgr_ksp` 改為 k=6，僅保留 edge set 不完全相同的路線（最多 3 條）

#### 前端

- **地圖點選起終點**：新增地圖 Modal，可直接在地圖上點選起點/終點位置
  - 顯示龜山區真實行政區邊界（從後端 DB 取得）
  - 點選範圍外時顯示紅點提示，確認按鈕禁用
  - 反向地理編碼：優先回傳地標名稱而非門牌號碼
- **推薦終點 chips**：快速選擇常用終點（長庚、龜山區公所等），可重新整理
- **路線輪播卡片**：RouteSelect 改為可左右滑動的輪播，支援手機觸控
- **SVG 路線預覽修正**：每條路段獨立繪製，不再連接段落間空隙，避免路線圖扭曲
- **地點搜尋限制龜山區**：Nominatim 加入 `viewbox` + `bounded=1` 限制搜尋範圍

---

### 套件異動（Dependencies）

#### ⚠️ 升級後必須執行安裝指令

**後端（與 v1.1.0 相比新增 2 個套件）：**

```bash
cd backend
pip install -r requirements.txt
```

| 套件 | 狀態 | 版本 | 用途 |
|------|------|------|------|
| `fastapi` | 既有 | 0.111.0 | API 框架 |
| `uvicorn` | 既有 | 0.29.0 | ASGI 伺服器 |
| `psycopg2-binary` | 既有 | 2.9.9 | PostgreSQL 連線 |
| `pyjwt` | 既有 | 2.8.0 | JWT |
| `pydantic` | 既有 | 2.7.1 | 資料驗證 |
| `python-multipart` | 既有 | 0.0.9 | 表單解析 |
| `email-validator` | 🆕 新增 | 2.1.1 | Email 格式驗證 |
| `bcrypt` | 🆕 新增 | 4.1.3 | 密碼雜湊（取代 SHA-256）|

**前端（與 v1.1.0 相比新增 1 個套件）：**

```bash
cd frontend
npm install
```

| 套件 | 狀態 | 用途 |
|------|------|------|
| `react` / `react-dom` | 既有 | UI 框架 |
| `react-router-dom` | 既有 | 路由 |
| `leaflet` / `react-leaflet` | 既有 | 地圖 |
| `axios` | 既有 | HTTP 請求 |
| `lucide-react` | 🆕 新增 | 圖示庫（地圖、星星、箭頭等）|

#### ⚠️ 資料庫注意事項

密碼雜湊從 SHA-256 改為 bcrypt，**舊帳號密碼無法驗證**。
升級後需清除使用者資料並重新註冊：

```sql
TRUNCATE TABLE
  user_practice_history,
  route_segment,
  route,
  route_request,
  user_route_preference,
  app_user
RESTART IDENTITY CASCADE;
```

> 道路、事故、風險分數等資料不受影響，**不需要重建資料庫**。

---

### 新功能（Features）— GPS 練習完成系統

#### 後端

- **`POST /practice/complete` 擴充**：新增 `gps_verified`、`terminated_early` 兩個欄位
  - `gps_verified=true`：全額計分，不受每日限制
  - `terminated_early=true`：折扣計分（`× 進度比例 × 0.8`），不受每日限制
  - 兩者皆 `false`：視為繞過 UI 直呼 API，觸發同路線當天限制一次計分

#### 前端（RouteDetail）

- **GPS 到達偵測**：練習中持續追蹤位置，與終點距離 < 50 m 時自動觸發「已到達終點」Modal
- **「已到達終點」Modal（自動彈出）**：顯示預計全額分數、「確認完成」與「繼續練習」按鈕
- **「終止練習」按鈕**：取代舊的「已完成」按鈕，點擊後開啟確認 Modal
- **「終止練習確認」Modal**：顯示已練習時間、完成比例、折扣後預計分數，可確認終止或繼續
- **「完成」Modal 智能顯示**：依 `terminated_early` / `gps_verified` / `_limited` 顯示不同標題與徽章

---

### 資料庫異動（Database）

#### SQL 08 更新：`user_practice_history` 新增 2 欄

```sql
-- v1.2.0 新增欄位 ↓
gps_verified     BOOLEAN NOT NULL DEFAULT false,  -- GPS 偵測到達終點
terminated_early BOOLEAN NOT NULL DEFAULT false   -- 使用者主動提前終止
```

> ⚠️ 若 DB 已有舊資料，請執行：
> ```sql
> ALTER TABLE user_practice_history
>   ADD COLUMN IF NOT EXISTS gps_verified     BOOLEAN NOT NULL DEFAULT false,
>   ADD COLUMN IF NOT EXISTS terminated_early BOOLEAN NOT NULL DEFAULT false;
> ```

| 項目 | 說明 |
|------|------|
| `district` 表 | 由 v1.0.0 SQL 07 建立，v1.2.0 新增 `GET /district/boundary` 端點查詢，**無需異動結構** |
| 使用者資料清除 | bcrypt 升級後舊密碼無法驗證，需執行下方 TRUNCATE（詳見「套件異動」區塊）|

---

### 修復（Bug Fixes）

- 修正地圖選點後顯示門牌號碼而非地名（改用 `address.road` / `data.name`）
- 修正地圖視窗點選範圍外會意外關閉（移除 overlay click-to-close）
- 修正 `avoid_bridge` / `avoid_tunnel` 邏輯反轉問題
- 修正距離上限預設為強制 10km（改為預設「不限」）
- 修正路線預覽 SVG 路徑扭曲（改為每 segment 獨立 path）
- 後端路由統一改用 `C:/Users/Sam/driving-route-database/backend/`（移除桌面備份版本）
- **修正橋樑/隧道迴避判斷錯誤**：OSM 的 `bridge`/`tunnel` 欄位值為 `'T'`/`'F'`，原條件 `IS NOT NULL AND <> ''` 會同時匹配 `'F'`，導致勾選迴避時所有路段 cost 變成 999999 無法規劃路線，以及每條路線都被誤標為含橋樑/隧道警告；修正為 `= 'T'`

---

## [v1.1.0] - 2026-06-05

### 新功能

- 新增 `MainLayout`：所有登入後頁面共用頂部 Logo + 使用者名稱 + 登出按鈕
- 地點輸入支援 Autocomplete（Nominatim，400ms debounce）
- 練習紀錄支援愛心收藏（`is_favorite` toggle）
- `pgr_dijkstra` → `pgr_ksp`，回傳最多 3 條路線供使用者選擇

---

### 資料庫異動（Database）

#### SQL 08 更新：`08_create_user_route_tables.sql`

`user_practice_history` 表新增 3 個欄位：

```sql
-- v1.0.0 原有欄位（部分）
practice_id         SERIAL PRIMARY KEY,
user_id             INTEGER NOT NULL REFERENCES app_user(user_id),
route_id            INTEGER REFERENCES route(route_id),
practice_time       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
status              TEXT NOT NULL DEFAULT 'in_progress',
selected_difficulty TEXT NOT NULL,
score_earned        INTEGER NOT NULL DEFAULT 0

-- v1.1.0 新增欄位 ↓
end_time            TIMESTAMP DEFAULT NULL,       -- 練習結束時間
time_bonus          INTEGER NOT NULL DEFAULT 0,   -- 準時完成加分
is_favorite         BOOLEAN NOT NULL DEFAULT false -- 使用者愛心收藏
```

> ⚠️ 若 DB 已有舊資料，請重新執行 `sql/08_create_user_route_tables.sql`（會 DROP 重建）或手動 ALTER TABLE。

---

#### SQL 09 新增：`09_routing_helpers.sql`（全新檔案）

新建 `main_component_nodes` 輔助表，只保留最大連通分量的節點，確保起終點一定可以連通：

```sql
CREATE TABLE main_component_nodes AS
SELECT node
FROM pgr_connectedComponents(
  'SELECT edge_id AS id, source, target, cost, reverse_cost FROM road_edge'
)
WHERE component = (
  SELECT component FROM pgr_connectedComponents(...)
  GROUP BY component ORDER BY COUNT(*) DESC LIMIT 1
);

CREATE INDEX main_component_nodes_idx ON main_component_nodes(node);
```

建立完成後應有 **1,082 筆**節點。首次建置只需執行一次：

```bash
# 在 DBeaver 或 psql 執行
\i sql/09_routing_helpers.sql
```

---

## [v1.0.0] - 2026-06-04

### 初始版本

- PostgreSQL + PostGIS + pgRouting 資料庫建立
- 龜山區 OSM 道路匯入與 topology 建立
- 事故資料匯入與風險分數計算（edge_risk_score）
- FastAPI 後端：auth、user、route、practice
- React + Vite + Leaflet 前端
- 難度系統：BEGINNER / NORMAL / EXPERIENCED
- 得分與升等機制
