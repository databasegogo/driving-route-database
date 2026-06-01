import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, MapPin, User, Shield } from 'lucide-react'
import api from '../api'
import '../styles/dashboard.css'

// 🛠️ 1. 修改分數閾值：0 ➔ 150 ➔ 300
const LEVEL_MAP = {
  BEGINNER:   { label: '新手駕駛', level: 'LEVEL 1', color: '#ff6b35', bg: '#fff0e6', nextScore: 150,  prevScore: 0 },
  NORMAL:     { label: '一般駕駛', level: 'LEVEL 2', color: '#2a9d8f', bg: '#e6f4f2' },
  EXPERIENCED:{ label: '熟練駕駛', level: 'LEVEL 3', color: '#e76f51', bg: '#fdf0ed', nextScore: 1000, prevScore: 300 },
}

function getLevel(user) {
  if (user?.level_code && LEVEL_MAP[user.level_code]) return LEVEL_MAP[user.level_code]
  const score = user?.score ?? 0
  if (score >= 300) return LEVEL_MAP.EXPERIENCED  // 👈 改為 300 分熟練
  if (score >= 150) return LEVEL_MAP.NORMAL       // 👈 改為 150 分一般
  return LEVEL_MAP.BEGINNER
}

const CARDS = [
  { icon: <History size={22} />, label: '查看練習紀錄', desc: '追蹤你的行車數據與歷程', to: '/records', activeColor: '#3b82f6', tileClass: 'tile-blue' },
  { icon: <MapPin size={22} />, label: '生成練習路徑', desc: '規劃專屬的安全練習路線', to: '/route', activeColor: '#ff6b35', tileClass: 'tile-orange' }, 
  { icon: <User size={22} />, label: '編輯個人檔案', desc: '管理個人設定與帳號紀錄', to: '/profile', activeColor: '#2a9d8f', tileClass: 'tile-green' },
]

