import React, { useMemo } from 'react'

function CheckIcon() {
  return (
    <svg className="ai-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

function SpinnerIcon() {
  return <div className="ai-step-spinner" aria-hidden="true" />
}

export default function LoadingSteps({
  title = 'Working on it…',
  subtitle = '',
  steps = [],
  activeIndex = 0,
  completedCount = 0,
}) {
  const progressPct = useMemo(() => {
    const total = Math.max(1, steps.length)
    const done = Math.min(total, Math.max(0, completedCount))
    return Math.round((done / total) * 100)
  }, [steps.length, completedCount])

  return (
    <div className="ai-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="ai-loading-panel">
        <div className="ai-loading-top">
          <div className="ai-loading-title">{title}</div>
          {subtitle ? <div className="ai-loading-subtitle">{subtitle}</div> : null}
        </div>

        <div className="ai-progress">
          <div className="ai-progress-track" aria-hidden="true">
            <div className="ai-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="ai-progress-meta">
            <span>Processing</span>
            <span>{progressPct}%</span>
          </div>
        </div>

        <div className="ai-steps" aria-label="Analysis steps">
          {steps.map((s, i) => {
            const isDone = i < completedCount
            const isActive = i === activeIndex && !isDone
            return (
              <div
                key={s.key || i}
                className={[
                  'ai-step',
                  isDone ? 'done' : '',
                  isActive ? 'active' : '',
                ].join(' ')}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="ai-step-left">
                  <div className="ai-step-indicator">
                    {isDone ? <CheckIcon /> : isActive ? <SpinnerIcon /> : <span className="ai-step-dot" />}
                  </div>
                  <div className="ai-step-text">
                    <span className="ai-step-icon" aria-hidden="true">{s.icon}</span>
                    <span className="ai-step-label">{s.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
