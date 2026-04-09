"""
Indicator Module - Technical Analysis
Provides technical analysis using configurable timeframe indicators.
"""
import os
import sys

# Add NeuralTrade package root so "from APIs..." resolves when run directly
_neuraltrade_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _neuraltrade_root not in sys.path:
    sys.path.insert(0, _neuraltrade_root)

import yfinance as yf
import pandas as pd
import ta
from dotenv import load_dotenv
from APIs.indicator_calculators.indicators import (
    compute_rsi, compute_stochrsi, compute_macd, compute_bollinger_bands
)
from ta.trend import ADXIndicator, CCIIndicator
from ta.momentum import ROCIndicator, WilliamsRIndicator
from ta.volume import OnBalanceVolumeIndicator
from ta.volatility import KeltnerChannel

load_dotenv()

# Weights for different indicators
WEIGHTS = {
    "RSI": int(os.getenv("WEIGHT_RSI", "10")),
    "StochRSI": int(os.getenv("WEIGHT_STOCHRSI", "7")),
    "MACD": int(os.getenv("WEIGHT_MACD", "15")),
    "MA Crossover": int(os.getenv("WEIGHT_MA_CROSSOVER", "15")),
    "ADX": int(os.getenv("WEIGHT_ADX", "10")),
    "Bollinger": int(os.getenv("WEIGHT_BOLLINGER", "10")),
    "Keltner": int(os.getenv("WEIGHT_KELTNER", "8")),
    "OBV": int(os.getenv("WEIGHT_OBV", "8")),
    "CCI": int(os.getenv("WEIGHT_CCI", "7")),
    "ROC": int(os.getenv("WEIGHT_ROC", "5"))
}


def minutes_to_interval(timeframe_minutes: int) -> str:
    """
    Convert minutes to yfinance interval format.
    
    Args:
        timeframe_minutes: Number of minutes (e.g., 1, 5, 15, 30, 60)
    
    Returns:
        str: yfinance interval string (e.g., "1m", "5m", "15m", "1h", "1d")
    """
    if timeframe_minutes < 60:
        return f"{timeframe_minutes}m"
    elif timeframe_minutes == 60:
        return "1h"
    elif timeframe_minutes < 1440:  # Less than 1 day
        hours = timeframe_minutes // 60
        return f"{hours}h"
    else:  # 1 day or more
        days = timeframe_minutes // 1440
        return f"{days}d"


