import { getNPBSchedule } from '@/lib/npb'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') // YYYY-MM-DD
  if (!date) return Response.json({ error: 'date required' }, { status: 400 })
  try {
    const games = await getNPBSchedule(date)
    return Response.json({ games })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
