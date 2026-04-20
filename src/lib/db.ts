import Dexie, { Table } from 'dexie'

export interface Country {
  id: string
  name: string
  name_ru?: string
  project: string
}

export interface Region {
  id: string
  name: string
  name_ru?: string
  country_id: string
  project: string
}

export interface City {
  id: string
  name: string
  name_ru?: string
  region_id: string
  country_id: string
  project: string
}

export interface StatsSummary {
  id: string // key like 'project-country-region-city'
  data: any
  timestamp: number
}

export interface StatsFrequency {
  id: string
  data: any[]
  timestamp: number
}

export class AnalyticsDB extends Dexie {
  countries!: Table<Country>
  regions!: Table<Region>
  cities!: Table<City>
  statsSummary!: Table<StatsSummary>
  statsFrequency!: Table<StatsFrequency>

  constructor() {
    super('AnalyticsDB')
    this.version(1).stores({
      countries: 'id, project',
      regions: 'id, country_id, project',
      cities: 'id, region_id, country_id, project',
      statsSummary: 'id, timestamp',
      statsFrequency: 'id, timestamp',
    })
  }
}

export const db = new AnalyticsDB()