def analyze_single_timeframe(ticker, interval):
    """Analyze technical indicators for one timeframe"""
    try:
        df = yf.download(ticker, period="60d", interval=interval, progress=False)
        if df.empty:
            return None

        # Flatten to 1D Series (fix for pandas/ta error)
        close = df["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
        close = close.squeeze()

        # Compute indicators (most recent values only; keep output compact/serializable)
        rsi_series = ta.momentum.RSIIndicator(close).rsi()
        macd = ta.trend.MACD(close)
        stoch = ta.momentum.StochRSIIndicator(close)
        bb = ta.volatility.BollingerBands(close)

        rsi_last = float(rsi_series.iloc[-1]) if len(rsi_series) else None
        macd_diff_last = float(macd.macd_diff().iloc[-1]) if len(close) else None  # histogram proxy
        stoch_k_last = float(stoch.stochrsi_k().iloc[-1]) if len(close) else None

        last_price = float(close.iloc[-1]) if len(close) else None

        # Simple trend proxy: slope over recent window
        w = min(20, len(close))
        if w >= 3:
            recent = close.iloc[-w:]
            trend_pct = float(((recent.iloc[-1] / recent.iloc[0]) - 1.0) * 100.0)
            recent_high = float(recent.max())
            recent_low = float(recent.min())
        else:
            trend_pct = None
            recent_high = None
            recent_low = None

        # Volatility proxy: Bollinger Band width as % of price
        try:
            bb_high = float(bb.bollinger_hband().iloc[-1])
            bb_low = float(bb.bollinger_lband().iloc[-1])
            bb_width_pct = float(((bb_high - bb_low) / last_price) * 100.0) if last_price else None
        except Exception:
            bb_width_pct = None

        buy, sell = 0, 0

        # RSI
        if rsi_last is not None and rsi_last < 30:
            buy += 1
        elif rsi_last is not None and rsi_last > 70:
            sell += 1

        # MACD
        if macd_diff_last is not None and macd_diff_last > 0:
            buy += 1
        else:
            sell += 1

        # StochRSI
        if stoch_k_last is not None and stoch_k_last < 0.2:
            buy += 1
        elif stoch_k_last is not None and stoch_k_last > 0.8:
            sell += 1

        # Bollinger Bands
        if close.iloc[-1] < bb.bollinger_lband().iloc[-1]:
            buy += 1
        elif close.iloc[-1] > bb.bollinger_hband().iloc[-1]:
            sell += 1

        confidence = round((abs(buy - sell) / 4) * 100, 1)
        signal = "BUY" if buy > sell else "SELL" if sell > buy else "HOLD"

        # Normalize trend label
        if trend_pct is None:
            trend_label = "unknown"
        elif trend_pct > 1.0:
            trend_label = "up"
        elif trend_pct < -1.0:
            trend_label = "down"
        else:
            trend_label = "flat"

        return {
            "timeframe": interval,
            "signal": signal,
            "confidence": confidence,
            "last_close": None if last_price is None else round(last_price, 2),
            "rsi": None if rsi_last is None else round(rsi_last, 1),
            "macd_diff": None if macd_diff_last is None else round(macd_diff_last, 4),
            "trend": trend_label,
            "trend_pct": None if trend_pct is None else round(trend_pct, 2),
            "volatility": None if bb_width_pct is None else round(bb_width_pct, 2),
            "range_high": None if recent_high is None else round(recent_high, 2),
            "range_low": None if recent_low is None else round(recent_low, 2),
        }

    except Exception as e:
        print(f"⚠️ Error in {ticker} {interval}: {e}")
        return None


def analyze_technical(ticker, interval: str):
    """Analyze technical indicators for a single timeframe"""
    res = analyze_single_timeframe(ticker, interval)
    if not res:
        return {
            "module": "Technical Analyzer",
            "ticker": ticker,
            "signal": "NO DATA",
            "confidence": 0,
            "details": []
        }
    
    return {
        "module": "Technical Analyzer",
        "ticker": ticker,
        "signal": res["signal"],
        "confidence": res["confidence"],
        "details": [res]
    }


def run_indicator_module(input_data: dict, timeframe_minutes: int = 15) -> dict:
    """
    Main entry point for indicator module.
    
    Args:
        input_data: Dictionary containing:
            - ticker: Stock ticker symbol (e.g., "TVSMOTOR.NS")
        timeframe_minutes: Candle interval in minutes (e.g., 1, 3, 5, 10, 15, 30, 60).
                          Default is 15 minutes.
    
    Returns:
        dict: Technical analysis results with signal, confidence, timeframe_minutes, etc.
    """
    # Validate timeframe_minutes
    if not isinstance(timeframe_minutes, int):
        raise ValueError(f"timeframe_minutes must be an integer, got {type(timeframe_minutes).__name__}")
    if timeframe_minutes <= 0:
        raise ValueError(f"timeframe_minutes must be > 0, got {timeframe_minutes}")
    
    ticker = input_data.get("ticker")
    if not ticker:
        raise ValueError("ticker is required in input_data")
    
    # Convert minutes to yfinance interval format
    interval = minutes_to_interval(timeframe_minutes)
    
    # Analyze the single timeframe
    result = analyze_technical(ticker, interval)
    
    # Add timeframe_minutes to output
    result["timeframe_minutes"] = timeframe_minutes
    
    return result
