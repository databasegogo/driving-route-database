# Nina UI 修改紀錄 — Session 2

**分支**：`feature/ui-redesign` → 合併進 `main`（v1.3.1）  
**修改者**：Nina Hsieh  
**紀錄日期**：2026-06-07  
**涉及檔案**：14 個檔案，共 +807 / -274 行變更

---

## 一、Dashboard（`pages/Dashboard.jsx` + `styles/dashboard.css`）

### 1-1. 地圖縮圖加入起終點標記

**問題**：首頁練習紀錄卡片的地圖縮圖沒有標示起點和終點。  
**修改**：`MiniMap` 元件新增 `startCoord`、`endCoord` props，並在地圖上渲染 CircleMarker：

- **起點**：綠色 `#22c55e`，radius=7，白色外框
- **終點**：紅色 `#ef4444`，radius=7，白色外框
- 若無明確座標則 fallback 到路線首末點 (`coords[0]` / `coords[last]`)

適用範圍：首頁練習紀錄卡片縮圖 + 點擊後的 Modal 地圖，全部都有標示。

```jsx
// MiniMap 元件新增參數
function MiniMap({ coords, coordsMulti, startCoord, endCoord }) {
  const sCoord = startCoord ?? coords[0]
  const eCoord = endCoord   ?? coords[coords.length - 1]
  // ...
  <CircleMarker center={sCoord} radius={7}
    pathOptions={{ fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }} />
  <CircleMarker center={eCoord} radius={7}
    pathOptions={{ fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }} />
}
```

---

### 1-2. Modal 按鈕拆分：「查看更多」+「再練習一次」

**問題**：Modal 只有一個「再練習一次」按鈕，無法跳至對應的練習紀錄。  
**修改**：原本的單一按鈕拆成並排兩顆，並新增關閉按鈕獨立一行：

| 按鈕 | 行為 |
|------|------|
| 查看更多 | 關閉 Modal，跳至 Records 頁並自動展開對應紀錄 |
| 再練習一次 | 關閉 Modal，直接重新開始該路線（原功能） |
| 關閉 | 關閉 Modal |

```jsx
// 「查看更多」跳轉邏輯
<button className="dash-modal-more-btn" onClick={() => {
  const id = detailRec.id
  setDetailRec(null)
  navigate('/records', { state: { openId: id } })
}}>查看更多</button>
```

**CSS 新增**：
```css
.dash-modal-btn-row { display: flex; gap: 10px; }
.dash-modal-more-btn { flex: 1; background: #f0f4f3; border: 1.5px solid rgba(38,70,83,0.15); ... }
.dash-modal-repeat-btn { flex: 1; width: auto; ... }
```

---

### 1-3. 起終點顏色統一（輸入欄 dot）

**修改**：Dashboard 輸入欄的起終點圓點顏色對調，與地圖標記一致：

```css
/* 修改前 */
.dot-start { background: var(--nordic-orange); }  /* 橘色 */
.dot-end   { background: #2a9d8f; }               /* 綠色 */

/* 修改後 */
.dot-start { background: #22c55e; }  /* 綠色 */
.dot-end   { background: #ef4444; }  /* 紅色 */
```

---

### 1-4. 字體大小調整（Dashboard）

| 元素 | 修改前 | 修改後 |
|------|--------|--------|
| 所有 11px 文字 | 11px | 13px |
| 所有 12px 文字 | 12px | 13px |
| 等級晉升路徑（主標題） | 14px | 15px |
| 新手駕駛（等級名稱） | 24px | 26px |
| Hi Nina ›（問候語） | 13px | 15px |
| 個人檔案按鈕 | 13px | 15px |
| 路線名稱 | 14px | 15px |
| 進度列 pts 文字 | 12px | 13px |

---

### 1-5. 圖示大小全部 +2px

