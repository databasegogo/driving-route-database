import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Milestone, Clock, Zap, Star, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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
function toSVG(coords, w = 320, h = 180, pad = 20) {
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

// ── 地圖自動縮放 ────────────────────────────────────────────────
function FitBounds({ segments }) {
  const map = useMap()
  useEffect(() => {
    if (!segments) return
    try {
      const bounds = L.geoJSON(segments).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] })
    } catch {}
  }, [map, segments])
  return null
}

// ── 最短路徑 vs 推薦路線比較地圖 ─────────────────────────────────
function ShortestRouteMap({ shortestRoute, recommendedSegments, startCoord, endCoord }) {
  if (!shortestRoute?.segments?.features?.length) return null

  const distKm    = +(shortestRoute.total_distance_m / 1000).toFixed(2)
  const riskScore = shortestRoute.total_risk_score?.toFixed(1) ?? '—'
  const allFeatures = shortestRoute.segments.features

  const recEdgeSet = new Set(
    (recommendedSegments?.features ?? [])
      .map(f => f.properties?.edge_id)
      .filter(id => id != null)
  )

  const normalFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(f => !f.properties?.is_dangerous),
  }
  const avoidedDangerFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(
      f => f.properties?.is_dangerous && !recEdgeSet.has(f.properties?.edge_id)
    ),
  }
  const sharedDangerFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(
      f => f.properties?.is_dangerous && recEdgeSet.has(f.properties?.edge_id)
    ),
  }

  const dangerCount = avoidedDangerFeatures.features.length

  const styleNormal      = () => ({ color: '#475569', weight: 3, opacity: 0.75, dashArray: '7 4' })
  const styleRecommended = () => ({ color: '#22c55e', weight: 5, opacity: 0.9 })
  const styleAvoided     = () => ({ color: '#ef4444', weight: 7, opacity: 1 })
  const styleShared      = () => ({ color: '#f97316', weight: 5, opacity: 0.9, dashArray: '10 4' })

  function onEachAvoided(feature, layer) {
    const { road_name, risk_score } = feature.properties ?? {}
    layer.bindTooltip(
      `<b>${road_name ?? '未知路段'}</b><br/>風險分數：${risk_score ?? 0}` +
      '<br/><span style="color:#ef4444">🔴 高風險路段（推薦路線已繞開此處）</span>',
      { sticky: true }
    )
  }
  function onEachShared(feature, layer) {
    const { road_name, risk_score } = feature.properties ?? {}
    layer.bindTooltip(
      `<b>${road_name ?? '未知路段'}</b><br/>風險分數：${risk_score ?? 0}` +
      '<br/><span style="color:#f97316">⚠️ 高風險路段（此處無替代道路）</span>',
      { sticky: true }
    )
  }
  function onEachNormal(feature, layer) {
    const { road_name, risk_score } = feature.properties ?? {}
    layer.bindTooltip(
      `<b>${road_name ?? '未知路段'}</b><br/>風險分數：${risk_score ?? 0}`,
      { sticky: true }
    )
  }

  const fitFeatures = {
    type: 'FeatureCollection',
    features: [...allFeatures, ...(recommendedSegments?.features ?? [])],
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#264653', marginBottom: 6 }}>
        🗺️ 為什麼不走最短路線？
      </div>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
        最短路徑含高風險路段（紅色），系統推薦路線（綠色）已自動繞開危險區域
      </p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
        <span>📏 最短路徑 {distKm} km</span>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>🔴 危險路段：{dangerCount} 段</span>
        <span>⚠️ 風險總分：{riskScore}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#22c55e', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          系統推薦路線
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#ef4444', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          危險路段（已繞開）
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#f97316', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          危險路段（無替代道路）
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 3, background: '#475569', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          最短路徑一般路段
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1d4ed8', borderRadius: '50%', verticalAlign: 'middle', marginRight: 4, border: '2px solid #fff', outline: '1px solid #1d4ed8' }} />
          起點
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#7c3aed', borderRadius: '50%', verticalAlign: 'middle', marginRight: 4, border: '2px solid #fff', outline: '1px solid #7c3aed' }} />
          終點
        </span>
      </div>
      <MapContainer center={[25.038, 121.305]} zoom={13}
        style={{ height: 300, borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds segments={fitFeatures} />
        {recommendedSegments && (
          <GeoJSON key="rec" data={recommendedSegments} style={styleRecommended} />
        )}
        {normalFeatures.features.length > 0 && (
          <GeoJSON key="norm" data={normalFeatures} style={styleNormal} onEachFeature={onEachNormal} />
        )}
        {sharedDangerFeatures.features.length > 0 && (
          <GeoJSON key="shared" data={sharedDangerFeatures} style={styleShared} onEachFeature={onEachShared} />
        )}
        {avoidedDangerFeatures.features.length > 0 && (
          <GeoJSON key="avoided" data={avoidedDangerFeatures} style={styleAvoided} onEachFeature={onEachAvoided} />
        )}
        {startCoord && (
          <CircleMarker center={startCoord} radius={10}
            pathOptions={{ fillColor: '#1d4ed8', color: '#fff', weight: 2.5, fillOpacity: 1 }} />
        )}
        {endCoord && (
          <CircleMarker center={endCoord} radius={10}
            pathOptions={{ fillColor: '#7c3aed', color: '#fff', weight: 2.5, fillOpacity: 1 }} />
        )}
      </MapContainer>
    </section>
  )
}

// ── 主頁面 ────────────────────────────────────────────────────────
function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const [active, setActive]  = useState(0)
  const touchStartX          = useRef(null)

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) {
      if (diff > 0) setActive(i => Math.min((routes?.length ?? 1) - 1, i + 1))
      else          setActive(i => Math.max(0, i - 1))
    }
    touchStartX.current = null
  }

  if (!state?.routes) { navigate('/route'); return null }

  const { routes, shortest_route, prefs } = state
  const { start, end, startCoord, endCoord, bridge, tunnel, maxDist, difficulty } = prefs

  function goToDetail(r) {
    navigate('/route-detail', {
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
        routes,          // 退回鍵需要
        shortest_route,  // 退回鍵需要
      }
    })
  }

  return (
    <>
      <main className="route-main">
        {/* 頂部控制列 */}
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

        {/* 偏好摘要列 */}
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

            {/* 滑動軌道（觸控支援） */}
            <div className="route-slider"
              style={{ transform: `translateX(calc(-${active * 100}% - ${active * 20}px))` }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}>
              {routes.map((r, idx) => {
                const coords  = extractCoords(r.segments)
                const svg     = toSVG(coords)
                const distKm  = +(r.total_distance_m / 1000).toFixed(2)
                const timeMin = Math.ceil(r.estimated_duration_sec / 60)
                const label   = String.fromCharCode(65 + idx)

                return (
                  <div key={r.route_id}
                    className={`route-slide-card ${idx === active ? 'is-active' : 'is-side'}`}
                    onClick={() => idx !== active && setActive(idx)}>

                    {/* SVG 路線預覽 */}
                    <div className="slide-map-preview">
                      <div className="slide-label-badge">路線 {label}</div>
                      {svg ? (
                        <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
                          <rect width="320" height="180" fill="#eef2f7" />
                          {[40, 80, 120, 160].map(y => (
                            <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#dde3ec" strokeWidth="0.5" />
                          ))}
                          {[80, 160, 240].map(x => (
                            <line key={x} x1={x} y1="0" x2={x} y2="180" stroke="#dde3ec" strokeWidth="0.5" />
                          ))}
                          <path d={svg.path} fill="none" stroke="#264653" strokeWidth="3.5"
                            strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx={svg.start.x} cy={svg.start.y} r="7" fill="#ff6b35" stroke="#fff" strokeWidth="2" />
                          <circle cx={svg.end.x}   cy={svg.end.y}   r="7" fill="#1d3557" stroke="#fff" strokeWidth="2" />
                          <text x={svg.start.x + 10} y={svg.start.y + 4} fontSize="10" fill="#ff6b35" fontWeight="700">起</text>
                          <text x={svg.end.x + 10}   y={svg.end.y + 4}   fontSize="10" fill="#1d3557" fontWeight="700">終</text>
                        </svg>
                      ) : (
                        <div className="slide-map-loading">載入中…</div>
                      )}
                    </div>

                    {/* 路線資訊 */}
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
                          <Milestone size={16} /><span>{distKm} km</span>
                        </div>
                        <div className="slide-stat">
                          <Clock size={16} /><span>{timeMin} 分鐘</span>
                        </div>
                        <div className="slide-stat score">
                          <Zap size={16} /><span>+{r.estimated_score} 分</span>
                        </div>
                      </div>

                      {r.constraint_relaxed && (
                        <div className="slide-warning">
                          <AlertTriangle size={13} />
                          <span>含 {r.has_bridge ? '橋樑 ' : ''}{r.has_tunnel ? '隧道' : ''}（無替代）</span>
                        </div>
                      )}

                      <button className="slide-select-btn" onClick={() => goToDetail(r)}>
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
                <button key={i}
                  className={`carousel-dot ${i === active ? 'active' : ''}`}
                  onClick={() => setActive(i)} />
              ))}
            </div>
          </div>
        )}

        {/* 最短路徑 vs 推薦路線比較地圖 */}
        <ShortestRouteMap
          shortestRoute={shortest_route}
          recommendedSegments={routes[active]?.segments}
          startCoord={startCoord}
          endCoord={endCoord}
        />
      </main>
    </>
  )
}

export default RouteSelect
