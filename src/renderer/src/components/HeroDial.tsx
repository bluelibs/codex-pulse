import type { CSSProperties } from 'react'

import type { ModelBreakdown, PeriodTotals } from '@shared/usage'

import { formatCurrency, formatPercent, formatTokens } from '@renderer/formatters'

type HeroDialProps = {
  today: PeriodTotals
  week: PeriodTotals
  leadingModel?: ModelBreakdown
}

export function HeroDial({ today, week, leadingModel }: HeroDialProps) {
  const todayShare = week.totalTokens === 0 ? 0 : today.totalTokens / week.totalTokens
  const cacheShare = today.inputTokens === 0 ? 0 : today.cachedInputTokens / today.inputTokens
  const dialStyle = {
    '--signal-angle': `${Math.max(todayShare * 320, 28)}deg`,
    '--cache-angle': `${Math.max(cacheShare * 320, 22)}deg`,
  } as CSSProperties

  return (
    <aside className="signal-card" style={dialStyle}>
      <div className="signal-card-header">
        <div>
          <p className="eyebrow">Live signal</p>
          <h2>Today&apos;s share of the week</h2>
        </div>
        <span>{leadingModel?.name ?? 'Awaiting model'}</span>
      </div>

      <div className="signal-dial">
        <div className="signal-dial-core">
          <span>today load</span>
          <strong>{formatTokens(today.totalTokens)}</strong>
          <p>{formatPercent(todayShare)} of week-to-date</p>
        </div>
      </div>

      <dl className="signal-metrics">
        <div>
          <dt>Today cost</dt>
          <dd>{formatCurrency(today.costUSD)}</dd>
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

