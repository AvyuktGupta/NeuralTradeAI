/**
 * NeuralTrade Web - Node.js server.
 * Serves the UI and proxies data from the Python backend (backend_api.py).
 * Python modules (data_collector, signal_engine, insight_engine, NeuralTrade) stay unchanged.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5001';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function fetchBackend(pathname, options = {}) {
  const url = `${BACKEND_URL.replace(/\/$/, '')}${pathname}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = new Error(`Backend ${res.status}: ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** GET / - Home: sidebar data only */
app.get('/', async (req, res, next) => {
  try {
    const [market, movers, news] = await Promise.all([
      fetchBackend('/market'),
      fetchBackend('/movers'),
      fetchBackend('/news')
    ]);
    res.render('index', {
      market,
      movers,
      news,
      wire_label: null,
      company: '',
      error: null,
      sentiment: {},
      volume: {},
      spike: 1.0,
      insight: '',
      technical: null,
      fundamentals: null,
      sentiment_module: null,
      resolved_ticker: null,
      stock_chart: null
    });
  } catch (err) {
    next(err);
  }
});

/** POST / - Scan company: full page data from Python backend */
app.post('/', async (req, res, next) => {
  try {
    const company = (req.body.company || '').trim();
    const data = await fetchBackend('/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company })
    });
    res.render('index', {
      market: data.market,
      movers: data.movers,
      news: data.news,
      wire_label: data.wire_label,
      company: data.company,
      error: data.error,
      sentiment: data.sentiment || {},
      volume: data.volume || {},
      spike: data.spike != null ? data.spike : 1.0,
      insight: data.insight || '',
      technical: data.technical,
      fundamentals: data.fundamentals,
      sentiment_module: data.sentiment_module,
      resolved_ticker: data.resolved_ticker,
      stock_chart: data.stock_chart
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/chart - Proxy to Python backend */
app.get('/api/chart', async (req, res, next) => {
  try {
    const ticker = (req.query.ticker || '').trim();
    const period = (req.query.period || '3mo').trim().toLowerCase();
    const url = `${BACKEND_URL}/chart?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}`;
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).send(
    status === 500
      ? 'Backend unavailable. Start the Python API: python backend_api.py'
      : err.message
  );
});

app.listen(PORT, () => {
  console.log(`NeuralTrade Web at http://localhost:${PORT}`);
  console.log(`Python backend expected at ${BACKEND_URL}`);
});
