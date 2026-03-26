import type { TrendPoint } from '@shared/usage'

import { formatCurrency, formatTokens } from '@renderer/formatters'

type TrendPanelProps = {
  trend: TrendPoint[]
  title: string
  periodLabel: string
}

export function TrendPanel({ trend, title, periodLabel }: TrendPanelProps) {
  const highest = trend.reduce((current, point) => Math.max(current, point.totalTokens), 1)
  const strongest = trend.reduce<TrendPoint | null>((current, point) => {
    if (current === null || point.totalTokens > current.totalTokens) {
      return point
    }

    return current
  }, null)
  const columns = trend.map((point) => ({
    point,
    height: Math.max((point.totalTokens / highest) * 140, 16),
  }))

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cadence</p>
          <h2>{title}</h2>
        </div>
        <span>{periodLabel}</span>
      </div>

      <div className="trend-grid">
        {columns.map(({ point, height }) => (
          <article key={point.id} className="trend-column">
            <div className="trend-bar" style={{ height: `${height}px` }} title={`${point.label}: ${formatTokens(point.totalTokens)}`} />
            <span className="trend-column-label">{point.label}</span>
            <strong>{formatTokens(point.totalTokens)}</strong>
            <span>{formatCurrency(point.costUSD)}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
