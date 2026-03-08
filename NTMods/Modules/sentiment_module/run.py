"""
Sentiment Module - News-based sentiment analysis for stocks.
Exposes a fusion-compatible API (verdict + score 0–100) for main.py.
"""
from .NewsSentimentScanner.NewsSentimentScanner.sentiment_analysis import run_sentiment_module as _run_sentiment_scanner


def run_sentiment_module(ticker: str, num_articles_per_query: int = 5, max_age_hours: int = 6) -> dict:
    """
    Run news sentiment analysis for a ticker and return fusion-compatible result.

    Args:
        ticker: Stock symbol (e.g. "AAPL", "RELIANCE.NS").
        num_articles_per_query: Latest articles to use (default 5).
        max_age_hours: Only consider articles from the last N hours (default 6).

    Returns:
        dict with "verdict" ("Positive" | "Neutral" | "Negative") and "score" (0–100).
        On error or no articles, returns {"verdict": "Neutral", "score": 50}.
    """
    try:
        result = _run_sentiment_scanner(ticker.strip(), num_articles_per_query, max_age_hours)
    except Exception:
        return {"verdict": "Neutral", "score": 50}

    total = result.get("total_articles", 0)
    if total == 0:
        return {"verdict": "Neutral", "score": 50}

    positive_pct = result.get("positive_pct", 0.0)
    negative_pct = result.get("negative_pct", 0.0)

    # 0–100 score: 50 + (positive - negative) / 2, clamped
    score = 50.0 + (positive_pct - negative_pct) / 2.0
    score = max(0.0, min(100.0, round(score, 1)))

    if score >= 60:
        verdict = "Positive"
    elif score <= 40:
        verdict = "Negative"
    else:
        verdict = "Neutral"

    return {"verdict": verdict, "score": score}
