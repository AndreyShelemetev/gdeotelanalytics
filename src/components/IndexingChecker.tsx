'use client'

import { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface MonitoredUrl {
  url: string
  searchable: boolean
  httpCode?: number
  status?: string
  title?: string | null
  targetUrl?: string | null
  excludedReason?: string | null
  lastAccess?: string | null
}

export function IndexingChecker() {
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check URL
  const [pageUrl, setPageUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<any>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  // Hosts
  const [hosts, setHosts] = useState<any[]>([])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/webmaster/oauth?action=status')
      if (res.ok) {
        const data = await res.json()
        setAuthStatus(data)
      } else {
        setAuthStatus({ authenticated: false })
      }
    } catch {
      setAuthStatus({ authenticated: false })
    } finally {
      setLoading(false)
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

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (authStatus?.authenticated) loadHosts() }, [authStatus?.authenticated])

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
      else setError('URL авторизации не получен')
    } catch (err: any) {
      setError(err?.message || 'Ошибка соединения')
    }
  }

  const handleCheckPage = async () => {
    if (!pageUrl.trim()) { setCheckError('Введите URL страницы'); return }

    setChecking(true)
    setCheckError(null)
    setCheckResult(null)

    try {
      const params = new URLSearchParams({ action: 'check_url', page: pageUrl.trim() })
      const res = await fetch(`/api/webmaster/indexing?${params}`)

      if (res.status === 401) {
        const data = await res.json()
        if (data.needAuth) {
          setCheckError('Токен Яндекс истёк. Авторизуйтесь заново.')
          setAuthStatus({ authenticated: false })
          return
        }
        setCheckError('Требуется авторизация')
        return
      }

      if (!res.ok) {
        const err = await res.json()
        setCheckError(err.error || err.details || 'Ошибка при проверке')
        return
      }

      setCheckResult(await res.json())
    } catch (err: any) {
      setCheckError(err?.message || 'Ошибка соединения')
    } finally {
      setChecking(false)
    }
  }

  if (loading) return <LoadingSpinner />

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

      {/* Check URL Card */}
      {authStatus?.authenticated && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Проверка индексации страницы</h3>
          <p className="text-sm text-gray-500 mb-3">
            Проверяется по данным мониторинга важных страниц в Яндекс Вебмастер
          </p>

          <div className="flex gap-3">
            <input
              type="url"
              value={pageUrl}
              onChange={(e) => { setPageUrl(e.target.value); setCheckResult(null); setCheckError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCheckPage() }}
              placeholder="https://gdeotel.ru/отели/Россия/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleCheckPage}
              disabled={checking || !pageUrl.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {checking ? 'Проверка...' : 'Проверить'}
            </button>
          </div>

          {checkError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{checkError}</p>
            </div>
          )}

          {/* Result: found in important-urls */}
          {checkResult && checkResult.isIndexed !== null && !checkResult.notMonitored && (
            <div className={`mt-4 p-4 rounded-lg border ${
              checkResult.isIndexed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{checkResult.isIndexed ? '✅' : '⚠️'}</span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {checkResult.isIndexed ? 'Страница в индексе Яндекса' : 'Страница НЕ в индексе'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 break-all">{decodeURIComponent(checkResult.url)}</p>
                  {checkResult.title && <p className="text-sm text-gray-600 mt-1">Заголовок: {checkResult.title}</p>}
                  {checkResult.httpCode && <p className="text-xs text-gray-400 mt-1">HTTP: {checkResult.httpCode} ({checkResult.indexingStatus})</p>}
                  {checkResult.targetUrl && (
                    <p className="text-xs text-gray-400 mt-1">Целевой URL: <span className="break-all">{decodeURIComponent(checkResult.targetUrl)}</span></p>
                  )}
                  {checkResult.excludedReason && (
                    <p className="text-xs text-red-500 mt-1">Причина исключения: {checkResult.excludedReason}</p>
                  )}
                  {checkResult.lastAccess && (
                    <p className="text-xs text-gray-400 mt-1">Последний обход: {new Date(checkResult.lastAccess).toLocaleDateString('ru-RU')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Result: not in important-urls monitoring */}
          {checkResult && checkResult.notMonitored && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">ℹ️ URL не найден в мониторинге важных страниц</p>
                <p className="text-xs text-blue-600 mt-1">
                  Добавьте его в <a href="https://webmaster.yandex.ru" target="_blank" rel="noopener noreferrer" className="underline">Яндекс Вебмастер</a>:
                  Индексирование → Мониторинг важных страниц
                </p>
              </div>

              {/* Show monitored URLs */}
              {checkResult.monitoredUrls?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Отслеживаемые страницы ({checkResult.monitoredUrls.length}):
                  </p>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {checkResult.monitoredUrls.map((u: MonitoredUrl, i: number) => (
                      <div key={i} className={`p-3 rounded-md border text-sm ${
                        u.searchable ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span>{u.searchable ? '✅' : '❌'}</span>
                          <span className="break-all text-gray-800">{decodeURIComponent(u.url)}</span>
                        </div>
                        {u.title && <p className="text-xs text-gray-500 mt-1 ml-6">{u.title}</p>}
                        {u.excludedReason && <p className="text-xs text-red-500 mt-1 ml-6">Причина: {u.excludedReason}</p>}
                        {u.targetUrl && <p className="text-xs text-gray-400 mt-1 ml-6 break-all">→ {decodeURIComponent(u.targetUrl)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
