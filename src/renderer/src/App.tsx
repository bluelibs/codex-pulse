import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from 'react'

import type { CodexPulseApi, DashboardResponse } from '@shared/usage'

import { HeroDial } from './components/HeroDial'
import { MetricCard } from './components/MetricCard'
import { MixPanel } from './components/MixPanel'
import { ModelPanel } from './components/ModelPanel'
import { TrendPanel } from './components/TrendPanel'
import { formatDateTime, formatInteger, formatPercent } from './formatters'
import { mockDashboardResponse } from './mockDashboard'

const initialState: DashboardResponse = {
  snapshot: null,
  isRefreshing: true,
  stale: false,
}

const missingBridgeResponse: DashboardResponse = {
  snapshot: null,
  isRefreshing: false,
  stale: true,
  error: 'The Electron preload bridge did not load, so the dashboard cannot talk to the main process.',
}

const missingRefreshResponse: DashboardResponse = {
  snapshot: null,
  isRefreshing: false,
  stale: true,
  error: 'Refresh is unavailable because the Electron preload bridge is missing.',
}

function getCodexPulseApi(): CodexPulseApi | undefined {
  return (window as Window & { codexPulse?: CodexPulseApi }).codexPulse
}

function isElectronRenderer() {
  return window.navigator.userAgent.includes('Electron')
}

export function App() {
  const [response, setResponse] = useState<DashboardResponse>(initialState)
  const deferredSnapshot = useDeferredValue(response.snapshot)

  const applyResponse = useEffectEvent((nextResponse: DashboardResponse) => {
    startTransition(() => {
      setResponse(nextResponse)
    })
  })

  useEffect(() => {
    const api = getCodexPulseApi()

    if (!api) {
      if (!isElectronRenderer()) {
        setResponse(mockDashboardResponse)
        return
      }

      setResponse(missingBridgeResponse)
      return
    }

    const unsubscribe = api.onDashboardUpdated(applyResponse)

    void api.loadDashboard().then((nextResponse) => {
      applyResponse(nextResponse)
    })

    return unsubscribe
  }, [])

  async function handleRefresh() {
    const api = getCodexPulseApi()

    if (!api) {
      if (!isElectronRenderer()) {
        applyResponse(mockDashboardResponse)
        return
      }

      applyResponse(missingRefreshResponse)
      return
    }

    startTransition(() => {
      setResponse((current) => ({
        ...current,
        isRefreshing: true,
      }))
    })

    const refreshed = await api.refreshDashboard()
    applyResponse(refreshed)
  }

  if (!deferredSnapshot) {
    const loadingLabel = response.isRefreshing ? 'Syncing usage snapshot' : 'Waiting for dashboard data'

    return (
      <main className="app-shell app-shell-loading">
        <section className="loading-stage" aria-busy="true" aria-live="polite">
          <div className="hero-copy-block">
            <p className="eyebrow">Codex Pulse</p>
            <span className="hero-kicker">{loadingLabel}</span>
            <h1>Pulling your usage telemetry into focus.</h1>
            <p className="hero-copy">
              {response.error ?? 'Warming the cache, scanning recent activity, and composing your launch snapshot.'}
            </p>

            <div className="hero-ribbon">
              <span className="status-pill status-pill-loading">
                <span className="status-dot" aria-hidden="true" />
                {response.isRefreshing ? 'Loading now' : 'Waiting for response'}
              </span>
              <span>Renderer is alive and listening</span>
            </div>
          </div>

          <div className="loading-card" aria-label="Loading dashboard preview" role="status">
            <div className="loading-card-head">
              <span className="loading-card-label">Preparing dashboard</span>
              <span className="loading-card-step">{response.isRefreshing ? 'Fetching latest usage' : 'Standing by'}</span>
            </div>

            <div className="loading-meter" aria-hidden="true">
              <span />
            </div>

            <p className="loading-copy">
              {response.isRefreshing
                ? 'One quick pass over recent sessions, then the dashboard will snap into place.'
                : 'The snapshot is taking a beat to arrive, but the shell is already awake.'}
            </p>

            <button className="refresh-button refresh-button-soft" onClick={handleRefresh} type="button">
              {response.isRefreshing ? 'Refreshing...' : 'Try again'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  const strongestDay =
    deferredSnapshot.trend.length === 0
      ? null
      : deferredSnapshot.trend.reduce((current, point) =>
          point.totalTokens > current.totalTokens ? point : current,
        )
  const cacheRatio =
    deferredSnapshot.week.inputTokens === 0
      ? 0
      : deferredSnapshot.week.cachedInputTokens / deferredSnapshot.week.inputTokens
  const leadModel = deferredSnapshot.models[0]

  return (
    <main className="app-shell">
      <div className="app-grain" />
      <div className="orb orb-left" />
      <div className="orb orb-right" />
      <div className="orb orb-bottom" />

      <header className="hero">
        <div className="hero-copy-block reveal reveal-delay-1">
          <p className="eyebrow">Codex Pulse</p>
          <span className="hero-kicker">Usage ledger for the compulsively curious</span>
          <h1>Today and this week, without the terminal detour.</h1>
          <p className="hero-copy">
            Cached at launch, refreshed in the background, and tuned for the tiny-mac-dashboard life.
          </p>

          <div className="hero-ribbon">
            <span className={response.stale ? 'status-pill status-pill-warn' : 'status-pill'}>
              {response.stale ? 'Showing cached view' : 'Fresh snapshot'}
            </span>
            <span>{formatInteger(deferredSnapshot.relevantFileCount)} session files considered</span>
            <span>Updated {formatDateTime(deferredSnapshot.generatedAt)}</span>
          </div>

          <div className="hero-note-grid">
            <article className="hero-note">
              <span>Peak day</span>
              <strong>{strongestDay?.label ?? 'No activity yet'}</strong>
              <p>
                {strongestDay ? `${formatInteger(strongestDay.totalTokens)} tokens moved` : 'Once usage lands, the rhythm shows up here'}
              </p>
            </article>
            <article className="hero-note">
              <span>Week cache reuse</span>
              <strong>{formatPercent(cacheRatio)}</strong>
              <p>Prompt leftovers are finally earning rent</p>
            </article>
            <article className="hero-note">
              <span>Primary model</span>
              <strong>{leadModel?.name ?? 'Unknown'}</strong>
              <p>{leadModel ? `${formatPercent(leadModel.tokenShare)} of token volume` : 'Waiting for a model footprint'}</p>
            </article>
          </div>
        </div>

        <div className="hero-actions reveal reveal-delay-2">
          <button className="refresh-button" onClick={handleRefresh} type="button">
            {response.isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <HeroDial today={deferredSnapshot.today} week={deferredSnapshot.week} leadingModel={leadModel} />
        </div>
      </header>

      <section className="metric-grid reveal reveal-delay-3">
        <MetricCard period={deferredSnapshot.today} tone="ink" />
        <MetricCard period={deferredSnapshot.week} tone="paper" />
      </section>

      <section className="panel-grid reveal reveal-delay-4">
        <TrendPanel trend={deferredSnapshot.trend} />
        <MixPanel week={deferredSnapshot.week} />
      </section>

      <div className="model-panel-wrap reveal reveal-delay-5">
        <ModelPanel models={deferredSnapshot.models} />
      </div>
    </main>
  )
}
