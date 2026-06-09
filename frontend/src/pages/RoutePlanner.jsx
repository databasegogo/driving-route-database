import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Compass, Sliders, Star, Shield, ArrowRight, MapPin, AlertCircle, Map, Navigation } from 'lucide-react'
import { MapContainer, TileLayer, useMapEvents, useMap, GeoJSON, CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'
import { pointInRing, pointInPolygon } from '../utils/geo'
import '../styles/route.css'

const DIFF_CODE = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }

// 呼叫 /route/snap 把座標吸附到最近可路由道路；失敗時靜默回傳原始座標
async function snapToRoad([lat, lng]) {
  try {
    const res = await api.get('/route/snap', { params: { lat, lng } })
    return [res.data.snap_lat, res.data.snap_lng]
  } catch {
    return [lat, lng]
  }
}

const ERR_MSG = {
  NODE_NOT_FOUND:    '找不到起點或終點附近的道路，請換個地點',
  NO_PATH_FOUND:     '起終點之間找不到可行路線（可能位於不相連的路網區段），請嘗試換個地點或將起終點設在主要道路附近',
  DIFFICULTY_TOO_HIGH: '選擇的難度超過你目前的等級',
  ALL_ROUTES_EXCEED_DISTANCE_LIMIT: '所有路線都超過距離上限，請調高距離或換個地點',
  START_END_TOO_CLOSE: '起點和終點距離太近（直線 < 150 公尺），請設定更遠的目的地',
}

// 依 total_score 計算最高難度（與前端 0/150/300 閾值對齊）
function getMaxDifficulty(score) {
  if (score >= 300) return 3
  if (score >= 150) return 2
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
  return [...arr].sort(() => Math.random() - 0.5).slice(0, 4)
}

// ── 地址自動補全輸入框 ──────────────────────────────────────────────────────
function LocationInput({ value, coord, onChange, onSelect, placeholder, labelText }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow]               = useState(false)
  const timerRef = useRef(null)

  function handleChange(e) {
    const q = e.target.value
    onChange(q, null)
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
        url.searchParams.set('bounded', '1')
        const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
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

// ── 地圖點擊器 ──────────────────────────────────────────────────────────────
function MapClicker({ onPick }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]) } })
  return null
}

