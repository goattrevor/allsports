// MLB 불펜 현황: 팀 로스터의 투수들이 최근 며칠간 얼마나 던졌는지 조회
// 소스: MLB 공식 StatsAPI (무료, 키 불필요)
//  - 로스터: /api/v1/teams/{id}/roster/Active
//  - 최근 경기: /api/v1/schedule?teamId=...
//  - 경기별 투구 기록: /api/v1/game/{gamePk}/boxscore

const CACHE_TTL_MS = 10 * 60 * 1000 // 10분

function getCache() {
  if (!globalThis.__bullpenCache) globalThis.__bullpenCache = new Map()
  return globalThis.__bullpenCache
}

function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function daysBetween(a, b) {
  // a, b: "YYYY-MM-DD" — a에서 b까지 일수 (a가 최신이면 양수)
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
}

function lastName(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(' ')
  return parts[parts.length - 1]
}

export async function getBullpenStatus(teamId, dateStr) {
  const cache = getCache()
  const key = `${teamId}:${dateStr}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  // 1) 현재 로스터의 투수 목록
  const rosterRes = await fetch(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster/Active`,
    { cache: 'no-store' })
  if (!rosterRes.ok) throw new Error(`roster ${rosterRes.status}`)
  const roster = await rosterRes.json()
  const pitchers = new Map() // personId -> { name, appearances: [] }
  for (const p of roster.roster || []) {
    if (p.position?.code === '1') {
      pitchers.set(p.person.id, { name: lastName(p.person.fullName), appearances: [] })
    }
  }

  // 2) 최근 5일간 완료된 경기 (최대 3경기)
  const schedRes = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}` +
    `&startDate=${shiftDate(dateStr, -5)}&endDate=${dateStr}`,
    { cache: 'no-store' })
  if (!schedRes.ok) throw new Error(`schedule ${schedRes.status}`)
  const sched = await schedRes.json()
  const finished = []
  for (const d of sched.dates || []) {
    for (const g of d.games || []) {
      if (g.status?.abstractGameState === 'Final') {
        finished.push({ gamePk: g.gamePk, date: g.officialDate || d.date })
      }
    }
  }
  finished.sort((a, b) => b.date.localeCompare(a.date))
  const recent = finished.slice(0, 3)

  // 3) 각 경기 박스스코어에서 이 팀 투수들의 투구 수 수집
  await Promise.all(recent.map(async (g) => {
    const boxRes = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore`, { cache: 'no-store' })
    if (!boxRes.ok) return
    const box = await boxRes.json()
    const side = box.teams?.home?.team?.id === Number(teamId) ? box.teams.home : box.teams?.away
    for (const player of Object.values(side?.players || {})) {
      const pit = player.stats?.pitching
      if (!pit || !(pit.numberOfPitches > 0)) continue
      const id = player.person?.id
      if (!pitchers.has(id)) {
        // 로스터에서 빠진 투수(트레이드 등)도 등판 기록이 있으면 표시
        pitchers.set(id, { name: lastName(player.person?.fullName), appearances: [] })
      }
      pitchers.get(id).appearances.push({
        daysAgo: daysBetween(dateStr, g.date),
        pitches: pit.numberOfPitches,
        ip: pit.inningsPitched,
        started: (pit.gamesStarted || 0) > 0,
      })
    }
  }))

  // 4) 정리: 최근 등판 순 정렬, 연투 여부 계산
  const list = [...pitchers.values()].map(p => {
    p.appearances.sort((a, b) => a.daysAgo - b.daysAgo)
    const days = p.appearances.map(a => a.daysAgo)
    return {
      name: p.name,
      appearances: p.appearances,
      totalPitches: p.appearances.reduce((s, a) => s + a.pitches, 0),
      // 연투: 가장 최근 이틀 연속 등판
      backToBack: days.includes(1) && days.includes(2),
      isStarter: p.appearances.some(a => a.started),
    }
  })

  list.sort((a, b) => {
    const aRecent = a.appearances[0]?.daysAgo ?? 99
    const bRecent = b.appearances[0]?.daysAgo ?? 99
    if (aRecent !== bRecent) return aRecent - bRecent
    return b.totalPitches - a.totalPitches
  })

  const data = { teamId: Number(teamId), pitchers: list }
  cache.set(key, { ts: Date.now(), data })
  return data
}
