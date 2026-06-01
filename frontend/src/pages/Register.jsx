import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'
import '../styles/auth.css'

function Register() {
  const [form, setForm] = useState({
    name:         '',
    email:        '',
    password:     '',
    birthday:     '',
    licenseDate:  '',
    // 住址：後端尚未支援，暫存在 localStorage
    addrCity:     '',
    addrDistrict: '',
    addrRoad:     '',
    addrSection:  '',
    addrLane:     '',
    addrNumber:   '',
  })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/register', {
        username:     form.name,
        email:        form.email,
        password:     form.password,
        birth_date:   form.birthday,
        license_date: form.licenseDate,
        // 住址後端補好後加到這裡即可：
        // addr_city: form.addrCity, ...
      })

      // 住址先存到 localStorage，等後端支援後再改成存進 DB
      localStorage.setItem('pendingAddr', JSON.stringify({
        addrCity:     form.addrCity,
        addrDistrict: form.addrDistrict,
        addrRoad:     form.addrRoad,
        addrSection:  form.addrSection,
        addrLane:     form.addrLane,
        addrNumber:   form.addrNumber,
      }))

      setSuccess(true)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail === 'EMAIL_ALREADY_EXISTS') {
        setError('此 Email 已被使用')
      } else {
        setError('註冊失敗，請稍後再試')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="success-icon">✓</div>
          <h1>註冊成功！</h1>
          <p className="subtitle">請重新登入以進入系統</p>
          <button className="auth-btn" onClick={() => navigate('/login')}>
            前往登入
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <h1>建立帳號</h1>
        <p className="subtitle">填寫以下資料完成註冊</p>
        <form onSubmit={handleSubmit}>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="name">姓名</label>
              <input id="name" name="name" type="text"
                value={form.name} onChange={handleChange}
                placeholder="請輸入姓名" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email"
                value={form.email} onChange={handleChange}
                placeholder="請輸入 Email" required />
            </div>
            <div className="field">
              <label htmlFor="reg-password">密碼</label>
              <input id="reg-password" name="password" type="password"
                value={form.password} onChange={handleChange}
                placeholder="設定密碼" required />
            </div>
            <div className="field">
              <label htmlFor="birthday">生日</label>
              <input id="birthday" name="birthday" type="date"
                value={form.birthday} onChange={handleChange} required />
            </div>
            <div className="field">
              <label htmlFor="licenseDate">駕照取得日期</label>
              <input id="licenseDate" name="licenseDate" type="date"
                value={form.licenseDate} onChange={handleChange} required />
            </div>
          </div>

          {/* 住址（暫存本地）*/}
          <p className="addr-section-label">住址</p>
          <div className="addr-grid-reg">
            <div className="field">
              <label>市 / 縣</label>
              <input name="addrCity" type="text" value={form.addrCity}
                onChange={handleChange} placeholder="例：台北市" />
            </div>
            <div className="field">
              <label>區</label>
              <input name="addrDistrict" type="text" value={form.addrDistrict}
                onChange={handleChange} placeholder="例：信義區" />
            </div>
            <div className="field">
              <label>路 / 街</label>
              <input name="addrRoad" type="text" value={form.addrRoad}
                onChange={handleChange} placeholder="例：忠孝東路" />
            </div>
            <div className="field">
              <label>段</label>
              <input name="addrSection" type="text" value={form.addrSection}
                onChange={handleChange} placeholder="例：5" />
            </div>
            <div className="field">
              <label>巷</label>
              <input name="addrLane" type="text" value={form.addrLane}
                onChange={handleChange} placeholder="例：12" />
            </div>
            <div className="field">
              <label>號</label>
              <input name="addrNumber" type="text" value={form.addrNumber}
                onChange={handleChange} placeholder="例：3" />
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '註冊中...' : '確定註冊'}
          </button>
        </form>
        <p className="switch-link">
          已有帳號？<Link to="/login">返回登入</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
