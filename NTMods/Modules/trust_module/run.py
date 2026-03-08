"""
Trust Module - Fundamental Analysis
Provides fundamental analysis and trustworthiness scoring.
"""
import os
import yfinance as yf
import pandas as pd
import numpy as np
import math
from dotenv import load_dotenv

load_dotenv()

# Default weights for scoring
WEIGHTS = {
    "eps_growth": int(os.getenv("WEIGHT_EPS_GROWTH", "15")),
    "revenue_growth": int(os.getenv("WEIGHT_REVENUE_GROWTH", "15")),
    "roe": int(os.getenv("WEIGHT_ROE", "12")),
    "de_ratio": int(os.getenv("WEIGHT_DE_RATIO", "12")),
    "profit_margin": int(os.getenv("WEIGHT_PROFIT_MARGIN", "10")),
    "fcf_trend": int(os.getenv("WEIGHT_FCF_TREND", "12")),
    "current_ratio": int(os.getenv("WEIGHT_CURRENT_RATIO", "8")),
    "marketcap_stability": int(os.getenv("WEIGHT_MARKETCAP_STABILITY", "6")),
    "insider_flow": int(os.getenv("WEIGHT_INSIDER_FLOW", "10"))
}

YEARS_TO_CHECK = int(os.getenv("YEARS_TO_CHECK", "3"))
MIN_DATA_YEARS = int(os.getenv("MIN_DATA_YEARS", "1"))


def safe_get_first_matching_index(df: pd.DataFrame, keywords):
    """Find the best matching row using keywords"""
    if df is None or df.empty:
        return None
    idx_lower = [str(i).lower() for i in df.index]
    for kw in keywords:
        for i_name, i_lower in zip(df.index, idx_lower):
            if kw.lower() in i_lower:
                return i_name
    return None


def cagr(start, end, periods):
    """Calculate Compound Annual Growth Rate"""
    try:
        start = float(start)
        end = float(end)
        if periods <= 0:
            return None
        if start <= 0:
            return ((end - start) / max(abs(start), 1e-6)) / periods * 100
        return ((end / start) ** (1.0 / periods) - 1.0) * 100.0
    except Exception:
        return None


def percent_change_series(series):
    """Return percent change from first to last as %"""
    try:
        s = pd.Series(series).dropna().astype(float)
        if len(s) < 2:
            return None
        return (s.iloc[-1] / s.iloc[0] - 1.0) * 100.0
    except Exception:
        return None


def normalize_score(value, good_min=None, good_max=None, invert=False):
    """Convert value to 0-100 score"""
    if value is None or (isinstance(value, (float, int)) and (math.isnan(value) or math.isinf(value))):
        return 50
    try:
        v = float(value)
    except Exception:
        return 50
    
    if good_min is not None and good_max is not None:
        if good_min == good_max:
            return 100 if v == good_min else 0
        if good_min <= v <= good_max:
            return 100
        if invert:
            bad = good_max * 3 if good_max != 0 else good_max + 1
            if v <= good_min:
                return 100
            elif v >= bad:
                return 0
            else:
                return max(0, min(100, int(100 * (1 - (v - good_min) / (bad - good_min)))))
        else:
            low = good_min / 3 if good_min != 0 else good_min - 1
            if v <= low:
                return 0
            elif v >= good_min:
                return 100
            else:
                return max(0, min(100, int(100 * (v - low) / (good_min - low))))
    else:
        return int(max(0, min(100, 50 + (v / (abs(v) + 10)) * 50)))


def fetch_fundamentals(ticker):
    """Return dict with financial DataFrames and basic info"""
    tk = yf.Ticker(ticker)
    info = tk.info or {}
    fin = tk.financials
    bal = tk.balance_sheet
    cash = tk.cashflow
    return {"ticker": ticker, "info": info, "financials": fin, "balance_sheet": bal, "cashflow": cash}


def extract_time_series(df):
    """Extract and sort time series from yfinance DataFrame"""
    if df is None or df.empty:
        return pd.DataFrame()
    try:
        cols = list(df.columns)
        cols_sorted = sorted(cols, key=lambda x: pd.to_datetime(str(x)))
        df2 = df[cols_sorted].astype(float)
        return df2
    except Exception:
        return df.astype(float)


