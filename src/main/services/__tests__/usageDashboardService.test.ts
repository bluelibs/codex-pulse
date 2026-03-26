import { mkdir, writeFile } from 'node:fs/promises'
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

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(async () => {
  const { rm } = await import('node:fs/promises')

  delete process.env.CODEX_HOME
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
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
      request.since === '2026-03-26' ? makeReport('Mar 26', 1200, 0.34) : makeReport('Week', 6400, 1.84),
    )

    await mkdir(path.dirname(sessionsFile), { recursive: true })
    await mkdir(path.dirname(archivedFile), { recursive: true })
    await writeFile(sessionsFile, '{"type":"token_count"}\n', 'utf8')
    await writeFile(archivedFile, '{"type":"token_count"}\n', 'utf8')
    await writeFile(historyFile, '{"type":"history"}\n', 'utf8')

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    })

    const response = await service.loadDashboard()

    expect(response.snapshot?.today.totalTokens).toBe(1200)
    expect(response.snapshot?.week.totalTokens).toBe(6400)
    expect(response.snapshot?.relevantFileCount).toBe(2)
    expect(runner).toHaveBeenCalledTimes(2)

    const cachedResponse = await service.loadDashboard()

    expect(cachedResponse.stale).toBe(false)
    expect(cachedResponse.snapshot?.week.costUSD).toBe(1.84)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('returns cached data immediately and refreshes in the background when the sentinel changes', async () => {
    const root = await makeTempRoot()
    const codexHome = path.join(root, '.codex')
    const sessionsFile = path.join(codexHome, 'sessions', '2026', '03', '26', 'active.jsonl')
    const historyFile = path.join(codexHome, 'history.jsonl')
    const listener = vi.fn()
    const runner = vi.fn<(request: ReportRequest) => Promise<CcusageDailyReport>>()

    runner.mockImplementation(async (request) =>
      request.since === '2026-03-26' ? makeReport('Today', 900, 0.22) : makeReport('Week', 4200, 1.05),
    )

    await mkdir(path.dirname(sessionsFile), { recursive: true })
    await writeFile(sessionsFile, '{"type":"token_count"}\n', 'utf8')
    await writeFile(historyFile, '{"type":"history"}\n', 'utf8')

    process.env.CODEX_HOME = codexHome

    const service = new UsageDashboardService({
      cachePath: path.join(root, 'cache', 'usage.json'),
      mirrorRoot: path.join(root, 'mirror'),
      runner,
      timezone: 'UTC',
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    })

    service.subscribe(listener)
    await service.loadDashboard()

    await writeFile(historyFile, '{"type":"history"}\n{"type":"nudge"}\n', 'utf8')

    const cachedView = await service.loadDashboard()

    expect(cachedView.snapshot?.today.totalTokens).toBe(900)
    expect(cachedView.stale).toBe(true)
    expect(cachedView.isRefreshing).toBe(true)

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })
  })
})

