import type { ModelBreakdown, ModelTotals, PeriodTotals, TokenTotals, TrendPoint } from '@shared/usage'

import type { CcusageDailyReport } from './runCcusage'

export function emptyTokenTotals(): TokenTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  }
}

export function emptyModelTotals(): ModelTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    isFallback: false,
  }
}

export function toPeriodTotals(
  label: string,
  rangeStart: string,
  rangeEnd: string,
  totals: TokenTotals,
): PeriodTotals {
  return {
    label,
    rangeStart,
    rangeEnd,
    ...totals,
  }
}

export function toTrendPoints(report: CcusageDailyReport): TrendPoint[] {
  return report.daily.map((entry) => ({
    id: entry.date,
    label: entry.date,
    inputTokens: entry.inputTokens,
    cachedInputTokens: entry.cachedInputTokens,
    outputTokens: entry.outputTokens,
    reasoningOutputTokens: entry.reasoningOutputTokens,
    totalTokens: entry.totalTokens,
    costUSD: entry.costUSD,
  }))
}

export function mergeModelTotals(report: CcusageDailyReport): ModelBreakdown[] {
  const merged = new Map<string, ModelTotals>()

  for (const day of report.daily) {
    for (const [name, model] of Object.entries(day.models)) {
      const current = merged.get(name) ?? emptyModelTotals()

      current.inputTokens += model.inputTokens
      current.cachedInputTokens += model.cachedInputTokens
      current.outputTokens += model.outputTokens
      current.reasoningOutputTokens += model.reasoningOutputTokens
      current.totalTokens += model.totalTokens
      current.isFallback ||= model.isFallback

      merged.set(name, current)
    }
  }

  const weekTotal = report.totals.totalTokens || 1

  return [...merged.entries()]
    .map(([name, totals]) => ({
      name,
      ...totals,
      tokenShare: totals.totalTokens / weekTotal,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens)
}

export function toModelBreakdown(models: Record<string, ModelTotals>, totalTokens: number): ModelBreakdown[] {
  const denominator = totalTokens || 1

  return Object.entries(models)
    .map(([name, totals]) => ({
      name,
      ...totals,
      tokenShare: totals.totalTokens / denominator,
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens)
}
