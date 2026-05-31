import { useLocation, useNavigate } from 'react-router-dom'
import '../styles/route.css'

// 5 path shapes: offsets applied to linearly-interpolated waypoints
const PATTERNS = [
  { id: 1, label: 'A', difficulty: 1, hasBridge: false, hasTunnel: false, mult: 1.15,
    offsets: [[0.003, 0.004], [0.002, 0.009]] },
  { id: 2, label: 'B', difficulty: 2, hasBridge: true,  hasTunnel: false, mult: 1.45,
    offsets: [[0.010, 0.003], [0.014, 0.012], [0.008, 0.020]] },
  { id: 3, label: 'C', difficulty: 1, hasBridge: false, hasTunnel: false, mult: 1.28,
    offsets: [[-0.006, 0.006], [-0.008, 0.016], [-0.003, 0.024]] },
  { id: 4, label: 'D', difficulty: 3, hasBridge: true,  hasTunnel: true,  mult: 1.80,
    offsets: [[0.006,0.004],[0.011,0.009],[0.004,0.015],[-0.003,0.020],[0.005,0.026]] },
  { id: 5, label: 'E', difficulty: 2, hasBridge: false, hasTunnel: true,  mult: 1.38,
    offsets: [[0.003,0.007],[-0.004,0.015],[0.005,0.023]] },
]

function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function buildCoords(startC, endC, offsets) {
  const n = offsets.length + 1
  const coords = [startC]
  offsets.forEach((off, i) => {
    const t = (i + 1) / n
    coords.push([
      startC[0] + (endC[0] - startC[0]) * t + off[0],
      startC[1] + (endC[1] - startC[1]) * t + off[1],
    ])
  })
  coords.push(endC)
  return coords
}

function routeDistance(coords) {
  let d = 0
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i-1], coords[i])
  return Math.round(d * 10) / 10
}

function toSVG(coords, w = 160, h = 72, pad = 12) {
  const lats = coords.map(c => c[0])
  const lngs = coords.map(c => c[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const lr  = maxLat - minLat || 0.001
  const lgr = maxLng - minLng || 0.001
  const pts = coords.map(([lat, lng]) => ({
    x: pad + ((lng - minLng) / lgr) * (w - pad * 2),
    y: (h - pad) - ((lat - minLat) / lr) * (h - pad * 2),
  }))
  return {
    path:  'M' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L'),
    start: pts[0],
    end:   pts[pts.length - 1],
  }
}

function RouteCard({ route, onClick }) {
  const { path, start, end } = toSVG(route.coords)
  return (
    <button className="route-card" onClick={onClick}>
      <div className="rc-top">
        <span className="rc-label">路線 {route.label}</span>
        <span className="rc-diff">{'⭐'.repeat(route.difficulty)}</span>
      </div>
      <div className="rc-preview">
        <svg viewBox="0 0 160 72" width="100%" height="72" preserveAspectRatio="none">
          <rect width="160" height="72" fill="#f0f4ff" />
          <path d={path} fill="none" stroke="#4f7cff" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={start.x} cy={start.y} r="5" fill="#2e7d32" stroke="#fff" strokeWidth="1.5" />
          <circle cx={end.x}   cy={end.y}   r="5" fill="#c62828" stroke="#fff" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="rc-name">{route.start} — {route.end}</div>
      <div className="rc-stats">
        <span>📏 {route.distance} km</span>
        <span>⏱ {route.time} 分</span>
        {route.hasBridge && <span>🌉</span>}
        {route.hasTunnel && <span>🚇</span>}
      </div>
    </button>
  )
}

function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.startCoord) { navigate('/route'); return null }

  const { start, end, startCoord, endCoord, bridge, tunnel, maxDist, difficulty } = state

  // Build all 5 routes from real geocoded coords
  let routes = PATTERNS.map(p => {
    const coords   = buildCoords(startCoord, endCoord, p.offsets)
    const distance = routeDistance(coords)
    const time     = Math.round(distance * 4.4)
    return { ...p, start, end, startCoord, endCoord, coords, distance, time }
  })

  // Filter by hard constraints
  routes = routes.filter(r => r.distance <= maxDist && r.difficulty <= difficulty)

  // Prefer bridge/tunnel preference if enough results
  if (bridge || tunnel) {
    const preferred = routes.filter(r =>
      (!bridge || r.hasBridge) && (!tunnel || r.hasTunnel)
    )
    if (preferred.length >= 2) routes = preferred
  }

  return (
    <div className="route-page">
      <header className="route-header">
        <button className="back-btn" onClick={() => navigate('/route')}>← 返回</button>
        <span className="route-title">選擇今日練習路徑</span>
        <span />
      </header>

      <main className="route-main">
        <div className="pref-summary">
          {start} → {end}　{maxDist} km 以內　{'⭐'.repeat(difficulty)}
          {bridge ? '　🌉 含橋樑' : ''}{tunnel ? '　🚇 含隧道' : ''}
        </div>

        {routes.length === 0 ? (
          <div className="no-routes">
            <p>目前沒有符合條件的路線，請調整設定。</p>
            <button className="generate-btn" onClick={() => navigate('/route')}>重新設定</button>
          </div>
        ) : (
          <div className="route-cards">
            {routes.map(r => (
              <RouteCard
                key={r.id}
                route={r}
                onClick={() => navigate('/route-detail', { state: { route: r, prefs: state } })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default RouteSelect
