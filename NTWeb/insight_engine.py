import json
import os
import random
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT_S = float(os.getenv("OLLAMA_TIMEOUT_S", "120"))


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


def _to_float_levels(v):
    if v is None or v == "N/A":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _expected_move_context(range_high, range_low):
    """
    Derives estimated percentage move ranges from recent high/low.
    Returns dict: has_moves, expected_bull_move, expected_bear_move, range_high_fmt, range_low_fmt.
    """
    rh = _to_float_levels(range_high)
    rl = _to_float_levels(range_low)
    if rh is None or rl is None or rl <= 0:
        return {
            "has_moves": False,
            "expected_bull_move": "",
            "expected_bear_move": "",
            "range_high_fmt": _fmt(range_high),
            "range_low_fmt": _fmt(range_low),
        }

    range_move_percent = ((rh - rl) / rl) * 100
    if range_move_percent <= 0:
        return {
            "has_moves": False,
            "expected_bull_move": "",
            "expected_bear_move": "",
            "range_high_fmt": _fmt(range_high),
            "range_low_fmt": _fmt(range_low),
        }

    bull_min = round(range_move_percent * 1.5, 1)
    bull_max = round(range_move_percent * 3, 1)
    bear_min = round(range_move_percent * 1.2, 1)
    bear_max = round(range_move_percent * 2.5, 1)

    return {
        "has_moves": True,
        "expected_bull_move": f"{bull_min}-{bull_max}%",
        "expected_bear_move": f"{bear_min}-{bear_max}%",
        "range_high_fmt": f"{rh:.2f}",
        "range_low_fmt": f"{rl:.2f}",
    }


def _structured_insight(company, spike_ratio, sent, rsi, macd_diff, trend, vol, range_high, range_low, bias, action):
    activity = _activity_bucket(spike_ratio)
    vol_bucket = _vol_bucket(vol)

    # Human, analyst-style narrative (briefing format; no raw values; no explicit BUY/SELL/HOLD)
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

    # Paragraph 1: Key signals only (sentiment, RSI, MACD, trend)
    setup_bits = [p for p in [sentiment_phrase, trend_phrase] if p]
    if momentum_bits:
        setup_bits.append(" and ".join(momentum_bits[:2]))
    p1 = (", ".join([b for b in setup_bits if b]).strip() if setup_bits else "signals are limited")
    if company:
        p1 = f"{company}: {p1}"
    if not p1.endswith("."):
        p1 += "."

    # Paragraph 2: Breakout / breakdown levels with % moves (if available)
    move_ctx = _expected_move_context(range_high, range_low)
    if move_ctx["has_moves"]:
        p2 = (
            f"Breakout above {move_ctx['range_high_fmt']}: ~{move_ctx['expected_bull_move']} move potential."
            f" Breakdown below {move_ctx['range_low_fmt']}: ~{move_ctx['expected_bear_move']} move risk."
        )
    else:
        p2 = "Levels are not clean enough for a reliable % move estimate. Treat breakouts and breakdowns as confirmation-based only."

    # Paragraph 3: What to watch next (max 3 bullets)
    watch_bits = []
    if range_high is not None and range_low is not None:
        watch_bits.append(
            "Range resolution (clean breakout vs breakdown)."
        )
    if activity in ("elevated", "active"):
        watch_bits.append(
            "Participation (volume/activity) for follow-through vs fade."
        )
    elif activity == "quiet":
        watch_bits.append(
            "Participation pickup as confirmation."
        )
    watch_bits.append(
        "Sentiment/news inflection that flips risk appetite."
    )

    bullets = "\n".join([f"- {b.strip().rstrip('.')}" for b in watch_bits[:3] if b and str(b).strip()])
    p3 = bullets if bullets else "- Price structure confirmation before sizing."

    return "\n\n".join([p1.strip(), p2.strip(), p3.strip()]).strip()


def _insight_looks_ok(text):
    lines = [ln.rstrip() for ln in (text or "").splitlines()]
    nonempty = [ln.strip() for ln in lines if ln.strip()]
    return (len("".join(nonempty)) >= 120) and (len(nonempty) >= 3)


