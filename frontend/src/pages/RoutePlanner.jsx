import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Compass, Sliders, Star, Shield, ArrowRight, MapPin, AlertCircle } from 'lucide-react' // 👈 額外導入 MapPin 與 AlertCircle 提升推薦清單質感
import api from '../api'
import '../styles/route.css'

// 難易度數字 → 後端字串
const DIFF_CODE = { 1: 'BEGINNER', 2: 'NORMAL', 3: 'EXPERIENCED' }

// 後端 level_code → 難易度數字
const LEVEL_CODE_TO_DIFF = { 'BEGINNER': 1, 'NORMAL': 2, 'EXPERIENCED': 3 }

// 後端錯誤碼 → 中文提示
const ERR_MSG = {
  NODE_NOT_FOUND:    '找不到起點或終點附近的道路，請換個地點',
  NO_PATH_FOUND:     '起終點之間找不到可行路線，請換個地點',
  DIFFICULTY_TOO_HIGH: '選擇的難度超過你目前的等級',
  ALL_ROUTES_EXCEED_DISTANCE_LIMIT: '所有路線都超過距離上限，請調高距離或換個地點',
}

function getMaxDifficulty(score) {
  if (score >= 300) return 3
  if (score >= 150) return 2
  return 1
}

const LEVEL_LABEL = { 1: '新手駕駛', 2: '一般駕駛', 3: '熟練駕駛' }

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
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', q)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', '5')
        url.searchParams.set('accept-language', 'zh-TW,zh')
        url.searchParams.set('countrycodes', 'tw')
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

// ── 🧭 主控制台頁面 ────────────────────────────────────────────────────────
function RoutePlanner() {
  const location = useLocation()
  const passed   = location.state || {}

  const [start,      setStart]      = useState(passed.startText  || '')
  const [startCoord, setStartCoord] = useState(passed.startCoord || null)
  const [end,        setEnd]        = useState(passed.endText    || '')
  const [endCoord,   setEndCoord]   = useState(passed.endCoord   || null)
  const [bridge,     setBridge]     = useState(false)
  const [tunnel,     setTunnel]     = useState(false)
  const [maxDist,    setMaxDist]    = useState(null) // 預設 null 即代表「不限距離」
  const [difficulty, setDiff]       = useState(1)
  const [status,     setStatus]     = useState('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const [maxDiff,    setMaxDiff]    = useState(1)
  const navigate = useNavigate()

  const levelLabel = LEVEL_LABEL[maxDiff]

  useEffect(() => {
    api.get('/user/me').then(res => {
      // 直接用 total_score 計算最高難度，不依賴可能過時的 level_code
      const newMax = getMaxDifficulty(res.data.total_score ?? 0)
      setMaxDiff(newMax)
      setDiff(prev => Math.min(prev, newMax))
    }).catch(err => {
      console.error('無法取得用戶等級：', err)
    })
  }, [])

  async function geocodeText(query) {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('accept-language', 'zh-TW,zh')
    url.searchParams.set('countrycodes', 'tw')
    const res  = await fetch(url.toString(), {
      headers: { 'User-Agent': 'driving-route-database/1.0' }
    })
    const data = await res.json()
    if (!data.length) throw new Error(`找不到「${query}」的位置，請換個名稱試試`)
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

      // 將資料打包帶往剛剛縫合好的 /route-select 畫面
      navigate('/route-select', {
        state: {
          routes: res.data.routes,
          prefs:  { start, end, startCoord: sCoord, endCoord: eCoord,
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
                
                {/* 起點輸入組件（完美嵌入聯想詞功能） */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-start" />
                  <LocationInput
                    value={start}
                    coord={startCoord}
                    onChange={(v, c) => { setStart(v); setStartCoord(c) }}
                    onSelect={c => setStartCoord(c)}
                    placeholder="設定出發起點（例：長庚大學）"
                    labelText="START POINT"
                  />
                </div>

                {/* 終點輸入組件（完美嵌入聯想詞功能） */}
                <div className="rail-node-block">
                  <div className="rail-dot dot-end" />
                  <LocationInput
                    value={end}
                    coord={endCoord}
                    onChange={(v, c) => { setEnd(v); setEndCoord(c) }}
                    onSelect={c => setEndCoord(c)}
                    placeholder="設定練習終點（例：林口長庚醫院）"
                    labelText="DESTINATION"
                  />
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
    </>
  )
}

export default RoutePlanner