'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import styles from './page.module.css'

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

// Everything renders from this config. Add a league by adding an entry with an
// { id, label, endpoint, color } — the API route just needs to return { games }.
const SPORTS = [
  {
    id: 'baseball', label: '야구', icon: '⚾',
    leagues: [
      { id: 'mlb', label: 'MLB', endpoint: '/api/mlb', color: '#e0234e' },
      { id: 'kbo', label: 'KBO', endpoint: '/api/kbo', color: '#22c55e' },
    ],
  },
  {
    id: 'basketball', label: '농구', icon: '🏀',
    leagues: [
      { id: 'nba', label: 'NBA', endpoint: '/api/nba', color: '#f97316' },
      { id: 'kbl', label: 'KBL', endpoint: '/api/kbl', color: '#38bdf8' },
    ],
  },
  {
    id: 'soccer', label: '축구', icon: '⚽',
    leagues: [
      { id: 'epl', label: '프리미어리그', endpoint: '/api/soccer/epl', color: '#a855f7' },
      { id: 'laliga', label: '라리가', endpoint: '/api/soccer/laliga', color: '#eab308' },
      { id: 'seriea', label: '세리에 A', endpoint: '/api/soccer/seriea', color: '#3b82f6' },
      { id: 'bundesliga', label: '분데스리가', endpoint: '/api/soccer/bundesliga', color: '#ef4444' },
      { id: 'ligue1', label: '리그앙', endpoint: '/api/soccer/ligue1', color: '#14b8a6' },
    ],
  },
]

