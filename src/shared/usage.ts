export type TokenTotals = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  costUSD: number
}

export type ModelTotals = Omit<TokenTotals, 'costUSD'> & {
  isFallback: boolean
}

export type PeriodTotals = TokenTotals & {
  label: string
  rangeStart: string
  rangeEnd: string
}

export type TrendPoint = TokenTotals & {
  id: string
  label: string
}

export type ModelBreakdown = ModelTotals & {
  name: string
  tokenShare: number
}

export type DateGroup = {
  id: string
  label: string
  period: PeriodTotals
  models: ModelBreakdown[]
  heavyLiftingModels: ModelBreakdown[]
}

export type DashboardSnapshot = {
  generatedAt: string
  timezone: string
  today: PeriodTotals
  week: PeriodTotals
  trend: TrendPoint[]
  dateGroups: DateGroup[]
  models: ModelBreakdown[]
  relevantFileCount: number
  mirrorBuiltAt: string
}

export type DashboardResponse = {
  snapshot: DashboardSnapshot | null
  isRefreshing: boolean
  stale: boolean
  error?: string
}

export type DashboardListener = (response: DashboardResponse) => void

export type CodexPulseApi = {
  getCachedDashboard: () => Promise<DashboardResponse>
  loadDashboard: () => Promise<DashboardResponse>
  refreshDashboard: () => Promise<DashboardResponse>
  clearCacheAndReload: () => Promise<DashboardResponse>
  onDashboardUpdated: (listener: DashboardListener) => () => void
}
