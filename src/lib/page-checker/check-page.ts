import { PageType, SiteId } from './defaults'
import { fetchPage } from './fetcher'
import { extractPage, ExtractedPage } from './extract'
import { checksCountrySEO, CheckGroup, CheckItem, CheckStatus } from './checks-seo'
import { checksContent, checksCanonical } from './checks-content'
import { extractCountryFromUrl } from './prepositional'

export interface PageReport {
  url: string
  finalUrl: string
  httpCode: number
  elapsedMs: number
  error?: string
  extracted?: ExtractedPage
  groups: CheckGroup[]
  summary: {
    total: number
    pass: number
    warn: number
    fail: number
    overall: CheckStatus
  }
}

function summarize(groups: CheckGroup[]): PageReport['summary'] {
  let pass = 0, warn = 0, fail = 0
  for (const g of groups) for (const it of g.items) {
    if (it.status === 'pass') pass++
    else if (it.status === 'warn') warn++
    else if (it.status === 'fail') fail++
  }
  const overall: CheckStatus = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass'
  return { total: pass + warn + fail, pass, warn, fail, overall }
}

export async function checkPage(url: string, site: SiteId, pageType: PageType): Promise<PageReport> {
  const fetched = await fetchPage(url)

  // 1) Группа доступности
  const accessItems: CheckItem[] = [{
    id: 'http-status',
    title: 'HTTP статус 200',
    status: fetched.httpCode === 200 ? 'pass' : fetched.httpCode >= 500 ? 'fail' : fetched.httpCode >= 400 ? 'fail' : fetched.httpCode === 0 ? 'fail' : 'warn',
    message: fetched.error || `HTTP ${fetched.httpCode}`,
    details: { finalUrl: fetched.finalUrl, redirected: fetched.redirected, elapsedMs: fetched.elapsedMs },
  }]
  const accessGroup: CheckGroup = { id: 'access', title: 'Доступность', items: accessItems }

  // Если нет HTML — дальше не идём
  if (!fetched.ok || !fetched.html) {
    const groups = [accessGroup]
    return {
      url, finalUrl: fetched.finalUrl, httpCode: fetched.httpCode,
      elapsedMs: fetched.elapsedMs, error: fetched.error,
      groups, summary: summarize(groups),
    }
  }

  const extracted = extractPage(fetched.html)
  const groups: CheckGroup[] = [accessGroup]

  // SEO — сейчас заполняем полностью для country, для остальных — ограниченный набор
  if (pageType === 'country') {
    const countryName = extractCountryFromUrl(url)
    groups.push(checksCountrySEO(site, extracted, countryName))
  } else {
    // Базовые проверки для остальных типов (пока MVP: наличие title/description/h1/длины)
    const items: CheckItem[] = [
      { id: 'title-present', title: 'Title присутствует', status: extracted.title ? 'pass' : 'fail', details: { title: extracted.title } },
      { id: 'desc-present', title: 'Description присутствует', status: extracted.description ? 'pass' : 'fail', details: { description: extracted.description } },
      { id: 'h1-present', title: 'H1 присутствует', status: extracted.h1 ? 'pass' : 'fail', details: { h1: extracted.h1 } },
      { id: 'desc-not-equal-title', title: 'Description ≠ title', status: extracted.title && extracted.description && extracted.title.trim() === extracted.description.trim() ? 'fail' : 'pass' },
    ]
    groups.push({ id: 'seo', title: `SEO (MVP для типа: ${pageType})`, items })
  }

  groups.push(checksContent(site, extracted))
  groups.push(checksCanonical(extracted, fetched.finalUrl || url))

  return {
    url,
    finalUrl: fetched.finalUrl,
    httpCode: fetched.httpCode,
    elapsedMs: fetched.elapsedMs,
    extracted,
    groups,
    summary: summarize(groups),
  }
}
