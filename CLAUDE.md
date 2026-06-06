# CLAUDE.md — 新手路徑王專案 AI 協作指引

本文件給 Claude Code 閱讀，提供協作前的完整專案脈絡。  
請在開始任何任務前先讀完本文件。

---

## 專案簡介

**新手路徑王** — 龜山區新手駕駛練習路線系統  
提供台灣桃園市龜山區的駕駛練習路線規劃、風險評估與練習紀錄管理。

**目前版本：v1.3.0（main 分支）**

---

## 關鍵規則（必讀）

1. **絕對不可 push 到 GitHub**，任何 git push 操作都必須先詢問 Sam（Smaxoi）確認。
2. **不可 force push**，不可 `--no-verify` 跳過 hooks。
3. **DB 操作先確認**，DROP TABLE、刪除資料等破壞性操作必須先問使用者。
4. 在詢問使用者確認前，不要執行會影響共用系統（GitHub、DB 正式資料）的操作。

---

## 技術架構

```
frontend/    React 18 + Vite + Leaflet（使用者介面）
backend/     FastAPI + psycopg2（API 伺服器，port 8000）
sql/         PostgreSQL 14 + PostGIS + pgRouting（01~09 按順序執行）
Docker       容器名稱 driving_route_db，port 5433，DB 名稱 gisdb
```

### 資料庫連線

| 項目 | 值 |
|------|----|
| Host | localhost |
| Port | **5433**（不是 5432）|
| Database | gisdb |
| Username | postgres |
| Password | 123456 |

---

## 啟動方式

```bash
# 1. 啟動 DB（每次需要先確認容器在跑）
docker start driving_route_db

# 2. 啟動後端（在 backend/ 資料夾）
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. 啟動前端（在 frontend/ 資料夾）
npm run dev
# → http://localhost:5173
```

---

## 分支與成員狀況

| 分支 | 主要貢獻者 | 狀態 |
|------|-----------|------|
| `main` | Smaxoi（Sam）| **v1.3.0，最新版本** |
| `feature/ui-redesign` | Nina Hsieh | ✅ 已合併進 main（v1.3.0 的前端重設計來源）|
| `feature/admin` | Sophie | ⚠️ 落後 main，包含 admin 功能（role-based login）|
| `feature/frontend` | b1329031 | ⚠️ 落後 main，包含早期前端調整 |
| `feature/backend` | cloudx123789 | ⚠️ 落後 main，包含危險路段顯示與最短路徑比較功能 |

### 如果你是在落後分支上協助

在開始任何開發前，先執行：

```bash
git fetch origin
git log --oneline main..HEAD        # 看你這支有哪些 commit 沒在 main
git log --oneline HEAD..origin/main # 看 main 有哪些你沒有的 commit
```

再根據差異決定是否需要 rebase 或 merge main。  
**不要直接 push，務必先問 Sam。**

---

## v1.3.0 主要變動（相對於 v1.2.0）

### 前端全面重設計（Nina 分支合併）

| 頁面 | 說明 |
|------|------|
| `Landing.jsx` | 新增未登入歡迎首頁，`/` 路由 |
| `Dashboard.jsx` | SVG 等級路徑動畫、近期練習橫向捲動 |
| `Records.jsx` | 深色左側欄 + 右側時間軸，支援終止/GPS 驗證標籤 |
| `Profile.jsx` | Hero 漸層頭部，行內編輯，頭貼上傳 |
| `MainLayout.jsx` | 漢堡選單下拉，登出回 Landing |
| `RoutePlanner.jsx` | Nina UI + 原本 map 功能（MapPickerModal、GPS、推薦終點）|

### 等級閾值修正（重要）

```
BEGINNER  : min_score = 0    （不變）
NORMAL    : min_score = 150  （舊：500）
EXPERIENCED: min_score = 300 （舊：2000）
```

前端 `getMaxDifficulty(score)` 與 DB `user_level.min_score` 一致。

### DB 欄位新增

```sql
ALTER TABLE user_practice_history
  ADD COLUMN IF NOT EXISTS gps_verified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminated_early BOOLEAN NOT NULL DEFAULT false;
```

---

## 關鍵檔案速覽

### 前端（`frontend/src/`）

