import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, MapPin, ArrowRight, Zap, Navigation, BookOpen, Map } from 'lucide-react'
import { MapContainer, TileLayer, Polyline, useMap, GeoJSON, CircleMarker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/dashboard.css'
import '../styles/route.css'

/* ── 可愛小車 SVG ── */
function CarSVG() {
  return (
    <g>
      {/* 車影 */}
      <ellipse cx="22" cy="37" rx="19" ry="3.5" fill="rgba(0,0,0,0.10)" />
      {/* 車身 */}
      <rect x="1" y="18" width="42" height="16" rx="5" fill="#ff6b35" />
      {/* 車頂 */}
      <path d="M 9 18 Q 10 7 15 7 L 31 7 Q 37 7 36 18 Z" fill="#e05a2b" />
      {/* 車窗 */}
      <rect x="11" y="9"  width="8" height="7" rx="1.5" fill="rgba(210,240,250,0.88)" />
      <rect x="23" y="9"  width="9" height="7" rx="1.5" fill="rgba(210,240,250,0.88)" />
      {/* 車輪 */}
      <circle cx="11" cy="34" r="6.5" fill="#1d3a47" />
      <circle cx="11" cy="34" r="2.8" fill="#7e8b9b" />
      <circle cx="33" cy="34" r="6.5" fill="#1d3a47" />
      <circle cx="33" cy="34" r="2.8" fill="#7e8b9b" />
      {/* 車燈 */}
      <circle cx="44" cy="22" r="2.2" fill="#fbbf24" />
      {/* 前保桿 */}
      <rect x="42" y="25" width="4" height="5" rx="1.5" fill="#c44d0a" />
    </g>
  )
}

/* ── 道路等級卡 ── */
function LevelRoad({ score, level, gapToNext }) {
  const safeScore  = score ?? 0
  const pct        = Math.min(safeScore / 300, 1)
  const scrollRef  = useRef(null)
  const PATH_LEN   = 880   // 估算弧長
  const traveled   = pct * PATH_LEN
  const roadPath   = 'M 20 118 Q 175 66 345 104 Q 510 142 665 102 Q 762 78 855 92'

  const milestones = [
    { label: '新手駕駛', pts: '0 PTS',   cx: 62,  cy: 115, active: safeScore < 150 },
    { label: '一般駕駛', pts: '150 PTS', cx: 445, cy: 119, active: safeScore >= 150 && safeScore < 300 },
    { label: '熟練駕駛', pts: '300 PTS', cx: 838, cy:  93, active: safeScore >= 300 },
  ]

  const carX = 62 + pct * 776
  const carY = safeScore < 150
    ? 115 - (safeScore / 150) * 4
    : safeScore < 300
      ? 119 - ((safeScore - 150) / 150) * 26
      : 93

  /* 首次載入：讓車子置中在可見範圍 */
  useEffect(() => {
    if (!scrollRef.current) return
    const containerW = scrollRef.current.offsetWidth
    const scale      = 860 / 900
    scrollRef.current.scrollLeft = Math.max(0, carX * scale - containerW / 2)
  }, []) // eslint-disable-line

  return (
    <div className="dash-progress-card">
      <div className="dash-progress-header">
        <div className="track-dot-icon" />
        <span>等級晉升路徑</span>
      </div>

      {/* 橫向可滑動容器 */}
      <div className="dash-road-scroll" ref={scrollRef}>
        <svg viewBox="0 0 900 160" style={{ width: '860px', height: '140px', display: 'block', flexShrink: 0 }}>

          <defs>
            {/* 橘色發光濾鏡 */}
            <filter id="orange-glow" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* 路面陰影 */}
          <path d={roadPath} stroke="rgba(0,0,0,0.06)" strokeWidth="58" fill="none" strokeLinecap="round" />
          {/* 路面 */}
          <path d={roadPath} stroke="#d1d5db" strokeWidth="52" fill="none" strokeLinecap="round" />

          {/* 細橘色軌跡線（走過的路，微微發亮） */}
          {pct > 0 && (
            <path d={roadPath} stroke="#ff6b35" strokeWidth="3.5" fill="none" strokeLinecap="round"
              strokeDasharray={`${traveled} ${PATH_LEN}`} filter="url(#orange-glow)" />
          )}

          {/* 白色中央虛線（全段） */}
          <path d={roadPath} stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="20 14" />

          {/* 里程碑：三個都顯示方塊，只有當前等級是橘色 */}
          {milestones.map((m, i) => (
            <g key={i}>
              <circle cx={m.cx} cy={m.cy} r="7"
                fill={m.active ? '#ff6b35' : 'rgba(255,255,255,0.85)'}
                stroke={m.active ? '#ff6b35' : '#c0c6ce'} strokeWidth="2" />
              <g>
                {/* 方塊陰影 */}
                <rect x={m.cx-54} y={m.cy-76} width="108" height="54" rx="10"
                  fill="rgba(0,0,0,0.04)" transform="translate(0,2)" />
                {/* 方塊 */}
                <rect x={m.cx-54} y={m.cy-78} width="108" height="56" rx="10"
                  fill="white"
                  stroke={m.active ? 'rgba(255,107,53,0.25)' : 'rgba(192,198,206,0.6)'}
                  strokeWidth="1.5" />
                {/* 等級名稱 */}
                <text x={m.cx} y={m.cy-50} textAnchor="middle"
                  fill={m.active ? '#ff6b35' : '#94a3b8'}
                  fontSize="15" fontWeight="900" fontFamily="PingFang TC,-apple-system,sans-serif">
                  {m.label}
                </text>
                {/* 分數 */}
                <text x={m.cx} y={m.cy-32} textAnchor="middle"
                  fill={m.active ? '#ff6b35' : '#b8c0ca'}
                  fontSize="13" fontWeight="700" fontFamily="system-ui">
                  {m.pts}
                </text>
                {/* 連接線 */}
                <line x1={m.cx} y1={m.cy-22} x2={m.cx} y2={m.cy-7}
                  stroke={m.active ? 'rgba(255,107,53,0.3)' : 'rgba(192,198,206,0.6)'} strokeWidth="1" />
              </g>
            </g>
          ))}

          {/* 車子 */}
          <g transform={`translate(${carX - 22}, ${carY - 22})`}>
            <CarSVG />
          </g>
        </svg>
      </div>

      {/* 底部提示 */}
      <p className="dash-level-hint">
        <Zap size={14} className="hint-zap" />
        {score} pts
        {level.next ? ` · 距升至${level.next}還差 ${Math.max(0, gapToNext)} pts` : ' · 已達最高等級！'}
      </p>
    </div>
  )
}