function getKSTDateString(offsetDays = 0) {
  const now = new Date()
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  const kst = new Date(kstMs + offsetDays * 86400000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateStrToLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${m}월 ${d}일(${DAYS_KO[date.getUTCDay()]})`
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + delta))
  const ny = date.getUTCFullYear()
  const nm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(date.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

function buildCopyText(leagueLabel, dateLabel, games, hasPitchers) {
  const header = hasPitchers
    ? `[${dateLabel} ${leagueLabel} 경기 일정 및 선발투수 (한국시간 기준)]`
    : `[${dateLabel} ${leagueLabel} 경기 일정 (한국시간 기준)]`
  const lines = games.map(g => {
    const scoreStr = g.abstractState !== 'Preview' && g.awayScore !== null
      ? ` [${g.awayScore ?? '-'}:${g.homeScore ?? '-'}]` : ''
    const away = hasPitchers ? `${g.awayTeam} (${g.awayPitcher})` : g.awayTeam
    const home = hasPitchers ? `${g.homeTeam} (${g.homePitcher})` : g.homeTeam
    return `■ ${g.time} - ${away} VS ${home}${scoreStr}`
  })
  return [header, '', ...lines].join('\n')
}

function liveText(g) {
  if (g.statusShort) return g.statusShort
  if (g.inning) return `${g.inningHalf === 'Top' ? '▲' : '▼'}${g.inning}회`
  return 'LIVE'
}

function StatusBadge({ game }) {
  if (game.abstractState === 'Final') return <span className={styles.badgeFinal}>종료</span>
  if (game.abstractState === 'Live') {
    return <span className={styles.badgeLive}><span className={styles.liveDot} />{liveText(game)}</span>
  }
  return null
}

function ScoreDisplay({ game }) {
  if (game.abstractState === 'Preview') return null
  const awayWin = game.awayScore > game.homeScore
  const homeWin = game.homeScore > game.awayScore
  return (
    <span className={styles.score}>
      <span className={awayWin ? styles.scoreWin : styles.scoreLose}>{game.awayScore ?? '-'}</span>
      <span className={styles.scoreSep}>:</span>
      <span className={homeWin ? styles.scoreWin : styles.scoreLose}>{game.homeScore ?? '-'}</span>
    </span>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={handleCopy}>
      {copied ? '✓ 복사됨' : '복사'}
    </button>
  )
}

function GameCard({ leagueLabel, color, dateLabel, games, loading, error }) {
  const hasPitchers = games.some(g => g.awayPitcher)
  const copyText = games.length > 0 ? buildCopyText(leagueLabel, dateLabel, games, hasPitchers) : ''

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.leagueTag}>
          <span className={styles.dot} style={{ background: color, boxShadow: `0 0 0 3px ${color}2b` }} />
          <span className={styles.leagueLabel}>{leagueLabel}</span>
          {!loading && !error && <span className={styles.gameCount}>{games.length}경기</span>}
        </div>
        {games.length > 0 && <CopyButton text={copyText} />}
      </div>

      {loading && <div className={styles.state}><span className={styles.spinner} /> 불러오는 중...</div>}
      {error && !loading && <div className={styles.stateError}>데이터를 가져오지 못했습니다</div>}
      {!loading && !error && games.length === 0 && <div className={styles.state}>경기 없음</div>}
      {!loading && !error && games.length > 0 && (
        <div className={styles.gameList}>
          {games.map((g, i) => (
            <div key={i} className={`${styles.gameRow} ${g.abstractState === 'Live' ? styles.gameRowLive : ''}`}>
              <span className={styles.gameTime}>{g.time}</span>
              <span className={styles.gameMatchup}>
                <span className={styles.team}>{g.awayTeam}</span>
                {hasPitchers && <span className={styles.pitcher}>({g.awayPitcher})</span>}
                <span className={styles.vs}>VS</span>
                <span className={styles.team}>{g.homeTeam}</span>
                {hasPitchers && <span className={styles.pitcher}>({g.homePitcher})</span>}
              </span>
              <span className={styles.gameRight}>
                <ScoreDisplay game={g} />
                <StatusBadge game={g} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [dateStr, setDateStr] = useState(null)
  const [sport, setSport] = useState('baseball')
  const [league, setLeague] = useState('all')
  const [results, setResults] = useState({}) // { [leagueId]: { games, loading, error } }

  const activeSport = SPORTS.find(s => s.id === sport)

  useEffect(() => {
    setDateStr(getKSTDateString(0))
  }, [])

  const fetchSport = useCallback(async (ds, sportObj) => {
    await Promise.all(sportObj.leagues.map(async (lg) => {
      setResults(r => ({ ...r, [lg.id]: { games: r[lg.id]?.games || [], loading: true, error: false } }))
      try {
        const res = await fetch(`${lg.endpoint}?date=${ds}`)
        const data = await res.json()
        setResults(r => ({ ...r, [lg.id]: { games: data.games || [], loading: false, error: false } }))
      } catch {
        setResults(r => ({ ...r, [lg.id]: { games: [], loading: false, error: true } }))
      }
    }))
  }, [])

  // Fetch the active sport's leagues whenever sport or date changes
  useEffect(() => {
    if (dateStr) fetchSport(dateStr, activeSport)
  }, [dateStr, sport, activeSport, fetchSport])

  // Reset league filter when switching sport
  useEffect(() => { setLeague('all') }, [sport])

  // Auto-refresh every 30s while any game in the active sport is live
  useEffect(() => {
    const hasLive = activeSport.leagues.some(lg =>
      (results[lg.id]?.games || []).some(g => g.abstractState === 'Live'))
    if (!hasLive || !dateStr) return
    const timer = setInterval(() => fetchSport(dateStr, activeSport), 30000)
    return () => clearInterval(timer)
  }, [results, dateStr, activeSport, fetchSport])

  const shownLeagues = useMemo(
    () => league === 'all' ? activeSport.leagues : activeSport.leagues.filter(l => l.id === league),
    [league, activeSport]
  )

  if (!dateStr) return null

  const dateLabel = dateStrToLabel(dateStr)

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <span className={styles.logoMark} />
          <span className={styles.brand}>allsports</span>
        </div>
        <h1 className={styles.title}>모든 스포츠 일정을<br />한 화면에서.</h1>
        <p className={styles.lead}>경기 일정을 복사해서 어디서든 쉽게 공유하고 이용하세요.</p>
        <p className={styles.subtitle}>야구 · 농구 · 축구 · 실시간 스코어 · 한국시간 기준</p>
      </header>

      {/* Top-level sport switcher */}
      <nav className={styles.sportNav}>
        {SPORTS.map(s => (
          <button key={s.id}
            className={`${styles.sportTab} ${sport === s.id ? styles.sportTabActive : ''}`}
            onClick={() => setSport(s.id)}>
            <span className={styles.sportIcon}>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.controls}>
        <div className={styles.dateNav}>
          <button className={styles.navBtn} onClick={() => setDateStr(d => addDays(d, -1))}>‹</button>
          <span className={styles.dateLabel}>{dateLabel}</span>
          <button className={styles.navBtn} onClick={() => setDateStr(d => addDays(d, 1))}>›</button>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${league === 'all' ? styles.tabActive : ''}`}
            onClick={() => setLeague('all')}>전체</button>
          {activeSport.leagues.map(l => (
            <button key={l.id}
              className={`${styles.tab} ${league === l.id ? styles.tabActive : ''}`}
              onClick={() => setLeague(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.cards}>
        {shownLeagues.map(lg => {
          const r = results[lg.id] || { games: [], loading: true, error: false }
          return (
            <GameCard key={lg.id} leagueLabel={lg.label} color={lg.color} dateLabel={dateLabel}
              games={r.games} loading={r.loading} error={r.error} />
          )
        })}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>allsports</span>
        <span className={styles.footerDim}>야구 · 농구 · 축구 · 한 곳에서</span>
      </footer>
    </main>
  )
}
