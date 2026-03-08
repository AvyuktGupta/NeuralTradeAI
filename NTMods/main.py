# main.py
"""
M³A Fusion Machine (v1.0)
Author: Avyukt Gupta

Combines multiple stock analysis AIs (technical + fundamental + more)
into a unified market intelligence system.
"""

import traceback
import os
import warnings
from dotenv import load_dotenv
from Modules.indicator_module.run import run_indicator_module
from Modules.trust_module.run import run_trust_module
from Modules.sentiment_module.run import run_sentiment_module
from APIs.telegram_messenger.telegram import send_telegram_message

# Load environment variables
load_dotenv()

warnings.filterwarnings("ignore")

# -----------------------------------------------------
# 🔧 CONFIG
FUSION_WEIGHTS = {
    "technical": float(os.getenv("FUSION_WEIGHT_TECHNICAL", "0.35")),
    "fundamental": float(os.getenv("FUSION_WEIGHT_FUNDAMENTAL", "0.35")),
    "sentiment": float(os.getenv("FUSION_WEIGHT_SENTIMENT", "0.15")),
    "risk": float(os.getenv("FUSION_WEIGHT_RISK", "0.15"))
}

STOCKS = os.getenv("STOCKS_LIST", "TVSMOTOR.NS,TCS.NS,RELIANCE.NS").split(",")

# Candle timeframe configuration
CANDLE_TIMEFRAME_MINUTES = int(os.getenv("CANDLE_TIMEFRAME_MINUTES", "15"))

# -----------------------------------------------------
# 🧠 Fusion Logic
def fuse_models(ticker):
    """
    Fuse multiple analysis models into a unified verdict.
    
    Args:
        ticker: Stock ticker symbol
    
    Returns:
        dict: Fusion results with ticker, fusion_score, and verdict
    """
    # Run indicator module (technical analysis)
    print(f"  🔍 Running technical analysis for {ticker}...")
    technical = run_indicator_module({"ticker": ticker}, timeframe_minutes=CANDLE_TIMEFRAME_MINUTES)
    
    # Run trust module (fundamental analysis)
    print(f"  🧠 Running fundamental analysis for {ticker}...")
    fundamental = run_trust_module({"ticker": ticker})

    # Run sentiment module (news-based sentiment)
    print(f"  📰 Running sentiment analysis for {ticker}...")
    try:
        sentiment = run_sentiment_module(ticker)
    except Exception:
        sentiment = {"verdict": "Neutral", "score": 50}

    # Placeholder module
    risk = {"verdict": "Moderate", "score": 60}

    # Extract scores
    f_score = fundamental["trust_score"] if fundamental else 50
    t_conf = technical["confidence"] if technical else 50
    s_score = sentiment["score"]
    r_score = risk["score"]

    # Weighted average
    fusion_score = (
        FUSION_WEIGHTS["fundamental"] * f_score
        + FUSION_WEIGHTS["technical"] * t_conf
        + FUSION_WEIGHTS["sentiment"] * s_score
        + FUSION_WEIGHTS["risk"] * r_score
    )

    # Final verdict
    if fusion_score >= 75:
        verdict = "BUY ✅"
    elif fusion_score >= 55:
        verdict = "HOLD ⚖️"
    else:
        verdict = "SELL 🔻"

    # Determine short sentiment labels
    fund_label = "Strong" if f_score >= 75 else "Mixed" if f_score >= 55 else "Weak"
    tech_label = technical["signal"] if technical else "N/A"

    # Prepare detailed report for Telegram/logging
    detailed_report = (
        f"📊 {ticker}\n"
        f"Fundamentals: {fundamental['verdict']} ({f_score:.1f})\n"
        f"Technicals: {technical['signal']} ({t_conf:.1f})\n"
        f"Sentiment: {sentiment['verdict']} ({s_score})\n"
        f"Risk: {risk['verdict']} ({r_score})\n"
        f"Final: {verdict} — Score: {fusion_score:.1f}/100"
    )

    # Return structured data for summary aggregation
    return {
        "ticker": ticker,
        "fusion_score": fusion_score,
        "verdict": verdict,
        "detailed_report": detailed_report
    }


# -----------------------------------------------------
# 🚀 MAIN EXECUTION
if __name__ == "__main__":
    print("🚀 M³A Fusion Machine Started\n")
    all_reports = []

    for stock in STOCKS:
        try:
            print(f"📈 Analyzing {stock}...")
            report = fuse_models(stock)
            if report:
                all_reports.append(report)
                print(f"✅ Completed analysis for {stock}\n")
        except Exception as e:
            print(f"❌ Error analyzing {stock}: {e}")
            traceback.print_exc()

    # Final summary
    buy_count = sum(1 for r in all_reports if "BUY" in r["verdict"])
    hold_count = sum(1 for r in all_reports if "HOLD" in r["verdict"])
    sell_count = sum(1 for r in all_reports if "SELL" in r["verdict"])

    summary_text = f"\n📊 Summary: {buy_count} BUY, {hold_count} HOLD, {sell_count} SELL"
    print(summary_text)

    # Send detailed reports to Telegram if enabled
    telegram_enabled = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"
    
    if telegram_enabled and all_reports:
        # Build comprehensive message
        message_lines = ["📊 *M³A Fusion Machine - Analysis Report*\n"]
        
        for report in all_reports:
            message_lines.append(report["detailed_report"])
            message_lines.append("")  # Empty line between reports
        
        message_lines.append(summary_text)
        
        final_message = "\n".join(message_lines)
        send_telegram_message(final_message)
    else:
        # Print all detailed reports to console
        print("\n" + "="*60)
        print("Detailed Reports:")
        print("="*60)
        for report in all_reports:
            print("\n" + report["detailed_report"])