| 檔案 | 說明 |
|------|------|
| `App.jsx` | 路由設定，`/` → Landing，所有頁面在 MainLayout 下 |
| `api.js` | axios 實例，自動附 JWT；401 攔截（`WRONG_OLD_PASSWORD` 例外）|
| `pages/RoutePlanner.jsx` | 地圖選點（MapPickerModal）、GPS 定位、推薦終點、難度鎖定 |
| `pages/RouteDetail.jsx` | GPS 追蹤練習、haversine 到達判斷、終止練習 Modal |
| `pages/Records.jsx` | 練習紀錄列表，含 terminated/gpsVerified 顯示邏輯 |
| `styles/route.css` | RoutePlanner + RouteDetail 樣式，含 map-picker、gps-btn、rec-chip |
| `styles/records.css` | Records 樣式，含 `.st-terminated`、`.rec-gps-badge` |

### 後端（`backend/`）

| 檔案 | 說明 |
|------|------|
| `main.py` | FastAPI app 入口，掛載所有 router |
| `database.py` | psycopg2 連線設定 |
| `routers/auth.py` | 註冊（422 重複帳號）、登入（JWT）|
| `routers/user.py` | `/user/me`、`/user/profile`、`/user/preference` |
| `routers/route.py` | `/route/plan`（pgRouting）、`/route/{id}` |
| `routers/practice.py` | `/practice/complete`（含 terminated_early 折扣）、`/practice/history` |
| `routers/district.py` | `/district/boundary`（龜山區 GeoJSON）|

### SQL（`sql/`）

| 檔案 | 說明 |
|------|------|
| `08_create_user_route_tables.sql` | app_user、user_level（閾值 0/150/300）、user_practice_history（含 gps_verified、terminated_early）|
| `09_routing_helpers.sql` | pgRouting 輔助函數 |

---

## 業務邏輯重點

### 難度解鎖（`RoutePlanner.jsx`）

```js
function getMaxDifficulty(score) {
  if (score >= 300) return 3;
  if (score >= 150) return 2;
  return 1;
}
```

呼叫 `/user/me` 取得 `total_score` 後設定 `maxDiff`，星星 > maxDiff 的選項 disabled。

### 橋樑/隧道迴避（`routers/route.py`）

`road_edges_guishan` 的 `bridge` / `tunnel` 欄位值為 `'T'` / `'F'`（字串，不是 boolean）。  
迴避條件：`WHERE bridge != 'T'`（不是 `!= true`）。

### GPS 到達判斷（`RouteDetail.jsx`）

haversine 距離 < 30 公尺視為到達終點，觸發完成 Modal，`gps_verified = true`。  
`terminated_early = true` 時計分 × 0.8（後端 `practice.py` 處理）。

### MapPickerModal（`RoutePlanner.jsx`）

- 從 `/district/boundary` 取得龜山區多邊形
- `pointInPolygon` + `pointInRing` 驗證點擊位置在龜山區內
- Nominatim 反地理編碼加 `viewbox: '121.27,25.07,121.43,24.97'` + `bounded: '1'` 限制搜尋範圍

---

## 升級文件

| 文件 | 說明 |
|------|------|
| `docs/upgrade_v1.2_to_v1.3.md` | v1.2.0 → v1.3.0 升級指南（git pull + SQL + npm install）|
| `docs/upgrade_v1.1_to_v1.2.md` | v1.1.0 → v1.2.0 升級指南 |
| `docs/database_schema.md` | 完整 DB schema 文件 |
| `CHANGELOG.md` | 各版本異動紀錄 |
| `README.md` | 從頭建立步驟、API 端點、頁面路由總覽 |

---

## 常見任務做法

### 查看和 main 的差異

```bash
git fetch origin
git diff origin/main --stat           # 哪些檔案有差
git diff origin/main -- path/to/file  # 特定檔案差異
```

### 把 main 的變更合進自己的分支

```bash
git fetch origin
git merge origin/main
# 解完衝突後 git add . && git commit
# 解衝突原則：前端 UI → 以 main（Nina 設計）為主；功能邏輯 → 以自己的功能為主
```

### 跑後端測試

```bash
# 直接訪問 API 文件
# http://localhost:8000/docs
```

### DB 變更後確認

```sql
-- 確認欄位存在
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_practice_history'
  AND column_name IN ('gps_verified', 'terminated_early');
-- 應顯示 2 行

-- 確認等級閾值
SELECT level_code, min_score FROM user_level ORDER BY min_score;
-- BEGINNER 0 / NORMAL 150 / EXPERIENCED 300
```
