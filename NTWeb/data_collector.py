import os
import requests
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from datetime import datetime, timedelta, timezone
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Load .env from project root or current dir
_load_env = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
load_dotenv()
load_dotenv(_load_env)
NEWS_API_KEY = os.getenv("NEWS_API_KEY")
NEWSAPI_ENABLED = os.getenv("NEWSAPI_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")
NEWSAPI_TIMEOUT_S = float(os.getenv("NEWSAPI_TIMEOUT_S", "10") or 10)

def _join_text_parts(*parts, max_chars=4000):
    """
    Join non-empty text parts into one analysis string.
    Keep it reasonably bounded so we don't send huge payloads downstream.
    """
    cleaned = []
    for p in parts:
        s = (p or "")
        try:
            s = str(s)
        except Exception:
            continue
        s = " ".join(s.split()).strip()
        if s:
            cleaned.append(s)
    text = "\n".join(cleaned).strip()
    if max_chars and len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].strip()
    return text

def _requests_session_with_retries():
    """
    Centralize retry policy for flaky networks.
    Keep retries low to avoid slowing the UI.
    """
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    s = requests.Session()
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    return s

def fetch_news_api(company, page_size=100, days_back=7):
    """Fetch news from NewsAPI.org (default: articles from the last ``days_back`` days)."""
    if not NEWSAPI_ENABLED:
        return []
    if not NEWS_API_KEY:
        print("Error: Missing NEWS_API_KEY")
        return []

    page_size = max(1, min(int(page_size), 100))
    from_dt = datetime.now(timezone.utc) - timedelta(days=max(1, int(days_back)))
        
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": company,
        "apiKey": NEWS_API_KEY,
        "sortBy": "publishedAt",
        "language": "en",
        "pageSize": page_size,
        "from": from_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    try:
        session = _requests_session_with_retries()
        response = session.get(url, params=params, timeout=NEWSAPI_TIMEOUT_S)
        # Check if the API returned an error
        if response.status_code != 200:
            # Don't print full URL (it includes apiKey); keep logs safe.
            msg = ""
            try:
                msg = (response.text or "")[:500]
            except Exception:
                msg = ""
            print(f"NewsAPI Error: HTTP {response.status_code}" + (f" - {msg}" if msg else ""))
            return []
            
        data = response.json()
        articles = data.get("articles", [])
        results = []
        for article in articles:
            # Prefer "whole article" text when available: title + description + content.
            # NewsAPI often provides a truncated "content" field; still better than title only.
            full_text = _join_text_parts(
                article.get("title"),
                article.get("description"),
                article.get("content"),
            )
            results.append({
                "text": full_text or (article.get("title") or ""),
                "timestamp": article["publishedAt"],
                "source": article["source"]["name"],
                "url": article.get("url") or ""
            })
        return results
    except requests.exceptions.RequestException as e:
        # Common on Windows when DNS is misconfigured/offline: getaddrinfo failed
        print(f"NewsAPI unreachable (network/DNS). Falling back. Details: {e.__class__.__name__}")
        return []
    except Exception as e:
        print(f"NewsAPI unexpected error. Falling back. Details: {e.__class__.__name__}")
        return []

def fetch_google_news(company, page_size=100, days_back=7):
    """Fetch news from Google News RSS feed (restricted to articles after ``days_back`` days ago)."""
    clean_company = company.strip().replace(" ", "+")
    after = (datetime.now(timezone.utc) - timedelta(days=max(1, int(days_back)))).strftime("%Y-%m-%d")
    # ``after:`` narrows RSS results to recent items; we still filter by parsed dates in the API layer.
    q = f"{clean_company}+after:{after}"
    url = f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    
    try:
        response = requests.get(url)
        # Google returns 200 even if no news, but let's be safe
        if response.status_code != 200:
            print(f"Google News Error: {response.status_code}")
            return []

        soup = BeautifulSoup(response.content, "xml")
        page_size = max(1, min(int(page_size), 200))
        items = soup.find_all("item")[:page_size]
        results = []
        for item in items:
            link_el = item.find("link")
            desc_el = item.find("description")
            # Google News RSS descriptions often contain HTML; strip to plain text.
            desc_text = ""
            try:
                if desc_el and desc_el.text:
                    desc_text = BeautifulSoup(desc_el.text, "html.parser").get_text(" ", strip=True)
            except Exception:
                desc_text = desc_el.text if desc_el else ""

            title_text = item.title.text if item.title else ""
            full_text = _join_text_parts(title_text, desc_text)
            results.append({
                "text": full_text or title_text,
                "timestamp": item.pubDate.text,
                "source": "Google News",
                "url": link_el.get_text(strip=True) if link_el else ""
            })
        return results
    except Exception as e:
        print(f"Error fetching Google News: {e}")
        return []

def parse_timestamp(ts):
    """Parse a news timestamp to a naive UTC datetime (for sorting and date windows)."""
    if ts is None:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    s = str(ts).strip()
    if not s:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        iso = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(iso)
    except ValueError:
        try:
            dt = datetime.strptime(s, "%a, %d %b %Y %H:%M:%S %Z")
        except ValueError:
            try:
                dt = datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                return datetime.now(timezone.utc).replace(tzinfo=None)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(tzinfo=None)