| 圖示 | 修改前 | 修改後 |
|------|--------|--------|
| BookOpen（記錄） | 16 | 18 |
| Navigation（導航） | 16 | 18 |
| Zap（閃電） | 14 | 16 |
| User（使用者） | 14 | 16 |
| MapPin / ArrowRight（CTA） | 15 | 17 |
| Navigation / Zap（推薦卡片） | 12 | 14 |
| ArrowRight（查看全部） | 13 | 15 |

---

### 1-6. 「查看全部」按鈕 hover 樣式

**修改**：「查看全部」（`.dash-rec-see-all`）平常透明，滑鼠移過去才顯示橘色外框：

```css
.dash-rec-see-all {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--nordic-gray);
}
.dash-rec-see-all:hover {
  background: rgba(255, 107, 53, 0.08);
  border-color: rgba(255, 107, 53, 0.3);
  color: var(--nordic-orange);
}
```

---

## 二、Records（`pages/Records.jsx` + `styles/records.css`）

### 2-1. 從 Dashboard 跳轉後自動展開對應紀錄

**新增邏輯**：使用 `useLocation` 讀取 `state.openId`，Records 載入完成後自動找到對應紀錄並展開：

```jsx
const location = useLocation()
const [autoOpenId, setAutoOpenId] = useState(location.state?.openId ?? null)

useEffect(() => {
  if (!autoOpenId || records.length === 0) return
  const rec = records.find(r => r.id === autoOpenId)
  if (rec) { setSelected(rec); setMapOpen(false); setAutoOpenId(null) }
}, [records, autoOpenId])
```

---

### 2-2. 字體大小調整（Records）

| 元素 | 修改前 | 修改後 |
|------|--------|--------|
| 練習完成度 / 80%（進度列 header） | 12px | 13px |
| 日期查詢（filter label） | 11px | 13px |
| 共 X 筆練習紀錄（結果提示） | 12px | 13px |
| 最新（tag） | 11px | 12px |
| 再練習一次（按鈕） | 13px | 14px |

---

### 2-3. 側欄間距與返回按鈕 hover 樣式

- `.rec-sidebar-wrap` gap：10px → **20px**
- `.rec-nav-back-outer`：平常透明，hover 顯示橘色透明外框（與 Dashboard 一致）

---

## 三、RoutePlanner（`pages/RoutePlanner.jsx` + `styles/route.css`）

### 3-1. 起終點顏色統一（輸入欄 rail-dot）

```css
/* 修改前 */
.rail-dot.dot-start { background: var(--nordic-orange); }
.rail-dot.dot-end   { background: #2a9d8f; }

/* 修改後 */
.rail-dot.dot-start { background: #22c55e; }
.rail-dot.dot-end   { background: #ef4444; }
```

---

### 3-2. 字體大小調整（RoutePlanner）

| 元素 | 修改前 | 修改後 |
|------|--------|--------|
| START POINT / DESTINATION（欄位 label） | 0.65rem | 13px |
| 推薦終點說明文字 | 0.75rem | 15px |
| 路線 badge（A/B/C）| 11px | 13px |
| slide-label-badge | 11px | 13px |
| 路線名稱 | 14px | 15px |
| 難度 label | 12px | 13px |
| 含橋樑警告文字 | 11px | 12px |
| 到達 tag / GPS 驗證 | 11px | 12px |
| 提前終止折扣說明 | 11px | 12px |
| 推薦終點 label + icon | 11px / size=12 | 14px / size=14 |
| 推薦終點 ↺ 重整按鈕 | 14px | 18px |

---

### 3-3. slide-label-badge z-index 修正

**問題**：路線卡 badge（A/B/C）被 Leaflet 地圖 tile 層（z-index 200+）蓋住，導致 badge 看不到。  
**修改**：`z-index: 1` → `z-index: 1000`

---

### 3-4. cockpit-lbl 防止換行

**問題**：手機版「單次里程」等 cockpit 標籤文字換行。  
**修改**：加入 `white-space: nowrap`

```css
.cockpit-lbl {
  white-space: nowrap;
}
```

---

