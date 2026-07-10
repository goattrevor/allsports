import { getKBOSchedule } from '@/lib/kbo'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('date') // YYYYMMDD (from the UI) or YYYY-MM-DD
  if (!raw) return Response.json({ error: 'date required' }, { status: 400 })

  // Normalize to YYYY-MM-DD for the Naver API
  const dateStr = raw.includes('-')
    ? raw
    : `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`

  try {
    const games = await getKBOSchedule(dateStr)
    return Response.json({ games })
  } catch (e) {
    return Response.json({ error: e.message, games: [] }, { status: 200 })
  }
}
