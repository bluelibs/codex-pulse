import type { PeriodTotals } from '@shared/usage'

import { formatCurrency, formatPercent, formatTokens } from '@renderer/formatters'

type MetricCardProps = {
  period: PeriodTotals
  tone: 'ink' | 'paper'
}

export function MetricCard({ period, tone }: MetricCardProps) {
  const toneClassName = tone === 'ink' ? 'metric-card metric-card-ink' : 'metric-card metric-card-paper'
  const outputTotal = period.outputTokens + period.reasoningOutputTokens
  const cacheRatio = period.inputTokens === 0 ? 0 : period.cachedInputTokens / period.inputTokens
  const rangeLabel =
    period.rangeStart === period.rangeEnd ? 'Single-day cut' : `${period.rangeStart} to ${period.rangeEnd}`

  return (
    <article className={toneClassName}>
      <div className="metric-card-header">
        <p>{period.label}</p>
        <span>{rangeLabel}</span>
      </div>

      <div className="metric-main">
        <strong>{formatTokens(period.totalTokens)}</strong>
        <span>tokens</span>
      </div>

      <div className="metric-cost">{formatCurrency(period.costUSD)}</div>

      <div className="metric-tags">
        <span className="metric-tag">{formatPercent(cacheRatio)} cache reuse</span>
        <span className="metric-tag">{formatTokens(outputTotal)} returned</span>
      </div>

      <dl className="metric-breakdown">
        <div>
          <dt>Input</dt>
          <dd>{formatTokens(period.inputTokens)}</dd>
        </div>
        <div>
          <dt>Cached</dt>
          <dd>{formatTokens(period.cachedInputTokens)}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{formatTokens(outputTotal)}</dd>
        </div>
      </dl>
    </article>
  )
}

