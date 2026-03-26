const CALENDAR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function getCalendarFormatter(timezone: string) {
  const cacheKey = timezone
  const cached = CALENDAR_FORMATTER_CACHE.get(cacheKey)

  if (cached) {
    return cached
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  CALENDAR_FORMATTER_CACHE.set(cacheKey, formatter)
  return formatter
}

export function getDateKey(date: Date, timezone: string) {
  const parts = getCalendarFormatter(timezone).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

export function shiftDateKey(dateKey: string, dayDelta: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + dayDelta))

  return shifted.toISOString().slice(0, 10)
}

export function startOfIsoWeek(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const source = new Date(Date.UTC(year, month - 1, day))
  const weekday = source.getUTCDay()
  const offset = weekday === 0 ? -6 : 1 - weekday

  return shiftDateKey(dateKey, offset)
}

export function toCliDate(dateKey: string) {
  return dateKey.split('-').join('')
}

export function toUtcMs(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00.000Z`)
}
