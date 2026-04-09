"""
Telegram Messenger API
Handles sending messages via Telegram bot
"""
import os
import requests
from dotenv import load_dotenv

# Load .env from NeuralTrade folder and project root (no secrets in code)
_here = os.path.dirname(os.path.abspath(__file__))
_neuraltrade_env = os.path.join(_here, "..", "..", ".env")   # NeuralTrade/.env
_root_env = os.path.join(_here, "..", "..", "..", ".env")     # NeuralTradeMachine/.env
load_dotenv()
load_dotenv(_neuraltrade_env)
load_dotenv(_root_env)

def send_telegram_message(message: str, parse_mode: str = "Markdown") -> bool:
    """
    Send a message via Telegram bot.
    
    Args:
        message: The message text to send
        parse_mode: Telegram parse mode (Markdown, HTML, or None)
    
    Returns:
        bool: True if message sent successfully, False otherwise
    """
    # Support both names so .env can use TELEGRAM_BOT_TOKEN or TELEGRAM_TOKEN
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    telegram_enabled = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"
    
    if not telegram_enabled:
        print("(Telegram disabled) Message would be:", message)
        return False
    
    if not bot_token or not chat_id:
        print("Telegram credentials not configured")
        return False
    
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": parse_mode
    }
    
    try:
        response = requests.post(url, data=payload)
        if response.status_code == 200:
            print("Message sent to Telegram.")
            return True
        else:
            print(f"Failed to send message: {response.text}")
            return False
    except Exception as e:
        print(f"Error sending Telegram message: {e}")
        return False


def get_chat_id(bot_token: str) -> str:
    """
    Helper function to get chat ID from Telegram bot.
    This is useful for initial setup.
    
    Args:
        bot_token: Telegram bot token
    
    Returns:
        str: Chat ID if found, empty string otherwise
    """
    get_updates_url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
    
    try:
        res = requests.get(get_updates_url)
        data = res.json()
        
        if data.get('result'):
            chat_id = str(data['result'][-1]['message']['chat']['id'])
            print(f"Chat ID: {chat_id}")
            return chat_id
        else:
            print("No messages found. Send /start to your bot on Telegram.")
            return ""
    except Exception as e:
        print(f"Error getting chat ID: {e}")
        return ""
