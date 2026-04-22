export interface FetchedPage {
  url: string
  finalUrl: string
  httpCode: number
  ok: boolean
  html: string
  error?: string
  elapsedMs: number
  redirected: boolean
}

export async function fetchPage(url: string, timeoutMs = 25000): Promise<FetchedPage> {
  const started = Date.now()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GdeOtel-PageChecker/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.8',
      },
      cache: 'no-store',
    })
    const html = await res.text()
    return {
      url,
      finalUrl: res.url || url,
      httpCode: res.status,
      ok: res.ok,
      html,
      elapsedMs: Date.now() - started,
      redirected: !!res.url && res.url !== url,
    }
  } catch (e: any) {
    return {
      url,
      finalUrl: url,
      httpCode: 0,
      ok: false,
      html: '',
      error: e?.message || 'fetch error',
      elapsedMs: Date.now() - started,
      redirected: false,
    }
  } finally {
    clearTimeout(t)
  }
}
