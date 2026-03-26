import type { DashboardResponse } from '@shared/usage'

function splitHeavyLiftingModels(totalTokens: number) {
  const xhighTokens = Math.round(totalTokens * 0.52)
  const highTokens = Math.round(totalTokens * 0.28)
  const mediumTokens = totalTokens - xhighTokens - highTokens

  return [
    {
      name: 'gpt-5.4-xhigh',
      inputTokens: Math.max(xhighTokens - 8, 0),
      cachedInputTokens: Math.max(xhighTokens - 16, 0),
      outputTokens: 5,
      reasoningOutputTokens: 2,
      totalTokens: xhighTokens,
      isFallback: false,
      tokenShare: xhighTokens / totalTokens,
    },
    {
      name: 'gpt-5.4-high',
      inputTokens: Math.max(highTokens - 7, 0),
      cachedInputTokens: Math.max(highTokens - 14, 0),
      outputTokens: 2,
      reasoningOutputTokens: 1,
      totalTokens: highTokens,
      isFallback: false,
      tokenShare: highTokens / totalTokens,
    },
    {
      name: 'gpt-5.4-medium',
      inputTokens: Math.max(mediumTokens - 5, 0),
      cachedInputTokens: Math.max(mediumTokens - 10, 0),
      outputTokens: 1,
      reasoningOutputTokens: 1,
      totalTokens: mediumTokens,
      isFallback: false,
      tokenShare: mediumTokens / totalTokens,
    },
  ]
}

function makeDay(date: string, totalTokens: number, costUSD: number) {
  return {
    id: date,
    label: date,
    period: {
      label: date,
      rangeStart: date,
      rangeEnd: date,
      inputTokens: totalTokens - 12,
      cachedInputTokens: Math.max(totalTokens - 24, 0),
      outputTokens: 8,
      reasoningOutputTokens: 4,
      totalTokens,
      costUSD,
    },
    models: [
      {
        name: 'gpt-5.4',
        inputTokens: totalTokens - 12,
        cachedInputTokens: Math.max(totalTokens - 24, 0),
        outputTokens: 8,
        reasoningOutputTokens: 4,
        totalTokens,
        isFallback: false,
        tokenShare: 1,
      },
    ],
    heavyLiftingModels: splitHeavyLiftingModels(totalTokens),
  }
}

export const mockDashboardResponse: DashboardResponse = {
  snapshot: {
    generatedAt: '2026-03-26T12:34:00.000Z',
    timezone: 'UTC',
    today: {
      label: 'Today',
      rangeStart: '2026-03-26',
      rangeEnd: '2026-03-26',
      inputTokens: 900_000,
      cachedInputTokens: 720_000,
      outputTokens: 11_000,
      reasoningOutputTokens: 2_000,
      totalTokens: 913_000,
      costUSD: 1.23,
    },
    week: {
      label: 'Week to date',
      rangeStart: '2026-03-24',
      rangeEnd: '2026-03-26',
      inputTokens: 2_900_000,
      cachedInputTokens: 1_800_000,
      outputTokens: 36_000,
      reasoningOutputTokens: 6_000,
      totalTokens: 2_942_000,
      costUSD: 4.56,
    },
    trend: [
      {
        id: '2026-03-24',
        label: 'Mar 24',
        inputTokens: 1_029_000 - 12,
        cachedInputTokens: 1_029_000 - 24,
        outputTokens: 5_000,
        reasoningOutputTokens: 1_000,
        totalTokens: 1_029_000,
        costUSD: 1.8,
      },
      {
        id: '2026-03-25',
        label: 'Mar 25',
        inputTokens: 1_000_000 - 12,
        cachedInputTokens: 1_000_000 - 24,
        outputTokens: 8_000,
        reasoningOutputTokens: 1_000,
        totalTokens: 1_000_000,
        costUSD: 1.53,
      },
      {
        id: '2026-03-26',
        label: 'Mar 26',
        inputTokens: 913_000 - 12,
        cachedInputTokens: 913_000 - 24,
        outputTokens: 11_000,
        reasoningOutputTokens: 2_000,
        totalTokens: 913_000,
        costUSD: 1.23,
      },
    ],
    dateGroups: [
      makeDay('2026-01-15', 180_000, 0.26),
      makeDay('2026-02-07', 240_000, 0.33),
      makeDay('2026-02-18', 355_000, 0.47),
      makeDay('2026-02-27', 410_000, 0.54),
      makeDay('2026-03-04', 510_000, 0.71),
      makeDay('2026-03-12', 640_000, 0.89),
      makeDay('2026-03-18', 720_000, 1.02),
      makeDay('2026-03-24', 1_029_000, 1.8),
      makeDay('2026-03-25', 1_000_000, 1.53),
      makeDay('2026-03-26', 913_000, 1.23),
    ],
    models: [
      {
        name: 'gpt-5.4',
        inputTokens: 2_900_000,
        cachedInputTokens: 1_800_000,
        outputTokens: 36_000,
        reasoningOutputTokens: 6_000,
        totalTokens: 2_942_000,
        isFallback: false,
        tokenShare: 1,
      },
    ],
    relevantFileCount: 12,
    mirrorBuiltAt: '2026-03-26T12:33:00.000Z',
  },
  isRefreshing: false,
  stale: false,
}
