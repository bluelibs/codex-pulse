import type { ModelBreakdown } from '@shared/usage'

import { formatPercent, formatTokens } from '@renderer/formatters'

type ModelPanelProps = {
  models: ModelBreakdown[]
}

export function ModelPanel({ models }: ModelPanelProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Models</p>
          <h2>Who did the heavy lifting</h2>
        </div>
        <span>{models.length} active</span>
      </div>

      <div className="model-list">
        {models.map((model, index) => (
          <article key={model.name} className="model-row">
            <div className="model-row-main">
              <span className="model-rank">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{model.name}</strong>
                <p>{formatTokens(model.totalTokens)} tokens</p>
              </div>
            </div>
            <div className="model-row-share">
              {model.isFallback ? <span className="model-fallback">fallback</span> : null}
              <span>{formatPercent(model.tokenShare)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

