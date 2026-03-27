import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ModelBreakdown, PeriodTotals } from '@shared/usage'

import { MixPanel } from '../MixPanel'

function makePeriod(overrides: Partial<PeriodTotals> = {}): PeriodTotals {
  return {
    label: 'This week',
    rangeStart: '2026-03-24',
    rangeEnd: '2026-03-26',
    inputTokens: 2_900_000,
    cachedInputTokens: 1_800_000,
    outputTokens: 36_000,
    reasoningOutputTokens: 6_000,
    totalTokens: 2_942_000,
    costUSD: 4.56,
    ...overrides,
  }
}

function makeModel(overrides: Partial<ModelBreakdown> = {}): ModelBreakdown {
  return {
    name: 'gpt-5.4',
    inputTokens: 2_900_000,
    cachedInputTokens: 1_800_000,
    outputTokens: 36_000,
    reasoningOutputTokens: 6_000,
    totalTokens: 2_942_000,
    costUSD: 4.56,
    isFallback: false,
    tokenShare: 1,
    ...overrides,
  }
}

describe('MixPanel', () => {
  it('renders a full-coverage estimated savings explanation', () => {
    render(
      <MixPanel
        models={[makeModel()]}
        period={makePeriod()}
        periodLabel="This week"
      />,
    )

    expect(screen.getByText('Estimated saved')).toBeInTheDocument()
    expect(screen.getByText('$4.05')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Cache reused 1.8M input tokens this period, avoiding an estimated $4.05 in fresh-input spend.',
      ),
    ).not.toBeInTheDocument()
  })

  it('keeps partial coverage silent when an estimate is still available', () => {
    render(
      <MixPanel
        models={[
          makeModel({ inputTokens: 900_000, cachedInputTokens: 900_000 }),
          makeModel({
            name: 'mystery-model',
            inputTokens: 100_000,
            cachedInputTokens: 100_000,
            totalTokens: 100_000,
            tokenShare: 0.1,
          }),
        ]}
        period={makePeriod({
          inputTokens: 1_000_000,
          cachedInputTokens: 1_000_000,
          totalTokens: 1_000_000,
        })}
        periodLabel="This month"
      />,
    )

    expect(screen.getByText('$2.03')).toBeInTheDocument()
    expect(
      screen.queryByText('Estimate covers 90% of cached tokens with known pricing.'),
    ).not.toBeInTheDocument()
  })

  it('keeps the zero-cache state minimal', () => {
    render(
      <MixPanel
        models={[makeModel({ inputTokens: 800_000, cachedInputTokens: 0, totalTokens: 800_000 })]}
        period={makePeriod({
          inputTokens: 800_000,
          cachedInputTokens: 0,
          totalTokens: 800_000,
        })}
        periodLabel="Today"
      />,
    )

    expect(screen.getByText('No savings yet')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'No cached input tokens landed in this period yet, so there is no fresh-input savings estimate to show.',
      ),
    ).not.toBeInTheDocument()
  })

  it('shows a compact note only when the estimate is unavailable', () => {
    render(
      <MixPanel
        models={[
          makeModel({
            name: 'unknown-model',
            inputTokens: 500_000,
            cachedInputTokens: 500_000,
            totalTokens: 500_000,
          }),
        ]}
        period={makePeriod({
          inputTokens: 500_000,
          cachedInputTokens: 500_000,
          totalTokens: 500_000,
        })}
        periodLabel="Today"
      />,
    )

    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Estimated savings are unavailable for the models in this period.'),
    ).toBeInTheDocument()
  })
})
