'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ProjectSelector } from '@/components/ProjectSelector'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { ProjectId } from '@/lib/constants'

interface SingleSourceRow {
  id: number
  name: string
  premises_type: string
  provider: string
}

export default function SingleSourcePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [project, setProject] = useState<ProjectId>('hotelin')
  const [data, setData] = useState<SingleSourceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ project, page: String(page), limit: '50' })
      if (providerFilter) params.set('provider', providerFilter)
      const res = await fetch(`/api/stats/single-source?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.data)
        setTotal(json.total)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [project, page, providerFilter])

  useEffect(() => {
    if (status === 'authenticated') fetchData()
  }, [status, fetchData])

  const totalPages = Math.ceil(total / 50)

  if (status === 'loading') return <LoadingSpinner fullScreen />

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Hotel Analytics</h1>
        <div className="flex items-center gap-3">
          <nav className="flex gap-2 text-sm mr-4">
            <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Dashboard</Link>
            <Link href="/matching" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Matching</Link>
            <Link href="/single-source" className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 font-medium">Single Source</Link>
            <Link href="/webmaster" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Webmaster</Link>
          </nav>
          <ProjectSelector
            value={project}
            onChange={(p) => { setProject(p); setPage(1) }}
          />
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
        </div>
      </header>

      <div className="p-6 max-w-7xl mx-auto">
        <h2 className="text-lg font-semibold mb-2">Hotels with Single Provider</h2>
        <p className="text-sm text-gray-500 mb-4">
          Objects that appear in only one provider source. Total: <strong>{total.toLocaleString()}</strong>
        </p>

        <div className="flex gap-2 mb-4">
          <select
            value={providerFilter}
            onChange={(e) => { setProviderFilter(e.target.value); setPage(1) }}
            className="border rounded px-3 py-1.5 text-sm bg-white appearance-none pr-8 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
          >
            <option value="">All providers</option>
            <option value="booking">Booking</option>
            <option value="ostrovok">Ostrovok</option>
            <option value="travelmyth">Travelmyth</option>
            <option value="yandex">Yandex</option>
          </select>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading..." />
        ) : data.length === 0 ? (
          <p className="text-gray-400 text-sm">No results.</p>
        ) : (
          <>
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">ID</th>
                    <th className="text-left px-4 py-2 font-medium">Hotel Name</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{r.id}</td>
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2 text-gray-600">{r.premises_type}</td>
                      <td className="px-4 py-2">
                        <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">
                          {r.provider}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-400">
                Page {page} of {totalPages.toLocaleString()} ({total.toLocaleString()} total)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
