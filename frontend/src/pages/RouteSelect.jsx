import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Milestone, Clock, Zap, Star, AlertTriangle } from 'lucide-react' // 👈 額外導入 AlertTriangle 作為高質感警告圖示
import '../styles/route.css'

const DIFF_CODE  = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }
const DIFF_LABEL = { 1: '新手', 2: '一般', 3: '熟練' }

// GeoJSON FeatureCollection → [[lat, lng], ...] 座標陣列
function extractCoords(segments) {
  if (!segments?.features) return []
  const coords = []
  for (const feature of segments.features) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === 'LineString') {
      for (const [lng, lat] of geom.coordinates) coords.push([lat, lng])
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates)
        for (const [lng, lat] of line) coords.push([lat, lng])
    }
  }
  return coords
}

// 座標陣列 → SVG path 字串 (鎖定妳最精準的 w=160, h=76)
function toSVG(coords, w = 160, h = 76, pad = 14) {
  if (!coords.length) return null
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

// 🌿 完美合併版路線小卡片組件
function RouteCard({ route, label, start, end, difficulty, onSelect }) {
  const coords = extractCoords(route.segments)
  const svg    = toSVG(coords)
  const distKm = +(route.total_distance_m / 1000).toFixed(2)
  const timeMin = Math.ceil(route.estimated_duration_sec / 60)

  return (
    <div className="route-card" onClick={onSelect}>
      <div className="rc-top">
        <span className="rc-label">推薦路線 {label}</span>
        <div className="star-row">
          {Array.from({ length: difficulty }).map((_, i) => (
            <Star key={i} size={13} className="star-btn on" style={{ cursor: 'default' }} />
          ))}
        </div>
      </div>

      <div className="rc-preview">
        {svg ? (
          <svg viewBox="0 0 160 76" width="100%" height="76" preserveAspectRatio="none">
            <rect width="160" height="76" fill="#f8fafc" />
            <path d={svg.path} fill="none" stroke="#264653" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            <circle cx={svg.start.x} cy={svg.start.y} r="4" fill="#ff6b35" stroke="#fff" strokeWidth="1.2" />
            <circle cx={svg.end.x}   cy={svg.end.y}   r="4" fill="#1d3557" stroke="#fff" strokeWidth="1.2" />
          </svg>
        ) : (
          <div className="rc-map-loading">分析中…</div>
        )}
      </div>

      <div className="rc-name">{start} — {end}</div>
      
      <div className="rc-stats">
        <span><Milestone size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /><strong>{distKm}</strong> km</span>
        <span><Clock size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /><strong>{timeMin}</strong> 分</span>
        <span className="score-val"><Zap size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /><strong>+{route.estimated_score}</strong> 積分</span>
      </div>

      {/* 🤝 縫合亮點：完美保留朋友新寫的「強制限放替代路線警告」，並套上妳的高級排版樣式 */}
      {route.constraint_relaxed && (
        <div className="rc-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '8px 12px', background: 'rgba(231, 111, 81, 0.06)', borderRadius: '8px', color: '#e76f51', fontSize: '12px', fontWeight: '600' }}>
          <AlertTriangle size={13} />
          <span>此路線含 {route.has_bridge ? '橋樑 ' : ''}{route.has_tunnel ? '隧道 ' : ''}(無替代路線)</span>
        </div>
      )}
    </div>
  )
}

// 🧭 主要的路線選擇主頁面
function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.routes) { navigate('/route'); return null }

  const { routes, prefs } = state
  const { start, end, startCoord, endCoord, bridge, tunnel, maxDist, difficulty } = prefs

  return (
    <>
      <main className="route-main">
        {/* ⚡ 頂部控制列：保留妳美觀的 Cockpit 控制列 */}
        <div className="cockpit-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <button className="back-btn" onClick={() => navigate('/route')}>
            <ArrowLeft size={14} />
            <span>重新設定條件</span>
          </button>
          <span className="route-title-pills" style={{ fontSize: '15px', fontWeight: '800', color: '#264653', background: '#f1f5f9', padding: '6px 16px', borderRadius: '30px', letterSpacing: '0.3px' }}>
            🧭 選擇今日練習路徑
          </span>
          <span style={{ width: '120px' }} />
        </div>

        {/* 🤝 縫合亮點：完美相容朋友新寫的「不限距離」與「避橋/避隧道」文字顯示 */}
        <div className="pref-summary">
          {start} → {end}　
          <span style={{ color: '#264653', fontWeight: '700' }}>
            {maxDist ? `${maxDist} km 以內` : '不限距離'}
          </span>
          {bridge ? '　橋樑避開 🌉' : ''}
          {tunnel ? '　隧道避開 🚇' : ''}
        </div>

        {routes.length === 0 ? (
          <div className="no-routes">
            <p>目前沒有符合條件的路線，請調整設定。</p>
            <button className="generate-btn" onClick={() => navigate('/route')}>重新設定條件</button>
          </div>
        ) : (
          <div className="route-cards">
            {routes.map((r, idx) => (
              <RouteCard
                key={r.route_id}
                route={r}
                label={String.fromCharCode(65 + idx)}  // A, B, C
                start={start}
                end={end}
                difficulty={difficulty}
                onSelect={() => navigate('/route-detail', {
                  state: {
                    route: {
                      route_id:       r.route_id,
                      start,          end,
                      startCoord,     endCoord,
                      distanceM:      r.total_distance_m,
                      distance:       +(r.total_distance_m / 1000).toFixed(2),
                      time:           Math.ceil(r.estimated_duration_sec / 60),
                      difficulty,
                      diffCode:       DIFF_CODE[difficulty],
                      estimatedScore: r.estimated_score,
                      segments:       r.segments,
                    },
                    prefs,
                  }
                })}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

export default RouteSelect