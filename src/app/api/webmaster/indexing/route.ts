import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'

const YANDEX_API = 'https://api.webmaster.yandex.net/v4'

// ─── Module-level state for background sitemap check ───
interface SitemapCheckState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  sitemapUrls: string[]
  indexed: { url: string; sitemapUrl: string; status?: string; httpCode?: number; accessDate?: string }[]
  notIndexed: string[]
  progress: { checked: number; total: number; found: number }
  error: string
  startedAt: number
}

let sitemapCheck: SitemapCheckState = {
  status: 'idle',
  sitemapUrls: [],
  indexed: [],
  notIndexed: [],
  progress: { checked: 0, total: 0, found: 0 },
  error: '',
  startedAt: 0,
}

// ─── Module-level state for background deep URL check ───
interface DeepUrlCheckResult {
  url: string
  known: boolean
  inSearch: boolean
  status?: string
  httpCode?: number
  accessDate?: string
}

interface DeepUrlCheckState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  inputUrls: string[]
  results: DeepUrlCheckResult[]
  progress: {
    indexedChecked: number
    indexedTotal: number
    searchChecked: number
    searchTotal: number
    foundKnown: number
    foundInSearch: number
  }
  error: string
  startedAt: number
}

let deepUrlCheck: DeepUrlCheckState = {
  status: 'idle',
  inputUrls: [],
  results: [],
  progress: { indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0 },
  error: '',
  startedAt: 0,
}

// ─── Helpers ───

function getToken(): string | null {
  const cookieStore = cookies()
  const tokenCookie = cookieStore.get('yandex_token')
  if (!tokenCookie?.value) return null
  try {
    const tokenData = JSON.parse(tokenCookie.value)
    if (!tokenData.access_token || Date.now() >= tokenData.expires_at) return null
    return tokenData.access_token as string
  } catch {
    return null
  }
}

async function yandexFetch(path: string, token: string, silent = false) {
  const url = `${YANDEX_API}${path}`
  if (!silent) console.log(`[Yandex API] GET ${url}`)
  const response = await fetch(url, {
    headers: { 'Authorization': `OAuth ${token}` },
    cache: 'no-store',
  })
  const text = await response.text()
  if (!silent) console.log(`[Yandex API] ${response.status} ${text.substring(0, 300)}`)
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`Non-JSON response: ${text.substring(0, 200)}`) }
  if (!response.ok) throw new Error(`Yandex API ${response.status}: ${JSON.stringify(data)}`)
  return data
}

async function yandexPost(path: string, token: string, body: any) {
  const url = `${YANDEX_API}${path}`
  console.log(`[Yandex API] POST ${url}`)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  console.log(`[Yandex API] POST ${response.status} ${text.substring(0, 300)}`)
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { status: response.status, data }
}

function findHost(hosts: any[], site: string) {
  const norm = site.replace(/\/$/, '')
  return hosts.find((h: any) => {
    const hostUrl = (h.ascii_host_url || '').replace(/\/$/, '')
    return hostUrl === norm || norm.startsWith(hostUrl) || hostUrl.startsWith(norm)
  })
}

function extractSite(pageUrl: string): string {
  try {
    const u = new URL(pageUrl)
    return `${u.protocol}//${u.host}/`
  } catch {
    return ''
  }
}

// Normalize URL for comparison
function normalizeUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url)
    return decoded.replace(/\/$/, '').toLowerCase()
  } catch {
    return url.replace(/\/$/, '').toLowerCase()
  }
}

