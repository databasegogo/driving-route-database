import { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Milestone, Clock, Zap, Star, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import '../styles/route.css'

const DIFF_CODE  = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }
const DIFF_LABEL = { 1: '新手', 2: '一般', 3: '熟練' }

// GeoJSON FeatureCollection → 每個路段各自的座標陣列 [[lat,lng], ...][]
function extractSegments(segments) {
  if (!segments?.features) return []
  return segments.features
    .map(f => {
      const geom = f.geometry
      if (!geom) return []
      if (geom.type === 'LineString')
        return geom.coordinates.map(([lng, lat]) => [lat, lng])
      if (geom.type === 'MultiLineString')
        return geom.coordinates.flat().map(([lng, lat]) => [lat, lng])
      return []
    })
    .filter(s => s.length > 0)
}

// 各路段分開畫 → 不連接段落間的空隙
function toSVG(segList, w = 320, h = 180, pad = 20) {
  const allCoords = segList.flat()
  if (!allCoords.length) return null

  const lats = allCoords.map(c => c[0])
  const lngs = allCoords.map(c => c[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const lr  = maxLat - minLat || 0.001
  const lgr = maxLng - minLng || 0.001

  function toXY([lat, lng]) {
    return {
      x: +(pad + ((lng - minLng) / lgr) * (w - pad * 2)).toFixed(1),
      y: +((h - pad) - ((lat - minLat) / lr) * (h - pad * 2)).toFixed(1),
    }
  }

  const paths = segList.map(seg => {
    const pts = seg.map(toXY)
    return 'M' + pts.map(p => `${p.x},${p.y}`).join(' L')
  })

  const start = toXY(segList[0][0])
  const last  = segList[segList.length - 1]
  const end   = toXY(last[last.length - 1])

  return { paths, start, end }
}

// 🌿 完美合併版路線小卡片組件
function RouteCard({ route, label, start, end, difficulty, onSelect }) {
  const segs    = extractSegments(route.segments)
  const svg     = toSVG(segs, 160, 76, 10)
  const distKm  = +(route.total_distance_m / 1000).toFixed(2)
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
          <svg viewBox="0 0 160 76" width="100%" height="76" preserveAspectRatio="xMidYMid meet">
            <rect width="160" height="76" fill="#f8fafc" />
            {svg.paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#264653" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            ))}
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
  const [active, setActive]     = useState(0)
  const touchStartX             = useRef(null)

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) {
      if (diff > 0) setActive(i => Math.min(routes?.length - 1 ?? 0, i + 1))
      else          setActive(i => Math.max(0, i - 1))
    }
    touchStartX.current = null
  }

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
          <div className="route-slider-wrap">
            {/* 左右箭頭 */}
            <button className="carousel-arrow left"
              onClick={() => setActive(i => Math.max(0, i - 1))}
              disabled={active === 0}>
              <ChevronLeft size={22} />
            </button>
            <button className="carousel-arrow right"
              onClick={() => setActive(i => Math.min(routes.length - 1, i + 1))}
              disabled={active === routes.length - 1}>
              <ChevronRight size={22} />
            </button>

            <div className="route-slider"
              style={{ transform: `translateX(calc(-${active * 100}% - ${active * 20}px))` }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}>
              {routes.map((r, idx) => {
                const segs2   = extractSegments(r.segments)
                const svg     = toSVG(segs2, 320, 180, 20)
                const distKm  = +(r.total_distance_m / 1000).toFixed(2)
                const timeMin = Math.ceil(r.estimated_duration_sec / 60)
                const label   = String.fromCharCode(65 + idx)

                return (
                  <div key={r.route_id}
                    className={`route-slide-card ${idx === active ? 'is-active' : 'is-side'}`}
                    onClick={() => idx !== active && setActive(idx)}>
                    {/* 上半：路線預覽地圖 */}
                    <div className="slide-map-preview">
                      <div className="slide-label-badge">路線 {label}</div>
                      {svg ? (
                        <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
                          <rect width="320" height="180" fill="#eef2f7" />
                          {/* 格線裝飾 */}
                          {[40,80,120,160].map(y => <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#dde3ec" strokeWidth="0.5" />)}
                          {[80,160,240].map(x => <line key={x} x1={x} y1="0" x2={x} y2="180" stroke="#dde3ec" strokeWidth="0.5" />)}
                          {svg.paths.map((d, i) => (
                            <path key={i} d={d} fill="none" stroke="#264653" strokeWidth="3.5"
                              strokeLinecap="round" strokeLinejoin="round" />
                          ))}
                          <circle cx={svg.start.x} cy={svg.start.y} r="7" fill="#ff6b35" stroke="#fff" strokeWidth="2" />
                          <circle cx={svg.end.x}   cy={svg.end.y}   r="7" fill="#1d3557" stroke="#fff" strokeWidth="2" />
                          <text x={svg.start.x + 10} y={svg.start.y + 4} fontSize="10" fill="#ff6b35" fontWeight="700">起</text>
                          <text x={svg.end.x + 10}   y={svg.end.y + 4}   fontSize="10" fill="#1d3557" fontWeight="700">終</text>
                        </svg>
                      ) : (
                        <div className="slide-map-loading">載入中…</div>
                      )}
                    </div>

                    {/* 下半：資訊 */}
                    <div className="slide-info">
                      <div className="slide-route-name">{start} → {end}</div>
                      <div className="slide-stars">
                        {Array.from({ length: difficulty }).map((_, i) => (
                          <Star key={i} size={14} style={{ fill: '#fbbf24', stroke: '#fbbf24' }} />
                        ))}
                        <span className="slide-diff-label">{DIFF_LABEL[difficulty]}駕駛</span>
                      </div>
                      <div className="slide-stats">
                        <div className="slide-stat">
                          <Milestone size={16} />
                          <span>{distKm} km</span>
                        </div>
                        <div className="slide-stat">
                          <Clock size={16} />
                          <span>{timeMin} 分鐘</span>
                        </div>
                        <div className="slide-stat score">
                          <Zap size={16} />
                          <span>+{r.estimated_score} 分</span>
                        </div>
                      </div>
                      {r.constraint_relaxed && (
                        <div className="slide-warning">
                          <AlertTriangle size={13} />
                          <span>含 {r.has_bridge ? '橋樑 ' : ''}{r.has_tunnel ? '隧道' : ''}（無替代）</span>
                        </div>
                      )}
                      <button className="slide-select-btn" onClick={() => navigate('/route-detail', {
                        state: {
                          route: {
                            route_id: r.route_id, start, end,
                            startCoord, endCoord,
                            distanceM: r.total_distance_m,
                            distance:  +(r.total_distance_m / 1000).toFixed(2),
                            time:      Math.ceil(r.estimated_duration_sec / 60),
                            difficulty, diffCode: DIFF_CODE[difficulty],
                            estimatedScore: r.estimated_score,
                            segments: r.segments,
                          },
                          prefs,
                        }
                      })}>
                        選擇此路線 →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* 圓點指示器 */}
            <div className="carousel-dots">
              {routes.map((_, i) => (
                <button key={i} className={`carousel-dot ${i === active ? 'active' : ''}`}
                  onClick={() => setActive(i)} />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export default RouteSelect