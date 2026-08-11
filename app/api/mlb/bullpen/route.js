import { getBullpenStatus } from '@/lib/mlbBullpen'

// GET /api/mlb/bullpen?away=119&home=135&date=2026-08-11
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const away = searchParams.get('away')
  const home = searchParams.get('home')
  const date = searchParams.get('date')
  if (!away || !home || !date) {
    return Response.json({ error: 'away, home, date required' }, { status: 400 })
  }
  try {
    const [awayData, homeData] = await Promise.all([
      getBullpenStatus(away, date),
      getBullpenStatus(home, date),
    ])
    return Response.json({ away: awayData, home: homeData })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
