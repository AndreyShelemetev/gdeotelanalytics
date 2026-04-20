'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ProjectId } from '@/lib/constants'
import { LoadingSpinner } from './LoadingSpinner'

interface BreakdownData {
  id: string
  name: string
  hotel_count: number
}

interface Props {
  project: ProjectId
  type: 'countries' | 'regions' | 'cities'
  countryId?: string
  regionId?: string
  title: string
  disabled?: boolean
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export function BreakdownChart({ project, type, countryId, regionId, title, disabled }: Props) {
  const [data, setData] = useState<BreakdownData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (disabled) return

    setLoading(true)
    const params = new URLSearchParams({ project, type })
    if (countryId) params.set('country_id', countryId)
    if (regionId) params.set('region_id', regionId)

    fetch(`/api/stats/breakdown?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [project, type, countryId, regionId, disabled])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4 h-96 flex items-center justify-center">
        <LoadingSpinner label="Загрузка данных..." />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-4 h-96 flex items-center justify-center text-gray-400">
        Нет данных
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={100}
            interval={Math.ceil(data.length / 10) - 1}
            tick={{ fontSize: 12 }}
          />
          <YAxis />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
            formatter={(value: number) => value.toLocaleString()}
            labelFormatter={(label: string) => `${label}: `}
          />
          <Bar dataKey="hotel_count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
