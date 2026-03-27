import { createReadStream } from 'node:fs'
import readline from 'node:readline'

import type { ModelBreakdown, ModelTotals } from '@shared/usage'

import { getDateKey } from './dateRange'
import type { FileSignature } from './fingerprint'
import { emptyModelTotals, toModelBreakdown } from './tokenTotals'

type EffortTotals = Record<string, number>
type HeavyLiftingWeightMap = Record<string, Record<string, EffortTotals>>

type TurnContext = {
  model: string
  effort: string
}

function isReasoningEffort(value: unknown): value is 'low' | 'medium' | 'high' | 'xhigh' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value != null ? (value as Record<string, unknown>) : null
}

function getTurnContext(entry: unknown): TurnContext | null {
  const record = asRecord(entry)

  if (record == null || record.type !== 'turn_context') {
    return null
  }

  const payload = asRecord(record.payload)
  const collaborationMode = asRecord(payload?.collaboration_mode)
  const settings = asRecord(collaborationMode?.settings)

  if (payload == null) {
    return null
  }

  const model =
    (typeof payload.model === 'string' && payload.model) || (typeof settings?.model === 'string' ? settings.model : null)

  const effort =
    (typeof payload.effort === 'string' && payload.effort) ||
    (typeof settings?.reasoning_effort === 'string' ? settings.reasoning_effort : null)

  if (!model || !isReasoningEffort(effort)) {
    return null
  }

  return { model, effort }
}

function getTokenUsage(entry: unknown) {
  const record = asRecord(entry)

  if (record == null || typeof record.timestamp !== 'string') {
    return null
  }

  const payload = asRecord(record.payload)
  const info = asRecord(payload?.info)
  const lastTokenUsage = asRecord(info?.last_token_usage)

  if (payload?.type !== 'token_count' || typeof lastTokenUsage?.total_tokens !== 'number') {
    return null
  }

  return {
    timestamp: record.timestamp,
    totalTokens: lastTokenUsage.total_tokens,
  }
}

function addWeight(
  weightsByDate: HeavyLiftingWeightMap,
  dateKey: string,
  model: string,
  effort: string,
  totalTokens: number,
) {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return
  }

  const models = (weightsByDate[dateKey] ??= {})
  const efforts = (models[model] ??= {})
  efforts[effort] = (efforts[effort] ?? 0) + totalTokens
}

export async function collectHeavyLiftingTokenWeights(files: FileSignature[], timezone: string) {
  const weightsByDate: HeavyLiftingWeightMap = {}

  for (const file of files) {
    let activeContext: TurnContext | null = null
    const stream = createReadStream(file.absolutePath, { encoding: 'utf8' })
    const lines = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    })

    try {
      for await (const line of lines) {
        if (!line.trim()) {
          continue
        }

        let entry: unknown

        try {
          entry = JSON.parse(line)
        } catch {
          continue
        }

        const nextContext = getTurnContext(entry)

        if (nextContext) {
          activeContext = nextContext
          continue
        }

        if (!activeContext) {
          continue
        }

        const usage = getTokenUsage(entry)

        if (!usage) {
          continue
        }

        const dateKey = getDateKey(new Date(usage.timestamp), timezone)
        addWeight(weightsByDate, dateKey, activeContext.model, activeContext.effort, usage.totalTokens)
      }
    } finally {
      lines.close()
      stream.close()
    }
  }

  return weightsByDate
}

function distributeInteger(total: number, weights: number[]) {
  if (total <= 0 || weights.length === 0) {
    return weights.map(() => 0)
  }

  const weightTotal = weights.reduce((sum, value) => sum + value, 0)

  if (weightTotal <= 0) {
    return weights.map(() => 0)
  }

  const allocations = weights.map((weight, index) => {
    const exact = (total * weight) / weightTotal
    const floor = Math.floor(exact)
    return {
      index,
      floor,
      remainder: exact - floor,
    }
  })

  let remaining = total - allocations.reduce((sum, allocation) => sum + allocation.floor, 0)
  allocations.sort((left, right) => right.remainder - left.remainder || left.index - right.index)

  for (let index = 0; index < allocations.length && remaining > 0; index += 1) {
    allocations[index]!.floor += 1
    remaining -= 1
  }

  allocations.sort((left, right) => left.index - right.index)
  return allocations.map((allocation) => allocation.floor)
}

