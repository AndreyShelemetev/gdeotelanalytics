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
  if (!projectId || !PROJECTS[projectId]) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 })
  }

  const project = PROJECTS[projectId]
  const field = project.activeField  // 'is_active_ru' для gdeotel, 'is_active_en' для hotelin

  const rows = await query(
    `SELECT id, name, name_ru, iso, ${field} as is_active
     FROM loc_countries
     WHERE ${field} = 1  -- Только активные страны
     ORDER BY name`
  )

  return NextResponse.json(rows)
}
