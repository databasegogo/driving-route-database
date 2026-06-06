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

export default function RouteDetail() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('idle')   // idle | active
  // null | 'pause' | 'arrived' | 'terminate' | 'complete'
  const [modal,  setModal]  = useState(null)
  const [result, setResult] = useState(null)     // 後端回傳的完成結果
  const [terminateStats, setTerminateStats] = useState(null)
  const startRef = useRef(null)
  const endRef   = useRef(null)

  // ── GPS 追蹤狀態（所有 hook 必須在 early return 之前）──────────────
  const [userPos,   setUserPos]   = useState(null)   // [lat, lng]
  const [gpsError,  setGpsError]  = useState(false)
  const [distToEnd, setDistToEnd] = useState(null)   // 公尺
  const [arrived,   setArrived]   = useState(false)
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

  if (!state?.route) { navigate('/route'); return null }
  const { route, prefs } = state

  const estimatedSec = (route.time ?? 0) * 60   // 預估秒數
  const stars        = DIFF_STARS[route.diffCode] ?? route.difficulty ?? 1

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
      })
      setResult(res.data)
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
      })
      setResult(res.data)
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
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span className="route-title">{route.start} — {route.end}</span>
        <span />
      </header>

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
                style={{ color: '#4f7cff', weight: 5, opacity: 0.85 }}
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