def _build_insight_context(company, spike_ratio, source_sentiment, headlines, technical=None):
    """
    Builds Ollama prompt and parallel fields for validation / structured fallback.
    """
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

    if isinstance(headlines, (list, tuple)):
        compact_headlines = " | ".join([str(h).strip() for h in headlines if str(h).strip()][:2])
    else:
        compact_headlines = str(headlines or "").strip()

    def clean(val):
        return val if val not in [None, "N/A"] else "not available"

    rsi_c = clean(rsi)
    macd_c = clean(macd_diff)
    trend_c = clean(trend)
    vol_c = clean(vol)

    move_ctx = _expected_move_context(range_high, range_low)
    if move_ctx["has_moves"]:
        move_instructions = (
            "Include breakout/breakdown levels with approximate % move ranges derived from the recent range. "
            "Treat these as rough estimates only, not predictions. Preserve the numbers exactly.\n"
            "Use this exact wording (one paragraph, two sentences):\n"
            f"Breakout above {move_ctx['range_high_fmt']}: ~{move_ctx['expected_bull_move']} move potential. "
            f"Breakdown below {move_ctx['range_low_fmt']}: ~{move_ctx['expected_bear_move']} move risk.\n"
        )
        move_data = (
            f"expected_bull_move={move_ctx['expected_bull_move']}\n"
            f"expected_bear_move={move_ctx['expected_bear_move']}\n"
            f"range_high_level={move_ctx['range_high_fmt']} range_low_level={move_ctx['range_low_fmt']}\n"
        )
    else:
        move_instructions = (
            "range_high and/or range_low are not available or not usable for a range-based move estimate. "
            "Do NOT mention specific percentage targets for upside or downside.\n"
        )
        move_data = "expected_bull_move=unavailable expected_bear_move=unavailable\n"

    prompt = (
        "You are a professional financial analyst AI.\n"
        "Write a quick trading briefing: crisp, direct, professional.\n"
        "Max 3 short paragraphs. No headings. No 'Summary' or 'Assessment'.\n"
        "Do not repeat the same idea twice.\n"
        "Focus ONLY on: (1) key signals (sentiment, RSI, MACD, trend), "
        "(2) breakout/breakdown levels with % moves (if available), (3) what to watch next (max 3 bullets).\n"
        "Do not refer to yourself. Never use first person (no I, me, my, mine, we, us, our). "
        "Speak directly to the reader with imperative and second-person phrasing where it helps (e.g. watchpoints).\n"
        "Paragraph 1: Key signals only. Interpret sentiment/RSI/MACD/trend in words (no raw values).\n"
        "Paragraph 2: " + ("Use the breakout/breakdown sentence exactly as provided below.\n" if move_ctx["has_moves"] else "Discuss breakout/breakdown qualitatively without % targets.\n") +
        "Paragraph 3: Exactly 2-3 bullets on what to watch next. Keep bullets short.\n"
        "No emojis.\n"
        "Do NOT list raw indicator values (no 'RSI 38.4', no 'MACD -0.01'). Instead, interpret them in words.\n"
        "Do NOT explicitly repeat or recommend a trading decision (avoid words like BUY/SELL/HOLD).\n"
        "Avoid semicolons. Use clear punctuation.\n"
        "Logical flow: signals → levels → watchpoints.\n"
        + move_instructions
        + "\n"
        f"asset={company}\n"
        f"sentiment={sent}\n"
        f"spike_ratio={_fmt(spike_ratio, 'x')}\n"
        f"last_close={_fmt(last_close)} range_high={_fmt(range_high)} range_low={_fmt(range_low)}\n"
        f"rsi={_fmt(rsi_c)} macd_diff={_fmt(macd_c)} trend={_fmt(trend_c)} volatility={_fmt(vol_c)}\n"
        f"technical_signal={_fmt(ta_signal)}\n"
        + move_data
        + f"headlines={compact_headlines}\n"
    )

    return {
        "prompt": prompt,
        "company": company,
        "spike_ratio": spike_ratio,
        "sent": sent,
        "rsi": rsi_c,
        "macd_diff": macd_c,
        "trend": trend_c,
        "vol": vol_c,
        "range_high": range_high,
        "range_low": range_low,
        "ta_signal": ta_signal,
    }


