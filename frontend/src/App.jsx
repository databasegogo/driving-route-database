import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScrollToTop  from './ScrollToTop'
import Landing      from './pages/Landing'
import Login        from './pages/Login'
import Register     from './pages/Register'
import Dashboard    from './pages/Dashboard'
import Profile      from './pages/Profile'
import RoutePlanner from './pages/RoutePlanner'
import RouteSelect  from './pages/RouteSelect'
import RouteDetail  from './pages/RouteDetail'
import Records      from './pages/Records'
import MainLayout   from './pages/MainLayout'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <Routes>
        {/* 首頁：Landing Page（未登入看到的第一個畫面） */}
        <Route path="/"         element={<Landing />} />

        {/* 不需要頂部 Navbar 的獨立頁面 */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 所有需要頂部 Navbar 的頁面，塞進 MainLayout */}
        <Route element={<MainLayout />}>
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/records"      element={<Records />} />
          <Route path="/route"        element={<RoutePlanner />} />
          <Route path="/route-select" element={<RouteSelect />} />
          <Route path="/route-detail" element={<RouteDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App