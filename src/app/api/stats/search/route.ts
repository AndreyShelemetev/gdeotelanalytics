import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/mysql'
import { PROJECTS, type ProjectId } from '@/lib/constants'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project') as ProjectId
  const searchName = searchParams.get('q')?.trim()
  const hotelId = searchParams.get('id')?.trim()

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField  // 'is_active_ru' для gdeotel, 'is_active_en' для hotelin

  let whereClause = `h.${field} = 1`
  const params: any[] = []

  if (hotelId) {
    // Search by ID
    whereClause += ' AND h.id = ?'
    params.push(parseInt(hotelId, 10))
  } else if (searchName) {
    // Search by name
    if (searchName.length < 2) {
      return NextResponse.json({ error: 'Query too short' }, { status: 400 })
    }
    whereClause += ' AND h.name LIKE ?'
    params.push(`%${searchName}%`)
  } else {
    return NextResponse.json({ error: 'Provide either q (name) or id parameter' }, { status: 400 })
  }

  const hotels = await query<any>(
    `SELECT h.id, h.name, h.premises_type, h.loc_country_id, h.loc_city_id,
            GROUP_CONCAT(DISTINCT hs.service_type ORDER BY hs.service_type) as providers,
            COUNT(DISTINCT hs.service_type) as provider_count
     FROM hotels h
     LEFT JOIN hotel_services hs ON hs.entity_id = h.id AND hs.entity_type = 'hotel'
     WHERE ${whereClause}
     GROUP BY h.id
     ORDER BY h.name
     LIMIT 50`,
    params
  )

  return NextResponse.json(hotels)
}
