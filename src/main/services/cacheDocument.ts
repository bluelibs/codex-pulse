import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import type { DashboardSnapshot, ModelTotals, TokenTotals } from '@shared/usage'

const tokenTotalsSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  costUSD: z.number(),
}) satisfies z.ZodType<TokenTotals>

const modelTotalsSchema = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
  totalTokens: z.number(),
  isFallback: z.boolean(),
}) satisfies z.ZodType<ModelTotals>

const modelBreakdownSchema = modelTotalsSchema.extend({
  name: z.string(),
  tokenShare: z.number(),
})

const legacyCacheSchema = z.object({
  version: z.literal(1),
  coarseSentinel: z.string(),
  preciseFingerprint: z.string(),
  snapshot: z.custom<DashboardSnapshot>(),
})

const cachedDaySchema = z.object({
  dateKey: z.string(),
  label: z.string(),
  totals: tokenTotalsSchema,
  models: z.record(z.string(), modelTotalsSchema),
  heavyLiftingModels: z.array(modelBreakdownSchema),
  relevantFileCount: z.number().int().nonnegative(),
})

const cacheSchema = z.object({
  version: z.literal(3),
  timezone: z.string(),
  weekStartKey: z.string(),
  retentionStartKey: z.string().optional(),
  lastTodayRefreshAt: z.string(),
  todayFingerprint: z.string(),
  coarseSentinel: z.string(),
  mirrorBuiltAt: z.string(),
  snapshot: z.custom<DashboardSnapshot>(),
  days: z.record(z.string(), cachedDaySchema),
})

export type LegacyDashboardCacheDocument = z.infer<typeof legacyCacheSchema>
export type CachedDayDocument = z.infer<typeof cachedDaySchema>
export type DashboardCacheDocument = z.infer<typeof cacheSchema>
export type AnyDashboardCacheDocument = LegacyDashboardCacheDocument | DashboardCacheDocument

export async function readCacheDocument(cachePath: string) {
  try {
    const contents = await readFile(cachePath, 'utf8')
    const parsed = JSON.parse(contents)

    if (parsed?.version === 1) {
      return legacyCacheSchema.parse(parsed)
    }

    return cacheSchema.parse(parsed)
  } catch {
    return null
  }
}

export async function writeCacheDocument(cachePath: string, document: DashboardCacheDocument) {
  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(document, null, 2), 'utf8')
}