function CartoonCar() {
  return (
    <div className="cartoon-eco-car">
      <svg viewBox="0 0 70 42" width="62" height="38" xmlns="http://www.w3.org/2000/svg">
        <path d="M 10 26 Q 6 26 8 19 L 14 11 Q 19 4 32 4 L 46 4 Q 56 4 60 11 L 64 19 Q 66 26 62 26 Z" fill="#ff6b35" />
        <path d="M 25 6 L 44 6 Q 52 6 55 11 L 58 17 L 16 17 Z" fill="#264653" />
        <path d="M 27 8 L 38 8 L 40 15 L 21 15 Z" fill="#ffffff" opacity="0.35" />
        <path d="M 41 8 L 49 8 L 54 15 L 42 15 Z" fill="#ffffff" opacity="0.35" />
        <circle cx="64" cy="18" r="3.5" fill="#fef08a" />
        <circle cx="21" cy="27" r="7.5" fill="#1e293b" stroke="#ffffff" strokeWidth="2.5" />
        <circle cx="21" cy="27" r="3" fill="#cbd5e1" />
        <circle cx="49" cy="27" r="7.5" fill="#1e293b" stroke="#ffffff" strokeWidth="2.5" />
        <circle cx="49" cy="27" r="3" fill="#cbd5e1" />
      </svg>
    </div>
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
        const user = {
          user_id:   data.user_id,
          name:      data.username,
          email:     data.email,
          score:     data.total_score || 0,
          level_code: data.level_code,
        }
        setUser(user)
        localStorage.setItem('currentUser', JSON.stringify(user))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('currentUser')
        navigate('/login')
      })
  }, [navigate])

  if (!user) return null

  const level = getLevel(user)
  
  // 🛠️ 2. 修改進度條分母區間計算邏輯（動態對應 0-150 或 150-300）
  let nextBound = 150
  let prevBound = 0
  if (user.score >= 300) {
    nextBound = 1000 
    prevBound = 300
  } else if (user.score >= 150) {
    nextBound = 300
    prevBound = 150
  }

  const range = nextBound - prevBound
  const currentProgress = user.score - prevBound
  const progressPercent = Math.min(Math.max((currentProgress / range) * 100, 0), 100)

  // 🛠️ 3. 車子視覺位置向右微調校正：起點從 8 改為 13
  const startX = 13; 
  const endX = 86;   
  const actualCarLeft = startX + (progressPercent / 100) * (endX - startX);

  return (
    <> {/* 💡 核心修正：改為空標籤，拔除原本重複的包裹與內建 <header> 導航 */}
      <main className="nordic-grid-layout">
        <section className="nordic-main-card user-status-panel">
          <div className="status-header">
            <span className="level-badge-pill" style={{ backgroundColor: level.bg, color: level.color }}>
              {level.level}
            </span>
            <h2>駕駛等級：<strong>{level.label}</strong></h2>
            <p className="subtitle-gray">歡迎回來，今天也是適合練習開車的好日子！</p>
          </div>

          <div className="nordic-score-widget">
            <div className="outer-soft-ring">
              <span className="big-score-digits">{(user.score).toLocaleString()}</span>
              <span className="score-lbl-text">CURRENT SCORE</span>
            </div>
          </div>
        </section>

        <section className="nordic-main-card road-track-panel">
          <div className="track-header-row">
            <div className="track-dot-icon" />
            <span>等級晉升路徑</span>
          </div>

          <div className="nordic-map-canvas">
            <svg className="natural-roads-background" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
              <path d="M 0 40 Q 150 180 300 40 T 600 120" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" opacity="0.4" />
              <path d="M 100 0 Q 250 120 400 0" fill="none" stroke="#e2e8f0" strokeWidth="4" opacity="0.3" />
              <path d="M 500 200 L 550 0" fill="none" stroke="#e2e8f0" strokeWidth="6" opacity="0.2" />
            </svg>

            <div className="s-highway-container">
              <svg viewBox="0 0 500 60" className="s-curve-road-svg" xmlns="http://www.w3.org/2000/svg">
                <path d="M 15 30 Q 135 70 250 30 T 485 30" fill="none" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" />
                <path d="M 15 30 Q 135 70 250 30 T 485 30" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="6,6" strokeLinecap="round" />
              </svg>

              <div 
                className="curved-car-carrier" 
                style={{ 
                  left: `${actualCarLeft}%`,
                  top: `calc(50% + ${carYOffset(progressPercent) + 6}px)`
                }}
              >
                <CartoonCar />
              </div>

              {/* 🎯 4. 變更卡片上的文字顯示：0 ➔ 150 ➔ 300 */}
              <div className="scenic-landmarks-flipped">
                <div className={`landmark-node-top ${user.score >= 0 && user.score < 150 ? 'active-beginner' : ''}`} style={{ left: '13%' }}>
                  <div className="node-popover-bubble-top">
                    <span className="popover-title">新手駕駛</span>
                    <span className="popover-pts">0 PTS</span>
                  </div>
                  <span className="node-marker-dot-top"></span>
                </div>
                
                <div className={`landmark-node-top ${user.score >= 150 && user.score < 300 ? 'active-normal' : ''}`} style={{ left: '50%' }}>
                  <div className="node-popover-bubble-top">
                    <span className="popover-title">一般駕駛</span>
                    <span className="popover-pts">150 PTS</span>
                  </div>
                  <span className="node-marker-dot-top"></span>
                </div>
                
                <div className={`landmark-node-top ${user.score >= 300 ? 'active-experienced' : ''}`} style={{ left: '86%' }}>
                  <div className="node-popover-bubble-top">
                    <span className="popover-title">熟練駕駛</span>
                    <span className="popover-pts">300 PTS</span>
                  </div>
                  <span className="node-marker-dot-top"></span>
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className="nordic-action-section">
          {CARDS.map(card => (
            <div 
              key={card.label} 
              className={`action-tile-card ${card.tileClass}`} 
              onClick={() => navigate(card.to)}
              style={{ '--hover-line-c': card.activeColor }}
            >
              <div className="tile-icon-box">{card.icon}</div>
              <div className="tile-info">
                <h4>{card.label}</h4>
                {/* 💡 核心修正：將說明字大膽調大到 15px 行內最高權限，確保完全放大不被壓制 */}
                <p style={{ fontSize: '15px', color: '#64748b', marginTop: '6px' }}>
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </section>

      </main>
    </>
  )
}

function carYOffset(percent) {
  return Math.sin((percent / 100) * Math.PI * 2) * 11;
}

export default Dashboard