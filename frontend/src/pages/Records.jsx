import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { RotateCcw, ChevronRight, Heart, CalendarDays, X, ArrowLeft } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/records.css'

const DIFF_STARS = { BEGINNER: 1, NORMAL: 2, EXPERIENCED: 3 }
const WEEKDAYS   = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function fmtHHMM(isoStr) {
  if (!isoStr) return '--'
  const dt = new Date(isoStr)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function fromBackend(h) {
  const dt = new Date(h.practice_time)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const displayStatus = h.terminated_early ? 'terminated' : (h.status ?? 'completed')
  return {
    id:              h.practice_id,
    route_id:        h.route_id,
    date:            `${mm}/${dd}`,
    startTime:       fmtHHMM(h.practice_time),
    endTime:         fmtHHMM(h.end_time),
    routeName:       h.route_name,
    distance:        h.total_distance_m ? +(h.total_distance_m / 1000).toFixed(2) : '--',
    difficulty:      DIFF_STARS[h.selected_difficulty] ?? 1,
    diffCode:        h.selected_difficulty,
    status:          displayStatus,
    score:           h.score_earned,
    coords:          null,
    coordsMulti:     null,
    favorited:       h.is_favorite ?? false,
    gpsVerified:     h.gps_verified     ?? false,
    terminatedEarly: h.terminated_early ?? false,
    prefs:           { bridge: false, tunnel: false },
    start:           h.start_name ?? null,   // 起點地名（DB 持久化）
    end:             h.end_name   ?? null,   // 終點地名（DB 持久化）
    // 後端補回預計時間（秒 → 分鐘）
    time:            h.estimated_duration_sec
                       ? Math.ceil(h.estimated_duration_sec / 60)
                       : null,
  }
}

function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (!coords?.length) return
    map.invalidateSize()
    map.fitBounds(coords, { padding: [24, 24] })
  }, [map, coords])
  return null
}

const STATUS_META = {
  completed:     { label: '完成',   cls: 'st-done'       },
  'in-progress': { label: '練習中', cls: 'st-ing'        },
  in_progress:   { label: '練習中', cls: 'st-ing'        },
  incomplete:    { label: '未完成', cls: 'st-none'       },
  terminated:    { label: '終止',   cls: 'st-terminated' },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: '未知', cls: 'st-off' }
  return <span className={`st-pill ${meta.cls}`}>{meta.label}</span>
}

function CarIcon() {
  return (
    <svg viewBox="0 0 70 42" width="54" height="34" xmlns="http://www.w3.org/2000/svg">
      <path d="M 10 26 Q 6 26 8 19 L 14 11 Q 19 4 32 4 L 46 4 Q 56 4 60 11 L 64 19 Q 66 26 62 26 Z" fill="#ff6b35" />
      <path d="M 25 6 L 44 6 Q 52 6 55 11 L 58 17 L 16 17 Z" fill="#264653" />
      <path d="M 27 8 L 38 8 L 40 15 L 21 15 Z" fill="#ffffff" opacity="0.35" />
      <path d="M 41 8 L 49 8 L 54 15 L 42 15 Z" fill="#ffffff" opacity="0.35" />
      <circle cx="21" cy="27" r="7.5" fill="#1e293b" stroke="#ffffff" strokeWidth="2" />
      <circle cx="21" cy="27" r="3" fill="#cbd5e1" />
      <circle cx="49" cy="27" r="7.5" fill="#1e293b" stroke="#ffffff" strokeWidth="2" />
      <circle cx="49" cy="27" r="3" fill="#cbd5e1" />
    </svg>
  )
}

function getWeekday(mmdd) {
  if (!mmdd || mmdd === '--') return ''
  const [mm, dd] = mmdd.split('/')
  const year = new Date().getFullYear()
  const dt = new Date(year, parseInt(mm) - 1, parseInt(dd))
  return WEEKDAYS[dt.getDay()]
}

