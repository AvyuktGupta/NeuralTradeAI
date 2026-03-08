# NeuralTrade – Audit, Cleanup & Refactor Summary

## 1. New folder structure (after refactor)

```
NeuralTrade/
├── NTWeb/                          # Frontend (React) + Node server + Python API
│   ├── src/
│   │   ├── components/             # React components
│   │   │   ├── LoadingScreen.jsx
│   │   │   ├── SentimentCharts.jsx
│   │   │   └── StockChart.jsx
│   │   ├── pages/
│   │   │   └── Dashboard.jsx
│   │   ├── services/
│   │   │   └── api.js              # API client (status, market, movers, news, chart, scan)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   │   └── vite.svg
│   ├── dist/                       # Vite build output (generated)
│   ├── index.html                  # Vite entry
│   ├── vite.config.js
│   ├── server.js                   # Express: static + /api proxy
│   ├── backend_api.py              # Flask API (status, market, movers, news, chart, scan)
│   ├── data_collector.py
│   ├── signal_engine.py
│   ├── insight_engine.py
│   └── package.json
├── NTMods/                         # Backend analysis modules (Python)
│   ├── main.py                     # M³A Fusion Machine
│   ├── Modules/
│   │   ├── indicator_module/
│   │   ├── trust_module/
│   │   └── sentiment_module/
│   └── APIs/
│       ├── telegram_messenger/
│       └── indicator_calculators/
├── requirements.txt               # Python deps (NTMods + NTWeb backend)
├── README.md
└── REFACTOR.md                     # This file
```

---

## 2. Deleted files

| File | Reason |
|------|--------|
| `NTWeb/app.py` | Legacy Flask app; replaced by Node + React + backend_api.py |
| `NTWeb/templates/index.html` | Old Flask template; UI moved to React |
| `NTWeb/views/index.ejs` | EJS view; frontend is now React |
| `NTWeb/react-src/` (entire folder) | Unused Vite scaffold; React app lives in NTWeb/src |

---

## 3. Major improvements

### Cleanup
- **Dead code removed** in `NTWeb/backend_api.py`: duplicate/unreachable block in `_yahoo_search_ticker` (lines 61–76).
- **Unused dependencies removed** from `requirements.txt`: `torch`, `transformers`, `textblob` (sentiment module uses only VADER; FinBERT and TextBlob code removed from `NewsSentimentScanner/.../sentiment_analysis.py`).
- **Redundant Flask app and EJS** removed; single stack: React frontend + Express proxy + Flask JSON API.

### Frontend → React
- **NTWeb is now a React app** (Vite + React), with:
  - `src/components/`, `src/pages/`, `src/services/`
  - `App.jsx`, `main.jsx`
  - All UI logic in React components; backend communication via `src/services/api.js` (HTTP to NTMods/backend_api).

### Backend module loading & loading screen
- **Backend:** `GET /status` returns `{ "modules_loaded": true }` (Flask in `backend_api.py`).
- **Frontend:** On startup, polls `GET /api/status` until `modules_loaded === true`; until then shows a **loading screen** with rotating messages:
  - "Loading Analysis Modules..."
  - "Preparing AI Systems..."
  - "Thank you for your cooperation."
- After modules are reported loaded, the app shows the main Dashboard.

### Performance
- **Lazy loading:** Dashboard page is loaded with `React.lazy()` so the main bundle stays smaller.
- **Memoization:** `StockChart` and `SentimentCharts` wrapped in `React.memo` to reduce re-renders.
- **Single proxy:** All `/api/*` (including `/api/status`) go through one Express proxy to the Python backend; no duplicate client logic.
- **Smaller Python stack:** Dropping torch/transformers/textblob reduces install size and startup for the sentiment path.

### Code organization
- **Frontend:** NTWeb (React) – components, pages, services, one API module.
- **Backend:** NTMods (Python modules) + NTWeb/backend_api.py (Flask).
- **Communication:** HTTP only; frontend uses `/api/status`, `/api/market`, `/api/movers`, `/api/news`, `/api/chart`, `/api/scan`.

---

## 4. Confirmation: frontend is React

**Yes.** The website is built with **React** (Vite, React 19, JSX). There is no Python-based rendering (no Flask templates or EJS). The UI is in `NTWeb/src/` and is served as a static build from `NTWeb/dist/` by Express, which proxies `/api/*` to the Python backend.

---

## 5. How to run after refactor

1. **Start Python backend:**  
   `cd NTWeb` → `python backend_api.py` (listens on 5001).

2. **Frontend:**
   - **Production:** `npm run build` then `npm start` (Express serves `dist/` and proxies `/api`).
   - **Development:** `npm run dev` (Vite dev server, proxying `/api` to 5001).

3. Open **http://localhost:3000**. You will see the loading screen until the backend is up and returns `modules_loaded: true`, then the main dashboard loads.
