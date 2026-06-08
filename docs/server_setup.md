# 伺服器架設指南 — 新手路徑王

本文件說明如何從零開始在 Ubuntu 伺服器上架設新手路徑王，並透過 Cloudflare Tunnel 對外發布。

---

## 目錄

1. [系統需求](#系統需求)
2. [整體架構](#整體架構)
3. [Step 1：安裝必要套件](#step-1安裝必要套件)
4. [Step 2：架設資料庫（Docker）](#step-2架設資料庫docker)
5. [Step 3：架設後端（FastAPI）](#step-3架設後端fastapi)
6. [Step 4：建置前端](#step-4建置前端)
7. [Step 5：設定 Nginx](#step-5設定-nginx)
8. [Step 6：設定 Cloudflare Tunnel](#step-6設定-cloudflare-tunnel)
9. [驗證全流程](#驗證全流程)
10. [日常維護](#日常維護)

---

## 系統需求

- Ubuntu 22.04+
- 至少 2GB RAM（pgRouting 查詢需要）
- 已有 Cloudflare 帳號與網域

---

## 整體架構

```
使用者瀏覽器
    ↓ HTTPS
Cloudflare Tunnel
    ↓ HTTP
Nginx（port 80）
    ├── /driving-route/  →  靜態前端檔案
    └── /api/            →  FastAPI（port 8000）
                                    ↓
                        PostgreSQL + PostGIS + pgRouting
                        （Docker，port 5433）
```

---

## Step 1：安裝必要套件

```bash
sudo apt update && sudo apt upgrade -y

# 安裝 Docker
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo usermod -aG docker $USER
newgrp docker

# 安裝 Python 環境
sudo apt install -y python3 python3-pip python3-venv

# 安裝 Node.js（v18+）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安裝 Nginx
sudo apt install -y nginx
```

---

## Step 2：架設資料庫（Docker）

### 2-1. Clone 專案

```bash
cd ~
git clone https://github.com/Smaxoi/driving-route-database.git
cd driving-route-database
```

### 2-2. 啟動 PostgreSQL 容器

```bash
docker-compose up -d
```

確認容器在跑：

```bash
docker ps
# 應看到 driving_route_db，狀態 Up
```

### 2-3. 依序執行 SQL 腳本（01 → 10）

```bash
# 進入容器執行（每個腳本依序執行）
for i in 01 02 03 04 05 06 07 08 09 10; do
  echo "執行 sql/${i}_*.sql ..."
  docker exec -i driving_route_db psql -U postgres -d gisdb \
    < sql/$(ls sql/ | grep "^${i}_")
done
```

或手動一個一個執行：

```bash
docker exec -i driving_route_db psql -U postgres -d gisdb < sql/01_create_extensions.sql
docker exec -i driving_route_db psql -U postgres -d gisdb < sql/02_filter_guishan.sql
# ... 以此類推到 10
```

> ⚠️ **注意**：`09_routing_helpers.sql` 執行後一定要接著執行 `10_bridge_gaps.sql`

### 2-4. 確認資料庫狀態

```bash
# 可路由節點應約 4,196+
docker exec driving_route_db psql -U postgres -d gisdb \
  -c "SELECT COUNT(*) FROM main_component_nodes;"

# 橋接邊應約 895+
docker exec driving_route_db psql -U postgres -d gisdb \
  -c "SELECT COUNT(*) FROM road_edge WHERE edge_id >= 9000000;"
```

---

## Step 3：架設後端（FastAPI）

### 3-1. 建立虛擬環境

```bash
cd ~/driving-route-database/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3-2. 確認資料庫連線設定

`backend/database.py` 預設連線設定：

| 項目 | 值 |
|------|----|
| Host | localhost |
| Port | 5433 |
| Database | gisdb |
| Username | postgres |
| Password | 123456 |

### 3-3. 測試後端能否啟動

```bash
cd ~/driving-route-database/backend
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000

# 另開 terminal 確認
curl http://localhost:8000/
# 應回傳 {"message":"API is running"}
```

### 3-4. 設定開機自動啟動（systemd）

```bash
sudo nano /etc/systemd/system/driving-route-backend.service
```

貼入以下內容（`sam` 換成你的使用者名稱）：

```ini
[Unit]
Description=Driving Route FastAPI Backend
After=network.target

[Service]
User=sam
WorkingDirectory=/home/sam/driving-route-database/backend
ExecStart=/home/sam/driving-route-database/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable driving-route-backend
sudo systemctl start driving-route-backend

# 確認狀態
sudo systemctl status driving-route-backend
```

---

## Step 4：建置前端

```bash
cd ~/driving-route-database/frontend
npm install
npm run build
```

將建置成果部署到 Nginx 服務目錄：

```bash
sudo mkdir -p /var/www/driving-route
sudo rsync -av --delete dist/ /var/www/driving-route/
sudo chown -R www-data:www-data /var/www/driving-route
```

確認路徑正確（應看到 `/driving-route/assets/...`）：

```bash
cat /var/www/driving-route/index.html
```

---

## Step 5：設定 Nginx

### 5-1. 建立設定檔

```bash
sudo nano /etc/nginx/sites-available/driving-route
```

貼入以下設定：

```nginx
server {
    listen 80;
    server_name _;

    root /var/www;
    index index.html;

    # 根目錄不顯示任何東西
    location = / {
        return 404;
    }

    # API 反向代理到 FastAPI
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # 前端靜態檔案（React SPA）
    location /driving-route/ {
        alias /var/www/driving-route/;
        try_files $uri $uri/ /driving-route/index.html;
    }
}
```

### 5-2. 啟用設定

```bash
sudo ln -s /etc/nginx/sites-available/driving-route \
           /etc/nginx/sites-enabled/driving-route

# 移除預設設定（避免衝突）
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

### 5-3. 本地測試

```bash
curl -I http://localhost/driving-route/
# 應回傳 200 OK

curl http://localhost/api/
# 應回傳 {"detail":"Not Found"} 或類似 JSON

curl -I http://localhost/
# 應回傳 404
```

---

## Step 6：設定 Cloudflare Tunnel

### 6-1. 安裝 cloudflared

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
  https://pkg.cloudflare.com/cloudflared any main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update && sudo apt install -y cloudflared
```

### 6-2. 登入 Cloudflare

```bash
cloudflared tunnel login
# 會開啟瀏覽器，選擇你的網域並授權
```

### 6-3. 建立 Tunnel

```bash
cloudflared tunnel create ubuntu-web
# 記下回傳的 Tunnel ID
```

### 6-4. 設定路由

```bash
# 將網域指向 Tunnel（換成你的網域）
cloudflared tunnel route dns ubuntu-web www.youmei.tw
```

### 6-5. 建立設定檔

```bash
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: ubuntu-web
credentials-file: /home/sam/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: www.youmei.tw
    service: http://localhost:80
  - service: http_status:404
```

### 6-6. 設定開機自動啟動

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# 確認狀態
sudo systemctl status cloudflared
```

---

## 驗證全流程

```bash
# 1. Docker 有在跑
docker ps | grep driving_route_db

# 2. 後端有在跑
curl http://localhost:8000/

# 3. Nginx 正常
curl -I http://localhost/driving-route/

# 4. Cloudflare Tunnel 正常
sudo systemctl status cloudflared

# 5. 完整路徑測試（換成你的帳密）
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"你的email","password":"你的密碼"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s "http://localhost/api/route/snap?lat=25.044&lng=121.348" \
  -H "Authorization: Bearer $TOKEN"
# 應回傳 snap_lat, snap_lng, dist_m
```

---

## 日常維護

### 更新前端程式碼

```bash
cd ~/driving-route-database
git pull origin main

cd frontend
npm run build
sudo rsync -av --delete dist/ /var/www/driving-route/
sudo chown -R www-data:www-data /var/www/driving-route
```

### 更新後端程式碼

```bash
cd ~/driving-route-database
git pull origin main

sudo systemctl restart driving-route-backend
```

### 重啟所有服務

```bash
docker start driving_route_db
sudo systemctl restart driving-route-backend
sudo systemctl reload nginx
sudo systemctl restart cloudflared
```

### 查看後端 log

```bash
sudo journalctl -u driving-route-backend -f
```

### 查看 Nginx log

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```
