import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/mysql'
import { PROJECTS, PREMISES_GROUP_SQL, type ProjectId } from '@/lib/constants'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project') as ProjectId
  const countryId = searchParams.get('country_id')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = 50

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField  // 'is_active_ru' для gdeotel, 'is_active_en' для hotelin

  // Условие для фильтрации только активных отелей
  let where = `h.${field} = 1`
  const params: any[] = []

  if (countryId) {
    where += ' AND h.loc_country_id = ?'
    params.push(countryId)
  }

  const offset = (Math.max(page, 1) - 1) * pageSize

  // Count
  const [countRow] = await query<any>(
    `SELECT COUNT(*) as total FROM (
       SELECT hs.entity_id
       FROM hotel_services hs
       INNER JOIN hotels h ON h.id = hs.entity_id
       WHERE hs.entity_type = 'hotel' AND ${where}
       GROUP BY hs.entity_id
       HAVING COUNT(DISTINCT hs.service_type) = 1
     ) t`,
    params
  )

  // Data
  const rows = await query<any>(
    `SELECT h.id, h.name, h.premises_type, h.loc_country_id, h.loc_city_id,
            (${PREMISES_GROUP_SQL}) as obj_group,
            MAX(hs.service_type) as single_provider
     FROM hotel_services hs
     INNER JOIN hotels h ON h.id = hs.entity_id
     WHERE hs.entity_type = 'hotel' AND ${where}
     GROUP BY h.id
     HAVING COUNT(DISTINCT hs.service_type) = 1
     ORDER BY h.name
     LIMIT ${pageSize} OFFSET ${offset}`,
    params
  )

  return NextResponse.json({
    hotels: rows,
    total: countRow?.total || 0,
    page,
    pageSize,
  })
}
