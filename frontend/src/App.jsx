import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
    <BrowserRouter>
      <Routes>
        {/* 🔒 1. 不需要頂部 Navbar 的獨立頁面（留在外殼外面） */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 🧭 2. 所有需要「新Logo + 頂部標題」的頁面，全部塞進 MainLayout 裡面 */}
        <Route element={<MainLayout />}>
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/records"      element={<Records />} />
          <Route path="/route"        element={<RoutePlanner />} />
          <Route path="/route-select" element={<RouteSelect />} />
          <Route path="/route-detail" element={<RouteDetail />} />
        </Route>

        {/* 🚀 3. 如果輸入任何不對的網址，自動萬流歸宗導回主控台 /dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App