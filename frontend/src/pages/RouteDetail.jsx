import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/route.css'

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

const DIFF_LABEL = { BEGINNER: '新手', NORMAL: '一般', EXPERIENCED: '熟練' }
const DIFF_STARS = { BEGINNER: 1, NORMAL: 2, EXPERIENCED: 3 }

export default function RouteDetail() {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('idle')   // idle | active
  const [modal, setModal]   = useState(null)     // null | 'pause' | 'complete'
  const [result, setResult] = useState(null)     // 後端回傳的完成結果
  const startRef = useRef(null)
  const endRef   = useRef(null)

  if (!state?.route) { navigate('/route'); return null }
  const { route, prefs } = state

  function handleStart() {
    startRef.current = new Date()
    setStatus('active')
  }

  async function handleComplete() {
    endRef.current = new Date()
    try {
      const res = await api.post('/practice/complete', {
        route_id:             route.route_id,
        selected_difficulty:  route.diffCode,
      })
      setResult(res.data)  // { score_earned, new_total_score, new_level }

      // 同步更新 localStorage 的分數
      const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
      localStorage.setItem('currentUser', JSON.stringify({
        ...user,
        score: res.data.new_total_score,
      }))
    } catch {
      // API 失敗也還是讓使用者看到完成畫面，只是分數顯示估算值
    }
    setModal('complete')
  }

  function saveIncompleteRecord() {
    if (status !== 'active') return
    const record = {
      id: Date.now(),
      date: new Date().toLocaleDateString('zh-TW', { month:'2-digit', day:'2-digit' }),
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

  const scoreEarned  = result?.score_earned  ?? route.estimatedScore ?? 0
  const stars        = DIFF_STARS[route.diffCode] ?? route.difficulty ?? 1

  return (
    <div className="detail-page">
      <header className="route-header">
        <button className="back-btn"
          onClick={() => navigate('/route')}>
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

      {/* 操作按鈕 */}
      <div className="detail-controls">
        <button className={`ctrl-btn start ${status === 'active' ? 'is-active' : ''}`}
          onClick={handleStart} disabled={status === 'active'}>
          {status === 'active' ? '練習中...' : '開始練習'}
        </button>
        <button className="ctrl-btn pause"
          onClick={() => setModal('pause')} disabled={status !== 'active'}>
          暫停
        </button>
        <button className="ctrl-btn done"
          onClick={handleComplete} disabled={status !== 'active'}>
          已完成
        </button>
      </div>

      {/* 暫停 Modal */}
      {modal === 'pause' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>練習暫停中</h3>
            <p className="modal-warn">⚠️ 暫停後練習時間仍繼續計算</p>
            <button className="ctrl-btn start" onClick={() => setModal(null)}>繼續練習</button>
            <button className="ctrl-btn pause quit-btn"
              onClick={() => { saveIncompleteRecord(); navigate('/route') }}>
              退出練習
            </button>
          </div>
        </div>
      )}

      {/* 完成 Modal */}
      {modal === 'complete' && (
        <div className="modal-overlay">
          <div className="modal-box wide">
            <div className="complete-emoji">🎉</div>
            <h3>恭喜你完成本次練習！</h3>
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
                <span className="score-val">+{scoreEarned} 分</span>
              </div>
            </div>
            <button className="ctrl-btn start" style={{ marginTop: 4 }}
              onClick={() => navigate('/dashboard')}>
              確認
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
