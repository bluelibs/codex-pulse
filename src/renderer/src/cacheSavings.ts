import type { ModelBreakdown } from '@shared/usage'

type ModelPricing = {
  inputCostPerMToken: number
  cachedInputCostPerMToken: number
}

export type CacheSavingsEstimate = {
  estimatedSavingsUSD: number
  pricedCachedTokens: number
  unpricedCachedTokens: number
  coverageRatio: number
  hasEstimate: boolean
}

const MILLION = 1_000_000

const PROVIDER_PREFIXES = ['openai/', 'azure/', 'openrouter/openai/']

const MODEL_ALIASES = new Map<string, string>([
  ['gpt-5-codex', 'gpt-5'],
  ['gpt-5.3-codex', 'gpt-5.2-codex'],
])

// Mirrors the token pricing bundled with @ccusage/codex 18.0.10.
const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5': {
    inputCostPerMToken: 1.25,
    cachedInputCostPerMToken: 0.125,
  },
  'gpt-5-chat': {
    inputCostPerMToken: 1.25,
    cachedInputCostPerMToken: 0.125,
  },
  'gpt-5-codex': {
    inputCostPerMToken: 1.25,
    cachedInputCostPerMToken: 0.125,
  },
  'gpt-5-mini': {
    inputCostPerMToken: 0.25,
    cachedInputCostPerMToken: 0.025,
  },
  'gpt-5-nano': {
    inputCostPerMToken: 0.05,
    cachedInputCostPerMToken: 0.005,
  },
  'gpt-5-pro': {
    inputCostPerMToken: 15,
    cachedInputCostPerMToken: 15,
  },
  'gpt-5.1-codex': {
    inputCostPerMToken: 1.25,
    cachedInputCostPerMToken: 0.125,
  },
  'gpt-5.1-codex-max': {
    inputCostPerMToken: 1.25,
    cachedInputCostPerMToken: 0.125,
  },
  'gpt-5.1-codex-mini': {
    inputCostPerMToken: 0.25,
    cachedInputCostPerMToken: 0.025,
  },
  'gpt-5.2': {
    inputCostPerMToken: 1.75,
    cachedInputCostPerMToken: 0.175,
  },
  'gpt-5.2-chat': {
    inputCostPerMToken: 1.75,
    cachedInputCostPerMToken: 0.175,
  },
  'gpt-5.2-codex': {
    inputCostPerMToken: 1.75,
    cachedInputCostPerMToken: 0.175,
  },
  'gpt-5.2-pro': {
    inputCostPerMToken: 21,
    cachedInputCostPerMToken: 21,
  },
  'gpt-5.3-codex': {
    inputCostPerMToken: 1.75,
    cachedInputCostPerMToken: 0.175,
  },
  'gpt-5.4': {
    inputCostPerMToken: 2.5,
    cachedInputCostPerMToken: 0.25,
  },
  'gpt-5.4-pro': {
    inputCostPerMToken: 30,
    cachedInputCostPerMToken: 3,
  },
}

function stripProviderPrefix(name: string) {
  let normalized = name

  for (const prefix of PROVIDER_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length)
    }
  }

  return normalized
}

function stripDatedSuffix(name: string) {
  return name.replace(/-\d{4}-\d{2}-\d{2}$/, '')
}

function stripEffortSuffix(name: string) {
  return name.replace(/-(?:low|medium|high|xhigh)$/, '')
}

function buildLookupCandidates(modelName: string) {
  const normalized = stripProviderPrefix(modelName.trim().toLowerCase())
  const candidates = new Set<string>([normalized])
  const variants = [normalized, stripEffortSuffix(normalized)]

  for (const variant of variants) {
    candidates.add(variant)
    candidates.add(stripDatedSuffix(variant))
  }

  return [...candidates].filter(Boolean)
}

export function resolvePricedModelName(modelName: string) {
  for (const candidate of buildLookupCandidates(modelName)) {
    const alias = MODEL_ALIASES.get(candidate)

    if (alias && alias in MODEL_PRICING) {
      return alias
    }

    if (candidate in MODEL_PRICING) {
      return candidate
    }
  }

  return null
}

export function estimateCacheSavings(models: ModelBreakdown[]): CacheSavingsEstimate {
  let estimatedSavingsUSD = 0
  let pricedCachedTokens = 0
  let unpricedCachedTokens = 0

  for (const model of models) {
    const cachedTokens = Math.max(Math.min(model.cachedInputTokens, model.inputTokens), 0)

    if (cachedTokens === 0) {
      continue
    }

    if (model.isFallback) {
      unpricedCachedTokens += cachedTokens
      continue
    }

    const pricingKey = resolvePricedModelName(model.name)

    if (!pricingKey) {
      unpricedCachedTokens += cachedTokens
      continue
    }

    const pricing = MODEL_PRICING[pricingKey]
    const savedPerMillion = Math.max(
      pricing.inputCostPerMToken - pricing.cachedInputCostPerMToken,
      0,
    )

    estimatedSavingsUSD += (cachedTokens / MILLION) * savedPerMillion
    pricedCachedTokens += cachedTokens
  }

  const totalCachedTokens = pricedCachedTokens + unpricedCachedTokens

  return {
    estimatedSavingsUSD,
    pricedCachedTokens,
    unpricedCachedTokens,
    coverageRatio: totalCachedTokens === 0 ? 0 : pricedCachedTokens / totalCachedTokens,
    hasEstimate: pricedCachedTokens > 0,
  }
}
