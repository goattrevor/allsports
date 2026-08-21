// GET /api/mlb/analysis?gamePk=&away=&home=&awaySp=&homeSp=&date=&awayTeam=&homeTeam=
// 가중치 점수 + Claude API 분석문. 같은 경기는 하루 단위로 캐시.
import { createClient } from '@supabase/supabase-js'
import { analyzeGame } from '@/lib/mlbAnalysis'

// 서버 전용 캐시 클라이언트 (service role 키 — 절대 NEXT_PUBLIC_ 붙이지 말 것)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try { return createClient(url, key) } catch { return null }
}

function getMemCache() {
  if (!globalThis.__analysisResultCache) globalThis.__analysisResultCache = new Map()
  return globalThis.__analysisResultCache
}

async function generateAIText(facts, homeWinPct, awayTeam, homeTeam) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `당신은 야구 분석가입니다. 아래 MLB 경기 데이터를 근거로 한국어 프리뷰를 3~4문장으로 작성하세요.
- 수치를 근거로 구체적으로 (ERA, 최근 10경기, 불펜 피로도 등)
- 과장 없이 담백하게, 마지막에 관전 포인트 하나
- 원정팀: ${awayTeam}, 홈팀: ${homeTeam}, 모델이 계산한 홈팀 승률: ${homeWinPct}%

데이터: ${JSON.stringify(facts)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.content?.[0]?.text || null
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const gamePk = sp.get('gamePk')
  const date = sp.get('date')
  const awayTeamId = sp.get('away')
  const homeTeamId = sp.get('home')
  if (!gamePk || !date || !awayTeamId || !homeTeamId) {
    return Response.json({ error: 'gamePk, away, home, date required' }, { status: 400 })
  }
  const cacheKey = `${gamePk}:${date}`

  // 1) 캐시 조회 — Supabase(배포 환경에서도 유지) → 메모리 순
  const admin = getAdminClient()
  if (admin) {
    const { data } = await admin.from('game_analysis')
      .select('payload').eq('cache_key', cacheKey).maybeSingle()
    if (data?.payload) return Response.json(data.payload)
  }
  const mem = getMemCache()
  const memHit = mem.get(cacheKey)
  if (memHit && Date.now() - memHit.ts < 6 * 60 * 60 * 1000) {
    return Response.json(memHit.payload)
  }

  // 2) 점수 계산
  try {
    const result = await analyzeGame({
      awayTeamId, homeTeamId,
      awayPitcherId: sp.get('awaySp'), homePitcherId: sp.get('homeSp'),
      dateStr: date,
    })

    // 3) AI 분석문 (키 없으면 null — 점수만 반환)
    const aiText = await generateAIText(
      result.facts, result.homeWinPct,
      sp.get('awayTeam') || '원정팀', sp.get('homeTeam') || '홈팀',
    ).catch(() => null)

    const payload = { ...result, aiText, generatedAt: new Date().toISOString() }

    // 4) 캐시 저장
    mem.set(cacheKey, { ts: Date.now(), payload })
    if (admin) {
      await admin.from('game_analysis')
        .upsert({ cache_key: cacheKey, game_date: date, payload }, { onConflict: 'cache_key' })
    }
    return Response.json(payload)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
