# Nina 前端更新說明（feature/ui-redesign）

> 給組員 AI 合併用。本文件描述 `feature/ui-redesign` 分支中，Nina 對前端所做的所有更動。
> 合併時請以本分支的前端檔案為準，後端邏輯以組員分支為主，衝突部分請依下方說明判斷。

---

## 一、新增的檔案（原本不存在）

| 檔案路徑 | 說明 |
|---|---|
| `frontend/src/pages/Landing.jsx` | 登入前的首頁（Hero、功能介紹、步驟說明） |
| `frontend/src/pages/MainLayout.jsx` | 全站共用 Navbar 外殼（已大幅重寫） |
| `frontend/src/styles/landing.css` | Landing 頁面的所有樣式 |
| `frontend/src/assets/*.jpg` | Landing 與 Dashboard 用的圖片資源（mac.jpg、phone.jpg、map.jpg、set.jpg、level.jpg、record.jpg、567.jpg、123.jpg、456.jpg） |

---

## 二、修改的檔案

### 1. `frontend/src/App.jsx`

**變更內容：**
- 新增 Landing 頁面路由，路徑為 `/`
- 未登入訪問不存在路由時，導向 `/`（原本是導向 `/dashboard`）

**關鍵程式碼：**
```jsx
import Landing from './pages/Landing'

// 路由結構
<Route path="/"         element={<Landing />} />
<Route path="/login"    element={<Login />} />
<Route path="/register" element={<Register />} />
<Route element={<MainLayout />}>
  <Route path="/dashboard"    element={<Dashboard />} />
  // ... 其他需要 Navbar 的頁面
</Route>
<Route path="*" element={<Navigate to="/" replace />} />
```

---

### 2. `frontend/src/api.js`

**變更內容：**
- 修正 401 攔截器：原本所有 401 都會跳轉到 `/login`，現在排除 `WRONG_OLD_PASSWORD` 這個錯誤碼（這是舊密碼驗證失敗，不是 token 失效）

