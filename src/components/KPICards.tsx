'use client'

interface Props {
  summary: {
    active_countries: number
    active_regions: number
    active_cities: number
    total_objects: number
    total_hotels: number
    total_apartments: number
  }
}

const cards = [
  { key: 'active_countries', label: 'Active Countries', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'active_regions', label: 'Active Regions', color: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'active_cities', label: 'Active Cities', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'total_objects', label: 'Total Objects', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  { key: 'total_hotels', label: 'Hotels (group)', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { key: 'total_apartments', label: 'Apartments (group)', color: 'bg-teal-50 text-teal-700 border-teal-200' },
] as const

export function KPICards({ summary }: Props) {
  if (!summary) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.key} className={`rounded-lg p-4 border ${c.color}`}>
          <div className="text-xs font-medium opacity-80">{c.label}</div>
          <div className="text-2xl font-bold mt-1">
            {(summary[c.key] ?? 0).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  )
}
