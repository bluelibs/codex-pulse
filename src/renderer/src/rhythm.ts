import type { DateGroup, TokenTotals, TrendPoint } from '@shared/usage'

export type PeriodFilterKey = 'week' | 'today' | 'month' | 'lastMonth' | 'year'

const DAY_MS = 24 * 60 * 60 * 1000

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
})

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function shiftDateKey(dateKey: string, dayDelta: number) {
  return toDateKey(new Date(parseDateKey(dateKey).getTime() + dayDelta * DAY_MS))
}

export function shiftMonthKey(dateKey: string, monthDelta: number) {
  const [year, month] = dateKey.split('-').map(Number)
  return toDateKey(new Date(Date.UTC(year, month - 1 + monthDelta, 1)))
}

export function startOfIsoWeek(dateKey: string) {
  const weekday = parseDateKey(dateKey).getUTCDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  return shiftDateKey(dateKey, offset)
}

export function startOfMonth(dateKey: string) {
  const [year, month] = dateKey.split('-').map(Number)
  return toDateKey(new Date(Date.UTC(year, month - 1, 1)))
}

export function startOfYear(dateKey: string) {
  const [year] = dateKey.split('-').map(Number)
  return toDateKey(new Date(Date.UTC(year, 0, 1)))
}

export function endOfMonth(dateKey: string) {
  return shiftDateKey(shiftMonthKey(dateKey, 1), -1)
}

function emptyTokenTotals(): TokenTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
  }
}

function addPeriodTotals(target: TokenTotals, source: DateGroup['period']) {
  target.inputTokens += source.inputTokens
  target.cachedInputTokens += source.cachedInputTokens
  target.outputTokens += source.outputTokens
  target.reasoningOutputTokens += source.reasoningOutputTokens
  target.totalTokens += source.totalTokens
  target.costUSD += source.costUSD
}

function formatMonthLabel(dateKey: string) {
  return monthLabelFormatter.format(parseDateKey(dateKey))
}

function formatWeekRangeLabel(startKey: string, endKey: string) {
  const startDay = Number(startKey.slice(-2))
  const endDay = Number(endKey.slice(-2))
  const startMonthLabel = formatMonthLabel(startKey)
  const endMonthLabel = formatMonthLabel(endKey)

  if (startKey === endKey) {
    return `${startMonthLabel} ${startDay}`
  }

  if (startKey.slice(0, 7) === endKey.slice(0, 7)) {
    return `${startMonthLabel} ${startDay}-${endDay}`
  }

  return `${startMonthLabel} ${startDay}-${endMonthLabel} ${endDay}`
}

function toDailyTrend(groups: DateGroup[]): TrendPoint[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    inputTokens: group.period.inputTokens,
    cachedInputTokens: group.period.cachedInputTokens,
    outputTokens: group.period.outputTokens,
    reasoningOutputTokens: group.period.reasoningOutputTokens,
    totalTokens: group.period.totalTokens,
    costUSD: group.period.costUSD,
  }))
}

function toWeeklyTrend(groups: DateGroup[]): TrendPoint[] {
  const buckets = new Map<
    string,
    {
      startKey: string
      endKey: string
      totals: TokenTotals
    }
  >()

  for (const group of groups) {
    const bucketKey = startOfIsoWeek(group.id)
    const current = buckets.get(bucketKey) ?? {
      startKey: group.id,
      endKey: group.id,
      totals: emptyTokenTotals(),
    }

    if (group.id < current.startKey) {
      current.startKey = group.id
    }

    if (group.id > current.endKey) {
      current.endKey = group.id
    }

    addPeriodTotals(current.totals, group.period)
    buckets.set(bucketKey, current)
  }

  return [...buckets.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([bucketKey, bucket]) => ({
      id: bucketKey,
      label: formatWeekRangeLabel(bucket.startKey, bucket.endKey),
      ...bucket.totals,
    }))
}

function toMonthlyTrend(groups: DateGroup[]): TrendPoint[] {
  const buckets = new Map<
    string,
    {
      totals: TokenTotals
    }
  >()

  for (const group of groups) {
    const bucketKey = startOfMonth(group.id)
    const current = buckets.get(bucketKey) ?? {
      totals: emptyTokenTotals(),
    }

    addPeriodTotals(current.totals, group.period)
    buckets.set(bucketKey, current)
  }

  return [...buckets.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([bucketKey, bucket]) => ({
      id: bucketKey,
      label: formatMonthLabel(bucketKey),
      ...bucket.totals,
    }))
}

export function buildRhythmTrend(groups: DateGroup[], filter: PeriodFilterKey) {
  switch (filter) {
    case 'month':
    case 'lastMonth':
      return toWeeklyTrend(groups)
    case 'year':
      return toMonthlyTrend(groups)
    case 'today':
    case 'week':
      return toDailyTrend(groups)
  }
}
