import type { PeriodTotals } from '@shared/usage'

import { formatPercent, formatTokens } from '@renderer/formatters'

type MixPanelProps = {
  week: PeriodTotals
}

export function MixPanel({ week }: MixPanelProps) {
  const cacheRatio = week.inputTokens === 0 ? 0 : week.cachedInputTokens / week.inputTokens
  const outputTotal = week.outputTokens + week.reasoningOutputTokens
  const outputRatio = week.totalTokens === 0 ? 0 : outputTotal / week.totalTokens
  const inputRatio = week.totalTokens === 0 ? 0 : week.inputTokens / week.totalTokens

  return (
    <section className="panel mix-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Efficiency</p>
          <h2>Token mix</h2>
        </div>
        <span>Week to date</span>
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
          <strong>{formatTokens(week.cachedInputTokens)}</strong>
        </article>
        <article>
          <span>Response load</span>
          <strong>{formatTokens(outputTotal)}</strong>
        </article>
      </div>

      <dl className="mix-rows">
        <div>
          <dt>Input heft</dt>
          <dd>{formatTokens(week.inputTokens)}</dd>
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

