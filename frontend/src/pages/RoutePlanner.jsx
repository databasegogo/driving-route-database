import { useState } from 'react'
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
  DISTANCE_EXCEEDED: '路線距離超過設定的上限',
}

function getMaxDifficulty(score) {
  if (score >= 2000) return 3
  if (score >= 500)  return 2
  return 1
}

const LEVEL_LABEL = { 1: '新手駕駛', 2: '一般駕駛', 3: '熟練駕駛' }

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '3')
  url.searchParams.set('accept-language', 'zh-TW,zh')
  url.searchParams.set('countrycodes', 'tw')
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'driving-route-database/1.0' }
  })
  const data = await res.json()
  if (!data.length) throw new Error(`找不到「${query}」的位置，請換個地點名稱試試`)
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
}

function RoutePlanner() {
  const [start, setStart]     = useState('')
  const [end, setEnd]         = useState('')
  const [bridge, setBridge]   = useState(false)
  const [tunnel, setTunnel]   = useState(false)
  const [maxDist, setMaxDist] = useState(10)
  const [difficulty, setDiff] = useState(1)
  const [status, setStatus]   = useState('idle')
  const [errMsg, setErrMsg]   = useState('')
  const navigate = useNavigate()

  const user        = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const maxDiff     = getMaxDifficulty(user.score ?? 0)
  const levelLabel  = LEVEL_LABEL[maxDiff]

  async function handleGenerate(e) {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      // Step 1：地名 → 坐標
      setErrMsg('')
      const [startCoord, endCoord] = await Promise.all([geocode(start), geocode(end)])

      // Step 2：呼叫後端算路線
      const res = await api.post('/route/plan', {
        start_lat:            startCoord[0],
        start_lng:            startCoord[1],
        end_lat:              endCoord[0],
        end_lng:              endCoord[1],
        selected_difficulty:  DIFF_CODE[difficulty],
        avoid_bridge:         !bridge,   // 有勾=允許橋，沒勾=避開橋
        avoid_tunnel:         !tunnel,
      })

      // Step 3：帶著後端路線資料進入地圖頁
      navigate('/route-detail', {
        state: {
          route: {
            route_id:       res.data.route_id,
            start,          end,
            startCoord,     endCoord,
            distanceM:      res.data.total_distance_m,
            distance:       +(res.data.total_distance_m / 1000).toFixed(2),
            time:           Math.round(res.data.total_distance_m / 1000 * 4.4),
            difficulty,
            diffCode:       DIFF_CODE[difficulty],
            estimatedScore: res.data.estimated_score,
            segments:       res.data.segments,  // GeoJSON FeatureCollection
          },
          prefs: { start, end, bridge, tunnel, maxDist, difficulty },
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
              <input className="ep-input" type="text" value={start}
                onChange={e => setStart(e.target.value)}
                placeholder="起點（例：長庚大學）" required />
              <span className="ep-arrow">→</span>
              <input className="ep-input" type="text" value={end}
                onChange={e => setEnd(e.target.value)}
                placeholder="終點（例：林口長庚醫院）" required />
            </div>
          </section>

          <section className="route-section">
            <h3 className="section-label">路線偏好</h3>

            <div className="pref-checks">
              {[
                { label: '是否經過橋樑', val: bridge, set: setBridge },
                { label: '是否經過隧道', val: tunnel, set: setTunnel },
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
                {[5, 10, 15, 20].map(d => (
                  <button key={d} type="button"
                    className={`pill ${maxDist === d ? 'active' : ''}`}
                    onClick={() => setMaxDist(d)}>
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
                      title={locked ? `需達到更高駕駛等級才能解鎖` : ''}
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
