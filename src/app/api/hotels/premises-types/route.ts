import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/mysql'

/**
 * GET /api/hotels/premises-types?city_id=NNN
 * Возвращает фактические значения premises_type для активных отелей города.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cityId = searchParams.get('city_id')
  if (!cityId) {
    return NextResponse.json({ error: 'city_id is required' }, { status: 400 })
  }

  const rows = await query<any>(
    `SELECT premises_type, COUNT(*) AS cnt
     FROM hotels
     WHERE is_active_ru = 1 AND loc_city_id = ?
     GROUP BY premises_type
     ORDER BY cnt DESC`,
    [parseInt(cityId, 10)]
  )

  return NextResponse.json(
    rows.map((r) => ({
      premises_type: r.premises_type || '',
      count: Number(r.cnt) || 0,
    }))
  )
}
