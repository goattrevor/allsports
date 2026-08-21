const TEAM_KO = {
  108: 'LA 에인절스', 109: '애리조나 다이아몬드백스', 110: '볼티모어 오리올스',
  111: '보스턴 레드삭스', 112: '시카고 컵스', 113: '신시내티 레즈',
  114: '클리블랜드 가디언스', 115: '콜로라도 로키스', 116: '디트로이트 타이거스',
  117: '휴스턴 애스트로스', 118: '캔자스시티 로열스', 119: 'LA 다저스',
  120: '워싱턴 내셔널스', 121: '뉴욕 메츠', 133: '애슬레틱스',
  134: '피츠버그 파이리츠', 135: '샌디에이고 파드리스', 136: '시애틀 매리너스',
  137: '샌프란시스코 자이언츠', 138: '세인트루이스 카디널스',
  139: '탬파베이 레이스', 140: '텍사스 레인저스', 141: '토론토 블루제이스',
  142: '미네소타 트윈스', 143: '필라델피아 필리스', 144: '애틀랜타 브레이브스',
  145: '시카고 화이트삭스', 146: '마이애미 말린스', 147: '뉴욕 양키스',
  158: '밀워키 브루어스',
}

function getLastName(fullName) {
  if (!fullName) return '미정'
  if (fullName.includes(',')) return fullName.split(',')[0].trim()
  const parts = fullName.trim().split(' ')
  return parts[parts.length - 1]
}

export async function getMLBSchedule(dateStr) {
  // dateStr: KST 날짜 "2026-06-22"
  // KST 새벽 경기는 MLB API에선 전날 날짜로 등록되어 있음
  // 전날 + 당일 모두 조회 후 KST 변환해서 필터링

  const [y, m, d] = dateStr.split('-').map(Number)
  const prevDate = new Date(Date.UTC(y, m - 1, d - 1))
  const prevStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth()+1).padStart(2,'0')}-${String(prevDate.getUTCDate()).padStart(2,'0')}`

  const [res1, res2] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${prevStr}&hydrate=probablePitcher,linescore,decisions`, { cache: 'no-store' }),
    fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=probablePitcher,linescore,decisions`, { cache: 'no-store' }),
  ])

  const [data1, data2] = await Promise.all([res1.json(), res2.json()])

  const games = []
  for (const data of [data1, data2]) {
    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        const startUTC = new Date(game.gameDate)
        const kstMs = startUTC.getTime() + 9 * 60 * 60 * 1000
        const kst = new Date(kstMs)

        // KST 날짜 계산
        const gameKSTDate = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`

        // 요청한 KST 날짜와 다르면 스킵
        if (gameKSTDate !== dateStr) continue

        const hh = String(kst.getUTCHours()).padStart(2, '0')
        const mm = String(kst.getUTCMinutes()).padStart(2, '0')

        games.push({
          time: `${hh}:${mm}`,
          gamePk: game.gamePk ?? null,
          awayPitcherId: game.teams?.away?.probablePitcher?.id ?? null,
          homePitcherId: game.teams?.home?.probablePitcher?.id ?? null,
          awayTeamId: game.teams?.away?.team?.id ?? null,
          homeTeamId: game.teams?.home?.team?.id ?? null,
          awayTeam: TEAM_KO[game.teams?.away?.team?.id] || game.teams?.away?.team?.name || '?',
          awayPitcher: getLastName(game.teams?.away?.probablePitcher?.fullName),
          homeTeam: TEAM_KO[game.teams?.home?.team?.id] || game.teams?.home?.team?.name || '?',
          homePitcher: getLastName(game.teams?.home?.probablePitcher?.fullName),
          awayScore: game.teams?.away?.score ?? null,
          homeScore: game.teams?.home?.score ?? null,
          status: game.status?.detailedState || '',
          abstractState: game.status?.abstractGameState || 'Preview',
          inning: game.linescore?.currentInning ?? null,
          inningHalf: game.linescore?.inningHalf ?? null,
        })
      }
    }
  }

  games.sort((a, b) => a.time.localeCompare(b.time))
  return games
}