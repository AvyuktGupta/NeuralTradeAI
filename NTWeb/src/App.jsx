import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import LoadingScreen from './components/LoadingScreen'

const Dashboard = lazy(() => import('./pages/Dashboard'))

const POLL_INTERVAL_MS = 800
const STATUS_OK_MAX_WAIT_MS = 120000

export default function App() {
  const [modulesLoaded, setModulesLoaded] = useState(false)
  const [statusError, setStatusError] = useState(null)

  const checkStatus = useCallback(async () => {
    try {
      const base = ''
      const res = await fetch(`${base}/api/status`)
      const data = await res.json().catch(() => ({}))
      if (data.modules_loaded === true) {
        setModulesLoaded(true)
        setStatusError(null)
        return true
      }
    } catch (e) {
      setStatusError(e.message || 'Backend unavailable')
    }
    return false
  }, [])

  useEffect(() => {
    let cancelled = false
    const deadline = Date.now() + STATUS_OK_MAX_WAIT_MS

    const run = async () => {
      if (await checkStatus()) return
      const id = setInterval(async () => {
        if (cancelled || Date.now() > deadline) {
          clearInterval(id)
          if (!cancelled && !modulesLoaded) setStatusError('Modules did not become ready in time.')
          return
        }
        if (await checkStatus()) clearInterval(id)
      }, POLL_INTERVAL_MS)
      return () => clearInterval(id)
    }

    run()
    return () => { cancelled = true }
  }, [checkStatus])

  if (!modulesLoaded) {
    return (
      <>
        <LoadingScreen />
        {statusError && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239, 68, 68, 0.9)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              zIndex: 10000,
            }}
          >
            {statusError}
          </div>
        )}
      </>
    )
  }

  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <LoadingScreen />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  )
}
