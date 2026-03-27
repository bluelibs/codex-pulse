import type { ModelBreakdown, PeriodTotals } from '@shared/usage'

import { estimateCacheSavings } from '@renderer/cacheSavings'
import { formatCurrency, formatPercent, formatTokens } from '@renderer/formatters'

type MixPanelProps = {
  models: ModelBreakdown[]
  period: PeriodTotals
  periodLabel: string
}

export function MixPanel({ models, period, periodLabel }: MixPanelProps) {
  const cacheRatio = period.inputTokens === 0 ? 0 : period.cachedInputTokens / period.inputTokens
  const outputTotal = period.outputTokens + period.reasoningOutputTokens
  const outputRatio = period.totalTokens === 0 ? 0 : outputTotal / period.totalTokens
  const inputRatio = period.totalTokens === 0 ? 0 : period.inputTokens / period.totalTokens
  const savings = estimateCacheSavings(models)
  const showUnavailableNote = period.cachedInputTokens > 0 && !savings.hasEstimate

  const estimatedSavedLabel = savings.hasEstimate
    ? formatCurrency(savings.estimatedSavingsUSD)
    : period.cachedInputTokens === 0
      ? 'No savings yet'
      : 'Unavailable'

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
          <span>Estimated saved</span>
          <strong>{estimatedSavedLabel}</strong>
        </article>
        <article>
          <span>Saved by cache</span>
          <strong>{formatTokens(period.cachedInputTokens)}</strong>
        </article>
      </div>

      {showUnavailableNote ? (
        <p className="mix-footnote">Estimated savings are unavailable for the models in this period.</p>
      ) : null}

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