function splitModelTotals(model: ModelTotals, effortWeights: EffortTotals) {
  const efforts = Object.entries(effortWeights)
    .filter(([, totalTokens]) => Number.isFinite(totalTokens) && totalTokens > 0)
    .sort((left, right) => right[1] - left[1])

  if (efforts.length === 0) {
    return []
  }

  const weights = efforts.map(([, totalTokens]) => totalTokens)
  const inputTokens = distributeInteger(model.inputTokens, weights)
  const cachedInputTokens = distributeInteger(model.cachedInputTokens, weights)
  const outputTokens = distributeInteger(model.outputTokens, weights)
  const reasoningOutputTokens = distributeInteger(model.reasoningOutputTokens, weights)
  const totalTokens = distributeInteger(model.totalTokens, weights)
  const costUSD = weights.length === 0 ? [] : weights.map((weight) => model.costUSD * (weight / weights.reduce((sum, value) => sum + value, 0)))

  return efforts
    .map(([effort], index) => ({
      name: effort,
      totals: {
        inputTokens: inputTokens[index] ?? 0,
        cachedInputTokens: cachedInputTokens[index] ?? 0,
        outputTokens: outputTokens[index] ?? 0,
        reasoningOutputTokens: reasoningOutputTokens[index] ?? 0,
        totalTokens: totalTokens[index] ?? 0,
        costUSD: costUSD[index] ?? 0,
        isFallback: model.isFallback,
      } satisfies ModelTotals,
    }))
    .filter((entry) => entry.totals.totalTokens > 0)
}

export function buildHeavyLiftingModelBreakdown(
  models: Record<string, ModelTotals>,
  totalTokens: number,
  weightsByModel: Record<string, EffortTotals> = {},
): ModelBreakdown[] {
  const heavyLiftingModels: Record<string, ModelTotals> = {}

  for (const [modelName, totals] of Object.entries(models)) {
    const splitTotals = splitModelTotals(totals, weightsByModel[modelName] ?? {})

    if (splitTotals.length === 0) {
      heavyLiftingModels[modelName] = { ...totals }
      continue
    }

    let assignedTokens = 0
    for (const split of splitTotals) {
      assignedTokens += split.totals.totalTokens
      heavyLiftingModels[`${modelName}-${split.name}`] = split.totals
    }

    if (assignedTokens < totals.totalTokens) {
      const remainder = emptyModelTotals()
      remainder.inputTokens = Math.max(
        0,
        totals.inputTokens - splitTotals.reduce((sum, split) => sum + split.totals.inputTokens, 0),
      )
      remainder.cachedInputTokens = Math.max(
        0,
        totals.cachedInputTokens - splitTotals.reduce((sum, split) => sum + split.totals.cachedInputTokens, 0),
      )
      remainder.outputTokens = Math.max(
        0,
        totals.outputTokens - splitTotals.reduce((sum, split) => sum + split.totals.outputTokens, 0),
      )
      remainder.reasoningOutputTokens = Math.max(
        0,
        totals.reasoningOutputTokens - splitTotals.reduce((sum, split) => sum + split.totals.reasoningOutputTokens, 0),
      )
      remainder.totalTokens = Math.max(0, totals.totalTokens - assignedTokens)
      remainder.costUSD = Math.max(
        0,
        totals.costUSD - splitTotals.reduce((sum, split) => sum + split.totals.costUSD, 0),
      )
      remainder.isFallback = totals.isFallback

      if (remainder.totalTokens > 0) {
        heavyLiftingModels[modelName] = remainder
      }
    }
  }

  return toModelBreakdown(heavyLiftingModels, totalTokens)
}
