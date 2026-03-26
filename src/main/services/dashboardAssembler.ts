import type { DashboardSnapshot } from '@shared/usage'

import type { CcusageDailyReport } from './runCcusage'
import { mergeModelTotals, toModelBreakdown, toPeriodTotals } from './tokenTotals'

type AssembleOptions = {
  todayReport: CcusageDailyReport
  weekReport: CcusageDailyReport
  todayKey: string
  weekStartKey: string
  timezone: string
  relevantFileCount: number
  mirrorBuiltAt: string
}

export function assembleDashboardSnapshot({
  todayReport,
  weekReport,
  todayKey,
  weekStartKey,
  timezone,
  relevantFileCount,
  mirrorBuiltAt,
}: AssembleOptions): DashboardSnapshot {
  const trend: DashboardSnapshot['trend'] = []
  const dateGroups: DashboardSnapshot['dateGroups'] = []

  for (const entry of weekReport.daily) {
    trend.push({
      id: entry.date,
      label: entry.date,
      inputTokens: entry.inputTokens,
      cachedInputTokens: entry.cachedInputTokens,
      outputTokens: entry.outputTokens,
      reasoningOutputTokens: entry.reasoningOutputTokens,
      totalTokens: entry.totalTokens,
      costUSD: entry.costUSD,
    })

    dateGroups.push({
      id: entry.date,
      label: entry.date,
      period: toPeriodTotals(entry.date, entry.date, entry.date, {
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        outputTokens: entry.outputTokens,
        reasoningOutputTokens: entry.reasoningOutputTokens,
        totalTokens: entry.totalTokens,
        costUSD: entry.costUSD,
      }),
      models: toModelBreakdown(entry.models, entry.totalTokens),
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    timezone,
    today: toPeriodTotals('Today', todayKey, todayKey, todayReport.totals),
    week: toPeriodTotals('Week to date', weekStartKey, todayKey, weekReport.totals),
    trend,
    dateGroups,
    models: mergeModelTotals(weekReport),
    relevantFileCount,
    mirrorBuiltAt,
  }
}
