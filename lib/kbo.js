// KBO data helper
// Uses Naver Sports' JSON schedule API (the legacy sports.naver.com/schedule/index.nhn
// page is deprecated and JS-rendered, so HTML scraping no longer works).
//
// API: https://api-gw.sports.naver.com/schedule/games
//   ?upperCategoryId=kbaseball&categoryId=kbo&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
// The response returns games with KST times, so no timezone conversion is needed.

// Map Naver team codes / short names to full Korean team names.
const TEAM_BY_CODE = {
  HT: 'KIA 타이거즈',
  SS: '삼성 라이온즈',
  LG: 'LG 트윈스',
  OB: '두산 베어스',
  KT: 'KT 위즈',
  SK: 'SSG 랜더스',
  SSG: 'SSG 랜더스',
  LT: '롯데 자이언츠',
  HH: '한화 이글스',
  NC: 'NC 다이노스',
  WO: '키움 히어로즈',
  HE: '키움 히어로즈',
}

const TEAM_BY_NAME = {
  KIA: 'KIA 타이거즈',
  기아: 'KIA 타이거즈',
  삼성: '삼성 라이온즈',
  LG: 'LG 트윈스',
  두산: '두산 베어스',
  KT: 'KT 위즈',
  kt: 'KT 위즈',
  SSG: 'SSG 랜더스',
  롯데: '롯데 자이언츠',
  한화: '한화 이글스',
  NC: 'NC 다이노스',
  키움: '키움 히어로즈',
}

function fullTeamName(code, name) {
  return TEAM_BY_CODE[code] || TEAM_BY_NAME[name] || name || '?'
}

// Naver statusCode -> frontend abstractState ('Preview' | 'Live' | 'Final')
function toAbstractState(statusCode) {
  const s = String(statusCode || '').toUpperCase()
  if (s === 'RESULT' || s === 'FINAL' || s === 'END') return 'Final'
  if (s === 'STARTED' || s === 'LIVE' || s === 'PLAYING') return 'Live'
  return 'Preview'
}

// statusInfo like "5회초" / "9회말" -> { inning: 5, inningHalf: 'Top'|'Bottom' }
function parseInning(statusInfo) {
  const m = String(statusInfo || '').match(/(\d+)\s*회\s*(초|말)/)
  if (!m) return { inning: null, inningHalf: null }
  return { inning: Number(m[1]), inningHalf: m[2] === '초' ? 'Top' : 'Bottom' }
}

const NAVER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://sports.naver.com/',
  Accept: 'application/json',
}

// Starting pitchers aren't in the schedule response; they live in each game's
// preview: result.previewData.{away,home}Starter.playerInfo.name
async function fetchStarters(gameId) {
  try {
    const res = await fetch(
      `https://api-gw.sports.naver.com/schedule/games/${gameId}/preview`,
      { headers: NAVER_HEADERS, cache: 'no-store' }
    )
    if (!res.ok) return {}
    const data = await res.json()
    const pv = data?.result?.previewData
    return {
      away: pv?.awayStarter?.playerInfo?.name || null,
      home: pv?.homeStarter?.playerInfo?.name || null,
    }
  } catch {
    return {}
  }
}

export async function getKBOSchedule(dateStr) {
  // dateStr: "YYYY-MM-DD" (KST)
  const url =
    'https://api-gw.sports.naver.com/schedule/games' +
    '?upperCategoryId=kbaseball&categoryId=kbo' +
    `&fromDate=${dateStr}&toDate=${dateStr}`

  const res = await fetch(url, { headers: NAVER_HEADERS, cache: 'no-store' })

  if (!res.ok) throw new Error(`Naver API ${res.status}`)

  const data = await res.json()
  const rawGames = data?.result?.games || data?.games || []

  const games = []
  for (const g of rawGames) {
    // Only keep games on the requested date (API is inclusive but be safe)
    const gameDate = (g.gameDate || '').replace(/-/g, '')
    if (gameDate && gameDate !== dateStr.replace(/-/g, '')) continue

    // Time: prefer explicit gameTime "HH:MM", else derive from gameDateTime (KST)
    let time = g.gameTime || '미정'
    if ((!g.gameTime || g.gameTime === '') && g.gameDateTime) {
      const t = String(g.gameDateTime).split('T')[1] || ''
      time = t.slice(0, 5) || '미정'
    }

    const abstractState = toAbstractState(g.statusCode)
    const cancelled = g.cancel === true || g.suspended === true
    const { inning, inningHalf } = parseInning(g.statusInfo)

    games.push({
      gameId: g.gameId,
      time,
      awayTeam: fullTeamName(g.awayTeamCode, g.awayTeamName),
      awayPitcher: g.awayStarterName || g.awayPitcherName || '미정',
      homeTeam: fullTeamName(g.homeTeamCode, g.homeTeamName),
      homePitcher: g.homeStarterName || g.homePitcherName || '미정',
      awayScore: abstractState === 'Preview' ? null : g.awayTeamScore ?? null,
      homeScore: abstractState === 'Preview' ? null : g.homeTeamScore ?? null,
      status: cancelled ? '취소' : g.statusInfo || g.statusCode || '',
      abstractState,
      inning: abstractState === 'Live' ? inning : null,
      inningHalf: abstractState === 'Live' ? inningHalf : null,
    })
  }

  // Enrich with starting pitchers from each game's preview (in parallel).
  await Promise.all(
    games.map(async (game) => {
      if (!game.gameId) return
      const { away, home } = await fetchStarters(game.gameId)
      if (away) game.awayPitcher = away
      if (home) game.homePitcher = home
    })
  )

  games.sort((a, b) => a.time.localeCompare(b.time))
  return games
}
