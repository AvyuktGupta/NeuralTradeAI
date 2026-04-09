"""
JSON-only Flask API for the Node.js website. All business logic and Python modules
(data_collector, signal_engine, insight_engine, NTMods modules) stay here.
Node.js Express server calls these endpoints and renders the EJS template.
"""
import os
import sys

# Load .env from project root first (before any module that reads env)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_file = os.path.join(_root, ".env")
if os.path.isfile(_env_file):
    from dotenv import load_dotenv
    load_dotenv(_env_file)

from flask import Flask, request, jsonify, Response, stream_with_context
import re
import json
import yfinance as yf
import requests
from data_collector import fetch_news_api, fetch_google_news, parse_timestamp
from signal_engine import process_signals
from insight_engine import generate_insight
from datetime import datetime

# Allow importing NTMods (sibling folder: NeuralTradeModules)
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
from NTMods.Modules.indicator_module.run import run_indicator_module
from NTMods.Modules.trust_module.run import run_trust_module

app = Flask(__name__)

# Modules are considered loaded when this process is running (imports succeeded at startup)
MODULES_LOADED = True

# News + sentiment configuration
NEWS_LATEST_COUNT = 50

# --- Resolve company name or ticker to yfinance symbol ---
_CRYPTO_MAP = {"BTC": "BTC-USD", "BITCOIN": "BTC-USD", "ETH": "ETH-USD", "ETHEREUM": "ETH-USD"}

def _yahoo_search_ticker(query):
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    params = {"q": query, "quotesCount": 8, "newsCount": 0}
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        quotes = data.get("quotes") or []
        for q in quotes:
            sym = (q.get("symbol") or "").strip()
            if not sym or sym in ("SPY", "QQQ"):
                continue
            # Fixed parenthesis typo below (was: ... or (str(q.get("exchange") or "").upper() in ("NSI", "NSE"):
            if ".NS" in sym or str(q.get("exchange") or "").upper() in ("NSI", "NSE"):
                return sym
            if ".BO" in sym:
                return sym
        if quotes:
            return (quotes[0].get("symbol") or "").strip() or None
        return None
    except Exception:
        return None

def resolve_company_to_ticker(company):
    if not company or not str(company).strip():
        return None
    s = str(company).strip()
    s_upper = s.upper()
    if s_upper in _CRYPTO_MAP:
        return _CRYPTO_MAP[s_upper]
    # Already fully-qualified (e.g. RELIANCE.NS, BTC-USD) — use as-is
    if "." in s or ("-" in s and re.match(r"^[A-Z0-9]+-[A-Z]+$", s_upper)):
        return s_upper if s == s_upper else s
    # Always ask Yahoo to resolve the correct symbol first
    found = _yahoo_search_ticker(s)
    if found:
        return found
    # Yahoo couldn't find it — return raw input as fallback
    if re.match(r"^[A-Za-z0-9\.\-/=^]+$", s) and len(s) <= 20:
        return s_upper
    return None

def _is_valid_ticker(ticker):
    """
    Lightweight validation: a valid ticker should return some price history.
    This prevents running the rest of the pipeline for obviously-wrong inputs.
    """
    if not ticker:
        return False
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d", interval="1d")
        return hist is not None and not hist.empty and len(hist) >= 1
    except Exception:
        return False

def get_stock_chart_data(ticker, period="3mo"):
    try:
        t = yf.Ticker(ticker)
        if period == "1d":
            hist = t.history(period="1d", interval="15m")
            if hist is None or hist.empty or len(hist) < 2:
                hist = t.history(period="5d", interval="1d")
                label_fmt = "%Y-%m-%d"
            else:
                label_fmt = "%H:%M"
        else:
            hist = t.history(period=period)
            label_fmt = "%Y-%m-%d"
        if hist is None or hist.empty or len(hist) < 2:
            return None
        dates = []
        for d in hist.index:
            try:
                dates.append(d.strftime(label_fmt) if hasattr(d, 'strftime') else str(d))
            except Exception:
                dates.append(str(d))
        import math
        prices = [float(round(c, 2)) if not math.isnan(c) else None for c in hist["Close"]]
        return {"labels": dates, "prices": prices}
    except Exception:
        return None

