# NeuralTrade – Full Reverse-Engineering & System Documentation

This document is a **read-only analysis** of the entire codebase. It explains what the system does, how it is structured, how data flows, and how to extend it. No code was modified.

---

## 1. High-Level System Overview

### What This Project Does

**NeuralTrade** is a **stock market analysis and intelligence platform** that:

- Lets users search for a company or ticker (e.g. RELIANCE, BTC, TCS) and run a **full scan**.
- Runs **technical analysis** (RSI, MACD, StochRSI, Bollinger Bands) and **fundamental analysis** (financials, trust score) via Python modules in **NTMods**.
- Runs **news-based sentiment analysis** (VADER + financial lexicon) for the same ticker.
- Fetches **news** (NewsAPI + Google News RSS), processes it for sentiment trends and volume pressure, and optionally generates an **AI insight** (Google Gemini) or a backup text.
- Displays **market indices**, **top movers**, **price charts**, and **analysis cards** (Technical, Fundamentals, Sentiment) in a single-page dashboard.

The system can also be run **headless** via **NTMods/main.py** (M³A Fusion Machine): it runs the same three modules on a configurable list of tickers, computes a weighted fusion score (BUY/HOLD/SELL), and can send a report to **Telegram**.

### Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (Browser)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NTWeb (Frontend + Node layer)                                               │
│  • React (Vite) app in src/ → built to dist/                                │
│  • Express server.js: serves dist/, proxies /api/* → Python backend          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │ /api/* (proxy)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NTWeb/backend_api.py (Flask, port 5001)                                    │
│  • JSON-only API: /status, /market, /movers, /news, /chart, /scan           │
│  • Uses: data_collector, signal_engine, insight_engine (news/signals/AI)     │
│  • Imports and calls NTMods modules for technical, fundamental, sentiment   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │ import & call
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NTMods (Python analysis modules)                                            │
│  • indicator_module  → technical (RSI, MACD, StochRSI, Bollinger)            │
│  • trust_module      → fundamental (yfinance financials → trust score)       │
│  • sentiment_module  → news sentiment (RSS + VADER → verdict + score)        │
│  • main.py           → M³A Fusion (batch run + optional Telegram)            │
│  • APIs/             → telegram_messenger, indicator_calculators (helpers)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend**: React app in **NTWeb**. All UI lives in `NTWeb/src/` (components, pages, services). It only talks to the backend via **HTTP** to `/api/*`.
- **Backend for the website**: **NTWeb/backend_api.py** (Flask). It owns all “website” logic: resolving company → ticker, market/movers/news/chart, and the **scan** that runs the three NTMods modules and returns one big JSON payload.
- **Analysis engines**: **NTMods** (Python packages). Used by:
  - **backend_api.py** when handling `/scan` (and thus by the website).
  - **NTMods/main.py** when running batch fusion (CLI/automation, optional Telegram).

### Relationship Between NTWeb and NTMods

| Aspect | NTWeb | NTMods |
|--------|--------|--------|
| **Role** | Web UI + API gateway + Python API process | Analysis logic (technical, fundamental, sentiment) |
| **Invocation** | User opens site → Node serves React → React calls /api/* | backend_api.py imports and calls run_* functions; main.py runs batch |
| **Data** | Sends company/ticker and receives JSON (market, news, chart, technical, fundamentals, sentiment, insight) | Receives ticker (and optional params); returns structured dicts |
| **Deployment** | One process: Node (Express). Second process: Python (backend_api.py). Both can run on same machine. | No server of its own; runs inside backend_api.py or as main.py script |

### How the Frontend Interacts With Backend Modules

1. **On load**: Frontend polls `GET /api/status` until `modules_loaded === true`, then shows the Dashboard (lazy-loaded). No direct call to NTMods; “modules loaded” just means the Flask app started and imported NTMods successfully.
2. **Initial data**: Dashboard calls `GET /api/market`, `GET /api/movers`, `GET /api/news` to fill the sidebar and default news.
3. **User scan**: User enters a symbol and clicks SCAN. Frontend sends `POST /api/scan` with `{ "company": "RELIANCE" }`. Backend:
   - Resolves company → ticker (e.g. RELIANCE.NS),
   - Fetches company news (data_collector),
   - Runs **indicator_module**, **trust_module**, **sentiment_module** (NTMods),
   - Runs signal_engine (sentiment/volume from news) and insight_engine (Gemini or backup),
   - Gets chart data (yfinance),
   - Returns one JSON with market, movers, news, technical, fundamentals, sentiment_module, sentiment/volume/spike, insight, stock_chart, etc.
4. **Charts**: Stock chart can change period (1d, 1mo, 3mo, 1y). Frontend calls `GET /api/chart?ticker=...&period=...` and StockChart re-renders with new data.

All interaction is **HTTP + JSON**; the frontend never imports Python or NTMods.

### Technologies and Frameworks

| Layer | Technology | Use in project |
|-------|------------|----------------|
| Frontend | React 19, Vite 7 | SPA in NTWeb/src; build output in dist/ |
| Frontend | Chart.js | StockChart (line), SentimentCharts (line + bar) |
| Server | Node.js, Express | Serves static build, proxies /api/* to Flask |
| Backend API | Flask (Python) | backend_api.py: routes and orchestration |
| Backend logic | Python 3, pandas, numpy | Data handling, indicators, fundamentals |
| Data / markets | yfinance | Prices, history, fundamentals, market data |
| Indicators | ta (Technical Analysis library) | RSI, MACD, StochRSI, Bollinger in indicator_module |
| Sentiment | VADER (vaderSentiment) | signal_engine + sentiment module (with financial lexicon) |
| News | NewsAPI, Google News RSS, requests, BeautifulSoup | data_collector.py |
| AI insight | Google Generative AI (Gemini) | insight_engine.py (with fallback if quota fails) |
| Optional automation | Telegram Bot API | NTMods/APIs/telegram_messenger (used by main.py) |
| Config | python-dotenv, .env | API keys, backend URL, optional Telegram, weights |

---

## 2. Full Folder Structure Explanation

Below is the **project folder structure** with a short purpose and classification for each item. Paths are relative to the repo root `NeuralTrade/`.

### Root

| Path | Purpose | Type | Essential |
|------|---------|------|-----------|
| `README.md` | Run instructions, architecture table, module overviews (sentiment, fundamental, technical) | Docs | Yes |
| `REFACTOR.md` | Refactor summary: new structure, deleted files, improvements, how to run | Docs | No (reference) |
| `requirements.txt` | Python dependencies for NTMods + NTWeb backend (Flask, yfinance, ta, VADER, etc.) | Config | Yes |
| `.gitignore` | Ignores .env, node_modules, __pycache__, dist, etc. | Config | Yes |
| `ARCHITECTURE_AND_SYSTEM_DOCUMENTATION.md` | This document | Docs | No (reference) |

### NTWeb/ (Frontend + Server + Python API)

| Path | Purpose | Type | Essential |
|------|---------|------|-----------|
| `NTWeb/index.html` | Vite entry; mounts React root and loads `/src/main.jsx` | Frontend | Yes |
| `NTWeb/vite.config.js` | Vite config: React plugin, outDir `dist`, dev server port 3000, proxy `/api` → Python backend | Config | Yes |
| `NTWeb/package.json` | Node app name, scripts (start, build, dev), deps (react, express, chart.js, ejs), devDeps (vite, @vitejs/plugin-react) | Config | Yes |
| `NTWeb/package-lock.json` | Lockfile for npm install | Config | Yes |
| `NTWeb/server.js` | Express app: proxy `/api` to BACKEND_URL, serve `dist/` static, SPA fallback to index.html, error handler | Backend (Node) | Yes |
| `NTWeb/backend_api.py` | Flask app (port 5001): /status, /market, /movers, /news, /chart, /scan; uses data_collector, signal_engine, insight_engine, NTMods | Backend (Python) | Yes |
| `NTWeb/data_collector.py` | Fetches news: NewsAPI + Google News RSS; parse_timestamp for sorting | Backend (Python) | Yes (for news and scan) |
| `NTWeb/signal_engine.py` | VADER + financial lexicon on news list → sentiment trend, volume trend, source sentiment, spike ratio | Backend (Python) | Yes (for scan) |
| `NTWeb/insight_engine.py` | Google Gemini prompt for short insight; on failure uses random backup sentence | Backend (Python) | Yes (for scan) |
| `NTWeb/reqirement.txt` | Typo’d duplicate of requirements; not used by main requirements.txt | Config | No (redundant) |
| `NTWeb/signal_engine.py` | (see data_collector) | — | — |
| `NTWeb/public/vite.svg` | Favicon / asset | Frontend asset | Optional |
| `NTWeb/dist/` | Vite build output (index.html, assets/*.js, *.css); served by Express in production | Build output | Yes for production |
| `NTWeb/src/main.jsx` | React entry: createRoot, renders App, imports index.css | Frontend | Yes |
| `NTWeb/src/App.jsx` | Root component: polls /api/status until modules_loaded; shows LoadingScreen until then, then lazy Dashboard | Frontend | Yes |
| `NTWeb/src/index.css` | Global styles: box-sizing, body background, glass-panel, text-gold, scrollbar-hide | Frontend | Yes |
| `NTWeb/src/pages/Dashboard.jsx` | Main page: search form, market/movers/news, scan result (chart, insight, technical, fundamentals, sentiment, sentiment/volume charts, news list) | Frontend | Yes |
| `NTWeb/src/services/api.js` | API client: getStatus, getMarket, getMovers, getNews, getChart, scan (all hit /api/*) | Frontend | Yes |
| `NTWeb/src/components/LoadingScreen.jsx` | Full-screen loader with rotating messages while waiting for modules | Frontend | Yes |
| `NTWeb/src/components/StockChart.jsx` | Chart.js line chart for price; uses initialData from scan or fetches /api/chart when period changes | Frontend | Yes |
| `NTWeb/src/components/SentimentCharts.jsx` | Chart.js line (sentiment trend) and bar (volume) from scan sentiment/volume dicts | Frontend | Yes |
| `NTWeb/node_modules/` | npm dependencies (express, react, chart.js, vite, etc.) | Deps | Yes (after npm install) |

### NTMods/ (Python analysis modules)

| Path | Purpose | Type | Essential |
|------|---------|------|-----------|
| `NTMods/__init__.py` | Package marker | Backend | Yes |
| `NTMods/main.py` | M³A Fusion Machine: runs indicator, trust, sentiment (and placeholder risk) per ticker; weighted fusion → BUY/HOLD/SELL; optional Telegram report | Backend | Yes for batch/Telegram |
| `NTMods/Modules/__init__.py` | Package marker | Backend | Yes |
| `NTMods/Modules/indicator_module/__init__.py` | Package marker | Backend | Yes |
| `NTMods/Modules/indicator_module/run.py` | run_indicator_module(ticker, timeframe_minutes): yfinance 60d → RSI, MACD, StochRSI, Bollinger; vote BUY/SELL/HOLD, confidence 0–100 | Backend | Yes |
| `NTMods/Modules/trust_module/__init__.py` | Package marker | Backend | Yes |
| `NTMods/Modules/trust_module/run.py` | run_trust_module(ticker): yfinance fundamentals → build_metrics_bundle → compute_ratios_and_scores → trust_score 0–100, verdict | Backend | Yes |
| `NTMods/Modules/sentiment_module/__init__.py` | Package marker | Backend | Yes |
| `NTMods/Modules/sentiment_module/run.py` | run_sentiment_module(ticker, num_articles, max_age_hours): delegates to NewsSentimentScanner; maps to verdict + score 0–100 | Backend | Yes |
| `NTMods/Modules/sentiment_module/NewsSentimentScanner/__init__.py` | Package marker for scanner | Backend | Yes |
| `NTMods/Modules/sentiment_module/NewsSentimentScanner/NewsSentimentScanner/` | Nested package; contains sentiment_analysis (RSS fetch, VADER, score). May be submodule or separate tree. | Backend | Yes (required by run.py import) |
| `NTMods/APIs/__init__.py` | Package marker | Backend | Yes |
| `NTMods/APIs/indicator_calculators/__init__.py` | Package marker | Backend | Yes |
| `NTMods/APIs/indicator_calculators/indicators.py` | compute_rsi, compute_stochrsi, compute_macd, compute_bollinger_bands (pandas). Imported by indicator_module but indicator run.py uses ta directly. | Backend | Optional (indicator_module uses ta) |
| `NTMods/APIs/telegram_messenger/__init__.py` | Package marker | Backend | Yes (for main.py) |
| `NTMods/APIs/telegram_messenger/telegram.py` | send_telegram_message(message), get_chat_id(bot_token); reads TELEGRAM_* from env | Backend | Yes if using Telegram |

---

## 3. Technology Stack Detection

### Frontend

- **React 19** – UI components and state (App, Dashboard, LoadingScreen, StockChart, SentimentCharts).
- **Vite 7** – Dev server, HMR, build (output to `dist/`).
- **@vitejs/plugin-react** – JSX/React support in Vite.
- **Chart.js 4** – Line chart (prices), line + bar (sentiment trend, volume). Registered in components.
- **JavaScript (ES modules)** – No TypeScript; `import.meta.env.DEV` used in api.js.

### Backend (Web)

- **Node.js (≥18)** – Runtime for server.js.
- **Express** – Static serving, `/api` proxy to Flask, JSON body parser, SPA fallback, error handler.
- **Flask (Python)** – backend_api.py; JSON-only routes.

### Python (NTWeb backend + NTMods)

- **Flask** – Web API.
- **yfinance** – Ticker info, history, financials, balance sheet, cash flow; used in backend_api (market, chart, movers) and in indicator_module + trust_module.
- **pandas / numpy** – DataFrames, series, numeric handling; used in trust_module, signal_engine, indicator_module.
- **ta** – Technical indicators (RSI, MACD, StochRSI, Bollinger) in indicator_module/run.py.
- **vaderSentiment** – Sentiment scores in signal_engine and in sentiment module (with financial lexicon).
- **requests** – HTTP: Yahoo search (backend_api), NewsAPI, Google News, Telegram.
- **BeautifulSoup4 (bs4)** – Parse Google News RSS XML in data_collector.
- **feedparser** – Referenced in README for sentiment RSS; sentiment scanner may use it for RSS.
- **python-dateutil** – Date parsing in signal_engine.
- **google-generativeai** – Gemini in insight_engine.
- **python-dotenv** – Load .env in backend_api, insight_engine, data_collector, main.py, telegram, modules.

### APIs and External Services

- **Yahoo Finance (query1.finance.yahoo.com)** – Search for ticker by company name.
- **yfinance** – Uses Yahoo data for prices and fundamentals.
- **NewsAPI.org** – News search (requires NEWS_API_KEY).
- **Google News RSS** – News by query (no key).
- **Google Generative AI (Gemini)** – Short insight (requires GOOGLE_API_KEY).
- **Telegram Bot API** – Optional report from main.py (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED).

### Databases

- **None.** All data is fetched live from APIs and yfinance; no DB in the repo.

### AI/ML

- **VADER** – Sentiment (lexicon-based); no trainable model.
- **Gemini** – Generative text for one-sentence insight; optional and with fallback.

### Build and environment

- **npm** – Install and run scripts (build, start, dev).
- **Vite** – Frontend build.
- **.env** – BACKEND_URL, PORT, NEWS_API_KEY, GOOGLE_API_KEY, TELEGRAM_*, FUSION_WEIGHTS, STOCKS_LIST, etc. Not committed.

---

## 4. Data Flow Analysis

### User opens the site (production: Node + built React)

1. User opens `http://localhost:3000`.
2. **server.js** (Express) serves `dist/index.html` (or the SPA fallback).
3. Browser loads JS from `dist/assets/*.js` (React app).
4. **App.jsx** mounts, starts polling **GET /api/status** (every 800 ms, max 120 s).
5. Request hits Express → proxy to `BACKEND_URL/status` (e.g. `http://127.0.0.1:5001/status`).
6. **backend_api.py** responds with `{ "modules_loaded": true }`.
7. When `modules_loaded === true`, App shows **Dashboard** (lazy-loaded).
8. **Dashboard.jsx** runs `loadInitial()`: **GET /api/market**, **GET /api/movers**, **GET /api/news** in parallel.
9. Backend uses yfinance and data_collector/get_safe_news; returns JSON arrays.
10. Dashboard sets market, movers, news state and renders sidebar + default news area.

**Files:**  
Browser → server.js (proxy) → backend_api.py (get_market_data, get_top_movers, get_safe_news) → response → Dashboard state.

### User runs a scan

1. User types e.g. "RELIANCE" and clicks SCAN.
2. **Dashboard** calls **api.scan("RELIANCE")** → **POST /api/scan** with `{ "company": "RELIANCE" }`.
3. **backend_api.api_scan()**:
   - Reads `company` from body.
   - Calls `get_market_data()`, `get_top_movers()`, `get_safe_news()` (same as initial load).
   - If company empty: returns payload with market, movers, news, no ticker-specific data.
   - **resolve_company_to_ticker(company)** → e.g. "RELIANCE.NS" (Yahoo search + heuristics).
   - Fetches company news: **data_collector.fetch_news_api(company)** + **fetch_google_news(company)**, then by ticker_short if needed; sort by time, take 6.
   - If ticker:
     - **run_indicator_module({"ticker": ticker}, 15)** (NTMods) → technical dict.
     - **run_trust_module({"ticker": ticker})** (NTMods) → fundamentals dict.
     - **run_sentiment_module(ticker, 10, 24)** (NTMods) → sentiment_module dict.
   - **process_signals(company_news)** (signal_engine) → sentiment, volume, source_sent, spike.
   - **generate_insight(company, spike, source_sent, headlines)** (insight_engine) → string.
   - **get_stock_chart_data(ticker)** (yfinance) → labels, prices.
   - Serializes numpy in fundamentals via **_make_serializable**.
   - Returns JSON: market, movers, news, wire_label, company, sentiment, volume, spike, insight, technical, fundamentals, sentiment_module, resolved_ticker, stock_chart, error.
4. Frontend receives response, **setScanData(data)**; Dashboard re-renders with chart, insight, technical/fundamentals/sentiment cards, sentiment/volume charts, market velocity, and news list.

**Files:**  
Dashboard (handleSubmit) → api.js scan() → server.js proxy → backend_api.api_scan() → data_collector, signal_engine, insight_engine, NTMods (indicator, trust, sentiment), get_stock_chart_data → JSON → Dashboard state and components.

### User changes chart period

1. User clicks 1D / 1M / 3M / 1Y in Dashboard.
2. **Dashboard** sets **chartPeriod** state (e.g. "1mo").
3. **StockChart** receives new **period** prop; its useEffect runs **getChart(ticker, period)** → **GET /api/chart?ticker=RELIANCE.NS&period=1mo**.
4. **backend_api.api_chart()** calls **get_stock_chart_data(ticker, period)** (yfinance history), returns **{ labels, prices }**.
5. StockChart updates local state and redraws Chart.js.

**Files:**  
Dashboard (period button) → StockChart (useEffect) → api.js getChart() → backend_api.api_chart() → get_stock_chart_data() → StockChart state and canvas.

### Summary table

| Step | Actor | Action | File(s) |
|------|--------|--------|---------|
| 1 | User | Open localhost:3000 | — |
| 2 | Express | Serve dist/ or proxy /api | server.js |
| 3 | React | Poll /api/status | App.jsx, api.js |
| 4 | Flask | Return modules_loaded | backend_api.py |
| 5 | React | Load Dashboard, fetch market/movers/news | Dashboard.jsx, api.js |
| 6 | Flask | market, movers, news handlers | backend_api.py |
| 7 | User | Enter symbol, SCAN | Dashboard.jsx |
| 8 | React | POST /api/scan | api.js |
| 9 | Flask | Resolve ticker, news, NTMods, signal_engine, insight_engine, chart | backend_api.py, data_collector, signal_engine, insight_engine, NTMods |
| 10 | React | Render chart, cards, sentiment charts, news | Dashboard.jsx, StockChart, SentimentCharts |
| 11 | User | Change chart period | Dashboard.jsx |
| 12 | React | GET /api/chart?ticker=&period= | api.js, StockChart |
| 13 | Flask | get_stock_chart_data | backend_api.py |

---

## 5. Backend Module Analysis (NTMods)

### Indicator module (Technical)

- **Location:** `NTMods/Modules/indicator_module/run.py`
- **Entry:** `run_indicator_module(input_data, timeframe_minutes=15)`
- **Inputs:** `input_data["ticker"]` (e.g. "TVSMOTOR.NS"); optional `timeframe_minutes` (int).
- **Processing:**
  - Converts minutes to yfinance interval (e.g. 15 → "15m", 60 → "1h").
  - Downloads 60d OHLC with that interval via yfinance.
  - Uses **ta**: RSI, MACD (histogram), StochRSI (K), Bollinger Bands on Close.
  - Last candle only: each indicator votes BUY or SELL (RSI &lt;30 / &gt;70, MACD &gt;0, StochRSI K &lt;0.2 / &gt;0.8, Close vs bands). confidence = |buy−sell|/4 * 100; signal = BUY if buy&gt;sell, SELL if sell&gt;buy, else HOLD.
- **Outputs:** `{ "module", "ticker", "signal", "confidence", "details", "timeframe_minutes" }`. On no data: signal "NO DATA", confidence 0.
- **Dependencies:** yfinance, pandas, ta; optionally APIs/indicator_calculators (not used in run path currently; run uses ta directly).

### Trust module (Fundamental)

- **Location:** `NTMods/Modules/trust_module/run.py`
- **Entry:** `run_trust_module(input_data)`
- **Inputs:** `input_data["ticker"]`.
- **Processing:**
  - **fetch_fundamentals(ticker)**: yfinance Ticker → info, financials, balance_sheet, cashflow.
  - **build_metrics_bundle**: Extract time series (revenue, net income, EPS, equity, debt, current assets/liabilities, FCF) by keyword matching; trim to last N years (YEARS_TO_CHECK); add market_cap, PE, debt/equity from info.
  - **compute_ratios_and_scores**: EPS growth, revenue CAGR, ROE, debt/equity, profit margin, FCF trend, current ratio; normalize each to 0–100; marketcap_stability and insider_flow (placeholder); weighted sum → trust_score 0–100; verdict: ≥75 Legit, 50–74 Caution, &lt;50 Suspicious.
- **Outputs:** `{ "module", "ticker", "trust_score", "verdict", "metrics" }` or None on failure.
- **Dependencies:** yfinance, pandas, numpy, os/dotenv.

### Sentiment module

- **Location:** `NTMods/Modules/sentiment_module/run.py`
- **Entry:** `run_sentiment_module(ticker, num_articles_per_query=5, max_age_hours=6)`
- **Inputs:** ticker (str), optional article count and max age in hours.
- **Processing:** Delegates to NewsSentimentScanner (nested package): fetch news (e.g. Google News RSS), filter by age, VADER + financial lexicon per article, aggregate positive/negative/neutral %, then score = 50 + (positive_pct − negative_pct)/2 clamped 0–100; verdict Positive (≥60), Negative (≤40), else Neutral.
- **Outputs:** `{ "verdict", "score" }`; on error or no articles: Neutral, 50.
- **Dependencies:** NewsSentimentScanner (RSS, VADER, possibly feedparser/BeautifulSoup).

### M³A Fusion (main.py)

- **Location:** `NTMods/main.py`
- **Entry:** `fuse_models(ticker)` (and __main__ loop over STOCKS_LIST).
- **Inputs:** Ticker; list of tickers from env STOCKS_LIST.
- **Processing:** Runs indicator, trust, sentiment (and placeholder risk); reads trust_score, confidence, sentiment score, risk score; weighted average (FUSION_WEIGHTS) → fusion_score; verdict BUY (≥75), HOLD (≥55), SELL (&lt;55); builds detailed_report string; if TELEGRAM_ENABLED and reports, sends to Telegram.
- **Outputs:** List of `{ "ticker", "fusion_score", "verdict", "detailed_report" }`.
- **Dependencies:** All three modules + APIs/telegram_messenger.

### Module interaction summary

- **backend_api.py** calls the three run_* functions independently for the same ticker; no direct module-to-module calls; fusion is only in main.py.
- **main.py** calls the same three modules and fuses their outputs; it does not call backend_api.

---

## 6. API Architecture

All backend routes are in **backend_api.py** (Flask). The Node server proxies `/api/*` to the Flask app; in dev, Vite rewrites `/api` so the backend sees paths **without** the `/api` prefix (e.g. `/status`).

| Endpoint | Method | Handler | Request | Response | Purpose |
|----------|--------|---------|----------|----------|---------|
| `/status` | GET | api_status | — | `{ "modules_loaded": true }` | Frontend gates UI until backend is ready |
| `/market` | GET | api_market | — | Array of `{ name, price, change, color }` | Indices (Nifty, Sensex, Gold, USD/INR, Bitcoin) |
| `/movers` | GET | api_movers | — | Array of `{ symbol, price, pct_str, color }` | Top movers watchlist (e.g. RELIANCE, TCS, …) |
| `/news` | GET | api_news | — | Array of `{ source, timestamp, text, url }` | Default market news (Google News or fallback) |
| `/chart` | GET | api_chart | Query: `ticker`, `period` (1d|1mo|3mo|1y) | `{ labels, prices }` or 404 | Price history for chart |
| `/scan` | POST | api_scan | Body: `{ "company": "RELIANCE" }` | Large JSON (see below) | Full scan: ticker resolution, news, technical, fundamental, sentiment, insight, chart |

### /scan response shape

- **market**, **movers**, **news** – Same as GET endpoints.
- **wire_label**, **company** – Display label and resolved company string.
- **sentiment** – Hourly sentiment dict (for SentimentCharts).
- **volume** – Hourly article count dict (for SentimentCharts).
- **spike** – Float (market velocity ratio).
- **insight** – String (Gemini or backup).
- **technical** – Indicator module result (signal, confidence, timeframe_minutes, details).
- **fundamentals** – Trust module result (trust_score, verdict, metrics).
- **sentiment_module** – Sentiment module result (verdict, score).
- **resolved_ticker** – Resolved symbol (e.g. RELIANCE.NS).
- **stock_chart** – `{ labels, prices }` for default period.
- **error** – String or null.

---

## 7. Execution Flow (Start to Ready)

1. **Start Python backend**  
   `cd NTWeb && python backend_api.py`  
   - Loads .env (project root).  
   - Imports Flask, data_collector, signal_engine, insight_engine, adds project root to sys.path, imports NTMods run_* functions.  
   - Sets MODULES_LOADED = True.  
   - Listens on 0.0.0.0:5001.

2. **Start Node server (production)**  
   `cd NTWeb && npm run build && npm start`  
   - Build: Vite produces dist/.  
   - start: node server.js → Express listens on PORT (default 3000), serves dist/, proxies /api to BACKEND_URL.

3. **Or dev**  
   `npm run dev`  
   - Vite dev server on 3000; proxy /api → backend (rewrite /api to backend path).

4. **User opens http://localhost:3000**  
   - Express (or Vite) serves index.html and JS.

5. **Frontend bootstrap**  
   - main.jsx → App.jsx → poll GET /api/status until modules_loaded === true → then render &lt;Dashboard /&gt; (lazy).

6. **Dashboard loads**  
   - loadInitial(): GET /api/market, /api/movers, /api/news in parallel → set state → render sidebar and news.

7. **User scans**  
   - POST /api/scan → backend resolves ticker, fetches news, runs three NTMods modules, signal_engine, insight_engine, chart → single JSON → Dashboard updates and shows all cards and charts.

---

## 8. Important Functions and Core Logic

### Frontend

- **App.jsx – checkStatus / useEffect**  
  Polls /api/status and decides when to show Dashboard; drives “loading until backend ready”.
- **Dashboard – handleSubmit**  
  Triggers scan, sets loading/error/scanData; central place for scan UX.
- **Dashboard – displayNews, wireLabel, resolvedTicker, stockChart, insight, technical, fundamentals, sentimentModule, sentiment, volume, spike**  
  Derive from scanData to render all result blocks and charts.
- **api.js – request, getStatus, getMarket, getMovers, getNews, getChart, scan**  
  Single place for all backend calls and URL construction.
- **StockChart – useEffect(..., [ticker, period])**  
  Fetches /api/chart when period changes and redraws Chart.js.
- **SentimentCharts – useEffect(..., [labels, sentimentValues, volumeValues, type])**  
  Renders sentiment line or volume bar from scan sentiment/volume dicts.

### Backend (backend_api.py)

- **resolve_company_to_ticker(company)**  
  Maps company name or symbol to yfinance ticker (crypto map, Yahoo search, .NS/.BO heuristics). Used by /scan.
- **get_market_data / get_top_movers / get_stock_chart_data / get_safe_news**  
  Data helpers for /market, /movers, /chart, /news and for /scan payload.
- **api_scan**  
  Orchestrates full scan: ticker resolution, news fetch, three NTMods calls, process_signals, generate_insight, chart, _make_serializable, response JSON.
- **_make_serializable**  
  Converts numpy/pandas types to native Python for JSON (fundamentals.metrics and sentiment).

### NTMods

- **run_indicator_module**  
  Single entry for technical analysis; used by backend_api and main.py.
- **run_trust_module**  
  Single entry for fundamental analysis; used by backend_api and main.py.
- **run_sentiment_module**  
  Single entry for sentiment; used by backend_api and main.py.
- **indicator_module/run.py – analyze_single_timeframe**  
  Downloads data, runs RSI/MACD/StochRSI/Bollinger, voting and confidence.
- **trust_module/run.py – fetch_fundamentals, build_metrics_bundle, compute_ratios_and_scores, analyze_fundamentals**  
  Pipeline from yfinance to trust_score and verdict.
- **main.py – fuse_models**  
  Runs all three modules, weighted fusion, verdict, detailed_report; used by __main__ and optional Telegram.

### Supporting (NTWeb Python)

- **data_collector – fetch_news_api, fetch_google_news, parse_timestamp**  
  Used by backend for news and by scan for company news.
- **signal_engine – process_signals**  
  News list → VADER sentiment + hourly aggregation → sentiment/volume dicts, source_sent, spike.
- **insight_engine – generate_insight**  
  Gemini prompt or backup sentence for scan insight.

---

## 9. Dependencies and External Services

### Python (requirements.txt / imports)

- **beautifulsoup4** – Google News RSS parsing (data_collector).
- **feedparser** – Listed in requirements; sentiment scanner may use for RSS.
- **Flask** – backend_api.py.
- **google-generativeai** – insight_engine (Gemini).
- **numpy** – trust_module, signal_engine, backend_api _make_serializable.
- **pandas** – trust_module, indicator_module, signal_engine.
- **python-dateutil** – signal_engine date parsing.
- **python-dotenv** – .env in backend_api, insight_engine, data_collector, main, telegram, modules.
- **requests** – backend_api (Yahoo search), data_collector (NewsAPI, Google News), telegram.
- **ta** – indicator_module (RSI, MACD, StochRSI, Bollinger).
- **vaderSentiment** – signal_engine and sentiment module.
- **yfinance** – backend_api (market, chart, movers), indicator_module, trust_module.

### Node (package.json)

- **chart.js** – StockChart, SentimentCharts.
- **ejs** – In package.json but not used (legacy).
- **express** – server.js.
- **react, react-dom** – UI.
- **@vitejs/plugin-react, vite** – Build and dev.

### External services

- **Yahoo Finance** – Search API + data via yfinance.
- **NewsAPI.org** – NEWS_API_KEY for company/news search.
- **Google News RSS** – No key; data_collector and possibly sentiment scanner.
- **Google Gemini** – GOOGLE_API_KEY for insight_engine.
- **Telegram** – TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED for main.py.

---

## 10. Potential Issues or Weak Points

- **Sentiment module import path**  
  `run.py` imports from `.NewsSentimentScanner.NewsSentimentScanner.sentiment_analysis`. The inner `NewsSentimentScanner` directory may be a submodule or separate tree; if missing, the import fails. Document or consolidate the sentiment scanner location.

- **Vite proxy rewrite**  
  `rewrite: (path) => path.replace(/^\/api/, '') || '/'` turns `/api/status` into `/status` (correct). If someone later uses a path like `/api` only, the backend would get `/` and might not match. Keep all frontend calls as `/api/...` with a path segment.

- **Duplicate / optional indicator_calculators**  
  `APIs/indicator_calculators/indicators.py` defines RSI, StochRSI, MACD, Bollinger, but `indicator_module/run.py` uses `ta` for the same. The calculators are imported in run.py but the actual logic uses ta. Either remove the unused import or switch to one source to avoid confusion.

- **Error handling in scan**  
  Each of the three NTMods calls is in try/except; on exception the corresponding result is None and the rest still run. Good for resilience, but the UI does not distinguish “no data” from “backend error” for a single module.

- **Backend runs in Flask debug**  
  `app.run(..., debug=True)` is on in backend_api.py; fine for dev, should be configurable (e.g. FLASK_DEBUG env) for production.

- **reqirement.txt**  
  Typo duplicate of requirements in NTWeb; can be removed to avoid confusion.

- **EJS in package.json**  
  No EJS views left; dependency can be removed.

- **No request timeouts**  
  /scan does several network calls (Yahoo, news, yfinance). No explicit timeout on the whole request; a slow yfinance or news call can block the response.

- **Fusion only in main.py**  
  The website does not show a single “fusion” BUY/HOLD/SELL; it shows technical, fundamental, and sentiment separately. Adding a fusion card would require either computing fusion in backend_api (reusing main.py weights) or exposing a small fusion endpoint.

---

## 11. System Summary for AI Assistance

**What the system does**  
NeuralTrade is a stock analysis web app and optional batch tool. Users get a dashboard (market indices, top movers, news) and run a “scan” for a company/ticker. The backend resolves the ticker, fetches news, runs three Python analysis modules (technical, fundamental, sentiment), processes news for sentiment/volume and AI insight, and returns one JSON with everything. The UI shows price chart, AI insight, technical/fundamental/sentiment cards, sentiment/volume charts, and news. A separate CLI (NTMods/main.py) can run the same modules on a list of tickers and send a fused BUY/HOLD/SELL report to Telegram.

**Architecture**  
- **NTWeb**: React (Vite) in `src/`, built to `dist/`. Express in `server.js` serves `dist/` and proxies `/api/*` to Flask. Flask app is `backend_api.py` (port 5001): all website API routes and orchestration (data_collector, signal_engine, insight_engine, NTMods).  
- **NTMods**: Python package with `Modules/indicator_module`, `trust_module`, `sentiment_module` (each has a `run.py` with `run_*_module`) and `APIs/` (telegram_messenger, indicator_calculators). No HTTP server; used as a library by backend_api and as a script in main.py.

**Data flow**  
- User → Express (or Vite dev) → /api/* → Flask.  
- Status: GET /api/status → backend returns modules_loaded.  
- Data: GET /api/market, /movers, /news for sidebar and default news.  
- Scan: POST /api/scan with `{ company }` → backend resolves ticker, gets news, calls run_indicator_module, run_trust_module, run_sentiment_module, process_signals, generate_insight, get_stock_chart_data → one JSON → frontend sets scanData and renders all blocks.  
- Chart period change: GET /api/chart?ticker=&period= → backend returns labels/prices → StockChart updates.

**Module interaction**  
- backend_api imports and calls the three run_* functions with the same ticker; no inter-module calls.  
- main.py calls the same three, adds a placeholder risk score, fuses with FUSION_WEIGHTS, and optionally sends to Telegram.  
- indicator_module uses yfinance + ta. trust_module uses yfinance only. sentiment_module delegates to NewsSentimentScanner (RSS + VADER).

**Extending the system**  
- New API route: add in backend_api.py and (if needed) in api.js and a component.  
- New analysis module: add a `run_*.py` in NTMods/Modules, call it from backend_api.api_scan (and optionally from main.py), add a key to the scan response and a card in Dashboard.  
- New frontend page: add route and lazy load in App if needed; keep using api.js for all backend calls.  
- Fusion on the website: in api_scan, after the three modules, compute fusion (reuse main.py formula and weights), add `fusion` to the scan JSON, and add a “Fusion” card in Dashboard that shows verdict and score.

---

## 12. Document Info

- **Purpose:** Reverse-engineering and documentation only; no code changes.  
- **Audience:** New developers and AI assistants that need to understand or extend the project without reading every file.  
- **Sections:** High-level overview, folder structure, tech stack, data flow, NTMods module analysis, API list, startup sequence, important functions, dependencies, potential issues, and an AI-oriented summary.
