import React, { useState, useEffect } from 'react'

const MESSAGES = [
  'Loading Analysis Modules...',
  'Preparing AI Systems...',
  'Thank you for your cooperation.',
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
      className="loading-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top left, hsl(294, 98%, 17%), #031e5f)',
        color: '#e2e8f0',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: '3px solid rgba(251, 191, 36, 0.3)',
          borderTopColor: '#fbbf24',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
          marginBottom: 24,
        }}
      />
      <p
        style={{
          fontSize: '1.125rem',
          fontWeight: 500,
          margin: 0,
          minHeight: 28,
          transition: 'opacity 0.3s ease',
        }}
      >
        {MESSAGES[messageIndex]}
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
