import type { PeriodTotals } from '@shared/usage'

import { formatPercent, formatTokens } from '@renderer/formatters'

type MixPanelProps = {
  period: PeriodTotals
  periodLabel: string
}

export function MixPanel({ period, periodLabel }: MixPanelProps) {
  const cacheRatio = period.inputTokens === 0 ? 0 : period.cachedInputTokens / period.inputTokens
  const outputTotal = period.outputTokens + period.reasoningOutputTokens
  const outputRatio = period.totalTokens === 0 ? 0 : outputTotal / period.totalTokens
  const inputRatio = period.totalTokens === 0 ? 0 : period.inputTokens / period.totalTokens

  return (
    <section className="panel mix-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Efficiency</p>
          <h2>Token mix</h2>
        </div>
        <span>{periodLabel}</span>
      </div>

      <div className="mix-ring">
        <div className="mix-ring-core">
          <strong>{formatPercent(cacheRatio)}</strong>
          <span>cached reuse</span>
        </div>
      </div>

      <div className="mix-summary">
        <article>
          <span>Saved by cache</span>
          <strong>{formatTokens(period.cachedInputTokens)}</strong>
        </article>
        <article>
          <span>Output</span>
          <strong>{formatTokens(outputTotal)}</strong>
        </article>
      </div>

      <dl className="mix-rows">
        <div>
          <dt>Input heft</dt>
          <dd>{formatTokens(period.inputTokens)}</dd>
          <div className="mix-rail"><span style={{ width: `${Math.max(inputRatio * 100, 8)}%` }} /></div>
        </div>
        <div>
          <dt>Output burst</dt>
          <dd>{formatTokens(outputTotal)}</dd>
          <div className="mix-rail mix-rail-dark"><span style={{ width: `${Math.max(outputRatio * 100, 8)}%` }} /></div>
        </div>
      </dl>
    </section>
  )
}
