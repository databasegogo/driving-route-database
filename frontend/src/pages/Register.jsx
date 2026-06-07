import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserPlus, CheckCircle, User, MapPin } from 'lucide-react'
import api from '../api'
import '../styles/auth.css'

function Register() {
  const [form, setForm] = useState({
    name:         '',
    email:        '',
    password:     '',
    birthday:     '',
    licenseDate:  '',
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
        address:      JSON.stringify({
          city:     form.addrCity,
          district: form.addrDistrict,
          road:     form.addrRoad,
          section:  form.addrSection,
          lane:     form.addrLane,
          number:   form.addrNumber,
        }),
      })

      setSuccess(true)
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      if (detail === 'EMAIL_ALREADY_EXISTS') {
        setError('此 Email 已被使用 ❌')
      } else if (status === 422) {
        const errs = err.response?.data?.detail
        const msg  = Array.isArray(errs) ? errs.map(e => e.msg).join('、') : '輸入格式錯誤'
        setError(`格式錯誤：${msg} ⚠️`)
      } else {
        setError('註冊失敗，請稍後再試 ⚠️')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page-container">
        <div className="auth-glass-card" style={{ maxWidth: '440px', padding: '48px 40px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <CheckCircle size={56} color="#264653" style={{ opacity: 0.9 }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#264653', margin: 0 }}>註冊成功！</h2>
            <p style={{ fontSize: '14px', color: '#7e8b9b', margin: '0 0 12px 0', textAlign: 'center' }}>
              您的虛擬座艙憑證已簽發，請重新登入以進入系統。
            </p>
            <button 
              className="auth-submit-btn" 
              onClick={() => navigate('/login')}
              style={{ marginTop: '8px' }}
            >
              前往開通數位座艙
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page-container">
      {/* 🌟 頂級橫向毛玻璃數位面板 */}
      <div className="auth-glass-card register-dashboard-layout">
        
        {/* 👑 1. 頂部主標題（高奢置中） */}
        <div className="register-main-header">
          <h2>新手路徑王</h2>
          <p className="brand-subtitle">Smart Path Driving Platform</p>
        </div>

        {/* 🎛️ 2. 核心雙軌制控制台表單 */}
        <form onSubmit={handleSubmit} className="register-dashboard-form">
          
          <div className="register-columns-container">
            
            {/* 👤 左舷欄位：個人資訊 */}
            <div className="register-panel-column">
              <div className="panel-section-title">
                <User size={16} />
                <span>個人資訊</span>
                <div className="title-deco-line"></div>
              </div>
              
              <div className="panel-inside-grid-2col">
                <div className="auth-input-group">
                  <label htmlFor="name">
                    姓名
                    <span className={`field-counter ${form.name.length >= 26 ? 'at-limit' : ''}`}>
                      {form.name.length}/26
                    </span>
                  </label>
                  <input id="name" name="name" type="text" className="auth-field"
                    value={form.name} onChange={handleChange} placeholder="請輸入姓名"
                    maxLength={26} required />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" className="auth-field"
                    value={form.email} onChange={handleChange} placeholder="請輸入 Email" required />
                </div>
              </div>

              <div className="panel-inside-grid-2col">
                <div className="auth-input-group">
                  <label htmlFor="reg-password">密碼</label>
                  <input id="reg-password" name="password" type="password" className="auth-field"
                    value={form.password} onChange={handleChange} placeholder="設定密碼（至少六位數）" required />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="birthday">生日</label>
                  <input id="birthday" name="birthday" type="date" className="auth-field"
                    value={form.birthday} onChange={handleChange} required />
                </div>
              </div>

              <div className="auth-input-group">
                <label htmlFor="licenseDate">駕照取得日期</label>
                <input id="licenseDate" name="licenseDate" type="date" className="auth-field"
                  value={form.licenseDate} onChange={handleChange} required />
              </div>
            </div>

            {/* 🚧 兩欄中央的高階分界線 */}
            <div className="register-center-divider"></div>

            {/* 📍 右舷欄位：通訊地址 */}
            <div className="register-panel-column">
              <div className="panel-section-title">
                <MapPin size={16} />
                <span>居住通訊地址</span>
                <div className="title-deco-line"></div>
              </div>

              <div className="panel-inside-grid-2col">
                <div className="auth-input-group">
                  <label>市 / 縣</label>
                  <input name="addrCity" type="text" className="auth-field" value={form.addrCity}
                    onChange={handleChange} placeholder="例：台北市" />
                </div>

                <div className="auth-input-group">
                  <label>區</label>
                  <input name="addrDistrict" type="text" className="auth-field" value={form.addrDistrict}
                    onChange={handleChange} placeholder="例：信義區" />
                </div>
              </div>

              <div className="auth-input-group">
                <label>路 / 街</label>
                <input name="addrRoad" type="text" className="auth-field" value={form.addrRoad}
                  onChange={handleChange} placeholder="例：忠孝東路" />
              </div>

              <div className="panel-inside-grid-3col">
                <div className="auth-input-group">
                  <label>段</label>
                  <input name="addrSection" type="text" className="auth-field" value={form.addrSection}
                    onChange={handleChange} placeholder="例：5" />
                </div>

                <div className="auth-input-group">
                  <label>巷</label>
                  <input name="addrLane" type="text" className="auth-field" value={form.addrLane}
                    onChange={handleChange} placeholder="例：12" />
                </div>

                <div className="auth-input-group">
                  <label>號</label>
                  <input name="addrNumber" type="text" className="auth-field" value={form.addrNumber}
                    onChange={handleChange} placeholder="例：3" />
                </div>
              </div>
            </div>

          </div>

          {error && (
            <p style={{ color: '#e76f51', fontSize: '13px', fontWeight: '600', margin: '8px 0 0 0', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {/* 🚀 3. 底部動作整合區 */}
          <div className="register-dashboard-footer">
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              <span>{loading ? '同步核心協議中...' : '註冊'}</span>
              {!loading && <UserPlus size={15} />}
            </button>
            
            <p className="auth-footer-link">
              已有帳號？<Link to="/login">返回登入</Link>
            </p>
          </div>
          
        </form>
        
      </div>
    </div>
  )
}

export default Register