def build_metrics_bundle(fund_data, years_to_check=YEARS_TO_CHECK):
    """Build metrics bundle from financial data"""
    info = fund_data["info"]
    fin_raw = extract_time_series(fund_data["financials"])
    bal_raw = extract_time_series(fund_data["balance_sheet"])
    cash_raw = extract_time_series(fund_data["cashflow"])

    cols = list(fin_raw.columns) if not fin_raw.empty else []
    n_periods = len(cols)

    revenue_key = safe_get_first_matching_index(fin_raw, ["total revenue", "revenue", "net sales", "sales"])
    net_income_key = safe_get_first_matching_index(fin_raw, ["net income", "netIncome", "net earnings", "profit attributable", "net loss"])
    eps_key = safe_get_first_matching_index(fin_raw, ["basic eps", "earnings per share", "eps", "diluted eps"])
    equity_key = safe_get_first_matching_index(bal_raw, ["total shareholders' equity", "total stockholders' equity", "total equity", "stockholders' equity"])
    total_debt_key = safe_get_first_matching_index(bal_raw, ["total debt", "long term debt", "total liabilities", "debt"])
    current_assets_key = safe_get_first_matching_index(bal_raw, ["total current assets", "current assets"])
    current_liabilities_key = safe_get_first_matching_index(bal_raw, ["total current liabilities", "current liabilities"])
    fcf_key = safe_get_first_matching_index(cash_raw, ["free cash flow", "free cash", "fcf", "cash from operating activities"])

    def series_values(df, key):
        if df is None or df.empty or key is None:
            return []
        s = df.loc[key].dropna().astype(float)
        return list(s.values[::-1]) if len(s.index) > 0 and pd.to_datetime(df.columns[0]) > pd.to_datetime(df.columns[-1]) else list(s.values)

    revenue_ts = series_values(fin_raw, revenue_key)
    netincome_ts = series_values(fin_raw, net_income_key)
    eps_ts = series_values(fin_raw, eps_key)
    equity_ts = series_values(bal_raw, equity_key)
    debt_ts = series_values(bal_raw, total_debt_key)
    current_assets_ts = series_values(bal_raw, current_assets_key)
    current_liab_ts = series_values(bal_raw, current_liabilities_key)
    fcf_ts = series_values(cash_raw, fcf_key)

    def trim_to_years(ts, years):
        if not ts:
            return []
        return ts[-(years+1):] if len(ts) >= (years+1) else ts

    revenue_ts = trim_to_years(revenue_ts, years_to_check)
    netincome_ts = trim_to_years(netincome_ts, years_to_check)
    eps_ts = trim_to_years(eps_ts, years_to_check)
    equity_ts = trim_to_years(equity_ts, years_to_check)
    debt_ts = trim_to_years(debt_ts, years_to_check)
    current_assets_ts = trim_to_years(current_assets_ts, years_to_check)
    current_liab_ts = trim_to_years(current_liab_ts, years_to_check)
    fcf_ts = trim_to_years(fcf_ts, years_to_check)

    market_cap = info.get("marketCap", None)
    trailing_pe = info.get("trailingPE", None)
    forward_pe = info.get("forwardPE", None)
    info_de = info.get("debtToEquity", None)

    bundle = {
        "revenue_ts": revenue_ts,
        "netincome_ts": netincome_ts,
        "eps_ts": eps_ts,
        "equity_ts": equity_ts,
        "debt_ts": debt_ts,
        "current_assets_ts": current_assets_ts,
        "current_liab_ts": current_liab_ts,
        "fcf_ts": fcf_ts,
        "market_cap": market_cap,
        "trailing_pe": trailing_pe,
        "forward_pe": forward_pe,
        "info_de": info_de,
        "available_periods": n_periods
    }
    return bundle


