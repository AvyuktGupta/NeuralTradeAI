import React, { useEffect, useMemo, useRef, useState } from 'react'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function getRandomInt(min, max) {
  const a = Math.ceil(min)
  const b = Math.floor(max)
  return Math.floor(Math.random() * (b - a + 1)) + a
}

export default function TypingEffect({
  text = '',
  start = false,
  minDelayMs = 14,
  maxDelayMs = 28,
  initialDelayMs = 350,
  resetKey = 0,
  streamSync = false,
  allowComplete = true,
  className = '',
  onDone,
}) {
  const safeMin = useMemo(() => clamp(minDelayMs, 5, 200), [minDelayMs])
  const safeMax = useMemo(() => clamp(maxDelayMs, safeMin, 300), [maxDelayMs, safeMin])

  const [visibleCount, setVisibleCount] = useState(0)
  const doneRef = useRef(false)
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      doneRef.current = false
      setVisibleCount(0)
    }
  }, [resetKey])

  useEffect(() => {
    if (!start || !text) return
    if (visibleCount >= text.length) return

    const backlog = text.length - visibleCount
    let delay
    if (visibleCount === 0) {
      delay = Math.max(0, initialDelayMs)
    } else if (streamSync && backlog > 28) {
      delay = clamp(Math.floor(safeMin * 0.45), 4, 12)
    } else {
      delay = getRandomInt(safeMin, safeMax)
    }

    const step =
      streamSync && backlog > 22 ? Math.min(backlog, Math.max(2, Math.ceil(backlog / 18))) : 1

    const t = setTimeout(() => {
      setVisibleCount((c) => Math.min(text.length, c + step))
    }, delay)

    return () => clearTimeout(t)
  }, [start, text, text.length, visibleCount, streamSync, safeMin, safeMax, initialDelayMs])

  useEffect(() => {
    if (!start || !text) return
    if (visibleCount < text.length) return
    if (text.length === 0) return
    if (!allowComplete) return
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }, [start, text, text.length, visibleCount, onDone, allowComplete])

  const shown = text.slice(0, visibleCount)
  const isDone = start && text && visibleCount >= text.length

  return (
    <div className={['ai-typing', className].filter(Boolean).join(' ')}>
      <span className="ai-typing-text">{shown}</span>
      <span className={['ai-typing-cursor', isDone ? 'done' : ''].join(' ')} aria-hidden="true" />
    </div>
  )
}
