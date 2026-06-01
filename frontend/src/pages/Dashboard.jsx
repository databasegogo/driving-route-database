import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import '../styles/dashboard.css'

const LEVEL_MAP = {
  BEGINNER:   { label: '新手駕駛', en: 'Beginner',    stars: 1, color: '#1e3a5f' },
  NORMAL:     { label: '一般駕駛', en: 'Normal',      stars: 2, color: '#2b4a6b' },
  EXPERIENCED:{ label: '熟練駕駛', en: 'Experienced', stars: 3, color: '#1a3a5c' },
}

function getLevel(user) {
  if (user?.level_code && LEVEL_MAP[user.level_code]) return LEVEL_MAP[user.level_code]
  const score = user?.score ?? 0
  if (score >= 2000) return LEVEL_MAP.EXPERIENCED
  if (score >= 500)  return LEVEL_MAP.NORMAL
  return LEVEL_MAP.BEGINNER
}

const CARDS = [
  { icon: '📋', label: '查看練習紀錄', to: '/records' },
  { icon: '🗺️', label: '生成練習路徑', to: '/route' },
  { icon: '👤', label: '編輯個人檔案', to: '/profile' },
]

function CarRight() {
  return (
    <svg viewBox="0 0 64 32" width="38" height="19" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="14" width="52" height="13" rx="4" fill="#3b6fd4" />
      <path d="M10 14 L18 5 Q20 3 23 3 L41 3 Q44 3 46 5 L54 14 Z" fill="#4f7cff" />
      <rect x="20" y="5" width="10" height="8" rx="1" fill="#a8d0f5" opacity="0.85" />
      <rect x="33" y="5" width="10" height="8" rx="1" fill="#a8d0f5" opacity="0.85" />
      <circle cx="16" cy="27" r="5" fill="#1a1a2e" />
      <circle cx="16" cy="27" r="2.5" fill="#8ab4f8" />
      <circle cx="48" cy="27" r="5" fill="#1a1a2e" />
      <circle cx="48" cy="27" r="2.5" fill="#8ab4f8" />
      <rect x="54" y="17" width="6" height="3" rx="1" fill="#fff9a0" opacity="0.9" />
    </svg>
  )
}

function Stars({ count }) {
  return (
    <span className="stars">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={i < count ? 'star filled' : 'star'}>★</span>
      ))}
    </span>
  )
}

function Dashboard() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    api.get('/user/me')
      .then(res => {
        const data = res.data
        // 把後端回傳的資料整理成前端用的格式
        const user = {
          user_id:   data.user_id,
          name:      data.username,
          email:     data.email,
          score:     data.total_score,
          level_code: data.level_code,   // BEGINNER / NORMAL / EXPERIENCED
        }
        setUser(user)
        localStorage.setItem('currentUser', JSON.stringify(user))
      })
      .catch(() => {
        // token 無效，導回登入
        localStorage.removeItem('token')
        localStorage.removeItem('currentUser')
        navigate('/login')
      })
  }, [navigate])

  if (!user) return null

  const level = getLevel(user)

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('currentUser')
    navigate('/login')
  }

  return (
    <div className="dashboard">
      <header className="dash-header">
        <span className="dash-logo">🚗 駕駛路徑資料庫</span>
        <div className="dash-header-right">
          <span className="dash-username">{user.name}</span>
          <button className="logout-btn" onClick={handleLogout}>登出</button>
        </div>
      </header>

      <main className="dash-main">
        {/* 等級區塊 */}
        <section className="level-section">
          <div className="level-road">
            {[
              { label: '新手駕駛', en: 'Beginner',    stars: 1, min: 0    },
              { label: '一般駕駛', en: 'Normal',      stars: 2, min: 500  },
              { label: '熟練駕駛', en: 'Experienced', stars: 3, min: 2000 },
            ].map((lv, i) => (
              <div key={i} className={`level-item ${level.en === lv.en ? 'active' : ''}`}>
                <div className="level-badge">
                  <strong>{lv.label}</strong>
                  <span className="level-en">{lv.en}</span>
                </div>
                <Stars count={lv.stars} />
                <div className={`level-dot ${level.en === lv.en ? 'is-current' : ''}`}>
                  {level.en === lv.en ? <CarRight /> : ''}
                </div>
              </div>
            ))}
            <div className="road-line" />
          </div>

          <div className="score-display">
            <span>我的分數：</span>
            <strong>{(user.score ?? 0).toLocaleString()}</strong>
            <span className="level-tag" style={{ background: level.color }}>
              {level.label}
            </span>
          </div>
        </section>

        {/* 功能卡片 */}
        <section className="cards-section">
          {CARDS.map(card => (
            <button
              key={card.label}
              className="dash-card"
              onClick={() => navigate(card.to)}
            >
              <span className="card-icon">{card.icon}</span>
              <span className="card-label">{card.label}</span>
            </button>
          ))}
        </section>
      </main>
    </div>
  )
}

export default Dashboard
