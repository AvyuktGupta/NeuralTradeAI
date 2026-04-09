import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getNews, scan as apiScan, scanStream } from '../services/api'
import StockChart from '../components/StockChart'
import SentimentCharts from '../components/SentimentCharts'
import AboutModal from '../components/AboutModal'
import LoadingSteps from '../components/LoadingSteps'
import TypingEffect from '../components/TypingEffect'
import Tooltip from '../components/Tooltip'
import { INDICATOR_TOOLTIPS } from '../content/indicatorTooltips'

const PERIOD_LABELS = { '1d': '1 Day', '1mo': '1 Month', '3mo': '3 Months', '1y': '1 Year' }
const PERIOD_SHORT = { '1d': '1D', '1mo': '1M', '3mo': '3M', '1y': '1Y' }
const INDICATORS_USED = ['RSI', 'MACD', 'StochRSI', 'Bollinger Bands']
const NEWS_INITIAL_COUNT = 4

const AI_LOADING_STEPS = [
  { key: 'stock', icon: '📊', label: 'Fetching stock data...' },
  { key: 'news', icon: '📰', label: 'Fetching latest news...' },
  { key: 'company', icon: '🏢', label: 'Fetching company details...' },
  { key: 'ta', icon: '⚙️', label: 'Analyzing technical indicators...' },
  { key: 'ai', icon: '🤖', label: 'Generating AI insights...' },
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function signalColor(s) {
  if (s === 'BUY') return 'var(--buy)'
  if (s === 'SELL') return 'var(--sell)'
  return 'var(--hold)'
}

function verdictColor(v) {
  if (!v) return 'var(--hold)'
  if (v.includes('Strong') || v.includes('Legit')) return 'var(--buy)'
  if (v.includes('Risky') || v.includes('Suspicious')) return 'var(--sell)'
  return 'var(--hold)'
}

function sentimentColor(v) {
  if (v === 'Positive') return 'var(--buy)'
  if (v === 'Negative') return 'var(--sell)'
  return 'var(--hold)'
}

function formatMetric(label, value) {
  if (value == null) return '—'
  if (typeof value === 'number') {
    const formatted = value.toFixed(2)
    return label.includes('%') ? `${formatted}%` : formatted
  }
  return String(value)
}

function formatLevel(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)
}

function normalizeInsightText(s) {
  return String(s || '')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSentences(text) {
  const t = normalizeInsightText(text)
  if (!t) return []
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function clampPct(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(100, x))
}

function confidenceMeta(pct) {
  // Boundaries per spec: 0–40 Low, 40–70 Moderate, 70–100 High
  if (pct < 40) return { level: 'low', label: 'Low Confidence' }
  if (pct < 70) return { level: 'moderate', label: 'Moderate Confidence' }
  return { level: 'high', label: 'High Confidence' }
}

function makeInsightSummary(fullInsight) {
  const sentences = splitSentences(fullInsight)
  if (!sentences.length) return ''

  const picked = sentences.slice(0, 3).join(' ')
  const maxChars = 260
  if (picked.length <= maxChars) return picked

  const shortened = picked.slice(0, maxChars).replace(/\s+\S*$/, '').trim()
  return shortened ? `${shortened}…` : picked
}

function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function LogoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
      <polyline points="16,7 22,7 22,13" />
    </svg>
  )
}

function SectionIcon({ kind }) {
  if (kind === 'market') {
    return (
      <svg className="chapter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15l3-4 3 2 4-6" />
      </svg>
    )
  }
  if (kind === 'technical') {
    return (
      <svg className="chapter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 8h6" />
        <path d="M4 16h10" />
        <path d="M14 8h6" />
        <path d="M18 12v8" />
        <path d="M10 4v8" />
      </svg>
    )
  }
  if (kind === 'fundamental') {
    return (
      <svg className="chapter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20V6a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <path d="M14 4v6h6" />
        <path d="M8 14h8" />
        <path d="M8 17h6" />
      </svg>
    )
  }
  // ai
  return (
    <svg className="chapter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M4 12H2" />
      <path d="M22 12h-2" />
      <path d="M7 7l-1.5-1.5" />
      <path d="M18.5 18.5 17 17" />
      <path d="M7 17l-1.5 1.5" />
      <path d="M18.5 5.5 17 7" />
      <path d="M12 7a5 5 0 1 0 5 5" />
    </svg>
  )
}