const LEVEL_MAP = {
  BEGINNER:    { label: '新手駕駛', level: 'LEVEL 1', color: '#ff6b35', bg: 'rgba(255,107,53,0.18)', next: '一般駕駛', nextScore: 150, prevScore: 0 },
  NORMAL:      { label: '一般駕駛', level: 'LEVEL 2', color: '#2a9d8f', bg: 'rgba(42,157,143,0.18)', next: '熟練駕駛', nextScore: 300, prevScore: 150 },
  EXPERIENCED: { label: '熟練駕駛', level: 'LEVEL 3', color: '#e76f51', bg: 'rgba(231,111,81,0.18)', next: null, nextScore: 1000, prevScore: 300 },
}

const STATUS_META = {
  completed:     { label: '完成',   color: '#2a9d8f', bg: '#e6f4f1' },
  'in-progress': { label: '練習中', color: '#ff6b35', bg: '#fff0e6' },
  in_progress:   { label: '練習中', color: '#ff6b35', bg: '#fff0e6' },
  incomplete:    { label: '未完成', color: '#94a3b8', bg: '#f0f0f0' },
}

function getLevel(user) {
  const score = user?.score ?? 0
  if (score >= 300) return LEVEL_MAP.EXPERIENCED
  if (score >= 150) return LEVEL_MAP.NORMAL
  return LEVEL_MAP.BEGINNER
}

function fmtDate(isoStr) {
  if (!isoStr) return '--'
  const dt = new Date(isoStr)
  return `${dt.getMonth() + 1}/${String(dt.getDate()).padStart(2, '0')}`
}

