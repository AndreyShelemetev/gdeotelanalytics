'use client'

import { useState, useEffect } from 'react'

interface HotelRow {
  hotel_id: number
  hotel_name: string
  premises_type: string
  score: number | null
  review_count: number | null
  url_gdeotel: string
  url_ostrovok: string
  url_yandex: string
}

interface PremisesTypeOption {
  premises_type: string
  count: number
}

interface Props {
  cityId?: string
  cityName?: string
}

const HEADERS = ['hotel_id', 'hotel_name', 'premises_type', 'score', 'review_count', 'url_gdeotel', 'url_ostrovok', 'url_yandex'] as const

function formatNullableNumber(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

function buildTSV(rows: HotelRow[]): string {
  const lines = [HEADERS.join('\t')]
  for (const r of rows) {
    lines.push([
      r.hotel_id,
      String(r.hotel_name).replace(/[\t\r\n]+/g, ' '),
      r.premises_type,
      formatNullableNumber(r.score),
      formatNullableNumber(r.review_count),
      r.url_gdeotel,
      r.url_ostrovok,
      r.url_yandex,
    ].join('\t'))
  }
  return lines.join('\n')
}

export function HotelsExport({ cityId, cityName }: Props) {
  const [rows, setRows] = useState<HotelRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [types, setTypes] = useState<PremisesTypeOption[]>([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [scoreGt, setScoreGt] = useState('')
  const [reviewCountGt, setReviewCountGt] = useState('')

  useEffect(() => {
    if (!cityId) { setTypes([]); setSelectedTypes(new Set()); setRows(null); return }
    let cancelled = false
    setTypesLoading(true)
    fetch(`/api/hotels/premises-types?city_id=${cityId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: PremisesTypeOption[]) => {
        if (cancelled) return
        setTypes(data || [])
        setSelectedTypes(new Set((data || []).map((d) => d.premises_type)))
        setRows(null)
      })
      .catch(() => !cancelled && setTypes([]))
      .finally(() => !cancelled && setTypesLoading(false))
    return () => { cancelled = true }
  }, [cityId])

  const toggleType = (t: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
    setRows(null)
  }
  const selectAll = () => {
    setSelectedTypes(new Set(types.map((t) => t.premises_type)))
    setRows(null)
  }
  const clearAll = () => {
    setSelectedTypes(new Set())
    setRows(null)
  }

  const fetchData = async () => {
    if (!cityId) return
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      if (types.length > 0 && selectedTypes.size === 0) {
        setRows([])
        setLoading(false)
        return
      }
      const params = new URLSearchParams({ city_id: cityId })
      if (selectedTypes.size > 0 && selectedTypes.size < types.length) {
        params.set('premises_types', Array.from(selectedTypes).join(','))
      }
      if (scoreGt.trim()) params.set('score_gt', scoreGt.trim())
      if (reviewCountGt.trim()) params.set('review_count_gt', reviewCountGt.trim())
      const res = await fetch(`/api/stats/hotels-export?${params}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setRows(json.hotels || [])
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки')
      setRows(null)
    } finally {
      setLoading(false)
    }
  }

  const copyTSV = async () => {
    if (!rows) return
    try {
      await navigator.clipboard.writeText(buildTSV(rows))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Не удалось скопировать в буфер')
    }
  }

  const downloadCSV = () => {
    if (!rows) return
    const escape = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [
      HEADERS.join(','),
      ...rows.map((r) => [
        escape(r.hotel_id),
        escape(r.hotel_name),
        escape(r.premises_type),
        escape(formatNullableNumber(r.score)),
        escape(formatNullableNumber(r.review_count)),
        escape(r.url_gdeotel),
        escape(r.url_ostrovok),
        escape(r.url_yandex),
      ].join(',')),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const safeCity = (cityName || `city-${cityId}`).replace(/[^\w\-]+/g, '_')
    a.download = `hotels-${safeCity}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!cityId) {
    return (
      <div className="bg-white border rounded-lg p-4 mt-6">
        <h3 className="text-base font-semibold mb-1">Экспорт активных отелей города</h3>
        <p className="text-sm text-gray-500">Выберите город, чтобы экспортировать список отелей.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-lg p-4 mt-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Экспорт активных отелей города</h3>
          <p className="text-xs text-gray-500">
            Активные на gdeotel (is_active_ru=1) отели выбранного города. URL: gdeotel, ostrovok, yandex.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading || typesLoading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : rows ? 'Обновить' : 'Сформировать таблицу'}
          </button>
          {rows && rows.length > 0 && (
            <>
              <button
                onClick={copyTSV}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                title="Копировать TSV (Ctrl/Cmd+V в Google Sheets)"
              >
                {copied ? '✓ Скопировано' : 'Копировать TSV'}
              </button>
              <button
                onClick={downloadCSV}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
              >
                Скачать CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-3 border rounded p-3 bg-gray-50">
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          Фильтры качества
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span className="whitespace-nowrap">score &gt;</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={scoreGt}
              onChange={(e) => {
                setScoreGt(e.target.value)
                setRows(null)
              }}
              placeholder="7"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span className="whitespace-nowrap">review_count &gt;</span>
            <input
              type="number"
              min="0"
              step="1"
              value={reviewCountGt}
              onChange={(e) => {
                setReviewCountGt(e.target.value)
                setRows(null)
              }}
              placeholder="3"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="mb-3 border rounded p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <label className="text-xs font-semibold text-gray-700">
            Типы объектов
            {types.length > 0 && (
              <span className="text-gray-400 font-normal"> · выбрано {selectedTypes.size} из {types.length}</span>
            )}
          </label>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-blue-600 hover:underline disabled:opacity-40" disabled={typesLoading || types.length === 0}>Все</button>
            <span className="text-gray-300">|</span>
            <button onClick={clearAll} className="text-blue-600 hover:underline disabled:opacity-40" disabled={typesLoading || types.length === 0}>Сбросить</button>
          </div>
        </div>
        {typesLoading ? (
          <p className="text-xs text-gray-400">Загрузка типов...</p>
        ) : types.length === 0 ? (
          <p className="text-xs text-gray-400">Нет данных по этому городу.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {types.map((t) => {
              const checked = selectedTypes.has(t.premises_type)
              return (
                <label
                  key={t.premises_type || '__empty__'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs cursor-pointer transition-colors ${
                    checked ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(t.premises_type)}
                    className="accent-blue-600"
                  />
                  <span className="font-mono">{t.premises_type || '(пусто)'}</span>
                  <span className="text-gray-400">×{t.count.toLocaleString()}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {rows && (
        <>
          <p className="text-xs text-gray-500 mb-2">
            Найдено: <strong>{rows.length}</strong>. Скопируйте TSV и вставьте в Google Sheets — колонки разложатся автоматически.
          </p>
          {rows.length > 0 && (
            <div className="overflow-auto border rounded max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    {HEADERS.map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.hotel_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-500">{r.hotel_id}</td>
                      <td className="px-3 py-1.5 font-medium">{r.hotel_name}</td>
                      <td className="px-3 py-1.5 text-gray-600 font-mono">{r.premises_type}</td>
                      <td className="px-3 py-1.5 text-gray-600">{formatNullableNumber(r.score)}</td>
                      <td className="px-3 py-1.5 text-gray-600">{formatNullableNumber(r.review_count)}</td>
                      <td className="px-3 py-1.5 text-blue-600 truncate max-w-[260px]">
                        {r.url_gdeotel && <a href={r.url_gdeotel} target="_blank" rel="noreferrer" className="hover:underline">{r.url_gdeotel}</a>}
                      </td>
                      <td className="px-3 py-1.5 text-blue-600 truncate max-w-[260px]">
                        {r.url_ostrovok && <a href={r.url_ostrovok} target="_blank" rel="noreferrer" className="hover:underline">{r.url_ostrovok}</a>}
                      </td>
                      <td className="px-3 py-1.5 text-blue-600 truncate max-w-[260px]">
                        {r.url_yandex && <a href={r.url_yandex} target="_blank" rel="noreferrer" className="hover:underline">{r.url_yandex}</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
