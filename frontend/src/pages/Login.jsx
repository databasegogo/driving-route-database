import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import api from '../api'
import logoImg from '../assets/567.jpg'
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
      localStorage.setItem('token', res.data.token)

      // 如果是管理者，跳到管理者後台
      if (res.data.role === 'admin') {
        localStorage.setItem('api_token', res.data.token)
        localStorage.setItem('api_url', 'http://localhost:8000')
        window.location.href = '/admin/index.html'
        return
      }

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
        setError('Email 或密碼錯誤 ❌')
      } else {
        setError('登入失敗，請稍後再試 ⚠️')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page-container">
      <div className="auth-glass-card">
        
        <div className="auth-left-brand-panel">
          <h2>新手路徑王</h2>
          <p className="brand-subtitle">Smart Path Driving Platform</p>
          
          <div className="auth-hero-logo-wrapper">
            <img 
              src={logoImg} 
              alt="新手路徑王核心識別" 
              className="auth-hero-logo" 
              style={{
                width: '100%',
                maxOuterWidth: '260px',
                height: 'auto',
                borderRadius: '0px'
              }}
            />
          </div>
        </div>

        <div className="auth-right-form-panel">
          <form onSubmit={handleSubmit} className="auth-form-grid">
            
            <div className="auth-input-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="auth-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="請輸入 Email"
                autoComplete="email"
                required
              />
            </div>

            <div className="auth-input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="auth-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p style={{ color: '#e76f51', fontSize: '13px', fontWeight: '600', margin: '2px 0', textAlign: 'left' }}>
                {error}
              </p>
            )}

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              <span>{loading ? '協議驗證中...' : '安全登入'}</span>
              {!loading && <LogIn size={15} />}
            </button>
            
          </form>

          <p className="auth-footer-link">
            還沒有帳號？<Link to="/register">立即註冊</Link>
          </p>
        </div>
        
      </div>
    </div>
  )
}

export default Login