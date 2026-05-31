import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/records.css'

const DIFF_STARS = { BEGINNER: 1, NORMAL: 2, EXPERIENCED: 3 }

// 把後端歷史紀錄格式轉成前端顯示格式
function fmtHHMM(isoStr) {
  if (!isoStr) return '--'
  const dt = new Date(isoStr)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function fromBackend(h) {
  const dt  = new Date(h.practice_time)
  const mm  = String(dt.getMonth() + 1).padStart(2, '0')
  const dd  = String(dt.getDate()).padStart(2, '0')
  return {
    id:         h.practice_id,
    date:       `${mm}/${dd}`,
    startTime:  fmtHHMM(h.practice_time),
    endTime:    fmtHHMM(h.end_time),       // 後端現在有 end_time
    routeName:  h.route_name,
    distance:   h.total_distance_m ? +(h.total_distance_m / 1000).toFixed(2) : '--',
    difficulty: DIFF_STARS[h.selected_difficulty] ?? 1,
    diffCode:   h.selected_difficulty,
    status:     h.status ?? 'completed',
    score:      h.score_earned,
    timeBonus:  h.time_bonus ?? 0,
    prefs:      { bridge: false, tunnel: false },
    coords:     null,
    favorited:  h.is_favorite ?? false,    // 從後端取
  }
}


function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords?.length) map.fitBounds(coords, { padding: [24, 24] })
  }, [map, coords])
  return null
}

const STATUS_META = {
  completed:    { label: '完成',   cls: 'st-done' },
  'in-progress':{ label: '練習中', cls: 'st-ing'  },
  in_progress:  { label: '練習中', cls: 'st-ing'  },  // 後端格式
  incomplete:   { label: '未完成', cls: 'st-none' },
}

function StatusBadge({ status }) {
  return (
    <div className="status-pills">
      {Object.entries(STATUS_META).map(([k, { label, cls }]) => (
        <span key={k} className={`st-pill ${status === k ? cls : 'st-off'}`}>{label}</span>
      ))}
    </div>
  )
}

