import { useLocation, useNavigate } from 'react-router-dom'
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

// 座標陣列 → SVG path 字串
function toSVG(coords, w = 160, h = 72, pad = 12) {
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

function RouteCard({ route, label, start, end, difficulty, onSelect }) {
  const coords = extractCoords(route.segments)
  const svg    = toSVG(coords)
  const distKm = +(route.total_distance_m / 1000).toFixed(2)
  const timeMin = Math.ceil(route.estimated_duration_sec / 60)

  return (
    <button className="route-card" onClick={onSelect}>
      <div className="rc-top">
        <span className="rc-label">路線 {label}</span>
        <span className="rc-diff">{'⭐'.repeat(difficulty)}</span>
      </div>

      <div className="rc-preview">
        {svg ? (
          <svg viewBox="0 0 160 72" width="100%" height="72" preserveAspectRatio="none">
            <rect width="160" height="72" fill="#f0f4ff" />
            <path d={svg.path} fill="none" stroke="#4f7cff" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={svg.start.x} cy={svg.start.y} r="5" fill="#2e7d32" stroke="#fff" strokeWidth="1.5" />
            <circle cx={svg.end.x}   cy={svg.end.y}   r="5" fill="#c62828" stroke="#fff" strokeWidth="1.5" />
          </svg>
        ) : (
          <div style={{ height: 72, display:'flex', alignItems:'center', justifyContent:'center',
            background:'#f0f4ff', fontSize:12, color:'#888' }}>載入中…</div>
        )}
      </div>

      <div className="rc-name">{start} — {end}</div>
      <div className="rc-stats">
        <span>📏 {distKm} km</span>
        <span>⏱ {timeMin} 分</span>
        <span>🎯 +{route.estimated_score} 分</span>
      </div>
    </button>
  )
}

function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.routes) { navigate('/route'); return null }

  const { routes, prefs } = state
  const { start, end, startCoord, endCoord, bridge, tunnel, maxDist, difficulty } = prefs

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
          {bridge ? '　🌉 含橋樑' : ''}
          {tunnel ? '　🚇 含隧道' : ''}
        </div>

        {routes.length === 0 ? (
          <div className="no-routes">
            <p>目前沒有符合條件的路線，請調整設定。</p>
            <button className="generate-btn" onClick={() => navigate('/route')}>重新設定</button>
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
    </div>
  )
}

export default RouteSelect
