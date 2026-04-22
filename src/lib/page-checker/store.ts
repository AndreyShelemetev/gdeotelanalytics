import { PageType, SiteId } from './defaults'
import { PageReport } from './check-page'

export type RunStatus = 'idle' | 'running' | 'done' | 'error'

export interface RunState {
  id: string
  status: RunStatus
  error?: string
  site: SiteId
  pageType: PageType
  sitemapUrl: string
  mode: 'all' | 'random'
  randomCount: number
  startedAt: number
  finishedAt?: number
  urls: string[]
  reports: PageReport[]
  progress: { total: number; done: number }
}

// Простое in-memory хранилище на уровне процесса.
// Для Dev/single-instance Docker это допустимо.
const g = globalThis as any
if (!g.__pageCheckerRun) g.__pageCheckerRun = null as RunState | null

export function getRun(): RunState | null {
  return g.__pageCheckerRun
}
export function setRun(r: RunState | null) {
  g.__pageCheckerRun = r
}