**關鍵程式碼：**
```js
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 &&
        error.response?.data?.detail !== 'WRONG_OLD_PASSWORD') {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

---

### 3. `frontend/src/pages/MainLayout.jsx`

**變更內容（整份重寫）：**
- 把右上角的「登出按鈕」改成「漢堡選單（三條線）」
- 點選漢堡 → 展開下拉選單，包含：立即生成路徑、查看練習紀錄、編輯個人檔案、登出
- 登出後導向 `/`（Landing），原本是 `/login`
- 點選選單外部自動關閉（useRef + document event listener）
- 下拉選單有滑入動畫（`@keyframes menuSlideDown`）
- 手機版 Navbar 修正：Logo 縮小為 36px，避免與標題重疊

**選單項目定義：**
```js
const MENU_ITEMS = [
  { icon: Navigation, label: '立即生成路徑', path: '/route' },
  { icon: BookOpen,   label: '查看練習紀錄', path: '/records' },
  { icon: User,       label: '編輯個人檔案', path: '/profile' },
]
```

---

### 4. `frontend/src/pages/Dashboard.jsx`

**變更內容：**

#### 4-1. 右側用戶卡（原本是頭像 + 名字 + 積分條）
- 移除大頭貼字母「N」，改成漸層 Header Bar
- Header 左側：等級標籤（LEVEL 1）+ 等級名稱（新手駕駛）
- Header 右側：⚡ 累計積分數字
- 卡片下方白色區：累計次數 + 累計公里（兩欄）
- 漸層色：`linear-gradient(135deg, #e8622a 0%, #2d6070 65%, #264653 100%)`

#### 4-2. 左右欄寬比例
- Grid 比例改為 `6fr 4fr`（左寬右窄），並對兩側加 `min-width: 0` 防止溢出

#### 4-3. 等級晉升路徑卡（重點改動）
- 原本是進度條，現在改成 SVG 道路 + 小車圖示
- 道路是 S 形曲線，車子沿路行走，位置由積分決定
- 卡片可左右橫向滑動，初始畫面自動讓車子置中
- 走過的路段顯示細橘色線 + 微微發光效果（SVG filter blur）
- 三個里程碑（新手/一般/熟練駕駛）都顯示白色方塊，當前等級橘色字，其他灰色字
- 統計數據：累計次數（BookOpen 圖示）、累計公里

**等級判斷邏輯（前端自行計算，不依賴後端 level_code）：**
```js
// 0~149分 = 新手駕駛, 150~299分 = 一般駕駛, 300分以上 = 熟練駕駛
function getLevel(user) {
  const score = user?.score ?? 0
  if (score >= 300) return LEVEL_MAP.EXPERIENCED
  if (score >= 150) return LEVEL_MAP.NORMAL
  return LEVEL_MAP.BEGINNER
}
```

**新增組件：**
- `CarSVG()` — 橘色小車 SVG 圖示
- `LevelRoad({ score, level, gapToNext })` — 完整的道路卡片組件

---

### 5. `frontend/src/pages/Profile.jsx`

**變更內容（整份重寫）：**

#### 5-1. 英雄區塊（深色 Hero）
- 漸層改為：`linear-gradient(135deg, #0e1e28 0%, #1e4256 40%, #264653 70%, #2d6878 100%)`
- 統計數字：「核心分數」改為「累計積分」，「練習紀錄」改為「練習次數」
- 圖示：練習次數用 BookOpen

#### 5-2. 返回按鈕
- 新增「返回首頁」按鈕，位置在 Hero 卡左上角上方
- 點擊導向 `/`（Landing）

#### 5-3. 獨立編輯模式
- 帳戶資料卡和居住地址卡各自獨立進入/取消編輯
- 各自有自己的儲存按鈕
- 儲存後出現綠色小提示（`pf-saved-inline`）
- 兩個卡片高度不互相影響（`align-items: start`）

#### 5-4. 密碼驗證
- 修改密碼時，若舊密碼錯誤 → 密碼欄微微震動（shake 動畫）+ 顯示錯誤訊息
- 不會跳出頁面（需搭配 api.js 的 401 攔截器修正）

```js
// 密碼錯誤處理
if (err.response?.data?.detail === 'WRONG_OLD_PASSWORD') {
  setPwdError('舊密碼不正確')
  setPwdShake(true)
  setTimeout(() => setPwdShake(false), 450)
}
```

#### 5-5. 手機版
- Hero 區塊改為垂直排列 + 置中對齊
- Navbar 不換行修正（已在 route.css 處理）

---

### 6. `frontend/src/pages/RoutePlanner.jsx`

**變更內容：**
- 難易度解鎖門檻修正：`0 / 500 / 2000` → `0 / 150 / 300`
- 改為從 `total_score` 直接計算最高難度，不使用後端的 `level_code`（因為 DB 資料可能是舊的）

```js
function getMaxDifficulty(score) {
  if (score >= 300) return 3
  if (score >= 150) return 2
  return 1
}

// 在 useEffect 中：
const newMax = getMaxDifficulty(res.data.total_score ?? 0)
```

---

### 7. `frontend/src/pages/Landing.jsx`（新檔案）

**頁面結構：**
1. **Nav** — Logo + 品牌名 + 登入按鈕
2. **Hero** — 全屏背景圖（電腦用 mac.jpg，手機用 phone.jpg）+ 半透明標題卡 + 兩個 CTA 按鈕
3. **Features** — 四大功能（事故密度分析、客製化路徑、等級成就系統、完整練習紀錄）+ 對應圖片，S 形軌道排列
4. **How it works** — 三步驟說明
5. Landing 頁面有 IntersectionObserver 捲動顯示動畫（`.lp-reveal` + `.lp-visible`）

**登入狀態判斷：**
```js
// 已登入的用戶自動導向 Dashboard
useEffect(() => {
  const token = localStorage.getItem('token')
  if (token) navigate('/dashboard', { replace: true })
}, [navigate])
```

---

### 8. CSS 檔案說明

| 檔案 | 主要新增內容 |
|---|---|
| `dashboard.css` | `.dash-user-card`、`.dash-user-header`、`.dash-road-scroll`、`.dash-progress-card`；grid `6fr 4fr`；`min-width: 0` |
| `landing.css` | Landing 頁面完整樣式（Nav、Hero、Features、Steps、動畫） |
| `profile.css` | `.pf-hero` 漸層、`.pf-card-actions`、`.pf-shake` 動畫、`.pf-back-btn`、手機版置中 |
| `route.css` | 手機版 Navbar 修正（Logo 縮小、間距調整） |

---

## 三、合併注意事項

1. **前端檔案以 Nina 的分支為主** — `Dashboard.jsx`、`Profile.jsx`、`MainLayout.jsx`、`Landing.jsx`、`RoutePlanner.jsx`、`api.js`、`App.jsx` 及所有 CSS 請用 Nina 版本
2. **後端檔案以組員分支為主** — `backend/` 資料夾下的所有檔案請以組員版本為主
3. **api.js 的 401 修正很重要** — 如果組員的 api.js 和 Nina 的不同，請確保保留 `WRONG_OLD_PASSWORD` 的例外判斷，否則改密碼功能會壞掉
4. **圖片資源** — `frontend/src/assets/` 下的 jpg 圖片是新增的，直接保留即可，不會有衝突
5. **路由順序** — `App.jsx` 的 `/` 路由要放在最前面，`*` 萬用路由要導向 `/`

---

## 四、等級分數對照

| 等級 | 積分範圍 | 難易度 |
|---|---|---|
| 新手駕駛 | 0 ~ 149 分 | ⭐（1 顆星） |
| 一般駕駛 | 150 ~ 299 分 | ⭐⭐（2 顆星） |
| 熟練駕駛 | 300 分以上 | ⭐⭐⭐（3 顆星） |

> 此對照表同時影響 `Dashboard.jsx`（等級顯示）、`RoutePlanner.jsx`（難易度解鎖）、`Profile.jsx`（個人資料）
