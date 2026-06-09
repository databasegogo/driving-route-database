import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * 換頁時自動捲動到頂端（或特定位置）。
 * 放在 <BrowserRouter> 內、<Routes> 之前。
 */
function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    const isRouteDetail = pathname === '/route-detail'

    // 捲動 window 本身
    if (isRouteDetail) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }

    // 捲動 MainLayout 的主內容區（有 overflow-y: auto 的容器）
    const mainContent = document.querySelector('.layout-main-content')
    if (mainContent) {
      if (isRouteDetail) {
        mainContent.scrollTop = mainContent.scrollHeight
      } else {
        mainContent.scrollTop = 0
      }
    }
  }, [pathname])

  return null
}

export default ScrollToTop
