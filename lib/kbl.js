// KBL (Korean Basketball League) via Naver Sports' JSON schedule API.
// Same endpoint family as KBO, under the basketball category.
//   https://api-gw.sports.naver.com/schedule/games
//     ?upperCategoryId=basketball&categoryId=kbl&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
// Times are already KST. Basketball has no starting pitchers.

const NAVER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://sports.naver.com/',
  Accept: 'application/json',
}

function toAbstractState(statusCode) {
  const s = String(statusCode || '').toUpperCase()
  if (s === 'RESULT' || s === 'FINAL' || s === 'END') return 'Final'
  if (s === 'STARTED' || s === 'LIVE' || s === 'PLAYING') return 'Live'
  return 'Preview'
}

export async function getKBLSchedule(dateStr) {
  const url =
    'https://api-gw.sports.naver.com/schedule/games' +
    '?upperCategoryId=basketball&categoryId=kbl' +
    `&fromDate=${dateStr}&toDate=${dateStr}`

  const res = await fetch(url, { headers: NAVER_HEADERS, cache: 'no-store' })
  if (!res.ok) throw new Error(`Naver API ${res.status}`)

  const data = await res.json()
  const rawGames = data?.result?.games || data?.games || []

  const games = []
  for (const g of rawGames) {
    const gameDate = (g.gameDate || '').replace(/-/g, '')
    if (gameDate && gameDate !== dateStr.replace(/-/g, '')) continue

    let time = g.gameTime || '미정'
    if ((!g.gameTime || g.gameTime === '') && g.gameDateTime) {
      time = (String(g.gameDateTime).split('T')[1] || '').slice(0, 5) || '미정'
    }

    const abstractState = toAbstractState(g.statusCode)
    const cancelled = g.cancel === true || g.suspended === true

    games.push({
      time,
      awayTeam: g.awayTeamName || '?',
      homeTeam: g.homeTeamName || '?',
      awayScore: abstractState === 'Preview' ? null : g.awayTeamScore ?? null,
      homeScore: abstractState === 'Preview' ? null : g.homeTeamScore ?? null,
      abstractState,
      statusShort: abstractState === 'Live' ? (g.statusInfo || 'LIVE') : '',
      status: cancelled ? '취소' : g.statusInfo || g.statusCode || '',
    })
  }

  games.sort((a, b) => a.time.localeCompare(b.time))
  return games
}
