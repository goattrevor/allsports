import { getEspnSchedule } from '@/lib/espn'

// Our league id -> ESPN soccer league slug
const SLUG = {
  epl: 'eng.1',          // Premier League
  laliga: 'esp.1',       // La Liga
  seriea: 'ita.1',       // Serie A
  bundesliga: 'ger.1',   // Bundesliga
  ligue1: 'fra.1',       // Ligue 1
}

export async function GET(request, { params }) {
  const { league } = await params // Next.js 15: dynamic params are async
  const slug = SLUG[league]
  if (!slug) return Response.json({ error: 'unknown league', games: [] }, { status: 200 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('date') // YYYY-MM-DD or YYYYMMDD (KST)
  if (!raw) return Response.json({ error: 'date required' }, { status: 400 })

  const dateStr = raw.includes('-')
    ? raw
    : `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`

  try {
    const games = await getEspnSchedule(`soccer/${slug}`, dateStr)
    return Response.json({ games })
  } catch (e) {
    return Response.json({ error: e.message, games: [] }, { status: 200 })
  }
}
