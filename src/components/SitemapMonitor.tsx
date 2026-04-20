'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface IndexedUrl {
  url: string
  sitemapUrl: string
  status?: string
  httpCode?: number
  accessDate?: string
}

interface RecrawlResult {
  url: string
  success: boolean
  task_id?: string
  error?: string
  quota_remainder?: number
}

export function SitemapMonitor() {
  const [sitemapUrl, setSitemapUrl] = useState('https://gdeotel.ru/cities-sitemap.xml')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check state
  const [checkStatus, setCheckStatus] = useState<string>('idle')
  const [progress, setProgress] = useState({ checked: 0, total: 0, found: 0 })
  const [sitemapUrlCount, setSitemapUrlCount] = useState(0)
  const [indexed, setIndexed] = useState<IndexedUrl[]>([])
  const [notIndexed, setNotIndexed] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Recrawl state
  const [recrawling, setRecrawling] = useState(false)
  const [recrawlResults, setRecrawlResults] = useState<RecrawlResult[] | null>(null)
  const [quota, setQuota] = useState<{ daily_quota: number; quota_remainder: number } | null>(null)

  // Filter state for not-indexed list
  const [filterText, setFilterText] = useState('')

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/webmaster/indexing?action=sitemap_check_status')
      if (!res.ok) return
      const data = await res.json()
      setCheckStatus(data.status)
      setProgress(data.progress || { checked: 0, total: 0, found: 0 })
      setSitemapUrlCount(data.sitemapUrlCount || 0)
      setIndexed(data.indexed || [])
      setNotIndexed(data.notIndexed || [])
      setElapsed(data.elapsed || 0)
      if (data.error) setError(data.error)

      if (data.status !== 'running') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch {}
  }, [])

  // Start polling when check is running
  useEffect(() => {
    if (checkStatus === 'running' && !pollRef.current) {
      pollRef.current = setInterval(pollStatus, 2000)
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [checkStatus, pollStatus])

  // Check initial state on mount
  useEffect(() => { pollStatus() }, [pollStatus])

  const startCheck = async () => {
    setLoading(true)
    setError(null)
    setRecrawlResults(null)
    try {
      const res = await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_sitemap_check', sitemapUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Ошибка'); return }
      setSitemapUrlCount(data.urlCount)
      setCheckStatus('running')
      setProgress({ checked: 0, total: 0, found: 0 })
      setIndexed([])
      setNotIndexed([])
      // Start polling
      pollRef.current = setInterval(pollStatus, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const cancelCheck = async () => {
    await fetch('/api/webmaster/indexing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_check' }),
    })
    setCheckStatus('cancelled')
  }

  const resetCheck = async () => {
    await fetch('/api/webmaster/indexing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_check' }),
    })
    setCheckStatus('idle')
    setProgress({ checked: 0, total: 0, found: 0 })
    setIndexed([])
    setNotIndexed([])
    setRecrawlResults(null)
    setError(null)
  }

  const loadQuota = async () => {
    try {
      const res = await fetch(`/api/webmaster/indexing?action=recrawl_quota&site=https://gdeotel.ru/`)
      if (res.ok) {
        const data = await res.json()
        setQuota(data)
      }
    } catch {}
  }

  const submitRecrawl = async (urls: string[]) => {
    setRecrawling(true)
    setRecrawlResults(null)
    try {
      const res = await fetch('/api/webmaster/indexing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch_recrawl', urls }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Ошибка отправки'); return }
      setRecrawlResults(data.results || [])
      // Refresh quota
      loadQuota()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRecrawling(false)
    }
  }

  const filteredNotIndexed = filterText
    ? notIndexed.filter(u => u.toLowerCase().includes(filterText.toLowerCase()))
    : notIndexed

  const isRunning = checkStatus === 'running'
  const isDone = checkStatus === 'done' || checkStatus === 'error' || checkStatus === 'cancelled'
  const progressPct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Start check card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Проверка индексации из Sitemap</h3>
        <p className="text-sm text-gray-500 mb-4">
          Загружает URL из sitemap и проверяет каждый на наличие в индексе Яндекса.
          Неиндексированные страницы можно отправить на принудительный переобход.
        </p>

        <div className="flex gap-3 mb-4">
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://gdeotel.ru/cities-sitemap.xml"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isRunning}
          />
          {!isRunning ? (
            <button
              onClick={startCheck}
              disabled={loading || !sitemapUrl.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors whitespace-nowrap"
            >
              {loading ? 'Запуск...' : 'Начать проверку'}
            </button>
          ) : (
            <button onClick={cancelCheck} className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors whitespace-nowrap">
              Отменить
            </button>
          )}
          {isDone && (
            <button onClick={resetCheck} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors whitespace-nowrap">
              Сбросить
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Progress bar */}
        {(isRunning || isDone) && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {isRunning ? 'Проверка...' : checkStatus === 'done' ? 'Завершено' : checkStatus === 'cancelled' ? 'Отменено' : 'Ошибка'}
                {' · '}URL из sitemap: {sitemapUrlCount}
              </span>
              <span>{progress.checked.toLocaleString()} / {progress.total.toLocaleString()} страниц проверено · {elapsed}с</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">✅ В индексе: {indexed.length}</span>
              {isDone && <span className="text-red-600 font-medium">❌ Не в индексе: {notIndexed.length}</span>}
              {isRunning && <span className="text-gray-500">⏳ Осталось найти: {sitemapUrlCount - indexed.length}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Results: indexed */}
      {isDone && indexed.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-green-700 mb-3">✅ Проиндексированные страницы ({indexed.length})</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {indexed.map((u, i) => (
              <div key={i} className="flex items-center gap-2 py-1 px-2 rounded text-sm hover:bg-green-50">
                <span className="text-green-500">●</span>
                <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-blue-600 break-all">
                  {decodeURIComponent(u.sitemapUrl)}
                </a>
                {u.httpCode && <span className="text-xs text-gray-400 ml-auto shrink-0">HTTP {u.httpCode}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results: not indexed */}
      {isDone && notIndexed.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-red-700">❌ Не проиндексированные ({notIndexed.length})</h3>
            <div className="flex gap-2">
              <button
                onClick={loadQuota}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200 transition-colors"
              >
                Проверить квоту
              </button>
              <button
                onClick={() => submitRecrawl(filteredNotIndexed.length > 0 ? filteredNotIndexed : notIndexed)}
                disabled={recrawling}
                className="px-4 py-1.5 bg-orange-600 text-white text-xs font-medium rounded hover:bg-orange-700 disabled:bg-gray-300 transition-colors"
              >
                {recrawling ? 'Отправка...' : `Отправить на переобход (${filteredNotIndexed.length || notIndexed.length})`}
              </button>
            </div>
          </div>

          {quota && (
            <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
              Квота на переобход: <strong>{quota.quota_remainder}</strong> из {quota.daily_quota} в день
            </div>
          )}

          {recrawlResults && (
            <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700 font-medium">
                Отправлено: {recrawlResults.filter(r => r.success).length} / {recrawlResults.length}
              </p>
              {recrawlResults.some(r => !r.success) && (
                <div className="mt-2 space-y-1">
                  {recrawlResults.filter(r => !r.success).map((r, i) => (
                    <p key={i} className="text-xs text-red-600 break-all">
                      {r.error === 'URL_ALREADY_ADDED' ? '⏭ Уже в очереди' : r.error === 'QUOTA_EXCEEDED' ? '⚠️ Квота исчерпана' : `❌ ${r.error}`}: {decodeURIComponent(r.url)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Фильтр по URL..."
            className="w-full mb-2 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredNotIndexed.map((url, i) => (
              <div key={i} className="flex items-center gap-2 py-1 px-2 rounded text-sm hover:bg-red-50">
                <span className="text-red-400">●</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-blue-600 break-all">
                  {decodeURIComponent(url)}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