// ─── Background sitemap check runner ───
async function runSitemapCheck(token: string, userId: string, hostId: string, urls: string[]) {
  const urlMap = new Map<string, string>() // normalized → original
  for (const u of urls) {
    urlMap.set(normalizeUrl(u), u)
  }
  const remaining = new Set(urlMap.keys())

  sitemapCheck.indexed = []
  sitemapCheck.notIndexed = []
  sitemapCheck.progress = { checked: 0, total: 0, found: 0 }

  let offset = 0
  const limit = 100

  try {
    // First request to get total count
    const firstData = await yandexFetch(
      `/user/${userId}/hosts/${encodeURIComponent(hostId)}/indexing/samples?limit=${limit}&offset=0`,
      token, true
    )
    const totalPages = firstData.count || 0
    sitemapCheck.progress.total = totalPages

    // Process first batch
    for (const sample of (firstData.samples || [])) {
      const norm = normalizeUrl(sample.url || '')
      if (remaining.has(norm)) {
        sitemapCheck.indexed.push({
          url: sample.url,
          sitemapUrl: urlMap.get(norm) || sample.url,
          status: sample.status,
          httpCode: sample.http_code,
          accessDate: sample.access_date,
        })
        remaining.delete(norm)
      }
    }
    offset = limit
    sitemapCheck.progress = { checked: offset, total: totalPages, found: sitemapCheck.indexed.length }

    // Continue pagination
    while (offset < totalPages && remaining.size > 0 && sitemapCheck.status === 'running') {
      const data = await yandexFetch(
        `/user/${userId}/hosts/${encodeURIComponent(hostId)}/indexing/samples?limit=${limit}&offset=${offset}`,
        token, true
      )
      const samples = data.samples || []
      if (samples.length === 0) break

      for (const sample of samples) {
        const norm = normalizeUrl(sample.url || '')
        if (remaining.has(norm)) {
          sitemapCheck.indexed.push({
            url: sample.url,
            sitemapUrl: urlMap.get(norm) || sample.url,
            status: sample.status,
            httpCode: sample.http_code,
            accessDate: sample.access_date,
          })
          remaining.delete(norm)
        }
      }

      offset += samples.length
      sitemapCheck.progress = { checked: offset, total: totalPages, found: sitemapCheck.indexed.length }

      // Log every 1000 pages
      if (offset % 1000 === 0) {
        console.log(`[SitemapCheck] ${offset}/${totalPages} checked, ${sitemapCheck.indexed.length}/${urls.length} found, ${remaining.size} remaining`)
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 50))
    }

    if (sitemapCheck.status === 'cancelled') {
      console.log('[SitemapCheck] Cancelled')
      return
    }

    // Remaining URLs were not found in indexed samples
    sitemapCheck.notIndexed = [...remaining].map(norm => urlMap.get(norm) || norm)
    sitemapCheck.status = 'done'
    console.log(`[SitemapCheck] Done. Found: ${sitemapCheck.indexed.length}, Not found: ${sitemapCheck.notIndexed.length}`)
  } catch (err: any) {
    console.error('[SitemapCheck] Error:', err.message)
    sitemapCheck.status = 'error'
    sitemapCheck.error = err.message
    sitemapCheck.notIndexed = [...remaining].map(norm => urlMap.get(norm) || norm)
  }
}

