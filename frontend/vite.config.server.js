import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 伺服器部署版設定
// 用法：npm run build:server
//
// 架構：
//   Nginx /driving-route/ → /var/www/driving-route/ （靜態前端）
//   Nginx /api/           → FastAPI port 8000       （API 反向代理）
//
// 與本地版（vite.config.js）的差異：
//   base: '/driving-route/'  前端資源路徑加上子目錄前綴
//   無 proxy 設定             開發代理不需要（nginx 負責）

export default defineConfig({
  plugins: [react()],
  base: '/driving-route/',
})
