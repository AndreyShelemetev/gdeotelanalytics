'use client'

import { useState, useEffect } from 'react'
import type { ProjectId } from '@/lib/constants'
import { db } from '@/lib/db'

interface Props {
  project: ProjectId
  countryId?: string
  regionId?: string
  cityId?: string
  onChange: (filters: { countryId?: string; regionId?: string; cityId?: string }) => void
  disabled?: boolean
  loadData?: boolean
}

const selectClass = "border rounded pl-3 pr-8 py-2 text-sm bg-white min-w-[200px] appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat disabled:opacity-50 disabled:cursor-not-allowed"
const searchClass = "border rounded px-3 py-2 text-sm bg-white min-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"

export function FilterPanel({ project, countryId, regionId, cityId, onChange, disabled, loadData = true }: Props) {
  const [countries, setCountries] = useState<any[]>([])
  const [regions, setRegions] = useState<any[]>([])
  const [cities, setCities] = useState<any[]>([])
  const [searchCountry, setSearchCountry] = useState('')
  const [searchRegion, setSearchRegion] = useState('')
  const [searchCity, setSearchCity] = useState('')

  // Filter and sort lists based on search
  const filteredCountries = countries
    .filter(c => {
      const name = project === 'gdeotel' ? (c.name_ru || c.name) : c.name
      return name.toLowerCase().includes(searchCountry.toLowerCase())
    })
    .sort((a, b) => {
      const nameA = project === 'gdeotel' ? (a.name_ru || a.name) : a.name
      const nameB = project === 'gdeotel' ? (b.name_ru || b.name) : b.name
      return nameA.localeCompare(nameB)
    })

  const filteredRegions = regions
    .filter(r => {
      const name = project === 'gdeotel' ? (r.name_ru || r.name) : r.name
      return name.toLowerCase().includes(searchRegion.toLowerCase())
    })
    .sort((a, b) => {
      const nameA = project === 'gdeotel' ? (a.name_ru || a.name) : a.name
      const nameB = project === 'gdeotel' ? (b.name_ru || b.name) : b.name
      return nameA.localeCompare(nameB)
    })

  const filteredCities = cities
    .filter(c => {
      const name = project === 'gdeotel' ? (c.name_ru || c.name) : c.name
      return name.toLowerCase().includes(searchCity.toLowerCase())
    })
    .sort((a, b) => {
      const nameA = project === 'gdeotel' ? (a.name_ru || a.name) : a.name
      const nameB = project === 'gdeotel' ? (b.name_ru || b.name) : b.name
      return nameA.localeCompare(nameB)
    })

  // Load countries when project changes
  useEffect(() => {
    if (!loadData) return;
    const loadCountries = async () => {
      // Try to load from cache first
      const cached = await db.countries.where('project').equals(project).toArray()
      if (cached.length > 0) {
        setCountries(cached)
        return
      }
      // Fetch from API
      try {
        const res = await fetch(`/api/countries?project=${project}`)
        const data = await res.json()
        setCountries(data)
        // Cache the data
        await db.countries.bulkPut(data.map((c: any) => ({ ...c, project })))
      } catch {
        setCountries([])
      }
    }
    loadCountries()
  }, [project, loadData])

  // Load regions when country changes
  useEffect(() => {
    if (!loadData || !countryId) { setRegions([]); return }
    const loadRegions = async () => {
      // Try cache
      const cached = await db.regions.where({ country_id: countryId, project }).toArray()
      if (cached.length > 0) {
        setRegions(cached)
        return
      }
      // Fetch
      try {
        const res = await fetch(`/api/regions?project=${project}&country_id=${countryId}`)
        const data = await res.json()
        setRegions(data)
        await db.regions.bulkPut(data.map((r: any) => ({ ...r, country_id: countryId, project })))
      } catch {
        setRegions([])
      }
    }
    loadRegions()
  }, [project, countryId, loadData])

  // Load cities when region changes
  useEffect(() => {
    if (!loadData || !regionId) { setCities([]); return }
    const loadCities = async () => {
      // Try cache
      const cached = await db.cities.where({ region_id: regionId, country_id: countryId, project }).toArray()
      if (cached.length > 0) {
        setCities(cached)
        return
      }
      // Fetch
      try {
        const res = await fetch(`/api/cities?project=${project}&country_id=${countryId}&region_id=${regionId}`)
        const data = await res.json()
        setCities(data)
        await db.cities.bulkPut(data.map((c: any) => ({ ...c, region_id: regionId, country_id: countryId, project })))
      } catch {
        setCities([])
      }
    }
    loadCities()
  }, [project, countryId, regionId, loadData])

  const handleCountryChange = (value: string) => {
    setSearchCountry('')
    onChange({
      countryId: value || undefined,
      regionId: undefined,
      cityId: undefined,
    })
  }

  const handleRegionChange = (value: string) => {
    setSearchRegion('')
    onChange({
      countryId,
      regionId: value || undefined,
      cityId: undefined,
    })
  }

  const handleCityChange = (value: string) => {
    setSearchCity('')
    onChange({
      countryId,
      regionId,
      cityId: value || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-wrap gap-4">
        {/* Country */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-600">Country</label>
          <input
            type="text"
            value={searchCountry}
            onChange={(e) => setSearchCountry(e.target.value)}
            placeholder="Search countries..."
            className={searchClass}
            disabled={disabled}
          />
          <select
            value={countryId || ''}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={selectClass}
            disabled={disabled}
            size={Math.min(filteredCountries.length + 1, 8)}
          >
            <option value="">All countries ({countries.length})</option>
            {filteredCountries.map((c: any) => (
              <option key={c.id} value={c.id}>
                {project === 'gdeotel' ? c.name_ru || c.name : c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Region */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-600">Region</label>
          <input
            type="text"
            value={searchRegion}
            onChange={(e) => setSearchRegion(e.target.value)}
            placeholder="Search regions..."
            className={searchClass}
            disabled={disabled || !countryId}
          />
          <select
            value={regionId || ''}
            onChange={(e) => handleRegionChange(e.target.value)}
            className={selectClass}
            disabled={disabled || !countryId}
            size={Math.min(filteredRegions.length + 1, 8)}
          >
            <option value="">All regions ({regions.length})</option>
            {filteredRegions.map((r: any) => (
              <option key={r.id} value={r.id}>
                {project === 'gdeotel' ? r.name_ru || r.name : r.name}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-600">City</label>
          <input
            type="text"
            value={searchCity}
            onChange={(e) => setSearchCity(e.target.value)}
            placeholder="Search cities..."
            className={searchClass}
            disabled={disabled || !regionId}
          />
          <select
            value={cityId || ''}
            onChange={(e) => handleCityChange(e.target.value)}
            className={selectClass}
            disabled={disabled || !regionId}
            size={Math.min(filteredCities.length + 1, 8)}
          >
            <option value="">All cities ({cities.length})</option>
            {filteredCities.map((c: any) => (
              <option key={c.id} value={c.id}>
                {project === 'gdeotel' ? c.name_ru || c.name : c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
