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

from flask import Flask, request, jsonify
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
from NTMods.Modules.sentiment_module.run import run_sentiment_module

app = Flask(__name__)

# Modules are considered loaded when this process is running (imports succeeded at startup)
MODULES_LOADED = True

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
    words = [w for w in s.split() if re.match(r"^[A-Za-z0-9]+$", w)]
    if s_upper in _CRYPTO_MAP:
        return _CRYPTO_MAP[s_upper]
    if "." in s or ("-" in s and re.match(r"^[A-Z0-9]+-[A-Z]+$", s_upper)):
        return s_upper if s == s_upper else s
    ticker_like = len(s) <= 10 and " " not in s and re.match(r"^[A-Za-z0-9\.\-]+$", s)
    if ticker_like:
        return s_upper + ".NS"
    found = _yahoo_search_ticker(s)
    if not found and len(words) >= 2:
        found = _yahoo_search_ticker(" ".join(words[:2]))
    if found:
        if "." not in found and "-" not in found and len(found) <= 10:
            return found + ".NS"
        return found
    if len(words) >= 2:
        two_word_ticker = "".join(w.upper() for w in words[:2]) + ".NS"
        if len(two_word_ticker) <= 14:
            return two_word_ticker
    first_word = words[0] if words else s.split()[0] if s.split() else s
    if first_word and re.match(r"^[A-Za-z0-9]+$", first_word) and len(first_word) <= 10:
        return first_word.upper() + ".NS"
    return (s_upper.replace(" ", "") + ".NS") if s_upper else None

def get_market_data():
    tickers = {"NIFTY 50": "^NSEI", "SENSEX": "^BSESN", "GOLD": "GC=F", "USD/INR": "INR=X", "BITCOIN": "BTC-USD"}
    data = []
    try:
        for name, symbol in tickers.items():
            t = yf.Ticker(symbol)
            try:
                price = t.fast_info.last_price
                prev = t.fast_info.previous_close
                change = price - prev
                data.append({
                    "name": name,
                    "price": f"{price:,.2f}",
                    "change": f"{change:+.2f} ({(change/prev)*100:+.2f}%)",
                    "color": "text-emerald-400" if change >= 0 else "text-red-400"
                })
            except:
                continue
    except:
        pass
    return data

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
        prices = [float(round(c, 2)) for c in hist["Close"]]
        return {"labels": dates, "prices": prices}
    except Exception:
        return None

def get_top_movers():
    watchlist = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "TATAMOTORS.NS"]
    movers = []
    for symbol in watchlist:
        try:
            t = yf.Ticker(symbol)
            price = t.fast_info.last_price
            change_pct = ((price - t.fast_info.previous_close) / t.fast_info.previous_close) * 100
            movers.append({
                "symbol": symbol.replace(".NS", ""),
                "price": f"₹{price:,.2f}",
                "pct_str": f"{change_pct:+.2f}%",
                "color": "text-emerald-400" if change_pct >= 0 else "text-red-400"
            })
        except:
            continue
    return movers

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
    """Convert numpy/pandas types to native Python for JSON."""
    if obj is None:
        return None
    import numpy as np
    if isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_make_serializable(x) for x in obj]
    return obj

# --- API routes ---
@app.route("/status", methods=["GET"])
def api_status():
    """Report whether analysis modules (NTMods) are ready. Used by frontend to show loading until ready."""
    return jsonify({"modules_loaded": MODULES_LOADED})


@app.route("/market", methods=["GET"])
def api_market():
    return jsonify(get_market_data())

@app.route("/movers", methods=["GET"])
def api_movers():
    return jsonify(get_top_movers())

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

    market = get_market_data()
    movers = get_top_movers()
    news = get_safe_news()

    if not company:
        return jsonify({
            "market": market,
            "movers": movers,
            "news": news,
            "wire_label": None,
            "company": "",
            "error": None
        })

    ticker = resolve_company_to_ticker(company)
    ticker_short = (ticker.replace(".NS", "").replace(".BO", "").split("-")[0]) if ticker else None

    company_news = []
    if company:
        company_news = fetch_news_api(company, page_size=6) + fetch_google_news(company, page_size=6)
        if not company_news and ticker_short:
            company_news = fetch_news_api(ticker_short, page_size=6) + fetch_google_news(ticker_short, page_size=6)
    if company_news:
        company_news.sort(key=lambda x: parse_timestamp(x["timestamp"]), reverse=True)
        company_news = company_news[:6]

    technical = None
    fundamentals = None
    sentiment_module = None
    if ticker:
        try:
            technical = run_indicator_module({"ticker": ticker}, timeframe_minutes=15)
        except Exception:
            pass
        try:
            fundamentals = run_trust_module({"ticker": ticker})
        except Exception:
            pass
        try:
            sentiment_module = run_sentiment_module(ticker, num_articles_per_query=10, max_age_hours=24)
        except Exception:
            pass

    if not ticker and not company_news:
        return jsonify({
            "market": market,
            "movers": movers,
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
            "sentiment_module": None,
            "resolved_ticker": None,
            "stock_chart": None
        })

    if company_news:
        sentiment, volume, source_sent, spike = process_signals(company_news)
        insight = generate_insight(company or ticker_short or "", spike, source_sent, [d["text"] for d in company_news[:3]])
        display_news = company_news
    else:
        sentiment, volume, source_sent, spike = {}, {}, {}, 1.0
        insight = f"Technical and fundamental analysis for {ticker_short or ticker}. No news found for this query."
        display_news = news

    stock_chart = get_stock_chart_data(ticker) if ticker else None

    # Ensure metrics values are JSON-serializable (e.g. numpy floats)
    if fundamentals and fundamentals.get("metrics"):
        fundamentals = dict(fundamentals)
        fundamentals["metrics"] = _make_serializable(fundamentals["metrics"])

    return jsonify({
        "market": market,
        "movers": movers,
        "news": display_news,
        "wire_label": (company or ticker_short or ticker) if company_news else None,
        "company": company or ticker_short or ticker or "",
        "sentiment": _make_serializable(sentiment),
        "volume": _make_serializable(volume),
        "spike": float(spike) if spike is not None else 1.0,
        "insight": insight,
        "technical": technical,
        "fundamentals": fundamentals,
        "sentiment_module": sentiment_module,
        "resolved_ticker": ticker,
        "stock_chart": stock_chart,
        "error": None
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)
