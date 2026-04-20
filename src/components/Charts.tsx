'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

interface Props {
  typeBreakdown: { premises_type: string; cnt: number; obj_group: string }[]
  providerCoverage: { service_type: string; matched_hotels: number }[]
  providerCoverageApartments: { service_type: string; matched_hotels: number }[]
  frequency: { city_code: string; frequency: number }[]
  totalHotels: number
  totalApartments: number
}

export function Charts({
  typeBreakdown, providerCoverage, providerCoverageApartments,
  frequency, totalHotels, totalApartments,
}: Props) {
  // Group totals from DB-classified data
  const grouped = { hotels: 0, apartments: 0, other: 0 }
  typeBreakdown?.forEach((t) => {
    const g = t.obj_group as keyof typeof grouped
    grouped[g] = (grouped[g] || 0) + t.cnt
  })

  const pieData = [
    { name: 'Hotels', value: grouped.hotels },
    { name: 'Apartments', value: grouped.apartments },
    ...(grouped.other > 0 ? [{ name: 'Other', value: grouped.other }] : []),
  ]

  // Hotels-only type breakdown
  const hotelsTypeData = typeBreakdown
    ?.filter((t) => t.obj_group === 'hotels')
    .slice(0, 10) || []

  // Apartments-only type breakdown
  const apartmentsTypeData = typeBreakdown
    ?.filter((t) => t.obj_group === 'apartments')
    .slice(0, 10) || []

  // Provider coverage for Hotels — with percentage
  const providerDataHotels = providerCoverage?.map((p) => ({
    name: p.service_type,
    count: p.matched_hotels,
    percent: totalHotels > 0 ? Math.round((p.matched_hotels / totalHotels) * 100) : 0,
  })) || []

  // Provider coverage for Apartments
  const providerDataApartments = providerCoverageApartments?.map((p) => ({
    name: p.service_type,
    count: p.matched_hotels,
    percent: totalApartments > 0 ? Math.round((p.matched_hotels / totalApartments) * 100) : 0,
  })) || []

  // Top cities by frequency
  const freqData = frequency?.map((f) => ({
    name: f.city_code,
    frequency: f.frequency,
  })) || []

  return (
    <div className="space-y-6">
      {/* Row 1: Pie + Hotels Provider Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hotels vs Apartments Pie */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Hotels vs Apartments (All Objects)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Provider Coverage — Hotels */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Hotels — Provider Coverage</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerDataHotels} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={90} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === 'percent' ? `${v}%` : v.toLocaleString(),
                  name === 'percent' ? 'Coverage %' : 'Hotels',
                ]}
              />
              <Bar dataKey="count" fill="#3b82f6" name="Matched Hotels" />
              <Bar dataKey="percent" fill="#93c5fd" name="Coverage %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Hotels breakdown + Apartments breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hotels by Type */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Hotels Group — By Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hotelsTypeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="premises_type" width={140} fontSize={11} />
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
              <Bar dataKey="cnt" fill="#f59e0b" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Apartments by Type */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Apartments Group — By Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={apartmentsTypeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="premises_type" width={140} fontSize={11} />
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
              <Bar dataKey="cnt" fill="#10b981" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Apartments Provider Coverage + Frequency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Coverage — Apartments */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Apartments — Provider Coverage</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerDataApartments} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={90} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === 'percent' ? `${v}%` : v.toLocaleString(),
                  name === 'percent' ? 'Coverage %' : 'Apartments',
                ]}
              />
              <Bar dataKey="count" fill="#8b5cf6" name="Matched" />
              <Bar dataKey="percent" fill="#c4b5fd" name="Coverage %" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Cities by Frequency */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Top Cities by Frequency</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={freqData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={10} />
              <YAxis />
              <Tooltip formatter={(v: number) => v.toLocaleString()} />
              <Bar dataKey="frequency" fill="#8b5cf6" name="Frequency" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
