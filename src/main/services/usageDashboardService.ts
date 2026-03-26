import type { DashboardListener, DashboardResponse, DashboardSnapshot } from '@shared/usage'

import { readCacheDocument, writeCacheDocument } from './cacheDocument'
import { assembleDashboardSnapshot } from './dashboardAssembler'
import { getDateKey, shiftDateKey, startOfIsoWeek } from './dateRange'
import {
  buildCoarseSentinel,
  collectRelevantFiles,
  createPreciseFingerprint,
  resolveCodexPaths,
} from './fingerprint'
import { rebuildMirror } from './mirrorBuilder'
import type { ReportRunner } from './runCcusage'

type ServiceOptions = {
  cachePath: string
  mirrorRoot: string
  runner: ReportRunner
  timezone?: string
  now?: () => Date
}

export class UsageDashboardService {
  private readonly cachePath: string
  private readonly mirrorRoot: string
  private readonly runner: ReportRunner
  private readonly timezone: string
  private readonly now: () => Date
  private readonly listeners = new Set<DashboardListener>()

  private cachePromise: Promise<Awaited<ReturnType<typeof readCacheDocument>>> | null = null
  private refreshPromise: Promise<DashboardResponse> | null = null

  constructor(options: ServiceOptions) {
    this.cachePath = options.cachePath
    this.mirrorRoot = options.mirrorRoot
    this.runner = options.runner
    this.timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    this.now = options.now ?? (() => new Date())
  }

  subscribe(listener: DashboardListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async loadDashboard() {
    const cache = await this.loadCache()

    if (cache?.snapshot) {
      void this.startRefreshCycle({
        force: false,
        publishStart: true,
        startSnapshot: cache.snapshot,
        startStale: true,
      })

      return {
        snapshot: cache.snapshot,
        isRefreshing: true,
        stale: true,
      } satisfies DashboardResponse
    }

    void this.startRefreshCycle({
      force: false,
      publishStart: true,
      startSnapshot: null,
      startStale: false,
    })

    return {
      snapshot: null,
      isRefreshing: true,
      stale: false,
    } satisfies DashboardResponse
  }

  async getCachedDashboard() {
    const cache = await this.loadCache()

    return {
      snapshot: cache?.snapshot ?? null,
      isRefreshing: this.refreshPromise != null,
      stale: cache?.snapshot != null && this.refreshPromise != null,
    } satisfies DashboardResponse
  }

  async refreshDashboard() {
    const cache = await this.loadCache()
    return this.startRefreshCycle({
      force: true,
      publishStart: true,
      startSnapshot: cache?.snapshot ?? null,
      startStale: cache?.snapshot != null,
    })
  }

  private async loadCache() {
    if (!this.cachePromise) {
      this.cachePromise = readCacheDocument(this.cachePath)
    }

    return this.cachePromise
  }

  async primeCache() {
    await this.loadCache()
  }

  private startRefreshCycle({
    force = false,
    publishStart,
    startSnapshot,
    startStale,
  }: {
    force?: boolean
    publishStart: boolean
    startSnapshot: DashboardSnapshot | null
    startStale: boolean
  }) {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    if (publishStart) {
      this.publish({
        snapshot: startSnapshot,
        isRefreshing: true,
        stale: startStale,
      })
    }

    this.refreshPromise = this.executeRefresh(force)
      .then((response) => {
        this.publish(response)

        return response
      })
      .catch(async (error) => {
        const cache = await this.loadCache()
        const response = {
          snapshot: cache?.snapshot ?? null,
          isRefreshing: false,
          stale: cache?.snapshot != null,
          error: error instanceof Error ? error.message : String(error),
        } satisfies DashboardResponse

        this.publish(response)

        return response
      })
      .finally(() => {
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  private async executeRefresh(force: boolean) {
    const cache = await this.loadCache()
    const todayKey = getDateKey(this.now(), this.timezone)
    const weekStartKey = startOfIsoWeek(todayKey)
    const earliestRelevantKey = shiftDateKey(weekStartKey, -1)
    const paths = resolveCodexPaths()
    const [coarseSentinel, relevantFiles] = await Promise.all([
      buildCoarseSentinel(paths, todayKey),
      collectRelevantFiles(paths, earliestRelevantKey),
    ])
    const preciseFingerprint = createPreciseFingerprint(relevantFiles)

    if (!force && cache?.preciseFingerprint === preciseFingerprint) {
      const refreshed = {
        ...cache,
        coarseSentinel,
      }

      this.cachePromise = Promise.resolve(refreshed)
      void writeCacheDocument(this.cachePath, refreshed)

      return {
        snapshot: refreshed.snapshot,
        isRefreshing: false,
        stale: false,
      } satisfies DashboardResponse
    }

    await rebuildMirror(this.mirrorRoot, relevantFiles)

    const [todayReport, weekReport] = await Promise.all([
      this.runner({
        codexHome: this.mirrorRoot,
        since: todayKey,
        until: todayKey,
        timezone: this.timezone,
      }),
      this.runner({
        codexHome: this.mirrorRoot,
        since: weekStartKey,
        until: todayKey,
        timezone: this.timezone,
      }),
    ])

    const snapshot = assembleDashboardSnapshot({
      todayReport,
      weekReport,
      todayKey,
      weekStartKey,
      timezone: this.timezone,
      relevantFileCount: relevantFiles.length,
      mirrorBuiltAt: new Date().toISOString(),
    })

    const nextCache = {
      version: 1 as const,
      coarseSentinel,
      preciseFingerprint,
      snapshot,
    }

    this.cachePromise = Promise.resolve(nextCache)
    void writeCacheDocument(this.cachePath, nextCache)

    return {
      snapshot,
      isRefreshing: false,
      stale: false,
    } satisfies DashboardResponse
  }

  private publish(response: DashboardResponse) {
    for (const listener of this.listeners) {
      listener(response)
    }
  }
}
