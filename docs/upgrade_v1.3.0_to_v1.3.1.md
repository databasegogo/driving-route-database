# 升級指南：v1.3.0 → v1.3.1

本文件說明如何從 v1.3.0 升級至 v1.3.1。  
請**依序執行**，每個步驟完成後再繼續下一步。

---

## 概覽

| 步驟 | 類別 | 說明 |
|------|------|------|
| 1 | Git | 拉取最新程式碼 |
| 2 | 資料庫 | 執行路網橋接腳本（必須）|
| 3 | 驗證 | 重啟後端並確認路由正常 |

> 本版無新增後端套件、無前端套件異動，**不需要** `pip install` 或 `npm install`。

---

## 前置條件

- Docker 容器 `driving_route_db` 正在執行
- 已完成 v1.3.0 的所有步驟（特別是 `09_routing_helpers.sql` 已執行過）

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

## Step 2：執行路網橋接腳本（必須執行）

這是本版最關鍵的步驟。腳本會：
1. 清除前一次橋接資料（idempotent，可重複執行）
2. 修補 `road_edge` 中 geom 為 NULL 的邊
3. 分析連通分量，找出距主路網 ≤ 80 公尺的孤立節點
4. 插入虛擬橋接邊（`edge_id ≥ 9000000`）
5. 重建 `main_component_nodes`

用 DBeaver 或 psql 執行（連線到 `gisdb`，port 5433）：

```bash
# 使用 psql 執行
psql -h localhost -p 5433 -U postgres -d gisdb -f sql/10_bridge_gaps.sql
```

或在 DBeaver 開啟 `sql/10_bridge_gaps.sql` 全選後執行。

### 預期輸出（關鍵數值）

```
=== NULL geom 邊修補完成 ===
still_null_after_fix
-----
0

=== 找到橋接對數量 ===
bridge_edges_to_insert
-----
895   ← 約此數量（依 OSM 資料版本略有差異）

=== 橋接邊已插入 ===
inserted
-----
895

=== 橋接後可路由節點數 ===
routable_nodes
-----
4196  ← 必須 > 3000，否則腳本有誤
```

### 確認查詢

```sql
-- 橋接邊數量
SELECT COUNT(*) FROM road_edge WHERE edge_id >= 9000000;
-- 應顯示約 895

-- 可路由節點數
SELECT COUNT(*) FROM main_component_nodes;
-- 應顯示約 4196（遠多於舊版的 1082）
```

---

## Step 3：重啟後端並驗證

### 重啟後端（uvicorn 若有 --reload 則自動重載）

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 驗證清單

- [ ] 路線規劃：選取體育大學（桃園市龜山區）附近作為起終點，不再出現 `NO_PATH_FOUND`
- [ ] 路線規劃：地圖選點 Modal，點選步道/校園內部，snap 能正確找到附近車道（標記為綠色，非橙色）
- [ ] 路線圖：規劃出的路線不再出現視覺斷點（路段間無缺口）
- [ ] 路線規劃：GPS 定位按鈕點擊後，開啟 MapPickerModal 並在地圖上顯示目前位置標記

---

## 本版新功能摘要（v1.3.1）

### 路網橋接
龜山區新增約 895 條虛擬橋接邊，孤立路網島（體育大學、山區聚落等）現在可以正常規劃路線。
可路由節點從 1,082 增至 ~4,196。

### 路線渲染修正
部分 OSM 邊 geom 為 NULL 導致前端路線圖出現斷點，現在以頂點連線補全。

### 地圖選點改善
- snap 候選邊從 50 增至 200，解決步道密集區域誤判「無道路」的問題
- GPS 按鈕改為先開啟地圖 Modal 確認位置，避免直接填入不精確座標
- snap 失敗時：橙色標記 + 提示文字 + 確認按鈕禁用，明確告知使用者

---

## 常見問題

### Q：執行 `10_bridge_gaps.sql` 後 `main_component_nodes` 節點數仍然只有 1,082

確認 `09_routing_helpers.sql` 有先執行過（建立初始的 `main_component_nodes` 表），  
然後再重新執行 `10_bridge_gaps.sql`。

### Q：psql 執行時出現 `ERROR: relation "_comp" does not exist`

psql 使用 autocommit 模式，請確保使用完整的 `10_bridge_gaps.sql` 腳本（不要只貼部分 SQL），  
該腳本已處理暫存表的生命週期問題。

### Q：路線規劃還是出現 `NO_PATH_FOUND`

確認 `main_component_nodes` 節點數 > 3,000：
```sql
SELECT COUNT(*) FROM main_component_nodes;
```

若節點數偏少，重新執行 `10_bridge_gaps.sql`（腳本 idempotent，安全重複執行）。

若起終點在真正無道路的地區（山區無路、建築內部），此錯誤屬正常行為。
