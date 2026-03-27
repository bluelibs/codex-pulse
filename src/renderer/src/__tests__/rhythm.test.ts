import { describe, expect, it } from 'vitest'

import type { DateGroup } from '@shared/usage'

import { buildRhythmTrend } from '../rhythm'

function makeDay(dateKey: string, totalTokens: number, costUSD = 0.1): DateGroup {
  return {
    id: dateKey,
    label: dateKey,
    period: {
      label: dateKey,
      rangeStart: dateKey,
      rangeEnd: dateKey,
      inputTokens: totalTokens - 12,
      cachedInputTokens: Math.max(totalTokens - 24, 0),
      outputTokens: 8,
      reasoningOutputTokens: 4,
      totalTokens,
      costUSD,
    },
    models: [],
    heavyLiftingModels: [],
  }
}

describe('buildRhythmTrend', () => {
  it('keeps daily points for week views', () => {
    const trend = buildRhythmTrend(
      [makeDay('2026-03-24', 120), makeDay('2026-03-25', 140)],
      'week',
    )

    expect(trend.map((point) => point.label)).toEqual(['2026-03-24', '2026-03-25'])
    expect(trend.map((point) => point.totalTokens)).toEqual([120, 140])
  })

  it('aggregates month views into clipped ISO-week bars', () => {
    const trend = buildRhythmTrend(
      [
        makeDay('2026-03-01', 100, 0.1),
        makeDay('2026-03-02', 120, 0.2),
        makeDay('2026-03-03', 140, 0.3),
        makeDay('2026-03-09', 160, 0.4),
        makeDay('2026-03-10', 180, 0.5),
      ],
      'month',
    )

    expect(trend.map((point) => point.label)).toEqual(['Mar 1', 'Mar 2-3', 'Mar 9-10'])
    expect(trend.map((point) => point.totalTokens)).toEqual([100, 260, 340])
    expect(trend.map((point) => point.costUSD)).toEqual([0.1, 0.5, 0.9])
  })

  it('treats last month the same as month rhythm', () => {
    const trend = buildRhythmTrend(
      [makeDay('2026-02-01', 100), makeDay('2026-02-02', 120)],
      'lastMonth',
    )

    expect(trend.map((point) => point.label)).toEqual(['Feb 1', 'Feb 2'])
    expect(trend.map((point) => point.totalTokens)).toEqual([100, 120])
  })

  it('aggregates year views into month bars', () => {
    const trend = buildRhythmTrend(
      [
        makeDay('2026-01-05', 120, 0.2),
        makeDay('2026-01-20', 180, 0.3),
        makeDay('2026-02-01', 140, 0.4),
        makeDay('2026-02-18', 160, 0.5),
      ],
      'year',
    )

    expect(trend.map((point) => point.label)).toEqual(['Jan', 'Feb'])
    expect(trend.map((point) => point.totalTokens)).toEqual([300, 300])
    expect(trend.map((point) => point.costUSD)).toEqual([0.5, 0.9])
  })
})
