import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

export default function Tooltip({
  content,
  placement = 'top',
  delayMs = 150,
  className = '',
  children,
}) {
  const tooltipId = useId()
  const enterTimerRef = useRef(null)
  const leaveTimerRef = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  const normalized = useMemo(() => {
    if (!content) return null
    return {
      title: content.title || '',
      what: content.what || '',
      calc: content.calc || '',
      means: content.means || '',
    }
  }, [content])

  const clearTimers = () => {
    if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current)
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current)
    enterTimerRef.current = null
    leaveTimerRef.current = null
  }

  const show = () => {
    if (!normalized) return
    clearTimers()
    enterTimerRef.current = window.setTimeout(() => {
      setMounted(true)
      // Allow mount before transition so fade-in is smooth.
      window.requestAnimationFrame(() => setOpen(true))
    }, delayMs)
  }

  const hide = () => {
    clearTimers()
    setOpen(false)
    // Match CSS transition duration (200ms) + tiny buffer.
    leaveTimerRef.current = window.setTimeout(() => setMounted(false), 220)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  const placementClass =
    placement === 'right' ? 'nt-tooltip--right' : placement === 'top' ? 'nt-tooltip--top' : 'nt-tooltip--top'

  return (
    <span
      className={`nt-tooltip-wrap ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted && normalized ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={`nt-tooltip ${placementClass}${open ? ' is-open' : ''}`}
        >
          <span className="nt-tooltip-title">{normalized.title}</span>
          <span className="nt-tooltip-line">{normalized.what}</span>
          <span className="nt-tooltip-line">{normalized.calc}</span>
          <span className="nt-tooltip-line">{normalized.means}</span>
        </span>
      ) : null}
    </span>
  )
}

