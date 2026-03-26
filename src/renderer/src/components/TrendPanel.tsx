import type { TrendPoint } from '@shared/usage'

import { formatCurrency, formatTokens } from '@renderer/formatters'

type TrendPanelProps = {
  trend: TrendPoint[]
}

export function TrendPanel({ trend }: TrendPanelProps) {
  const summary = trend.reduce<{
    highest: number
    strongest: TrendPoint | null
    columns: Array<{ point: TrendPoint; height: number }>
  }>(
    (acc, point) => {
      const totalTokens = point.totalTokens

      if (acc.strongest === null || totalTokens > acc.strongest.totalTokens) {
        acc.strongest = point
      }

      if (totalTokens > acc.highest) {
        acc.highest = totalTokens
      }

      acc.columns.push({
        point,
        height: Math.max((totalTokens / acc.highest) * 140, 16),
      })

      return acc
    },
    {
      highest: 1,
      strongest: null,
      columns: [],
    },
  )

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cadence</p>
          <h2>Week rhythm</h2>
        </div>
        <span>{summary.strongest ? `${summary.strongest.label} peaks` : 'No sessions yet'}</span>
      </div>

      <div className="trend-grid">
        {summary.columns.map(({ point, height }) => (
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