// ── 地圖自動視角控制器 ────────────────────────────────────────────────────────
// gpsLocation: GPS 帶入的初始座標（[lat,lng]）→ flyTo zoom 15
// picked:      使用者選取的吸附後座標
// otherCoord:  另一側已選點（起點或終點）
function MapController({ gpsLocation, picked, otherCoord }) {
  const map = useMap()

  // GPS 初始定位：Modal 開啟時飛至定位點
  useEffect(() => {
    if (!gpsLocation) return
    map.flyTo(gpsLocation, 15, { animate: true, duration: 0.8 })
  }, [gpsLocation]) // eslint-disable-line react-hooks/exhaustive-deps

  // 選點後調整視角
  useEffect(() => {
    if (!picked) return
    if (picked && otherCoord) {
      map.fitBounds([picked, otherCoord], { padding: [50, 50], maxZoom: 15, animate: true })
    } else {
      map.panTo(picked, { animate: true })
    }
  }, [picked, otherCoord]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}


// ── 地圖選點 Modal ───────────────────────────────────────────────────────────
function MapPickerModal({ target, otherCoord, onConfirm, onClose, initialCoord }) {
  const [picked,    setPicked]    = useState(null)   // 吸附後的確認點
  const [rawPicked, setRawPicked] = useState(null)   // 原始點擊位置（虛線起點）
  const [snapLine,  setSnapLine]  = useState(null)   // [[lat,lng],[lat,lng]] 虛線導引
  const [name,      setName]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [boundary,  setBoundary]  = useState(null)
  const [snapDist,  setSnapDist]  = useState(null)   // 距離最近道路幾公尺
  const [snapFail,  setSnapFail]  = useState(false)  // snap 失敗：此處無道路
  const snapTimerRef = useRef(null)                  // 0.5s 延遲的 timer

  // 載入龜山區邊界；如果有 initialCoord，邊界載完後自動選點（不延遲、不畫虛線）
  useEffect(() => {
    api.get('/district/boundary')
      .then(res => {
        setBoundary(res.data)
        if (initialCoord) {
          setRawPicked(initialCoord)
          setPicked(initialCoord)
          doSnapFlow(initialCoord, res.data, false)
        }
      })
      .catch(() => {
        setBoundary(null)
        if (initialCoord) {
          setRawPicked(initialCoord)
          setPicked(initialCoord)
          doSnapFlow(initialCoord, null, false)
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isInside = picked
    ? (boundary ? pointInPolygon(picked[0], picked[1], boundary) : true)
    : false

  // 執行 snap + 地理編碼（不含延遲計時）
  async function doSnapFlow(coord, bnd, showLine = true) {
    const inside = bnd ? pointInPolygon(coord[0], coord[1], bnd) : true
    if (!inside) { setLoading(false); setName(''); return }

    setLoading(true)
    setName('定位中...')
    setSnapFail(false)

    // 1. Snap 到最近道路垂足點
    let finalCoord = coord
    let snapOk = false
    try {
      const snapRes = await api.get('/route/snap', {
        params: { lat: coord[0], lng: coord[1] }
      })
      const { snap_lat, snap_lng, dist_m } = snapRes.data
      finalCoord = [snap_lat, snap_lng]
      setPicked(finalCoord)
      snapOk = true
      if (dist_m > 5) {
        setSnapDist(Math.round(dist_m))
        // 只有使用者點擊時才畫虛線（initialCoord 預填不畫）
        if (showLine) setSnapLine([coord, finalCoord])
      }
    } catch {
      // snap API 回傳 422 → 此位置附近無可路由道路
      setSnapFail(true)
      setLoading(false)
      setName('')
      return
    }

    if (!snapOk) return

    // 2. 反地理編碼取得名稱
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('lat', finalCoord[0])
      url.searchParams.set('lon', finalCoord[1])
      url.searchParams.set('format', 'json')
      url.searchParams.set('accept-language', 'zh-TW,zh')
      url.searchParams.set('addressdetails', '1')
      const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
      const data = await res.json()
      const addr = data.address || {}
      setName(data.name || addr.road || addr.pedestrian || addr.footway ||
        addr.path || addr.suburb || addr.village ||
        `${finalCoord[0].toFixed(5)}, ${finalCoord[1].toFixed(5)}`)
    } catch {
      setName(`${finalCoord[0].toFixed(5)}, ${finalCoord[1].toFixed(5)}`)
    } finally {
      setLoading(false)
    }
  }

  // 使用者點擊地圖：立即顯示原始點，0.5s 後執行 snap
  function handlePick(coord) {
    // 清除上一次的 timer 與虛線
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    setSnapLine(null)
    setSnapDist(null)
    setSnapFail(false)
    setName('')

    // 立即把 marker 放在點擊位置
    setRawPicked(coord)
    setPicked(coord)

    const bnd = boundary
    const inside = bnd ? pointInPolygon(coord[0], coord[1], bnd) : true
    if (!inside) { setLoading(false); setName(''); return }

    setLoading(true)
    setName('定位中...')

    // 0.5s 後才執行 snap（讓使用者先看到點擊位置）
    snapTimerRef.current = setTimeout(() => {
      doSnapFlow(coord, bnd, true)
    }, 500)
  }

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-modal">
        <div className="map-picker-header">
          <span>📍 選擇{target === 'start' ? '起點' : '終點'}位置</span>
          <button className="map-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="map-picker-hint">
          {!picked && !otherCoord && '點擊橘色龜山區範圍內來選取位置'}
          {!picked &&  otherCoord && target === 'end'   && '📌 地圖上綠色標記為已選起點，請點選終點位置'}
          {!picked &&  otherCoord && target === 'start' && '📌 地圖上紅色標記為已選終點，請點選起點位置'}
          {picked && !isInside && '⚠️ 所選位置超出龜山區範圍，請重新點選'}
          {picked && isInside && loading && '⏳ 即將吸附到最近道路...'}
          {picked && isInside && !loading && snapFail &&
            '🚫 此位置附近沒有道路，無法作為起終點，請點選靠近道路的位置'}
          {picked && isInside && !loading && !snapFail && snapDist && snapDist > 200 &&
            `⚠️ 已選：${name}　（附近最近道路距此 ${snapDist} 公尺，路線可能不準確）`}
          {picked && isInside && !loading && !snapFail && snapDist && snapDist > 5 && snapDist <= 200 &&
            `✅ 已選：${name}　（已自動調整 ${snapDist} 公尺至最近道路）`}
          {picked && isInside && !loading && !snapFail && (!snapDist || snapDist <= 5) && name &&
            `✅ 已選：${name}`}
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
            {boundary && (
              <GeoJSON
                key="guishan"
                data={boundary}
                style={{ color: '#ff6b35', weight: 2.5, dashArray: '8,5', fillOpacity: 0.06 }}
              />
            )}
            <MapController
              gpsLocation={initialCoord ?? null}
              picked={picked}
              otherCoord={otherCoord ?? null}
            />
            <MapClicker onPick={handlePick} />

            {/* 另一個已選點（綠色＝起點，紅色＝終點），加永久標籤避免混淆 */}
            {otherCoord && (
              <CircleMarker
                center={otherCoord}
                radius={9}
                pathOptions={{
                  fillColor:   target === 'end' ? '#22c55e' : '#ef4444',
                  color: '#fff', weight: 2.5, fillOpacity: 1,
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -12]} opacity={1}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>
                    {target === 'end' ? '起點' : '終點'}
                  </span>
                </Tooltip>
              </CircleMarker>
            )}

            {/* 虛線：從原始點擊位置指向吸附後的路面位置 */}
            {snapLine && (
              <Polyline
                positions={snapLine}
                pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6,5', opacity: 0.85 }}
              />
            )}

            {/* 原始點擊位置（空心小圓，虛線起點標記） */}
            {rawPicked && snapLine && (
              <CircleMarker
                center={rawPicked}
                radius={5}
                pathOptions={{ color: '#f59e0b', fillColor: '#fff7ed', weight: 2, fillOpacity: 1 }}
              />
            )}

            {/* 吸附後的確認點（實心大圓），加永久標籤 */}
            {picked && (
              <CircleMarker
                center={picked}
                radius={9}
                pathOptions={{
                  color:       '#fff',
                  fillColor:   !isInside   ? '#e74c3c'   // 範圍外：紅
                    : snapFail             ? '#ff6b35'   // snap 失敗：橘（無道路）
                    : target === 'start'   ? '#22c55e'   // 起點：綠
                    :                        '#ef4444',  // 終點：紅
                  fillOpacity: 0.95, weight: 2.5,
                }}
              >
                {isInside && !snapFail && (
                  <Tooltip permanent direction="top" offset={[0, -12]} opacity={1}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {target === 'start' ? '起點' : '終點'}
                    </span>
                  </Tooltip>
                )}
              </CircleMarker>
            )}
          </MapContainer>
        </div>
        <div className="map-picker-footer">
          <button className="map-picker-cancel" onClick={onClose}>取消</button>
          <button
            className="map-picker-confirm"
            disabled={!picked || !isInside || loading || snapFail}
            onClick={() => { onConfirm(name, picked); onClose() }}
          >
            確認選點
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────────────────────
function RoutePlanner() {
  const location = useLocation()
  const passed   = location.state || {}
  const navigate = useNavigate()

  const [start,      setStart]      = useState(passed.startText  || '')
  const [startCoord, setStartCoord] = useState(passed.startCoord || null)
  const [end,        setEnd]        = useState(passed.endText    || '')
  const [endCoord,   setEndCoord]   = useState(passed.endCoord   || null)
  const [bridge,     setBridge]     = useState(false)
  const [tunnel,     setTunnel]     = useState(false)
  const [maxDist,    setMaxDist]    = useState(null)
  const [difficulty, setDiff]       = useState(1)
  const [status,     setStatus]     = useState('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const [maxDiff,    setMaxDiff]    = useState(1)
  const [recs,       setRecs]       = useState(() => pickFour(ALL_RECOMMENDATIONS))
  const [mapPicker,      setMapPicker]      = useState(null)
  const [mapPickerInit,  setMapPickerInit]  = useState(null)  // 推薦終點預填座標
  const [gpsStatus,      setGpsStatus]      = useState('idle')

  const levelLabel = LEVEL_LABEL[maxDiff]

  useEffect(() => {
    api.get('/user/me').then(res => {
      const newMax = getMaxDifficulty(res.data.total_score ?? 0)
      setMaxDiff(newMax)
      setDiff(prev => Math.min(prev, newMax))
    }).catch(() => {})
  }, [])

  // ── GPS 一鍵定位起點 ──────────────────────────────────────────────────────
  // 取得 GPS 後直接開地圖 Modal，讓使用者在地圖上看到並確認吸附後的位置
  function handleGPS() {
    if (!navigator.geolocation) {
      setErrMsg('此裝置或瀏覽器不支援 GPS 定位')
      return
    }
    setGpsStatus('loading')
    setErrMsg('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        if (lat < 24.97 || lat > 25.07 || lng < 121.27 || lng > 121.43) {
          setGpsStatus('error')
          setErrMsg('目前位置不在龜山區範圍內，無法作為練習起點')
          return
        }
        // 打開地圖 Modal，GPS 座標會在 Modal 裡自動吸附到最近道路並顯示標記
        setGpsStatus('done')
        setMapPickerInit([lat, lng])
        setMapPicker('start')
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
    const res  = await fetch(url.toString(), { headers: { 'User-Agent': 'driving-route-database/1.0' } })
    const data = await res.json()
    if (!data.length) throw new Error(`在龜山區找不到「${query}」，請輸入龜山區內的地點`)
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      // 1. 取得座標（已選 → 直接用；未選 → 地理編碼）
      let sCoord = startCoord ?? await geocodeText(start)
      let eCoord = endCoord   ?? await geocodeText(end)

      // 2. 統一 snap 到最近可路由道路（MapPickerModal 來的已是路面點，
      //    但 autocomplete / geocode 來的是原始 Nominatim 座標，需要吸附）
      ;[sCoord, eCoord] = await Promise.all([
        snapToRoad(sCoord),
        snapToRoad(eCoord),
      ])

      // 3. 更新 state，確保後續地圖標記顯示在道路上
      setStartCoord(sCoord)
      setEndCoord(eCoord)

      const res = await api.post('/route/plan', {
        start_lat:           sCoord[0],
        start_lng:           sCoord[1],
        end_lat:             eCoord[0],
        end_lng:             eCoord[1],
        selected_difficulty: DIFF_CODE[difficulty],
        avoid_bridge:        bridge,
        avoid_tunnel:        tunnel,
        max_distance_m:      maxDist ? maxDist * 1000 : null,
      })

      // 優先用後端回傳的路口座標當 marker（與 route 線條終點完全吻合）
      // 若後端未回傳（舊版或異常），fallback 到 snap 座標
      const markerStart = res.data.start_node_coord ?? sCoord
      const markerEnd   = res.data.end_node_coord   ?? eCoord

      navigate('/route-select', {
        state: {
          routes:         res.data.routes,
          shortest_route: res.data.shortest_route,
          prefs:  { start, end,
                    startCoord: markerStart, endCoord: markerEnd,
                    snapStart:  sCoord,      snapEnd:  eCoord,
                    bridge, tunnel, maxDist, difficulty },
        }
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      setErrMsg(ERR_MSG[detail] || err.message || '路線規劃失敗，請稍後再試')
      setStatus('error')
    }
  }

  return (
    <>
      <main className="cockpit-layout-container">

        <div className="cockpit-top-bar">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={14} />
            <span>返回首頁</span>
          </button>
        </div>

        <form onSubmit={handleGenerate} className="cockpit-two-columns-form">

          {/* 左側欄：起終點設定 */}
          <div className="cockpit-left-column">
            <div className="route-section navigation-hud-box">
              <div className="hud-title-zone">
                <Compass size={16} className="hud-icon-pulse" />
                <h3>設定起點終點位置</h3>
              </div>

              <div className="vertical-route-rail">
                <div className="rail-line-dashed" />

                {/* 起點 */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-start" />
                  <div className="input-with-map-btn">
                    <LocationInput
                      value={start}
                      coord={startCoord}
                      onChange={(v, c) => { setStart(v); setStartCoord(c); if (!c) setGpsStatus('idle') }}
                      onSelect={async c => {
                        setStartCoord(c)                      // 先顯示原始座標
                        const snapped = await snapToRoad(c)
                        setStartCoord(snapped)                // 更新為路面上的點
                      }}
                      placeholder="設定出發起點"
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

                {/* 終點 */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-end" />
                  <div className="input-with-map-btn">
                    <LocationInput
                      value={end}
                      coord={endCoord}
                      onChange={(v, c) => { setEnd(v); setEndCoord(c) }}
                      onSelect={async c => {
                        setEndCoord(c)
                        const snapped = await snapToRoad(c)
                        setEndCoord(snapped)
                      }}
                      placeholder="設定練習終點"
                      labelText="DESTINATION"
                    />
                    <button type="button" className="map-pin-btn" onClick={() => setMapPicker('end')} title="在地圖上選取終點">
                      <Map size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 推薦終點 */}
              <div className="rec-dest-zone">
                <div className="rec-dest-label">
                  <MapPin size={14} />
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
                      onClick={async () => {
                        setEnd(r.name)
                        setEndCoord(null)
                        // Geocode 後自動開 modal 讓使用者確認地圖位置
                        try {
                          const coord = await geocodeText(r.name)
                          setEndCoord(coord)
                          setMapPickerInit(coord)
                        } catch {
                          setMapPickerInit(null)
                        }
                        setMapPicker('end')
                      }}
                    >
                      {r.icon} {r.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 右側欄：偏好設定 */}
          <div className="cockpit-right-column">
            <div className="route-section preferences-hud-box">
              <div className="hud-title-zone">
                <Sliders size={16} className="hud-icon-sage" />
                <h3>駕駛偏好設定</h3>
              </div>

              <div className="glass-preference-grid">
                <label className={`pref-tile-card ${bridge ? 'is-selected' : ''}`}>
                  <input type="checkbox" checked={bridge} onChange={e => setBridge(e.target.checked)} />
                  <span className="tile-emoji">🌉</span>
                  <div className="tile-text">
                    <h4>避開橋樑路段</h4>
                    <p>規劃時主動繞開高架橋</p>
                  </div>
                </label>
                <label className={`pref-tile-card ${tunnel ? 'is-selected' : ''}`}>
                  <input type="checkbox" checked={tunnel} onChange={e => setTunnel(e.target.checked)} />
                  <span className="tile-emoji">🚇</span>
                  <div className="tile-text">
                    <h4>避開隧道環境</h4>
                    <p>避開密閉與光線驟變空間</p>
                  </div>
                </label>
              </div>

              <div className="pref-row">
                <span className="cockpit-lbl">單次里程</span>
                <div className="pill-group">
                  <button type="button" className={`pill ${maxDist === null ? 'active' : ''}`} onClick={() => setMaxDist(null)}>
                    不限
                  </button>
                  {[5, 10, 15, 20].map(d => (
                    <button key={d} type="button" className={`pill ${maxDist === d ? 'active' : ''}`} onClick={() => setMaxDist(maxDist === d ? null : d)}>
                      {d} km
                    </button>
                  ))}
                </div>
              </div>

              <div className="pref-row">
                <span className="cockpit-lbl">練習難易度</span>
                <div className="star-row">
                  {[1, 2, 3].map(n => {
                    const isLocked = n > maxDiff
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`star-btn-interactive ${difficulty >= n && !isLocked ? 'on' : ''} ${isLocked ? 'locked' : ''}`}
                        onClick={() => !isLocked && setDiff(n)}
                        disabled={isLocked}
                        style={{ background: 'none', border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', padding: 0 }}
                      >
                        {isLocked
                          ? <span style={{ fontSize: '13px' }}>🔒</span>
                          : <Star size={16} style={{ fill: difficulty >= n ? '#fbbf24' : 'none', stroke: difficulty >= n ? '#fbbf24' : '#cbd5e1' }} />
                        }
                      </button>
                    )
                  })}
                  <span className="diff-hint" style={{ marginLeft: '6px' }}>
                    {['', '新手', '一般', '熟練'][difficulty]}駕駛權限
                  </span>
                </div>
              </div>

              <div className="level-notice variant-gray-hud">
                <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle', color: '#ff6f43' }} />
                <span>
                  妳目前處於 <strong>{levelLabel}</strong> 階級，系統最高可選 {'⭐'.repeat(maxDiff)} 難易度
                </span>
              </div>

              {errMsg && (
                <div className="geocode-err-hud" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '10px 14px', background: 'rgba(231, 111, 81, 0.08)', borderRadius: '8px', color: '#e76f51', fontSize: '12px', fontWeight: '700' }}>
                  <AlertCircle size={14} />
                  <span>{errMsg}</span>
                </div>
              )}
            </div>

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
          initialCoord={mapPickerInit}
          onConfirm={(name, coord) => {
            if (mapPicker === 'start') { setStart(name); setStartCoord(coord) }
            else                       { setEnd(name);   setEndCoord(coord)   }
          }}
          onClose={() => { setMapPicker(null); setMapPickerInit(null) }}
        />
      )}
    </>
  )
}

export default RoutePlanner
