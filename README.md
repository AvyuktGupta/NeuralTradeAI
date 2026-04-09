# NeuralTrade

**NTWeb** (React + Node.js) is the frontend; **NTMods** (Python) is the backend. The website talks to the Python API over HTTP.

## Run the project

1. **Start the Python backend API** (must run first):
   ```bash
   cd NTWeb
   python backend_api.py
   ```
   This starts the JSON API on **http://127.0.0.1:5001**.

2. **Frontend (choose one):**
   - **Production:** Build and serve via Node:
     ```bash
     cd NTWeb
     npm install -r requirement.txt
     npm start
     ```
     Open **http://localhost:3000**. The app will show a loading screen until the backend reports `modules_loaded: true`, then the dashboard appears.
   - **Development:** Run Vite dev server (with proxy to backend):
     ```bash
     cd NTWeb
     npm run dev
     ```
     Open **http://localhost:3000** (Vite proxies `/api/*` to the Python backend).

## Ports and env

- **Node (website):** `PORT` (default `3000`)
- **Python backend:** `BACKEND_URL` (default `http://127.0.0.1:5001`). Set in NTWeb if the Python API runs on another host/port.

## Architecture

| Layer    | Location | Role |
|----------|----------|------|
| Frontend | **NTWeb** (React) | `src/` – components, pages, services; communicates with backend via `/api/*` |
| Server   | **NTWeb**        | `server.js` – serves React build, proxies `/api/*` to Python |
| Backend  | **NTWeb**        | `backend_api.py` – Flask JSON API; exposes `/status`, `/market`, `/movers`, `/news`, `/chart`, `/scan` |
| Modules  | **NTMods**       | Python analysis (indicator, trust, sentiment); used by `backend_api.py` |

NTWeb also contains `data_collector.py`, `signal_engine.py`, `insight_engine.py` used by `backend_api.py` for news, signals, and AI insight.

## Sentiment Module (High‑Level Overview)

The **Sentiment Module** is a Python component that reads recent news for a ticker and turns it into a single easy‑to‑read sentiment score and label.

- **Inputs**
  - `ticker`: stock symbol (e.g. `AAPL`, `RELIANCE.NS`).
  - `num_articles_per_query`: how many recent articles to analyse (e.g. 5 or 10).
  - `max_age_hours`: only use articles from the last N hours (e.g. 6 or 24).

- **How it fetches news**
  - Builds a query like `"{ticker} stock"` and hits **Google News RSS**.
  - Parses the feed, keeps only articles that are newer than `now - max_age_hours`.
  - For each article it tries to download the full web page and extracts the text from `<p>` tags; if that fails it falls back to the RSS summary.

- **How sentiment is calculated**
  - For each article it joins `title + first 500 characters of content`.
  - Runs this text through **VADER** sentiment analysis with a **financial lexicon** (words like “jump”, “surge”, “crash” are boosted positive/negative).
  - VADER returns a compound score in \[-1, 1\] and the module classifies each article as:
    - Positive (score > 0.05)
    - Negative (score < -0.05)
    - Neutral (otherwise)
  - It then counts how many articles are Positive/Negative/Neutral and computes:
    - `total_articles`
    - `positive_pct` and `negative_pct` (0–100) over all analysed articles.

- **Final score and output**
  - Uses `positive_pct` and `negative_pct` to build a **0–100 score**:
    - `score = 50 + (positive_pct - negative_pct) / 2` (clamped between 0 and 100).
  - Maps the score to a final verdict:
    - score ≥ 60 → `Positive`
    - score ≤ 40 → `Negative`
    - otherwise → `Neutral`
  - Returns a simple JSON‑friendly object:
    - `{ "verdict": "Positive|Neutral|Negative", "score": 0–100 }`

In the Node.js site, this object is exposed as `sentiment_module` and used to render the **Sentiment Analysis (NeuralTrade)** card and score on the dashboard.

---

## Fundamental Module (Trust / Fundamental Analysis)

The **Fundamental Module** fetches financial statements for a stock, computes key ratios and growth metrics, normalizes them into scores, and outputs a **trust score** (0–100) and a text verdict. It lives in `NeuralTrade/Modules/trust_module/run.py` and uses **yfinance** for data.

