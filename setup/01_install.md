# 安裝需求說明

本專案使用 Docker 執行資料庫，不需要在本機手動安裝 PostgreSQL。

---

## Docker 映像檔內容

`Dockerfile` 基於 `postgis/postgis:14-3.2`，自動包含：

| 套件 | 版本 |
|------|------|
| PostgreSQL | 14 |
| PostGIS | 3.2 |
| pgRouting | 最新相容版 |
| shp2pgsql | 隨 PostGIS 附帶 |

---

## 本機需要安裝的工具

### 1. Docker Desktop
- 下載：https://www.docker.com/products/docker-desktop
- Windows 需開啟 WSL2 功能

### 2. Python 3.10+
- 下載：https://www.python.org/downloads/
- 安裝時勾選「Add Python to PATH」

### 3. Node.js 18+
- 下載：https://nodejs.org/
- 建議安裝 LTS 版本

### 4. Git
- 下載：https://git-scm.com/

### 5. DBeaver（建議）
- 下載：https://dbeaver.io/download/
- 用於查看和操作資料庫

---

## 版本確認

安裝完成後可用以下指令確認：

```bash
docker --version       # Docker 23+
python --version       # Python 3.10+
node --version         # Node 18+
git --version
```
