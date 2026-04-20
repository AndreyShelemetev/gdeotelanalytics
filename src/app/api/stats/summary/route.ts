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
  const regionId = searchParams.get('region_id')
  const cityId = searchParams.get('city_id')

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField  // 'is_active_ru' для gdeotel, 'is_active_en' для hotelin

  // Build WHERE clause - учитываем только активные отели
  let where = `h.${field} = 1`  // ${field} = 1 для активных
  const params: any[] = []

  if (countryId) {
    where += ' AND h.loc_country_id = ?'
    params.push(countryId)
  }
  if (regionId) {
    where += ' AND h.loc_region_id = ?'
    params.push(regionId)
  }
  if (cityId) {
    where += ' AND h.loc_city_id = ?'
    params.push(cityId)
  }

  // 1. Global counts + group breakdown
  const [countStats] = await query<any>(
    `SELECT
       COUNT(DISTINCT h.loc_country_id) as active_countries,
       COUNT(DISTINCT h.loc_region_id) as active_regions,
       COUNT(DISTINCT h.loc_city_id) as active_cities,
       COUNT(*) as total_objects,
       SUM(CASE WHEN (${PREMISES_GROUP_SQL}) = 'hotels' THEN 1 ELSE 0 END) as total_hotels,
       SUM(CASE WHEN (${PREMISES_GROUP_SQL}) = 'apartments' THEN 1 ELSE 0 END) as total_apartments
     FROM hotels h
     WHERE ${where}`,
    params
  )

  // 2. Breakdown by premises_type with group
  const typeBreakdown = await query<any>(
    `SELECT h.premises_type, COUNT(*) as cnt, (${PREMISES_GROUP_SQL}) as obj_group
     FROM hotels h
     WHERE ${where}
     GROUP BY h.premises_type
     ORDER BY cnt DESC`,
    params
  )

  // 3. Provider coverage — Hotels group only
  const providerCoverage = await query<any>(
    `SELECT hs.service_type, COUNT(DISTINCT hs.entity_id) as matched_hotels
     FROM hotel_services hs
     INNER JOIN hotels h ON h.id = hs.entity_id
     WHERE hs.entity_type = 'hotel' AND ${where}
       AND (${PREMISES_GROUP_SQL}) = 'hotels'
     GROUP BY hs.service_type
     ORDER BY matched_hotels DESC`,
    params
  )

  // 4. Provider coverage — Apartments group
  const providerCoverageApartments = await query<any>(
    `SELECT hs.service_type, COUNT(DISTINCT hs.entity_id) as matched_hotels
     FROM hotel_services hs
     INNER JOIN hotels h ON h.id = hs.entity_id
     WHERE hs.entity_type = 'hotel' AND ${where}
       AND (${PREMISES_GROUP_SQL}) = 'apartments'
     GROUP BY hs.service_type
     ORDER BY matched_hotels DESC`,
    params
  )

  return NextResponse.json({
    summary: countStats || {},
    typeBreakdown,
    providerCoverage,
    providerCoverageApartments,
  })
}
