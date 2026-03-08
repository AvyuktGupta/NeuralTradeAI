import os
import sys

# Load .env from project root first (before any module that reads env)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_env_file = os.path.join(_root, ".env")
if os.path.isfile(_env_file):
    from dotenv import load_dotenv
    load_dotenv(_env_file)

from flask import Flask, render_template, request, jsonify
import re
import yfinance as yf
import requests
from data_collector import fetch_news_api, fetch_google_news, parse_timestamp
from signal_engine import process_signals
from insight_engine import generate_insight
from datetime import datetime

# Allow importing NeuralTrade (sibling folder)
_neuraltrade_machine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _neuraltrade_machine not in sys.path:
    sys.path.insert(0, _neuraltrade_machine)
from NeuralTrade.Modules.indicator_module.run import run_indicator_module
from NeuralTrade.Modules.trust_module.run import run_trust_module
from NeuralTrade.Modules.sentiment_module.run import run_sentiment_module

app = Flask(__name__)

# --- Resolve company name or ticker to yfinance symbol for modules that need tickers ---
# Known crypto/special symbols (return as-is with correct suffix)
_CRYPTO_MAP = {"BTC": "BTC-USD", "BITCOIN": "BTC-USD", "ETH": "ETH-USD", "ETHEREUM": "ETH-USD"}

def _yahoo_search_ticker(query):
    """Call Yahoo Finance search API; return first quote symbol or None."""
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": query, "quotesCount": 8, "newsCount": 0}
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        quotes = data.get("quotes") or []
        for q in quotes:
            sym = (q.get("symbol") or "").strip()
            if not sym or sym in ("SPY", "QQQ"):
                continue
            if ".NS" in sym or (str(q.get("exchange") or "").upper() in ("NSI", "NSE")):
                return sym
            if ".BO" in sym:
                return sym
        if quotes:
            return (quotes[0].get("symbol") or "").strip() or None
        return None
    except Exception:
        return None

def resolve_company_to_ticker(company):
    """
    Resolve user input (company name or ticker) to a yfinance ticker.
    - Ticker-like input (e.g. RELIANCE, TCS, BTC) -> RELIANCE.NS, TCS.NS, BTC-USD.
    - Company name (e.g. Reliance Industries, Genus Power Limited) -> Yahoo search or NSE-style fallback.
    - Indian tickers often concatenate words (e.g. TATAMOTORS, GENUSPOWER), so we try that for multi-word names.
    """
    if not company or not str(company).strip():
        return None
    s = str(company).strip()
    s_upper = s.upper()
    words = [w for w in s.split() if re.match(r"^[A-Za-z0-9]+$", w)]

    # 1. Known crypto
    if s_upper in _CRYPTO_MAP:
        return _CRYPTO_MAP[s_upper]

    # 2. Already has exchange or pair suffix
    if "." in s or ("-" in s and re.match(r"^[A-Z0-9]+-[A-Z]+$", s_upper)):
        return s_upper if s == s_upper else s

    # 3. Looks like a ticker: short, no spaces, alphanumeric
    ticker_like = len(s) <= 10 and " " not in s and re.match(r"^[A-Za-z0-9\.\-]+$", s)
    if ticker_like:
        return s_upper + ".NS"  # default NSE for Indian

    # 4. Company name: try Yahoo search (full name, then first two words for better match)
    found = _yahoo_search_ticker(s)
    if not found and len(words) >= 2:
        found = _yahoo_search_ticker(" ".join(words[:2]))  # e.g. "Genus Power"
    if found:
        if "." not in found and "-" not in found and len(found) <= 10:
            return found + ".NS"
        return found

    # 5. Fallback: Indian NSE often uses concatenated words (TATAMOTORS, GENUSPOWER)
    if len(words) >= 2:
        two_word_ticker = "".join(w.upper() for w in words[:2]) + ".NS"  # e.g. GENUSPOWER.NS
        if len(two_word_ticker) <= 14:  # reasonable symbol length
            return two_word_ticker
    first_word = words[0] if words else s.split()[0] if s.split() else s
    if first_word and re.match(r"^[A-Za-z0-9]+$", first_word) and len(first_word) <= 10:
        return first_word.upper() + ".NS"
    return (s_upper.replace(" ", "") + ".NS") if s_upper else None

