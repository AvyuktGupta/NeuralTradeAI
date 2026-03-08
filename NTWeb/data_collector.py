import os
import requests
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from datetime import datetime

# Load .env from project root or current dir
_load_env = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
load_dotenv()
load_dotenv(_load_env)
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

def fetch_news_api(company, page_size=5):
    """Fetch news from NewsAPI.org"""
    if not NEWS_API_KEY:
        print("Error: Missing NEWS_API_KEY")
        return []
        
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": company,
        "apiKey": NEWS_API_KEY,
        "sortBy": "publishedAt",
        "language": "en",
        "pageSize": page_size
    }
    try:
        response = requests.get(url, params=params)
        # Check if the API returned an error
        if response.status_code != 200:
            print(f"NewsAPI Error: {response.status_code} - {response.text}")
            return []
            
        data = response.json()
        articles = data.get("articles", [])
        results = []
        for article in articles:
            results.append({
                "text": article["title"],
                "timestamp": article["publishedAt"],
                "source": article["source"]["name"],
                "url": article.get("url") or ""
            })
        return results
    except Exception as e:
        print(f"Error fetching NewsAPI: {e}")
        return []

def fetch_google_news(company, page_size=5):
    """Fetch news from Google News RSS feed"""
    # Fix the query format to prevent 404 errors
    clean_company = company.strip().replace(" ", "+")
    url = f"https://news.google.com/rss/search?q={clean_company}&hl=en-US&gl=US&ceid=US:en"
    
    try:
        response = requests.get(url)
        # Google returns 200 even if no news, but let's be safe
        if response.status_code != 200:
            print(f"Google News Error: {response.status_code}")
            return []

        soup = BeautifulSoup(response.content, "xml")
        items = soup.find_all("item")[:page_size]
        results = []
        for item in items:
            link_el = item.find("link")
            results.append({
                "text": item.title.text,
                "timestamp": item.pubDate.text,
                "source": "Google News",
                "url": link_el.get_text(strip=True) if link_el else ""
            })
        return results
    except Exception as e:
        print(f"Error fetching Google News: {e}")
        return []

def parse_timestamp(ts):
    """Convert timestamp string to datetime object for sorting"""
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    except:
        try:
            return datetime.strptime(ts, "%a, %d %b %Y %H:%M:%S %Z")
        except:
            return datetime.now() # Fallback