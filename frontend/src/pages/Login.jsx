import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'
import '../styles/auth.css'

function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.post('/auth/login', { email, password })

      // 把後端給的 token 存起來，之後每次請求都會自動帶上
      localStorage.setItem('token', res.data.token)

      // 把基本使用者資料存起來，讓 Dashboard 可以用
      // 合併註冊時暫存的住址
      const pendingAddr = JSON.parse(localStorage.getItem('pendingAddr') || '{}')
      localStorage.removeItem('pendingAddr')
      localStorage.setItem('currentUser', JSON.stringify({
        user_id:  res.data.user_id,
        name:     res.data.username,
        email:    email,
        level_id: res.data.user_level_id,
        score:    0,
        ...pendingAddr,
      }))

      navigate('/dashboard')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail === 'INVALID_CREDENTIALS') {
        setError('Email 或密碼錯誤')
      } else {
        setError('登入失敗，請稍後再試')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>駕駛路徑資料庫</h1>
        <p className="subtitle">請登入以繼續</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="請輸入 Email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">密碼</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
        <p className="switch-link">
          還沒有帳號？<Link to="/register">立即註冊</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