### Inputs

| Parameter              | Type   | Required | Description              |
|------------------------|--------|----------|--------------------------|
| `input_data`           | `dict` |    Yes   | Must contain `"ticker"`. |
| `input_data["ticker"]` | `str`  |    Yes   | Stock symbol (Ticker).   |

**Example:** `run_trust_module({"ticker": "TVSMOTOR.NS"})`

### How data is fetched

1. **`fetch_fundamentals(ticker)`** uses `yf.Ticker(ticker)` to get:
   - **`info`** — company info (market cap, P/E, debt/equity, etc.).
   - **`financials`** — income statement (revenue, net income, EPS).
   - **`balance_sheet`** — equity, debt, current assets/liabilities.
   - **`cashflow`** — e.g. free cash flow.

2. Returns a dict: `{ "ticker", "info", "financials", "balance_sheet", "cashflow" }`.

### How data is processed

**Step 1 — Build metrics bundle (`build_metrics_bundle`)**

- Converts each financial DataFrame into sorted time series (by date).
- Finds the right rows using keyword matching (e.g. "total revenue", "net income", "free cash flow").
- Trims series to the last **N years** (configurable via `YEARS_TO_CHECK`, default 3).
- Produces a **metrics bundle** with time series for: revenue, net income, EPS, equity, debt, current assets/liabilities, FCF, plus market cap and P/E from `info`.

**Step 2 — Compute ratios and scores (`compute_ratios_and_scores`)**

- **Growth:** EPS growth and Revenue CAGR (compound annual growth rate) from first to last year in the trimmed series.
- **Ratios:** Debt/Equity, ROE %, Profit margin %, FCF trend %, Current ratio (current assets / current liabilities).
- **Normalization:** Each raw value is passed to `normalize_score()` with “good” ranges (e.g. ROE 15–100%, D/E 0–1) and converted to a **0–100** score. Missing or invalid data → 50 (neutral).
- **Extra scores:** Market cap “stability” (100 if > $10B, 70 if > $1B, else 50); insider flow is a placeholder (50).
- **Reasons:** The module also builds a list of warning messages (e.g. large revenue spikes, rising debt, low liquidity, low ROE) for internal use.

### How the trust score is calculated

- **Weights** (configurable via env; defaults sum to 100):
  - EPS growth: 15, Revenue growth: 15, ROE: 12, Debt/Equity: 12, Profit margin: 10, FCF trend: 12, Current ratio: 8, Market cap stability: 6, Insider flow: 10.
- **Formula:**  
  `trust_score = (sum of each metric’s 0–100 score × its weight) / total_weight`  
  then clamped to **0–100**.
- **Verdict** from the score:
  - **≥ 75** → `"Legit / Financially Strong"`
  - **50–74** → `"Caution / Mixed Signals"`
  - **< 50** → `"Suspicious / Risky — investigate further"`

### Outputs

The module returns a single dict (or `None` on failure):

| Field         | Type    | Description                                 |
|---------------|---------|---------------------------------------------|
| `module`      | `str`   | `"Fundamental Analyzer"` |
| `ticker`      | `str`   | The ticker that was analysed|
| `trust_score` | `float` | 0–100, rounded to 1 decimal |
| `verdict`     | `str`   | One of: Legit / Financially Strong, Caution / Mixed Signals, Suspicious / Risky |
| `metrics`     | `dict`  | Raw metrics: EPS Growth %, Revenue Growth %, ROE %, Debt/Equity, Margin %, FCF Trend %, Current Ratio |

### End-to-end flow (summary)

```
Input: {"ticker": "TVSMOTOR.NS"}
    → fetch_fundamentals(ticker)   [yfinance: info + financials + balance_sheet + cashflow]
    → build_metrics_bundle()       [time series + market_cap, PE, D/E, etc.]
    → compute_ratios_and_scores()  [growth & ratios → normalize to 0–100]
    → Trust score = weighted average of 9 scores (0–100)
    → Verdict = bucket (Legit / Caution / Suspicious)
Output: { module, ticker, trust_score, verdict, metrics }
```

