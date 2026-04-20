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
  const countryId = searchParams.get('country_id')
  const regionId = searchParams.get('region_id')

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField  // 'is_active_ru' для gdeotel, 'is_active_en' для hotelin

  // Фильтрируем только активные города
  let sql = `SELECT id, loc_country_id, loc_region_id, name, name_ru, ${field} as is_active
             FROM loc_cities
             WHERE ${field} = 1`
  const params: any[] = []

  if (countryId) {
    sql += ' AND loc_country_id = ?'
    params.push(countryId)
  }
  if (regionId) {
    sql += ' AND loc_region_id = ?'
    params.push(regionId)
  }

  sql += ' ORDER BY name LIMIT 500'

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}
