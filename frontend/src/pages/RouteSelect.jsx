import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Milestone, Clock, Zap, Star, AlertTriangle } from 'lucide-react' // 👈 額外導入 AlertTriangle 作為高質感警告圖示
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

// ── 地圖自動縮放 ───────────────────────────────────────────────
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

// ── 最短路徑 vs 推薦路線比較地圖 ────────────────────────────
function ShortestRouteMap({ shortestRoute, recommendedSegments, startCoord, endCoord }) {
  if (!shortestRoute?.segments?.features?.length) return null

  const distKm      = +(shortestRoute.total_distance_m / 1000).toFixed(2)
  const riskScore   = shortestRoute.total_risk_score?.toFixed(1) ?? '—'
  const allFeatures = shortestRoute.segments.features

  // 推薦路線已使用的 edge_id（用來判斷「真正被繞開」的路段）
  const recEdgeSet = new Set(
    (recommendedSegments?.features ?? [])
      .map(f => f.properties?.edge_id)
      .filter(id => id != null)
  )

  // 一般路段（非危險）
  const normalFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(f => !f.properties?.is_dangerous),
  }

  // 危險路段 — 只標記推薦路線「真正沒走」的路段
  const avoidedDangerFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(
      f => f.properties?.is_dangerous && !recEdgeSet.has(f.properties?.edge_id)
    ),
  }

  // 危險但推薦路線也用到（無法繞開）→ 橘色提示
  const sharedDangerFeatures = {
    type: 'FeatureCollection',
    features: allFeatures.filter(
      f => f.properties?.is_dangerous && recEdgeSet.has(f.properties?.edge_id)
    ),
  }

  const dangerCount = avoidedDangerFeatures.features.length

  // 灰虛線：最短路徑一般路段
  const styleNormal    = () => ({ color: '#475569', weight: 3, opacity: 0.75, dashArray: '7 4' })
  // 綠線：系統推薦路線
  const styleRecommended = () => ({ color: '#22c55e', weight: 5, opacity: 0.9 })
  // 紅粗線：已繞開的危險路段
  const styleAvoided   = () => ({ color: '#ef4444', weight: 7, opacity: 1 })
  // 橘線：危險但無法繞開（推薦路線也走這裡）
  const styleShared    = () => ({ color: '#f97316', weight: 5, opacity: 0.9, dashArray: '10 4' })

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

  // 縮放範圍涵蓋兩條路線
  const fitFeatures = {
    type: 'FeatureCollection',
    features: [
      ...allFeatures,
      ...(recommendedSegments?.features ?? []),
    ]
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
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#22c55e',
            borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          系統推薦路線
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#ef4444',
            borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          危險路段（已繞開）
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 4, background: '#f97316',
            borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          危險路段（無替代道路）
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 20, height: 3, background: '#475569',
            borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          最短路徑一般路段
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1d4ed8',
            borderRadius: '50%', verticalAlign: 'middle', marginRight: 4, border: '2px solid #fff', outline: '1px solid #1d4ed8' }} />
          起點
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: '#7c3aed',
            borderRadius: '50%', verticalAlign: 'middle', marginRight: 4, border: '2px solid #fff', outline: '1px solid #7c3aed' }} />
          終點
        </span>
      </div>

      <MapContainer center={[25.038, 121.305]} zoom={13}
        style={{ height: 300, borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds segments={fitFeatures} />

        {/* 渲染順序：
            1. 推薦路線（綠，底層）
            2. 最短路徑一般路段（灰虛線）
            3. 危險但無法繞開的路段（橘，提示）
            4. 真正被繞開的危險路段（紅，最上層）
        */}
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

        {/* 起終點標記：顏色與路線顏色區隔（藍=起、紫=終） */}
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

// 🧭 主要的路線選擇主頁面
function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()

  if (!state?.routes) { navigate('/route'); return null }

  const { routes, shortest_route, prefs } = state
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
                    // 回上一頁需要的資料
                    routes,
                    shortest_route,
                  }
                })}
              />
            ))}
          </div>
        )}

        <ShortestRouteMap
          shortestRoute={shortest_route}
          recommendedSegments={routes[0]?.segments}
          startCoord={startCoord}
          endCoord={endCoord}
        />
      </main>
    </>
  )
}

export default RouteSelect