def get_safe_news():
    news = []
    try:
        news = fetch_google_news("Stock Market India", page_size=6)
    except:
        pass
    if not news:
        t = datetime.now().strftime("%H:%M")
        news = [
            {"source": "Bloomberg", "timestamp": t, "text": "Sensex rallies 500 pts as foreign inflows surge in IT sector.", "url": ""},
            {"source": "Reuters", "timestamp": t, "text": "Gold hits record high of ₹64k; Oil stabilizes at $78.", "url": ""},
            {"source": "Mint", "timestamp": t, "text": "RBI Governor hints at pause in interest rate hikes.", "url": ""},
            {"source": "Economic Times", "timestamp": t, "text": "TCS and Infosys lead Nifty gainers ahead of earnings.", "url": ""},
            {"source": "CNBC", "timestamp": t, "text": "Startup funding sees 15% growth in Q1 2026.", "url": ""}
        ]
    return news

def _make_serializable(obj):
    """Convert numpy/pandas types to native Python for JSON, replacing NaN/Inf with None."""
    if obj is None:
        return None
    import math
    import numpy as np
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64)):
        v = float(obj)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, np.ndarray):
        return _make_serializable(obj.tolist())
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(x) for x in obj]
    return obj


def _dedup_sort_and_trim_news(items, limit=NEWS_LATEST_COUNT):
    """
    Deduplicate by URL (preferred) or (text,timestamp), then sort latest-first and trim.
    """
    if not items:
        return []

    deduped = []
    seen = set()
    for it in items:
        if not isinstance(it, dict):
            continue
        url = (it.get("url") or "").strip()
        text = (it.get("text") or "").strip()
        ts = (it.get("timestamp") or "").strip()
        if url:
            key = ("u", url)
        else:
            key = ("t", text.lower(), ts)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    deduped.sort(key=lambda x: parse_timestamp(x.get("timestamp")), reverse=True)
    return deduped[: max(1, int(limit or 0))]


def _sentiment_summary_from_trend(sentiment_trend_dict):
    """
    Option A: derive a 0–100 sentiment score from sentiment trend values (compound in [-1,1]).
    Uses a simple recency weighting (newer buckets matter more).
    """
    if not isinstance(sentiment_trend_dict, dict) or not sentiment_trend_dict:
        return {"verdict": "Neutral", "score": 50}

    vals = []
    for _, v in sentiment_trend_dict.items():
        try:
            vals.append(float(v))
        except Exception:
            pass

    if not vals:
        return {"verdict": "Neutral", "score": 50}

    # Recency weighting: 1..n
    n = len(vals)
    weights = list(range(1, n + 1))
    weighted_mean = sum(w * s for w, s in zip(weights, vals)) / max(1.0, float(sum(weights)))

    score = int(round(50 + 50 * weighted_mean))
    score = max(0, min(100, score))

    if score >= 60:
        verdict = "Positive"
    elif score <= 40:
        verdict = "Negative"
    else:
        verdict = "Neutral"

    return {"verdict": verdict, "score": score}

# --- API routes ---
@app.route("/status", methods=["GET"])
def api_status():
    """Report whether analysis modules (NTMods) are ready. Used by frontend to show loading until ready."""
    return jsonify({"modules_loaded": MODULES_LOADED})


@app.route("/news", methods=["GET"])
def api_news():
    return jsonify(get_safe_news())

@app.route("/chart", methods=["GET"])
def api_chart():
    ticker = request.args.get("ticker", "").strip()
    period = request.args.get("period", "3mo").strip().lower()
    if period not in ("1d", "1mo", "3mo", "1y"):
        period = "3mo"
    if not ticker:
        return jsonify({"error": "Missing ticker"}), 400
    data = get_stock_chart_data(ticker, period=period)
    if data is None:
        return jsonify({"error": "No data"}), 404
    return jsonify(data)