function recFromBackend(h, localMap = {}) {
  const id  = h.practice_id
  const loc = localMap[id]
  return {
    id,
    // 優先用 localStorage 的時間（客戶端實際開始/結束時間）
    date:      loc?.date  ?? fmtDate(h.practice_time),
    routeName: loc?.routeName ?? h.route_name,
    distance:  h.total_distance_m ? +(h.total_distance_m / 1000).toFixed(1) : 0,
    status:    h.status ?? 'completed',
    score:     h.score_earned ?? 0,
    coords:      loc?.coords      ?? null,
    coordsMulti: loc?.coordsMulti ?? null,
    time:        loc?.time        ?? (h.estimated_duration_sec ? Math.ceil(h.estimated_duration_sec / 60) : null),
    start:       loc?.start       ?? h.start_name ?? null,
    end:         loc?.end         ?? h.end_name   ?? null,
    startCoord:  loc?.startCoord  ?? null,
    endCoord:    loc?.endCoord    ?? null,
    diffCode:    loc?.diffCode    ?? null,
    route_id:    loc?.route_id    ?? h.route_id   ?? null,
  }
}

function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (!coords?.length) return
    map.invalidateSize()
    map.fitBounds(coords, { padding: [8, 8] })
  }, [map, coords])
  return null
}

// coordsMulti = [[seg1], [seg2], ...]；coords = flat（備援）
function MiniMap({ coords, coordsMulti, startCoord, endCoord }) {
  const hasCoords = coords?.length > 0
  if (!hasCoords) {
    return (
      <div className="dash-rec-map-placeholder">
        <Navigation size={24} strokeWidth={1.5} />
      </div>
    )
  }
  const center = coords[Math.floor(coords.length / 2)]
  // 若無明確起終點座標，fallback 用路線首末點
  const sCoord = startCoord ?? coords[0]
  const eCoord = endCoord   ?? coords[coords.length - 1]
  return (
    <MapContainer
      center={center} zoom={14}
      className="dash-rec-map"
      zoomControl={false} attributionControl={false}
      dragging={false} scrollWheelZoom={false}
      doubleClickZoom={false} keyboard={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds coords={coords} />
      {coordsMulti?.length > 0
        ? coordsMulti.map((seg, i) => (
            <Polyline key={i} positions={seg} color="#ff6b35" weight={3} opacity={0.9} />
          ))
        : <Polyline positions={coords} color="#ff6b35" weight={3} opacity={0.9} />
      }
      {sCoord && (
        <CircleMarker center={sCoord} radius={7}
          pathOptions={{ fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }}
        />
      )}
      {eCoord && (
        <CircleMarker center={eCoord} radius={7}
          pathOptions={{ fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  )
}

// ── 地圖點擊器 ─────────────────────────────────────────────────────────────
function MapClicker({ onPick }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]) } })
  return null
}

// Ray-casting：判斷點是否在單一環內
function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// 支援 Polygon 和 MultiPolygon
function pointInPolygon(lat, lng, geojson) {
  if (!geojson) return false
  const { type, coordinates } = geojson.geometry
  if (type === 'Polygon') return pointInRing(lat, lng, coordinates[0])
  if (type === 'MultiPolygon') return coordinates.some(p => pointInRing(lat, lng, p[0]))
  return false
}

