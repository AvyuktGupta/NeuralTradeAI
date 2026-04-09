import os
import random
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")


def generate_insight(company, spike_ratio, source_sentiment, headlines):
    """
    Generates AI analysis using a local Ollama model (Llama 3.2 1B by default).
    Falls back to canned responses if the model is unreachable.
    """
    try:
        prompt = (
            f"Analyze {company} stock based on this data:\n"
            f"- News Sentiment: {source_sentiment}\n"
            f"- Viral Spike Ratio: {spike_ratio}x (Normal is 1.0x)\n"
            f"- Recent Headlines: {headlines}\n\n"
            "Provide a single, short, professional financial insight sentence (max 25 words). "
            "Do not use asterisks or formatting."
        )

        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()

    except Exception as e:
        print(f"⚠️ Ollama error: {e}")
        print("⚡ Switching to Backup Analyst Mode...")

        backups = [
            f"High trading velocity detected for {company}; sentiment remains volatile amidst recent sector-wide corrections.",
            f"Institutional interest in {company} appears elevated, though retail sentiment is showing signs of caution.",
            f"{company} is showing strong momentum signals, likely driven by the recent positive news cycle.",
            f"Market data indicates a potential breakout for {company}, supported by increasing volume pressure.",
            f"Cautious accumulation observed in {company} as technical indicators approach key resistance levels.",
        ]
        return random.choice(backups)