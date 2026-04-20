'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ProjectSelector } from '@/components/ProjectSelector'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { ProjectId } from '@/lib/constants'

interface MatchResult {
  id: number
  name: string
  premises_type: string
  providers: string
  provider_count: number
}

export default function MatchingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [project, setProject] = useState<ProjectId>('hotelin')
  const [query, setQuery] = useState('')
  const [hotelId, setHotelId] = useState('')
  const [searchType, setSearchType] = useState<'name' | 'id'>('name')
  const [results, setResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const handleSearch = async () => {
    if (searchType === 'name' && query.trim().length < 2) return
    if (searchType === 'id' && hotelId.trim().length < 1) return
    
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams({ project })
      
      if (searchType === 'name') {
        params.set('q', query.trim())
        const res = await fetch(`/api/stats/search?${params}`)
        if (res.ok) setResults(await res.json())
      } else {
        params.set('id', hotelId.trim())
        const res = await fetch(`/api/stats/search?${params}`)
        if (res.ok) {
          const data = await res.json()
          setResults(Array.isArray(data) ? data : [data])
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') return <LoadingSpinner fullScreen />

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Hotel Analytics</h1>
        <div className="flex items-center gap-3">
          <nav className="flex gap-2 text-sm mr-4">
            <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Dashboard</Link>
            <Link href="/matching" className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 font-medium">Matching</Link>
            <Link href="/single-source" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Single Source</Link>
            <Link href="/webmaster" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Webmaster</Link>
          </nav>
          <ProjectSelector value={project} onChange={setProject} />
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
        </div>
      </header>

      <div className="p-6 max-w-7xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">Provider Matching Search</h2>
        <p className="text-sm text-gray-500 mb-4">Search for a hotel by name or ID to see which providers have matching entries.</p>

        {/* Search Type Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setSearchType('name')
              setResults([])
              setSearched(false)
            }}
            className={`px-4 py-2 rounded text-sm font-medium ${
              searchType === 'name'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Search by Name
          </button>
          <button
            onClick={() => {
              setSearchType('id')
              setResults([])
              setSearched(false)
            }}
            className={`px-4 py-2 rounded text-sm font-medium ${
              searchType === 'id'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Search by ID
          </button>
        </div>

        {/* Search Input */}
        <div className="flex gap-2 mb-6">
          {searchType === 'name' ? (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter hotel name (min 2 characters)..."
                className="border rounded px-3 py-2 text-sm flex-1 max-w-md"
                disabled={loading}
              />
              <button
                onClick={handleSearch}
                disabled={loading || query.trim().length < 2}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter hotel ID (e.g. 5887737)..."
                className="border rounded px-3 py-2 text-sm flex-1 max-w-md"
                disabled={loading}
              />
              <button
                onClick={handleSearch}
                disabled={loading || hotelId.trim().length < 1}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </>
          )}
        </div>

        {loading ? (
          <LoadingSpinner label="Searching hotels..." />
        ) : searched && results.length === 0 ? (
          <p className="text-gray-400 text-sm">No results found.</p>
        ) : results.length > 0 ? (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">ID</th>
                  <th className="text-left px-4 py-2 font-medium">Hotel Name</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Providers</th>
                  <th className="text-right px-4 py-2 font-medium"># Sources</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{r.id}</td>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-gray-600">{r.premises_type}</td>
                    <td className="px-4 py-2">
                      {r.providers ? r.providers.split(',').map((p) => (
                        <span key={p} className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded mr-1">
                          {p}
                        </span>
                      )) : <span className="text-gray-400">none</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{r.provider_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length >= 100 && (
              <p className="text-xs text-gray-400 px-4 py-2">Showing first 100 results. Refine your search for more specific matches.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
