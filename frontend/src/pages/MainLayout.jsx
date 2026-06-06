import { useEffect, useState, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Navigation, BookOpen, User, LogOut, X } from 'lucide-react'
import logoImg from '../assets/123.jpg'

function SmartPathLogo() {
  return (
    <img
      src={logoImg}
      alt="新手路徑王 Logo"
      className="smart-path-logo-svg"
      style={{ width: '85px', height: '85px', borderRadius: '10px', objectFit: 'cover' }}
    />
  )
}

const MENU_ITEMS = [
  { icon: Navigation, label: '立即生成路徑', path: '/route' },
  { icon: BookOpen,   label: '查看練習紀錄', path: '/records' },
  { icon: User,       label: '編輯個人檔案', path: '/profile' },
]

function MainLayout() {
  const navigate  = useNavigate()
  const [username] = useState(() => {
    try {
      const stored = localStorage.getItem('currentUser')
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.name ?? parsed.username ?? 'Nina'
      }
    } catch {}
    return 'Nina'
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) navigate('/login')
  }, [navigate])

  // 點選選單外部時關閉
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('currentUser')
    setMenuOpen(false)
    navigate('/')
  }

  const handleNav = (path) => {
    setMenuOpen(false)
    navigate(path)
  }

  return (
    <div className="route-page">
      <header className="route-header">
        {/* 左側 Logo + 品牌名 */}
        <div
          className="nordic-brand"
          onClick={() => navigate('/dashboard')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0px' }}
        >
          <SmartPathLogo />
          <div className="brand-text" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', marginLeft: '-12px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#264653' }}>新手路徑王</h1>
            <span style={{ fontSize: '12px', color: '#7e8b9b', fontWeight: '500' }}>Smart Path Driving Platform</span>
          </div>
        </div>

        {/* 右側：用戶名 + 漢堡選單 */}
        <div className="nordic-user" style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }} ref={menuRef}>
          {/* 用戶頭像 + 名字 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', background: '#ff6b35', color: '#fff',
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: '800', fontSize: '13px', flexShrink: 0
            }}>
              {username[0]?.toUpperCase()}
            </div>
            <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#264653' }}>
              Hi, {username}
            </span>
          </div>

          {/* 漢堡按鈕 */}
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            style={{
              background: menuOpen ? '#f0efe9' : 'transparent',
              border: '1.5px solid',
              borderColor: menuOpen ? 'rgba(38,70,83,0.15)' : 'rgba(38,70,83,0.10)',
              borderRadius: '10px',
              color: '#264653',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '7px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background = '#f0efe9' }}
            onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent' }}
            aria-label="選單"
          >
            {menuOpen ? <X size={17} strokeWidth={2.2} /> : <Menu size={17} strokeWidth={2.2} />}
          </button>

          {/* 下拉選單 */}
          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: '220px',
              background: '#ffffff',
              borderRadius: '18px',
              boxShadow: '0 12px 40px rgba(38,70,83,0.13), 0 2px 8px rgba(38,70,83,0.07)',
              border: '1px solid rgba(38,70,83,0.07)',
              overflow: 'hidden',
              zIndex: 500,
              animation: 'menuSlideDown 0.18s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              {/* 選單主項目 */}
              <div style={{ padding: '8px' }}>
                {MENU_ITEMS.map(({ icon: Icon, label, path }) => (
                  <button
                    key={path}
                    onClick={() => handleNav(path)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '11px',
                      padding: '11px 14px', border: 'none', borderRadius: '12px',
                      background: 'transparent', color: '#264653',
                      fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#f4f3ee'
                      e.currentTarget.querySelector('.menu-icon').style.color = '#ff6b35'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.querySelector('.menu-icon').style.color = '#7e8b9b'
                    }}
                  >
                    <Icon size={16} strokeWidth={2.2} className="menu-icon" style={{ color: '#7e8b9b', flexShrink: 0, transition: 'color 0.15s' }} />
                    {label}
                  </button>
                ))}
              </div>

              {/* 分隔線 */}
              <div style={{ height: '1px', background: 'rgba(38,70,83,0.07)', margin: '0 8px' }} />

              {/* 登出按鈕 */}
              <div style={{ padding: '8px' }}>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '11px',
                    padding: '11px 14px', border: 'none', borderRadius: '12px',
                    background: 'transparent', color: '#e05a2b',
                    fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff0e9' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <LogOut size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                  登出
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="layout-main-content" style={{ width: '100%', height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
        <Outlet />
      </div>

      {/* 選單滑入動畫 */}
      <style>{`
        @keyframes menuSlideDown {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  )
}

export default MainLayout
