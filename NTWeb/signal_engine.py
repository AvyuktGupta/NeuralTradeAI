import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from dateutil import parser
import numpy as np

# Initialize the NLP Brain (aligned with NeuralTrade Sentiment Module)
analyzer = SentimentIntensityAnalyzer()
# Financial lexicon: same as Sentiment Module so trend chart matches module verdict
_FINANCIAL_LEXICON = {
    "jump": 1.5, "jumps": 1.5, "jumped": 1.5, "rising": 1.2, "rises": 1.2, "rise": 1.2,
    "gain": 1.2, "gains": 1.2, "gained": 1.2, "surge": 1.5, "surges": 1.5, "surged": 1.5,
    "rally": 1.3, "rallies": 1.3, "rallied": 1.3, "soar": 1.5, "soars": 1.5, "soared": 1.5,
    "fall": -1.2, "falls": -1.2, "fell": -1.2, "drop": -1.2, "drops": -1.2, "dropped": -1.2,
    "plunge": -1.8, "plunges": -1.8, "plunged": -1.8, "slump": -1.5, "slumps": -1.5,
    "crash": -2.0, "crashes": -2.0, "crashed": -2.0,
}
for word, score in _FINANCIAL_LEXICON.items():
    if word not in analyzer.lexicon:
        analyzer.lexicon[word] = score

def normalize_dates(date_str):
    """
    Robust date parser to handle NewsAPI (ISO) and Google RSS (RFC) formats.
    Returns a pandas-compatible datetime object.
    """
    try:
        return parser.parse(str(date_str))
    except:
        return pd.Timestamp.now()

def process_signals(raw_data):
    """
    Ingests raw article list -> Returns processed Time-Series metrics.
    """
    if not raw_data:
        return {}, {}, {}, 0.0

    # 1. Convert list of dicts to DataFrame
    df = pd.DataFrame(raw_data)

    # 2. Apply NLP (Sentiment Analysis) — same VADER + financial lexicon as Sentiment Module
    # Compound score: -1.0 (Extreme Negative) to +1.0 (Extreme Positive)
    df["sentiment"] = df["text"].apply(lambda x: analyzer.polarity_scores(str(x))["compound"])

    # 3. Standardize Time (CRITICAL STEP)
    df["timestamp"] = df["timestamp"].apply(normalize_dates)
    
    # Floor timestamps to the nearest hour for aggregation (e.g., 10:14 -> 10:00)
    df["hour"] = df["timestamp"].dt.floor('h')

    # 4. Aggregate Data (The "Signal" Creation)
    #   - Sentiment: Average mood per hour
    #   - Volume: Count of articles per hour (Velocity)
    hourly_groups = df.groupby("hour")
    
    sentiment_trend = hourly_groups["sentiment"].mean()
    volume_trend = hourly_groups["text"].count()
    
    # 5. Source Breakdown (Who is driving the narrative?)
    source_sentiment = df.groupby("source")["sentiment"].mean().to_dict()

    # 6. Detect Velocity Spikes (The "Pressure" Metric)
    #   Formula: Current Volume / Average Volume of previous hours
    if len(volume_trend) > 1:
        current_vol = volume_trend.iloc[-1] # Most recent hour
        avg_vol = volume_trend.mean()
        
        # Avoid division by zero
        spike_ratio = round(current_vol / avg_vol, 2) if avg_vol > 0 else 1.0
    else:
        spike_ratio = 1.0

    # 7. Convert to Python dicts for the Frontend (JSON serialization)
    # Convert timestamps to string strings for Chart.js
    sentiment_dict = {k.strftime('%H:%M'): v for k, v in sentiment_trend.items()}
    volume_dict = {k.strftime('%H:%M'): v for k, v in volume_trend.items()}

    return sentiment_dict, volume_dict, source_sentiment, spike_ratio

# --- TEST BLOCK (Run this file directly to check logic) ---
if __name__ == "__main__":
    # Mock data to verify the math
    mock_data = [
        {"text": "Tesla stock crashes as factory burns down", "timestamp": "2026-01-29T10:00:00Z", "source": "NewsAPI"},
        {"text": "Elon Musk tweets about massive recall", "timestamp": "2026-01-29T10:15:00Z", "source": "Google"},
        {"text": "Tesla is doomed", "timestamp": "2026-01-29T10:45:00Z", "source": "Reddit"},
        {"text": "Just kidding, Tesla is fine", "timestamp": "2026-01-29T11:00:00Z", "source": "NewsAPI"},
    ]
    
    s_trend, v_trend, src_brk, spike = process_signals(mock_data)
    
    print("\n--- SIGNAL ENGINE DIAGNOSTICS ---")
    print(f"Sentiment Trend: {s_trend}") # Should show 10:00 as very negative
    print(f"Volume Trend:    {v_trend}") # Should show 3 articles at 10:00, 1 at 11:00
    print(f"Spike Ratio:     {spike}")   # Should be < 1.0 (since 11:00 volume < average)
    print("---------------------------------")