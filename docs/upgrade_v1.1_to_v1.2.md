# 升級指南：v1.1.0 → v1.2.0

本文件說明如何從上一個版本（v1.1.0）升級至目前版本（v1.2.0）。  
請**依序執行**，每個步驟完成後再繼續下一步。

---

## 概覽

| 步驟 | 類別 | 說明 |
|------|------|------|
| 1 | Git | 拉取最新程式碼 |
| 2 | 後端套件 | 安裝 2 個新套件 |
| 3 | 環境變數 | 設定 JWT 金鑰 |
| 4 | 資料庫 | 清除舊使用者資料（bcrypt 不相容）|
| 5 | 前端套件 | 安裝 1 個新套件 |
| 6 | 驗證 | 重新啟動並確認功能正常 |

---

## 前置條件

- Docker 容器 `driving_route_db` 正在執行
- 已安裝 Python 虛擬環境（或全域 Python）
- 已安裝 Node.js

---

## Step 1：拉取最新程式碼

```bash
git pull origin main
```

確認目前在正確的 commit：

```bash
git log --oneline -3
```

---

## Step 2：安裝後端新套件

v1.2.0 新增了 `bcrypt` 和 `email-validator` 兩個套件：

```bash
cd backend
pip install -r requirements.txt
```

確認安裝成功：

```bash
pip show bcrypt email-validator
```

應分別顯示 `Version: 4.1.3` 和 `Version: 2.1.1`。

---

## Step 3：設定 JWT 環境變數

v1.2.0 起，JWT 金鑰改從環境變數讀取（不再硬寫在程式碼中）。

**開發環境可跳過**（會使用預設開發用金鑰），但建議仍設定：

```bash
# Windows PowerShell
$env:JWT_SECRET_KEY = "your-random-secret-key-here"

# Linux / macOS
export JWT_SECRET_KEY="your-random-secret-key-here"
```

> ⚠️ 正式部署時必須設定，且每次重新開啟終端機都需要重設（或寫入 `.env` / 系統環境變數）。

---

## Step 4：清除舊使用者資料（⚠️ 必須執行）

v1.1.0 使用 **SHA-256** 儲存密碼，v1.2.0 改為 **bcrypt**。  
兩者格式不相容，舊帳號**無法登入**，需清除後重新註冊。

用 DBeaver 或 psql 連線至 `gisdb`，執行以下 SQL：

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

執行後確認清空：

```sql
SELECT COUNT(*) FROM app_user;
-- 應回傳 0
```

> ✅ 道路、事故、風險分數、`district` 等資料**不受影響**，不需要重建。

---

## Step 5：安裝前端新套件

v1.2.0 新增了 `lucide-react` 圖示庫：

```bash
cd frontend
npm install
```

確認安裝成功：

```bash
npm list lucide-react
```

應顯示版本號（例如 `lucide-react@0.x.x`）。

---

## Step 6：重新啟動並驗證

### 啟動後端

```bash
cd backend
uvicorn main:app --reload
```

### 啟動前端

```bash
cd frontend
npm run dev
```

### 驗證清單

升級完成後，請逐項確認以下功能正常：

- [ ] `http://localhost:8000/docs` 可正常開啟，並看到 `/district/boundary` 端點
- [ ] 開啟前端 `http://localhost:5173`，頁面正常載入
- [ ] 可正常**註冊**新帳號（輸入 Email 格式錯誤時應顯示錯誤）
- [ ] 可正常**登入**
- [ ] 路線規劃頁：點選地圖圖示，地圖 Modal 可開啟，並顯示龜山區邊界
- [ ] 路線規劃頁：在邊界外點選時出現紅點，確認按鈕禁用
- [ ] 規劃路線後，RouteSelect 顯示最多 3 條**不重複**路線
- [ ] 路線預覽 SVG 不扭曲（各路段獨立顯示）

---

## 常見問題

### Q：執行 TRUNCATE 時出現 FK 錯誤

確認 TRUNCATE 順序正確（子表在前），並加上 `CASCADE`：

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

### Q：後端啟動報 `ModuleNotFoundError: bcrypt`

代表 Step 2 未正確安裝：

```bash
pip install bcrypt==4.1.3
```

### Q：後端啟動報 `ModuleNotFoundError: email_validator`

```bash
pip install email-validator==2.1.1
```

### Q：地圖 Modal 邊界沒有顯示

確認後端已重新啟動，且 `GET /district/boundary` 有回傳資料：

```bash
curl http://localhost:8000/district/boundary
# 應回傳 GeoJSON Feature 物件
```

若回傳 `[]` 空陣列，請確認 DB 的 `district` 表有龜山區資料：

```sql
SELECT name, ST_GeometryType(geom) FROM district;
-- 應顯示 龜山區 | ST_MultiPolygon
```

---

## 回滾方式（如需退回 v1.1.0）

```bash
git checkout <v1.1.0 的 commit hash>
cd backend && pip install -r requirements.txt
cd frontend && npm install
```

> 注意：退回後已用 bcrypt 儲存的帳號仍需清除重新註冊。
