import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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

function getMaxDifficulty(score) {
  if (score >= 2000) return 3
  if (score >= 500)  return 2
  return 1
}

const LEVEL_LABEL = { 1: '新手駕駛', 2: '一般駕駛', 3: '熟練駕駛' }

// ── 地點搜尋輸入框（含 autocomplete）──────────────────────────────
function LocationInput({ value, coord, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [show, setShow]               = useState(false)
  const timerRef = useRef(null)

  function handleChange(e) {
    const q = e.target.value
    onChange(q, null)           // 清掉舊座標
    setSuggestions([])

    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) return

    timerRef.current = setTimeout(async () => {
      try {
        // 龜山區邊界框：lng_min, lat_max, lng_max, lat_min
        const GUISHAN_BBOX = '121.27,25.07,121.43,24.97'
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', q)
        url.searchParams.set('format', 'json')
        url.searchParams.set('limit', '5')
        url.searchParams.set('accept-language', 'zh-TW,zh')
        url.searchParams.set('countrycodes', 'tw')
        url.searchParams.set('viewbox', GUISHAN_BBOX)
        url.searchParams.set('bounded', '1')   // 只回傳邊界框內的結果
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
    // 取 display_name 第一段作為顯示用名稱
    const label = item.display_name.split(',')[0].trim()
    const coord = [parseFloat(item.lat), parseFloat(item.lon)]
    onChange(label, coord)
    onSelect(coord)
    setSuggestions([])
    setShow(false)
  }

  // 顯示名稱截短：最多顯示前 3 段（避免太長）
  function shortName(display_name) {
    return display_name.split(',').slice(0, 3).join(',').trim()
  }

  return (
    <div className="location-wrap">
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
      {coord && <span className="coord-ok" title="已定位">📍</span>}
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

// ── 主頁面 ────────────────────────────────────────────────────────
function RoutePlanner() {
  const [start,      setStart]      = useState('')
  const [startCoord, setStartCoord] = useState(null)
  const [end,        setEnd]        = useState('')
  const [endCoord,   setEndCoord]   = useState(null)
  const [bridge,     setBridge]     = useState(false)
  const [tunnel,     setTunnel]     = useState(false)
  const [maxDist,    setMaxDist]    = useState(null)
  const [difficulty, setDiff]       = useState(1)
  const [status,     setStatus]     = useState('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const navigate = useNavigate()

  const user       = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const maxDiff    = getMaxDifficulty(user.score ?? 0)
  const levelLabel = LEVEL_LABEL[maxDiff]

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
      // 有點選建議 → 直接用；沒有 → 重新查
      const sCoord = startCoord ?? await geocodeText(start)
      const eCoord = endCoord   ?? await geocodeText(end)

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
    <div className="route-page">
      <header className="route-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>← 返回</button>
        <span className="route-title">生成練習路徑</span>
        <span />
      </header>

      <main className="route-main">
        <form className="route-form" onSubmit={handleGenerate}>

          <section className="route-section">
            <h3 className="section-label">設定起點與終點</h3>
            <div className="endpoints">
              <LocationInput
                value={start}
                coord={startCoord}
                onChange={(v, c) => { setStart(v); setStartCoord(c) }}
                onSelect={c => setStartCoord(c)}
                placeholder="起點（例：長庚大學）"
              />
              <span className="ep-arrow">→</span>
              <LocationInput
                value={end}
                coord={endCoord}
                onChange={(v, c) => { setEnd(v); setEndCoord(c) }}
                onSelect={c => setEndCoord(c)}
                placeholder="終點（例：龜山區公所）"
              />
            </div>
          </section>

          <section className="route-section">
            <h3 className="section-label">路線偏好</h3>

            <div className="pref-checks">
              {[
                { label: '避開橋樑', val: bridge, set: setBridge },
                { label: '避開隧道', val: tunnel, set: setTunnel },
              ].map(({ label, val, set }) => (
                <label key={label} className="pref-check">
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                  <span className="check-box" />
                  {label}
                </label>
              ))}
            </div>

            <div className="pref-row">
              <span className="pref-label">距離上限</span>
              <div className="pill-group">
                <button type="button"
                  className={`pill ${maxDist === null ? 'active' : ''}`}
                  onClick={() => setMaxDist(null)}>
                  不限
                </button>
                {[5, 10, 15, 20].map(d => (
                  <button key={d} type="button"
                    className={`pill ${maxDist === d ? 'active' : ''}`}
                    onClick={() => setMaxDist(maxDist === d ? null : d)}>
                    {d} km
                  </button>
                ))}
              </div>
            </div>

            <div className="pref-row">
              <span className="pref-label">難易度</span>
              <div className="star-row">
                {[1, 2, 3].map(n => {
                  const locked = n > maxDiff
                  return (
                    <button key={n} type="button"
                      className={`star-btn ${difficulty >= n && !locked ? 'on' : ''} ${locked ? 'locked' : ''}`}
                      onClick={() => !locked && setDiff(n)}
                      title={locked ? '需達到更高駕駛等級才能解鎖' : ''}
                      disabled={locked}>
                      {locked ? '🔒' : '★'}
                    </button>
                  )
                })}
                <span className="diff-hint">{['', '新手', '一般', '熟練'][difficulty]}</span>
              </div>
            </div>
            <p className="level-notice">
              你目前是「{levelLabel}」，最高可選 {'⭐'.repeat(maxDiff)} 難易度
            </p>
          </section>

          {errMsg && <p className="geocode-err">⚠️ {errMsg}</p>}

          <button type="submit" className="generate-btn" disabled={status === 'loading'}>
            {status === 'loading' ? '規劃路線中...' : '生成練習路徑'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default RoutePlanner