In the Node.js site and fusion logic, this result is used as the **fundamental** analysis; `trust_score` is combined with technical, sentiment, and risk scores to produce the overall fusion score.

---

## Technical Module (Technical / Indicator Analysis)

The **Technical Module** analyzes recent price action for a stock using common indicators and outputs a simple **BUY / SELL / HOLD** signal with a **confidence score** (0–100). It lives in `NeuralTrade/Modules/indicator_module/run.py` and uses **yfinance** + **ta**.

### Inputs

- `input_data`: dict with `"ticker"` (e.g. `"TVSMOTOR.NS"`).
- `timeframe_minutes` (int): candle interval in minutes (e.g. 1, 5, 15, 30, 60). Default is **15**.

**Example:** `run_indicator_module({"ticker": "TVSMOTOR.NS"}, timeframe_minutes=15)`

### How data is fetched

1. `run_indicator_module` converts `timeframe_minutes` to a yfinance interval string via `minutes_to_interval` (e.g. `15 → "15m"`, `60 → "1h"`).
2. `analyze_single_timeframe` calls:
   - `yf.download(ticker, period="60d", interval=interval, progress=False)`
3. Only the **Close** price series is used; it is flattened to a 1D pandas Series and passed to the indicators.
4. If the download is empty, the module returns a `"NO DATA"` result with `confidence = 0`.

### How data is processed

For the chosen `timeframe_minutes`, the module computes **four indicators** on the last 60 days of Close prices:

- **RSI** – overbought/oversold oscillator.
- **MACD** – trend + momentum (MACD histogram).
- **StochRSI** – momentum inside RSI.
- **Bollinger Bands** – volatility bands around a moving average.

For the **latest candle only** (last row of each indicator), each indicator casts **one vote**:

- **RSI**
  - `< 30` → **BUY** vote (oversold).
  - `> 70` → **SELL** vote (overbought).
- **MACD**
  - MACD histogram `> 0` → **BUY** vote.
  - Else → **SELL** vote.
- **StochRSI**
  - K `< 0.2` → **BUY** vote.
  - K `> 0.8` → **SELL** vote.
- **Bollinger Bands**
  - Close `< lower band` → **BUY** vote.
  - Close `> upper band` → **SELL** vote.

This produces:

- `buy`: number of indicators pointing to BUY (0–4).
- `sell`: number of indicators pointing to SELL (0–4).

### How the technical score and signal are calculated

- **Confidence (technical score)**  
  `confidence = (abs(buy - sell) / 4) * 100` (rounded to 1 decimal, 0–100).
  - If all 4 agree (4 vs 0) → 100.
  - If indicators are split (e.g. 2 vs 2) → 0.
  - Mixed, but tilted (e.g. 3 vs 1) → 50.

- **Final signal**
  - `BUY` if `buy > sell`.
  - `SELL` if `sell > buy`.
  - `HOLD` if `buy == sell`.

### Outputs

On success, `run_indicator_module` returns a single dict:

| Field              | Type    | Description                                  |
|--------------------|---------|----------------------------------------------|
| `module`           | `str`   | `"Technical Analyzer"`                       |
| `ticker`           | `str`   | The ticker that was analysed                 |
| `signal`           | `str`   | `"BUY"`, `"SELL"`, or `"HOLD"`               |
| `confidence`       | `float` | 0–100, rounded to 1 decimal                  |
| `details`          | `list`  | Per‑timeframe details (currently one item)   |
| `timeframe_minutes`| `int`   | Candle interval used (e.g. 15)               |

If no price data is available for the ticker/interval, the module returns:

```json
{
  "module": "Technical Analyzer",
  "ticker": "TICKER",
  "signal": "NO DATA",
  "confidence": 0,
  "details": [],
  "timeframe_minutes": 15
}
```

In the Node.js site and fusion logic, this result is used as the **technical** analysis; `confidence` is combined with fundamental, sentiment, and risk scores to produce the overall fusion score and final BUY/HOLD/SELL verdict.
