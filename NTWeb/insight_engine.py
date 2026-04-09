import os
import random
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")


def _fmt(v, suffix=""):
    if v is None:
        return "N/A"
    try:
        return f"{v}{suffix}"
    except Exception:
        return "N/A"


def _clamp_sentiment(s):
    s = (str(s or "")).strip().lower()
    if "pos" in s:
        return "positive"
    if "neg" in s:
        return "negative"
    if "neu" in s:
        return "neutral"
    return "neutral"


def _vol_bucket(bb_width_pct):
    try:
        v = float(bb_width_pct)
    except Exception:
        return "unknown"
    if v >= 8:
        return "high"
    if v >= 4:
        return "moderate"
    return "low"


def _activity_bucket(spike_ratio):
    try:
        x = float(spike_ratio)
    except Exception:
        return "normal"
    if x >= 2.0:
        return "elevated"
    if x >= 1.5:
        return "active"
    if x <= 0.7:
        return "quiet"
    return "normal"


def _bias_from_signals(sent, rsi, macd_diff, trend, ta_signal):
    score = 0
    if sent == "positive":
        score += 1
    elif sent == "negative":
        score -= 1

    try:
        rv = float(rsi)
        if rv >= 70:
            score -= 1  # overbought risk
        elif rv <= 30:
            score += 1  # oversold rebound potential
        elif rv >= 55:
            score += 1
        elif rv <= 45:
            score -= 1
    except Exception:
        pass

    try:
        mv = float(macd_diff)
        score += 1 if mv > 0 else -1
    except Exception:
        pass

    t = str(trend or "").lower()
    if t == "up":
        score += 1
    elif t == "down":
        score -= 1

    s = str(ta_signal or "").upper()
    if s == "BUY":
        score += 1
    elif s == "SELL":
        score -= 1

    if score >= 2:
        return "bullish"
    if score <= -2:
        return "bearish"
    if sent == "neutral" and t in ("flat", "unknown"):
        return "consolidation"
    return "mixed signals"


def _action_from_bias(bias):
    if bias == "bullish":
        return "BUY"
    if bias == "bearish":
        return "SELL"
    return "HOLD"


def _structured_insight(company, spike_ratio, sent, rsi, macd_diff, trend, vol, range_high, range_low, bias, action):
    activity = _activity_bucket(spike_ratio)
    vol_bucket = _vol_bucket(vol)

    # Human, analyst-style narrative (3–4 sentences, no raw indicator values, no explicit BUY/SELL/HOLD)
    momentum_bits = []
    if macd_diff is not None:
        try:
            mv = float(macd_diff)
            momentum_bits.append("bearish pressure" if mv < 0 else "improving momentum")
        except Exception:
            pass
    if rsi is not None:
        try:
            rv = float(rsi)
            if rv <= 45:
                momentum_bits.append("RSI is weakening")
            elif rv >= 55:
                momentum_bits.append("RSI is firming")
            else:
                momentum_bits.append("RSI is holding near neutral")
        except Exception:
            pass

    trend_phrase = None
    t = str(trend or "").lower()
    if t == "up":
        trend_phrase = "the broader trend remains constructive"
    elif t == "down":
        trend_phrase = "the broader trend still leans lower"
    elif t == "flat":
        trend_phrase = "price action remains range-bound"

    sentiment_phrase = None
    if sent == "positive":
        sentiment_phrase = "sentiment is supportive"
    elif sent == "negative":
        sentiment_phrase = "sentiment is fragile"
    else:
        sentiment_phrase = "sentiment is neutral"

    activity_phrase = None
    if activity in ("elevated", "active"):
        activity_phrase = "trading activity has picked up, which can amplify short-term swings"
    elif activity == "quiet":
        activity_phrase = "activity looks subdued, suggesting limited near-term conviction"

    vol_phrase = None
    if vol_bucket == "high":
        vol_phrase = "volatility is elevated, so moves may be sharper than usual"
    elif vol_bucket == "low":
        vol_phrase = "volatility is contained, which often keeps moves more gradual"

    # Sentence 1: what signals show
    s1_parts = [p for p in [sentiment_phrase, trend_phrase] if p]
    if momentum_bits:
        s1_parts.append(", ".join(momentum_bits[:2]))
    s1 = (company + ": " if company else "") + (" as ".join(s1_parts[:1]) + (", " + "; ".join(s1_parts[1:]) if len(s1_parts) > 1 else "")).strip()
    if not s1.endswith("."):
        s1 += "."

    # Sentence 2: what that means
    if bias == "bullish":
        s2 = "Overall, the setup tilts constructive, but follow-through needs confirmation before confidence improves."
    elif bias == "bearish":
        s2 = "Overall, conditions lean cautious, with downside risk still present unless momentum stabilizes."
    elif bias == "consolidation":
        s2 = "Overall, the market appears indecisive, which often leads to choppy price action rather than a clean trend."
    else:
        s2 = "Overall, signals are mixed, pointing to an uneven near-term backdrop and a higher chance of false starts."

    # Sentence 3: what to watch next
    watch_bits = []
    if range_high is not None and range_low is not None:
        watch_bits.append("a clean break out of the recent trading range")
    if activity_phrase:
        watch_bits.append(activity_phrase)
    elif vol_phrase:
        watch_bits.append(vol_phrase)
    watch_bits.append("a shift in news flow or sentiment that changes risk appetite")
    s3 = "Next, watch for " + ", ".join(watch_bits[:3]) + "."

    # Sentence 4: optional, keep to 3–4 sentences
    s4 = None
    if vol_phrase and (activity_phrase is None):
        s4 = vol_phrase.capitalize() + "."

    sentences = [s1, s2, s3] + ([s4] if s4 else [])
    return " ".join([s.strip() for s in sentences if s and s.strip()])


