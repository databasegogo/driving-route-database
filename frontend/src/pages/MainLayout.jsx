import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react' // 👈 確保有成功引入高級登出圖示
import logoImg from '../assets/123.jpg'

// 🛣️ 官方高奢 Logo 圖片組件
function SmartPathLogo() {
  return (
    <img 
      src={logoImg} 
      alt="新手路徑王 Logo" 
      className="smart-path-logo-svg" 
      style={{
        width: '85px',
        height: '85px',
        borderRadius: '10px',
        objectFit: 'cover'
      }}
    />
  )
}

function MainLayout() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('Nina')

  useEffect(() => {
    // 🔒 安全驗證：如果沒有 Token 證明登入過，直接無情踢回登入頁
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    const storedUser = localStorage.getItem('currentUser')
    if (storedUser) {
      const parsed = JSON.parse(storedUser)
      if (parsed.name) setUsername(parsed.name)
    }
  }, [navigate])

  // 🚪 滿血回歸的登出核心機制！
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('currentUser')
    navigate('/login') // 👈 完美被踢回登入頁
  }

  return (
    <div className="route-page">
      {/* 🧭 全站唯一的頂部 Navbar 外殼 */}
      <header className="route-header">
        <div className="nordic-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0px' }}>
          <SmartPathLogo />
          <div className="brand-text" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', marginLeft: '-12px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#264653' }}>新手路徑王</h1>
            <span style={{ fontSize: '12px', color: '#7e8b9b', fontWeight: '500' }}>Smart Path Driving Platform</span>
          </div>
        </div>

        {/* 👤 右側使用者卡片區塊：補齊登出小開關 */}
        <div className="nordic-user" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="user-avatar-initial" style={{ width: '24px', height: '24px', background: '#ff6b35', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.8rem' }}>
            {username[0]?.toUpperCase()}
          </div>
          <span className="user-welcome-name" style={{ fontWeight: '700', fontSize: '0.85rem', color: '#264653' }}>
            Hi, {username}
          </span>
          
          {/* 💡 完美回歸：綁定點擊事件的極簡高奢登出小按鈕 */}
          <button 
            className="logout-minimal-btn" 
            onClick={handleLogout}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#b0bac5', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              padding: '4px',
              transition: 'color 0.2s' 
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e76f51'} // 滑鼠移上去變質感的珊瑚橘紅色
            onMouseLeave={(e) => e.currentTarget.style.color = '#b0bac5'}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* 🎯 子頁面內容動態渲染區 */}
      <div className="layout-main-content" style={{ width: '100%', height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}

export default MainLayout