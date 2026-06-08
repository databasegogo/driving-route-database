# 升級指南：v1.2.0 → v1.3.0

本文件說明如何從 v1.2.0 升級至 v1.3.0。  
請**依序執行**，每個步驟完成後再繼續下一步。

---

## 概覽

| 步驟 | 類別 | 說明 |
|------|------|------|
| 1 | Git | 拉取最新程式碼 |
| 2 | 資料庫 | 新增欄位、更新等級閾值 |
| 3 | 前端套件 | 確認依賴正常 |
| 4 | 驗證 | 重新啟動並確認功能正常 |

---

## 前置條件

- Docker 容器 `driving_route_db` 正在執行
- 已完成 v1.2.0 的所有步驟

---

## Step 1：拉取最新程式碼

```bash
git pull origin main
```

確認目前 commit：

```bash
git log --oneline -3
```

---

## Step 2：更新資料庫（必須執行）

用 DBeaver 或 psql 連線至 `gisdb`，執行以下 SQL：

```sql
-- 1. 新增練習紀錄欄位（idempotent，已有欄位不影響）
ALTER TABLE user_practice_history
  ADD COLUMN IF NOT EXISTS gps_verified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminated_early BOOLEAN NOT NULL DEFAULT false;

-- 2. 更新等級升等閾值（由 0/500/2000 → 0/150/300）
UPDATE user_level SET min_score = 150 WHERE level_code = 'NORMAL';
UPDATE user_level SET min_score = 300 WHERE level_code = 'EXPERIENCED';

-- 確認結果
SELECT level_code, min_score FROM user_level ORDER BY min_score;
```

預期結果：

| level_code | min_score |
|------------|-----------|
| BEGINNER | 0 |
| NORMAL | 150 |
| EXPERIENCED | 300 |

---

## Step 3：安裝前端套件

v1.3.0 未新增後端套件，前端套件依賴不變：

```bash
cd frontend
npm install
```

---

## Step 4：重新啟動並驗證

### 啟動後端

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 啟動前端

```bash
cd frontend
npm run dev
```

### 驗證清單

- [ ] 首頁（`/`）顯示 Landing Page，未登入時正確導向
- [ ] 登入後進入 Dashboard，顯示等級路徑動畫與近期紀錄
- [ ] 路線規劃頁：地圖圖示可開啟 MapPickerModal，顯示龜山區邊界
- [ ] 路線規劃頁：GPS 按鈕可取得目前位置作為起點
- [ ] 路線規劃頁：推薦終點清單顯示，換一批正常運作
- [ ] 難度星星依 `total_score` 正確鎖定（新帳號只能選 ⭐）
- [ ] 練習中出現「終止練習」按鈕，確認 Modal 顯示折扣預覽
- [ ] 終止練習後，練習紀錄顯示橙色「終止」標籤
- [ ] GPS 抵達終點後自動彈出完成 Modal，顯示「GPS 驗證到達終點」徽章

---

## 新功能摘要（v1.3.0）

### 前端全面重設計
- **Landing Page**：未登入時的歡迎首頁
- **Dashboard**：SVG 等級升級路徑動畫、近期練習橫向捲動
- **Records**：深色左側欄 + 右側時間軸佈局，日期/狀態篩選
- **Profile**：Hero 漸層頭部，行內編輯帳號/地址，頭貼上傳
- **MainLayout**：漢堡選單下拉，登出回 Landing

### 等級閾值對齊
前端 `getMaxDifficulty(total_score)` 與 DB `user_level.min_score` 統一：

| 等級 | 舊閾值 | 新閾值 |
|------|--------|--------|
| NORMAL | 500 | **150** |
| EXPERIENCED | 2000 | **300** |

### 練習系統
- `gps_verified`：GPS 偵測到達終點，全額計分不受當日限制
- `terminated_early`：提前終止，折扣計分（× 0.8），歷史紀錄顯示橙色標籤

---

## 常見問題

### Q：練習紀錄頁出現 500 錯誤

確認 Step 2 的 `ALTER TABLE` 已執行，`gps_verified` 和 `terminated_early` 欄位存在：

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'user_practice_history'
  AND column_name IN ('gps_verified', 'terminated_early');
```

應顯示 2 行。

### Q：難度星星無法解鎖（一直是新手）

確認 Step 2 的 `UPDATE user_level` 已執行，且 `NORMAL` 的 `min_score = 150`。
