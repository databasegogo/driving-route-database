import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass, Sliders, Star, Shield, ArrowRight, MapPin, AlertCircle, Map, Navigation } from 'lucide-react'
import { MapContainer, TileLayer, useMapEvents, GeoJSON, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import '../styles/route.css'

// 難易度數字 → 後端字串
const DIFF_CODE = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }

// 後端錯誤碼 → 中文提示
const ERR_MSG = {
  NODE_NOT_FOUND:    '找不到起點或終點附近的道路，請換個地點',
  NO_PATH_FOUND:     '起終點之間找不到可行路線，請換個地點',
  DIFFICULTY_TOO_HIGH: '選擇的難度超過你目前的等級',
  ALL_ROUTES_EXCEED_DISTANCE_LIMIT: '所有路線都超過距離上限，請調高距離或換個地點',
}

// level_code 由 Dashboard(/user/me) 寫入；level_id 由 Login/Register 寫入
// 兩者都判斷，確保剛登入也能正確解鎖難度
function getMaxDifficulty(user) {
  const code = user?.level_code
  const id   = user?.level_id ?? user?.user_level_id
  if (code === 'EXPERIENCED' || id === 3) return 3
  if (code === 'NORMAL'      || id === 2) return 2
  return 1
}

const LEVEL_LABEL = { 1: '新手駕駛', 2: '一般駕駛', 3: '熟練駕駛' }

const ALL_RECOMMENDATIONS = [
  { name: '中央警察大學', icon: '👮' },
  { name: '林口長庚醫院', icon: '🏥' },
  { name: '銘傳設計大樓', icon: '🎨' },
  { name: '大崗國中',     icon: '🏫' },
  { name: '龜山區公所',   icon: '🏛️' },
  { name: '桃園長庚醫院', icon: '🏥' },
]

function pickFour(arr) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4)
}

