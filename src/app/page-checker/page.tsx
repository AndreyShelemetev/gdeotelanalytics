'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type SiteId = 'gdeotel' | 'hotelin'
type PageType = 'country' | 'region' | 'city' | 'hotel'

interface CheckItem { id: string; title: string; status: 'pass'|'warn'|'fail'|'skip'; message?: string; details?: any }
interface CheckGroup { id: string; title: string; items: CheckItem[] }
interface PageReport {
  url: string; finalUrl: string; httpCode: number; elapsedMs: number; error?: string
  groups: CheckGroup[]
  summary: { total: number; pass: number; warn: number; fail: number; overall: 'pass'|'warn'|'fail'|'skip' }
}

const SITES: { id: SiteId; label: string }[] = [
  { id: 'gdeotel', label: 'GdeOtel.ru' },
  { id: 'hotelin', label: 'Hotelin.com' },
]
const PAGE_TYPES: { id: PageType; label: string }[] = [
  { id: 'country', label: 'Страна' },
  { id: 'region', label: 'Регион' },
  { id: 'city', label: 'Город' },
  { id: 'hotel', label: 'Карточка отеля' },
]

function badge(s: 'pass'|'warn'|'fail'|'skip') {
  const cls = s === 'pass' ? 'bg-green-100 text-green-700'
    : s === 'warn' ? 'bg-yellow-100 text-yellow-700'
    : s === 'fail' ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500'
  const label = s === 'pass' ? 'OK' : s === 'warn' ? 'WARN' : s === 'fail' ? 'FAIL' : 'SKIP'
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{label}</span>
}

function safeDecode(u: string): string {
  try { return decodeURIComponent(u) } catch { return u }
}

function httpBadge(code: number) {
  let cls = 'bg-gray-100 text-gray-500'
  if (code >= 500 || code === 0) cls = 'bg-red-100 text-red-700'
  else if (code >= 400) cls = 'bg-orange-100 text-orange-700'
  else if (code >= 300) cls = 'bg-yellow-100 text-yellow-700'
  else if (code >= 200) cls = 'bg-green-100 text-green-700'
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>HTTP {code || 'ERR'}</span>
}

