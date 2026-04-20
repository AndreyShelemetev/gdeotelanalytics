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
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const table = project.frequencyTable
  const freqField = project.frequencyField

  const safeLimit = Math.min(Math.max(limit, 1), 100)

  let sql = `SELECT cf.city_code, cf.${freqField} as frequency, cf.loc_country_id
             FROM ${table} cf
             WHERE cf.${freqField} IS NOT NULL AND cf.${freqField} > 0`
  const params: any[] = []

  if (countryId) {
    sql += ' AND cf.loc_country_id = ?'
    params.push(countryId)
  }

  sql += ` ORDER BY cf.${freqField} DESC LIMIT ${safeLimit}`

  const rows = await query(sql, params)
  return NextResponse.json(rows)
}