// ── 🤝 縫合組件：融合朋友的 Autocomplete 功能與妳的 Premium 輸入框外殼 ──
function LocationInput({ value, coord, onChange, onSelect, placeholder, labelText }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow]               = useState(false)
  const timerRef = useRef(null)

  function handleChange(e) {
    const q = e.target.value
    onChange(q, null) // 清掉舊座標
    setSuggestions([])

    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) return

    timerRef.current = setTimeout(async () => {
      try {
        const GUISHAN_BBOX = '121.27,25.07,121.43,24.97'
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', q)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', '5')
        url.searchParams.set('accept-language', 'zh-TW,zh')
        url.searchParams.set('countrycodes', 'tw')
        url.searchParams.set('viewbox', GUISHAN_BBOX)
        url.searchParams.set('bounded', '1')   // 只回傳龜山區邊界框內的結果
        const res  = await fetch(url.toString(), {
          headers: { 'User-Agent': 'driving-route-database/1.0' }
        })
        const data = await res.json()
        setSuggestions(data)
        setShow(true)
      } catch {}
    }, 400)
  }

  function handleSelect(item) {
    const label = item.display_name.split(',')[0].trim()
    const coord = [parseFloat(item.lat), parseFloat(item.lon)]
    onChange(label, coord)
    onSelect(coord)
    setSuggestions([])
    setShow(false)
  }

  function shortName(display_name) {
    return display_name.split(',').slice(0, 3).join(',').trim()
  }

  return (
    <div className="premium-input-box location-wrap">
      <label>{labelText}</label>
      <div className="input-with-marker">
        <input
          className="ep-input"
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder={placeholder}
          required
        />
        {coord && <MapPin size={14} className="coord-ok-icon" title="已定位成功" />}
      </div>
      
      {/* 🔮 聯想詞下拉選單 (注入高奢毛玻璃控制台風格) */}
      {show && suggestions.length > 0 && (
        <ul className="suggest-list">
          {suggestions.map((item, i) => (
            <li key={i} className="suggest-item" onMouseDown={() => handleSelect(item)}>
              <span className="suggest-name">{item.display_name.split(',')[0].trim()}</span>
              <span className="suggest-addr">{shortName(item.display_name)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 🗺️ 地圖點選器（點地圖 → 回傳座標）────────────────────────────────────
function MapClicker({ onPick }) {
  useMapEvents({
    click(e) { onPick([e.latlng.lat, e.latlng.lng]) }
  })
  return null
}

// Ray-casting：判斷點是否在單一環內
function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]   // GeoJSON 是 [lng, lat]
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
  if (type === 'Polygon') {
    return pointInRing(lat, lng, coordinates[0])
  } else if (type === 'MultiPolygon') {
    // 只要在任一子多邊形的外環內即算在範圍內
    return coordinates.some(polygon => pointInRing(lat, lng, polygon[0]))
  }
  return false
}

function MapPickerModal({ target, otherCoord, onConfirm, onClose }) {
  const [picked,   setPicked]   = useState(null)
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [boundary, setBoundary] = useState(null)   // GeoJSON Feature from DB

  // 載入龜山區真實邊界
  useEffect(() => {
    api.get('/district/boundary')
      .then(res => setBoundary(res.data))
      .catch(() => setBoundary(null))   // 失敗時退回無邊界（仍可使用）
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
      // 優先順序：地標名稱 > 路名 > 鄰里 > 座標
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
            center={[25.02, 121.35]}
            zoom={13}
            maxBounds={[[24.88, 121.18], [25.16, 121.52]]}
            maxBoundsViscosity={0.8}
            minZoom={11}
            style={{ width: '100%', height: 'min(420px, 55vh)' }}
            zoomControl
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {/* 龜山區真實多邊形邊界（橘色半透明） */}
            {boundary && (
              <GeoJSON
                key="guishan"
                data={boundary}
                style={{ color: '#ff6b35', weight: 2.5, dashArray: '8,5', fillOpacity: 0.06 }}
              />
            )}
            <MapClicker onPick={handlePick} />

            {/* 對方已選座標：選終點時顯示起點（綠），選起點時顯示終點（紅） */}
            {otherCoord && (
              <CircleMarker
                center={otherCoord}
                radius={9}
                pathOptions={{
                  fillColor:   target === 'end' ? '#2e7d32' : '#c62828',
                  color:       '#fff',
                  weight:      2.5,
                  fillOpacity: 1,
                }}
              />
            )}

            {/* 本次點選的位置 */}
            {picked && (
              <CircleMarker
                center={picked}
                radius={9}
                pathOptions={{
                  color:       isInside ? '#264653' : '#e74c3c',
                  fillColor:   isInside ? '#ff6b35' : '#e74c3c',
                  fillOpacity: 0.9,
                  weight: 2,
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

// ── 🧭 主控制台頁面 ────────────────────────────────────────────────────────
function RoutePlanner() {
  const [start,      setStart]      = useState('')
  const [startCoord, setStartCoord] = useState(null)
  const [end,        setEnd]        = useState('')
  const [endCoord,   setEndCoord]   = useState(null)
  const [bridge,     setBridge]     = useState(false)
  const [tunnel,     setTunnel]     = useState(false)
  const [maxDist,    setMaxDist]    = useState(null) // 預設 null 即代表「不限距離」
  const [difficulty, setDiff]       = useState(1)
  const [status,     setStatus]     = useState('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const [recs,       setRecs]       = useState(() => pickFour(ALL_RECOMMENDATIONS))
  const [mapPicker,  setMapPicker]  = useState(null) // null | 'start' | 'end'
  const [gpsStatus,  setGpsStatus]  = useState('idle') // idle | loading | done | error
  const navigate = useNavigate()

  // 讀取本地目前的用戶資料
  const user       = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const maxDiff    = getMaxDifficulty(user)
  const levelLabel = LEVEL_LABEL[maxDiff]

  // ── GPS 一鍵定位起點 ──────────────────────────────────────────────
  async function handleGPS() {
    if (!navigator.geolocation) {
      setErrMsg('此裝置或瀏覽器不支援 GPS 定位')
      return
    }
    setGpsStatus('loading')
    setErrMsg('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        // 龜山區粗略範圍檢查
        if (lat < 24.97 || lat > 25.07 || lng < 121.27 || lng > 121.43) {
          setGpsStatus('error')
          setErrMsg('目前位置不在龜山區範圍內，無法作為練習起點')
          return
        }
        // 反向地理編碼取地名
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse')
          url.searchParams.set('lat', lat)
          url.searchParams.set('lon', lng)
          url.searchParams.set('format', 'json')
          url.searchParams.set('accept-language', 'zh-TW,zh')
          url.searchParams.set('addressdetails', '1')
          const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
          const data = await res.json()
          const addr = data.address || {}
          const name = data.name ||
            addr.road || addr.pedestrian || addr.footway ||
            addr.suburb || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          setStart(name)
          setStartCoord([lat, lng])
        } catch {
          setStart(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
          setStartCoord([lat, lng])
        }
        setGpsStatus('done')
      },
      err => {
        setGpsStatus('error')
        setErrMsg(
          err.code === 1
            ? 'GPS 定位被拒絕，請允許瀏覽器存取位置後再試'
            : 'GPS 定位失敗，請手動輸入起點'
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  async function geocodeText(query) {
    const GUISHAN_BBOX = '121.27,25.07,121.43,24.97'
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('accept-language', 'zh-TW,zh')
    url.searchParams.set('countrycodes', 'tw')
    url.searchParams.set('viewbox', GUISHAN_BBOX)
    url.searchParams.set('bounded', '1')
    const res  = await fetch(url.toString(), {
      headers: { 'User-Agent': 'driving-route-database/1.0' }
    })
    const data = await res.json()
    if (!data.length) throw new Error(`在龜山區找不到「${query}」，請輸入龜山區內的地點`)
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      // 核心功能：有經緯度緩存直接用，否則異步反查
      const sCoord = startCoord ?? await geocodeText(start)
      const eCoord = endCoord   ?? await geocodeText(end)

      const res = await api.post('/route/plan', {
        start_lat:           sCoord[0],
        start_lng:           sCoord[1],
        end_lat:             eCoord[0],
        end_lng:             eCoord[1],
        selected_difficulty: DIFF_CODE[difficulty],
        avoid_bridge:        bridge, // 朋友新版的語意是「避免」
        avoid_tunnel:        tunnel, // 朋友新版的語意是「避免」
        max_distance_m:      maxDist ? maxDist * 1000 : null,
      })

      const routes = res.data.routes
      const prefs  = { start, end, startCoord: sCoord, endCoord: eCoord,
                       bridge, tunnel, maxDist, difficulty }

      navigate('/route-select', { state: { routes, prefs } })
    } catch (err) {
      const detail = err.response?.data?.detail
      setErrMsg(ERR_MSG[detail] || err.message || '路線規劃失敗，請稍後再試')
      setStatus('error')
    }
  }

  return (
    <>
      <main className="cockpit-layout-container">
        
        {/* 頂部極簡控制列 */}
        <div className="cockpit-top-bar">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} />
            <span>返回主控台</span>
          </button>
        </div>

        <form onSubmit={handleGenerate} className="cockpit-two-columns-form">
          
          {/* 📍 左側欄：直立式智慧路徑軌道（完美保留妳的 Dash 線線條） */}
          <div className="cockpit-left-column">
            <div className="route-section navigation-hud-box">
              <div className="hud-title-zone">
                <Compass size={16} className="hud-icon-pulse" />
                <h3>設定起點終點位置</h3>
              </div>
              
              <div className="vertical-route-rail">
                <div className="rail-line-dashed" />
                
                {/* 起點輸入組件 */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-start" />
                  <div className="input-with-map-btn">
                    <LocationInput
                      value={start}
                      coord={startCoord}
                      onChange={(v, c) => { setStart(v); setStartCoord(c); if (!c) setGpsStatus('idle') }}
                      onSelect={c => setStartCoord(c)}
                      placeholder="設定出發起點（例：長庚大學）"
                      labelText="START POINT"
                    />
                    <button type="button" className="map-pin-btn" onClick={() => setMapPicker('start')} title="在地圖上選取起點">
                      <Map size={15} />
                    </button>
                    <button
                      type="button"
                      className={`map-pin-btn gps-btn gps-${gpsStatus}`}
                      onClick={handleGPS}
                      disabled={gpsStatus === 'loading'}
                      title={
                        gpsStatus === 'loading' ? '定位中...' :
                        gpsStatus === 'error'   ? '定位失敗，點擊重試' :
                        gpsStatus === 'done'    ? '已定位成功，點擊重新定位' :
                                                 '使用 GPS 定位目前位置作為起點'
                      }
                    >
                      <Navigation size={15} className={gpsStatus === 'loading' ? 'spin-icon' : ''} />
                    </button>
                  </div>
                </div>

                {/* 終點輸入組件 */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-end" />
                  <div className="input-with-map-btn">
                    <LocationInput
                      value={end}
                      coord={endCoord}
                      onChange={(v, c) => { setEnd(v); setEndCoord(c) }}
                      onSelect={c => setEndCoord(c)}
                      placeholder="設定練習終點（例：林口長庚醫院）"
                      labelText="DESTINATION"
                    />
                    <button type="button" className="map-pin-btn" onClick={() => setMapPicker('end')} title="在地圖上選取終點">
                      <Map size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 終點推薦 */}
              <div className="rec-dest-zone">
                <div className="rec-dest-label">
                  <MapPin size={12} />
                  <span>推薦終點</span>
                  <button
                    type="button"
                    className="rec-refresh-btn"
                    onClick={() => setRecs(pickFour(ALL_RECOMMENDATIONS))}
                    title="換一批"
                  >↺</button>
                </div>
                <div className="rec-dest-chips">
                  {recs.map(r => (
                    <button
                      key={r.name}
                      type="button"
                      className={`rec-chip ${end === r.name ? 'active' : ''}`}
                      onClick={() => { setEnd(r.name); setEndCoord(null) }}
                    >
                      {r.icon} {r.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 🎛️ 右側欄：智能莫蘭迪偏好設定面板 */}
          <div className="cockpit-right-column">
            <div className="route-section preferences-hud-box">
              <div className="hud-title-zone">
                <Sliders size={16} className="hud-icon-sage" />
                <h3>駕駛偏好設定</h3>
              </div>

              {/* 高級智能方磚：複選按鈕 */}
              <div className="glass-preference-grid">
                <label className={`pref-tile-card ${bridge ? 'is-selected' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={bridge} 
                    onChange={(e) => setBridge(e.target.checked)} 
                  />
                  <span className="tile-emoji">🌉</span>
                  <div className="tile-text">
                    <h4>避開橋樑路段</h4>
                    <p>規劃時主動繞開高架橋</p>
                  </div>
                </label>

                <label className={`pref-tile-card ${tunnel ? 'is-selected' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={tunnel} 
                    onChange={(e) => setTunnel(e.target.checked)} 
                  />
                  <span className="tile-emoji">🚇</span>
                  <div className="tile-text">
                    <h4>避開隧道環境</h4>
                    <p>避開密閉與光線驟變空間</p>
                  </div>
                </label>
              </div>

              {/* 📊 單次里程（成功縫合「不限」開關！） */}
              <div className="pref-row">
                <span className="cockpit-lbl">單次里程</span>
                <div className="pill-group">
                  <button
                    type="button"
                    className={`pill ${maxDist === null ? 'active' : ''}`}
                    onClick={() => setMaxDist(null)}
                  >
                    不限
                  </button>
                  {[5, 10, 15, 20].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`pill ${maxDist === d ? 'active' : ''}`}
                      onClick={() => setMaxDist(maxDist === d ? null : d)}
                    >
                      {d} km
                    </button>
                  ))}
                </div>
              </div>

              {/* ⭐ 練習難易度（融合點擊星星切換與等級鎖定功能！） */}
              <div className="pref-row">
                <span className="cockpit-lbl">練習難易度</span>
                <div className="star-row">
                  {[1, 2, 3].map((n) => {
                    const isLocked = n > maxDiff // 超過最高等級即上鎖
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`star-btn-interactive ${difficulty >= n && !isLocked ? 'on' : ''} ${isLocked ? 'locked' : ''}`}
                        onClick={() => !isLocked && setDiff(n)}
                        disabled={isLocked}
                        style={{ background: 'none', border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', padding: 0 }}
                      >
                        {isLocked ? (
                          <span style={{ fontSize: '13px' }}>🔒</span>
                        ) : (
                          <Star 
                            size={16} 
                            style={{ 
                              fill: difficulty >= n ? '#fbbf24' : 'none', 
                              stroke: difficulty >= n ? '#fbbf24' : '#cbd5e1' 
                            }} 
                          />
                        )}
                      </button>
                    )
                  })}
                  <span className="diff-hint" style={{ marginLeft: '6px' }}>
                    {['', '新手', '一般', '熟練'][difficulty]}駕駛權限
                  </span>
                </div>
              </div>

              {/* 🔔 智能告示橫條：自動讀取目前的真實分數與階級 */}
              <div className="level-notice variant-gray-hud">
                <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: '#ff6f43' }} />
                <span>
                  妳目前處於 <strong>{levelLabel}</strong> 階級，系統最高可選 {'⭐'.repeat(maxDiff)} 難易度
                </span>
              </div>
              
              {/* ⚠️ 錯誤訊息中文提示面板 */}
              {errMsg && (
                <div className="geocode-err-hud" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '10px 14px', background: 'rgba(231, 111, 81, 0.08)', borderRadius: '8px', color: '#e76f51', fontSize: '12px', fontWeight: '700' }}>
                  <AlertCircle size={14} />
                  <span>{errMsg}</span>
                </div>
              )}
            </div>

            {/* 🚀 右下角懸浮膠囊按鈕 */}
            <div className="floating-action-btn-wrapper">
              <button type="submit" className="generate-btn" disabled={status === 'loading'}>
                <span>{status === 'loading' ? '規劃路線中...' : '生成練習路徑'}</span>
                <ArrowRight size={18} style={{ marginLeft: '8px', verticalAlign: 'middle' }} />
              </button>
            </div>

          </div>
        </form>
      </main>

      {mapPicker && (
        <MapPickerModal
          target={mapPicker}
          otherCoord={mapPicker === 'end' ? startCoord : endCoord}
          onConfirm={(name, coord) => {
            if (mapPicker === 'start') { setStart(name); setStartCoord(coord) }
            else                       { setEnd(name);   setEndCoord(coord)   }
          }}
          onClose={() => setMapPicker(null)}
        />
      )}
    </>
  )
}

export default RoutePlanner