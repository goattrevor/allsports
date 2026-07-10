import { getKBLSchedule } from '@/lib/kbl'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('date') // YYYY-MM-DD or YYYYMMDD (KST)
  if (!raw) return Response.json({ error: 'date required' }, { status: 400 })

  const dateStr = raw.includes('-')
    ? raw
    : `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`

  try {
    const games = await getKBLSchedule(dateStr)
    return Response.json({ games })
  } catch (e) {
    return Response.json({ error: e.message, games: [] }, { status: 200 })
  }
}
