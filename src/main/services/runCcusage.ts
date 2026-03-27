import { spawn } from 'node:child_process'
import path from 'node:path'

import { z } from 'zod'

import type { ModelTotals } from '@shared/usage'

import { toCliDate } from './dateRange'

const totalsSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  costUSD: z.number(),
})

const modelSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  costUSD: z.number().optional(),
  isFallback: z.boolean(),
})

const reportSchema = z.object({
  daily: z.array(
    totalsSchema.extend({
      date: z.string(),
      models: z.record(z.string(), modelSchema),
    }),
  ),
  totals: totalsSchema,
})

export type CcusageDailyReport = z.infer<typeof reportSchema>
export type CcusageReportModel = z.infer<typeof modelSchema>

export type ReportRequest = {
  codexHome: string
  since: string
  until: string
  timezone: string
}

export type ReportRunner = (request: ReportRequest) => Promise<CcusageDailyReport>

export function resolveReportModelTotals(
  models: Record<string, CcusageReportModel>,
  totalCostUSD: number,
): Record<string, ModelTotals> {
  const entries = Object.entries(models)
  const explicitCostTotal = entries.reduce(
    (sum, [, model]) => sum + (Number.isFinite(model.costUSD) ? model.costUSD ?? 0 : 0),
    0,
  )
  const missingCostEntries = entries.filter(([, model]) => !Number.isFinite(model.costUSD))
  const missingTokenTotal = missingCostEntries.reduce(
    (sum, [, model]) => sum + Math.max(model.totalTokens, 0),
    0,
  )
  const remainingCostUSD = Math.max(totalCostUSD - explicitCostTotal, 0)

  return Object.fromEntries(
    entries.map(([name, model]) => [
      name,
      {
        inputTokens: model.inputTokens,
        cachedInputTokens: model.cachedInputTokens,
        outputTokens: model.outputTokens,
        reasoningOutputTokens: model.reasoningOutputTokens,
        totalTokens: model.totalTokens,
        costUSD:
          Number.isFinite(model.costUSD)
            ? model.costUSD ?? 0
            : missingTokenTotal > 0
              ? remainingCostUSD * (Math.max(model.totalTokens, 0) / missingTokenTotal)
              : 0,
        isFallback: model.isFallback,
      } satisfies ModelTotals,
    ]),
  )
}

export function createCcusageRunner(appPath: string): ReportRunner {
  const cliEntry = path.join(appPath, 'node_modules', '@ccusage', 'codex', 'dist', 'index.js')
  const inFlightReports = new Map<string, Promise<CcusageDailyReport>>()

  function toCacheKey({ codexHome, since, until, timezone }: ReportRequest) {
    return [codexHome, since, until, timezone].join('\u0000')
  }

  return async function runReport({ codexHome, since, until, timezone }) {
    const cacheKey = toCacheKey({ codexHome, since, until, timezone })
    const inFlight = inFlightReports.get(cacheKey)

    if (inFlight) {
      return inFlight
    }

    const promise = new Promise<CcusageDailyReport>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          cliEntry,
          'daily',
          '--json',
          '--offline',
          '--since',
          toCliDate(since),
          '--until',
          toCliDate(until),
          '--timezone',
          timezone,
          '--locale',
          'en-CA',
        ],
        {
          env: {
            ...process.env,
            CODEX_HOME: codexHome,
            ELECTRON_RUN_AS_NODE: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        reject(error)
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `ccusage-codex exited with status ${code ?? 'unknown'}`))
          return
        }

        try {
          const parsed = reportSchema.parse(JSON.parse(stdout))
          resolve(parsed)
        } catch (error) {
          reject(error)
        }
      })
    }).finally(() => {
      inFlightReports.delete(cacheKey)
    })

    inFlightReports.set(cacheKey, promise)

    return promise
  }
}