# --- 1. GET SIDEBAR DATA ---
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
            except: continue
    except: pass
    return data

def get_stock_chart_data(ticker, period="3mo"):
    """Fetch historical OHLC for the given ticker; return dates and close prices for chart."""
    try:
        t = yf.Ticker(ticker)
        # For 1d we need intraday interval to get multiple points; default daily gives too few
        if period == "1d":
            hist = t.history(period="1d", interval="15m")
            if hist is None or hist.empty or len(hist) < 2:
                hist = t.history(period="5d", interval="1d")  # fallback: last 5 days (e.g. Indian stocks often no intraday)
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
                # Use time for intraday (1d), date otherwise
                if hasattr(d, 'strftime'):
                    dates.append(d.strftime(label_fmt))
                else:
                    dates.append(str(d))
            except Exception:
                dates.append(str(d))
        prices = [float(round(c, 2)) for c in hist["Close"]]
        return {"labels": dates, "prices": prices}
    except Exception:
        return None


@app.route("/api/chart", methods=["GET"])
def api_chart():
    """Return chart data for a ticker and period (1d, 1mo, 3mo, 1y)."""
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
        except: continue
    return movers

# --- 2. GET NEWS (With Safety Backup) ---
def get_safe_news():
    news = []
    try:
        news = fetch_google_news("Stock Market India", page_size=6)
    except: pass
    
    # Backup if empty
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

# --- 3. MAIN ROUTE ---
@app.route("/", methods=["GET", "POST"])
def index():
    # Sidebar is filled on every request (GET and POST) so the page always shows market + top movers + news.
    # That's why yfinance/API calls run as soon as you open the site (GET /).
    market = get_market_data()
    movers = get_top_movers()
    news = get_safe_news()  # Default news for bottom of page

    if request.method == "POST":
        company = request.form.get("company", "").strip()
        # 1. Resolve company name to ticker FIRST (before any module or news)
        ticker = resolve_company_to_ticker(company) if company else None
        ticker_short = (ticker.replace(".NS", "").replace(".BO", "").split("-")[0]) if ticker else None

        # 2. Fetch news: try company name first, then ticker symbol as fallback (6 latest per source)
        company_news = []
        if company:
            company_news = fetch_news_api(company, page_size=6) + fetch_google_news(company, page_size=6)
            if not company_news and ticker_short:
                company_news = fetch_news_api(ticker_short, page_size=6) + fetch_google_news(ticker_short, page_size=6)
        if company_news:
            # Sort by latest first, then take the 6 most recent
            company_news.sort(key=lambda x: parse_timestamp(x["timestamp"]), reverse=True)
            company_news = company_news[:6]

        # 3. Run modules that require ticker (only if we have a resolved ticker)
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

        # 4. Require at least ticker OR news to show results; otherwise show error
        if not ticker and not company_news:
            return render_template("index.html", market=market, movers=movers, news=news,
                                   error="Could not resolve to a ticker or find news. Try a symbol (e.g. RELIANCE, TCS) or company name.")

        # 5. Build sentiment/insight from news if we have it; else use placeholders
        if company_news:
            sentiment, volume, source_sent, spike = process_signals(company_news)
            insight = generate_insight(company or ticker_short or "", spike, source_sent, [d["text"] for d in company_news[:3]])
            display_news = company_news  # already 6 latest above
        else:
            sentiment, volume, source_sent, spike = {}, {}, {}, 1.0
            insight = f"Technical and fundamental analysis for {ticker_short or ticker}. No news found for this query."
            display_news = news  # fallback to default market news

        stock_chart = get_stock_chart_data(ticker) if ticker else None
        return render_template("index.html",
                               market=market, movers=movers, news=display_news,
                               wire_label=(company or ticker_short or ticker) if company_news else None,
                               company=company or ticker_short or ticker or "", sentiment=sentiment, volume=volume,
                               spike=spike, insight=insight, technical=technical, fundamentals=fundamentals,
                               sentiment_module=sentiment_module, resolved_ticker=ticker, stock_chart=stock_chart)

    return render_template("index.html", market=market, movers=movers, news=news, wire_label=None)

if __name__ == "__main__":
    app.run(debug=True)