export default function PageCheckerPage() {
  const [site, setSite] = useState<SiteId>('gdeotel')
  const [pageType, setPageType] = useState<PageType>('country')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [sitemapEdited, setSitemapEdited] = useState(false)
  const [mode, setMode] = useState<'all' | 'random'>('random')
  const [randomCount, setRandomCount] = useState(10)

  const [status, setStatus] = useState<'idle'|'running'|'done'|'error'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [reports, setReports] = useState<PageReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'summary'|'access'|'seo'|'content'|'canonical'|'urls'>('summary')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all'|'fail'|'warn'|'pass'>('all')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Подставляем дефолтный sitemap при смене site/pageType, если пользователь не менял вручную
  useEffect(() => {
    if (sitemapEdited) return
    fetch(`/api/page-checker?action=defaults&site=${site}&pageType=${pageType}`)
      .then(r => r.json())
      .then(d => d?.sitemapUrl && setSitemapUrl(d.sitemapUrl))
      .catch(() => {})
  }, [site, pageType, sitemapEdited])

  const refreshStatus = async () => {
    try {
      const r = await fetch('/api/page-checker?action=status', { cache: 'no-store' })
      const d = await r.json()
      if (d.status === 'idle') return
      setStatus(d.status)
      setProgress(d.progress || { done: 0, total: 0 })
      setReports(d.reports || [])
      if (d.error) setError(d.error)
      if (d.status !== 'running' && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    } catch {}
  }

  useEffect(() => { refreshStatus() }, [])
  useEffect(() => {
    if (status === 'running' && !pollRef.current) {
      pollRef.current = setInterval(refreshStatus, 1500)
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [status])

  const start = async () => {
    setError(null); setReports([]); setProgress({ done: 0, total: 0 })
    const r = await fetch('/api/page-checker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', site, pageType, sitemapUrl, mode, randomCount }),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Ошибка'); return }
    setStatus('running')
    setProgress({ done: 0, total: d.total })
    if (!pollRef.current) pollRef.current = setInterval(refreshStatus, 1500)
  }

  const stop = async () => {
    await fetch('/api/page-checker', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    })
    refreshStatus()
  }

  const aggregate = useMemo(() => {
    const totals = { pass: 0, warn: 0, fail: 0 }
    const byStatus: Record<'pass'|'warn'|'fail', number> = { pass: 0, warn: 0, fail: 0 }
    const httpBuckets: Record<string, number> = {}
    const checkStats: Record<string, { title: string; pass: number; warn: number; fail: number }> = {}
    for (const r of reports) {
      totals.pass += r.summary.pass; totals.warn += r.summary.warn; totals.fail += r.summary.fail
      byStatus[r.summary.overall === 'skip' ? 'pass' : r.summary.overall]++
      const key = r.httpCode === 0 ? 'ERR' : `${Math.floor(r.httpCode/100)}xx`
      httpBuckets[key] = (httpBuckets[key] || 0) + 1
      for (const g of r.groups) for (const it of g.items) {
        const k = `${g.id}:${it.id}`
        if (!checkStats[k]) checkStats[k] = { title: `[${g.title}] ${it.title}`, pass: 0, warn: 0, fail: 0 }
        if (it.status === 'pass') checkStats[k].pass++
        else if (it.status === 'warn') checkStats[k].warn++
        else if (it.status === 'fail') checkStats[k].fail++
      }
    }
    return { totals, byStatus, httpBuckets, checkStats }
  }, [reports])

  const filteredReports = useMemo(() => {
    if (filter === 'all') return reports
    return reports.filter(r => r.summary.overall === filter)
  }, [reports, filter])

  function renderGroup(r: PageReport, groupId: string) {
    const g = r.groups.find(x => x.id === groupId)
    if (!g) return <div className="text-xs text-gray-400">Группа не заполнена</div>
    return (
      <div className="space-y-1">
        {g.items.map(it => (
          <div key={it.id} className="flex items-start gap-2 text-sm">
            <div className="shrink-0 pt-0.5">{badge(it.status)}</div>
            <div className="flex-1">
              <div className="text-gray-800">{it.title}</div>
              {it.message && <div className="text-xs text-gray-500">{it.message}</div>}
              {it.details && (
                <details className="text-xs text-gray-500 mt-0.5">
                  <summary className="cursor-pointer select-none">детали</summary>
                  <pre className="whitespace-pre-wrap break-all bg-gray-50 p-2 rounded mt-1">{JSON.stringify(it.details, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Проверка страниц</h1>
        <nav className="flex gap-2 text-sm">
          <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Dashboard</Link>
          <Link href="/matching" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Matching</Link>
          <Link href="/single-source" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Single Source</Link>
          <Link href="/webmaster" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Webmaster</Link>
          <Link href="/page-checker" className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 font-medium">Page Checker</Link>
        </nav>
      </header>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Конфигурация */}
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Параметры проверки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Сайт</label>
              <div className="flex gap-2">
                {SITES.map(s => (
                  <button key={s.id} onClick={() => { setSite(s.id); setSitemapEdited(false) }}
                    className={`px-3 py-1.5 rounded border text-sm ${site === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Тип страницы</label>
              <div className="flex flex-wrap gap-2">
                {PAGE_TYPES.map(p => (
                  <button key={p.id} onClick={() => { setPageType(p.id); setSitemapEdited(false) }}
                    className={`px-3 py-1.5 rounded border text-sm ${pageType === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Sitemap URL</label>
            <input
              value={sitemapUrl}
              onChange={(e) => { setSitemapUrl(e.target.value); setSitemapEdited(true) }}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono"
            />
            <div className="text-xs text-gray-400 mt-1">Дефолт подставляется по типу страницы. Можно редактировать.</div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Режим</label>
              <div className="flex gap-2">
                <button onClick={() => setMode('all')}
                  className={`px-3 py-1.5 rounded border text-sm ${mode === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300'}`}>Весь sitemap</button>
                <button onClick={() => setMode('random')}
                  className={`px-3 py-1.5 rounded border text-sm ${mode === 'random' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300'}`}>Случайная выборка</button>
              </div>
            </div>
            {mode === 'random' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Количество</label>
                <input type="number" min={1} max={1000} value={randomCount}
                  onChange={e => setRandomCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-28 border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              {status === 'running' ? (
                <button onClick={stop} className="px-4 py-1.5 bg-red-600 text-white rounded text-sm">Остановить</button>
              ) : (
                <button onClick={start} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Запустить проверку</button>
              )}
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

          {(status === 'running' || progress.total > 0) && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Прогресс: {progress.done} / {progress.total}</span>
                <span>{status}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }} />
              </div>
            </div>
          )}
        </div>

        {/* Отчёт */}
        {reports.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="border-b border-gray-200 px-4">
              <nav className="flex gap-2 -mb-px overflow-x-auto">
                {[
                  { id: 'summary', label: '📊 Сводка' },
                  { id: 'access', label: '🌐 Доступность' },
                  { id: 'seo', label: '🔎 SEO' },
                  { id: 'content', label: '🧱 Контент' },
                  { id: 'canonical', label: '🔗 Canonical' },
                  { id: 'urls', label: '📄 URL-отчёт' },
                ].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id as any)}
                    className={`py-3 px-3 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="p-5">
              {tab === 'summary' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded p-4"><div className="text-xs text-gray-500">Всего страниц</div><div className="text-2xl font-bold">{reports.length}</div></div>
                    <div className="bg-green-50 rounded p-4"><div className="text-xs text-green-700">PASS</div><div className="text-2xl font-bold text-green-700">{aggregate.byStatus.pass}</div></div>
                    <div className="bg-yellow-50 rounded p-4"><div className="text-xs text-yellow-700">WARN</div><div className="text-2xl font-bold text-yellow-700">{aggregate.byStatus.warn}</div></div>
                    <div className="bg-red-50 rounded p-4"><div className="text-xs text-red-700">FAIL</div><div className="text-2xl font-bold text-red-700">{aggregate.byStatus.fail}</div></div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">HTTP-коды</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aggregate.httpBuckets).map(([k, v]) => (
                        <span key={k} className="text-sm px-3 py-1 rounded border border-gray-200 bg-gray-50">{k}: <b>{v}</b></span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Статистика по проверкам</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                          <tr><th className="text-left px-3 py-2">Проверка</th><th className="px-3 py-2">PASS</th><th className="px-3 py-2">WARN</th><th className="px-3 py-2">FAIL</th></tr>
                        </thead>
                        <tbody>
                          {Object.values(aggregate.checkStats).map((s, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-3 py-1.5">{s.title}</td>
                              <td className="px-3 py-1.5 text-center text-green-700">{s.pass}</td>
                              <td className="px-3 py-1.5 text-center text-yellow-700">{s.warn}</td>
                              <td className="px-3 py-1.5 text-center text-red-700">{s.fail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab !== 'summary' && tab !== 'urls' && (
                <div className="space-y-2">
                  <div className="flex gap-2 mb-3">
                    {(['all','fail','warn','pass'] as const).map(f => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={`text-xs px-2.5 py-1 rounded border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300'}`}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {filteredReports.map((r, i) => (
                    <div key={i} className="border border-gray-200 rounded">
                      <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                        {badge(r.summary.overall)}
                        {httpBadge(r.httpCode)}
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate flex-1" title={r.url}>
                          {safeDecode(r.url)}
                        </a>
                        <span className="text-xs text-gray-400">{r.elapsedMs}ms</span>
                        <button onClick={() => setExpanded(expanded === r.url ? null : r.url)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded border border-gray-200">
                          {expanded === r.url ? 'Скрыть' : 'Детали'}
                        </button>
                      </div>
                      {expanded === r.url && (
                        <div className="border-t border-gray-100 p-3 bg-gray-50">
                          {renderGroup(r, tab)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'urls' && (
                <div className="space-y-2">
                  <div className="flex gap-2 mb-3">
                    {(['all','fail','warn','pass'] as const).map(f => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={`text-xs px-2.5 py-1 rounded border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300'}`}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {filteredReports.map((r, i) => (
                    <details key={i} className="border border-gray-200 rounded" open={false}>
                      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        {badge(r.summary.overall)}
                        {httpBadge(r.httpCode)}
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-blue-600 hover:underline truncate flex-1" title={r.url}>
                          {safeDecode(r.url)}
                        </a>
                        <span className="text-xs text-gray-500">P:{r.summary.pass} W:{r.summary.warn} F:{r.summary.fail}</span>
                      </summary>
                      <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-4">
                        {r.groups.map(g => (
                          <div key={g.id}>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{g.title}</div>
                            {renderGroup(r, g.id)}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