def generate_insight(company, spike_ratio, source_sentiment, headlines, technical=None):
    """
    Generates AI analysis using a local Ollama model (Llama 3.2 3B by default).
    Falls back to canned responses if the model is unreachable.
    """
    try:
        # Pull key technical signals (best effort; keep prompt stable even if missing)
        details = (technical or {}).get("details") if isinstance(technical, dict) else None
        d0 = details[0] if isinstance(details, list) and details else {}
        last_close = d0.get("last_close")
        rsi = d0.get("rsi")
        macd_diff = d0.get("macd_diff")
        trend = d0.get("trend")
        vol = d0.get("volatility")
        range_high = d0.get("range_high")
        range_low = d0.get("range_low")
        ta_signal = (technical or {}).get("signal") if isinstance(technical, dict) else None

        sent = _clamp_sentiment(source_sentiment)

        # Keep headlines compact (model tends to regurgitate long lists)
        if isinstance(headlines, (list, tuple)):
            compact_headlines = " | ".join([str(h).strip() for h in headlines if str(h).strip()][:2])
        else:
            compact_headlines = str(headlines or "").strip()

        def clean(val):
            return val if val not in [None, "N/A"] else "not available"

        rsi = clean(rsi)
        macd_diff = clean(macd_diff)
        trend = clean(trend)
        vol = clean(vol)

        prompt = (
            "Write a concise, professional market insight in smooth sentences.\n"
            "Make bullet points, headings, labels if needed, no emojis.\n"
            "Do NOT list raw indicator values (no 'RSI 38.4', no 'MACD -0.01'). Instead, interpret them in words.\n"
            "Do NOT explicitly repeat or recommend a trading decision (avoid words like BUY/SELL/HOLD).\n"
            "Maintain a calm, analytical tone with logical flow: (1) what signals show, (2) what it means, (3) what to watch next.\n\n"
            f"asset={company}\n"
            f"sentiment={sent}\n"
            f"spike_ratio={_fmt(spike_ratio, 'x')}\n"
            f"last_close={_fmt(last_close)} range_high={_fmt(range_high)} range_low={_fmt(range_low)}\n"
            f"rsi={_fmt(rsi)} macd_diff={_fmt(macd_diff)} trend={_fmt(trend)} volatility={_fmt(vol)}\n"
            f"technical_signal={_fmt(ta_signal)}\n"
            f"headlines={compact_headlines}\n"
        )

        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        resp.raise_for_status()
        text = (resp.json().get("response", "") or "").strip()

        # Validate model output; if it doesn't include required signals/actions, fall back to deterministic format.
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        must_have = [sent]
        # Keep validation loose: we want human-like narrative, not rigid keyword stuffing.
        valid = (2 <= len(lines) <= 4) and all(m.lower() in text.lower() for m in must_have)
        if valid:
            return "\n".join(lines[:4])

        bias = _bias_from_signals(sent, rsi, macd_diff, trend, ta_signal)
        action = _action_from_bias(bias)
        return _structured_insight(
            company, spike_ratio, sent, rsi, macd_diff, trend, vol, range_high, range_low, bias, action
        )

    except Exception as e:
        print(f"⚠️ Ollama error: {e}")
        print("⚡ Switching to Backup Analyst Mode...")

        # Deterministic, structured fallback (short and actionable)
        sent = _clamp_sentiment(source_sentiment)
        details = (technical or {}).get("details") if isinstance(technical, dict) else None
        d0 = details[0] if isinstance(details, list) and details else {}
        last_close = d0.get("last_close")
        rsi = d0.get("rsi")
        macd_diff = d0.get("macd_diff")
        trend = d0.get("trend")
        vol = d0.get("volatility")
        range_high = d0.get("range_high")
        range_low = d0.get("range_low")
        ta_signal = (technical or {}).get("signal") if isinstance(technical, dict) else "HOLD"

        bias = _bias_from_signals(sent, rsi, macd_diff, trend, ta_signal)
        action = _action_from_bias(bias)
        return _structured_insight(
            company, spike_ratio, sent, rsi, macd_diff, trend, vol, range_high, range_low, bias, action
        )