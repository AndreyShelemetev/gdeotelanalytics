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
  const type = searchParams.get('type') // 'countries' | 'regions' | 'cities'
  const countryId = searchParams.get('country_id')
  const regionId = searchParams.get('region_id')

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField

  let sql = ''
  const params: any[] = []

  if (type === 'countries') {
    // Get all countries with hotel count
    sql = `
      SELECT 
        c.id, 
        c.name, 
        COUNT(DISTINCT h.id) as hotel_count
      FROM loc_countries c
      LEFT JOIN hotels h ON h.loc_country_id = c.id AND h.${field} = 1
      WHERE c.${field} = 1
      GROUP BY c.id, c.name
      ORDER BY hotel_count DESC
    `
  } else if (type === 'regions') {
    // Get all regions for a country with hotel count
    if (!countryId) {
      return NextResponse.json({ error: 'country_id required for regions' }, { status: 400 })
    }
    sql = `
      SELECT 
        r.id, 
        r.name, 
        COUNT(DISTINCT h.id) as hotel_count
      FROM loc_regions r
      LEFT JOIN hotels h ON h.loc_region_id = r.id AND h.${field} = 1
      WHERE r.${field} = 1 AND r.loc_country_id = ?
      GROUP BY r.id, r.name
      ORDER BY hotel_count DESC
    `
    params.push(countryId)
  } else if (type === 'cities') {
    // Get all cities for a region with hotel count
    if (!countryId || !regionId) {
      return NextResponse.json({ error: 'country_id and region_id required for cities' }, { status: 400 })
    }
    sql = `
      SELECT 
        ct.id, 
        ct.name, 
        COUNT(DISTINCT h.id) as hotel_count
      FROM loc_cities ct
      LEFT JOIN hotels h ON h.loc_city_id = ct.id AND h.${field} = 1
      WHERE ct.${field} = 1 AND ct.loc_country_id = ? AND ct.loc_region_id = ?
      GROUP BY ct.id, ct.name
      ORDER BY hotel_count DESC
      LIMIT 50
    `
    params.push(countryId, regionId)
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const data = await query(sql, params)
  return NextResponse.json(data)
}
