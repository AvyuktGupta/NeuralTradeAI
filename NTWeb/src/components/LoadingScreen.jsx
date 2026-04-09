import React, { useState, useEffect } from 'react'

const MESSAGES = [
  'Initializing AI models...',
  'Loading analysis modules...',
  'Connecting to market data...',
]

export default function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#080c15',
        color: '#e6edf3',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(47, 129, 247, 0.15)',
          borderTopColor: '#2f81f7',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: 24,
        }}
      />
      <p
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: '#8b949e',
          margin: 0,
          minHeight: 24,
          transition: 'opacity 0.3s ease',
        }}
      >
        {MESSAGES[messageIndex]}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
