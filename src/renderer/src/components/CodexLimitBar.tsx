import type { CSSProperties } from 'react'

import type { CodexWeeklyLimit } from '@shared/usage'

import { formatMonthDayTime } from '@renderer/formatters'

type CodexLimitBarProps = {
  limit: CodexWeeklyLimit | null
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  if (value <= 0) {
    return 0
  }

  if (value >= 100) {
    return 100
  }

  return value
}

export function CodexLimitBar({ limit }: CodexLimitBarProps) {
  if (limit == null) {
    return (
      <section className="limit-banner limit-banner-muted" aria-label="Codex weekly limit unavailable">
        <p className="limit-inline-copy">Codex weekly limit will appear after a fresh rate-limit event lands.</p>
      </section>
    )
  }

  const usedPercent = clampPercent(limit.usedPercent)
  const remainingPercent = clampPercent(limit.remainingPercent)
  const barStyle = {
    '--limit-used-percent': `${usedPercent}%`,
  } as CSSProperties

  return (
    <section className="limit-banner" aria-label="Codex weekly limit">
      <div className="limit-banner-line">
        <span className="limit-label">Codex weekly limit</span>

        <div
          aria-label={`Codex weekly limit ${Math.round(usedPercent)} percent used`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(usedPercent)}
          aria-valuetext={`${Math.round(remainingPercent)}% left`}
          className="limit-track"
          role="progressbar"
          style={barStyle}
        >
          <span className="limit-track-fill" />
        </div>

        <strong className="limit-value">{Math.round(remainingPercent)}% left</strong>
        <span className="limit-meta">Resets {formatMonthDayTime(limit.resetsAt)}</span>
        <span className="limit-plan-pill">{limit.planType ?? 'codex'}</span>
      </div>
    </section>
  )
}
