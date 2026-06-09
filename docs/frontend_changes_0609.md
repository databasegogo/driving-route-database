# 前端微調紀錄 — 2026/06/09

---

## 1. 註冊成功頁面文案調整
**檔案：** `frontend/src/pages/Register.jsx`

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| 副標題 | 您的虛擬座艙憑證已簽發，請重新登入以進入系統。 | 歡迎加入！登入後即可開始規劃你的練習路線。 |
| 按鈕 | 前往開通數位座艙 | 立即登入 |

---

## 2. 手機版註冊表單 RWD 修正
**檔案：** `frontend/src/styles/auth.css`

- 新增 `@media (max-width: 480px)` breakpoint
- 480px 以下，`panel-inside-grid-2col` 改為單欄（避免姓名 / Email 欄位過窄）
- `panel-inside-grid-3col` 維持雙欄（段巷並排）
- 輸入框 `font-size: 16px`，防止 iOS Safari 自動縮放
- 登入頁卡片維持垂直置中；註冊頁因表單較長，改從上方排列（`:has(.register-dashboard-layout)`）

---

## 3. 頁面跳轉自動回頂端
**新增檔案：** `frontend/src/ScrollToTop.jsx`  
**修改檔案：** `frontend/src/App.jsx`

- 新增 `ScrollToTop` 元件，每次路由切換時同時捲動 `window` 與 `.layout-main-content`（MainLayout 的獨立 scroll 容器）
- 掛載於 `BrowserRouter` 內，全頁面生效
- **特例：** `/route-detail`（路線練習頁）跳轉後改為捲到**底部**，讓「開始練習」按鈕直接可見

---

## 4. 手機版 Navbar Logo 與標題調整
**檔案：** `frontend/src/styles/route.css`

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| Logo 尺寸 | 36 × 36 px | 48 × 48 px |
| 標題字體 | 15 px | 20 px |
| Logo 與文字間距 | 8 px | 2 px |

---

## 5. 路線卡片數據欄位不換行修正
**檔案：** `frontend/src/styles/route.css`

- `.slide-stats` 加 `flex-wrap: nowrap`
- `.slide-stat` 加 `white-space: nowrap`、`flex-shrink: 0`
- 手機版（768px）gap 縮為 10px、字體 12px，防止「+6 分」等文字斷行

---

## 6. 地圖選點視角自動調整
**檔案：** `frontend/src/pages/RoutePlanner.jsx`

新增 `MapController` 元件（使用 `useMap()`）：

| 情境 | 效果 |
|------|------|
| GPS 定位後開地圖 | 地圖自動飛到 GPS 座標（zoom 15） |
| 選好一個點（另一點未選） | 地圖置中到該點 |
| 起點終點都選好 | 自動 `fitBounds` 讓兩點同時出現在畫面（padding 50px，maxZoom 15） |
