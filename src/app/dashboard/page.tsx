'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ProjectSelector } from '@/components/ProjectSelector'
import { FilterPanel } from '@/components/FilterPanel'
import { KPICards } from '@/components/KPICards'
import { Charts } from '@/components/Charts'
import { BreakdownChart } from '@/components/BreakdownChart'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { db } from '@/lib/db'
import type { ProjectId } from '@/lib/constants'

interface Filters {
  project: ProjectId
  countryId?: string
  regionId?: string
  cityId?: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [filters, setFilters] = useState<Filters>({ project: 'hotelin' })
  const [stats, setStats] = useState<any>(null)
  const [frequency, setFrequency] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchStats = useCallback(async (force = false) => {
    setLoading(true)
    const params = new URLSearchParams({ project: filters.project })
    if (filters.countryId) params.set('country_id', filters.countryId)
    if (filters.regionId) params.set('region_id', filters.regionId)
    if (filters.cityId) params.set('city_id', filters.cityId)
    const key = `${filters.project}-${filters.countryId || ''}-${filters.regionId || ''}-${filters.cityId || ''}`

    // Check cache for summary
    if (!force) {
      const cachedSummary = await db.statsSummary.where('id').equals(key).first()
      if (cachedSummary && Date.now() - cachedSummary.timestamp < 3600000) {
        setStats(cachedSummary.data)
      } else {
        force = true
      }
    }
    if (force) {
      try {
        const statsRes = await fetch(`/api/stats/summary?${params}`)
        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data)
          await db.statsSummary.put({ id: key, data, timestamp: Date.now() })
        }
      } catch (e) {
        console.error('Failed to fetch stats summary', e)
      }
    }

    // Check cache for frequency
    if (!force) {
      const cachedFreq = await db.statsFrequency.where('id').equals(key).first()
      if (cachedFreq && Date.now() - cachedFreq.timestamp < 3600000) {
        setFrequency(cachedFreq.data)
      } else {
        force = true
      }
    }
    if (force) {
      try {
        const freqRes = await fetch(`/api/stats/frequency?${params}&limit=15`)
        if (freqRes.ok) {
          const data = await freqRes.json()
          setFrequency(data)
          await db.statsFrequency.put({ id: key, data, timestamp: Date.now() })
        }
      } catch (e) {
        console.error('Failed to fetch stats frequency', e)
      }
    }

    setLoading(false)
  }, [filters])

  const handleLoadData = () => {
    setLoaded(true)
    fetchStats()
  }

  useEffect(() => {
    if (loaded) fetchStats()
  }, [filters, loaded, fetchStats])

  if (status === 'loading') {
    return <LoadingSpinner fullScreen />
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Hotel Analytics</h1>
        <div className="flex items-center gap-3">
          <nav className="flex gap-2 text-sm mr-4">
            <Link href="/dashboard" className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 font-medium">Dashboard</Link>
            <Link href="/matching" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Matching</Link>
            <Link href="/single-source" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Single Source</Link>
            <Link href="/webmaster" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Webmaster</Link>
            <Link href="/page-checker" className="px-3 py-1.5 rounded hover:bg-gray-100 text-gray-600">Page Checker</Link>
          </nav>
          <ProjectSelector
            value={filters.project}
            onChange={(project) => {
              setLoaded(false)
              setStats(null)
              setFrequency([])
              setFilters({ project })
            }}
            disabled={loading}
          />
          <button
            onClick={handleLoadData}
            disabled={loading || loaded}
            className="px-4 py-1.5 bg-blue-500 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Загрузка...' : loaded ? 'Данные загружены' : 'Загрузить данные'}
          </button>
          {loaded && (
            <button
              onClick={() => fetchStats(true)}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm disabled:opacity-50 transition-colors"
              title="Обновить данные"
            >
              ↻ Обновить
            </button>
          )}
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
          <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-gray-600">Logout</button>
        </div>
      </header>

      {/* Content */}
      <div className="p-6 max-w-7xl mx-auto">
        <FilterPanel
          project={filters.project}
          countryId={filters.countryId}
          regionId={filters.regionId}
          cityId={filters.cityId}
          onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
          disabled={loading}
          loadData={loaded}
          onRefresh={() => fetchStats(true)}
        />

        {loading ? (
          <LoadingSpinner label="Loading analytics data..." />
        ) : stats ? (
          <>
            <KPICards summary={stats.summary} />
            
            {/* Breakdown Charts */}
            <div className="grid grid-cols-1 gap-6 mt-6">
              {/* Countries breakdown - when no country selected */}
              {!filters.countryId && (
                <BreakdownChart
                  project={filters.project}
                  type="countries"
                  title="Отели по странам"
                  disabled={!loaded}
                />
              )}

              {/* Regions breakdown - when country selected but no region */}
              {filters.countryId && !filters.regionId && (
                <BreakdownChart
                  project={filters.project}
                  type="regions"
                  countryId={filters.countryId}
                  title="Отели по регионам"
                  disabled={!loaded}
                />
              )}

              {/* Cities breakdown - when country and region selected but no city */}
              {filters.countryId && filters.regionId && !filters.cityId && (
                <BreakdownChart
                  project={filters.project}
                  type="cities"
                  countryId={filters.countryId}
                  regionId={filters.regionId}
                  title="Отели по городам"
                  disabled={!loaded}
                />
              )}
            </div>

            <Charts
              typeBreakdown={stats.typeBreakdown}
              providerCoverage={stats.providerCoverage}
              providerCoverageApartments={stats.providerCoverageApartments}
              frequency={frequency}
              totalHotels={stats.summary?.total_hotels || 0}
              totalApartments={stats.summary?.total_apartments || 0}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
