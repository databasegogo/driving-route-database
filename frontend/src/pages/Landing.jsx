import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg  from '../assets/567.jpg'
import macBg    from '../assets/mac.jpg'
import phoneBg  from '../assets/phone.jpg'
import mapImg   from '../assets/map.jpg'
import setImg   from '../assets/set.jpg'
import levelImg from '../assets/level.jpg'
import recImg   from '../assets/record.jpg'
import '../styles/landing.css'

const FEATURES = [
  { img: mapImg,  num: '01', icon: '🛡️', tag: 'SAFETY',      title: '事故密度分析',   desc: '整合交通事故資料，自動標記高風險路段，規劃時主動繞開，讓每次練習都走最安全的路。' },
  { img: setImg,   num: '02', icon: '🗺️', tag: 'SMART ROUTE', title: '客製化路徑推薦', desc: '輸入起終點、選擇避橋避隧、設定距離與難度，系統即時生成最適合你的專屬練習路線。' },
  { img: levelImg, num: '03', icon: '⭐', tag: 'LEVEL UP',    title: '等級成就系統',   desc: '每次練習累積分數，150 分晉升一般駕駛，300 分成為熟練駕駛，逐步解鎖更高難度挑戰。' },
  { img: recImg,   num: '04', icon: '📋', tag: 'HISTORY',     title: '完整練習紀錄',   desc: '每次出行的路線、時間、得分都有完整紀錄，清楚看見自己一路以來的成長軌跡。' },
]

const STEPS = [
  { num: '01', icon: '📍', title: '設定起終點', desc: '輸入你的出發地與目的地，選擇最適合你的練習範圍' },
  { num: '02', icon: '⚙️', title: '設定偏好',  desc: '選擇避橋避隧道、設定距離長短與練習難度' },
  { num: '03', icon: '🚗', title: '出發練習',  desc: '系統即時規劃屬於你的練習路徑，累積你的駕駛自信' },
]

export default function Landing() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) navigate('/dashboard', { replace: true })
  }, [navigate])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('lp-visible') }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('.lp-reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="lp-root">

      {/* ── NAV ── */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <img src={logoImg} alt="logo" className="lp-nav-logo"/>
          <div>
            <div className="lp-nav-name">新手路徑王</div>
            <div className="lp-nav-sub">Smart Path Driving Platform</div>
          </div>
        </div>
        <button className="lp-nav-login" onClick={() => navigate('/login')}>登入</button>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero">

        {/* 全屏背景圖（桌面 mac.jpg，手機 phone.jpg） */}
        <img src={macBg}   alt="" className="lp-hero-bg lp-hero-bg--desktop" aria-hidden="true"/>
        <img src={phoneBg} alt="" className="lp-hero-bg lp-hero-bg--mobile"  aria-hidden="true"/>

        {/* 四邊柔焦漸層遮罩 */}
        <div className="lp-hero-vignette" aria-hidden="true"/>

        {/* 深色半透明標題卡（中間偏左上，路徑旁邊的空白處） */}
        <div className="lp-hero-card">
          <img src={logoImg} alt="新手路徑王" className="lp-hero-logo"/>
          <span className="lp-badge">專為新手駕駛設計</span>
          <h1 className="lp-title">新手路徑王</h1>
          <p className="lp-subtitle">
            剛拿到駕照，不知道從哪裡開始練？<br/>
            我們幫你找到適合練習的路。
          </p>
          <div className="lp-hero-btns">
            <button className="lp-cta" onClick={() => navigate('/register')}>
              立即開始體驗
              <svg className="lp-cta-arrow" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
            <button className="lp-ghost-btn" onClick={() => navigate('/login')}>
              已有帳號？登入
            </button>
          </div>
        </div>

        {/* 往下箭頭 */}
        <div className="lp-scroll-hint" aria-hidden="true">
          <svg className="lp-scroll-arrow" viewBox="0 0 28 28" fill="none">
            <path d="M 6 7 L 14 15 L 22 7"  stroke="#fff" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
            <path d="M 6 15 L 14 23 L 22 15" stroke="#ff6b35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* ── JOURNEY：功能路徑 ── */}
      <section className="lp-journey">
        <div className="lp-section-hd lp-reveal">
          <span className="lp-eyebrow">FEATURES</span>
          <h2 className="lp-section-title">為什麼選擇新手路徑王？</h2>
          <p className="lp-section-sub">四大核心功能，讓你的每次練習都有意義</p>
        </div>

        <div className="lp-track">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`lp-waypoint lp-reveal ${i % 2 === 0 ? 'lp-wp-imgL' : 'lp-wp-imgR'}`}
            >
              <div className="lp-wp-img-wrap">
                <img src={f.img} alt={f.title} className="lp-wp-img"/>
              </div>
              <div className="lp-wp-mid">
                <div className="lp-wp-line"/>
                <div className="lp-wp-node">
                  <span className="lp-wp-nodenum">{f.num}</span>
                </div>
                <div className="lp-wp-line"/>
              </div>
              <div className="lp-wp-card">
                <div className="lp-wp-tag">
                  <span className="lp-wp-icon">{f.icon}</span>
                  <span className="lp-wp-tagtext">{f.tag}</span>
                </div>
                <h3 className="lp-wp-title">{f.title}</h3>
                <div className="lp-wp-divider"/>
                <p className="lp-wp-desc">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW TO USE ── */}
      <section className="lp-howto">
        <div className="lp-section-hd lp-reveal">
          <span className="lp-eyebrow">HOW IT WORKS</span>
          <h2 className="lp-section-title">三步，輕鬆上路</h2>
          <p className="lp-section-sub">操作直觀簡單，讓你專注在練習本身</p>
        </div>

        <div className="lp-steps lp-reveal">
          {STEPS.map(s => (
            <div key={s.num} className="lp-step">
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-icon">{s.icon}</div>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="lp-final lp-reveal">
          <p className="lp-final-text">準備好了嗎？開始你的第一段安全練習路線</p>
          <button className="lp-cta" onClick={() => navigate('/register')}>
            開始我的旅程
            <svg className="lp-cta-arrow" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      </section>

    </div>
  )
}