export default function Records() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [selected, setSelected] = useState(null)   // record for modal
  const [mapOpen, setMapOpen]   = useState(false)   // map sub-view

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      // 有 token → 從後端拿
      api.get('/practice/history')
        .then(res => {
          const backendRecords = res.data.history.map(fromBackend)
          // 合併本地紀錄（保留收藏狀態和有 coords 的舊紀錄）
          const local = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
          const localMap = Object.fromEntries(local.map(r => [r.id, r]))
          const merged = backendRecords.map(r => ({
            ...r,
            favorited: localMap[r.id]?.favorited ?? false,
            coords:    localMap[r.id]?.coords ?? null,
          }))
          setRecords(merged)
        })
        .catch(() => {
          // 後端失敗就退回 localStorage
          const stored = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
          setRecords(stored)
        })
    } else {
      const stored = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
      setRecords(stored)
    }
  }, [])

  function toggleFav(id) {
    const updated = records.map(r => r.id === id ? { ...r, favorited: !r.favorited } : r)
    setRecords(updated)
    localStorage.setItem('practiceRecords', JSON.stringify(updated))
    // 同步到後端
    api.put(`/practice/${id}/favorite`).catch(() => {})
  }

  const total     = records.length
  const completed = records.filter(r => r.status === 'completed').length
  const inProgress= records.filter(r => r.status === 'in-progress').length
  const incomplete= records.filter(r => r.status === 'incomplete').length
  const pct       = total ? Math.round((completed / total) * 100) : 0

  return (
    <div className="rec-page">
      <header className="route-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>← 返回</button>
        <span className="route-title">練習紀錄</span>
        <span />
      </header>

      <main className="rec-main">

        {/* ── 進度條 ── */}
        <section className="rec-progress-card">
          <div className="prog-top">
            <span className="prog-title">練習完成度</span>
          </div>
          <div className="prog-bar-row">
            <span className="prog-count">{completed} / {total} 次</span>
            <span className="prog-pct">{pct}%</span>
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="prog-stats">
            <div className="prog-stat done">
              <span className="ps-num">{completed}</span>
              <span className="ps-lbl">完成</span>
            </div>
            <div className="prog-stat ing">
              <span className="ps-num">{inProgress}</span>
              <span className="ps-lbl">練習中</span>
            </div>
            <div className="prog-stat none">
              <span className="ps-num">{incomplete}</span>
              <span className="ps-lbl">未完成</span>
            </div>
          </div>
        </section>

        {/* ── 紀錄卡片 ── */}
        {records.length === 0 ? (
          <p className="rec-empty">還沒有練習紀錄，完成第一次練習後會顯示在這裡。</p>
        ) : (
          <div className="rec-grid">
            {records.map(r => (
              <div key={r.id} className="rec-card">
                <button
                  className={`fav-btn ${r.favorited ? 'faved' : ''}`}
                  onClick={() => toggleFav(r.id)}
                  title="收藏路線"
                >
                  {r.favorited ? '❤️' : '🤍'}
                </button>

                <div className="rec-row"><span className="rc-key">練習日期</span><span>{r.date}</span></div>
                <div className="rec-row"><span className="rc-key">練習路徑</span><span className="rc-route">{r.routeName}</span></div>
                <div className="rec-row"><span className="rc-key">練習時間</span><span>{r.startTime} – {r.endTime}</span></div>
                <div className="rec-row"><span className="rc-key">距離長度</span><span>{r.distance} 公里</span></div>
                <div className="rec-row align-top">
                  <span className="rc-key">完成度</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="rec-row"><span className="rc-key">本次得分</span><span className="rc-score">+{r.score} 分</span></div>

                <button className="more-btn" onClick={() => { setSelected(r); setMapOpen(false) }}>
                  查看更多
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── 詳細 Modal ── */}
      {selected && !mapOpen && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            <h3 className="modal-title">練習詳情</h3>

            <div className="modal-rows">
              {[
                ['練習日期', selected.date],
                ['練習路徑', selected.routeName],
                ['距離長度', `${selected.distance} 公里`],
                ['練習時間', `${selected.startTime} – ${selected.endTime}`],
              ].map(([k, v]) => (
                <div key={k} className="modal-row">
                  <span className="mr-key">{k}</span><span>{v}</span>
                </div>
              ))}

              <div className="modal-row align-top">
                <span className="mr-key">完成度</span>
                <StatusBadge status={selected.status} />
              </div>

              <div className="modal-row">
                <span className="mr-key">難易度</span>
                <span>{'⭐'.repeat(selected.difficulty)}</span>
              </div>
              <div className="modal-row">
                <span className="mr-key">路線偏好</span>
                <span>
                  {selected.prefs.bridge ? '✅' : '❌'} 橋樑
                  {selected.prefs.tunnel ? '✅' : '❌'} 隧道
                </span>
              </div>
              <div className="modal-row">
                <span className="mr-key">本次得分</span>
                <span className="rc-score">+{selected.score} 分</span>
              </div>
            </div>

            {selected.coords?.length > 0 && (
              <button className="map-btn" onClick={() => setMapOpen(true)}>🗺 查看路線地圖</button>
            )}
            <button className="confirm-btn" onClick={() => setSelected(null)}>確認</button>
          </div>
        </div>
      )}

      {/* ── 地圖 Modal ── */}
      {selected && mapOpen && (
        <div className="modal-overlay">
          <div className="map-modal">
            <button className="map-close" onClick={() => setMapOpen(false)}>✕</button>
            <p className="map-modal-title">{selected.routeName}</p>
            <MapContainer
              key={selected.id}
              center={selected.coords[0]}
              zoom={14}
              className="rec-map"
              zoomControl
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
              />
              <FitBounds coords={selected.coords} />
              <Polyline positions={selected.coords} color="#4f7cff" weight={5} opacity={0.85} />
              <CircleMarker center={selected.coords[0]}
                radius={9} fillColor="#2e7d32" color="#fff" weight={2} fillOpacity={1} />
              <CircleMarker center={selected.coords[selected.coords.length - 1]}
                radius={9} fillColor="#c62828" color="#fff" weight={2} fillOpacity={1} />
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  )
}
