// MLB 경기 분석: 데이터 수집 → 가중치 점수 → 홈팀 승률 예측
//
// 가중치 (합 1.0):
//   선발투수 우위  0.35  — 시즌 ERA/WHIP 비교
//   불펜 상태      0.20  — 최근 3일 투구량·연투 기반 피로도
//   최근 폼        0.20  — 최근 10경기 승률
//   타선           0.15  — 시즌 팀 OPS
//   홈 어드밴티지  0.10  — 고정 보정 (역사적으로 홈팀 승률 ~54%)

import { getBullpenStatus } from './mlbBullpen'

const WEIGHTS = { starter: 0.35, bullpen: 0.20, form: 0.20, offense: 0.15 }
const CACHE_TTL_MS = 10 * 60 * 1000

function getCache() {
  if (!globalThis.__analysisFeatureCache) globalThis.__analysisFeatureCache = new Map()
  return globalThis.__analysisFeatureCache
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

// ---------- 데이터 수집 ----------

// 선발투수 시즌 성적 (두 명 한 번에)
async function getStarterStats(pitcherIds, season) {
  const ids = pitcherIds.filter(Boolean)
  if (ids.length === 0) return {}
  const data = await fetchJson(
    `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}` +
    `&hydrate=stats(group=[pitching],type=[season],season=${season})`)
  const out = {}
  for (const p of data.people || []) {
    const s = p.stats?.[0]?.splits?.[0]?.stat
    if (s) {
      out[p.id] = {
        name: p.lastName || p.fullName,
        era: parseFloat(s.era) || null,
        whip: parseFloat(s.whip) || null,
        inningsPitched: s.inningsPitched,
        wins: s.wins, losses: s.losses,
        strikeOuts: s.strikeOuts,
      }
    }
  }
  return out
}

// 시즌 스탠딩: teamId → { winPct, lastTen }
async function getStandings(season) {
  const cache = getCache()
  const key = `standings:${season}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  const data = await fetchJson(
    `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`)
  const map = {}
  for (const rec of data.records || []) {
    for (const tr of rec.teamRecords || []) {
      const lastTen = (tr.records?.splitRecords || []).find(r => r.type === 'lastTen')
      map[tr.team.id] = {
        winPct: parseFloat(tr.winningPercentage) || 0.5,
        lastTenPct: lastTen ? lastTen.wins / Math.max(1, lastTen.wins + lastTen.losses) : 0.5,
        lastTen: lastTen ? `${lastTen.wins}승 ${lastTen.losses}패` : null,
      }
    }
  }
  cache.set(key, { ts: Date.now(), data: map })
  return map
}

// 팀 타격 성적 (시즌 OPS)
async function getTeamOPS(teamId, season) {
  const cache = getCache()
  const key = `ops:${teamId}:${season}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  const data = await fetchJson(
    `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`)
  const s = data.stats?.[0]?.splits?.[0]?.stat
  const out = s ? { ops: parseFloat(s.ops) || null, runsPerGame: s.runs && s.gamesPlayed ? (s.runs / s.gamesPlayed).toFixed(1) : null } : {}
  cache.set(key, { ts: Date.now(), data: out })
  return out
}

// 불펜 피로도 점수: 낮을수록 좋음 (선발 제외, 최근일수록 가중)
function bullpenFatigue(bullpenData) {
  let fatigue = 0
  let b2bCount = 0
  for (const p of bullpenData.pitchers) {
    if (p.isStarter) continue
    for (const a of p.appearances) {
      const w = a.daysAgo <= 1 ? 1.0 : a.daysAgo === 2 ? 0.6 : 0.3
      fatigue += a.pitches * w
    }
    if (p.backToBack) { fatigue += 30; b2bCount++ }
  }
  return { fatigue: Math.round(fatigue), b2bCount }
}

// ---------- 수집 + 점수 계산 ----------

export async function analyzeGame({ awayTeamId, homeTeamId, awayPitcherId, homePitcherId, dateStr }) {
  const season = dateStr.slice(0, 4)

  const [starters, standings, awayOPS, homeOPS, awayBp, homeBp] = await Promise.all([
    getStarterStats([awayPitcherId, homePitcherId], season).catch(() => ({})),
    getStandings(season).catch(() => ({})),
    getTeamOPS(awayTeamId, season).catch(() => ({})),
    getTeamOPS(homeTeamId, season).catch(() => ({})),
    getBullpenStatus(awayTeamId, dateStr).catch(() => ({ pitchers: [] })),
    getBullpenStatus(homeTeamId, dateStr).catch(() => ({ pitchers: [] })),
  ])

  const awaySP = starters[awayPitcherId] || null
  const homeSP = starters[homePitcherId] || null
  const awayForm = standings[awayTeamId] || { winPct: 0.5, lastTenPct: 0.5, lastTen: null }
  const homeForm = standings[homeTeamId] || { winPct: 0.5, lastTenPct: 0.5, lastTen: null }
  const awayFat = bullpenFatigue(awayBp)
  const homeFat = bullpenFatigue(homeBp)

  // ----- 각 요소를 홈팀 관점 -1(원정 우위) ~ +1(홈 우위)로 정규화 -----
  const edges = {}

  // 선발: ERA 차이 (3.00 차이 = 최대치), WHIP 보조
  if (awaySP?.era != null && homeSP?.era != null) {
    const eraEdge = clamp((awaySP.era - homeSP.era) / 3.0, -1, 1)
    const whipEdge = awaySP.whip != null && homeSP.whip != null
      ? clamp((awaySP.whip - homeSP.whip) / 0.6, -1, 1) : 0
    edges.starter = clamp(eraEdge * 0.7 + whipEdge * 0.3, -1, 1)
  } else {
    edges.starter = 0 // 선발 미정이면 중립
  }

  // 불펜: 피로도 차이 (200 투구 차이 = 최대치)
  edges.bullpen = clamp((awayFat.fatigue - homeFat.fatigue) / 200, -1, 1)

  // 최근 폼: 최근 10경기 승률 차이 (시즌 승률 30% 반영)
  edges.form = clamp(
    (homeForm.lastTenPct - awayForm.lastTenPct) * 0.7 +
    (homeForm.winPct - awayForm.winPct) * 0.3, -1, 1) * 2
  edges.form = clamp(edges.form, -1, 1)

  // 타선: OPS 차이 (0.150 차이 = 최대치)
  edges.offense = awayOPS.ops != null && homeOPS.ops != null
    ? clamp((homeOPS.ops - awayOPS.ops) / 0.15, -1, 1)
    : 0

  // ----- 가중 합산 → 홈팀 승률 -----
  const x = WEIGHTS.starter * edges.starter + WEIGHTS.bullpen * edges.bullpen +
            WEIGHTS.form * edges.form + WEIGHTS.offense * edges.offense
  // 기본 54%(홈 어드밴티지, 가중치 0.10 반영) ± 요소 기여
  const homeWinPct = Math.round(clamp(0.54 + x * 0.42, 0.15, 0.85) * 100)

  return {
    homeWinPct,
    awayWinPct: 100 - homeWinPct,
    edges,     // 요소별 -1~+1 (양수 = 홈 우위)
    weights: WEIGHTS,
    facts: {
      awaySP, homeSP,
      awayForm, homeForm,
      awayOPS, homeOPS,
      awayBullpen: { ...awayFat, tired: awayBp.pitchers.filter(p => !p.isStarter && p.backToBack).map(p => p.name) },
      homeBullpen: { ...homeFat, tired: homeBp.pitchers.filter(p => !p.isStarter && p.backToBack).map(p => p.name) },
    },
  }
}