def _structured_from_context(ctx):
    bias = _bias_from_signals(ctx["sent"], ctx["rsi"], ctx["macd_diff"], ctx["trend"], ctx["ta_signal"])
    action = _action_from_bias(bias)
    return _structured_insight(
        ctx["company"],
        ctx["spike_ratio"],
        ctx["sent"],
        ctx["rsi"],
        ctx["macd_diff"],
        ctx["trend"],
        ctx["vol"],
        ctx["range_high"],
        ctx["range_low"],
        bias,
        action,
    )


def _ollama_stream_deltas(prompt):
    with requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": True},
        stream=True,
        timeout=OLLAMA_TIMEOUT_S,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            piece = obj.get("response") or ""
            if piece:
                yield piece
            if obj.get("done"):
                break


def produce_insight_stream_queue(q, company, spike_ratio, source_sentiment, headlines, technical=None):
    """
    Background worker: pushes insight stream messages to q.
    Items: ("delta", str), ("done", str normalized), ("replace", str fallback).
    """
    try:
        ctx = _build_insight_context(company, spike_ratio, source_sentiment, headlines, technical)
    except Exception:
        q.put(("replace", "Analysis temporarily unavailable."))
        return

    acc = []
    try:
        for piece in _ollama_stream_deltas(ctx["prompt"]):
            acc.append(piece)
            q.put(("delta", piece))
        raw = "".join(acc).strip()
        lines = [ln.rstrip() for ln in raw.splitlines()]
        normalized = "\n".join(lines).strip()
        if _insight_looks_ok(normalized):
            q.put(("done", normalized))
        else:
            q.put(("replace", _structured_from_context(ctx)))
    except Exception as e:
        print(f"Ollama stream error: {e}")
        print("Switching to Backup Analyst Mode...")
        q.put(("replace", _structured_from_context(ctx)))


def generate_insight(company, spike_ratio, source_sentiment, headlines, technical=None):
    """
    Generates AI analysis using a local Ollama model (Llama 3.2 3B by default).
    Falls back to canned responses if the model is unreachable.
    """
    try:
        ctx = _build_insight_context(company, spike_ratio, source_sentiment, headlines, technical)

        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": ctx["prompt"], "stream": False},
            timeout=OLLAMA_TIMEOUT_S,
        )
        resp.raise_for_status()
        text = (resp.json().get("response", "") or "").strip()

        lines = [ln.rstrip() for ln in text.splitlines()]
        if _insight_looks_ok(text):
            return "\n".join(lines).strip()

        return _structured_from_context(ctx)

    except Exception as e:
        print(f"Ollama error: {e}")
        print("Switching to Backup Analyst Mode...")
        try:
            ctx = _build_insight_context(company, spike_ratio, source_sentiment, headlines, technical)
            return _structured_from_context(ctx)
        except Exception:
            sent = _clamp_sentiment(source_sentiment)
            details = (technical or {}).get("details") if isinstance(technical, dict) else None
            d0 = details[0] if isinstance(details, list) and details else {}
            vol = d0.get("volatility")
            range_high = d0.get("range_high")
            range_low = d0.get("range_low")
            rsi = d0.get("rsi")
            macd_diff = d0.get("macd_diff")
            trend = d0.get("trend")
            ta_signal = (technical or {}).get("signal") if isinstance(technical, dict) else "HOLD"
            bias = _bias_from_signals(sent, rsi, macd_diff, trend, ta_signal)
            action = _action_from_bias(bias)
            return _structured_insight(
                company, spike_ratio, sent, rsi, macd_diff, trend, vol, range_high, range_low, bias, action
            )