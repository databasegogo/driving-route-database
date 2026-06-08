import axios from 'axios'

// 所有 API 請求的基底設定
const api = axios.create({
  baseURL: '/api',
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
// 例外：WRONG_OLD_PASSWORD 是密碼驗證失敗，不是 token 問題，讓呼叫端自己處理
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 &&
        error.response?.data?.detail !== 'WRONG_OLD_PASSWORD' &&
        error.response?.data?.detail !== 'INVALID_CREDENTIALS') {
      localStorage.removeItem('token')
      localStorage.removeItem('currentUser')
      window.location.href = import.meta.env.BASE_URL + 'login'
    }
    return Promise.reject(error)
  }
)

export default api
