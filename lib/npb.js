// NPB data helper
//
// 소스: NPB 공식 사이트의 "予告先発投手"(예고 선발투수) 공시 페이지
//   https://npb.jp/announcement/starter/
// 이 페이지는 "가장 최근에 공시된, 아직 열리지 않은 다음 경기"의 구단·선발투수·
// 구장·시간을 한 번에 보여준다. 일본은 시즌 내내 予告先発(예고 선발) 제도를
// 운영하기 때문에 경기 전날 오후에 이 페이지가 갱신된다.
//
// 한국(KST)과 일본(JST)은 시차가 없다(둘 다 UTC+9). 그래서 MLB 모듈과 달리
// 타임존 변환이 필요 없고, npb.jp에 적힌 시간을 그대로 쓰면 된다.
//
// ⚠️ 비공식 스크래핑(공식 API 없음)이라 NPB가 페이지 마크업을 바꾸면 깨질 수
// 있다. 로컬에서 `curl https://npb.jp/announcement/starter/ | less` 로 실제
// 응답을 한 번 확인하고, 정규식이 잘 맞는지 검증한 뒤 배포하는 걸 추천한다.
// (이 코드는 샌드박스에서 실제 요청을 테스트하지 못한 상태로 작성됨)

const TEAM_KO = {
  '阪神タイガース': '한신 타이거스',
  '横浜DeNAベイスターズ': '요코하마 DeNA 베이스타즈',
  '読売ジャイアンツ': '요미우리 자이언츠',
  '中日ドラゴンズ': '주니치 드래곤즈',
  '広島東洋カープ': '히로시마 도요 카프',
  '東京ヤクルトスワローズ': '도쿄 야쿠르트 스왈로즈',
  '福岡ソフトバンクホークス': '후쿠오카 소프트뱅크 호크스',
  '北海道日本ハムファイターズ': '홋카이도 니혼햄 파이터스',
  'オリックス・バファローズ': '오릭스 버팔로즈',
  '東北楽天ゴールデンイーグルス': '도호쿠 라쿠텐 골든이글스',
  '埼玉西武ライオンズ': '사이타마 세이부 라이온즈',
  '千葉ロッテマリーンズ': '치바 롯데 마린즈',
}

function teamKo(japaneseName) {
  return TEAM_KO[japaneseName] || japaneseName || '?'
}

export async function getNPBSchedule(dateStr) {
  // dateStr: "YYYY-MM-DD" (KST == JST, 변환 불필요)
  const res = await fetch('https://npb.jp/announcement/starter/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; allsports-bot/1.0)' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`NPB announcement page ${res.status}`)
  const html = await res.text()

  // 헤더에서 "6月21日の予告先発投手" 같은 날짜를 뽑아 요청한 날짜와 비교.
  // 이 페이지는 "가장 최근 공시된 다음 경기"만 보여주므로, 날짜가 다르면
  // 아직 공시 전이거나(당일 늦은 오후에 갱신) 이미 지난 경기다.
  const [, reqM, reqD] = dateStr.split('-').map(Number)
  const dateHeaderMatch = html.match(/(\d{1,2})月(\d{1,2})日の予告先発投手/)
  if (dateHeaderMatch) {
    const pageM = Number(dateHeaderMatch[1])
    const pageD = Number(dateHeaderMatch[2])
    if (pageM !== reqM || pageD !== reqD) return []
  }

  // 경기 하나당 <div class="unit ..."> 블록 하나.
  // 블록 구조: team_left(홈팀) → team_right(원정팀) → info(구장+시간)
  // ⚠️ npb.jp는 왼쪽이 "홈팀"이다 (일본 표기 관행)
  // 투수 이름은 선수 링크 안의 <span>이름</span>에 들어있다.
  const unitRe = /<div class="unit [^"]*">([\s\S]*?)（([^）]+)）\s*(\d{1,2}:\d{2})/g
  const games = []
  let m
  while ((m = unitRe.exec(html))) {
    const block = m[1]
    const time = m[3]

    // team_right 기준으로 좌(홈)/우(원정) 분리
    const splitIdx = block.indexOf('team_right')
    if (splitIdx === -1) continue
    const homeHtml = block.slice(0, splitIdx)
    const awayHtml = block.slice(splitIdx)

    const homeTeam = homeHtml.match(/alt="([^"]+)"/)?.[1]
    const awayTeam = awayHtml.match(/alt="([^"]+)"/)?.[1]
    // 이름의 전각 공백(井上　温大) 제거
    const homePitcher = homeHtml.match(/<span>([^<]+)<\/span>/)?.[1]?.replace(/[\s　]+/g, '')
    const awayPitcher = awayHtml.match(/<span>([^<]+)<\/span>/)?.[1]?.replace(/[\s　]+/g, '')
    if (!homeTeam || !awayTeam) continue

    games.push({
      time,
      awayTeam: teamKo(awayTeam),
      awayPitcher: awayPitcher || '미정',
      homeTeam: teamKo(homeTeam),
      homePitcher: homePitcher || '미정',
      awayScore: null,
      homeScore: null,
      status: '',
      abstractState: 'Preview', // TODO: npb.jp/scores/ 페이지 연동해서 진행중/종료 상태 추가 가능
      inning: null,
      inningHalf: null,
    })
  }

  games.sort((a, b) => a.time.localeCompare(b.time))
  return games
}
