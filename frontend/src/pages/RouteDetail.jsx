import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/route.css'

// ── Haversine 距離（公尺）────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── 點到線段距離（公尺）──────────────────────────────────────────────
function distToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  const dx = lat2 - lat1, dy = lng2 - lng1
  if (dx === 0 && dy === 0) return haversine(lat, lng, lat1, lng1)
  const t = Math.max(0, Math.min(1,
    ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy)
  ))
  return haversine(lat, lng, lat1 + t * dx, lng1 + t * dy)
}

// ── 點到整條 GeoJSON 路線的最近距離（公尺）──────────────────────────
function distToRoute(lat, lng, segments) {
  if (!segments?.features) return Infinity
  let min = Infinity
  for (const feat of segments.features) {
    const coords = feat.geometry?.coordinates
    if (!coords || coords.length < 2) continue
    for (let i = 0; i < coords.length - 1; i++) {
      // GeoJSON 座標格式：[lng, lat]
      const d = distToSegment(
        lat, lng,
        coords[i][1],   coords[i][0],
        coords[i+1][1], coords[i+1][0]
      )
      if (d < min) min = d
    }
  }
  return min
}

// ── 練習開始時，地圖自動飛到使用者位置（只飛一次）──────────────────
function FlyToUser({ pos, active }) {
  const map   = useMap()
  const fired = useRef(false)
  useEffect(() => {
    if (active && pos && !fired.current) {
      fired.current = true
      map.flyTo(pos, 16, { animate: true, duration: 1.5 })
    }
  }, [active, pos, map])
  return null
}

// 自動縮放到 GeoJSON 範圍
function FitBoundsGeoJSON({ segments }) {
  const map = useMap()
  useEffect(() => {
    if (!segments) return
    try {
      const bounds = L.geoJSON(segments).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36] })
    } catch {}
  }, [map, segments])
  return null
}

function fmtTime(date) {
  if (!date) return '--'
  const m  = String(date.getMonth() + 1)
  const d  = String(date.getDate())
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${m}/${d} ${hh}:${mm}`
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return '0 秒'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} 秒`
  return s === 0 ? `${m} 分鐘` : `${m} 分 ${s} 秒`
}

const DIFF_STARS  = { BEGINNER: 1, NORMAL: 2, EXPERIENCED: 3 }
const DIFF_WEIGHT = { BEGINNER: 1, NORMAL: 2, EXPERIENCED: 3 }

// 計算危險門檻：有風險分數的路段平均值 × 1.5
function calcDangerThreshold(segments) {
  if (!segments?.features) return 0
  const scores = segments.features
    .map(f => f.properties?.risk_score ?? 0)
    .filter(s => s > 0)
  if (!scores.length) return 0
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return avg * 1.5
}

// GeoJSON segments → coordsMulti（各 edge 分開的 [[lat,lng],...][]）
// 不壓平成單一陣列，避免不同 edge 方向不同造成鋸齒路線
function extractCoordsMultiFromSegments(segments) {
  if (!segments?.features) return []
  const multi = []
  for (const feat of segments.features) {
    const g = feat.geometry
    if (!g) continue
    if (g.type === 'LineString') {
      multi.push(g.coordinates.map(([lng, lat]) => [lat, lng]))
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates)
        multi.push(line.map(([lng, lat]) => [lat, lng]))
    }
  }
  return multi
}

// 完成練習後把完整資料存進 localStorage，讓 Records 頁面可以顯示起終點與縮圖
function saveCompletedToLocal(practiceId, route, startTime, endTime) {
  const coordsMulti = extractCoordsMultiFromSegments(route.segments)
  const record = {
    id:          practiceId,
    route_id:    route.route_id,
    start:       route.start,
    end:         route.end,
    startCoord:  route.startCoord  ?? null,
    endCoord:    route.endCoord    ?? null,
    time:        route.time        ?? null,
    diffCode:    route.diffCode    ?? 'BEGINNER',
    coordsMulti,                           // 各 edge 分開，縮圖與地圖才正確
    coords:      coordsMulti.flat(),       // 壓平備援（SVG toSVG 用）
    date:        startTime
      ? `${String(startTime.getMonth()+1).padStart(2,'0')}/${String(startTime.getDate()).padStart(2,'0')}`
      : null,
    startTime:   startTime
      ? `${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}`
      : null,
    endTime:     endTime
      ? `${String(endTime.getHours()).padStart(2,'0')}:${String(endTime.getMinutes()).padStart(2,'0')}`
      : null,
  }
  const existing = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
  const filtered = existing.filter(e => e.id !== practiceId)
  localStorage.setItem('practiceRecords', JSON.stringify([record, ...filtered]))
}