// 從 startTime 萃取分鐘數（無論格式是 "14:16" 還是舊格式 "6/6 01:47"）
function parseMinutes(timeStr) {
  if (!timeStr || timeStr === '--') return -1
  const m = timeStr.match(/(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : -1
}

// 產生用於排序的數字 key（越大 = 越新）
function recSortKey(r) {
  if (!r.date || r.date === '--') return 0
  const parts = r.date.split('/')
  const mm = parseInt(parts[0]) || 0
  const dd = parseInt(parts[1]) || 0
  const mins = parseMinutes(r.startTime)
  return mm * 1000000 + dd * 10000 + (mins >= 0 ? mins : 0)
}

function groupByDate(records) {
  const groups = {}
  const order  = []
  records.forEach(r => {
    const d = r.date ?? '--'
    if (!groups[d]) { groups[d] = []; order.push(d) }
    groups[d].push(r)
  })
  return order.map(d => ({
    date:    d,
    day:     d !== '--' ? d.split('/')[1] : '--',
    month:   d !== '--' ? d.split('/')[0] : '--',
    weekday: getWeekday(d),
    records: groups[d],
  }))
}

export default function Records() {
  const navigate = useNavigate()
  const location = useLocation()
  const [records,    setRecords]    = useState([])
  const [selected,   setSelected]   = useState(null)
  const [mapOpen,    setMapOpen]    = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [favOnly,      setFavOnly]      = useState(false)
  const [dateFilter,   setDateFilter]   = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [user,         setUser]         = useState(null)
  // 從 Dashboard「查看更多」跳過來時，自動開啟對應紀錄的 modal
  const [autoOpenId, setAutoOpenId] = useState(location.state?.openId ?? null)

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('currentUser') || '{}')
    if (stored.username) setUser(stored)

    const token = localStorage.getItem('token')
    if (token) {
      api.get('/practice/history')
        .then(res => {
          const backendRecords = res.data.history.map(fromBackend)
          const local    = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
          const localMap = Object.fromEntries(local.map(r => [r.id, r]))
          const merged   = backendRecords.map(r => {
            const loc = localMap[r.id]
            return {
              ...r,
              // 優先用 localStorage 的時間（客戶端實際時間更準確）
              date:       loc?.date      ?? r.date,
              startTime:  loc?.startTime ?? r.startTime,
              endTime:    loc?.endTime   ?? r.endTime,
              // 其他欄位（後端有的優先用後端，localStorage 補前端限定欄位）
              favorited:   loc?.favorited   ?? r.favorited,
              coords:      loc?.coords      ?? null,
              coordsMulti: loc?.coordsMulti ?? null,
              routeName:   loc?.routeName   ?? r.routeName,
              start:       loc?.start       ?? r.start,    // 後端 start_name 作為 fallback
              end:         loc?.end         ?? r.end,      // 後端 end_name 作為 fallback
              startCoord:  loc?.startCoord  ?? null,
              endCoord:    loc?.endCoord    ?? null,
              diffCode:    loc?.diffCode    ?? r.diffCode,
              route_id:    r.route_id       ?? loc?.route_id ?? null,  // 後端優先
              time:        loc?.time        ?? r.time,
              prefs:       loc?.prefs       ?? r.prefs,
            }
          })
          const backendIds = new Set(backendRecords.map(r => r.id))
          const localOnly  = local.filter(r => !backendIds.has(r.id))
          const all = [...localOnly, ...merged]
          all.sort((a, b) => recSortKey(b) - recSortKey(a))
          setRecords(all)
        })
        .catch(() => {
          const s = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
          setRecords(s)
        })
    } else {
      const s = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
      setRecords(s)
    }
  }, [])

  // 當 records 載入後，若有 autoOpenId 就自動展開對應的詳情 modal
  useEffect(() => {
    if (!autoOpenId || records.length === 0) return
    const rec = records.find(r => r.id === autoOpenId)
    if (rec) {
      setSelected(rec)
      setMapOpen(false)
      setAutoOpenId(null)
    }
  }, [records, autoOpenId])

  function toggleFav(id) {
    const updated = records.map(r => r.id === id ? { ...r, favorited: !r.favorited } : r)
    setRecords(updated)
    localStorage.setItem('practiceRecords', JSON.stringify(updated))
    api.put(`/practice/${id}/favorite`).catch(() => {})
  }

  async function handleViewMap() {
    // 有本地座標 → 直接開
    if (selected.coordsMulti?.length || selected.coords?.length) {
      setMapOpen(true)
      return
    }
    // 沒有座標但有 route_id → 輕量懶加載（只取座標，不需完整 GeoJSON）
    if (!selected.route_id) return
    setMapLoading(true)
    try {
      const res = await api.get(`/route/${selected.route_id}/coords`)
      const coords = res.data.coords ?? []
      setSelected(prev => ({ ...prev, coords }))
      setMapOpen(true)
    } catch {
      // fetch 失敗就不開地圖，靜默處理
    } finally {
      setMapLoading(false)
    }
  }

  function buildSegmentsFromRecord(r) {
    if (r.coordsMulti?.length) {
      return {
        type: 'FeatureCollection',
        features: r.coordsMulti.map(seg => ({
          type: 'Feature', properties: null,
          geometry: { type: 'LineString', coordinates: seg.map(([lat, lng]) => [lng, lat]) },
        })),
      }
    }
    if (r.coords?.length) {
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: r.coords.map(([lat, lng]) => [lng, lat]) } }],
      }
    }
    return null
  }

  async function handleRepeat(r) {
    const routeId = r.route_id ?? r.id
    try {
      // 從後端取完整路段幾何，確保地圖路徑正確
      const res = await api.get(`/route/${routeId}`)
      const d   = res.data
      navigate('/route-detail', {
        state: {
          route: {
            route_id:       d.route_id,
            start:          r.start      ?? r.routeName,
            end:            r.end        ?? '',
            startCoord:     r.startCoord ?? null,
            endCoord:       r.endCoord   ?? null,
            distance:       +(d.total_distance_m / 1000).toFixed(2),
            time:           d.estimated_duration_sec
                              ? Math.ceil(d.estimated_duration_sec / 60)
                              : (r.time ?? '--'),
            difficulty:     r.difficulty ?? 1,
            diffCode:       r.diffCode   ?? 'BEGINNER',
            estimatedScore: r.score      ?? 0,
            segments:       d.segments,
          },
          prefs: r.prefs ?? { bridge: false, tunnel: false },
        },
      })
    } catch {
      // API 失敗：fallback 用 localStorage 座標
      navigate('/route-detail', {
        state: {
          route: {
            route_id:       routeId,
            start:          r.start      ?? r.routeName,
            end:            r.end        ?? '',
            startCoord:     r.startCoord ?? null,
            endCoord:       r.endCoord   ?? null,
            distance:       r.distance,
            time:           r.time       ?? '--',
            difficulty:     r.difficulty ?? 1,
            diffCode:       r.diffCode   ?? 'BEGINNER',
            estimatedScore: r.score      ?? 0,
            segments:       buildSegmentsFromRecord(r),
          },
          prefs: r.prefs ?? { bridge: false, tunnel: false },
        },
      })
    }
  }

  const total      = records.length
  const completed  = records.filter(r => r.status === 'completed').length
  const inProgress = records.filter(r => ['in-progress', 'in_progress'].includes(r.status)).length
  const incomplete = records.filter(r => r.status === 'incomplete').length
  const terminated = records.filter(r => r.status === 'terminated').length
  const pct        = total ? Math.round((completed / total) * 100) : 0

  let filtered = favOnly ? records.filter(r => r.favorited) : records
  if (statusFilter !== 'all') filtered = filtered.filter(r => {
    if (statusFilter === 'in-progress') return ['in-progress', 'in_progress'].includes(r.status)
    if (statusFilter === 'incomplete')  return r.status === 'incomplete' || r.status === 'terminated'
    return r.status === statusFilter
  })
  if (dateFilter !== 'all') filtered = filtered.filter(r => r.date === dateFilter)

  function toggleStatusFilter(val) {
    setStatusFilter(prev => prev === val ? 'all' : val)
  }

  const groups      = groupByDate(filtered)
  const uniqueDates = [...new Set(records.map(r => r.date).filter(d => d && d !== '--'))]
  const userInitial = user?.username?.[0]?.toUpperCase() ?? 'U'
  // 已排序，第一筆就是最新的
  const newestId    = filtered[0]?.id

  return (
    <div className="rec-page">
      <div className="rec-layout">

      {/* ── 左側欄包裝（含外部返回按鈕）── */}
      <div className="rec-sidebar-wrap">
        <button className="rec-nav-back-outer" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={14} />
          <span>返回首頁</span>
        </button>

      <aside className="rec-sidebar">
        <h2 className="rec-sidebar-title">練習紀錄</h2>

        {/* 統計（可點選篩選）*/}
        <div className="rec-stats-block">
          {[
            ['完成',   completed,  'done',       'completed'],
            ['練習中', inProgress, 'ing',        'in-progress'],
            ['未完成', incomplete, 'none',       'incomplete'],
            ['終止',   terminated, 'terminated', 'terminated'],
          ].map(([label, num, cls, val]) => (
            <button
              key={label}
              className={`rec-stat-row rec-stat-${cls} ${statusFilter === val ? 'rec-stat-active' : ''}`}
              onClick={() => toggleStatusFilter(val)}
            >
              <span className="rec-stat-label">{label}</span>
              <span className="rec-stat-num">{num}</span>
            </button>
          ))}
        </div>

        {/* 完成度 */}
        <div className="rec-prog-header">
          <span>練習完成度</span>
          <span className="rec-prog-pct">{pct}%</span>
        </div>
        <div className="rec-prog-track">
          <div className="rec-prog-fill" style={{ width: `${pct}%` }} />
        </div>

        {/* 日期查詢 */}
        <p className="rec-filter-label">日期查詢</p>
        <div className="rec-date-picker-wrap">
          {/* 隱藏的原生 date input */}
          <input
            type="date"
            className="rec-date-input-hidden"
            id="rec-date-native"
            value={dateFilter === 'all' ? '' : (() => {
              const year = new Date().getFullYear()
              const [mm, dd] = dateFilter.split('/')
              return `${year}-${mm?.padStart(2,'0')}-${dd?.padStart(2,'0')}`
            })()}
            onChange={e => {
              if (!e.target.value) { setDateFilter('all'); return }
              const [, mm, dd] = e.target.value.split('-')
              setDateFilter(`${mm}/${dd}`)
            }}
          />
          {/* 自訂外觀的按鈕 */}
          <button
            className={`rec-date-trigger ${dateFilter !== 'all' ? 'has-value' : ''}`}
            onClick={() => {
              const el = document.getElementById('rec-date-native')
              el?.showPicker?.()
              el?.focus()
            }}
          >
            <CalendarDays size={15} />
            <span>
              {dateFilter === 'all'
                ? '選擇日期'
                : `${dateFilter} ${getWeekday(dateFilter)}`
              }
            </span>
            {dateFilter !== 'all' && (
              <span
                className="rec-date-trigger-clear"
                onClick={e => { e.stopPropagation(); setDateFilter('all') }}
              >
                <X size={13} />
              </span>
            )}
          </button>
        </div>
        {dateFilter !== 'all' && (
          <p className="rec-date-result-hint">
            共 {records.filter(r => r.date === dateFilter).length} 筆練習紀錄
          </p>
        )}

        {/* 收藏 */}
        <button
          className={`rec-fav-all-btn ${favOnly ? 'active' : ''}`}
          onClick={() => setFavOnly(v => !v)}
        >
          <Heart size={14} fill={favOnly ? '#ff6b35' : 'none'} />
          收藏路徑
        </button>
      </aside>
      </div>{/* /rec-sidebar-wrap */}

      {/* ── 右側時間軸 ── */}
      <main className="rec-content">
        {/* 右上用戶 */}
        {user && (
          <div className="rec-top-user">
            <div className="rec-user-avatar">{userInitial}</div>
            <span>Hi, {user.username}</span>
          </div>
        )}

        {records.length === 0 ? (
          <p className="rec-empty">還沒有練習紀錄，完成第一次練習後會顯示在這裡。</p>
        ) : filtered.length === 0 ? (
          <p className="rec-empty">這個篩選條件下沒有紀錄。</p>
        ) : (
          groups.map((group, gi) => (
            <div key={group.date} className="rec-date-group">
              {/* 日期標頭 */}
              <div className="rec-group-header">
                <div className="rec-date-badge">
                  <span className="rec-badge-day">{group.day}</span>
                  <span className="rec-badge-month">/{group.month}</span>
                </div>
                <div>
                  <p className="rec-group-date">{group.date} {group.weekday}</p>
                  <p className="rec-group-count">{group.records.length} 筆練習</p>
                </div>
              </div>

              {/* 紀錄列 */}
              {group.records.map((r, ri) => (
                <div key={r.id} className="rec-timeline-card">
                  <div className="rec-tc-icon">
                    <CarIcon />
                  </div>
                  <div className="rec-tc-info">
                    <div className="rec-tc-name">
                      {r.start && r.end ? `${r.start} → ${r.end}` : r.routeName}
                      {r.id === newestId && <span className="rec-newest-tag">最新</span>}
                    </div>
                    <div className="rec-tc-meta">
                      {r.startTime}—{r.endTime} · {r.distance} 公里
                    </div>
                  </div>
                  <div className="rec-tc-status">
                    <StatusBadge status={r.status} />
                    <span className="rec-tc-score">+{r.score} 分</span>
                  </div>
                  <div className="rec-tc-actions">
                    <button
                      className={`rec-fav-btn ${r.favorited ? 'faved' : ''}`}
                      onClick={() => toggleFav(r.id)}
                    >
                      <Heart size={15} fill={r.favorited ? '#ff6b35' : 'none'} />
                    </button>
                    <button className="rec-btn rec-btn-ghost" onClick={() => { setSelected(r); setMapOpen(false) }}>
                      查看更多 <ChevronRight size={14} />
                    </button>
                    <button className="rec-btn rec-btn-primary" onClick={() => handleRepeat(r)}>
                      <RotateCcw size={14} /> 再練習一次
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </main>
      </div>{/* /rec-layout */}

      {/* ── 詳細 Modal ── */}
      {selected && !mapOpen && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            <h3 className="modal-title">練習詳情</h3>
            <div className="modal-rows">
              {[
                ['練習日期', selected.date],
                ['練習路徑', selected.start && selected.end
                  ? `${selected.start} → ${selected.end}`
                  : selected.routeName],
                ['距離長度', `${selected.distance} 公里`],
                ['練習時間', `${selected.startTime} – ${selected.endTime}`],
                ['預計時間', selected.time && selected.time !== '--' && selected.time !== 'undefined' ? `${selected.time} 分鐘` : '--'],
              ].map(([k, v]) => (
                <div key={k} className="modal-row">
                  <span className="mr-key">{k}</span><span>{v}</span>
                </div>
              ))}
              <div className="modal-row">
                <span className="mr-key">完成度</span>
                <StatusBadge status={selected.status} />
              </div>
              <div className="modal-row">
                <span className="mr-key">難易度</span>
                <span>{'⭐'.repeat(selected.difficulty ?? 1)}</span>
              </div>
              <div className="modal-row">
                <span className="mr-key">本次得分</span>
                <span className="rc-score">+{selected.score} 分</span>
              </div>
            </div>
            {selected.gpsVerified     && <div className="rec-gps-badge">✅ GPS 驗證到達終點</div>}
            {selected.terminatedEarly && <div className="rec-terminated-note">⚠️ 提前終止練習（0.8 折計分）</div>}
            {selected.route_id && (
              <button className="map-btn" onClick={handleViewMap} disabled={mapLoading}>
                {mapLoading ? '載入地圖…' : '🗺 查看路線地圖'}
              </button>
            )}
            <button
              className="rec-btn rec-btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
              onClick={() => handleRepeat(selected)}
            >
              <RotateCcw size={14} /> 再練習一次
            </button>
            <button className="confirm-btn" onClick={() => setSelected(null)}>關閉</button>
          </div>
        </div>
      )}

      {/* ── 地圖 Modal ── */}
      {selected && mapOpen && (
        <div className="modal-overlay">
          <div className="map-modal">
            <button className="map-close" onClick={() => setMapOpen(false)}>✕</button>
            <p className="map-modal-title">
              {selected.start && selected.end
                ? `${selected.start} → ${selected.end}`
                : selected.routeName}
            </p>
            <MapContainer
              key={selected.id}
              center={selected.coords?.[0] ?? [25.04, 121.37]}
              zoom={14}
              className="rec-map"
              zoomControl
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              <FitBounds coords={selected.coords} />
              {selected.coordsMulti?.length > 0
                ? selected.coordsMulti.map((seg, i) => (
                    <Polyline key={i} positions={seg} color="#ff6b35" weight={5} opacity={0.85} />
                  ))
                : <Polyline positions={selected.coords} color="#ff6b35" weight={5} opacity={0.85} />
              }
              {selected.coords?.[0] && (
                <CircleMarker center={selected.coords[0]} radius={9} fillColor="#264653" color="#fff" weight={2} fillOpacity={1} />
              )}
              {selected.coords?.length > 1 && (
                <CircleMarker center={selected.coords[selected.coords.length - 1]} radius={9} fillColor="#ff6b35" color="#fff" weight={2} fillOpacity={1} />
              )}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  )
}
