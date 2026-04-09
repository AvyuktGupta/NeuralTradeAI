import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getNews, scan as apiScan } from '../services/api'
import StockChart from '../components/StockChart'
import SentimentCharts from '../components/SentimentCharts'
import AboutModal from '../components/AboutModal'
import LoadingSteps from '../components/LoadingSteps'
import TypingEffect from '../components/TypingEffect'

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

function ChevronIcon({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9" />
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

  const mainRef = useRef(null)
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const runIdRef = useRef(0)

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

      const scanPromise = apiScan(q)

      const runSteps = (async () => {
        const lastIndex = AI_LOADING_STEPS.length - 1
        for (let i = 0; i < AI_LOADING_STEPS.length; i++) {
          if (runIdRef.current !== runId) return
          setActiveStepIndex(i)

          const ms = randInt(800, 1500) + (i === 0 ? 200 : 0)

          // Don’t mark the final step complete until the backend scan is actually done.
          if (i === lastIndex) {
            await Promise.all([sleep(ms), scanPromise])
          } else {
            await sleep(ms)
          }

          if (runIdRef.current !== runId) return
          setCompletedSteps(i + 1)
        }
      })()

      try {
        const [data] = await Promise.all([scanPromise, runSteps])
        if (runIdRef.current !== runId) return
        setCompany(data.company || q)
        setScanData(data)
        setError(data.error || null)
        if (data?.insight) {
          setAnalysisState(ANALYSIS_STATES.analyzing)
        } else {
          setAnalysisState(ANALYSIS_STATES.complete)
        }
      } catch (err) {
        if (runIdRef.current !== runId) return
        runIdRef.current++ // cancel any in-flight step simulation
        setError(err.message || 'Scan failed')
        setScanData(null)
        setAnalysisState(ANALYSIS_STATES.idle)
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
  const technical = scanData?.technical || null
  const fundamentals = scanData?.fundamentals || null
  const sentimentModule = scanData?.sentiment_module || null
  const sentiment = scanData?.sentiment || {}
  const volume = scanData?.volume || {}
  const spike = scanData?.spike != null ? scanData.spike : 1.0

  const signal = technical?.signal || 'HOLD'
  const confidence = technical?.confidence || 0
  const signalClass = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : 'hold'
  const hasSentimentData = Object.keys(sentiment).length > 0 || Object.keys(volume).length > 0

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
              />
            )}

            {/* Results */}
            {company && analysisState !== ANALYSIS_STATES.loading && (
              <div className="results">
                {resolvedTicker && (
                  <div className="ticker-badge">
                    Analyzing: <span>{resolvedTicker}</span>
                  </div>
                )}

                {/* Decision Card */}
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
                      <div className="confidence-value">{confidence}%</div>
                      <div className="confidence-bar">
                        <div
                          className={`confidence-fill ${signalClass}`}
                          style={{ width: `${Math.min(100, confidence)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Strip */}
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
                  {sentimentModule && (
                    <div className="stat-card">
                      <div className="stat-label">Sentiment</div>
                      <div className="stat-value" style={{ color: sentimentColor(sentimentModule.verdict) }}>
                        {sentimentModule.verdict}
                      </div>
                      <div className="stat-sub">Score: {sentimentModule.score}/100</div>
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

                {/* Price Chart */}
                {stockChart && (
                  <div className="chart-section card">
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
                    <div className="section-header">Technical Indicators</div>
                    <div className="indicators-grid">
                      {INDICATORS_USED.map((name) => (
                        <div key={name} className="indicator-card">
                          <div className="indicator-name">{name}</div>
                          <div className="indicator-status" style={{ color: signalColor(signal) }}>
                            <span className="indicator-dot" style={{ background: signalColor(signal) }} />
                            {signal === 'BUY' ? 'Bullish' : signal === 'SELL' ? 'Bearish' : 'Neutral'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Fundamental Metrics */}
                {fundamentals?.metrics && Object.keys(fundamentals.metrics).length > 0 && (
                  <>
                    <div className="section-header">Fundamental Metrics</div>
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

                {/* AI Analysis */}
                {insight && (
                  <>
                    <div className="section-header">AI Analysis</div>
                    <div className="ai-analysis card">
                      <TypingEffect
                        text={`“${insight}”`}
                        start={analysisState === ANALYSIS_STATES.analyzing || analysisState === ANALYSIS_STATES.complete}
                        minDelayMs={12}
                        maxDelayMs={28}
                        initialDelayMs={250}
                        onDone={() => {
                          setAnalysisState(ANALYSIS_STATES.complete)
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Sentiment Charts */}
                {hasSentimentData && (
                  <>
                    <div className="section-header">Sentiment Trends</div>
                    <div className="charts-grid">
                      <div className="mini-chart-card">
                        <div className="mini-chart-title">Sentiment Trend</div>
                        <div className="mini-chart-body">
                          <SentimentCharts sentiment={sentiment} volume={volume} type="sentiment" />
                        </div>
                      </div>
                      <div className="mini-chart-card">
                        <div className="mini-chart-title">Volume Pressure</div>
                        <div className="mini-chart-body">
                          <SentimentCharts sentiment={sentiment} volume={volume} type="volume" />
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
