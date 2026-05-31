import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import '../styles/profile.css'

const LEVEL_LABEL = {
  BEGINNER:    '新手駕駛',
  NORMAL:      '一般駕駛',
  EXPERIENCED: '熟練駕駛',
}

function getLevel(user) {
  if (user?.level_code && LEVEL_LABEL[user.level_code]) return LEVEL_LABEL[user.level_code]
  const score = user?.score ?? 0
  if (score >= 2000) return '熟練駕駛'
  if (score >= 500)  return '一般駕駛'
  return '新手駕駛'
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function Profile() {
  const [user, setUser]           = useState(null)
  const [showPwd, setShowPwd]     = useState(false)
  const [saved, setSaved]         = useState(false)
  const [pwdError, setPwdError]   = useState('')
  const [form, setForm]           = useState({
    email: '', password: '', birthday: '', licenseDate: '',
    addrCity: '', addrDistrict: '', addrRoad: '',
    addrSection: '', addrLane: '', addrNumber: '',
  })
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    // 從後端拿最新使用者資料
    api.get('/user/me')
      .then(res => {
        const data = res.data
        const u = {
          user_id:    data.user_id,
          name:       data.username,
          email:      data.email,
          score:      data.total_score,
          level_code: data.level_code,
          role:       data.role,
          // 以下後端有回傳就用後端的，否則從 localStorage 補
          birthday:    data.birth_date   ?? '',
          licenseDate: data.license_date ?? '',
        }
        // 保留本地存的住址（後端沒有這個欄位）
        const local = JSON.parse(localStorage.getItem('currentUser') || '{}')
        setUser({ ...u, ...local, ...u })  // 後端資料優先
        setForm({
          email:        data.email           ?? '',
          password:     '',                      // 密碼不從後端拿（安全考量）
          birthday:     data.birth_date      ?? '',
          licenseDate:  data.license_date    ?? '',
          addrCity:     local.addrCity       ?? '',
          addrDistrict: local.addrDistrict   ?? '',
          addrRoad:     local.addrRoad       ?? '',
          addrSection:  local.addrSection    ?? '',
          addrLane:     local.addrLane       ?? '',
          addrNumber:   local.addrNumber     ?? '',
        })
        // 同步更新 localStorage
        localStorage.setItem('currentUser', JSON.stringify({ ...local, ...u }))
      })
      .catch(() => {
        // 後端失敗退回 localStorage
        const local = JSON.parse(localStorage.getItem('currentUser') || '{}')
        if (!local.user_id) { navigate('/login'); return }
        setUser(local)
        setForm({
          email:        local.email        ?? '',
          password:     '',
          birthday:     local.birthday     ?? '',
          licenseDate:  local.licenseDate  ?? '',
          addrCity:     local.addrCity     ?? '',
          addrDistrict: local.addrDistrict ?? '',
          addrRoad:     local.addrRoad     ?? '',
          addrSection:  local.addrSection  ?? '',
          addrLane:     local.addrLane     ?? '',
          addrNumber:   local.addrNumber   ?? '',
        })
      })
  }, [navigate])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleSave(e) {
    e.preventDefault()
    setPwdError('')
    if (form.password && form.password.length < 4) {
      setPwdError('密碼至少需要 4 位數字')
      return
    }
    // 後端目前沒有更新個人資料的 API，住址資料存在本地
    const addrFields = {
      addrCity: form.addrCity, addrDistrict: form.addrDistrict,
      addrRoad: form.addrRoad, addrSection:  form.addrSection,
      addrLane: form.addrLane, addrNumber:   form.addrNumber,
    }
    const updated = { ...user, ...addrFields }
    localStorage.setItem('currentUser', JSON.stringify(updated))
    setUser(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!user) return null

  const initial = user.name?.[0] ?? '?'
  const avatarColors = ['#4f7cff','#e06c75','#56b6c2','#98c379','#d19a66']
  const avatarBg = avatarColors[(user.name?.charCodeAt(0) ?? 0) % avatarColors.length]

  return (
    <div className="profile-page">
      <header className="profile-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>← 返回</button>
        <span className="profile-title">個人檔案</span>
        <span />
      </header>

      <main className="profile-main">
        {/* 頭像區 */}
        <div className="avatar-section">
          <div className="avatar" style={{ background: avatarBg }}>{initial}</div>
          <div className="avatar-info">
            <h2>{user.name}</h2>
            <span className="account-label">@{user.account}</span>
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSave}>
          {/* 基本資料 */}
          <section className="form-section">
            <h3 className="section-title">基本資料</h3>

            <div className="field">
              <label>Email</label>
              <input name="email" type="email" value={form.email}
                onChange={handleChange} placeholder="請輸入 Email" />
            </div>

            <div className="field">
              <label>密碼</label>
              <div className="password-wrap">
                <input
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="至少 4 位數字"
                  required
                />
                <button type="button" className="eye-btn" onClick={() => setShowPwd(v => !v)}>
                  <EyeIcon open={showPwd} />
                </button>
              </div>
              {pwdError && <span className="field-error">{pwdError}</span>}
            </div>

            <div className="field-row">
              <div className="field">
                <label>生日</label>
                <input name="birthday" type="date" value={form.birthday} onChange={handleChange} />
              </div>
              <div className="field">
                <label>駕照取得日期</label>
                <input name="licenseDate" type="date" value={form.licenseDate} onChange={handleChange} />
              </div>
            </div>
          </section>

          {/* 住址 */}
          <section className="form-section">
            <h3 className="section-title">住址</h3>
            <div className="addr-grid">
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
            </div>
            <div className="addr-grid-sm">
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
          </section>

          {/* 帳號資訊（唯讀）*/}
          <section className="form-section">
            <h3 className="section-title">帳號資訊</h3>
            <div className="field-row">
              <div className="field">
                <label>駕駛等級</label>
                <div className="readonly-field">{getLevel(user)}</div>
              </div>
              <div className="field">
                <label>累積分數</label>
                <div className="readonly-field">{(user.score ?? 0).toLocaleString()} 分</div>
              </div>
              <div className="field">
                <label>身份</label>
                <div className="readonly-field">{user.role === 'admin' ? '管理者' : '使用者'}</div>
              </div>
            </div>
          </section>

          <button type="submit" className="save-btn">
            {saved ? '✓ 已儲存' : '儲存變更'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default Profile