def compute_ratios_and_scores(bundle):
    """Compute financial ratios and scores"""
    reasons = []
    revenue = bundle["revenue_ts"]
    netincome = bundle["netincome_ts"]
    eps = bundle["eps_ts"]
    equity = bundle["equity_ts"]
    debt = bundle["debt_ts"]
    fcf = bundle["fcf_ts"]
    curr_assets = bundle["current_assets_ts"]
    curr_liab = bundle["current_liab_ts"]

    periods = max(len(revenue), len(netincome), len(eps), len(equity), len(debt), len(fcf))
    periods = max(periods, 0)

    eps_growth = None
    revenue_cagr = None
    netincome_cagr = None

    if len(eps) >= 2:
        eps_growth = cagr(eps[0], eps[-1], len(eps)-1)
    if len(revenue) >= 2:
        revenue_cagr = cagr(revenue[0], revenue[-1], len(revenue)-1)
    if len(netincome) >= 2:
        netincome_cagr = cagr(netincome[0], netincome[-1], len(netincome)-1)

    de_ratio = None
    if bundle["info_de"] is not None:
        try:
            de_ratio = float(bundle["info_de"])
        except Exception:
            de_ratio = None

    if de_ratio is None and debt and equity and equity[-1] != 0:
        try:
            de_ratio = (debt[-1] if len(debt) > 0 else 0) / (equity[-1] if len(equity) > 0 else 1)
        except Exception:
            de_ratio = None

    roe = None
    if netincome and equity and equity[-1] not in (None, 0):
        roe = (netincome[-1] / equity[-1]) * 100.0

    profit_margin = None
    if netincome and revenue and revenue[-1] not in (None, 0):
        profit_margin = (netincome[-1] / revenue[-1]) * 100.0

    fcf_trend = None
    if len(fcf) >= 2:
        fcf_trend = percent_change_series(fcf)

    current_ratio = None
    if curr_assets and curr_liab and curr_liab[-1] not in (None, 0):
        current_ratio = curr_assets[-1] / curr_liab[-1]

    marketcap = bundle.get("market_cap", None)

    scores = {}
    scores["eps_growth"] = normalize_score(eps_growth, good_min=10, good_max=100)
    scores["revenue_growth"] = normalize_score(revenue_cagr, good_min=8, good_max=100)
    scores["roe"] = normalize_score(roe, good_min=15, good_max=100)
    scores["de_ratio"] = normalize_score(de_ratio, good_min=0, good_max=1, invert=True)
    scores["profit_margin"] = normalize_score(profit_margin, good_min=10, good_max=100)
    scores["fcf_trend"] = normalize_score(fcf_trend, good_min=5, good_max=100)
    scores["current_ratio"] = normalize_score(current_ratio, good_min=1.2, good_max=5)
    scores["marketcap_stability"] = 50 if marketcap is None else (100 if marketcap > 1e10 else 70 if marketcap > 1e9 else 50)
    scores["insider_flow"] = 50

    # Build reasons / flags
    if revenue and len(revenue) >= 3:
        yoy = []
        for i in range(1, len(revenue)):
            prev = revenue[i-1] if revenue[i-1] != 0 else 1e-6
            yoy.append((revenue[i] / prev - 1) * 100.0)
        if any(abs(x) > 150 for x in yoy):
            reasons.append("⚠️ Very large revenue spike (>150%) detected — investigate one-off items or mergers.")
    if netincome and len(netincome) >= 3:
        yoy_n = []
        for i in range(1, len(netincome)):
            prev = netincome[i-1] if netincome[i-1] != 0 else 1e-6
            yoy_n.append((netincome[i] / prev - 1) * 100.0)
        if any(abs(x) > 300 for x in yoy_n):
            reasons.append("⚠️ Very large net income spike (>300%) detected — could indicate extraordinary items or accounting adjustments.")

    if revenue_cagr is not None and eps_growth is not None:
        if revenue_cagr > 10 and (eps_growth is not None and eps_growth < 0):
            reasons.append("⚠️ Revenue growing while EPS is declining — possible margin compression or accounting issues.")

    if debt and len(debt) >= 2 and equity and len(equity) >= 2:
        try:
            last_de = (debt[-1] / equity[-1]) if equity[-1] != 0 else None
            prev_de = (debt[-2] / equity[-2]) if equity[-2] != 0 else None
            if last_de is not None and prev_de is not None and last_de > prev_de * 1.5:
                reasons.append("⚠️ Rapid increase in debt-to-equity ratio detected.")
        except Exception:
            pass

    if fcf_trend is not None and fcf_trend < -20:
        reasons.append("⚠️ Free cash flow dropped a lot in recent years — this could be risky.")

    if current_ratio is not None and current_ratio < 0.8:
        reasons.append("⚠️ Current ratio < 0.8 — potential short-term liquidity issues.")

    if roe is not None and roe < 5:
        reasons.append("⚠️ ROE is very low (<5%) — poor capital efficiency.")

    total_weight = sum(WEIGHTS.values())
    weighted_sum = 0.0
    for k, w in WEIGHTS.items():
        weighted_sum += scores.get(k, 50) * w
    trust_score = weighted_sum / total_weight
    trust_score = max(0, min(100, trust_score))

    if trust_score >= 75:
        verdict = "Legit / Financially Strong"
    elif trust_score >= 50:
        verdict = "Caution / Mixed Signals"
    else:
        verdict = "Suspicious / Risky — investigate further"

    details = {
        "eps_growth": eps_growth,
        "revenue_cagr": revenue_cagr,
        "netincome_cagr": netincome_cagr,
        "de_ratio": de_ratio,
        "roe": roe,
        "profit_margin": profit_margin,
        "fcf_trend_pct": fcf_trend,
        "current_ratio": current_ratio,
        "market_cap": bundle.get("market_cap", None),
        "scores": scores,
        "trust_score": trust_score,
        "verdict": verdict,
        "reasons": reasons
    }

    return details


def analyze_fundamentals(ticker):
    """Main fundamental analysis function"""
    try:
        fund_data = fetch_fundamentals(ticker)
        bundle = build_metrics_bundle(fund_data)
        available = bundle.get("available_periods", 0)
        results = compute_ratios_and_scores(bundle)

        result = {
            "module": "Fundamental Analyzer",
            "ticker": ticker,
            "trust_score": round(results["trust_score"], 1),
            "verdict": results["verdict"],
            "metrics": {
                "EPS Growth %": results["eps_growth"],
                "Revenue Growth %": results["revenue_cagr"],
                "ROE %": results["roe"],
                "Debt/Equity": results["de_ratio"],
                "Margin %": results["profit_margin"],
                "FCF Trend %": results["fcf_trend_pct"],
                "Current Ratio": results["current_ratio"]
            }
        }
        return result
    except Exception as e:
        print("❌ Fundamental analysis failed:", e)
        return None


def run_trust_module(input_data: dict) -> dict:
    """
    Main entry point for trust module.
    
    Args:
        input_data: Dictionary containing:
            - ticker: Stock ticker symbol (e.g., "TVSMOTOR.NS")
    
    Returns:
        dict: Fundamental analysis results with trust_score, verdict, etc.
    """
    ticker = input_data.get("ticker")
    if not ticker:
        raise ValueError("ticker is required in input_data")
    
    result = analyze_fundamentals(ticker)
    
    return result
