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
  className = '',
  onDone,
}) {
  const safeMin = useMemo(() => clamp(minDelayMs, 5, 200), [minDelayMs])
  const safeMax = useMemo(() => clamp(maxDelayMs, safeMin, 300), [maxDelayMs, safeMin])

  const [visibleCount, setVisibleCount] = useState(0)
  const doneRef = useRef(false)
  const timersRef = useRef([])

  useEffect(() => {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
    doneRef.current = false
    setVisibleCount(0)
  }, [text, start])

  useEffect(() => {
    if (!start) return
    if (!text) return

    const kick = setTimeout(() => {
      const tick = () => {
        setVisibleCount((c) => {
          const next = Math.min(text.length, c + 1)
          if (next >= text.length && !doneRef.current) {
            doneRef.current = true
            onDone?.()
          }
          return next
        })
        if (!doneRef.current) {
          const nextDelay = getRandomInt(safeMin, safeMax)
          const t = setTimeout(tick, nextDelay)
          timersRef.current.push(t)
        }
      }
      tick()
    }, Math.max(0, initialDelayMs))

    timersRef.current.push(kick)
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
    }
  }, [start, text, safeMin, safeMax, initialDelayMs, onDone])

  const shown = text.slice(0, visibleCount)
  const isDone = start && text && visibleCount >= text.length

  return (
    <div className={['ai-typing', className].filter(Boolean).join(' ')}>
      <span className="ai-typing-text">{shown}</span>
      <span className={['ai-typing-cursor', isDone ? 'done' : ''].join(' ')} aria-hidden="true" />
    </div>
  )
}
