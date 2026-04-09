import React, { useEffect } from 'react'

const FEATURES = [
  'Real-time technical analysis with RSI, MACD, StochRSI & Bollinger Bands',
  'Fundamental analysis with weighted trust scoring',
  'AI-driven sentiment analysis from live market news',
  'Interactive price charts with multiple timeframes',
  'Confidence-based BUY / SELL / HOLD decisions',
]

export default function AboutModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="modal-icon-wrap">
          <div className="modal-icon-glow" />
          <svg className="modal-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
            <polyline points="16,7 22,7 22,13" />
          </svg>
        </div>

        <h2 className="modal-title">About This Project</h2>
        <p className="modal-text">
          This AI Stock Analyzer combines technical indicators and market data
          to generate intelligent trading insights. It processes multiple data
          streams in real time to deliver actionable analysis.
        </p>

        <div className="modal-features">
          {FEATURES.map((f, i) => (
            <div key={i} className="modal-feature" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="modal-feature-dot" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