@app.route("/scan", methods=["POST"])
def api_scan():
    """Run full scan for a company; returns all data needed to render the page."""
    body = request.get_json(silent=True) or {}
    company = (body.get("company") or request.form.get("company") or "").strip()

    news = get_safe_news()

    if not company:
        return jsonify({
            "news": news,
            "wire_label": None,
            "company": "",
            "error": None
        })

    ticker = resolve_company_to_ticker(company)
    if not _is_valid_ticker(ticker):
        return jsonify({
            "news": news,
            "wire_label": None,
            "company": "",
            "error": "Wrong Ticker/Name",
            "sentiment": {},
            "sentiment_summary": None,
            "volume": {},
            "spike": 1.0,
            "insight": "",
            "technical": None,
            "fundamentals": None,
            "resolved_ticker": None,
            "stock_chart": None
        })
    ticker_short = (ticker.replace(".NS", "").replace(".BO", "").split("-")[0]) if ticker else None

    company_news = []
    if company:
        company_news = fetch_news_api(company, page_size=NEWS_LATEST_COUNT) + fetch_google_news(company, page_size=NEWS_LATEST_COUNT)
        if not company_news and ticker_short:
            company_news = fetch_news_api(ticker_short, page_size=NEWS_LATEST_COUNT) + fetch_google_news(ticker_short, page_size=NEWS_LATEST_COUNT)
    company_news = _dedup_sort_and_trim_news(company_news, limit=NEWS_LATEST_COUNT)

    technical = None
    fundamentals = None
    if ticker:
        try:
            technical = run_indicator_module({"ticker": ticker}, timeframe_minutes=15)
        except Exception:
            pass
        try:
            fundamentals = run_trust_module({"ticker": ticker})
        except Exception:
            pass

    if not ticker and not company_news:
        return jsonify({
            "news": news,
            "wire_label": None,
            "company": "",
            "error": "Could not resolve to a ticker or find news. Try a symbol (e.g. RELIANCE, TCS) or company name.",
            "sentiment": {},
            "volume": {},
            "spike": 1.0,
            "insight": "",
            "technical": None,
            "fundamentals": None,
            "resolved_ticker": None,
            "stock_chart": None
        })

    if company_news:
        sentiment, volume, source_sent, spike = process_signals(company_news)
        sentiment_summary = _sentiment_summary_from_trend(sentiment)
        insight = generate_insight(
            company or ticker_short or "",
            spike,
            source_sent,
            [d["text"] for d in company_news[:3]],
            technical=technical,
        )
        display_news = company_news
    else:
        sentiment, volume, source_sent, spike = {}, {}, "neutral", 1.0
        sentiment_summary = {"verdict": "Neutral", "score": 50}
        insight = generate_insight(
            company or ticker_short or ticker or "",
            spike,
            source_sent,
            [],
            technical=technical,
        )
        display_news = news

    stock_chart = get_stock_chart_data(ticker) if ticker else None

    result = {
        "news": display_news,
        "wire_label": (company or ticker_short or ticker) if company_news else None,
        "company": company or ticker_short or ticker or "",
        "sentiment": sentiment,
        "sentiment_summary": sentiment_summary,
        "volume": volume,
        "spike": float(spike) if spike is not None else 1.0,
        "insight": insight,
        "technical": technical,
        "fundamentals": fundamentals,
        "resolved_ticker": ticker,
        "stock_chart": stock_chart,
        "error": None
    }
    return jsonify(_make_serializable(result))


