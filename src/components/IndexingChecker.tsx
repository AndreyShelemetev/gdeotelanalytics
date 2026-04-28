'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { db, UrlCheckHistory, UrlCheckResult } from '@/lib/db'

const MAX_BATCH = 50

type Mode = 'single' | 'batch'
type CheckMode = 'fast' | 'deep'

interface RecrawlResult {
  url: string
  success: boolean
  task_id?: string
  error?: string
  quota_remainder?: number
}

interface DeepProgress {
  indexedChecked: number
  indexedTotal: number
  searchChecked: number
  searchTotal: number
  foundKnown: number
  foundInSearch: number
}

function parseUrls(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map(s => s.trim())
        .filter(Boolean)
    )
  )
}

function httpStatusBadge(code?: number) {
  if (!code) return null
  let bg = 'bg-gray-100 text-gray-500'
  if (code >= 500) bg = 'bg-red-100 text-red-700 font-medium'
  else if (code >= 400) bg = 'bg-orange-100 text-orange-700 font-medium'
  else if (code >= 300) bg = 'bg-yellow-100 text-yellow-700'
  else if (code >= 200) bg = 'bg-green-100 text-green-700'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${bg} ml-2 shrink-0`}>
      HTTP {code}
    </span>
  )
}

function statusBadge(r: UrlCheckResult) {
  if (r.notMonitored) {
    // In deep mode notMonitored = false; this only shows in fast mode for non-tracked URLs
    if (r.indexingStatus === 'KNOWN_NOT_IN_SEARCH') {
      return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Известна, не в поиске</span>
    }
    if (r.indexingStatus === 'NOT_KNOWN') {
      return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">Не известна Яндексу</span>
    }
    return <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">Не отслеживается</span>
  }
  if (r.isIndexed) {
    return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">В поиске</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Не в поиске</span>
}

export function IndexingChecker() {
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hosts, setHosts] = useState<any[]>([])

  // Input state
  const [mode, setMode] = useState<Mode>('single')
  const [checkMode, setCheckMode] = useState<CheckMode>('fast')
  const [singleUrl, setSingleUrl] = useState('')
  const [batchText, setBatchText] = useState('')

  // Check state
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState<UrlCheckResult[]>([])
  const [lastInputUrls, setLastInputUrls] = useState<string[]>([])

  // Deep check state
  const [deepStatus, setDeepStatus] = useState<string>('idle')
  const [deepProgress, setDeepProgress] = useState<DeepProgress>({
    indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0,
  })
  const [deepElapsed, setDeepElapsed] = useState(0)
  const deepPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Recrawl state
  const [recrawling, setRecrawling] = useState<string | 'batch' | null>(null)
  const [recrawlMap, setRecrawlMap] = useState<Record<string, RecrawlResult>>({})
  const [quota, setQuota] = useState<{ daily_quota: number; quota_remainder: number } | null>(null)

  // History state
  const [historyDates, setHistoryDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [historyRecords, setHistoryRecords] = useState<UrlCheckHistory[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null)

  const savedRef = useRef(false)

  // ─── Auth ───
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/webmaster/oauth?action=status')
      if (res.ok) setAuthStatus(await res.json())
      else setAuthStatus({ authenticated: false })
    } catch {
      setAuthStatus({ authenticated: false })
    } finally {
      setAuthLoading(false)
    }
  }

  const loadHosts = async () => {
    try {
      const res = await fetch('/api/webmaster/indexing?action=hosts')
      if (res.ok) {
        const data = await res.json()
        setHosts(data.hosts || [])
      }
    } catch {}
  }

  const loadQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/webmaster/indexing?action=recrawl_quota&site=https://gdeotel.ru/')
      if (res.ok) setQuota(await res.json())
    } catch {}
  }, [])

  useEffect(() => { checkAuth() }, [])
  useEffect(() => {
    if (authStatus?.authenticated) {
      loadHosts()
      loadQuota()
    }
  }, [authStatus?.authenticated, loadQuota])

  const handleAuthorize = async () => {
    setError(null)
    try {
      const res = await fetch('/api/webmaster/oauth?action=auth_url')
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Ошибка')
        return
      }
      const data = await res.json()
      if (data?.auth_url) window.location.href = data.auth_url
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения')
    }
  }

  // ─── History ───
  const loadHistoryDates = useCallback(async () => {
    try {
      const all = await db.urlCheckHistory.orderBy('timestamp').reverse().toArray()
      const dates = [...new Set(all.map(r => r.date))]
      setHistoryDates(dates)
    } catch {}
  }, [])

  useEffect(() => { loadHistoryDates() }, [loadHistoryDates])

  useEffect(() => {
    if (!selectedDate) { setHistoryRecords([]); return }
    db.urlCheckHistory.where('date').equals(selectedDate).reverse().sortBy('timestamp')
      .then(r => setHistoryRecords(r))
      .catch(() => setHistoryRecords([]))
  }, [selectedDate])

  // ─── Check action ───
  const handleCheck = async () => {
    setError(null)
    setRecrawlMap({})
    savedRef.current = false

    let urls: string[] = []
    if (mode === 'single') {
      const u = singleUrl.trim()
      if (!u) { setError('Введите URL'); return }
      urls = [u]
    } else {
      urls = parseUrls(batchText)
      if (urls.length === 0) { setError('Введите хотя бы один URL'); return }
      if (checkMode === 'fast' && urls.length > MAX_BATCH) {
        setError(`Для быстрой проверки максимум ${MAX_BATCH} URL за раз. Сейчас: ${urls.length}`); return
      }
    }

    if (checkMode === 'deep') {
      await startDeepCheck(urls)
      return
    }

    setChecking(true)
    setResults([])
    setLastInputUrls(urls)

    try {
      const res = await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch_check_urls', urls }),
      })

      if (res.status === 401) {
        const data = await res.json()
        if (data.needAuth) {
          setError('Токен Яндекса истёк. Авторизуйтесь заново.')
          setAuthStatus({ authenticated: false })
          return
        }
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.details || 'Ошибка при проверке')
        return
      }

      const list: UrlCheckResult[] = data.results || []
      setResults(list)
      await saveHistory(urls, list, [])
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения')
    } finally {
      setChecking(false)
    }
  }

  // ─── Deep check polling ───
  const pollDeepStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/webmaster/indexing?action=deep_url_check_status')
      if (!res.ok) return
      const data = await res.json()
      setDeepStatus(data.status)
      setDeepProgress(data.progress || {
        indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0,
      })
      setDeepElapsed(data.elapsed || 0)
      if (data.error) setError(data.error)

      if (data.status === 'done' && Array.isArray(data.results) && data.results.length > 0) {
        // Map deep results into UrlCheckResult
        const list: UrlCheckResult[] = data.results.map((r: any) => ({
          url: r.url,
          isIndexed: r.inSearch === true ? true : r.inSearch === false ? false : null,
          notMonitored: !r.known && !r.inSearch,
          indexingStatus: r.inSearch
            ? 'IN_SEARCH'
            : r.known ? 'KNOWN_NOT_IN_SEARCH' : 'NOT_KNOWN',
          httpCode: r.httpCode,
          lastAccess: r.accessDate || null,
        }))
        setResults(list)
        if (!savedRef.current) {
          await saveHistory(lastInputUrls, list, [])
        }
      }

      if (data.status !== 'running') {
        if (deepPollRef.current) { clearInterval(deepPollRef.current); deepPollRef.current = null }
        setChecking(false)
      }
    } catch {}
  }, [lastInputUrls])

  const startDeepCheck = async (urls: string[]) => {
    setChecking(true)
    setResults([])
    setLastInputUrls(urls)
    setDeepProgress({ indexedChecked: 0, indexedTotal: 0, searchChecked: 0, searchTotal: 0, foundKnown: 0, foundInSearch: 0 })
    setDeepElapsed(0)
    try {
      const res = await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_deep_url_check', urls }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401 && data.needAuth) {
          setAuthStatus({ authenticated: false })
          setError('Токен Яндекса истёк. Авторизуйтесь заново.')
        } else {
          setError(data.error || 'Ошибка запуска полной проверки')
        }
        setChecking(false)
        return
      }
      setDeepStatus('running')
      if (deepPollRef.current) clearInterval(deepPollRef.current)
      deepPollRef.current = setInterval(pollDeepStatus, 2000)
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения')
      setChecking(false)
    }
  }

  const cancelDeepCheck = async () => {
    try {
      await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_deep_url_check' }),
      })
    } catch {}
    if (deepPollRef.current) { clearInterval(deepPollRef.current); deepPollRef.current = null }
    setDeepStatus('cancelled')
    setChecking(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (deepPollRef.current) clearInterval(deepPollRef.current) }
  }, [])

  // Pick up running deep check on mount (e.g., after page reload)
  useEffect(() => {
    pollDeepStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveHistory = async (
    inputUrls: string[],
    list: UrlCheckResult[],
    recrawled: RecrawlResult[],
  ) => {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const record: UrlCheckHistory = {
      date,
      timestamp: now.getTime(),
      mode: inputUrls.length > 1 ? 'batch' : 'single',
      inputUrls,
      results: list,
      recrawled: recrawled.map(r => ({
        url: r.url,
        success: r.success,
        task_id: r.task_id,
        error: r.error,
      })),
      indexedCount: list.filter(r => r.isIndexed === true).length,
      notIndexedCount: list.filter(r => r.isIndexed === false).length,
      notMonitoredCount: list.filter(r => r.notMonitored).length,
    }
    try {
      await db.urlCheckHistory.add(record)
      savedRef.current = true
      loadHistoryDates()
    } catch (err) {
      console.error('Failed to save url check history', err)
    }
  }

  // ─── Recrawl ───
  const submitRecrawl = async (urls: string[], key: string | 'batch') => {
    if (!urls.length) return
    setRecrawling(key)
    try {
      const res = await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch_recrawl', urls }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Ошибка отправки на переобход'); return }

      const list: RecrawlResult[] = data.results || []
      const map: Record<string, RecrawlResult> = { ...recrawlMap }
      list.forEach(r => { map[r.url] = r })
      setRecrawlMap(map)
      loadQuota()

      // Append recrawled to the latest saved record
      try {
        const latest = await db.urlCheckHistory.orderBy('timestamp').reverse().first()
        if (latest?.id) {
          const merged = [
            ...(latest.recrawled || []),
            ...list.map(r => ({ url: r.url, success: r.success, task_id: r.task_id, error: r.error })),
          ]
          await db.urlCheckHistory.update(latest.id, { recrawled: merged })
        }
      } catch {}
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения')
    } finally {
      setRecrawling(null)
    }
  }

  if (authLoading) return <LoadingSpinner />

  const recrawlable = results.filter(r => r.isIndexed === false || r.notMonitored).map(r => r.url)
  const indexedCount = results.filter(r => r.isIndexed === true).length
  const notIndexedCount = results.filter(r => r.isIndexed === false).length
  const notMonitoredCount = results.filter(r => r.notMonitored).length

  return (
    <div className="space-y-6">
      {/* Auth Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Подключение к Яндекс Вебмастер</h3>
            {authStatus?.authenticated
              ? <p className="text-sm text-green-600 mt-1">✓ Авторизовано</p>
              : <p className="text-sm text-gray-500 mt-1">Не авторизовано</p>}
          </div>
          <button onClick={handleAuthorize} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            authStatus?.authenticated
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}>
            {authStatus?.authenticated ? 'Переавторизоваться' : 'Авторизоваться в Яндексе'}
          </button>
        </div>
        {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-700">{error}</p></div>}
        {hosts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Доступные сайты</p>
            <div className="flex flex-wrap gap-2">
              {hosts.map((h) => (
                <span key={h.host_id} className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full ${
                  h.verified ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {h.verified && <span className="mr-1">✓</span>}{h.url}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Check Card */}
      {authStatus?.authenticated && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Проверка наличия страниц в поиске Яндекса</h3>
            {quota && (
              <span className="text-xs text-gray-500">
                Квота переобхода: <strong className="text-gray-700">{quota.quota_remainder}</strong> / {quota.daily_quota}
              </span>
            )}
          </div>

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setMode('single')}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                mode === 'single' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Одна страница
            </button>
            <button
              onClick={() => setMode('batch')}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                mode === 'batch' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Список{checkMode === 'fast' ? ` (до ${MAX_BATCH})` : ''}
            </button>
            <div className="ml-auto inline-flex rounded-md border border-gray-200 overflow-hidden">
              <button
                onClick={() => setCheckMode('fast')}
                disabled={deepStatus === 'running'}
                title="Только URL из «Мониторинга важных страниц». Быстро."
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  checkMode === 'fast' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                ⚡ Быстро
              </button>
              <button
                onClick={() => setCheckMode('deep')}
                disabled={deepStatus === 'running'}
                title="Сканирует индекс Яндекса целиком. Работает с любыми URL, занимает дольше."
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  checkMode === 'deep' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                🔬 Полная
              </button>
            </div>
          </div>

          {mode === 'single' ? (
            <div className="flex gap-3">
              <input
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCheck() }}
                placeholder="https://gdeotel.ru/..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCheck}
                disabled={checking || !singleUrl.trim()}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors whitespace-nowrap"
              >
                {checking ? 'Проверка...' : 'Проверить'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={`Каждый URL с новой строки (или через пробел/запятую). Максимум ${MAX_BATCH}.`}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Распознано URL: <strong className="text-gray-700">{parseUrls(batchText).length}</strong>
                  {checkMode === 'fast' && <> / {MAX_BATCH}</>}
                </span>
                <button
                  onClick={handleCheck}
                  disabled={checking || parseUrls(batchText).length === 0}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors whitespace-nowrap"
                >
                  {checking ? 'Проверка...' : 'Проверить пачку'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            {checkMode === 'fast'
              ? 'Быстрая проверка использует «Мониторинг важных страниц» Яндекс.Вебмастера. URL, которых там нет, помечаются «Не отслеживается» — их можно отправить на переобход.'
              : 'Полная проверка сканирует весь индекс Яндекса (/indexing/samples) и URL в поиске (/search-urls/in-search/samples). Работает с любыми URL и точно отвечает «в поиске или нет», но занимает дольше — зависит от размера сайта.'}
          </p>

          {/* Deep check progress */}
          {checkMode === 'deep' && (deepStatus === 'running' || deepStatus === 'done' || deepStatus === 'error' || deepStatus === 'cancelled') && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {deepStatus === 'running' ? 'Сканирование индекса...' : deepStatus === 'done' ? 'Завершено' : deepStatus === 'cancelled' ? 'Отменено' : 'Ошибка'}
                  {' · '}{deepElapsed}с
                </span>
                {deepStatus === 'running' && (
                  <button onClick={cancelDeepCheck} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                    Отменить
                  </button>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Известные роботу страницы</span>
                  <span>
                    {deepProgress.indexedChecked.toLocaleString()} / {deepProgress.indexedTotal.toLocaleString()}
                    {' · '}найдено: {deepProgress.foundKnown}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all" style={{
                    width: `${deepProgress.indexedTotal > 0 ? Math.round((deepProgress.indexedChecked / deepProgress.indexedTotal) * 100) : 0}%`,
                  }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Страницы в поиске</span>
                  <span>
                    {deepProgress.searchChecked.toLocaleString()} / {deepProgress.searchTotal.toLocaleString()}
                    {' · '}найдено: {deepProgress.foundInSearch}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{
                    width: `${deepProgress.searchTotal > 0 ? Math.round((deepProgress.searchChecked / deepProgress.searchTotal) * 100) : 0}%`,
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-green-50 text-green-700">В поиске: {indexedCount}</span>
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">Не в поиске: {notIndexedCount}</span>
                  {notMonitoredCount > 0 && (
                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">Не отслеживается: {notMonitoredCount}</span>
                  )}
                </div>
                {recrawlable.length > 0 && (
                  <button
                    onClick={() => submitRecrawl(recrawlable, 'batch')}
                    disabled={recrawling !== null}
                    className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded hover:bg-orange-700 disabled:bg-gray-300 transition-colors"
                  >
                    {recrawling === 'batch' ? 'Отправка...' : `Отправить на переобход (${recrawlable.length})`}
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">URL</th>
                      <th className="text-left px-3 py-2">Статус</th>
                      <th className="text-left px-3 py-2">HTTP</th>
                      <th className="text-left px-3 py-2">Последний обход</th>
                      <th className="text-right px-3 py-2">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const recrawl = recrawlMap[r.url]
                      const canRecrawl = r.isIndexed === false || r.notMonitored
                      return (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 align-top">
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-blue-600 break-all">
                              {decodeURIComponent(r.url)}
                            </a>
                            {r.title && <div className="text-xs text-gray-500 mt-0.5">{r.title}</div>}
                            {r.excludedReason && (
                              <div className="text-xs text-red-500 mt-0.5">Причина: {r.excludedReason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top whitespace-nowrap">{statusBadge(r)}</td>
                          <td className="px-3 py-2 align-top whitespace-nowrap text-gray-600">
                            {r.httpCode ? <>{httpStatusBadge(r.httpCode)}</> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-gray-500">
                            {r.lastAccess ? new Date(r.lastAccess).toLocaleDateString('ru-RU') : '—'}
                          </td>
                          <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                            {recrawl ? (
                              recrawl.success
                                ? <span className="text-xs text-green-600">✓ Отправлен</span>
                                : <span className="text-xs text-red-500">{recrawl.error || 'Ошибка'}</span>
                            ) : canRecrawl ? (
                              <button
                                onClick={() => submitRecrawl([r.url], r.url)}
                                disabled={recrawling !== null}
                                className="px-2.5 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                              >
                                {recrawling === r.url ? '...' : 'Переобход'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 История проверок URL</h3>

        {historyDates.length === 0 ? (
          <p className="text-sm text-gray-400">История пока пуста. Каждая проверка автоматически сохраняется по дате.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {historyDates.map(date => (
                <button
                  key={date}
                  onClick={() => { setSelectedDate(selectedDate === date ? '' : date); setExpandedHistoryId(null) }}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    selectedDate === date
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </button>
              ))}
            </div>

            {selectedDate && historyRecords.length > 0 && (
              <div className="space-y-3">
                {historyRecords.map(record => {
                  const isExpanded = expandedHistoryId === record.id
                  return (
                    <div key={record.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedHistoryId(isExpanded ? null : (record.id ?? null))}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm text-gray-500">
                            {new Date(record.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {record.mode === 'batch' ? `Пачка (${record.inputUrls.length})` : 'Одна'}
                          </span>
                          <span className="text-sm text-gray-700 break-all max-w-md">
                            {record.inputUrls[0]}
                            {record.inputUrls.length > 1 && <span className="text-gray-400"> и ещё {record.inputUrls.length - 1}</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <span className="text-xs px-2 py-1 rounded bg-green-50 text-green-700">✅ {record.indexedCount}</span>
                          <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700">❌ {record.notIndexedCount}</span>
                          {record.notMonitoredCount > 0 && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">? {record.notMonitoredCount}</span>
                          )}
                          {record.recrawled?.length > 0 && (
                            <span className="text-xs px-2 py-1 rounded bg-orange-50 text-orange-700">🔄 {record.recrawled.filter(r => r.success).length}/{record.recrawled.length}</span>
                          )}
                          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4 space-y-3">
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                  <th className="text-left px-3 py-2">URL</th>
                                  <th className="text-left px-3 py-2">Статус</th>
                                  <th className="text-left px-3 py-2">HTTP</th>
                                  <th className="text-left px-3 py-2">Обход</th>
                                </tr>
                              </thead>
                              <tbody>
                                {record.results.map((r, i) => (
                                  <tr key={i} className="border-t border-gray-100">
                                    <td className="px-3 py-1.5 align-top">
                                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:text-blue-600 break-all">
                                        {decodeURIComponent(r.url)}
                                      </a>
                                    </td>
                                    <td className="px-3 py-1.5 align-top whitespace-nowrap">{statusBadge(r)}</td>
                                    <td className="px-3 py-1.5 align-top whitespace-nowrap">
                                      {r.httpCode ? httpStatusBadge(r.httpCode) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-1.5 align-top whitespace-nowrap text-xs text-gray-500">
                                      {r.lastAccess ? new Date(r.lastAccess).toLocaleDateString('ru-RU') : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {record.recrawled?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Переобход</p>
                              <div className="space-y-1 max-h-60 overflow-y-auto">
                                {record.recrawled.map((r, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    <span className={r.success ? 'text-green-500' : 'text-red-400'}>
                                      {r.success ? '✓' : '✕'}
                                    </span>
                                    <span className="break-all text-gray-700">{decodeURIComponent(r.url)}</span>
                                    {r.error && <span className="text-xs text-red-500 ml-auto shrink-0">{r.error}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {selectedDate && historyRecords.length === 0 && (
              <p className="text-sm text-gray-400">Нет записей за выбранную дату.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
