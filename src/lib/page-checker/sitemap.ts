// Лёгкий парсер XML sitemap/sitemapindex без внешних зависимостей.

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'GdeOtel-PageChecker/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

function extractTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim())
  }
  return out
}

function extractLocs(xml: string): string[] {
  return extractTags(xml, 'loc').map(s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim())
}

export interface SitemapParseResult {
  urls: string[]
  sitemaps: string[]      // если это sitemapindex — список вложенных sitemap
  totalFound: number
}

/**
 * Парсит sitemap. Если это sitemapindex — возвращает список вложенных sitemap.
 * flatten=true раскрывает все вложенные sitemap рекурсивно (до maxChildren вложенных).
 */
export async function parseSitemap(url: string, flatten = true, maxChildren = 50): Promise<SitemapParseResult> {
  const xml = await fetchText(url)
  const isIndex = /<sitemapindex[\s>]/i.test(xml)

  if (isIndex) {
    const sitemaps = extractLocs(xml)
    if (!flatten) return { urls: [], sitemaps, totalFound: 0 }
    const urls: string[] = []
    const children = sitemaps.slice(0, maxChildren)
    for (const sm of children) {
      try {
        const child = await parseSitemap(sm, false)
        urls.push(...child.urls)
      } catch {
        // ignore
      }
    }
    return { urls, sitemaps, totalFound: urls.length }
  }

  const urls = extractLocs(xml)
  return { urls, sitemaps: [], totalFound: urls.length }
}

export function sampleRandom<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr]
  const copy = [...arr]
  // Fisher-Yates partial
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}
