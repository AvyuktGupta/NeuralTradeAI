# NeuralTrade Web (Node.js)

The website is served by **Node.js** (Express) and uses the same **Python modules** for all logic (data_collector, signal_engine, insight_engine, NeuralTrade modules). No changes to those Python modules are required.

## Run the Node.js site

1. **Start the Python backend API** (must run first):
   ```bash
   cd NeuralTradeWeb
   python backend_api.py
   ```
   This starts the JSON API on **http://127.0.0.1:5001**.

2. **Install Node dependencies and start the web server**:
   ```bash
   npm install
   npm start
   ```
   The site is at **http://localhost:3000**.

## Ports and env

- **Node (website):** `PORT` (default `3000`)
- **Python backend:** `BACKEND_URL` (default `http://127.0.0.1:5001`). Set this if you run the Python API on another host/port.

## Files

| File | Role |
|------|------|
| `server.js` | Express app: serves pages, proxies `/api/chart`, calls Python backend for data |
| `views/index.ejs` | Same UI as original Flask template (EJS instead of Jinja2) |
| `backend_api.py` | Flask JSON API used by Node; reuses all Python modules |
| `app.py` | Original Flask app (optional; you can keep using it or use Node + backend_api) |

Python modules (`data_collector.py`, `signal_engine.py`, `insight_engine.py`, NeuralTrade modules) are **unchanged** and only used by `backend_api.py`.
