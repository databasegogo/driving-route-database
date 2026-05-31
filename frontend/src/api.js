import axios from 'axios'

// 所有 API 請求的基底設定
const api = axios.create({
  baseURL: 'http://localhost:8000',
})

// 每次發出請求前，自動把 token 加到 Header
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 每次收到回應後，如果是 401（token 過期或無效），自動導回登入頁
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
