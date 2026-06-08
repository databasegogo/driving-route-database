import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Milestone, Clock, Zap, Star, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, Polyline, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/route.css'

const DIFF_CODE  = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }
const DIFF_LABEL = { 1: '新手', 2: '一般', 3: '熟練' }

// ── 統一起終點顏色 ────────────────────────────────────────────────
const START_COLOR = '#22c55e'   // 綠
const END_COLOR   = '#ef4444'   // 紅

// ── 從 GeoJSON segments 取出路線實際起終點 [lat,lng] ─────────────
// 用於標記：取第一條 feature 的第一個點、最後一條 feature 的最後一個點
function segmentEndpoints(segments) {
  const features = segments?.features
  if (!features?.length) return [null, null]

  function firstCoord(feat) {
    const g = feat?.geometry
    if (!g) return null
    const coords = g.type === 'MultiLineString' ? g.coordinates[0] : g.coordinates
    const c = coords?.[0]
    return c ? [c[1], c[0]] : null   // GeoJSON [lng,lat] → Leaflet [lat,lng]
  }
  function lastCoord(feat) {
    const g = feat?.geometry
    if (!g) return null
    const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]
    const lastLine = lines[lines.length - 1]
    const c = lastLine?.[lastLine.length - 1]
    return c ? [c[1], c[0]] : null
  }

  return [firstCoord(features[0]), lastCoord(features[features.length - 1])]
}

// ── 從 GeoJSON segments 展開座標 ─────────────────────────────────
function flatCoords(segments) {
  if (!segments?.features?.length) return []
  const all = []
  for (const feat of segments.features) {
    const geom = feat?.geometry
    if (!geom) continue
    if (geom.type === 'LineString')
      all.push(...geom.coordinates.map(([lng, lat]) => [lat, lng]))
    else if (geom.type === 'MultiLineString')
      for (const line of geom.coordinates)
        all.push(...line.map(([lng, lat]) => [lat, lng]))
  }
  return all
}

// ── 路線卡迷你地圖 ────────────────────────────────────────────────
function FitSegBounds({ segments }) {
  const map = useMap()
  useEffect(() => {
    if (!segments?.features?.length) return
    try {
      const bounds = L.geoJSON(segments).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [14, 14] })
    } catch {}
  }, [map, segments])
  return null
}

