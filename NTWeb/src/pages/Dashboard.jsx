import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getMarket,
  getMovers,
  getNews,
  getChart,
  scan as apiScan,
} from '../services/api'
import StockChart from '../components/StockChart'
import SentimentCharts from '../components/SentimentCharts'

const PERIOD_LABELS = { '1d': '1 Day', '1mo': '1 Month', '3mo': '3 Months', '1y': '1 Year' }

export default function Dashboard() {
  const [market, setMarket] = useState([])
  const [movers, setMovers] = useState([])
  const [news, setNews] = useState([])
  const [company, setCompany] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scanData, setScanData] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('3mo')

  const loadInitial = useCallback(async () => {
    try {
      const [m, mov, n] = await Promise.all([getMarket(), getMovers(), getNews()])
      setMarket(m)
      setMovers(mov)
      setNews(n)
    } catch (e) {
      setError(e.message || 'Failed to load initial data')
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const q = (query || '').trim()
      if (!q) return
      setLoading(true)
      setError(null)
      setScanData(null)
      try {
        const data = await apiScan(q)
        setCompany(data.company || q)
        setScanData(data)
        setError(data.error || null)
      } catch (err) {
        setError(err.message || 'Scan failed')
        setScanData(null)
      } finally {
        setLoading(false)
      }
    },
    [query]
  )

  const displayNews = useMemo(
    () => (scanData && scanData.news && scanData.news.length) ? scanData.news : news,
    [scanData, news]
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <nav className="glass-panel" style={{ zIndex: 50, height: 64, flexShrink: 0 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: '#2563eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>N</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Neural<span className="text-gold">Trade</span></h1>
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', padding: 24, gap: 24, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <div style={{ flex: '0 0 75%', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', paddingRight: 8 }} className="scrollbar-hide">
          <div className="glass-panel" style={{ padding: 24, borderRadius: 12 }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 16 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Ticker (e.g. RELIANCE, BTC)..."
                required
                style={{ flex: 1, background: 'rgba(15, 23, 42, 0.5)', color: '#fff', padding: '12px 16px', border: '1px solid #475569', borderRadius: 8, outline: 'none' }}
              />
              <button type="submit" disabled={loading} style={{ background: '#2563eb', color: '#fff', fontWeight: 700, padding: '12px 32px', borderRadius: 8, border: 'none', cursor: loading ? 'wait' : 'pointer' }}>
                {loading ? '...' : 'SCAN'}
              </button>
            </form>
            {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 12 }}>⚠️ {error}</p>}
          </div>

          {company && (
            <>
              {resolvedTicker && (
                <p style={{ color: '#94a3b8', fontSize: 12 }}>Resolved ticker: <span className="text-gold" style={{ fontFamily: 'monospace' }}>{resolvedTicker}</span> (used for Technical & Fundamentals)</p>
              )}
              {stockChart && (
                <div className="glass-panel" style={{ padding: 24, borderRadius: 12, borderLeft: '4px solid #22d3ee' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <h3 style={{ color: '#22d3ee', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>📈 {company} — Price Chart</h3>
                    <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Chart timeline">
                      {['1d', '1mo', '3mo', '1y'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setChartPeriod(p)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            border: `1px solid ${chartPeriod === p ? '#22d3ee' : '#475569'}`,
                            background: chartPeriod === p ? '#0891b2' : '#334155',
                            color: chartPeriod === p ? '#fff' : '#cbd5e1',
                            cursor: 'pointer',
                          }}
                        >
                          {p === '1d' ? '1D' : p === '1mo' ? '1M' : p === '3mo' ? '3M' : '1Y'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 224 }}>
                    <StockChart initialData={stockChart} ticker={resolvedTicker} period={chartPeriod} periodLabel={PERIOD_LABELS[chartPeriod] || chartPeriod} />
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Last {PERIOD_LABELS[chartPeriod] || chartPeriod} (close price)</p>
                </div>
              )}
              <div className="glass-panel" style={{ padding: 24, borderRadius: 12, borderLeft: '4px solid #fbbf24' }}>
                <h3 className="text-gold" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>⚡ AI Insight</h3>
                <p style={{ fontSize: '1.125rem', color: '#fff', fontWeight: 300, lineHeight: 1.6 }}>{`"${insight}"`}</p>
              </div>

              {technical && (
                <div className="glass-panel" style={{ padding: 24, borderRadius: 12, borderLeft: '4px solid #3b82f6' }}>
                  <h3 style={{ color: '#93c5fd', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Technical Analysis (NeuralTrade)</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Signal</span>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: technical.signal === 'BUY' ? '#34d399' : technical.signal === 'SELL' ? '#f87171' : '#fbbf24' }}>
                        {technical.signal === 'BUY' ? 'UP' : technical.signal === 'SELL' ? 'DOWN' : technical.signal}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Confidence</span>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{technical.confidence}%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Timeframe</span>
                      <span style={{ color: '#fff' }}>{technical.timeframe_minutes}m</span>
                    </div>
                  </div>
                  {technical.details && <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>Based on RSI, MACD, StochRSI & Bollinger Bands.</p>}
                </div>
              )}

              {fundamentals && (
                <div className="glass-panel" style={{ padding: 24, borderRadius: 12, borderLeft: '4px solid #10b981' }}>
                  <h3 style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Fundamentals</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Trust Score</span>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#fff' }}>{fundamentals.trust_score}/100</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Verdict</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: (fundamentals.verdict && (fundamentals.verdict.includes('Strong') || fundamentals.verdict.includes('Legit'))) ? '#34d399' : (fundamentals.verdict && (fundamentals.verdict.includes('Risky') || fundamentals.verdict.includes('Suspicious'))) ? '#f87171' : '#fbbf24',
                        }}
                      >
                        {fundamentals.verdict}
                      </span>
                    </div>
                  </div>
                  {fundamentals.metrics && Object.keys(fundamentals.metrics).length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, fontSize: 14 }}>
                      {Object.entries(fundamentals.metrics).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(30, 41, 59, 0.4)', borderRadius: 4, padding: '8px 12px' }}>
                          <span style={{ color: '#94a3b8' }}>{label}</span>
                          <span style={{ color: '#fff', fontFamily: 'monospace' }}>{value != null ? (typeof value === 'number' ? value.toFixed(2) : String(value)) + (label.indexOf('%') >= 0 && typeof value === 'number' ? '%' : '') : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sentimentModule && (
                <div className="glass-panel" style={{ padding: 24, borderRadius: 12, borderLeft: '4px solid #f59e0b' }}>
                  <h3 style={{ color: '#fcd34d', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Sentiment Analysis (NeuralTrade)</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Verdict</span>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: sentimentModule.verdict === 'Positive' ? '#34d399' : sentimentModule.verdict === 'Negative' ? '#f87171' : '#fbbf24' }}>{sentimentModule.verdict}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 14 }}>Score</span>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{sentimentModule.score}/100</span>
                    </div>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>News-based sentiment (VADER + financial lexicon). Trend chart below uses same logic.</p>
                </div>
              )}

              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 8, borderLeft: '4px solid #f59e0b', paddingLeft: 12 }}>Sentiment trend from news (NeuralTrade Sentiment Module)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="glass-panel" style={{ padding: 16, borderRadius: 12 }}>
                  <h3 style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Sentiment Trend</h3>
                  <div style={{ height: 160 }}><SentimentCharts sentiment={sentiment} volume={volume} type="sentiment" /></div>
                </div>
                <div className="glass-panel" style={{ padding: 16, borderRadius: 12 }}>
                  <h3 style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Volume Pressure</h3>
                  <div style={{ height: 160 }}><SentimentCharts sentiment={sentiment} volume={volume} type="volume" /></div>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: 16, borderRadius: 12, textAlign: 'center', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 48, paddingRight: 48 }}>
                <span style={{ color: '#94a3b8', fontSize: 14, textTransform: 'uppercase', fontWeight: 700 }}>Market Velocity</span>
                <span style={{ fontSize: '2.25rem', fontWeight: 700, color: spike > 1.5 ? '#f87171' : '#34d399' }}>{spike}x</span>
              </div>
            </>
          )}

          {!company && (
            <div className="glass-panel" style={{ padding: 48, borderRadius: 12, textAlign: 'center', opacity: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 256 }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>📡</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>System Ready</h2>
              <p style={{ color: '#94a3b8' }}>Enter a symbol above to activate the signal engine.</p>
            </div>
          )}

          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '1.125rem', marginTop: 8, borderLeft: '4px solid #3b82f6', paddingLeft: 12 }}>Live Market Wire</h3>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4, marginBottom: 8 }}>
            {wireLabel ? <>6 latest news for <span className="text-gold">{wireLabel}</span></> : 'Latest market news (default)'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingBottom: 32 }}>
            {(displayNews || []).map((article, i) => (
              <a
                key={i}
                href={article.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-panel"
                style={{ padding: 16, borderRadius: 8, display: 'block', cursor: article.url ? 'pointer' : 'default', opacity: article.url ? 1 : 0.7, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#fbbf24', marginBottom: 8 }}>
                  <span>{article.source}</span>
                  <span>{article.timestamp}</span>
                </div>
                <p style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.4 }}>{article.text}</p>
              </a>
            ))}
          </div>
        </div>

        <aside style={{ flex: '0 0 25%', display: 'flex', flexDirection: 'column', gap: 24, minHeight: 0 }}>
          <div className="glass-panel" style={{ padding: 20, borderRadius: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, flexShrink: 0 }}>⚡ Top Movers</h3>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }} className="scrollbar-hide">
              {(movers || []).map((stock) => (
                <div key={stock.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 4, background: 'rgba(30, 41, 59, 0.4)', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{stock.symbol}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1' }}>{stock.price}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: stock.color === 'text-emerald-400' ? '#34d399' : '#f87171' }}>{stock.pct_str}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-panel scrollbar-hide" style={{ padding: 16, borderRadius: 12, height: '50%', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>Indices</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(market || []).map((item) => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.3)', padding: 8, borderRadius: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>{item.name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{item.price}</div>
                    <div style={{ fontSize: 9, color: item.color === 'text-emerald-400' ? '#34d399' : '#f87171' }}>{item.change}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
