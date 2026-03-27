import { readFile } from 'node:fs/promises'

import type { CodexWeeklyLimit } from '@shared/usage'

import type { FileSignature } from './fingerprint'

const WEEKLY_WINDOW_MINUTES = 7 * 24 * 60
const RECENT_FILE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000

type TokenCountEvent = {
  timestamp?: string
  type?: string
  payload?: {
    type?: string
    rate_limits?: {
      limit_id?: string | null
      plan_type?: string | null
      secondary?: {
        used_percent?: number
        window_minutes?: number
        resets_at?: number
        resets_in_seconds?: number
      } | null
    } | null
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (value <= 0) {
    return 0
  }

  if (value >= 100) {
    return 100
  }

  return value
}

function parseTimestamp(value: string | undefined, fallbackMs: number) {
  const parsed = value == null ? Number.NaN : Date.parse(value)

  if (Number.isNaN(parsed)) {
    return {
      iso: new Date(fallbackMs).toISOString(),
      ms: fallbackMs,
    }
  }

  return {
    iso: new Date(parsed).toISOString(),
    ms: parsed,
  }
}

function resolveResetIso(eventTimestampMs: number, resetsAt?: number, resetsInSeconds?: number) {
  if (typeof resetsAt === 'number' && Number.isFinite(resetsAt)) {
    return new Date(resetsAt * 1000).toISOString()
  }

  if (typeof resetsInSeconds === 'number' && Number.isFinite(resetsInSeconds)) {
    return new Date(eventTimestampMs + resetsInSeconds * 1000).toISOString()
  }

  return null
}

function toWeeklyLimit(event: TokenCountEvent, fallbackMs: number): CodexWeeklyLimit | null {
  if (event.type !== 'event_msg' || event.payload?.type !== 'token_count') {
    return null
  }

  const rateLimits = event.payload.rate_limits
  const secondary = rateLimits?.secondary

  if (secondary == null || secondary.window_minutes !== WEEKLY_WINDOW_MINUTES) {
    return null
  }

  const { iso: sampledAt, ms: sampledAtMs } = parseTimestamp(event.timestamp, fallbackMs)
  const resetsAt = resolveResetIso(sampledAtMs, secondary.resets_at, secondary.resets_in_seconds)

  if (resetsAt == null) {
    return null
  }

  const usedPercent = clampPercent(secondary.used_percent ?? 0)

  return {
    limitId: rateLimits?.limit_id ?? null,
    planType: rateLimits?.plan_type ?? null,
    sampledAt,
    resetsAt,
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
  }
}

export function expireCodexWeeklyLimit(limit: CodexWeeklyLimit | null, now = new Date()) {
  if (limit == null) {
    return null
  }

  const resetMs = Date.parse(limit.resetsAt)

  if (Number.isNaN(resetMs) || resetMs <= now.getTime()) {
    return null
  }

  return limit
}

export function selectCurrentCodexWeeklyLimit(
  candidate: CodexWeeklyLimit | null,
  cached: CodexWeeklyLimit | null,
  now = new Date(),
) {
  const freshCandidate = expireCodexWeeklyLimit(candidate, now)
  const freshCached = expireCodexWeeklyLimit(cached, now)

  if (freshCandidate == null) {
    return freshCached
  }

  if (freshCached == null) {
    return freshCandidate
  }

  return Date.parse(freshCandidate.sampledAt) >= Date.parse(freshCached.sampledAt) ? freshCandidate : freshCached
}

export async function extractCodexWeeklyLimit(files: FileSignature[], now = new Date()) {
  const thresholdMs = now.getTime() - RECENT_FILE_WINDOW_MS
  let latest: CodexWeeklyLimit | null = null

  for (const file of files) {
    if (file.mtimeMs < thresholdMs) {
      continue
    }

    let contents: string

    try {
      contents = await readFile(file.absolutePath, 'utf8')
    } catch {
      continue
    }

    const lines = contents.split('\n')

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      let parsed: TokenCountEvent

      try {
        parsed = JSON.parse(line) as TokenCountEvent
      } catch {
        continue
      }

      const candidate = toWeeklyLimit(parsed, file.mtimeMs)

      if (candidate == null) {
        continue
      }

      if (latest == null || Date.parse(candidate.sampledAt) > Date.parse(latest.sampledAt)) {
        latest = candidate
      }
    }
  }

  return expireCodexWeeklyLimit(latest, now)
}
