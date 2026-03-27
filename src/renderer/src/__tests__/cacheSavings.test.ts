import { describe, expect, it } from 'vitest'

import type { ModelBreakdown } from '@shared/usage'

import { estimateCacheSavings, resolvePricedModelName } from '../cacheSavings'

function makeModel(overrides: Partial<ModelBreakdown> = {}): ModelBreakdown {
  return {
    name: 'gpt-5.4',
    inputTokens: 1_000_000,
    cachedInputTokens: 500_000,
    outputTokens: 20_000,
    reasoningOutputTokens: 5_000,
    totalTokens: 1_025_000,
    isFallback: false,
    tokenShare: 1,
    ...overrides,
  }
}

describe('estimateCacheSavings', () => {
  it('computes savings for models with known pricing', () => {
    const estimate = estimateCacheSavings([makeModel()])

    expect(estimate.hasEstimate).toBe(true)
    expect(estimate.pricedCachedTokens).toBe(500_000)
    expect(estimate.coverageRatio).toBe(1)
    expect(estimate.estimatedSavingsUSD).toBeCloseTo(1.125)
  })

  it('tracks partial coverage when some cached tokens are unpriced', () => {
    const estimate = estimateCacheSavings([
      makeModel({ cachedInputTokens: 900_000, inputTokens: 900_000 }),
      makeModel({
        name: 'mystery-model',
        inputTokens: 100_000,
        cachedInputTokens: 100_000,
      }),
    ])

    expect(estimate.hasEstimate).toBe(true)
    expect(estimate.pricedCachedTokens).toBe(900_000)
    expect(estimate.unpricedCachedTokens).toBe(100_000)
    expect(estimate.coverageRatio).toBeCloseTo(0.9)
    expect(estimate.estimatedSavingsUSD).toBeCloseTo(2.025)
  })

  it('returns a neutral state when there are no cached tokens', () => {
    const estimate = estimateCacheSavings([
      makeModel({
        inputTokens: 700_000,
        cachedInputTokens: 0,
      }),
    ])

    expect(estimate.hasEstimate).toBe(false)
    expect(estimate.pricedCachedTokens).toBe(0)
    expect(estimate.unpricedCachedTokens).toBe(0)
    expect(estimate.coverageRatio).toBe(0)
    expect(estimate.estimatedSavingsUSD).toBe(0)
  })

  it('resolves known aliases and normalized names to a priced base model', () => {
    expect(resolvePricedModelName('gpt-5-codex')).toBe('gpt-5')
    expect(resolvePricedModelName('openai/gpt-5.4-2026-03-05')).toBe('gpt-5.4')
    expect(resolvePricedModelName('gpt-5.4-high')).toBe('gpt-5.4')
    expect(resolvePricedModelName('unknown-model')).toBeNull()
  })
})