## 四、RouteSelect（`pages/RouteSelect.jsx` + `styles/route.css`）

### 4-1. RouteCardMap 修復重疊路線 bug

**問題**：路線縮圖地圖把所有路段座標串成一條 `Polyline`，造成不同路段之間出現錯誤連線（路線相互穿越）。  
**原因**：`flatCoords()` 把所有 LineString/MultiLineString 的座標點全部接成一串，第 N 段結尾會連到第 N+1 段開頭。  
**修改**：改為每個 feature 獨立產生一條 `Polyline`：

```jsx
// 修改後：per-segment Polylines
const segLines = useMemo(() => {
  return segments.features.flatMap(feat => {
    const geom = feat?.geometry
    if (geom.type === 'LineString')
      return [geom.coordinates.map(([lng, lat]) => [lat, lng])]
    if (geom.type === 'MultiLineString')
      return geom.coordinates.map(line => line.map(([lng, lat]) => [lat, lng]))
    return []
  }).filter(line => line.length > 1)
}, [segments])

// 渲染
{segLines.map((line, i) => (
  <Polyline key={i} positions={line} color="#ff6b35" weight={3.5} opacity={0.9} />
))}
```

---

### 4-2. ShortestRouteMap 統計方塊重構

**修改**：最短路徑比較的三個統計方塊（最短路徑 / 危險路段 / 風險總分）：

- **桌機**：label 靠左，數字靠右（左右並排）
- **手機（≤640px）**：上下排，文字置中

```css
.shortest-stat-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
@media (max-width: 640px) {
  .shortest-stat-card {
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
}
```

---

### 4-3. ShortestRouteMap 字體大小調整

| 元素 | 修改前 | 修改後 |
|------|--------|--------|
| 為什麼不走最短路線？（主標題） | 14px | 17px |
| 副標題說明文字 | 11px | 13px |
| 統計方塊 label | — | 14px |
| 統計方塊數值 | — | 20px |
| 圖例文字（推薦路線 / 危險 / 最短路徑） | 11px | 12px |
| 統計方塊內外 padding | '10px 14px' | '9px 10px'（窄一點） |

---

## 五、Profile（`styles/profile.css`）

### 5-1. 「返回首頁」按鈕 hover 樣式

**修改**：與其他頁面一致，平常透明，hover 顯示橘色外框：

```css
.pf-back-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 14px;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.pf-back-btn:hover {
  background: rgba(255, 107, 53, 0.08);
  border-color: rgba(255, 107, 53, 0.3);
  color: var(--pf-orange);
}
```

### 5-2. 返回按鈕垂直置中

**修改**：`.pf-main` 加入 `padding-top: 24px`，使「返回首頁」與上下區塊距離對稱。

---

## 六、已知限制 / 未完成事項

| 項目 | 狀態 |
|------|------|
| Profile、RouteDetail、Landing 字體大小審查 | ⏳ 尚未進行 |
| Admin 後台（Sophie 的 `feature/admin` 分支） | ⏳ 未合併進 main，待 Sam 決定 |
| 管理者帳號 `yp123@gmail.com` | ✅ 已建立（role=admin），後台頁面待合併後可用 |

---

## 七、測試建議

```bash
# 起動環境
docker start driving_route_db
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm run dev
```

**手動驗證項目**：
- [ ] Dashboard 縮圖：起點綠點、終點紅點是否正確顯示
- [ ] Dashboard Modal：「查看更多」點後跳 Records 並自動展開對應紀錄
- [ ] RoutePlanner / Dashboard 輸入欄：起點=綠、終點=紅
- [ ] 所有頁面「返回首頁 / 查看全部」按鈕：一般透明，hover 橘框橘字
- [ ] RouteSelect 縮圖：路線不再有錯誤交叉
- [ ] ShortestRouteMap 桌機：數字在 label 右側；手機：上下排置中
- [ ] 手機版 cockpit 標籤（單次里程等）：不換行
- [ ] 推薦終點 ↺ 按鈕：18px，icon 14px
