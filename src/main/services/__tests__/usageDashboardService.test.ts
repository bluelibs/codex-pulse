import { mkdir, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CcusageDailyReport, ReportRequest } from '../runCcusage'
import { UsageDashboardService } from '../usageDashboardService'

const tempRoots: string[] = []

async function makeTempRoot() {
  const root = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'codex-pulse-')))
  tempRoots.push(root)
  return root
}

async function removeWithRetries(root: string) {
  const { rm } = await import('node:fs/promises')

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(root, { force: true, recursive: true })
      return
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOTEMPTY' || attempt === 4) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

function makeReport(label: string, totalTokens: number, costUSD: number): CcusageDailyReport {
  return {
    daily: [
      {
        date: label,
        inputTokens: totalTokens - 12,
        cachedInputTokens: Math.max(totalTokens - 24, 0),
        outputTokens: 8,
        reasoningOutputTokens: 4,
        totalTokens,
        costUSD,
        models: {
          'gpt-5.4': {
            inputTokens: totalTokens - 12,
            cachedInputTokens: Math.max(totalTokens - 24, 0),
            outputTokens: 8,
            reasoningOutputTokens: 4,
            totalTokens,
            costUSD,
            isFallback: false,
          },
        },
      },
    ],
    totals: {
      inputTokens: totalTokens - 12,
      cachedInputTokens: Math.max(totalTokens - 24, 0),
      outputTokens: 8,
      reasoningOutputTokens: 4,
      totalTokens,
      costUSD,
    },
  }
}

function shiftDateKey(dateKey: string, dayDelta: number) {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + dayDelta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

function startOfYearKey(dateKey: string) {
  return `${dateKey.slice(0, 4)}-01-01`
}

function makeHistoryReport(todayKey: string, todayTokens: number, totalTokens: number, costUSD: number): CcusageDailyReport {
  const todayCostUSD = Number((costUSD * (todayTokens / totalTokens)).toFixed(2))
  const previousTokens = totalTokens - todayTokens
  const previousCostUSD = Number((costUSD - todayCostUSD).toFixed(2))
  const day25Tokens = Math.floor(previousTokens / 2)
  const day24Tokens = previousTokens - day25Tokens
  const yearStartKey = startOfYearKey(todayKey)
  const daily: CcusageDailyReport['daily'] = []

  for (let key = yearStartKey; key <= todayKey; key = shiftDateKey(key, 1)) {
    const tokens =
      key === shiftDateKey(todayKey, -2)
        ? day24Tokens
        : key === shiftDateKey(todayKey, -1)
          ? day25Tokens
          : key === todayKey
            ? todayTokens
            : 0
    const tokenCost =
      key === shiftDateKey(todayKey, -2)
        ? Number((previousCostUSD / 2).toFixed(2))
        : key === shiftDateKey(todayKey, -1)
          ? Number((previousCostUSD - Number((previousCostUSD / 2).toFixed(2))).toFixed(2))
          : key === todayKey
            ? todayCostUSD
            : 0

    daily.push({
      date: key,
      inputTokens: Math.max(tokens - 12, 0),
      cachedInputTokens: Math.max(tokens - 24, 0),
      outputTokens: tokens === 0 ? 0 : 8,
      reasoningOutputTokens: tokens === 0 ? 0 : 4,
      totalTokens: tokens,
      costUSD: tokenCost,
      models: {
          'gpt-5.4': {
            inputTokens: Math.max(tokens - 12, 0),
            cachedInputTokens: Math.max(tokens - 24, 0),
            outputTokens: tokens === 0 ? 0 : 8,
            reasoningOutputTokens: tokens === 0 ? 0 : 4,
            totalTokens: tokens,
            costUSD: tokenCost,
            isFallback: false,
          },
        },
    })
  }

  return {
    daily,
    totals: {
      inputTokens: totalTokens - 12,
      cachedInputTokens: Math.max(totalTokens - 24, 0),
      outputTokens: 8,
      reasoningOutputTokens: 4,
      totalTokens,
      costUSD,
    },
  }
}

function makeTokenCountLine({
  timestamp,
  usedPercent,
  resetsAt,
}: {
  timestamp: string
  usedPercent: number
  resetsAt: number
}) {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        limit_id: 'codex',
        plan_type: 'pro',
        secondary: {
          used_percent: usedPercent,
          window_minutes: 10080,
          resets_at: resetsAt,
        },
      },
    },
  })
}