// ─── Background deep URL check runner ───
// Iterates through indexing/samples (known to robot) and search-urls/in-search/samples (in search)
// to mark each input URL with `known` and `inSearch` flags.
async function runDeepUrlCheck(token: string, userId: string, hostId: string, urls: string[]) {
  const urlMap = new Map<string, string>() // normalized → original
  for (const u of urls) urlMap.set(normalizeUrl(u), u)

  const knownData = new Map<string, { status?: string; httpCode?: number; accessDate?: string }>()
  const inSearchSet = new Set<string>()

  const limit = 100

  // Phase 1: scan indexing/samples (all URLs known to robot)
  const scanIndexing = async () => {
    let offset = 0
    const first = await yandexFetch(
      `/user/${userId}/hosts/${encodeURIComponent(hostId)}/indexing/samples?limit=${limit}&offset=0`,
      token, true
    )
    const total = first.count || 0
    deepUrlCheck.progress.indexedTotal = total

    const remaining = new Set(urlMap.keys())

    const processSamples = (samples: any[]) => {
      for (const sample of samples) {
        const norm = normalizeUrl(sample.url || '')
        if (remaining.has(norm)) {
          knownData.set(norm, {
            status: sample.status,
            httpCode: sample.http_code,
            accessDate: sample.access_date,
          })
          remaining.delete(norm)
        }
      }
    }

    processSamples(first.samples || [])
    offset = limit
    deepUrlCheck.progress.indexedChecked = Math.min(offset, total)
    deepUrlCheck.progress.foundKnown = knownData.size

    while (offset < total && remaining.size > 0 && deepUrlCheck.status === 'running') {
      const data = await yandexFetch(
        `/user/${userId}/hosts/${encodeURIComponent(hostId)}/indexing/samples?limit=${limit}&offset=${offset}`,
        token, true
      )
      const samples = data.samples || []
      if (samples.length === 0) break
      processSamples(samples)
      offset += samples.length
      deepUrlCheck.progress.indexedChecked = Math.min(offset, total)
      deepUrlCheck.progress.foundKnown = knownData.size
      await new Promise(r => setTimeout(r, 50))
    }
  }

  // Phase 2: scan search-urls/in-search/samples (URLs currently in search)
  const scanSearch = async () => {
    let offset = 0
    const first = await yandexFetch(
      `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/samples?limit=${limit}&offset=0`,
      token, true
    )
    const total = first.count || 0
    deepUrlCheck.progress.searchTotal = total

    const remaining = new Set(urlMap.keys())

    const processSamples = (samples: any[]) => {
      for (const sample of samples) {
        const norm = normalizeUrl(sample.url || '')
        if (remaining.has(norm)) {
          inSearchSet.add(norm)
          remaining.delete(norm)
        }
      }
    }

    processSamples(first.samples || [])
    offset = limit
    deepUrlCheck.progress.searchChecked = Math.min(offset, total)
    deepUrlCheck.progress.foundInSearch = inSearchSet.size

    while (offset < total && remaining.size > 0 && deepUrlCheck.status === 'running') {
      const data = await yandexFetch(
        `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/samples?limit=${limit}&offset=${offset}`,
        token, true
      )
      const samples = data.samples || []
      if (samples.length === 0) break
      processSamples(samples)
      offset += samples.length
      deepUrlCheck.progress.searchChecked = Math.min(offset, total)
      deepUrlCheck.progress.foundInSearch = inSearchSet.size
      await new Promise(r => setTimeout(r, 50))
    }
  }

  try {
    // Run phases in parallel for speed
    await Promise.all([scanIndexing(), scanSearch()])

    if ((deepUrlCheck.status as string) === 'cancelled') {
      console.log('[DeepUrlCheck] Cancelled')
      return
    }

    // Build result list preserving input order
    deepUrlCheck.results = urls.map(u => {
      const norm = normalizeUrl(u)
      const known = knownData.get(norm)
      return {
        url: u,
        known: !!known,
        inSearch: inSearchSet.has(norm),
        status: known?.status,
        httpCode: known?.httpCode,
        accessDate: known?.accessDate,
      }
    })
    deepUrlCheck.status = 'done'
    console.log(`[DeepUrlCheck] Done. Known: ${knownData.size}, InSearch: ${inSearchSet.size}, Total: ${urls.length}`)
  } catch (err: any) {
    console.error('[DeepUrlCheck] Error:', err.message)
    deepUrlCheck.status = 'error'
    deepUrlCheck.error = err.message
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'check_url'

  // ─── Actions that don't need Yandex token ───

  // Load and parse a sitemap XML
  if (action === 'load_sitemap') {
    const sitemapUrl = searchParams.get('url')
    if (!sitemapUrl) return NextResponse.json({ error: 'Sitemap URL parameter required' }, { status: 400 })
    try {
      const res = await fetch(sitemapUrl, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())
      return NextResponse.json({ urls, count: urls.length })
    } catch (err: any) {
      return NextResponse.json({ error: 'Ошибка загрузки sitemap', details: err.message }, { status: 500 })
    }
  }

  // Poll sitemap check progress
  if (action === 'sitemap_check_status') {
    return NextResponse.json({
      status: sitemapCheck.status,
      progress: sitemapCheck.progress,
      sitemapUrlCount: sitemapCheck.sitemapUrls.length,
      indexed: sitemapCheck.indexed,
      notIndexed: sitemapCheck.notIndexed,
      error: sitemapCheck.error,
      elapsed: sitemapCheck.startedAt ? Math.round((Date.now() - sitemapCheck.startedAt) / 1000) : 0,
    })
  }

  // Poll deep URL check progress
  if (action === 'deep_url_check_status') {
    return NextResponse.json({
      status: deepUrlCheck.status,
      progress: deepUrlCheck.progress,
      inputUrlCount: deepUrlCheck.inputUrls.length,
      results: deepUrlCheck.results,
      error: deepUrlCheck.error,
      elapsed: deepUrlCheck.startedAt ? Math.round((Date.now() - deepUrlCheck.startedAt) / 1000) : 0,
    })
  }

  // ─── Actions that need Yandex token ───

  const token = getToken()
  if (!token) return NextResponse.json({ error: 'Yandex authentication required', needAuth: true }, { status: 401 })

  try {
    const userData = await yandexFetch('/user/', token)
    const userId = userData.user_id

    // Action: list all hosts
    if (action === 'hosts') {
      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      return NextResponse.json({
        hosts: (hostsData.hosts || []).map((h: any) => ({
          host_id: h.host_id,
          url: h.ascii_host_url,
          verified: h.verified,
        }))
      })
    }

    // Determine site — either from param or auto-detect from page URL
    const site = searchParams.get('site') || extractSite(searchParams.get('page') || '')
    if (!site) return NextResponse.json({ error: 'Site parameter required' }, { status: 400 })

    const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
    const host = findHost(hostsData.hosts || [], site)
    if (!host) {
      return NextResponse.json({
        error: 'Сайт не найден в Яндекс Вебмастер',
        available_hosts: (hostsData.hosts || []).map((h: any) => h.ascii_host_url)
      }, { status: 404 })
    }

    const hostId = encodeURIComponent(host.host_id)

    // Action: site summary
    if (action === 'summary') {
      const summary = await yandexFetch(`/user/${userId}/hosts/${hostId}/summary/`, token)
      return NextResponse.json({ site: host.ascii_host_url, summary })
    }

    // Action: check URL via important-urls monitoring
    if (action === 'check_url') {
      const pageUrl = searchParams.get('page')
      if (!pageUrl) return NextResponse.json({ error: 'Page URL required' }, { status: 400 })

      // Get important URLs — they have search_status.searchable
      const importantData = await yandexFetch(`/user/${userId}/hosts/${hostId}/important-urls`, token)
      const importantUrls = importantData.urls || []

      const normalizedPage = decodeURIComponent(pageUrl).replace(/\/$/, '')

      // Find this URL in important URLs
      const found = importantUrls.find((u: any) => {
        const url = decodeURIComponent(u.url || '').replace(/\/$/, '')
        const targetUrl = u.search_status?.target_url
          ? decodeURIComponent(u.search_status.target_url).replace(/\/$/, '')
          : ''
        return url === normalizedPage || targetUrl === normalizedPage
      })

      if (found) {
        const searchable = found.search_status?.searchable ?? false
        const excludedStatus = found.search_status?.excluded_url_status
        const httpCode = found.indexing_status?.http_code
        const indexingStatus = found.indexing_status?.status
        const title = found.search_status?.title
        const targetUrl = found.search_status?.target_url

        return NextResponse.json({
          url: pageUrl,
          isIndexed: searchable,
          indexingStatus,
          httpCode,
          title: title || null,
          targetUrl: targetUrl || null,
          excludedReason: excludedStatus !== 'NOTHING_FOUND' ? excludedStatus : null,
          lastAccess: found.search_status?.last_access || found.indexing_status?.access_date,
          source: 'important-urls',
        })
      }

      // URL not in important monitoring — return list of all monitored URLs
      return NextResponse.json({
        url: pageUrl,
        isIndexed: null,
        notMonitored: true,
        message: 'URL не найден в мониторинге важных страниц. Добавьте его в Яндекс Вебмастер: Индексирование → Мониторинг важных страниц.',
        monitoredUrls: importantUrls.map((u: any) => ({
          url: u.url,
          searchable: u.search_status?.searchable ?? false,
          httpCode: u.indexing_status?.http_code,
          status: u.indexing_status?.status,
          title: u.search_status?.title || null,
          targetUrl: u.search_status?.target_url || null,
          excludedReason: u.search_status?.excluded_url_status !== 'NOTHING_FOUND'
            ? u.search_status?.excluded_url_status : null,
          lastAccess: u.search_status?.last_access || u.indexing_status?.access_date,
        })),
        site: host.ascii_host_url,
      })
    }

    // Action: get all important URLs with statuses
    if (action === 'important_urls') {
      const importantData = await yandexFetch(`/user/${userId}/hosts/${hostId}/important-urls`, token)
      const importantUrls = importantData.urls || []

      return NextResponse.json({
        urls: importantUrls.map((u: any) => ({
          url: u.url,
          searchable: u.search_status?.searchable ?? false,
          httpCode: u.indexing_status?.http_code,
          status: u.indexing_status?.status,
          title: u.search_status?.title || null,
          targetUrl: u.search_status?.target_url || null,
          excludedReason: u.search_status?.excluded_url_status !== 'NOTHING_FOUND'
            ? u.search_status?.excluded_url_status : null,
          lastAccess: u.search_status?.last_access || u.indexing_status?.access_date,
        })),
        total: importantUrls.length,
        site: host.ascii_host_url,
      })
    }

    // Action: get indexed URLs sample (paginated, for browsing)
    if (action === 'indexed_urls') {
      const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100)
      const offset = parseInt(searchParams.get('offset') || '0', 10)

      const data = await yandexFetch(
        `/user/${userId}/hosts/${hostId}/indexing/samples?limit=${limit}&offset=${offset}`,
        token
      )

      return NextResponse.json({
        urls: (data.samples || []).map((s: any) => ({
          url: s.url,
          status: s.status,
          http_code: s.http_code,
          access_date: s.access_date,
        })),
        total: data.count ?? 0,
        offset,
        limit,
        site: host.ascii_host_url,
      })
    }

    // Action: get recrawl quota
    if (action === 'recrawl_quota') {
      const quota = await yandexFetch(`/user/${userId}/hosts/${hostId}/recrawl/quota`, token)
      return NextResponse.json({
        daily_quota: quota.daily_quota,
        quota_remainder: quota.quota_remainder,
      })
    }

    // Action: get recrawl tasks list
    if (action === 'recrawl_list') {
      const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
      const offset = parseInt(searchParams.get('offset') || '0', 10)
      const data = await yandexFetch(
        `/user/${userId}/hosts/${hostId}/recrawl/queue?limit=${limit}&offset=${offset}`,
        token
      )
      return NextResponse.json({
        tasks: (data.tasks || []).map((t: any) => ({
          task_id: t.task_id,
          url: t.url,
          added_time: t.added_time,
          state: t.state,
        })),
      })
    }

    return NextResponse.json({ error: 'Unknown action. Use: hosts, summary, check_url, important_urls, indexed_urls, load_sitemap, sitemap_check_status, recrawl_quota, recrawl_list' }, { status: 400 })
  } catch (error: any) {
    console.error('[Yandex] API error:', error)
    return NextResponse.json({ error: 'Ошибка Yandex Webmaster API', details: error.message }, { status: 500 })
  }
}

