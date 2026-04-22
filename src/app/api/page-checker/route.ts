import { NextRequest, NextResponse } from 'next/server'
import { defaultSitemap, PageType, SiteId } from '@/lib/page-checker/defaults'
import { parseSitemap, sampleRandom } from '@/lib/page-checker/sitemap'
import { checkPage } from '@/lib/page-checker/check-page'
import { getRun, setRun, RunState } from '@/lib/page-checker/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function runJob(state: RunState) {
  const CONCURRENCY = 4
  let idx = 0

  async function worker() {
    while (true) {
      const current = getRun()
      if (!current || current.id !== state.id || current.status !== 'running') return
      const i = idx++
      if (i >= state.urls.length) return
      const url = state.urls[i]
      try {
        const report = await checkPage(url, state.site, state.pageType)
        state.reports.push(report)
      } catch (e: any) {
        state.reports.push({
          url, finalUrl: url, httpCode: 0, elapsedMs: 0,
          error: e?.message || 'check failed',
          groups: [], summary: { total: 0, pass: 0, warn: 0, fail: 0, overall: 'fail' },
        })
      }
      state.progress.done = state.reports.length
      setRun(state)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  state.status = 'done'
  state.finishedAt = Date.now()
  setRun(state)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = body.action as string

  if (action === 'start') {
    const site = body.site as SiteId
    const pageType = body.pageType as PageType
    const mode = (body.mode as 'all' | 'random') || 'all'
    const randomCount = Number(body.randomCount) || 10
    const sitemapUrl = (body.sitemapUrl as string) || defaultSitemap(site, pageType)

    if (!site || !pageType) return NextResponse.json({ error: 'site и pageType обязательны' }, { status: 400 })

    const existing = getRun()
    if (existing && existing.status === 'running') {
      return NextResponse.json({ error: 'Проверка уже выполняется', runId: existing.id }, { status: 409 })
    }

    let parsed
    try {
      parsed = await parseSitemap(sitemapUrl, true)
    } catch (e: any) {
      return NextResponse.json({ error: `Не удалось прочитать sitemap: ${e?.message || e}` }, { status: 400 })
    }

    let urls = parsed.urls
    if (urls.length === 0) return NextResponse.json({ error: 'В sitemap не найдено URL' }, { status: 400 })
    if (mode === 'random') urls = sampleRandom(urls, Math.max(1, Math.min(randomCount, urls.length)))

    const state: RunState = {
      id: `run-${Date.now()}`,
      status: 'running',
      site, pageType, sitemapUrl, mode, randomCount,
      startedAt: Date.now(),
      urls,
      reports: [],
      progress: { total: urls.length, done: 0 },
    }
    setRun(state)
    // Запускаем в фоне, не ждём завершения
    runJob(state).catch(e => {
      const cur = getRun()
      if (cur && cur.id === state.id) {
        cur.status = 'error'
        cur.error = e?.message || 'run failed'
        cur.finishedAt = Date.now()
        setRun(cur)
      }
    })

    return NextResponse.json({ ok: true, runId: state.id, total: urls.length })
  }

  if (action === 'stop') {
    const cur = getRun()
    if (cur && cur.status === 'running') {
      cur.status = 'done'
      cur.finishedAt = Date.now()
      setRun(cur)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'status'

  if (action === 'defaults') {
    const site = (searchParams.get('site') as SiteId) || 'gdeotel'
    const pageType = (searchParams.get('pageType') as PageType) || 'country'
    return NextResponse.json({ sitemapUrl: defaultSitemap(site, pageType) })
  }

  if (action === 'status') {
    const cur = getRun()
    if (!cur) return NextResponse.json({ status: 'idle' })
    return NextResponse.json({
      id: cur.id,
      status: cur.status,
      error: cur.error,
      site: cur.site,
      pageType: cur.pageType,
      sitemapUrl: cur.sitemapUrl,
      mode: cur.mode,
      randomCount: cur.randomCount,
      progress: cur.progress,
      startedAt: cur.startedAt,
      finishedAt: cur.finishedAt,
      reports: cur.reports,
    })
  }

  return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
}