async function writeTestFile(filePath: string, contents: string, mtimeIso: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')

  const timestamp = new Date(mtimeIso)
  await utimes(filePath, timestamp, timestamp)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(async () => {
  delete process.env.CODEX_HOME
  await Promise.all(tempRoots.splice(0).map((root) => removeWithRetries(root)))
})

describe('UsageDashboardService', () => {
  it('builds a snapshot and writes a reusable cache document', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const sessionsFile = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const archivedFile = path.join(codexHome, 'archived_sessions', 'finished.jsonl')
    const historyFile = path.join(codexHome, 'history.jsonl')
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()

    runner.mockImplementation(async (request) =>
      request.since === '2026-03-26'
        ? makeReport('2026-03-26', 1200, 0.34)
        : makeHistoryReport('2026-03-26', 1200, 6400, 1.84),
    )

    await writeTestFile(sessionsFile, '{"type":"token_count"}\n', '2026-03-26T12:00:00.000Z')
    await writeTestFile(archivedFile, '{"type":"token_count"}\n', '2026-03-25T12:00:00.000Z')
    await writeTestFile(historyFile, '{"type":"history"}\n', '2026-03-26T12:00:00.000Z')

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    })

    const response = await service.loadDashboard()

    expect(response.error).toBeUndefined()
    expect(response.snapshot?.today.totalTokens).toBe(1200)
    expect(response.snapshot?.week.totalTokens).toBe(6400)
    expect(response.snapshot?.relevantFileCount).toBe(2)
    expect(response.snapshot?.dateGroups.at(-1)?.heavyLiftingModels).toEqual(
      response.snapshot?.dateGroups.at(-1)?.models,
    )
    expect(runner).toHaveBeenCalledTimes(1)

    const cachedResponse = await service.loadDashboard()

    expect(cachedResponse.stale).toBe(false)
    expect(cachedResponse.snapshot?.week.costUSD).toBeCloseTo(1.84, 2)
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('captures the latest codex weekly limit from session logs', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const sessionsFile = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()

    runner.mockImplementation(async (request) =>
      request.since === '2026-03-26'
        ? makeReport('2026-03-26', 1200, 0.34)
        : makeHistoryReport('2026-03-26', 1200, 6400, 1.84),
    )

    await writeTestFile(
      sessionsFile,
      [
        makeTokenCountLine({
          timestamp: '2026-03-26T09:00:00.000Z',
          usedPercent: 61,
          resetsAt: 1774774800,
        }),
        makeTokenCountLine({
          timestamp: '2026-03-26T12:00:00.000Z',
          usedPercent: 76,
          resetsAt: 1774774800,
        }),
      ].join('\n'),
      '2026-03-26T12:00:00.000Z',
    )

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:30:00.000Z'),
    })

    const response = await service.loadDashboard()

    expect(response.snapshot?.codexWeeklyLimit).toEqual({
      limitId: 'codex',
      planType: 'pro',
      sampledAt: '2026-03-26T12:00:00.000Z',
      resetsAt: '2026-03-29T09:00:00.000Z',
      usedPercent: 76,
      remainingPercent: 24,
    })
  })

  it('returns cached data immediately and refreshes only today after the ttl expires', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const sessionsFile = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const listener = vi.fn()
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()
    let now = new Date('2026-03-26T12:00:00.000Z')

    runner.mockImplementation(async (request) =>
      new Promise<CcusageDailyReport>((resolve) => {
        setTimeout(() => {
          resolve(
            request.since === '2026-03-26'
              ? makeReport('2026-03-26', 900, 0.22)
              : makeHistoryReport('2026-03-26', 900, 4200, 1.05),
          )
        }, 25)
      }),
    )

    await writeTestFile(sessionsFile, '{"type":"token_count"}\n', '2026-03-26T12:00:00.000Z')

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => now,
    })

    service.subscribe(listener)
    await service.loadDashboard()
    expect(runner).toHaveBeenCalledTimes(1)

    now = new Date('2026-03-26T12:16:00.000Z')
    await writeTestFile(sessionsFile, '{"type":"token_count"}\n{"type":"late_update"}\n', '2026-03-26T12:16:00.000Z')

    const cachedView = await service.loadDashboard()

    expect(cachedView.error).toBeUndefined()
    expect(cachedView.snapshot?.today.totalTokens).toBe(900)
    expect(cachedView.stale).toBe(true)
    expect(cachedView.isRefreshing).toBe(true)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          isRefreshing: true,
          stale: true,
        }),
      )
    })

    await vi.waitFor(() => {
      expect(runner).toHaveBeenCalledTimes(2)
    })
    expect(runner.mock.calls[1]?.[0]).toMatchObject({
      since: '2026-03-26',
      until: '2026-03-26',
    })
  })

  it('treats a today-only cache as stale and reseeds the missing week history', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const cachePath = path.join(root, 'cache', 'usage.json')
    const sessionsToday = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const sessionsYesterday = path.join(codexHome, 'sessions', '2026', '03', '25', 'active.jsonl')
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()

    runner.mockResolvedValue(makeHistoryReport('2026-03-26', 1200, 6400, 1.84))

    await writeTestFile(sessionsToday, '{"type":"token_count"}\n', '2026-03-26T12:00:00.000Z')
    await writeTestFile(sessionsYesterday, '{"type":"token_count"}\n', '2026-03-25T12:00:00.000Z')
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(
      cachePath,
      JSON.stringify({
        version: 4,
        timezone: 'UTC',
        weekStartKey: '2026-03-23',
        lastTodayRefreshAt: '2026-03-26T12:00:00.000Z',
        todayFingerprint: 'fresh',
        coarseSentinel: '{}',
        mirrorBuiltAt: '2026-03-26T12:00:00.000Z',
        codexWeeklyLimit: null,
        snapshot: {
          generatedAt: '2026-03-26T12:00:00.000Z',
          timezone: 'UTC',
          codexWeeklyLimit: null,
          today: {
            label: 'Today',
            rangeStart: '2026-03-26',
            rangeEnd: '2026-03-26',
            inputTokens: 1188,
            cachedInputTokens: 1176,
            outputTokens: 8,
            reasoningOutputTokens: 4,
            totalTokens: 1200,
            costUSD: 0.34,
          },
          week: {
            label: 'Week to date',
            rangeStart: '2026-03-23',
            rangeEnd: '2026-03-26',
            inputTokens: 1188,
            cachedInputTokens: 1176,
            outputTokens: 8,
            reasoningOutputTokens: 4,
            totalTokens: 1200,
            costUSD: 0.34,
          },
          trend: [
            {
              id: '2026-03-26',
              label: 'Mar 26',
              inputTokens: 1188,
              cachedInputTokens: 1176,
              outputTokens: 8,
              reasoningOutputTokens: 4,
              totalTokens: 1200,
              costUSD: 0.34,
            },
          ],
          dateGroups: [
            {
              id: '2026-03-26',
              label: 'Mar 26',
              period: {
                label: 'Mar 26',
                rangeStart: '2026-03-26',
                rangeEnd: '2026-03-26',
                inputTokens: 1188,
                cachedInputTokens: 1176,
                outputTokens: 8,
                reasoningOutputTokens: 4,
                totalTokens: 1200,
                costUSD: 0.34,
              },
              models: [
                {
                  name: 'gpt-5.4',
                  inputTokens: 1188,
                  cachedInputTokens: 1176,
                  outputTokens: 8,
                  reasoningOutputTokens: 4,
                  totalTokens: 1200,
                  costUSD: 0.34,
                  isFallback: false,
                  tokenShare: 1,
                },
              ],
            },
          ],
          models: [
            {
              name: 'gpt-5.4',
              inputTokens: 1188,
              cachedInputTokens: 1176,
              outputTokens: 8,
              reasoningOutputTokens: 4,
              totalTokens: 1200,
              costUSD: 0.34,
              isFallback: false,
              tokenShare: 1,
            },
          ],
          relevantFileCount: 1,
          mirrorBuiltAt: '2026-03-26T12:00:00.000Z',
        },
        days: {
          '2026-03-26': {
            dateKey: '2026-03-26',
            label: 'Mar 26',
            totals: {
              inputTokens: 1188,
              cachedInputTokens: 1176,
              outputTokens: 8,
              reasoningOutputTokens: 4,
              totalTokens: 1200,
              costUSD: 0.34,
            },
            models: {
              'gpt-5.4': {
                inputTokens: 1188,
                cachedInputTokens: 1176,
                outputTokens: 8,
                reasoningOutputTokens: 4,
                totalTokens: 1200,
                costUSD: 0.34,
                isFallback: false,
              },
            },
            heavyLiftingModels: [
              {
                name: 'gpt-5.4',
                inputTokens: 1188,
                cachedInputTokens: 1176,
                outputTokens: 8,
                reasoningOutputTokens: 4,
                totalTokens: 1200,
                costUSD: 0.34,
                isFallback: false,
                tokenShare: 1,
              },
            ],
            relevantFileCount: 1,
          },
        },
      }),
      'utf8',
    )

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath,
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    })

    const response = await service.loadDashboard()

    expect(response.snapshot?.week.totalTokens).toBe(1200)
    expect(response.stale).toBe(true)
    expect(response.isRefreshing).toBe(true)

    await vi.waitFor(() => {
      expect(runner).toHaveBeenCalledWith(
        expect.objectContaining({
          since: '2026-01-01',
          until: '2026-03-26',
        }),
      )
    })
  })

  it('splits heavy lifting rows by reasoning effort without changing the base model totals', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const sessionsFile = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()

    runner.mockImplementation(async (request) =>
      request.since === '2026-03-26'
        ? makeReport('2026-03-26', 1200, 0.34)
        : makeHistoryReport('2026-03-26', 1200, 1200, 0.34),
    )

    await writeTestFile(
      sessionsFile,
      [
        JSON.stringify({
          timestamp: '2026-03-26T08:00:00.000Z',
          type: 'turn_context',
          payload: {
            model: 'gpt-5.4',
            effort: 'high',
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-26T08:00:01.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                total_tokens: 300,
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-26T09:00:00.000Z',
          type: 'turn_context',
          payload: {
            model: 'gpt-5.4',
            effort: 'xhigh',
          },
        }),
        JSON.stringify({
          timestamp: '2026-03-26T09:00:01.000Z',
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: {
                total_tokens: 900,
              },
            },
          },
        }),
      ].join('\n'),
      '2026-03-26T12:00:00.000Z',
    )

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    })

    const response = await service.loadDashboard()
    const todayGroup = response.snapshot?.dateGroups.find((group) => group.id === '2026-03-26')

    expect(todayGroup?.models).toEqual([
      expect.objectContaining({
        name: 'gpt-5.4',
        totalTokens: 1200,
      }),
    ])
    expect(todayGroup?.heavyLiftingModels).toEqual([
      expect.objectContaining({
        name: 'gpt-5.4-xhigh',
        totalTokens: 900,
      }),
      expect.objectContaining({
        name: 'gpt-5.4-high',
        totalTokens: 300,
      }),
    ])
  })
})
