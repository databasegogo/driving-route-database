import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, MapPin, Camera, Save, CheckCircle, Eye, EyeOff } from 'lucide-react'
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

function Profile() {
  const [user, setUser]           = useState(null)
  const [showPwd, setShowPwd]     = useState(false)
  const [saved, setSaved]         = useState(false)
  const [pwdError, setPwdError]   = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null) // 💡 新增：真正可換的頭貼狀態
  const fileInputRef = useRef(null)
  
  const [form, setForm] = useState({
    email: '', password: '', birthday: '', licenseDate: '',
    addrCity: '', addrDistrict: '', addrRoad: '',
    addrSection: '', addrLane: '', addrNumber: '',
  })
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    // 先讀取本地有沒有換過的頭貼紀錄
    const savedAvatar = localStorage.getItem('user_avatar_base64')
    if (savedAvatar) setAvatarUrl(savedAvatar)

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
          birthday:    data.birth_date   ?? '',
          licenseDate: data.license_date ?? '',
        }
        const local = JSON.parse(localStorage.getItem('currentUser') || '{}')
        setUser({ ...local, ...u })
        setForm({
          email:        data.email           ?? '',
          password:     '',
          birthday:     data.birth_date      ?? '',
          licenseDate:  data.license_date    ?? '',
          addrCity:     local.addrCity       ?? '',
          addrDistrict: local.addrDistrict   ?? '',
          addrRoad:     local.addrRoad       ?? '',
          addrSection:  local.addrSection    ?? '',
          addrLane:     local.addrLane       ?? '',
          addrNumber:   local.addrNumber     ?? '',
        })
        localStorage.setItem('currentUser', JSON.stringify({ ...local, ...u }))
      })
      .catch(() => {
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
          addrLane:     local.addrLane       ?? '',
          addrNumber:   local.addrNumber   ?? '',
        })
      })
  }, [navigate])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // 💡 創新黑魔法：處理換大頭貼事件並暫存到瀏覽器
  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarUrl(reader.result)
        localStorage.setItem('user_avatar_base64', reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  function handleSave(e) {
    e.preventDefault()
    setPwdError('')
    if (form.password && form.password.length < 4) {
      setPwdError('密碼至少需要 4 位數字')
      return
    }
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

  return (
    <div className="profile-innovative-page">
      
      {/* 🌿 頂部輕量化導航（已徹底拔除「駕駛員座艙設定」標題） */}
      <header className="profile-innovative-navbar">
        <button className="innovative-back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} />
          <span>返回主控台</span>
        </button>
        <span /> {/* 留空，維持極簡非對稱平衡 */}
      </header>

      <main className="profile-innovative-wrapper">
        
        {/* 👑 模組一：頂級懸浮核心憑證榮譽卡 */}
        <div className="innovative-hero-card">
          <div className="innovative-avatar-picker-block">
            {/* 點擊頭像即可直接更換照片 */}
            <div className="innovative-clickable-avatar" onClick={() => fileInputRef.current?.click()}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="個人頭貼" className="avatar-uploaded-img" />
              ) : (
                <div className="avatar-text-fallback">{initial}</div>
              )}
              <div className="avatar-hover-overlay">
                <Camera size={18} />
              </div>
            </div>
            {/* 隱藏的檔案上傳點 */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarChange} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />

            <div className="innovative-pilot-info">
              <h2>{user.name}</h2>
              <span className="innovative-uid-tag">@{user.email?.split('@')[0] || 'pilot'}</span>
            </div>
          </div>
          
          {/* 精緻車載數字模組（色系與主頁面高精準同步） */}
          <div className="innovative-stats-panel">
            <div className="innovative-stat-box">
              <span className="innovative-stat-label">駕駛級別</span>
              <span className="innovative-stat-value label-orange-highlight">{getLevel(user)}</span>
            </div>
            <div className="innovative-stat-box">
              <span className="innovative-stat-label">核心分數</span>
              <span className="innovative-stat-value font-dark-blue">{(user.score ?? 0).toLocaleString()} <small>PTS</small></span>
            </div>
            <div className="innovative-stat-box">
              <span className="innovative-stat-label">權限身份</span>
              <span className="innovative-stat-value label-teal-highlight">
                {user.role === 'admin' ? '系統管理者' : '認證駕駛員'}
              </span>
            </div>
          </div>
        </div>

        {/* 🎛 Honor Form Sections：創新非對稱雙懸浮白卡片，絕不溢出邊界 */}
        <form onSubmit={handleSave} className="innovative-form-layout">
          
          <div className="innovative-sections-flexbox">
            
            {/* 📄 獨立卡片一：憑證賬戶核心 */}
            <div className="innovative-sub-white-card">
              <div className="innovative-section-header">
                <User size={16} />
                <span>憑證帳戶設定</span>
              </div>
              
              <div className="innovative-fields-stack">
                <div className="auth-input-group">
                  <label>Email 帳號 (唯讀)</label>
                  <input type="email" value={form.email} className="auth-field disabled-field" readOnly />
                </div>

                <div className="auth-input-group">
                  <label>修訂登入密碼</label>
                  <div className="password-wrap">
                    <input
                      name="password"
                      type={showPwd ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange}
                      className="auth-field"
                      placeholder="輸入新密碼以修訂"
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPwd(v => !v)}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwdError && <span className="field-error">{pwdError}</span>}
                </div>

                <div className="innovative-2col-row">
                  <div className="auth-input-group">
                    <label>生日</label>
                    <input name="birthday" type="date" value={form.birthday} onChange={handleChange} className="auth-field" />
                  </div>
                  <div className="auth-input-group">
                    <label>駕照取得日期</label>
                    <input name="licenseDate" type="date" value={form.licenseDate} onChange={handleChange} className="auth-field" />
                  </div>
                </div>
              </div>
            </div>

            {/* 📍 獨立卡片二：通訊地址核心 */}
            <div className="innovative-sub-white-card">
              <div className="innovative-section-header">
                <MapPin size={16} />
                <span>居住通訊地址（本地暫存）</span>
              </div>

              <div className="innovative-fields-stack">
                <div className="innovative-2col-row">
                  <div className="auth-input-group">
                    <label>市 / 縣</label>
                    <input name="addrCity" type="text" value={form.addrCity} onChange={handleChange} className="auth-field" placeholder="例：台北市" />
                  </div>
                  <div className="auth-input-group">
                    <label>區</label>
                    <input name="addrDistrict" type="text" value={form.addrDistrict} onChange={handleChange} className="auth-field" placeholder="例：信義區" />
                  </div>
                </div>

                <div className="auth-input-group">
                  <label>路 / 街</label>
                  <input name="addrRoad" type="text" value={form.addrRoad} onChange={handleChange} className="auth-field" placeholder="例：忠孝東路" />
                </div>

                <div className="innovative-3col-row">
                  <div className="auth-input-group">
                    <label>段</label>
                    <input name="addrSection" type="text" value={form.addrSection} onChange={handleChange} className="auth-field" placeholder="例：5" />
                  </div>
                  <div className="auth-input-group">
                    <label>巷</label>
                    <input name="addrLane" type="text" value={form.addrLane} onChange={handleChange} className="auth-field" placeholder="例：12" />
                  </div>
                  <div className="auth-input-group">
                    <label>號</label>
                    <input name="addrNumber" type="text" value={form.addrNumber} onChange={handleChange} className="auth-field" placeholder="例：3" />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* 🚀 底部與路徑生成高度呼應的完美橘色調動作按鈕 */}
          <div className="innovative-form-action-center">
            <button type="submit" className={`innovative-orange-submit-btn ${saved ? 'btn-saved-orange' : ''}`}>
              {saved ? (
                <>
                  <CheckCircle size={16} />
                  <span>✓ 參數修訂成功</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>儲存變更設定</span>
                </>
              )}
            </button>
          </div>

        </form>
      </main>
    </div>
  )
}

export default Profile