export default function RouteDetail() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('idle')   // idle | active
  // null | 'pause' | 'arrived' | 'terminate' | 'complete'
  const [modal,  setModal]  = useState(null)
  const [result, setResult] = useState(null)     // 後端回傳的完成結果
  const [terminateStats, setTerminateStats] = useState(null)
  const [selected, setSelected] = useState(null) // 點擊路段的資訊
  const startRef = useRef(null)
  const endRef   = useRef(null)

  // ── GPS 追蹤狀態（所有 hook 必須在 early return 之前）──────────────
  const [userPos,     setUserPos]     = useState(null)   // [lat, lng]
  const [gpsError,    setGpsError]    = useState(false)
  const [distToEnd,   setDistToEnd]   = useState(null)   // 公尺
  const [arrived,     setArrived]     = useState(false)
  const [offRoute,    setOffRoute]    = useState(false)  // 偏離路線 > 100m
  const [offRouteDist,setOffRouteDist]= useState(null)   // 目前偏離距離（m）
  const wasOffRouteRef = useRef(false)                   // 曾偏離（送出時用）
  const watchIdRef = useRef(null)

  // 開始 GPS watchPosition（mount 時啟動，unmount 時清除）
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError(true); return }
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      ()  => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    )
    watchIdRef.current = id
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // 到達偵測：每次 userPos 更新時計算與終點距離；抵達後自動跳出完成 Modal
  useEffect(() => {
    const endCoord = state?.route?.endCoord
    if (!userPos || !endCoord || status !== 'active' || arrived) return
    const d = haversine(userPos[0], userPos[1], endCoord[0], endCoord[1])
    setDistToEnd(Math.round(d))
    if (d < 50) {
      setArrived(true)
      // 只在沒有其他 Modal 開著時自動彈出（避免覆蓋暫停/終止 Modal）
      setModal(prev => prev === null ? 'arrived' : prev)
    }
  }, [userPos, status, arrived, state])

  // 偏離路線偵測：距路線 > 100m 時顯示警告並標記曾偏離
  useEffect(() => {
    if (!userPos || status !== 'active') {
      setOffRoute(false)
      setOffRouteDist(null)
      return
    }
    const segments = state?.route?.segments
    const d = distToRoute(userPos[0], userPos[1], segments)
    if (d > 100) {
      setOffRoute(true)
      setOffRouteDist(Math.round(d))
      wasOffRouteRef.current = true
    } else {
      setOffRoute(false)
      setOffRouteDist(null)
    }
  }, [userPos, status, state])

  if (!state?.route) { navigate('/route'); return null }
  const { route, prefs } = state

  const estimatedSec = (route.time ?? 0) * 60   // 預估秒數
  const stars        = DIFF_STARS[route.diffCode] ?? route.difficulty ?? 1

  // ── 危險路段計算 ─────────────────────────────────────────────────────
  const dangerThreshold = calcDangerThreshold(route.segments)
  const dangerSegments  = route.segments?.features?.filter(
    f => (f.properties?.risk_score ?? 0) > dangerThreshold
  ) ?? []
  const mostDangerous = dangerSegments.reduce(
    (max, f) => (f.properties?.risk_score ?? 0) > (max?.properties?.risk_score ?? 0) ? f : max,
    null
  )

  // GeoJSON 路段顏色（高風險 → 紅，一般 → 藍）
  function styleSegment(feature) {
    const dangerous = (feature.properties?.risk_score ?? 0) > dangerThreshold
    return {
      color:   dangerous ? '#ef4444' : '#4f7cff',
      weight:  dangerous ? 6 : 4,
      opacity: dangerous ? 1 : 0.85,
    }
  }

  // Tooltip + 點擊事件
  function onEachFeature(feature, layer) {
    const { road_name, risk_score, distance_m } = feature.properties ?? {}
    const dangerous = (risk_score ?? 0) > dangerThreshold
    layer.bindTooltip(
      `<b>${road_name ?? '未知路段'}</b><br/>` +
      `風險分數：${risk_score ?? 0}` +
      (dangerous ? '<br/><span style="color:#ef4444">⚠️ 高風險路段</span>' : ''),
      { sticky: true }
    )
    layer.on('click', () => setSelected({
      road_name:  road_name  ?? '未知路段',
      risk_score: risk_score ?? 0,
      distance_m: distance_m ?? 0,
      dangerous,
    }))
  }

  // ── 工具函式 ────────────────────────────────────────────────────────

  function getElapsedSec() {
    if (!startRef.current) return 0
    return Math.floor((Date.now() - startRef.current.getTime()) / 1000)
  }

  function handleStart() {
    startRef.current = new Date()
    setStatus('active')
  }

  // 開啟「終止練習」確認 Modal，預先計算折扣分數供預覽
  function openTerminateModal() {
    const elapsedSec     = getElapsedSec()
    const weight         = DIFF_WEIGHT[route.diffCode] ?? 1
    const coveredPct     = estimatedSec > 0
      ? Math.min(elapsedSec / estimatedSec, 1.0)
      : 0
    const estimatedScore = Math.floor(route.distance * coveredPct * 0.8) * weight
    setTerminateStats({ elapsedSec, coveredPct, estimatedScore })
    setModal('terminate')
  }

  // 全程完成（GPS 偵測到達 或 手動確認完成）
  async function handleComplete() {
    endRef.current = new Date()
    const actualSec = startRef.current
      ? Math.floor((endRef.current - startRef.current) / 1000)
      : null
    try {
      const res = await api.post('/practice/complete', {
        route_id:            route.route_id,
        selected_difficulty: route.diffCode,
        actual_duration_sec: actualSec,
        gps_verified:        arrived,
        terminated_early:    false,
        was_off_route:       wasOffRouteRef.current,
      })
      setResult(res.data)
      // 存練習紀錄到 localStorage（供 Records 頁面顯示起終點、縮圖）
      saveCompletedToLocal(res.data.practice_id, route, startRef.current, endRef.current)
      // 同步更新 localStorage 分數
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      localStorage.setItem('currentUser', JSON.stringify({
        ...user, score: res.data.new_total_score,
      }))
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail === 'MANUAL_COMPLETE_DAILY_LIMIT') {
        setResult({ score_earned: 0, time_bonus: 0, new_total_score: null, _limited: true })
      }
    }
    setModal('complete')
  }

  // 提前終止（折扣計分）
  async function handleTerminate() {
    endRef.current = new Date()
    const actualSec = startRef.current
      ? Math.floor((endRef.current - startRef.current) / 1000)
      : null
    try {
      const res = await api.post('/practice/complete', {
        route_id:            route.route_id,
        selected_difficulty: route.diffCode,
        actual_duration_sec: actualSec,
        gps_verified:        false,
        terminated_early:    true,
        was_off_route:       wasOffRouteRef.current,
      })
      setResult(res.data)
      // 存練習紀錄到 localStorage（供 Records 頁面顯示起終點、縮圖）
      saveCompletedToLocal(res.data.practice_id, route, startRef.current, endRef.current)
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      localStorage.setItem('currentUser', JSON.stringify({
        ...user, score: res.data.new_total_score,
      }))
    } catch {
      // API 失敗：仍顯示完成畫面，使用本機估算分數
      setResult({
        score_earned:     terminateStats?.estimatedScore ?? 0,
        time_bonus:       0,
        new_total_score:  null,
        terminated_early: true,
        _api_error:       true,
      })
    }
    setModal('complete')
  }

  function saveIncompleteRecord() {
    if (status !== 'active') return
    const record = {
      id: Date.now(),
      date: new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }),
      startTime: fmtTime(startRef.current),
      endTime:   fmtTime(new Date()),
      routeName: `${route.start} — ${route.end}`,
      start: route.start, end: route.end,
      distance: route.distance, difficulty: route.difficulty,
      coords: [], segments: route.segments,
      status: 'incomplete', score: 0,
      prefs, favorited: false,
    }
    const existing = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
    localStorage.setItem('practiceRecords', JSON.stringify([record, ...existing]))
  }

  const scoreEarned = result?.score_earned ?? route.estimatedScore ?? 0

  return (
    <div className="detail-page">
      <header className="route-header">
        <button className="back-btn" onClick={() => {
          // 從 RouteSelect 進來（有 routes）→ 還原 RouteSelect 狀態
          // 從 Records/Dashboard 再練習一次進來（沒有 routes）→ 直接回上一頁
          if (state.routes) {
            navigate('/route-select', {
              state: {
                routes:         state.routes,
                shortest_route: state.shortest_route,
                prefs:          state.prefs,
              }
            })
          } else {
            navigate(-1)
          }
        }}>
          ← 返回
        </button>
        <span className="route-title">{route.start} — {route.end}</span>
        <span />
      </header>

      {/* 危險路段統計欄（有高風險路段才顯示）*/}
      {dangerSegments.length > 0 && (
        <div style={{
          background: '#1a1d27', borderBottom: '1px solid #2d3148',
          padding: '8px 16px', display: 'flex', gap: 16,
          fontSize: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ color: '#ef4444' }}>
            🔴 高風險路段：{dangerSegments.length} 段
          </span>
          {mostDangerous && (
            <span style={{ color: '#f97316' }}>
              ⚠️ 最危險：{mostDangerous.properties.road_name}
              （風險分數 {mostDangerous.properties.risk_score}）
            </span>
          )}
          <span style={{ color: '#64748b', marginLeft: 'auto' }}>
            點擊路段可查看詳細資訊
          </span>
        </div>
      )}

      {/* 地圖 */}
      <div className="map-wrap">
        <MapContainer
          center={route.startCoord ?? [25.04, 121.37]}
          zoom={14}
          className="leaflet-map"
          zoomControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />
          {route.segments && (
            <>
              <FitBoundsGeoJSON segments={route.segments} />
              <GeoJSON
                data={route.segments}
                style={styleSegment}
                onEachFeature={onEachFeature}
              />
            </>
          )}
          {route.startCoord && (
            <CircleMarker center={route.startCoord}
              radius={9} fillColor="#2e7d32" color="#fff" weight={2} fillOpacity={1} />
          )}
          {route.endCoord && (
            <CircleMarker center={route.endCoord}
              radius={9} fillColor="#c62828" color="#fff" weight={2} fillOpacity={1} />
          )}

          {/* 使用者目前位置（藍點 + 精度半透明圓） */}
          {userPos && (
            <>
              <CircleMarker center={userPos} radius={22}
                pathOptions={{ color: '#4285f4', weight: 0, fillColor: '#4285f4', fillOpacity: 0.15 }} />
              <CircleMarker center={userPos} radius={9}
                pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#4285f4', fillOpacity: 1 }} />
            </>
          )}

          {/* 練習開始時自動飛到使用者位置 */}
          <FlyToUser pos={userPos} active={status === 'active'} />
        </MapContainer>
      </div>

      {/* 點擊路段後的資訊面板 */}
      {selected && (
        <div style={{
          background: '#222536', borderBottom: '1px solid #2d3148',
          padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: 13,
        }}>
          <div>
            <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>
              {selected.road_name}
            </span>
            <span style={{ color: '#94a3b8', marginLeft: 12 }}>
              {selected.distance_m} m
            </span>
            <span style={{ marginLeft: 12, color: selected.dangerous ? '#ef4444' : '#22c55e' }}>
              風險分數：{selected.risk_score}
              {selected.dangerous ? ' ⚠️ 高風險' : ' ✅ 安全'}
            </span>
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', color: '#64748b',
                     cursor: 'pointer', fontSize: 16 }}>
            ✕
          </button>
        </div>
      )}

      {/* 圖例 */}
      <div style={{
        padding: '6px 16px', display: 'flex', gap: 16,
        fontSize: 11, color: '#64748b', background: '#1a1d27',
        borderBottom: '1px solid #2d3148',
      }}>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 3,
            background: '#4f7cff', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          一般路段
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 3,
            background: '#ef4444', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
          高風險路段
        </span>
      </div>

      {/* 資訊列 */}
      <div className="detail-info">
        <div className="dinfo-item">
          <span className="dinfo-label">練習長度</span>
          <span className="dinfo-val">{route.distance} km</span>
        </div>
        <div className="dinfo-sep" />
        <div className="dinfo-item">
          <span className="dinfo-label">預估時間</span>
          <span className="dinfo-val">{route.time} 分鐘</span>
        </div>
        <div className="dinfo-sep" />
        <div className="dinfo-item">
          <span className="dinfo-label">預估得分</span>
          <span className="dinfo-val">+{route.estimatedScore ?? 0} 分</span>
        </div>
      </div>

      {/* GPS 狀態列（練習中、尚未到達終點時顯示） */}
      {status === 'active' && !gpsError && !arrived && (
        <div className="gps-status-bar">
          {userPos ? (
            distToEnd !== null && distToEnd < 500
              ? `📍 距終點約 ${distToEnd} m`
              : '📍 GPS 追蹤中'
          ) : (
            '⏳ 等待 GPS 訊號...'
          )}
        </div>
      )}

      {/* 偏離路線警告（練習中且距路線 > 100m） */}
      {status === 'active' && offRoute && (
        <div className="off-route-warning">
          ⚠️ 您已偏離路線 {offRouteDist} 公尺，完成後分數將 × 0.9
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="detail-controls">
        <button
          className={`ctrl-btn start ${status === 'active' ? 'is-active' : ''}`}
          onClick={handleStart}
          disabled={status === 'active'}
        >
          {status === 'active' ? '練習中...' : '開始練習'}
        </button>
        <button
          className="ctrl-btn pause"
          onClick={() => setModal('pause')}
          disabled={status !== 'active'}
        >
          暫停
        </button>
        <button
          className="ctrl-btn terminate"
          onClick={openTerminateModal}
          disabled={status !== 'active'}
        >
          終止練習
        </button>
      </div>

      {/* ── 暫停 Modal ── */}
      {modal === 'pause' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>練習暫停中</h3>
            <p className="modal-warn">⚠️ 暫停後練習時間仍繼續計算</p>
            <button className="ctrl-btn start" onClick={() => setModal(null)}>
              繼續練習
            </button>
            <button
              className="ctrl-btn pause quit-btn"
              onClick={() => { saveIncompleteRecord(); navigate('/route') }}
            >
              退出練習
            </button>
          </div>
        </div>
      )}

      {/* ── GPS 到達終點 Modal（自動觸發）── */}
      {modal === 'arrived' && (
        <div className="modal-overlay">
          <div className="modal-box wide arrived-modal">
            <div className="arrived-icon">🎯</div>
            <h3 className="arrived-title">已到達終點！</h3>
            <p className="arrived-sub">GPS 已確認您抵達目的地</p>
            <div className="arrived-score-preview">
              <span className="arrived-score-label">預計獲得</span>
              <span className="arrived-score-num">+{route.estimatedScore ?? 0}</span>
              <span className="arrived-score-unit">分</span>
              <span className="arrived-score-tag">全額計分</span>
            </div>
            <div className="arrived-actions">
              <button className="ctrl-btn start" onClick={handleComplete}>
                確認完成
              </button>
              <button className="ctrl-btn pause" onClick={() => setModal(null)}>
                繼續練習
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 終止練習確認 Modal ── */}
      {modal === 'terminate' && terminateStats && (
        <div className="modal-overlay">
          <div className="modal-box wide">
            <div className="complete-emoji">⚠️</div>
            <h3>確認終止練習？</h3>
            <p className="modal-warn">將以當前進度折扣計分，無法復原</p>
            <div className="terminate-stats">
              <div className="term-row">
                <span>已練習時間</span>
                <span>{fmtDuration(terminateStats.elapsedSec)}</span>
              </div>
              <div className="term-row">
                <span>完成比例</span>
                <span>{Math.round(terminateStats.coveredPct * 100)} %</span>
              </div>
              <div className="term-row highlight">
                <span>預計獲得分數</span>
                <span className="score-val">+{terminateStats.estimatedScore} 分</span>
              </div>
              <p className="term-discount-note">× 0.8 折扣（提前終止）</p>
            </div>
            <div className="arrived-actions">
              <button className="ctrl-btn terminate-confirm" onClick={handleTerminate}>
                確認終止
              </button>
              <button className="ctrl-btn start" onClick={() => setModal(null)}>
                繼續練習
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 完成 Modal ── */}
      {modal === 'complete' && (
        <div className="modal-overlay">
          <div className="modal-box wide">
            {result?.terminated_early ? (
              <>
                <div className="complete-emoji">🏁</div>
                <h3>練習已終止</h3>
              </>
            ) : (
              <>
                <div className="complete-emoji">🎉</div>
                <h3>恭喜你完成本次練習！</h3>
              </>
            )}
            {result?.gps_verified && (
              <div className="gps-verified-badge">✅ GPS 驗證到達終點</div>
            )}
            <div className="summary">
              {[
                ['練習路徑', `${route.start} — ${route.end}`],
                ['練習距離', `${route.distance} 公里`],
                ['難易度',   '⭐'.repeat(stars)],
                ['路線偏好', `${prefs.bridge ? '✅' : '❌'} 橋樑　${prefs.tunnel ? '✅' : '❌'} 隧道`],
                ['開始時間', fmtTime(startRef.current)],
                ['結束時間', fmtTime(endRef.current)],
              ].map(([k, v]) => (
                <div key={k} className="sum-row">
                  <span>{k}</span><span>{v}</span>
                </div>
              ))}
              <div className="sum-row score-row">
                <span>本次獲得分數</span>
                {result?._limited ? (
                  <span style={{ fontSize: '13px', color: '#e76f51', fontWeight: '700' }}>
                    今日已手動完成此路線，<br />不重複計分
                  </span>
                ) : (
                  <span className="score-val">+{scoreEarned} 分</span>
                )}
              </div>
              {result?.terminated_early && (
                <div className="sum-row">
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                    提前終止：比例計分 × 0.8，不計 time bonus
                  </span>
                </div>
              )}
            </div>
            <button
              className="ctrl-btn start"
              style={{ marginTop: 4 }}
              onClick={() => navigate('/dashboard')}
            >
              確認
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
