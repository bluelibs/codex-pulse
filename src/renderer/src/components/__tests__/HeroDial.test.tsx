import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PeriodTotals } from '@shared/usage'

import { HeroDial } from '../HeroDial'

function makePeriodTotals(overrides: Partial<PeriodTotals> = {}): PeriodTotals {
  return {
    label: 'Today',
    rangeStart: '2026-03-26',
    rangeEnd: '2026-03-26',
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    ...overrides,
  }
}

describe('HeroDial', () => {
  it('renders empty usage as unloaded rings', () => {
    render(
      <HeroDial
        today={makePeriodTotals()}
        focusPeriod={makePeriodTotals({ label: 'This week', costUSD: 4.56 })}
        filterLabel="This week"
      />,
    )

    const card = screen.getByText('Today’s share of this week').closest('aside')

    expect(card).not.toBeNull()
    expect(card).toHaveStyle({
      '--cache-angle': '0deg',
    })
    expect(card?.getAttribute('style')).not.toContain('--signal-angle')
    const legend = screen.getByLabelText('Dial legend')

    expect(within(legend).queryByText('Today share')).not.toBeInTheDocument()
    expect(within(legend).getByText('Today cache reuse')).toBeInTheDocument()
    expect(screen.getByText('Today share')).toBeInTheDocument()
    expect(screen.getByText('0% of this week')).toBeInTheDocument()
    expect(screen.getByText('$4.56')).toBeInTheDocument()
  })

  it('caps visual ring fill at a full circle while preserving the real percentage label', () => {
    render(
      <HeroDial
        today={makePeriodTotals({
          inputTokens: 1_000,
          cachedInputTokens: 1_200,
          outputTokens: 200,
          totalTokens: 1_200,
          costUSD: 2.4,
        })}
        focusPeriod={makePeriodTotals({
          label: 'Last month',
          rangeStart: '2026-02-01',
          rangeEnd: '2026-02-29',
          inputTokens: 800,
          cachedInputTokens: 200,
          outputTokens: 200,
          totalTokens: 1_000,
          costUSD: 8.9,
        })}
        filterLabel="Last month"
      />,
    )

    const card = screen.getByText('Today’s share of last month').closest('aside')

    expect(card).not.toBeNull()
    expect(card).toHaveStyle({
      '--cache-angle': '360deg',
    })
    expect(card?.getAttribute('style')).not.toContain('--signal-angle')
    expect(screen.getByText('120% of last month')).toBeInTheDocument()
    expect(screen.getByText('$8.90')).toBeInTheDocument()
  })
})