function ChapterDivider({ title, iconKind }) {
  return (
    <div className="chapter-divider" role="heading" aria-level={2}>
      <SectionIcon kind={iconKind} />
      <span className="chapter-title">{title}</span>
    </div>
  )
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg className="indicator-info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const ANALYSIS_STATES = {
  idle: 'idle',
  loading: 'loading',
  analyzing: 'analyzing',
  complete: 'complete',
}

export default function Dashboard() {
  const [news, setNews] = useState([])
  const [company, setCompany] = useState('')
  const [query, setQuery] = useState('')
  const [analysisState, setAnalysisState] = useState(ANALYSIS_STATES.idle)
  const [error, setError] = useState(null)
  const [scanData, setScanData] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('3mo')
  const [showAbout, setShowAbout] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [newsExpanded, setNewsExpanded] = useState(false)
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [showLoadingPanel, setShowLoadingPanel] = useState(false)
  const [loadingExiting, setLoadingExiting] = useState(false)
  const [insightEntered, setInsightEntered] = useState(false)
  const [stepDetailByKey, setStepDetailByKey] = useState({})
  const [stillWorkingByKey, setStillWorkingByKey] = useState({})
  const [confidenceBarReady, setConfidenceBarReady] = useState(false)

  const mainRef = useRef(null)
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const runIdRef = useRef(0)
  const typingRunIdRef = useRef(0)

  // ── Initial news load ──
  const loadInitial = useCallback(async () => {
    try {
      const n = await getNews()
      setNews(n)
    } catch (e) {
      setError(e.message || 'Failed to load initial data')
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // ── Navbar blur on scroll ──
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const handler = () => setNavScrolled(el.scrollTop > 20)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const isBusy = analysisState === ANALYSIS_STATES.loading || analysisState === ANALYSIS_STATES.analyzing

  // ── Scroll to results on analyze start ──
  useEffect(() => {
    if ((analysisState === ANALYSIS_STATES.loading || analysisState === ANALYSIS_STATES.analyzing) && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [analysisState])

  // ── Form submit ──
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const q = (query || '').trim()
      if (!q) return
      const runId = ++runIdRef.current

      setAnalysisState(ANALYSIS_STATES.loading)
      setError(null)
      setScanData(null)
      setCompany('')
      setNewsExpanded(false)
      setActiveStepIndex(0)
      setCompletedSteps(0)
      setShowLoadingPanel(true)
      setLoadingExiting(false)
      setInsightEntered(false)
      setStepDetailByKey({})
      setStillWorkingByKey({})

      const stepIndexByKey = AI_LOADING_STEPS.reduce((acc, s, idx) => {
        acc[s.key] = idx
        return acc
      }, {})

      try {
        let data = null

        // Prefer streaming phases if supported.
        if (typeof window !== 'undefined' && 'EventSource' in window) {
          data = await new Promise((resolve, reject) => {
            let cleanup = null

            const safeCleanup = () => {
              try { cleanup?.() } catch (_) {}
              cleanup = null
            }

            cleanup = scanStream(q, {
              onEvent: (evt) => {
                if (runIdRef.current !== runId) {
                  safeCleanup()
                  return
                }

                if (evt.type === 'phase') {
                  const idx = stepIndexByKey[evt.phase]
                  if (idx != null) {
                    if (evt.status === 'start') {
                      setActiveStepIndex(idx)
                    }
                    if (evt.status === 'done') {
                      setCompletedSteps((prev) => Math.max(prev, idx + 1))
                    }
                  }
                  if (evt.phase === 'ai' && evt.status === 'start') {
                    setStepDetailByKey((p) => ({ ...p, ai: 'Generating final insight' }))
                    setStillWorkingByKey((p) => ({ ...p, ai: false }))
                  }
                  if (evt.phase === 'ta' && evt.status === 'start') {
                    setStepDetailByKey((p) => ({ ...p, ta: 'Evaluating trend strength' }))
                    setStillWorkingByKey((p) => ({ ...p, ta: false }))
                  }
                  if (evt.phase === 'news' && evt.status === 'start') {
                    setStepDetailByKey((p) => ({ ...p, news: 'Interpreting market sentiment' }))
                    setStillWorkingByKey((p) => ({ ...p, news: false }))
                  }
                  if (evt.phase === 'stock' && evt.status === 'start') {
                    setStepDetailByKey((p) => ({ ...p, stock: 'Analyzing indicator correlations' }))
                    setStillWorkingByKey((p) => ({ ...p, stock: false }))
                  }
                }

                if (evt.type === 'still') {
                  const phase = evt.phase
                  if (phase) {
                    setStepDetailByKey((p) => ({ ...p, [phase]: evt.message || 'Still working' }))
                    setStillWorkingByKey((p) => ({ ...p, [phase]: true }))
                  }
                }

                if (evt.type === 'result') {
                  safeCleanup()
                  resolve(evt.data)
                }
              },
              onError: (errEvt) => {
                safeCleanup()
                reject(errEvt)
              },
            })
          })
        } else {
          // Fallback (non-streaming).
          data = await apiScan(q)
        }

        if (runIdRef.current !== runId) return
        setCompany(data.company || q)
        setScanData(data)
        setError(data.error || null)
        if (data?.insight) {
          setAnalysisState(ANALYSIS_STATES.analyzing)
          typingRunIdRef.current = runId
          // Smooth handoff: fade out loader, then fade in AI insight.
          setLoadingExiting(true)
          setTimeout(() => {
            if (runIdRef.current !== runId) return
            setShowLoadingPanel(false)
            setLoadingExiting(false)
            setInsightEntered(true)
          }, 360)
        } else {
          setAnalysisState(ANALYSIS_STATES.complete)
          setShowLoadingPanel(false)
        }
      } catch (err) {
        if (runIdRef.current !== runId) return
        runIdRef.current++ // cancel any in-flight step simulation
        setError(err.message || 'Scan failed')
        setScanData(null)
        setAnalysisState(ANALYSIS_STATES.idle)
        setShowLoadingPanel(false)
        setLoadingExiting(false)
      }
    },
    [query, setAnalysisState],
  )

  // ── Nav actions ──
  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const scrollToSearch = useCallback(() => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      searchRef.current?.querySelector('input')?.focus()
    }, 500)
  }, [])

  // ── Derived state ──
  const displayNews = useMemo(
    () => (scanData?.news?.length ? scanData.news : news),
    [scanData, news],
  )

  const wireLabel = scanData?.wire_label || null
  const resolvedTicker = scanData?.resolved_ticker || null
  const stockChart = scanData?.stock_chart || null
  const insight = scanData?.insight || ''
  const insightSummary = useMemo(() => makeInsightSummary(insight), [insight])
  const technical = scanData?.technical || null
  const fundamentals = scanData?.fundamentals || null
  const sentiment = scanData?.sentiment || {}
  const sentimentSummary = scanData?.sentiment_summary || null
  const volume = scanData?.volume || {}
  const spike = scanData?.spike != null ? scanData.spike : 1.0
  const rangeHigh = technical?.details?.[0]?.range_high ?? null
  const rangeLow = technical?.details?.[0]?.range_low ?? null

  const signal = technical?.signal || 'HOLD'
  const confidence = technical?.confidence || 0
  const confidencePct = useMemo(() => clampPct(confidence), [confidence])
  const confidenceInfo = useMemo(() => confidenceMeta(confidencePct), [confidencePct])
  const signalClass = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : 'hold'
  const hasSentimentData = Object.keys(sentiment).length > 0 || Object.keys(volume).length > 0

  // Animate confidence bar fill on (re)load.
  useEffect(() => {
    setConfidenceBarReady(false)
    const t = setTimeout(() => setConfidenceBarReady(true), 30)
    return () => clearTimeout(t)
  }, [confidencePct, company])

  const visibleNews = useMemo(() => {
    const all = displayNews || []
    return newsExpanded ? all : all.slice(0, NEWS_INITIAL_COUNT)
  }, [displayNews, newsExpanded])

  const hasMoreNews = (displayNews || []).length > NEWS_INITIAL_COUNT

  return (
    <div className="app-layout">
      {/* ── Navbar ── */}
      <nav className={`navbar${navScrolled ? ' scrolled' : ''}`}>
        <div className="navbar-inner">
          <div className="logo" onClick={scrollToTop} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && scrollToTop()}>
            <div className="logo-icon">
              <LogoIcon />
            </div>
            <span className="logo-text">AI Stock <span>Analyzer</span></span>
          </div>
          <div className="nav-links">
            <span className="nav-link active" onClick={scrollToTop}>Dashboard</span>
            <span className="nav-link" onClick={scrollToSearch}>Analyze</span>
            <span className="nav-link" onClick={() => setShowAbout(true)}>About</span>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main-content" ref={mainRef}>
        <div className="container">
          {/* Hero Section */}
          <section className="hero">
            <div className="hero-glow-wrap">
              <div className="hero-glow" />
              <svg
                className="hero-chart-icon"
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
                <polyline points="16,7 22,7 22,13" />
              </svg>
            </div>
            <h1 className="hero-title">AI-Powered Stock Intelligence</h1>
            <p className="hero-subtitle">
              Analyze stocks using technical indicators, market trends, and AI-driven insights
            </p>
          </section>

          {/* Search */}
          <section className="search-section" ref={searchRef}>
            <form onSubmit={handleSubmit} className="search-form">
              <div className="search-input-wrap">
                <SearchIcon />
                <input
                  type="text"
                  className="search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter ticker symbol (e.g. RELIANCE, TCS, BTC)..."
                  required
                />
              </div>
              <button type="submit" className="analyze-btn" disabled={isBusy}>
                {isBusy ? (
                  <>
                    <div className="spinner" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze'
                )}
              </button>
            </form>
            {error && <div className="error-msg">{error}</div>}
          </section>

          {/* Loading / Results */}
          <div ref={resultsRef}>
            {analysisState === ANALYSIS_STATES.loading && (
              <LoadingSteps
                title={`Analyzing ${query || 'your request'}…`}
                subtitle="Gathering signals and context"
                steps={AI_LOADING_STEPS}
                activeIndex={activeStepIndex}
                completedCount={completedSteps}
                exiting={loadingExiting}
                detailByKey={stepDetailByKey}
                stillWorkingByKey={stillWorkingByKey}
              />
            )}
            {showLoadingPanel && analysisState !== ANALYSIS_STATES.loading && (
              <LoadingSteps
                title={`Analyzing ${query || 'your request'}…`}
                subtitle="Gathering signals and context"
                steps={AI_LOADING_STEPS}
                activeIndex={activeStepIndex}
                completedCount={completedSteps}
                exiting={loadingExiting}
                detailByKey={stepDetailByKey}
                stillWorkingByKey={stillWorkingByKey}
              />
            )}

            {/* Results */}
            {company && !error && analysisState !== ANALYSIS_STATES.loading && (
              <div className="results">
                {resolvedTicker && (
                  <div className="ticker-badge">
                    Analyzing: <span>{resolvedTicker}</span>
                  </div>
                )}

                {/* Brain Container: AI Decision + AI Insight */}
                {(technical || (insightSummary && !showLoadingPanel)) && (
                  <section className="brain-container" aria-label="AI Brain">
                    {technical && (
                      <div className={`decision-card ${signalClass}`}>
                        <div className="decision-left">
                          <div className="decision-label">AI Decision</div>
                          <div className={`decision-signal ${signalClass}`}>{signal}</div>
                          <div className="decision-sub">
                            Based on {INDICATORS_USED.length} technical indicators &middot;{' '}
                            {technical.timeframe_minutes}m timeframe
                          </div>
                        </div>
                        <div className="decision-right">
                          <div className="confidence-label">Confidence</div>
                          <div className="confidence-value">
                            {confidenceInfo.label} ({Math.round(confidencePct)}%)
                          </div>
                          <div className="confidence-bar">
                            <div
                              className={`confidence-fill level-${confidenceInfo.level}`}
                              style={{ width: `${confidenceBarReady ? confidencePct : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {technical && insightSummary && !showLoadingPanel && <div className="brain-divider" />}

                    {insightSummary && !showLoadingPanel && (
                      <div className={`ai-insight-summary${insightEntered ? ' entered' : ''}`}>
                        <div className="ai-insight-title">Detailed AI Breakdown</div>
                        <div className="ai-insight-body">
                          <TypingEffect
                            text={insightSummary}
                            start={analysisState === ANALYSIS_STATES.analyzing || analysisState === ANALYSIS_STATES.complete}
                            onDone={() => {
                              if (analysisState !== ANALYSIS_STATES.analyzing) return
                              if (runIdRef.current !== typingRunIdRef.current) return
                              setAnalysisState(ANALYSIS_STATES.complete)
                            }}
                            minDelayMs={6}
                            maxDelayMs={14}
                            initialDelayMs={120}
                            className="ai-insight-typing"
                          />
                        </div>

                        <div className="section-header">Market Scenarios</div>
                        <div className="scenario-grid">
                          <div className="scenario-card bullish">
                            <div className="scenario-title">
                              <span className="scenario-emoji" aria-hidden="true">📈</span>
                              Bullish Scenario
                            </div>
                            <div className="scenario-body">
                              Breakout above <span className="scenario-level">{formatLevel(rangeHigh)}</span> could trigger upward momentum.
                            </div>
                          </div>
                          <div className="scenario-card bearish">
                            <div className="scenario-title">
                              <span className="scenario-emoji" aria-hidden="true">📉</span>
                              Bearish Scenario
                            </div>
                            <div className="scenario-body">
                              Breakdown below <span className="scenario-level">{formatLevel(rangeLow)}</span> may lead to further downside.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Stats Strip */}
                {(fundamentals || sentimentSummary) && (
                  <>
                    <ChapterDivider title="FUNDAMENTAL HEALTH" iconKind="fundamental" />
                    <div className="stats-strip">
                      {fundamentals && (
                        <div className="stat-card">
                          <div className="stat-label">Trust Score</div>
                          <div className="stat-value">
                            {fundamentals.trust_score}
                            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
                          </div>
                          <div className="stat-sub" style={{ color: verdictColor(fundamentals.verdict) }}>
                            {fundamentals.verdict}
                          </div>
                        </div>
                      )}
                      {sentimentSummary && (
                        <div className="stat-card">
                          <div className="stat-label">Sentiment</div>
                          <div className="stat-value" style={{ color: sentimentColor(sentimentSummary.verdict) }}>
                            {sentimentSummary.verdict}
                          </div>
                          <div className="stat-sub">Score: {sentimentSummary.score}/100</div>
                        </div>
                      )}
                      <div className="stat-card">
                        <div className="stat-label">Market Velocity</div>
                        <div className="stat-value" style={{ color: spike > 1.5 ? 'var(--sell)' : 'var(--buy)' }}>
                          {spike}x
                        </div>
                        <div className="stat-sub">{spike > 1.5 ? 'High activity detected' : 'Normal activity'}</div>
                      </div>
                    </div>
                  </>
                )}

                {/* Price Chart */}
                {stockChart && (
                  <div className="chart-section card">
                    <ChapterDivider title="MARKET STRUCTURE" iconKind="market" />
                    <div className="chart-header">
                      <div className="chart-title">{company} &mdash; Price Chart</div>
                      <div className="period-group" role="group" aria-label="Chart timeline">
                        {['1d', '1mo', '3mo', '1y'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`period-btn${chartPeriod === p ? ' active' : ''}`}
                            onClick={() => setChartPeriod(p)}
                          >
                            {PERIOD_SHORT[p]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="chart-body">
                      <StockChart
                        initialData={stockChart}
                        ticker={resolvedTicker}
                        period={chartPeriod}
                        periodLabel={PERIOD_LABELS[chartPeriod] || chartPeriod}
                      />
                    </div>
                    <div className="chart-footer">
                      Showing {PERIOD_LABELS[chartPeriod] || chartPeriod} closing prices
                    </div>
                  </div>
                )}

                {/* Technical Indicators */}
                {technical && (
                  <>
                    <ChapterDivider title="TECHNICAL SIGNALS" iconKind="technical" />
                    <div className="indicators-grid">
                      {INDICATORS_USED.map((name) => (
                        <Tooltip key={name} content={INDICATOR_TOOLTIPS[name]} placement="right" className="indicator-tooltip">
                          <div className="indicator-card" tabIndex={0}>
                            <div className="indicator-name">
                              <span className="indicator-name-text">{name}</span>
                              <span className="indicator-info" aria-label={`${name} info`}>
                                <InfoIcon />
                              </span>
                            </div>
                            <div className="indicator-status" style={{ color: signalColor(signal) }}>
                              <span className="indicator-dot" style={{ background: signalColor(signal) }} />
                              {signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral'}
                            </div>
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                  </>
                )}

                {/* Fundamental Metrics */}
                {fundamentals?.metrics && Object.keys(fundamentals.metrics).length > 0 && (
                  <>
                    <div className="metrics-grid">
                      {Object.entries(fundamentals.metrics).map(([label, value]) => (
                        <div key={label} className="metric-item">
                          <span className="metric-label">{label}</span>
                          <span className="metric-value">{formatMetric(label, value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* (Removed duplicate AI insight card) */}

                {/* Sentiment Charts */}
                {hasSentimentData && (
                  <>
                    <div className="charts-grid">
                      <div className="mini-chart-card">
                        <div className="mini-chart-title">Sentiment Trend</div>
                        <div className="mini-chart-body">
                          <SentimentCharts sentiment={sentiment} volume={volume} type="sentiment" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── News ── */}
          <section className="news-section">
            <div className="section-header">Market News</div>
            <p className="news-header-text">
              {wireLabel ? (
                <>
                  Latest news for <span>{wireLabel}</span>
                </>
              ) : (
                'Latest market news'
              )}
            </p>
            <div className="news-grid">
              {visibleNews.map((article, i) => (
                <a
                  key={i}
                  href={article.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-card"
                  style={{
                    cursor: article.url ? 'pointer' : 'default',
                    opacity: article.url ? 1 : 0.7,
                  }}
                >
                  <div className="news-meta">
                    <span className="news-source">{article.source}</span>
                    <span>{article.timestamp}</span>
                  </div>
                  <p className="news-text">{article.text}</p>
                </a>
              ))}
            </div>
            {hasMoreNews && (
              <button
                className="view-more-btn"
                onClick={() => setNewsExpanded((prev) => !prev)}
              >
                {newsExpanded ? 'Show Less' : 'View More'}
                <ChevronIcon className={`view-more-chevron${newsExpanded ? ' expanded' : ''}`} />
              </button>
            )}
          </section>

          {/* ── Footer ── */}
          <footer className="footer">NeuralTrade &copy; 2025</footer>
        </div>
      </main>

      {/* ── About Modal ── */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}