@app.route("/scan_stream", methods=["GET"])
def api_scan_stream():
    """
    Server-Sent Events (SSE) scan endpoint.
    Emits phase events as work completes so the frontend can show non-repeating progress.

    Events:
      - phase: {"phase": <key>, "status": "start"|"done"}
      - still: {"phase": <key>, "message": "Still working"}
      - result: <final JSON payload>
      - error: {"message": "..."}
    """
    company = (request.args.get("company") or "").strip()

    def sse(event, data_obj):
        try:
            payload = json.dumps(_make_serializable(data_obj), ensure_ascii=False)
        except Exception:
            payload = json.dumps({"message": "serialization_error"})
        return f"event: {event}\ndata: {payload}\n\n"

    @stream_with_context
    def generate():
        # Always send something quickly so the connection feels responsive.
        yield sse("phase", {"phase": "stock", "status": "start"})

        try:
            news = get_safe_news()

            if not company:
                yield sse("phase", {"phase": "stock", "status": "done"})
                yield sse("result", {"news": news, "wire_label": None, "company": "", "error": None})
                return

            # --- Phase: company resolution / stock ---
            ticker = resolve_company_to_ticker(company)
            if not _is_valid_ticker(ticker):
                yield sse("phase", {"phase": "stock", "status": "done"})
                yield sse(
                    "result",
                    {
                        "news": news,
                        "wire_label": None,
                        "company": "",
                        "error": "Wrong Ticker/Name",
                        "sentiment": {},
                        "sentiment_summary": None,
                        "volume": {},
                        "spike": 1.0,
                        "insight": "",
                        "technical": None,
                        "fundamentals": None,
                        "resolved_ticker": None,
                        "stock_chart": None,
                    },
                )
                return
            ticker_short = (ticker.replace(".NS", "").replace(".BO", "").split("-")[0]) if ticker else None
            yield sse("phase", {"phase": "stock", "status": "done"})

            # --- Phase: news ---
            yield sse("phase", {"phase": "news", "status": "start"})
            company_news = []
            if company:
                company_news = fetch_news_api(company, page_size=NEWS_LATEST_COUNT) + fetch_google_news(company, page_size=NEWS_LATEST_COUNT)
                if not company_news and ticker_short:
                    company_news = fetch_news_api(ticker_short, page_size=NEWS_LATEST_COUNT) + fetch_google_news(ticker_short, page_size=NEWS_LATEST_COUNT)
            company_news = _dedup_sort_and_trim_news(company_news, limit=NEWS_LATEST_COUNT)
            yield sse("phase", {"phase": "news", "status": "done"})

            # --- Phase: company details (placeholder for future enrichment) ---
            yield sse("phase", {"phase": "company", "status": "start"})
            yield sse("phase", {"phase": "company", "status": "done"})

            technical = None
            fundamentals = None

            # --- Phase: technical indicators ---
            yield sse("phase", {"phase": "ta", "status": "start"})
            if ticker:
                try:
                    technical = run_indicator_module({"ticker": ticker}, timeframe_minutes=15)
                except Exception:
                    pass
                try:
                    fundamentals = run_trust_module({"ticker": ticker})
                except Exception:
                    pass
            yield sse("phase", {"phase": "ta", "status": "done"})

            if not ticker and not company_news:
                yield sse(
                    "result",
                    {
                        "news": news,
                        "wire_label": None,
                        "company": "",
                        "error": "Could not resolve to a ticker or find news. Try a symbol (e.g. RELIANCE, TCS) or company name.",
                        "sentiment": {},
                        "volume": {},
                        "spike": 1.0,
                        "insight": "",
                        "technical": None,
                        "fundamentals": None,
                        "resolved_ticker": None,
                        "stock_chart": None,
                    },
                )
                return

            # --- Phase: AI insight (may take the longest) ---
            yield sse("phase", {"phase": "ai", "status": "start"})

            insight = ""
            sentiment = {}
            sentiment_summary = {"verdict": "Neutral", "score": 50}
            volume = {}
            source_sent = "neutral"
            spike = 1.0
            display_news = news

            if company_news:
                sentiment, volume, source_sent, spike = process_signals(company_news)
                sentiment_summary = _sentiment_summary_from_trend(sentiment)
                display_news = company_news
                headlines = [d["text"] for d in company_news[:3]]
                asset_name = company or ticker_short or ""
            else:
                headlines = []
                asset_name = company or ticker_short or ticker or ""

            # Run generate_insight in a background thread so we can emit "still working" ticks.
            import threading
            result_holder = {"insight": ""}
            err_holder = {"err": None}

            def _run():
                try:
                    result_holder["insight"] = generate_insight(
                        asset_name,
                        spike,
                        source_sent,
                        headlines,
                        technical=technical,
                    )
                except Exception as ex:
                    err_holder["err"] = str(ex)

            th = threading.Thread(target=_run, daemon=True)
            th.start()

            # Emit gentle ticks while we wait.
            import time
            tick_messages = [
                "Still working",
                "Cross-checking signals",
                "Synthesizing context",
            ]
            t0 = time.time()
            tick_i = 0
            while th.is_alive():
                # first tick after a short delay, then periodic ticks
                time.sleep(0.85 if (time.time() - t0) < 1.2 else 1.0)
                yield sse("still", {"phase": "ai", "message": tick_messages[tick_i % len(tick_messages)]})
                tick_i += 1

            if err_holder["err"]:
                yield sse("error", {"message": err_holder["err"]})
                insight = ""
            else:
                insight = result_holder["insight"] or ""

            yield sse("phase", {"phase": "ai", "status": "done"})

            stock_chart = get_stock_chart_data(ticker) if ticker else None

            yield sse(
                "result",
                {
                    "news": display_news,
                    "wire_label": (company or ticker_short or ticker) if company_news else None,
                    "company": company or ticker_short or ticker or "",
                    "sentiment": sentiment,
                    "sentiment_summary": sentiment_summary,
                    "volume": volume,
                    "spike": float(spike) if spike is not None else 1.0,
                    "insight": insight,
                    "technical": technical,
                    "fundamentals": fundamentals,
                    "resolved_ticker": ticker,
                    "stock_chart": stock_chart,
                    "error": None,
                },
            )
            return

        except Exception as e:
            yield sse("error", {"message": str(e)})
            # Also send a result-like terminal event so the frontend can stop loading.
            yield sse("result", {"news": get_safe_news(), "company": company or "", "error": str(e)})

    return Response(generate(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)