// ─── POST handler: sitemap check, recrawl ───

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = getToken()
  if (!token) return NextResponse.json({ error: 'Yandex authentication required', needAuth: true }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action

  try {
    const userData = await yandexFetch('/user/', token)
    const userId = userData.user_id

    // ─── Start sitemap indexing check ───
    if (action === 'start_sitemap_check') {
      if (sitemapCheck.status === 'running') {
        return NextResponse.json({ error: 'Проверка уже запущена. Отмените или дождитесь завершения.' }, { status: 409 })
      }

      const sitemapUrl = body.sitemapUrl
      if (!sitemapUrl) return NextResponse.json({ error: 'sitemapUrl required' }, { status: 400 })

      // Parse sitemap
      const sitemapRes = await fetch(sitemapUrl, { cache: 'no-store' })
      if (!sitemapRes.ok) return NextResponse.json({ error: `Ошибка загрузки sitemap: HTTP ${sitemapRes.status}` }, { status: 500 })
      const xml = await sitemapRes.text()
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())

      if (urls.length === 0) return NextResponse.json({ error: 'Sitemap пуст — не найдено URL' }, { status: 400 })

      // Find host
      const site = body.site || 'https://gdeotel.ru/'
      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      const host = findHost(hostsData.hosts || [], site)
      if (!host) return NextResponse.json({ error: 'Сайт не найден в Яндекс Вебмастер' }, { status: 404 })

      // Initialize state and start background check
      sitemapCheck = {
        status: 'running',
        sitemapUrls: urls,
        indexed: [],
        notIndexed: [],
        progress: { checked: 0, total: 0, found: 0 },
        error: '',
        startedAt: Date.now(),
      }

      // Fire-and-forget background task
      runSitemapCheck(token, userId, host.host_id, urls).catch(err => {
        console.error('[SitemapCheck] Unhandled error:', err)
        sitemapCheck.status = 'error'
        sitemapCheck.error = err.message
      })

      return NextResponse.json({ status: 'started', urlCount: urls.length })
    }

    // ─── Cancel running check ───
    if (action === 'cancel_check') {
      if (sitemapCheck.status === 'running') {
        sitemapCheck.status = 'cancelled'
        return NextResponse.json({ status: 'cancelled' })
      }
      return NextResponse.json({ status: sitemapCheck.status })
    }

    // ─── Reset check state ───
    if (action === 'reset_check') {
      sitemapCheck = {
        status: 'idle',
        sitemapUrls: [],
        indexed: [],
        notIndexed: [],
        progress: { checked: 0, total: 0, found: 0 },
        error: '',
        startedAt: 0,
      }
      return NextResponse.json({ status: 'idle' })
    }

    // ─── Start deep URL check (against /indexing/samples + /search-urls/in-search/samples) ───
    if (action === 'start_deep_url_check') {
      if (deepUrlCheck.status === 'running') {
        return NextResponse.json({ error: 'Полная проверка уже запущена. Дождитесь завершения или отмените её.' }, { status: 409 })
      }

      const urls = (body.urls as string[]) || []
      if (urls.length === 0) return NextResponse.json({ error: 'urls required' }, { status: 400 })

      const site = body.site || extractSite(urls[0])
      if (!site) return NextResponse.json({ error: 'Не удалось определить сайт из URL' }, { status: 400 })

      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      const host = findHost(hostsData.hosts || [], site)
      if (!host) {
        return NextResponse.json({
          error: 'Сайт не найден в Яндекс Вебмастер',
          available_hosts: (hostsData.hosts || []).map((h: any) => h.ascii_host_url),
        }, { status: 404 })
      }

      deepUrlCheck = {
        status: 'running',
        inputUrls: urls,
        results: [],
        progress: { indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0 },
        error: '',
        startedAt: Date.now(),
      }

      runDeepUrlCheck(token, userId, host.host_id, urls).catch(err => {
        console.error('[DeepUrlCheck] Unhandled error:', err)
        deepUrlCheck.status = 'error'
        deepUrlCheck.error = err.message
      })

      return NextResponse.json({ status: 'started', urlCount: urls.length, site: host.ascii_host_url })
    }

    // ─── Cancel running deep URL check ───
    if (action === 'cancel_deep_url_check') {
      if (deepUrlCheck.status === 'running') {
        deepUrlCheck.status = 'cancelled'
        return NextResponse.json({ status: 'cancelled' })
      }
      return NextResponse.json({ status: deepUrlCheck.status })
    }

    // ─── Reset deep URL check state ───
    if (action === 'reset_deep_url_check') {
      deepUrlCheck = {
        status: 'idle',
        inputUrls: [],
        results: [],
        progress: { indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0 },
        error: '',
        startedAt: 0,
      }
      return NextResponse.json({ status: 'idle' })
    }

    // ─── Submit URL for recrawl ───
    if (action === 'recrawl') {
      const url = body.url
      if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

      const site = body.site || extractSite(url)
      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      const host = findHost(hostsData.hosts || [], site)
      if (!host) return NextResponse.json({ error: 'Сайт не найден в Яндекс Вебмастер' }, { status: 404 })

      const hostId = encodeURIComponent(host.host_id)
      const result = await yandexPost(`/user/${userId}/hosts/${hostId}/recrawl/queue`, token, { url })

      if (result.status === 202) {
        return NextResponse.json({
          success: true,
          task_id: result.data.task_id,
          quota_remainder: result.data.quota_remainder,
        })
      } else {
        return NextResponse.json({
          success: false,
          error: result.data.error_code || result.data.error_message || 'Ошибка отправки на переобход',
          details: result.data,
        }, { status: result.status })
      }
    }

    // ─── Batch check URLs against important-urls monitoring ───
    if (action === 'batch_check_urls') {
      const urls = (body.urls as string[]) || []
      if (urls.length === 0) return NextResponse.json({ error: 'URLs array required' }, { status: 400 })
      if (urls.length > 50) return NextResponse.json({ error: 'Максимум 50 URL за один запрос' }, { status: 400 })

      const site = body.site || extractSite(urls[0])
      if (!site) return NextResponse.json({ error: 'Не удалось определить сайт из URL' }, { status: 400 })

      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      const host = findHost(hostsData.hosts || [], site)
      if (!host) {
        return NextResponse.json({
          error: 'Сайт не найден в Яндекс Вебмастер',
          available_hosts: (hostsData.hosts || []).map((h: any) => h.ascii_host_url),
        }, { status: 404 })
      }

      const hostId = encodeURIComponent(host.host_id)
      const importantData = await yandexFetch(`/user/${userId}/hosts/${hostId}/important-urls`, token)
      const importantUrls = importantData.urls || []

      const importantMap = new Map<string, any>()
      for (const u of importantUrls) {
        const url = decodeURIComponent(u.url || '').replace(/\/$/, '')
        if (url) importantMap.set(url, u)
        if (u.search_status?.target_url) {
          const t = decodeURIComponent(u.search_status.target_url).replace(/\/$/, '')
          if (t) importantMap.set(t, u)
        }
      }

      const results = urls.map(pageUrl => {
        let norm = pageUrl
        try { norm = decodeURIComponent(pageUrl) } catch {}
        norm = norm.replace(/\/$/, '')
        const found = importantMap.get(norm)
        if (!found) {
          return { url: pageUrl, isIndexed: null as boolean | null, notMonitored: true }
        }
        return {
          url: pageUrl,
          isIndexed: found.search_status?.searchable ?? false,
          notMonitored: false,
          indexingStatus: found.indexing_status?.status,
          httpCode: found.indexing_status?.http_code,
          title: found.search_status?.title || null,
          targetUrl: found.search_status?.target_url || null,
          excludedReason: found.search_status?.excluded_url_status &&
            found.search_status.excluded_url_status !== 'NOTHING_FOUND'
              ? found.search_status.excluded_url_status : null,
          lastAccess: found.search_status?.last_access || found.indexing_status?.access_date || null,
        }
      })

      return NextResponse.json({
        results,
        site: host.ascii_host_url,
        indexedCount: results.filter(r => r.isIndexed === true).length,
        notIndexedCount: results.filter(r => r.isIndexed === false).length,
        notMonitoredCount: results.filter(r => r.notMonitored).length,
        monitoredTotal: importantUrls.length,
      })
    }

    // ─── Batch recrawl: submit multiple URLs ───
    if (action === 'batch_recrawl') {
      const urls = body.urls as string[]
      if (!urls?.length) return NextResponse.json({ error: 'URLs array required' }, { status: 400 })

      const site = body.site || extractSite(urls[0])
      const hostsData = await yandexFetch(`/user/${userId}/hosts/`, token)
      const host = findHost(hostsData.hosts || [], site)
      if (!host) return NextResponse.json({ error: 'Сайт не найден в Яндекс Вебмастер' }, { status: 404 })

      const hostId = encodeURIComponent(host.host_id)
      const results: { url: string; success: boolean; task_id?: string; error?: string; quota_remainder?: number }[] = []

      for (const url of urls) {
        try {
          const result = await yandexPost(`/user/${userId}/hosts/${hostId}/recrawl/queue`, token, { url })
          if (result.status === 202) {
            results.push({ url, success: true, task_id: result.data.task_id, quota_remainder: result.data.quota_remainder })
          } else if (result.status === 429) {
            results.push({ url, success: false, error: 'QUOTA_EXCEEDED' })
            // Stop batch — quota exhausted
            for (const remaining of urls.slice(urls.indexOf(url) + 1)) {
              results.push({ url: remaining, success: false, error: 'QUOTA_EXCEEDED' })
            }
            break
          } else {
            results.push({ url, success: false, error: result.data.error_code || 'ERROR' })
          }
          // Small delay between requests
          await new Promise(r => setTimeout(r, 200))
        } catch (err: any) {
          results.push({ url, success: false, error: err.message })
        }
      }

      return NextResponse.json({
        results,
        submitted: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      })
    }

    return NextResponse.json({ error: 'Unknown POST action. Use: start_sitemap_check, cancel_check, reset_check, recrawl, batch_recrawl, batch_check_urls, start_deep_url_check, cancel_deep_url_check, reset_deep_url_check' }, { status: 400 })
  } catch (error: any) {
    console.error('[Yandex] POST error:', error)
    return NextResponse.json({ error: 'Ошибка Yandex Webmaster API', details: error.message }, { status: 500 })
  }
}
