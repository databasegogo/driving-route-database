# Environment Setup

## 必要軟體

| 軟體 | 用途 |
|------|------|
| Docker Desktop | 執行 PostgreSQL 資料庫容器 |
| Python 3.10+ | 執行後端 FastAPI |
| Node.js 18+ | 執行前端 React |
| Git | 版本控制 |
| DBeaver（建議）| 查看與操作資料庫 |

---

## 資料庫連線資訊

| 項目 | 值 |
|------|----|
| Host | localhost |
| Port | 5433 |
| Database | gisdb |
| Username | postgres |
| Password | 123456 |

---

## 後端環境變數

| 變數名稱 | 說明 | 預設值（開發用）|
|---------|------|----------------|
| `JWT_SECRET_KEY` | JWT 簽名金鑰，正式環境請改為隨機字串 | `dev-only-change-in-production` |

設定方式：
```bash
# Windows PowerShell
$env:JWT_SECRET_KEY = "your-random-secret-here"

# Linux / macOS
export JWT_SECRET_KEY="your-random-secret-here"
```

---

## 座標系統

```
EPSG:4326（WGS84）
```

---

## PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgrouting;
```

---

## 後端 Python 套件

```
fastapi         API 框架
uvicorn         ASGI 伺服器
psycopg2-binary PostgreSQL 連線
pyjwt           JWT 產生與驗證
pydantic        資料驗證
email-validator Email 格式驗證
bcrypt          密碼雜湊
```
