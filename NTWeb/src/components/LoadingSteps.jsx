import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const THINKING_LINE_INTERVAL_MS = 2000

/** Avoid "Warming up…" + appended … when `still` adds an ellipsis span. */
function withoutTrailingEllipsis(s) {
  const t = String(s || '')
  const stripped = t.replace(/(?:\u2026|\.{2,})\s*$/u, '').trimEnd()
  return stripped.length ? stripped : t
}

/** Throttles rotating status lines so each stays visible ~2s, with enter animation. */
function StepThinkingDetail({ detail, isActive, still }) {
  const [displayed, setDisplayed] = useState(() => detail || '')
  const [motion, setMotion] = useState(0)
  const queueRef = useRef([])
  const timeoutRef = useRef(null)
  const lastSwitchRef = useRef(0)
  const displayedRef = useRef(detail || '')

  const showNext = useCallback((text) => {
    displayedRef.current = text
    setDisplayed(text)
    setMotion((m) => m + 1)
    lastSwitchRef.current = Date.now()
  }, [])

  const drainQueueAfterDelay = useCallback(() => {
    if (timeoutRef.current != null) return
    const run = () => {
      timeoutRef.current = null
      if (queueRef.current.length === 0) return
      const next = queueRef.current.shift()
      if (next != null && next !== displayedRef.current) {
        showNext(next)
      }
      if (queueRef.current.length > 0) {
        const elapsed = Date.now() - lastSwitchRef.current
        const wait = Math.max(0, THINKING_LINE_INTERVAL_MS - elapsed)
        timeoutRef.current = setTimeout(run, wait)
      }
    }
    const elapsed = Date.now() - lastSwitchRef.current
    const wait = Math.max(0, THINKING_LINE_INTERVAL_MS - elapsed)
    timeoutRef.current = setTimeout(run, wait)
  }, [showNext])

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      queueRef.current = []
      const d = detail || ''
      displayedRef.current = d
      setDisplayed(d)
      lastSwitchRef.current = 0
      return
    }

    const incoming = detail || ''
    if (!incoming) return

    if (!displayedRef.current) {
      showNext(incoming)
      return
    }

    if (incoming === displayedRef.current) {
      if (lastSwitchRef.current === 0 && incoming) lastSwitchRef.current = Date.now()
      return
    }

    const tail = queueRef.current[queueRef.current.length - 1]
    if (incoming !== tail) queueRef.current.push(incoming)
    drainQueueAfterDelay()
  }, [detail, isActive, showNext, drainQueueAfterDelay])

  useEffect(
    () => () => {
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (!displayed) return null

  const mainText = still ? withoutTrailingEllipsis(displayed) : displayed

  return (
    <div className="ai-thinking">
      <span key={`${motion}`} className="ai-thinking-text ai-thinking-text--enter">
        {mainText}
        {still ? <span className="ai-thinking-ellipsis">…</span> : null}
      </span>
    </div>
  )
}

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
  exiting = false,
  detailByKey = {},
  stillWorkingByKey = {},
}) {
  const completedLabelByKey = useMemo(
    () => ({
      stock: 'Stock name resolved',
      news: 'News loaded',
      company: 'Data gathered',
      ta: 'Market analyzed',
      // ai: keep as-is (typically not seen once complete)
    }),
    [],
  )

  const progressPct = useMemo(() => {
    const total = Math.max(1, steps.length)
    const done = Math.min(total, Math.max(0, completedCount))
    return Math.round((done / total) * 100)
  }, [steps.length, completedCount])

  const [dots, setDots] = useState(1)

  useEffect(() => {
    const anyStillWorking = Object.values(stillWorkingByKey || {}).some(Boolean)
    if (!anyStillWorking) return
    const id = setInterval(() => {
      setDots((d) => (d % 3) + 1)
    }, 500)
    return () => clearInterval(id)
  }, [stillWorkingByKey])

  const activeKey = steps?.[activeIndex]?.key
  const animateThinkingLabelDots = activeKey === 'ai'

  useEffect(() => {
    if (!animateThinkingLabelDots) return
    const id = setInterval(() => {
      setDots((d) => (d % 3) + 1)
    }, 500)
    return () => clearInterval(id)
  }, [animateThinkingLabelDots])

  return (
    <div className={`ai-loading-overlay${exiting ? ' exiting' : ''}`} role="status" aria-live="polite" aria-busy="true">
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
            const detail = (detailByKey || {})[s.key]
            const still = Boolean((stillWorkingByKey || {})[s.key])
            const shouldAnimateLabelDots = Boolean(isActive && s.key === 'ai')
            const labelBase = isDone ? (completedLabelByKey[s.key] || 'Complete') : shouldAnimateLabelDots ? 'NeuralTrade is thinking' : s.label
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
                    {s.icon ? (
                      <span className="ai-step-icon" aria-hidden="true">{s.icon}</span>
                    ) : null}
                    <span className="ai-step-label">
                      {shouldAnimateLabelDots ? `${labelBase}${'.'.repeat(dots)}` : labelBase}
                    </span>
                  </div>
                </div>

                {isActive && detail ? (
                  <StepThinkingDetail detail={detail} isActive={isActive} still={still} />
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="ai-loading-disclaimer">
          NeuralTrade is not a financial advisor. It is a tool designed to simplify market analysis.
        </div>
      </div>
    </div>
  )
}
