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

export interface CheckHistoryIndexedUrl {
  url: string
  sitemapUrl: string
  status?: string
  httpCode?: number
  accessDate?: string
}

export interface CheckHistoryRecrawlResult {
  url: string
  success: boolean
  task_id?: string
  error?: string
}

export interface CheckHistory {
  id?: number
  date: string          // YYYY-MM-DD
  timestamp: number     // unix ms
  sitemapUrl: string
  sitemapUrlCount: number
  indexedCount: number
  notIndexedCount: number
  indexed: CheckHistoryIndexedUrl[]
  notIndexed: string[]
  recrawled: CheckHistoryRecrawlResult[]
  elapsed: number
}

export interface UrlCheckResult {
  url: string
  isIndexed: boolean | null
  notMonitored?: boolean
  indexingStatus?: string
  httpCode?: number
  title?: string | null
  targetUrl?: string | null
  excludedReason?: string | null
  lastAccess?: string | null
}

export interface UrlCheckHistory {
  id?: number
  date: string
  timestamp: number
  mode: 'single' | 'batch'
  inputUrls: string[]
  results: UrlCheckResult[]
  recrawled: CheckHistoryRecrawlResult[]
  indexedCount: number
  notIndexedCount: number
  notMonitoredCount: number
}

export class AnalyticsDB extends Dexie {
  countries!: Table<Country>
  regions!: Table<Region>
  cities!: Table<City>
  statsSummary!: Table<StatsSummary>
  statsFrequency!: Table<StatsFrequency>
  checkHistory!: Table<CheckHistory>
  urlCheckHistory!: Table<UrlCheckHistory>

  constructor() {
    super('AnalyticsDB')
    this.version(1).stores({
      countries: 'id, project',
      regions: 'id, country_id, project',
      cities: 'id, region_id, country_id, project',
      statsSummary: 'id, timestamp',
      statsFrequency: 'id, timestamp',
    })
    this.version(2).stores({
      countries: 'id, project',
      regions: 'id, country_id, project',
      cities: 'id, region_id, country_id, project',
      statsSummary: 'id, timestamp',
      statsFrequency: 'id, timestamp',
      checkHistory: '++id, date, timestamp',
    })
    this.version(3).stores({
      countries: 'id, project',
      regions: 'id, country_id, project',
      cities: 'id, region_id, country_id, project',
      statsSummary: 'id, timestamp',
      statsFrequency: 'id, timestamp',
      checkHistory: '++id, date, timestamp',
      urlCheckHistory: '++id, date, timestamp',
    })
  }
}

export const db = new AnalyticsDB()