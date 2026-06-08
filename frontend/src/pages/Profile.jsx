import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, MapPin, Save, CheckCircle, Eye, EyeOff,
         Zap, BookOpen, Navigation, Pencil, X } from 'lucide-react'
import api from '../api'
import '../styles/profile.css'

const LEVEL_MAP = {
  BEGINNER:    { label: '新手駕駛', next: '一般駕駛', nextScore: 150, prevScore: 0   },
  NORMAL:      { label: '一般駕駛', next: '熟練駕駛', nextScore: 300, prevScore: 150 },
  EXPERIENCED: { label: '熟練駕駛', next: null,       nextScore: 300, prevScore: 300 },
}

function getLevel(score) {
  if (score >= 300) return LEVEL_MAP.EXPERIENCED
  if (score >= 150) return LEVEL_MAP.NORMAL
  return LEVEL_MAP.BEGINNER
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const [y, m, d] = dateStr.split('-')
    if (!y || !m || !d) return dateStr
    return `${y} / ${m} / ${d}`
  } catch { return dateStr }
}

export default function Profile() {
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)

  const [user,      setUser]      = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [pracCount, setPracCount] = useState(0)
  const [totalKm,   setTotalKm]   = useState(0)

  // 顯示用（讀模式）
  const [data, setData] = useState({
    email: '', birthday: '', licenseDate: '',
    addrCity: '', addrDistrict: '', addrRoad: '',
    addrSection: '', addrLane: '', addrNumber: '',
  })

  // ── 帳戶資料 edit state ──
  const [editAccount,  setEditAccount]  = useState(false)
  const [draftAccount, setDraftAccount] = useState({})
  const [savedAccount, setSavedAccount] = useState(false)

  // ── 地址 edit state ──
  const [editAddress,  setEditAddress]  = useState(false)
  const [draftAddress, setDraftAddress] = useState({})
  const [savedAddress, setSavedAddress] = useState(false)

  // ── 密碼（在帳戶編輯區）──
  const [showPwdChange, setShowPwdChange] = useState(false)
  const [oldPwd,        setOldPwd]        = useState('')
  const [newPwd,        setNewPwd]        = useState('')
  const [showOld,       setShowOld]       = useState(false)
  const [showNew,       setShowNew]       = useState(false)
  const [pwdError,      setPwdError]      = useState('')
  const [pwdShake,      setPwdShake]      = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    const av = localStorage.getItem('user_avatar_base64')
    if (av) setAvatarUrl(av)

    const local = JSON.parse(localStorage.getItem('currentUser') || '{}')

    api.get('/user/me')
      .then(res => {
        const d    = res.data
        const addr = d.address ?? {}
        const u = {
          ...local,
          user_id:      d.user_id,
          name:         d.username,
          email:        d.email,
          score:        d.total_score ?? 0,
          level_code:   d.level_code,
          role:         d.role,
          birth_date:   d.birth_date   ?? '',
          license_date: d.license_date ?? '',
        }
        setUser(u)
        setData({
          email:        d.email,
          birthday:     d.birth_date   ?? '',
          licenseDate:  d.license_date ?? '',
          addrCity:     addr.city     ?? local.addrCity     ?? '',
          addrDistrict: addr.district ?? local.addrDistrict ?? '',
          addrRoad:     addr.road     ?? local.addrRoad     ?? '',
          addrSection:  addr.section  ?? local.addrSection  ?? '',
          addrLane:     addr.lane     ?? local.addrLane     ?? '',
          addrNumber:   addr.number   ?? local.addrNumber   ?? '',
        })
        localStorage.setItem('currentUser', JSON.stringify(u))
      })
      .catch(() => {
        if (!local.user_id) { navigate('/login'); return }
        setUser(local)
        setData({
          email:        local.email         ?? '',
          birthday:     local.birth_date    ?? local.birthday    ?? '',
          licenseDate:  local.license_date  ?? local.licenseDate ?? '',
          addrCity:     local.addrCity      ?? '',
          addrDistrict: local.addrDistrict  ?? '',
          addrRoad:     local.addrRoad      ?? '',
          addrSection:  local.addrSection   ?? '',
          addrLane:     local.addrLane      ?? '',
          addrNumber:   local.addrNumber    ?? '',
        })
      })

    api.get('/practice/history')
      .then(res => {
        const hist = res.data.history ?? []
        const localRecs = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
        const localMap  = Object.fromEntries(localRecs.map(r => [r.id, r]))
        const done = hist.filter(h => h.status === 'completed')
        setPracCount(done.length)
        const km = done.filter(h => h.gps_verified).reduce((s, h) => {
          const dist = localMap[h.practice_id]?.distance ?? (h.total_distance_m ? h.total_distance_m / 1000 : 0)
          return s + dist
        }, 0)
        setTotalKm(+km.toFixed(1))
      })
      .catch(() => {
        const recs = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
        const done = recs.filter(r => r.status === 'completed')
        setPracCount(done.length)
        setTotalKm(+(done.reduce((s, r) => s + (r.distance ?? 0), 0)).toFixed(1))
      })
  }, [navigate])

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarUrl(reader.result)
      localStorage.setItem('user_avatar_base64', reader.result)
    }
    reader.readAsDataURL(file)
  }

  // ── 帳戶編輯 ──
  function enterEditAccount() {
    setDraftAccount({ birthday: data.birthday, licenseDate: data.licenseDate })
    setShowPwdChange(false)
    setOldPwd(''); setNewPwd(''); setPwdError('')
    setEditAccount(true)
  }
  function cancelEditAccount() {
    setEditAccount(false)
    setShowPwdChange(false)
    setOldPwd(''); setNewPwd(''); setPwdError('')
  }
  function handleDraftAccount(e) {
    setDraftAccount(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }
  async function saveAccount() {
    setPwdError('')
    if (showPwdChange) {
      if (!oldPwd) { setPwdError('請輸入舊密碼'); return }
      if (!newPwd || newPwd.length < 4) { setPwdError('新密碼至少 4 位'); return }
    }
    try {
      await api.put('/user/profile', {
        birth_date:   draftAccount.birthday   || null,
        license_date: draftAccount.licenseDate || null,
        ...(showPwdChange && { old_password: oldPwd, new_password: newPwd }),
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = detail === 'WRONG_OLD_PASSWORD' ? '舊密碼不正確，請重試' : '儲存失敗，請稍後再試'
      setPwdError(msg)
      setPwdShake(true)
      setTimeout(() => setPwdShake(false), 450)
      return
    }
    const updated = { ...user, birth_date: draftAccount.birthday, license_date: draftAccount.licenseDate }
    localStorage.setItem('currentUser', JSON.stringify(updated))
    setUser(updated)
    setData(prev => ({ ...prev, birthday: draftAccount.birthday, licenseDate: draftAccount.licenseDate }))
    setEditAccount(false)
    setShowPwdChange(false)
    setOldPwd(''); setNewPwd('')
    setSavedAccount(true)
    setTimeout(() => setSavedAccount(false), 2500)
  }

  // ── 地址編輯 ──
  function enterEditAddress() {
    setDraftAddress({
      addrCity:     data.addrCity,
      addrDistrict: data.addrDistrict,
      addrRoad:     data.addrRoad,
      addrSection:  data.addrSection,
      addrLane:     data.addrLane,
      addrNumber:   data.addrNumber,
    })
    setEditAddress(true)
  }
  function cancelEditAddress() { setEditAddress(false) }
  function handleDraftAddress(e) {
    setDraftAddress(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }
  async function saveAddress() {
    try {
      await api.put('/user/profile', {
        address: {
          city:     draftAddress.addrCity,
          district: draftAddress.addrDistrict,
          road:     draftAddress.addrRoad,
          section:  draftAddress.addrSection,
          lane:     draftAddress.addrLane,
          number:   draftAddress.addrNumber,
        },
      })
    } catch {
      return
    }
    const updated = { ...user, ...draftAddress }
    localStorage.setItem('currentUser', JSON.stringify(updated))
    setUser(updated)
    setData(prev => ({ ...prev, ...draftAddress }))
    setEditAddress(false)
    setSavedAddress(true)
    setTimeout(() => setSavedAddress(false), 2500)
  }

  if (!user) return null

  const score   = user.score ?? 0
  const level   = getLevel(score)
  const pct     = Math.min((score / 300) * 100, 100)
  const initial = user.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="pf-page">
      <main className="pf-main">
        <button className="pf-back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> 返回首頁
        </button>

        {/* ── Hero 漸層卡 ── */}
        <div className="pf-hero">
          <div className="pf-hero-user">
            <div className="pf-avatar" onClick={() => fileInputRef.current?.click()}>
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="pf-avatar-img" />
                : <span className="pf-avatar-initial">{initial}</span>
              }
              <div className="pf-avatar-overlay">換頭貼</div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
            <div className="pf-hero-info">
              <h2 className="pf-hero-name">{user.name}</h2>
              <p className="pf-hero-email">@{user.email?.split('@')[0]}</p>
              <span className="pf-badge pf-badge-level">{level.label}</span>
            </div>
          </div>

          <div className="pf-hero-sep" />

          <div className="pf-hero-score-block">
            <div className="pf-hs-score-row">
              <span className="pf-hs-big">{score}</span>
              <span className="pf-hs-pts">PTS</span>
              <span className="pf-hs-pill">累計積分</span>
            </div>
            <div className="pf-hs-prog-track">
              <div className="pf-hs-prog-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="pf-hs-prog-labels">
              <span>{level.label}</span>
              {level.next && <span>{level.next} {level.nextScore} PTS</span>}
            </div>
          </div>

          <div className="pf-hero-sep" />

          <div className="pf-hero-stats">
            <div className="pf-hero-stat">
              <div className="pf-hs-row">
                <BookOpen size={16} className="pf-hs-icon pf-hs-teal" />
                <span className="pf-hs-num pf-hs-teal">{pracCount}<small>次</small></span>
              </div>
              <span className="pf-hs-lbl">練習次數</span>
            </div>
            <div className="pf-hero-stat">
              <div className="pf-hs-row">
                <Navigation size={16} className="pf-hs-icon pf-hs-white" />
                <span className="pf-hs-num pf-hs-white">{totalKm}<small>km</small></span>
              </div>
              <span className="pf-hs-lbl">累計里程</span>
            </div>
          </div>
        </div>

        {/* ── 資料卡 ── */}
        <div className="pf-cards">

          {/* 帳戶資料 */}
          <div className="pf-card">
            <div className="pf-card-header">
              <User size={15} />
              <span>帳戶資料</span>
              {!editAccount && (
                <button className="pf-edit-btn" onClick={enterEditAccount}>
                  <Pencil size={13} /> 編輯
                </button>
              )}
            </div>

            {editAccount ? (
              <div className="pf-fields">
                <div className="pf-field-group">
                  <label className="pf-label">EMAIL（唯讀）</label>
                  <input type="email" value={data.email} className="pf-input pf-input-disabled" readOnly />
                </div>
                <div className="pf-row2">
                  <div className="pf-field-group">
                    <label className="pf-label">生日</label>
                    <input name="birthday" type="date" value={draftAccount.birthday} onChange={handleDraftAccount} className="pf-input" />
                  </div>
                  <div className="pf-field-group">
                    <label className="pf-label">駕照取得日期</label>
                    <input name="licenseDate" type="date" value={draftAccount.licenseDate} onChange={handleDraftAccount} className="pf-input" />
                  </div>
                </div>

                {/* 密碼修改 */}
                <div className="pf-pwd-section">
                  <button type="button" className="pf-pwd-toggle"
                    onClick={() => { setShowPwdChange(v => !v); setPwdError('') }}>
                    {showPwdChange ? '▲ 取消修改密碼' : '🔒 修改密碼'}
                  </button>
                  {showPwdChange && (
                    <div className={`pf-pwd-fields${pwdShake ? ' pf-shake' : ''}`}>
                      <div className="pf-field-group">
                        <label className="pf-label">舊密碼</label>
                        <div className="pf-pwd-wrap">
                          <input type={showOld ? 'text' : 'password'} value={oldPwd}
                            onChange={e => { setOldPwd(e.target.value); setPwdError('') }}
                            className="pf-input" placeholder="輸入目前密碼" />
                          <button type="button" className="pf-eye-btn" onClick={() => setShowOld(v => !v)}>
                            {showOld ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div>
                      </div>
                      <div className="pf-field-group">
                        <label className="pf-label">新密碼</label>
                        <div className="pf-pwd-wrap">
                          <input type={showNew ? 'text' : 'password'} value={newPwd}
                            onChange={e => setNewPwd(e.target.value)}
                            className="pf-input" placeholder="輸入新密碼（至少 4 位）" />
                          <button type="button" className="pf-eye-btn" onClick={() => setShowNew(v => !v)}>
                            {showNew ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div>
                      </div>
                      {pwdError && <p className="pf-error">{pwdError}</p>}
                    </div>
                  )}
                </div>

                <div className="pf-card-actions">
                  <button type="button" className="pf-cancel-btn pf-cancel-sm" onClick={cancelEditAccount}>
                    <X size={14} /> 取消
                  </button>
                  <button type="button" className="pf-save-btn pf-save-sm" onClick={saveAccount}>
                    {savedAccount ? <><CheckCircle size={14} /> 已儲存</> : <><Save size={14} /> 儲存變更</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="pf-view-fields">
                <div className="pf-view-row">
                  <span className="pf-view-key">Email</span>
                  <span className="pf-view-val">{data.email || '—'}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">生日</span>
                  <span className="pf-view-val">{fmtDate(data.birthday)}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">駕照取得日期</span>
                  <span className="pf-view-val">{fmtDate(data.licenseDate)}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">密碼</span>
                  <span className="pf-view-val">••••••••</span>
                </div>
                {savedAccount && (
                  <div className="pf-saved-inline">
                    <CheckCircle size={13} /> 帳戶資料已儲存
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 居住地址 */}
          <div className="pf-card">
            <div className="pf-card-header">
              <MapPin size={15} />
              <span>居住地址</span>
              {!editAddress && (
                <button className="pf-edit-btn" onClick={enterEditAddress}>
                  <Pencil size={13} /> 編輯
                </button>
              )}
            </div>

            {editAddress ? (
              <div className="pf-fields">
                <div className="pf-row2">
                  <div className="pf-field-group">
                    <label className="pf-label">市 / 縣</label>
                    <input name="addrCity" type="text" value={draftAddress.addrCity} onChange={handleDraftAddress} className="pf-input" placeholder="例：台北市" />
                  </div>
                  <div className="pf-field-group">
                    <label className="pf-label">區</label>
                    <input name="addrDistrict" type="text" value={draftAddress.addrDistrict} onChange={handleDraftAddress} className="pf-input" placeholder="例：信義區" />
                  </div>
                </div>
                <div className="pf-field-group">
                  <label className="pf-label">路 / 街</label>
                  <input name="addrRoad" type="text" value={draftAddress.addrRoad} onChange={handleDraftAddress} className="pf-input" placeholder="例：忠孝東路" />
                </div>
                <div className="pf-row3">
                  <div className="pf-field-group">
                    <label className="pf-label">段</label>
                    <input name="addrSection" type="text" value={draftAddress.addrSection} onChange={handleDraftAddress} className="pf-input" placeholder="例：5" />
                  </div>
                  <div className="pf-field-group">
                    <label className="pf-label">巷</label>
                    <input name="addrLane" type="text" value={draftAddress.addrLane} onChange={handleDraftAddress} className="pf-input" placeholder="例：12" />
                  </div>
                  <div className="pf-field-group">
                    <label className="pf-label">號</label>
                    <input name="addrNumber" type="text" value={draftAddress.addrNumber} onChange={handleDraftAddress} className="pf-input" placeholder="例：3" />
                  </div>
                </div>

                <div className="pf-card-actions">
                  <button type="button" className="pf-cancel-btn pf-cancel-sm" onClick={cancelEditAddress}>
                    <X size={14} /> 取消
                  </button>
                  <button type="button" className="pf-save-btn pf-save-sm" onClick={saveAddress}>
                    {savedAddress ? <><CheckCircle size={14} /> 已儲存</> : <><Save size={14} /> 儲存變更</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="pf-view-fields">
                <div className="pf-view-row">
                  <span className="pf-view-key">市 / 縣</span>
                  <span className="pf-view-val">{data.addrCity || '—'}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">區</span>
                  <span className="pf-view-val">{data.addrDistrict || '—'}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">路 / 街</span>
                  <span className="pf-view-val">{data.addrRoad || '—'}</span>
                </div>
                <div className="pf-view-row">
                  <span className="pf-view-key">段 / 巷 / 號</span>
                  <span className="pf-view-val">
                    {[data.addrSection && `${data.addrSection}段`, data.addrLane && `${data.addrLane}巷`, data.addrNumber && `${data.addrNumber}號`].filter(Boolean).join(' ') || '—'}
                  </span>
                </div>
                {savedAddress && (
                  <div className="pf-saved-inline">
                    <CheckCircle size={13} /> 地址已儲存
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

