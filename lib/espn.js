// ESPN public scoreboard helper (NBA + European soccer leagues).
// ESPN's site API is free and needs no key:
//   https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates=YYYYMMDD
// Times come back in UTC, so we convert to KST and keep only games that fall on
// the requested KST date (games can straddle two US/EU calendar days).

function toCompact(dateStr) {
  return dateStr.replace(/-/g, '')
}

function prevCompact(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const p = new Date(Date.UTC(y, m - 1, d - 1))
  return `${p.getUTCFullYear()}${String(p.getUTCMonth() + 1).padStart(2, '0')}${String(p.getUTCDate()).padStart(2, '0')}`
}

function normalize(events, dateStr) {
  const games = []
  const seen = new Set()

  for (const ev of events) {
    if (!ev || seen.has(ev.id)) continue
    const comp = ev.competitions?.[0]
    if (!comp) continue

    // UTC -> KST, then filter to the requested KST date
    const startUTC = new Date(ev.date)
    if (isNaN(startUTC)) continue
    const kst = new Date(startUTC.getTime() + 9 * 60 * 60 * 1000)
    const gameKSTDate = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`
    if (gameKSTDate !== dateStr) continue
    seen.add(ev.id)

    const hh = String(kst.getUTCHours()).padStart(2, '0')
    const mm = String(kst.getUTCMinutes()).padStart(2, '0')

    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    const teamName = t =>
      t?.team?.shortDisplayName || t?.team?.displayName || t?.team?.name || '?'

    const state = comp.status?.type?.state // 'pre' | 'in' | 'post'
    const abstractState =
      state === 'post' ? 'Final' : state === 'in' ? 'Live' : 'Preview'

    games.push({
      time: `${hh}:${mm}`,
      awayTeam: teamName(away),
      homeTeam: teamName(home),
      awayScore: abstractState === 'Preview' ? null : (away?.score != null ? Number(away.score) : null),
      homeScore: abstractState === 'Preview' ? null : (home?.score != null ? Number(home.score) : null),
      abstractState,
      statusShort:
        abstractState === 'Live'
          ? (comp.status?.type?.shortDetail || comp.status?.type?.detail || 'LIVE')
          : '',
      status: comp.status?.type?.description || '',
    })
  }

  games.sort((a, b) => a.time.localeCompare(b.time))
  return games
}

export async function getEspnSchedule(sportPath, dateStr) {
  // sportPath e.g. 'basketball/nba' or 'soccer/eng.1'
  const base = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard?limit=100&dates=`

  // Query the requested KST day and the previous day (to catch KST-shifted games).
  const [res1, res2] = await Promise.all([
    fetch(base + prevCompact(dateStr), { cache: 'no-store' }),
    fetch(base + toCompact(dateStr), { cache: 'no-store' }),
  ])
  if (!res1.ok && !res2.ok) throw new Error(`ESPN ${res1.status}/${res2.status}`)

  const [d1, d2] = await Promise.all([
    res1.ok ? res1.json() : Promise.resolve({}),
    res2.ok ? res2.json() : Promise.resolve({}),
  ])

  const events = [...(d1.events || []), ...(d2.events || [])]
  return normalize(events, dateStr)
}