function RouteCardMap({ segments, startCoord, endCoord }) {
  // 每個 segment 獨立成一條 Polyline，避免跨 segment 連接產生錯誤斜線
  const segLines = useMemo(() => {
    if (!segments?.features?.length) return []
    return segments.features.flatMap(feat => {
      const geom = feat?.geometry
      if (!geom) return []
      if (geom.type === 'LineString')
        return [geom.coordinates.map(([lng, lat]) => [lat, lng])]
      if (geom.type === 'MultiLineString')
        return geom.coordinates.map(line => line.map(([lng, lat]) => [lat, lng]))
      return []
    }).filter(line => line.length > 1)
  }, [segments])

  // 優先用傳入的 snap 座標；沒有才 fallback 到路線端點
  const [segStart, segEnd] = useMemo(() => segmentEndpoints(segments), [segments])
  const startC = startCoord ?? segStart
  const endC   = endCoord   ?? segEnd

  if (!segLines.length) return (
    <div style={{ width: '100%', height: '100%', background: '#eef2f7',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, color: '#94a3b8' }}>載入中…</div>
  )
  return (
    <MapContainer center={[25.02, 121.35]} zoom={13}
      zoomControl={false} attributionControl={false}
      dragging={false} scrollWheelZoom={false} doubleClickZoom={false} keyboard={false}
      style={{ width: '100%', height: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitSegBounds segments={segments} />
      {segLines.map((line, i) => (
        <Polyline key={i} positions={line} color="#ff6b35" weight={3.5} opacity={0.9} />
      ))}
      {startC && (
        <CircleMarker center={startC} radius={8}
          pathOptions={{ fillColor: START_COLOR, color: '#fff', weight: 2.5, fillOpacity: 1 }} />
      )}
      {endC && (
        <CircleMarker center={endC} radius={8}
          pathOptions={{ fillColor: END_COLOR, color: '#fff', weight: 2.5, fillOpacity: 1 }} />
      )}
    </MapContainer>
  )
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
function ShortestRouteMap({ shortestRoute, recommendedSegments, startCoord, endCoord, routeKey = 0 }) {
  if (!shortestRoute?.segments?.features?.length) return null

  const distKm    = +(shortestRoute.total_distance_m / 1000).toFixed(2)
  const riskScore = shortestRoute.total_risk_score?.toFixed(1) ?? '—'
  const allFeatures = shortestRoute.segments.features
  // 起終點標記使用後端回傳的路口座標（start_node_coord / end_node_coord）
  // 路口座標 = pgr_ksp 實際用的起終點路口，與 route 線條完全對齊，不會有視覺錯位

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
    <section style={{ marginTop: 32 }}>
      <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 24px rgba(38,70,83,0.13)' }}>

        {/* ── 深色標題帶 ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1d3a47 0%, #264653 100%)',
          padding: '18px 20px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>🗺️</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                為什麼不走最短路線？
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                最短路徑含高風險路段，推薦路線已自動繞開危險區域
              </div>
            </div>
          </div>

          {/* 三個統計數字 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: '最短路徑', value: `${distKm} km`,      accent: '#ffffff',                                  border: 'rgba(255,255,255,0.35)' },
              { label: '危險路段', value: `${dangerCount} 段`,  accent: dangerCount > 0 ? '#fc8181' : '#68d391',   border: dangerCount > 0 ? 'rgba(252,129,129,0.55)' : 'rgba(104,211,145,0.55)' },
              { label: '風險總分', value: riskScore,             accent: '#fbbf24',                                 border: 'rgba(251,191,36,0.55)' },
            ].map(({ label, value, accent, border }) => (
              <div key={label} className="shortest-stat-card" style={{
                flex: 1, background: 'rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '9px 10px',
                border: `1.5px solid ${border}`,
              }}>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '0.02em' }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: accent, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 地圖（全寬，無 padding）── */}
        <MapContainer center={[25.038, 121.305]} zoom={13}
          style={{ height: 'clamp(260px, 42vw, 360px)', borderRadius: 0 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds segments={fitFeatures} />
          {/* 圖層由下到上：灰（最短路徑一般段）→ 橘（共用危險段）→ 紅（已繞開危險段）→ 綠（推薦路線，最上層）*/}
          {normalFeatures.features.length > 0 && (
            <GeoJSON key="norm" data={normalFeatures} style={styleNormal} onEachFeature={onEachNormal} />
          )}
          {sharedDangerFeatures.features.length > 0 && (
            <GeoJSON key="shared" data={sharedDangerFeatures} style={styleShared} onEachFeature={onEachShared} />
          )}
          {avoidedDangerFeatures.features.length > 0 && (
            <GeoJSON key="avoided" data={avoidedDangerFeatures} style={styleAvoided} onEachFeature={onEachAvoided} />
          )}
          {recommendedSegments && (
            <GeoJSON key={`rec-${routeKey}`} data={recommendedSegments} style={styleRecommended} />
          )}
          {startCoord && (
            <CircleMarker center={startCoord} radius={10}
              pathOptions={{ fillColor: START_COLOR, color: '#fff', weight: 2.5, fillOpacity: 1 }} />
          )}
          {endCoord && (
            <CircleMarker center={endCoord} radius={10}
              pathOptions={{ fillColor: END_COLOR, color: '#fff', weight: 2.5, fillOpacity: 1 }} />
          )}
        </MapContainer>

        {/* ── 底部圖例 ── */}
        <div style={{
          background: '#f8fafc', padding: '10px 16px',
          display: 'flex', gap: '8px 16px', flexWrap: 'wrap', alignItems: 'center',
          borderTop: '1px solid rgba(38,70,83,0.06)',
        }}>
          {[
            { color: '#22c55e', label: '推薦路線' },
            { color: '#ef4444', label: '危險（已繞開）' },
            { color: '#f97316', label: '危險（無替代）', dash: true },
            { color: '#475569', label: '最短路徑', dash: true },
          ].map(({ color, label, dash }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
              <div style={{
                width: 18, height: 3, borderRadius: 2, flexShrink: 0,
                background: dash
                  ? `repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 7px)`
                  : color,
              }} />
              {label}
            </div>
          ))}
          {[{ c: START_COLOR, t: '起點' }, { c: END_COLOR, t: '終點' }].map(({ c, t }) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: c, border: '1.5px solid #fff', boxShadow: `0 0 0 1.5px ${c}` }} />
              {t}
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
// ── 主頁面 ────────────────────────────────────────────────────────
function RouteSelect() {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const [active, setActive]  = useState(0)
  const [saving, setSaving]  = useState(false)
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

  async function goToDetail(r) {
    if (saving) return
    setSaving(true)
    try {
      // 呼叫 /route/save：只存使用者選擇的那一條路線到 DB
      // 相同起終點 + 難度 + 距離 → 後端會去重複，回傳現有 route_id
      const payload = {
        start_lat:              prefs.startCoord[0],
        start_lng:              prefs.startCoord[1],
        end_lat:                prefs.endCoord[0],
        end_lng:                prefs.endCoord[1],
        selected_difficulty:    DIFF_CODE[difficulty],
        avoid_bridge:           prefs.bridge  ?? false,
        avoid_tunnel:           prefs.tunnel  ?? false,
        max_distance_m:         prefs.maxDist ? prefs.maxDist * 1000 : null,
        route_name:             r.route_name,
        start_name:             prefs.start   ?? null,
        end_name:               prefs.end     ?? null,
        total_distance_m:       r.total_distance_m,
        total_base_cost:        r.total_base_cost   ?? 0,
        total_risk_score:       r.total_risk_score  ?? 0,
        total_final_cost:       r.total_final_cost  ?? 0,
        estimated_duration_sec: r.estimated_duration_sec,
        segments: (r.segments?.features ?? []).map(f => ({
          seq:        f.properties.seq,
          edge_id:    f.properties.edge_id,
          distance_m: f.properties.distance_m,
          base_cost:  f.properties.base_cost  ?? 0,
          risk_score: f.properties.risk_score ?? 0,
          final_cost: f.properties.final_cost ?? 0,
        })),
      }
      const res = await api.post('/route/save', payload)
      const routeId = res.data.route_id

      navigate('/route-detail', {
        state: {
          route: {
            route_id:       routeId,
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
    } catch (e) {
      console.error('save route failed', e)
      alert('儲存路線失敗，請稍後再試')
      setSaving(false)
    }
  }

  return (
    <>
      <main className="route-main">
        {/* 頂部控制列 */}
        <div className="cockpit-top-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '16px', flexWrap: 'nowrap' }}>
          <button className="back-btn" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => navigate('/route')}>
            <ArrowLeft size={14} />
            <span>重新設定</span>
          </button>
          <span className="route-title-pills" style={{
            fontSize: 'clamp(12px, 3.5vw, 15px)', fontWeight: '800', color: '#264653',
            background: '#f1f5f9', padding: '6px 12px', borderRadius: '30px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'center',
          }}>
            🧭 選擇今日練習路徑
          </span>
        </div>

        {/* 偏好摘要列（橫向捲動，不換行）*/}
        <div className="pref-summary" style={{ whiteSpace: 'nowrap', overflowX: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <span style={{ flexShrink: 0 }}>{start} → {end}</span>
          <span style={{ color: '#264653', fontWeight: '700', flexShrink: 0 }}>
            {maxDist ? `${maxDist} km 以內` : '不限距離'}
          </span>
          {bridge && <span style={{ flexShrink: 0 }}>橋樑避開 🌉</span>}
          {tunnel && <span style={{ flexShrink: 0 }}>隧道避開 🚇</span>}
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
                const distKm  = +(r.total_distance_m / 1000).toFixed(2)
                const timeMin = Math.ceil(r.estimated_duration_sec / 60)
                const label   = String.fromCharCode(65 + idx)

                return (
                  <div key={r.route_id}
                    className={`route-slide-card ${idx === active ? 'is-active' : 'is-side'}`}
                    onClick={() => idx !== active && setActive(idx)}>

                    {/* Leaflet 迷你地圖預覽 */}
                    <div className="slide-map-preview">
                      <div className="slide-label-badge">路線 {label}</div>
                      <RouteCardMap segments={r.segments} startCoord={startCoord} endCoord={endCoord} />
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

                      <button
                        className="slide-select-btn"
                        onClick={() => goToDetail(r)}
                        disabled={saving}>
                        {saving ? '儲存中…' : '選擇此路線 →'}
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
          routeKey={active}
        />
      </main>
    </>
  )
}

export default RouteSelect
