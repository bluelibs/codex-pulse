import type { CSSProperties } from 'react'

import type { PeriodTotals } from '@shared/usage'

import { formatCurrency, formatPercent, formatTokens } from '@renderer/formatters'

type HeroDialProps = {
  today: PeriodTotals
  focusPeriod: PeriodTotals
  filterLabel: string
}

const FULL_CIRCLE_DEGREES = 360

function clampDialShare(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  if (value >= 1) {
    return 1
  }

  return value
}

export function HeroDial({ today, focusPeriod, filterLabel }: HeroDialProps) {
  const todayShare = focusPeriod.totalTokens === 0 ? 0 : today.totalTokens / focusPeriod.totalTokens
  const cacheShare = today.inputTokens === 0 ? 0 : today.cachedInputTokens / today.inputTokens
  const dialStyle = {
    '--cache-angle': `${clampDialShare(cacheShare) * FULL_CIRCLE_DEGREES}deg`,
  } as CSSProperties
  const heading =
    filterLabel === 'Today'
      ? 'Today at a glance'
      : `Today’s share of ${filterLabel.toLowerCase()}`

  return (
    <aside className="signal-card" style={dialStyle}>
      <div className="signal-card-header">
        <h2>{heading}</h2>
      </div>

      <div className="signal-dial">
        <div className="signal-dial-core">
          <span>today volume</span>
          <strong>{formatTokens(today.totalTokens)}</strong>
          <p>{formatPercent(todayShare)} of {filterLabel.toLowerCase()}</p>
        </div>
      </div>

      <div className="signal-dial-key" aria-label="Dial legend">
        <span className="signal-dial-key-item">
          <span className="signal-swatch signal-swatch-secondary" aria-hidden="true" />
          Today cache reuse
        </span>
      </div>

      <dl className="signal-metrics">
        <div>
          <dt>Period cost</dt>
          <dd>{formatCurrency(focusPeriod.costUSD)}</dd>
        </div>
        <div>
          <dt>Today share</dt>
          <dd>{formatPercent(todayShare)}</dd>
        </div>
        <div>
          <dt>Today cache</dt>
          <dd>{formatPercent(cacheShare)}</dd>
        </div>
      </dl>
    </aside>
  )
}
