import type { CSSProperties } from 'react'

import type { ModelBreakdown, PeriodTotals } from '@shared/usage'

import { formatCurrency, formatPercent, formatTokens } from '@renderer/formatters'

type HeroDialProps = {
  today: PeriodTotals
  focusPeriod: PeriodTotals
  leadingModel?: ModelBreakdown
  filterLabel: string
}

export function HeroDial({ today, focusPeriod, leadingModel, filterLabel }: HeroDialProps) {
  const todayShare = focusPeriod.totalTokens === 0 ? 0 : today.totalTokens / focusPeriod.totalTokens
  const cacheShare = today.inputTokens === 0 ? 0 : today.cachedInputTokens / today.inputTokens
  const dialStyle = {
    '--signal-angle': `${Math.max(todayShare * 320, 28)}deg`,
    '--cache-angle': `${Math.max(cacheShare * 320, 22)}deg`,
  } as CSSProperties
  const heading =
    filterLabel === 'Today'
      ? 'Today at a glance'
      : `Today’s share of ${filterLabel.toLowerCase()}`

  return (
    <aside className="signal-card" style={dialStyle}>
      <div className="signal-card-header">
        <div>
          <h2>{heading}</h2>
        </div>
        <span className="signal-model-badge">{leadingModel?.name ?? 'Awaiting model'}</span>
      </div>

      <div className="signal-dial">
        <div className="signal-dial-core">
          <span>today volume</span>
          <strong>{formatTokens(today.totalTokens)}</strong>
          <p>{formatPercent(todayShare)} of {filterLabel.toLowerCase()}</p>
        </div>
      </div>

      <dl className="signal-metrics">
        <div>
          <dt>Period cost</dt>
          <dd>{formatCurrency(focusPeriod.costUSD)}</dd>
        </div>
        <div>
          <dt>Cache reuse</dt>
          <dd>{formatPercent(cacheShare)}</dd>
        </div>
        <div>
          <dt>Lead model</dt>
          <dd>{leadingModel ? formatPercent(leadingModel.tokenShare) : '0%'}</dd>
        </div>
      </dl>
    </aside>
  )
}
