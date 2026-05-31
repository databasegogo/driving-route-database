import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login        from './pages/Login'
import Register     from './pages/Register'
import Dashboard    from './pages/Dashboard'
import Profile      from './pages/Profile'
import RoutePlanner from './pages/RoutePlanner'
import RouteSelect  from './pages/RouteSelect'
import RouteDetail  from './pages/RouteDetail'
import Records      from './pages/Records'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"        element={<Login />} />
        <Route path="/register"     element={<Register />} />
        <Route path="/dashboard"    element={<Dashboard />} />
        <Route path="/profile"      element={<Profile />} />
        <Route path="/records"      element={<Records />} />
        <Route path="/route"        element={<RoutePlanner />} />
        <Route path="/route-select" element={<RouteSelect />} />
        <Route path="/route-detail" element={<RouteDetail />} />
        <Route path="*"             element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
