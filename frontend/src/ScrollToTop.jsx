import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    const el = document.querySelector('.layout-main-content')
    // 特例：路線練習頁從底部開始（讓按鈕區直接可見）
    if (pathname === '/route-detail') {
      window.scrollTo(0, document.body.scrollHeight)
      if (el) el.scrollTop = el.scrollHeight
    } else {
      window.scrollTo(0, 0)
      if (el) el.scrollTop = 0
    }
  }, [pathname])
  return null
}