// ── 地圖選點 Modal ──────────────────────────────────────────────────────────
function MapPickerModal({ target, otherCoord, onConfirm, onClose }) {
  const [picked,   setPicked]   = useState(null)
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [boundary, setBoundary] = useState(null)

  useEffect(() => {
    api.get('/district/boundary')
      .then(res => setBoundary(res.data))
      .catch(() => setBoundary(null))
  }, [])

  const isInside = picked ? pointInPolygon(picked[0], picked[1], boundary) : false

  async function handlePick(coord) {
    setPicked(coord)
    const inside = pointInPolygon(coord[0], coord[1], boundary)
    if (!inside) { setName(''); return }
    setLoading(true)
    setName('定位中...')
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('lat', coord[0])
      url.searchParams.set('lon', coord[1])
      url.searchParams.set('format', 'json')
      url.searchParams.set('accept-language', 'zh-TW,zh')
      url.searchParams.set('addressdetails', '1')
      const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
      const data = await res.json()
      const addr = data.address || {}
      const label = data.name ||
        addr.road || addr.pedestrian || addr.footway || addr.path ||
        addr.suburb || addr.village ||
        `${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`
      setName(label)
    } catch {
      setName(`${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-modal">
        <div className="map-picker-header">
          <span>📍 選擇{target === 'start' ? '起點' : '終點'}位置</span>
          <button className="map-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="map-picker-hint">
          {!picked && !otherCoord && '點擊橘色區域內的龜山區範圍來選取位置'}
          {!picked &&  otherCoord && target === 'end'   && '📌 綠點為已選起點，請在地圖上點選終點位置'}
          {!picked &&  otherCoord && target === 'start' && '📌 紅點為已選終點，請在地圖上點選起點位置'}
          {picked && !isInside && '⚠️ 所選位置超出龜山區範圍，請重新點選'}
          {picked && isInside && (loading ? '⏳ 定位中...' : `✅ 已選：${name}`)}
        </div>
        <div className="map-picker-map">
          <MapContainer
            center={[25.02, 121.35]} zoom={13}
            maxBounds={[[24.88, 121.18], [25.16, 121.52]]}
            maxBoundsViscosity={0.8} minZoom={11}
            style={{ width: '100%', height: 'min(420px, 55vh)' }}
            zoomControl
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {boundary && (
              <GeoJSON key="guishan" data={boundary}
                style={{ color: '#ff6b35', weight: 2.5, dashArray: '8,5', fillOpacity: 0.06 }}
              />
            )}
            <MapClicker onPick={handlePick} />
            {otherCoord && (
              <CircleMarker center={otherCoord} radius={9}
                pathOptions={{
                  fillColor: target === 'end' ? '#22c55e' : '#ef4444',
                  color: '#fff', weight: 2.5, fillOpacity: 1,
                }}
              />
            )}
            {picked && (
              <CircleMarker center={picked} radius={9}
                pathOptions={{
                  color:       '#fff',
                  fillColor:   isInside
                    ? (target === 'start' ? '#22c55e' : '#ef4444')
                    : '#e74c3c',
                  fillOpacity: 0.95, weight: 2.5,
                }}
              />
            )}
          </MapContainer>
        </div>
        <div className="map-picker-footer">
          <button className="map-picker-cancel" onClick={onClose}>取消</button>
          <button
            className="map-picker-confirm"
            disabled={!picked || !isInside || loading}
            onClick={() => { onConfirm(name, picked); onClose() }}
          >
            確認選點
          </button>
        </div>
      </div>
    </div>
  )
}

function LocationInput({ value, coord, onChange, onSelect, placeholder, label, dotClass, extraButtons }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow] = useState(false)
  const timerRef = useRef(null)

  function handleChange(e) {
    const q = e.target.value
    onChange(q, null)
    setSuggestions([])
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) return
    timerRef.current = setTimeout(async () => {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', q)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', '5')
        url.searchParams.set('accept-language', 'zh-TW,zh')
        url.searchParams.set('countrycodes', 'tw')
        const res = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
        const data = await res.json()
        setSuggestions(data)
        setShow(true)
      } catch {}
    }, 400)
  }

  function handleSelect(item) {
    const text = item.display_name.split(',')[0].trim()
    const c = [parseFloat(item.lat), parseFloat(item.lon)]
    onChange(text, c)
    onSelect(c)
    setSuggestions([])
    setShow(false)
  }

  function shortName(dn) { return dn.split(',').slice(0, 3).join(',').trim() }

  return (
    <div className="dash-field-group">
      <div className="dash-field-header">
        <span className={`dash-dot ${dotClass}`} />
        <label className="dash-input-label">{label}</label>
      </div>
      <div className="dash-input-body" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="dash-input-box" type="text" value={value}
            onChange={handleChange}
            onFocus={() => suggestions.length > 0 && setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 200)}
            placeholder={placeholder}
          />
          {coord && <MapPin size={13} className="dash-coord-ok" />}
          {show && suggestions.length > 0 && (
            <ul className="dash-suggest-list">
              {suggestions.map((item, i) => (
                <li key={i} onMouseDown={() => handleSelect(item)}>
                  <span className="dash-suggest-name">{item.display_name.split(',')[0].trim()}</span>
                  <span className="dash-suggest-addr">{shortName(item.display_name)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {extraButtons}
      </div>
    </div>
  )
}

// 地圖/GPS 按鈕共用樣式
const mapIconBtnStyle = {
  width: '34px', height: '34px',
  borderRadius: '9px',
  border: '1.5px solid rgba(38,70,83,0.12)',
  background: '#f4f5f7',
  color: '#7e8b9b',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
  transition: 'all 0.15s',
  padding: 0,
}

export default function Dashboard() {
  const [user, setUser]               = useState(null)
  const [totalKm, setTotalKm]         = useState(0)
  const [totalCount, setTotalCount]   = useState(0)
  const [recentRecs, setRecentRecs]   = useState([])
  const [startText, setStartText]     = useState('')
  const [startCoord, setStartCoord]   = useState(null)
  const [endText, setEndText]         = useState('')
  const [endCoord, setEndCoord]       = useState(null)
  const [detailRec, setDetailRec]     = useState(null)
  const [mapPicker, setMapPicker]     = useState(null)   // 'start' | 'end' | null
  const [gpsStatus, setGpsStatus]     = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const navigate = useNavigate()

  // ── GPS 一鍵定位起點 ────────────────────────────────────────────────────────
  async function handleGPS() {
    if (!navigator.geolocation) return
    setGpsStatus('loading')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse')
          url.searchParams.set('lat', lat)
          url.searchParams.set('lon', lng)
          url.searchParams.set('format', 'json')
          url.searchParams.set('accept-language', 'zh-TW,zh')
          const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
          const data = await res.json()
          const addr = data.address || {}
          const name = data.name || addr.road || addr.pedestrian ||
            addr.suburb || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          setStartText(name)
          setStartCoord([lat, lng])
        } catch {
          setStartText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setStartCoord([lat, lng])
        }
        setGpsStatus('done')
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
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
          prefs: {},
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
          prefs: {},
        },
      })
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    api.get('/user/me')
      .then(res => {
        const data  = res.data
        const local = JSON.parse(localStorage.getItem('currentUser') || '{}')
        const u = {
          ...local,   // 保留地址等本地欄位
          user_id:    data.user_id,
          name:       data.username,
          email:      data.email,
          score:      data.total_score || 0,
          level_code: data.level_code,
        }
        setUser(u)
        localStorage.setItem('currentUser', JSON.stringify(u))
      })
      .catch(() => { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); navigate('/login') })

    api.get('/practice/history')
      .then(res => {
        const hist = res.data.history || []
        const local = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
        const localMap = Object.fromEntries(local.map(r => [r.id, r]))
        const km = hist.reduce((sum, h) => sum + (h.total_distance_m || 0), 0)
        setTotalKm(+(km / 1000).toFixed(1))
        setTotalCount(hist.length)
        setRecentRecs(hist.slice(0, 10).map(h => {
          const r = recFromBackend(h, localMap)
          return {
            ...r,
            routeName:   localMap[r.id]?.routeName   ?? r.routeName,
            coordsMulti: localMap[r.id]?.coordsMulti ?? null,
          }
        }))
      })
      .catch(() => {
        const local = JSON.parse(localStorage.getItem('practiceRecords') || '[]')
        const km = local.reduce((sum, r) => sum + (r.distance || 0), 0)
        setTotalKm(+km.toFixed(1))
        setTotalCount(local.length)
        setRecentRecs(local.slice(0, 10))
      })
  }, [navigate])

  if (!user) return null

  const level = getLevel(user)

  // 進度條：基於完整 0→300 刻度
  const FULL_MAX = 300
  const overallPct = Math.min((user.score / FULL_MAX) * 100, 100)

  const gapToNext = level.nextScore - user.score

  function handleGoRoute() {
    navigate('/route', { state: { startText, startCoord, endText, endCoord } })
  }

  return (
    <div className="dash-page">
      <main className="dash-layout">

        {/* ── 左側：路徑規劃白卡 ── */}
        <section className="dash-left">
          <div className="dash-route-card">
            <div className="dash-greeting">
              <p className="dash-hi">Hi {user.name} </p>
              <h2 className="dash-heading">今天要去哪裡練習？</h2>
              <p className="dash-sub">輸入起終點，為你規劃屬於你的練習路線</p>
            </div>

            <div className="dash-inputs">
              <LocationInput
                value={startText} coord={startCoord}
                onChange={(t, c) => { setStartText(t); setStartCoord(c); if (!c) setGpsStatus('idle') }}
                onSelect={c => setStartCoord(c)}
                placeholder="輸入起點地址（例如：長庚大學）" label="起點" dotClass="dot-start"
                extraButtons={
                  <>
                    <button
                      type="button"
                      style={{
                        ...mapIconBtnStyle,
                        ...(mapPicker === 'start' ? { background: '#ff6b35', color: '#fff', borderColor: '#ff6b35' } : {}),
                      }}
                      onClick={() => setMapPicker('start')}
                      title="在地圖上選取起點"
                    >
                      <Map size={15} />
                    </button>
                    <button
                      type="button"
                      style={{
                        ...mapIconBtnStyle,
                        ...(gpsStatus === 'done'    ? { color: '#2a9d8f', borderColor: '#2a9d8f' } : {}),
                        ...(gpsStatus === 'error'   ? { color: '#e76f51', borderColor: '#e76f51' } : {}),
                        ...(gpsStatus === 'loading' ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                      }}
                      onClick={handleGPS}
                      disabled={gpsStatus === 'loading'}
                      title={
                        gpsStatus === 'loading' ? '定位中...' :
                        gpsStatus === 'done'    ? '已定位，點擊重新定位' :
                        gpsStatus === 'error'   ? '定位失敗，點擊重試' :
                                                  '使用目前位置作為起點'
                      }
                    >
                      <Navigation size={15} />
                    </button>
                  </>
                }
              />
              <div className="dash-input-connector" />
              <LocationInput
                value={endText} coord={endCoord}
                onChange={(t, c) => { setEndText(t); setEndCoord(c) }}
                onSelect={c => setEndCoord(c)}
                placeholder="輸入終點地址（例如：林口長庚醫院）" label="終點" dotClass="dot-end"
                extraButtons={
                  <button
                    type="button"
                    style={{
                      ...mapIconBtnStyle,
                      ...(mapPicker === 'end' ? { background: '#ff6b35', color: '#fff', borderColor: '#ff6b35' } : {}),
                    }}
                    onClick={() => setMapPicker('end')}
                    title="在地圖上選取終點"
                  >
                    <Map size={15} />
                  </button>
                }
              />
            </div>

            <button className="dash-cta-btn" onClick={handleGoRoute}>
              <MapPin size={17} /> 生成練習路徑 <ArrowRight size={17} />
            </button>
          </div>
        </section>

        {/* ── 右側：分割卡 + 進度卡 ── */}
        <section className="dash-right">

          {/* 用戶資訊卡：白卡 + 漸層 Header */}
          <div className="dash-user-card">
            {/* 漸層 Header Bar */}
            <div className="dash-user-header">
              {/* 左：等級資訊 */}
              <div className="dash-user-header-left">
                <span className="dash-user-level-tag">{level.level}</span>
                <span className="dash-user-level-name">{level.label}</span>
              </div>
              {/* 右：累計積分 */}
              <div className="dash-user-header-right">
                <div className="dash-user-score-num">
                  <Zap size={16} className="dash-user-score-zap" />
                  {user.score}
                </div>
                <span className="dash-user-score-label">累計積分</span>
              </div>
            </div>

            {/* 白色統計區 */}
            <div className="dash-user-body">
              <div className="dash-stats-row">
                <div className="dash-stat">
                  <BookOpen size={18} className="dash-stat-icon orange" />
                  <div>
                    <p className="dash-stat-label">練習次數</p>
                    <p className="dash-stat-num">{totalCount} <span>次</span></p>
                  </div>
                </div>
                <div className="dash-stat-divider" />
                <div className="dash-stat">
                  <Navigation size={18} className="dash-stat-icon teal" />
                  <div>
                    <p className="dash-stat-label">累計里程</p>
                    <p className="dash-stat-num">{totalKm} <span>km</span></p>
                  </div>
                </div>
              </div>

              <button className="dash-white-profile-btn" onClick={() => navigate('/profile')}>
                <User size={16} /> 個人檔案
              </button>
            </div>
          </div>

          {/* 等級晉升路徑 - 道路+車子 */}
          <LevelRoad score={user.score} level={level} gapToNext={gapToNext} />

        </section>
      </main>

      {/* ── 最近練習紀錄（橫向滑動）── */}
      <section className="dash-rec-section">
        <div className="dash-rec-section-hd">
          <h3 className="dash-rec-section-title">最近練習紀錄</h3>
          <button className="dash-rec-see-all" onClick={() => navigate('/records')}>
            查看全部 <ArrowRight size={15} />
          </button>
        </div>

        {recentRecs.length === 0 ? (
          /* 空狀態 */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '36px 20px', gap: '10px',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px',
              background: 'rgba(255,107,53,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={26} color="#ff6b35" strokeWidth={1.8} />
            </div>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#264653', margin: 0 }}>
              還沒有練習紀錄
            </p>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              輸入起終點，生成路徑開始你的第一次練習吧！
            </p>
            <button
              onClick={() => navigate('/route')}
              style={{
                marginTop: '4px', padding: '9px 20px',
                background: '#ff6b35', color: '#fff',
                border: 'none', borderRadius: '10px',
                fontSize: '13px', fontWeight: '700',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Navigation size={15} /> 立即生成路徑
            </button>
          </div>
        ) : (
          <div className="dash-rec-scroll">
            {recentRecs.map(r => {
              const sm = STATUS_META[r.status] ?? STATUS_META.incomplete
              return (
                <div key={r.id} className="dash-rec-card" onClick={() => setDetailRec(r)} style={{ cursor: 'pointer' }}>
                  <div className="dash-rec-map-wrap">
                    <MiniMap coords={r.coords} coordsMulti={r.coordsMulti} startCoord={r.startCoord} endCoord={r.endCoord} />
                  </div>
                  <div className="dash-rec-body">
                    <div className="dash-rec-top-row">
                      <span className="dash-rec-badge" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
                      <span className="dash-rec-date">{r.date}</span>
                    </div>
                    <p className="dash-rec-route">
                      {r.start && r.end ? `${r.start} → ${r.end}` : r.routeName}
                    </p>
                    <div className="dash-rec-divider" />
                    <div className="dash-rec-foot">
                      <span className="dash-rec-km"><Navigation size={14} /> {r.distance} km</span>
                      <span className="dash-rec-score"><Zap size={14} /> +{r.score} 分</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 紀錄詳細 Modal ── */}
      {detailRec && (
        <div className="dash-modal-overlay" onClick={() => setDetailRec(null)}>
          <div className="dash-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="dash-modal-close" onClick={() => setDetailRec(null)}>✕</button>
            <h3 className="dash-modal-title">練習詳情</h3>

            {/* 地圖 */}
            {detailRec.coords?.length > 0 && (
              <div className="dash-modal-map-wrap">
                <MiniMap key={detailRec.id} coords={detailRec.coords} coordsMulti={detailRec.coordsMulti} startCoord={detailRec.startCoord} endCoord={detailRec.endCoord} />
              </div>
            )}

            <div className="dash-modal-rows">
              {[
                ['練習路徑', detailRec.start && detailRec.end
                  ? `${detailRec.start} → ${detailRec.end}`
                  : detailRec.routeName],
                ['練習日期', detailRec.date],
                ['距離長度', `${detailRec.distance} 公里`],
                ['預計時間', detailRec.time && detailRec.time !== '--' && detailRec.time !== 'undefined' ? `${detailRec.time} 分鐘` : '--'],
                ['本次得分', `+${detailRec.score} 分`],
              ].map(([k, v]) => (
                <div key={k} className="dash-modal-row">
                  <span className="dash-modal-key">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div className="dash-modal-row">
                <span className="dash-modal-key">完成度</span>
                <span className="dash-modal-status" style={{
                  color: STATUS_META[detailRec.status]?.color,
                  background: STATUS_META[detailRec.status]?.bg,
                }}>
                  {STATUS_META[detailRec.status]?.label ?? '未知'}
                </span>
              </div>
            </div>

            <div className="dash-modal-btn-row">
              <button
                className="dash-modal-more-btn"
                onClick={() => {
                  const id = detailRec.id
                  setDetailRec(null)
                  navigate('/records', { state: { openId: id } })
                }}
              >
                查看更多
              </button>
              <button className="dash-modal-repeat-btn" onClick={() => { setDetailRec(null); handleRepeat(detailRec) }}>
                再練習一次
              </button>
            </div>
            <button className="dash-modal-close-btn" onClick={() => setDetailRec(null)}>關閉</button>
          </div>
        </div>
      )}

      {/* ── 地圖選點 Modal ── */}
      {mapPicker && (
        <MapPickerModal
          target={mapPicker}
          otherCoord={mapPicker === 'end' ? startCoord : endCoord}
          onConfirm={(name, coord) => {
            if (mapPicker === 'start') { setStartText(name); setStartCoord(coord); setGpsStatus('idle') }
            else                       { setEndText(name);   setEndCoord(coord)   }
          }}
          onClose={() => setMapPicker(null)}
        />
      )}
    </div>
  )
}
