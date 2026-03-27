import { describe, expect, it } from 'vitest'

import { resolveReportModelTotals } from '../runCcusage'

describe('resolveReportModelTotals', () => {
  it('infers missing per-model cost from token share', () => {
    const models = resolveReportModelTotals(
      {
        'gpt-5.2': {
          inputTokens: 580,
          cachedInputTokens: 120,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          totalTokens: 600,
          isFallback: false,
        },
        'gpt-5': {
          inputTokens: 380,
          cachedInputTokens: 80,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          totalTokens: 400,
          isFallback: false,
        },
      },
      5,
    )

    expect(models['gpt-5.2']?.costUSD).toBeCloseTo(3, 6)
    expect(models['gpt-5']?.costUSD).toBeCloseTo(2, 6)
  })

  it('preserves explicit model cost and allocates the remainder to missing entries', () => {
    const models = resolveReportModelTotals(
      {
        'gpt-5.2': {
          inputTokens: 580,
          cachedInputTokens: 120,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          totalTokens: 600,
          costUSD: 3.4,
          isFallback: false,
        },
        'gpt-5.1-codex-max': {
          inputTokens: 180,
          cachedInputTokens: 40,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          totalTokens: 200,
          isFallback: false,
        },
        'gpt-5': {
          inputTokens: 180,
          cachedInputTokens: 40,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          totalTokens: 200,
          isFallback: false,
        },
      },
      5,
    )

    expect(models['gpt-5.2']?.costUSD).toBeCloseTo(3.4, 6)
    expect(models['gpt-5.1-codex-max']?.costUSD).toBeCloseTo(0.8, 6)
    expect(models['gpt-5']?.costUSD).toBeCloseTo(0.8, 6)
  })
})
