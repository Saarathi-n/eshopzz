"""
eShopzz Flask API with MongoDB
==============================
Backend API for the eShopzz e-commerce aggregator.
Provides /search endpoint that scrapes Amazon and Flipkart.
Uses NVIDIA AI (Kimi-K2) for intelligent chatbot responses.
Uses MongoDB for user authentication and cart persistence.
"""

import os
import json
import re
import time
import hashlib
import copy
from datetime import datetime, timedelta
from threading import Event, Lock
from bson import ObjectId
from flask import Flask, request, jsonify
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pymongo import MongoClient, ASCENDING
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(__file__)
load_dotenv(os.path.join(BASE_DIR, '.env'))

app = Flask(__name__)

# Enable CORS for Next.js frontend (port 3000) and any other ports
CORS(app, origins=[
    "http://localhost:3000",
    "http://localhost:3001", 
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://localhost:5178"
], supports_credentials=True)

# Security Configuration
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secret-key-change-this-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# MongoDB Configuration
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/eshopzz')
mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = mongo_client.get_database()

# Collections
users_collection = db.users
cart_items_collection = db.cart_items

# Create indexes
users_collection.create_index([("username", ASCENDING)], unique=True)
cart_items_collection.create_index([("user_id", ASCENDING), ("store", ASCENDING)])
cart_items_collection.create_index([("added_at", ASCENDING)])

print(f"[DB] Connected to MongoDB: {MONGODB_URI}")

# Load fallback data
FALLBACK_DATA_PATH = os.path.join(BASE_DIR, 'fallback_data.json')

# Chat dedupe/idempotency settings
CHAT_CACHE_TTL_SECONDS = int(os.getenv('CHAT_CACHE_TTL_SECONDS', '12'))
CHAT_PENDING_WAIT_SECONDS = int(os.getenv('CHAT_PENDING_WAIT_SECONDS', '20'))
CHAT_CACHE_MAX_ITEMS = int(os.getenv('CHAT_CACHE_MAX_ITEMS', '200'))
_CHAT_RESPONSE_CACHE = {}
_CHAT_PENDING = {}
_CHAT_DEDUPE_LOCK = Lock()

# Search response cache settings
SEARCH_CACHE_TTL_SECONDS = int(os.getenv('SEARCH_CACHE_TTL_SECONDS', '90'))
SEARCH_CACHE_MAX_ITEMS = int(os.getenv('SEARCH_CACHE_MAX_ITEMS', '120'))
_SEARCH_CACHE = {}
_SEARCH_CACHE_LOCK = Lock()
SEARCH_REQUEST_TIMEOUT_SECONDS = int(os.getenv('SEARCH_REQUEST_TIMEOUT_SECONDS', '45'))
SEARCH_REQUEST_TIMEOUT_SECONDS_NVIDIA = int(os.getenv('SEARCH_REQUEST_TIMEOUT_SECONDS_NVIDIA', '150'))


def _prune_chat_cache(now_ts):
    """Drop stale cache entries and cap memory."""
    stale_keys = [
        key for key, (ts, _resp) in _CHAT_RESPONSE_CACHE.items()
        if now_ts - ts > CHAT_CACHE_TTL_SECONDS
    ]
    for key in stale_keys:
        _CHAT_RESPONSE_CACHE.pop(key, None)

    overflow = len(_CHAT_RESPONSE_CACHE) - CHAT_CACHE_MAX_ITEMS
    if overflow > 0:
        oldest = sorted(_CHAT_RESPONSE_CACHE.items(), key=lambda item: item[1][0])[:overflow]
        for key, _ in oldest:
            _CHAT_RESPONSE_CACHE.pop(key, None)


def _build_chat_dedupe_key(data, message, current_products):
    """
    Build a stable key for idempotency:
    1) explicit request id (header/body) when available
    2) fallback fingerprint from message + product summary
    """
    explicit_request_id = (
        request.headers.get('X-Request-ID', '') or data.get('request_id', '')
    ).strip()
    if explicit_request_id:
        return f"rid:{explicit_request_id}"

    compact_products = []
    for p in current_products[:8]:
        compact_products.append({
            'title': (p.get('title') or '')[:80].lower(),
            'amazon_price': p.get('amazon_price'),
            'flipkart_price': p.get('flipkart_price')
        })

    fingerprint = {
        'message': message.lower(),
        'products': compact_products
    }
    payload = json.dumps(fingerprint, sort_keys=True, separators=(',', ':'))
    return "fp:" + hashlib.sha1(payload.encode('utf-8')).hexdigest()


def _reserve_chat_slot(chat_key):
    """
    Reserve the request slot for a dedupe key.
    Returns:
      ("cached", response, None) when cached response exists
      ("leader", None, event) for the request that should perform work
    """
    now_ts = time.time()
    with _CHAT_DEDUPE_LOCK:
        _prune_chat_cache(now_ts)

        cached_entry = _CHAT_RESPONSE_CACHE.get(chat_key)
        if cached_entry and (now_ts - cached_entry[0] <= CHAT_CACHE_TTL_SECONDS):
            return "cached", cached_entry[1], None

        pending_event = _CHAT_PENDING.get(chat_key)
        if pending_event is None:
            pending_event = Event()
            _CHAT_PENDING[chat_key] = pending_event
            return "leader", None, pending_event

    # Another identical request is in progress; wait for it and reuse the result.
    if pending_event.wait(timeout=CHAT_PENDING_WAIT_SECONDS):
        with _CHAT_DEDUPE_LOCK:
            cached_entry = _CHAT_RESPONSE_CACHE.get(chat_key)
            if cached_entry and (time.time() - cached_entry[0] <= CHAT_CACHE_TTL_SECONDS):
                return "cached", cached_entry[1], None

    # If wait timed out or producer failed, promote this request as leader.
    with _CHAT_DEDUPE_LOCK:
        current_pending = _CHAT_PENDING.get(chat_key)
        if current_pending is pending_event:
            replacement_event = Event()
            _CHAT_PENDING[chat_key] = replacement_event
            return "leader", None, replacement_event

        cached_entry = _CHAT_RESPONSE_CACHE.get(chat_key)
        if cached_entry and (time.time() - cached_entry[0] <= CHAT_CACHE_TTL_SECONDS):
            return "cached", cached_entry[1], None

        replacement_event = Event()
        _CHAT_PENDING[chat_key] = replacement_event
        return "leader", None, replacement_event


def _finalize_chat_slot(chat_key, pending_event, response):
    """Persist leader response and release any waiting duplicate requests."""
    if pending_event is None:
        return

    now_ts = time.time()
    with _CHAT_DEDUPE_LOCK:
        if response is not None:
            _CHAT_RESPONSE_CACHE[chat_key] = (now_ts, response)
            _prune_chat_cache(now_ts)

        current_pending = _CHAT_PENDING.get(chat_key)
        if current_pending is pending_event:
            _CHAT_PENDING.pop(chat_key, None)
            pending_event.set()


def _search_cache_key(query, sort_by, use_mock, use_nvidia, model):
    return f"{query.lower().strip()}|{sort_by}|{use_mock}|{use_nvidia}|{model}"


def _prune_search_cache(now_ts):
    stale_keys = [
        key for key, (ts, _payload) in _SEARCH_CACHE.items()
        if now_ts - ts > SEARCH_CACHE_TTL_SECONDS
    ]
    for key in stale_keys:
        _SEARCH_CACHE.pop(key, None)

    overflow = len(_SEARCH_CACHE) - SEARCH_CACHE_MAX_ITEMS
    if overflow > 0:
        oldest = sorted(_SEARCH_CACHE.items(), key=lambda item: item[1][0])[:overflow]
        for key, _ in oldest:
            _SEARCH_CACHE.pop(key, None)


def _get_cached_search(cache_key):
    now_ts = time.time()
    with _SEARCH_CACHE_LOCK:
        _prune_search_cache(now_ts)
        entry = _SEARCH_CACHE.get(cache_key)
        if not entry:
            return None
        ts, payload = entry
        if now_ts - ts > SEARCH_CACHE_TTL_SECONDS:
            _SEARCH_CACHE.pop(cache_key, None)
            return None
        return copy.deepcopy(payload)


def _set_cached_search(cache_key, payload):
    now_ts = time.time()
    with _SEARCH_CACHE_LOCK:
        _SEARCH_CACHE[cache_key] = (now_ts, copy.deepcopy(payload))
        _prune_search_cache(now_ts)


def load_fallback_data():
    """Load fallback data from JSON file."""
    try:
        with open(FALLBACK_DATA_PATH, 'r') as f:
            data = json.load(f)
            return data.get('products', [])
    except Exception as e:
        print(f"Error loading fallback data: {e}")
        return []


def search_with_timeout(query, timeout=15, use_nvidia=False, model=None):
    """
    Execute scraper with timeout.
    Falls back to mock data if scraping fails or takes too long.
    """
    from scraper import search_products
    
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(search_products, query, timeout, use_nvidia, model)
    try:
        results = future.result(timeout=timeout)
        if results and len(results) > 0:
            return results, False  # Results, is_fallback
    except FuturesTimeoutError:
        print(f"[API] Scraping timed out after {timeout}s - check scraper.py for driver/network latency")
    except Exception as e:
        print(f"[API] Scraping error: {e}")
    
    return load_fallback_data(), True  # Fallback data, is_fallback=True


# ═══════════════════════════════════════════════════════════
# Search & Product Routes
# ═══════════════════════════════════════════════════════════

@app.route('/search', methods=['GET'])
def search():
    """
    Search products across Amazon and Flipkart.
    Query params:
      - q: search query
      - sort: 'relevance' | 'price_asc' | 'price_desc' | 'rating'
      - mock: '1' to force fallback data
      - use_nvidia: 'true' to use NVIDIA AI for matching
      - model: AI model ID for matching
    """
    start_time = time.time()
    query = request.args.get('q', '').strip()
    sort_by = request.args.get('sort', 'relevance')
    mock_raw = request.args.get('mock', '0').lower()
    use_mock = mock_raw in ('1', 'true', 'yes')

    use_nvidia_raw = request.args.get('use_nvidia', request.args.get('nvidia', 'false')).lower()
    use_nvidia = use_nvidia_raw in ('1', 'true', 'yes')
    ai_model = request.args.get('model', 'moonshotai/kimi-k2-instruct-0905')

    if not query:
        return jsonify({'success': False, 'error': 'Query parameter "q" is required'}), 400

    cache_key = _search_cache_key(query, sort_by, use_mock, use_nvidia, ai_model)
    cached = _get_cached_search(cache_key)
    if cached and not use_mock:
        cached['cache_hit'] = True
        return jsonify(cached)

    request_timeout = SEARCH_REQUEST_TIMEOUT_SECONDS_NVIDIA if use_nvidia else SEARCH_REQUEST_TIMEOUT_SECONDS

    if use_mock:
        products = load_fallback_data()
        is_fallback = True
    else:
        products, is_fallback = search_with_timeout(
            query,
            timeout=request_timeout,
            use_nvidia=use_nvidia,
            model=ai_model
        )
    
    # Implement Sorting
    if products and not is_fallback:
        def get_min_price(p):
            prices = [p.get('amazon_price'), p.get('flipkart_price')]
            valid_prices = [pr for pr in prices if pr is not None]
            return min(valid_prices) if valid_prices else float('inf')

        if sort_by == 'price_asc':
            products.sort(key=get_min_price)
        elif sort_by == 'price_desc':
            products.sort(key=get_min_price, reverse=True)
        elif sort_by == 'rating':
            products.sort(key=lambda p: p.get('rating') or 0, reverse=True)
    
    elapsed = time.time() - start_time
    print(f"[API] Returning {len(products)} products in {elapsed:.2f}s (fallback={is_fallback})")
    
    response_payload = {
        'success': True,
        'query': query,
        'count': len(products),
        'is_fallback': is_fallback,
        'products': products,
        'elapsed_time': round(elapsed, 2),
        'cache_hit': False
    }

    if not use_mock and not is_fallback:
        _set_cached_search(cache_key, response_payload)

    return jsonify(response_payload)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        # Check MongoDB connection
        mongo_client.admin.command('ping')
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return jsonify({
        'status': 'healthy',
        'service': 'eShopzz API',
        'database': db_status
    })


@app.route('/api/models', methods=['GET'])
def get_models():
    """Return available AI models fetched from NVIDIA NIM API."""
    try:
        import requests
        api_key = os.getenv("NVIDIA_API_KEY", "")
        if not api_key:
            raise Exception("NVIDIA_API_KEY not configured")
            
        response = requests.get(
            "https://integrate.api.nvidia.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5
        )
        if response.ok:
            data = response.json().get("data", [])
            models = []
            allowed_keywords = ["minimax", "glm", "deepseek", "qwen", "kimi", "gpt"]
            for m in data:
                model_id = m.get("id", "")
                model_id_lower = model_id.lower()
                
                if not any(keyword in model_id_lower for keyword in allowed_keywords):
                    continue
                    
                if "embed" in model_id_lower or "vision" in model_id_lower:
                    continue
                    
                provider = m.get("owned_by", "NVIDIA")
                if provider == "NVIDIA" and "/" in model_id:
                    provider = model_id.split("/")[0]
                    
                name = model_id.split("/")[-1].replace("-", " ").title()
                
                models.append({
                    'id': model_id,
                    'name': name,
                    'provider': provider.title(),
                    'desc': f'Model by {provider.title()}'
                })
            
            models.sort(key=lambda x: x['name'])
            
            kimi = next((m for m in models if 'kimi' in m['id'].lower()), None)
            if kimi:
                models.remove(kimi)
                models.insert(0, kimi)
                
            return jsonify(models)
    except Exception as e:
        print(f"[API] Error fetching models: {e}")
        
    models = [
        { 'id': 'moonshotai/kimi-k2-instruct-0905', 'name': 'Kimi-K2', 'provider': 'Moonshot AI', 'desc': 'High accuracy product matching' },
        { 'id': 'meta/llama-3.3-70b-instruct', 'name': 'Llama 3.3 70B', 'provider': 'Meta', 'desc': 'Fast & reliable general model' },
    ]
    return jsonify(models)


# ═══════════════════════════════════════════════════════════
# Chatbot Routes
# ═══════════════════════════════════════════════════════════

@app.route('/chat', methods=['POST'])
def chat():
    """
    AI-powered chatbot endpoint using NVIDIA Kimi-K2 model.
    """
    data = request.get_json(silent=True) or {}
    message = (data.get('message', '') or '').strip()
    current_products = data.get('current_products', [])
    ai_model = data.get('model', 'moonshotai/kimi-k2-instruct-0905')
    if not isinstance(current_products, list):
        current_products = []
    
    if not message:
        return jsonify({'success': False, 'error': 'Message is required'}), 400

    chat_key = _build_chat_dedupe_key(data, message, current_products)
    slot_status, cached_response, pending_event = _reserve_chat_slot(chat_key)

    if slot_status == 'cached':
        print("[CHAT] Duplicate request served from cache")
        return jsonify({'success': True, **cached_response})

    print(f"[CHAT] User: {message}")
    response = None

    try:
        response = process_chat_with_ai(message, current_products, ai_model)
    except Exception as e:
        print(f"[CHAT] AI Error: {e}")
        response = process_chat_fallback(message, current_products)

    _finalize_chat_slot(chat_key, pending_event, response)
    return jsonify({'success': True, **response})


def process_chat_with_ai(message, current_products, ai_model):
    """Process chat message with NVIDIA AI."""
    from openai import OpenAI

    api_key = os.getenv("NVIDIA_API_KEY", "")
    if not api_key:
        raise Exception("NVIDIA_API_KEY not configured")
        
    client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=api_key
    )

    system_prompt = build_chat_system_prompt(current_products)
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message}
    ]

    completion = client.chat.completions.create(
        model=ai_model,
        messages=messages,
        temperature=0.3,
        top_p=0.7,
        max_tokens=1024,
    )

    message = completion.choices[0].message
    ai_response = message.content
    
    if ai_response is None:
        if hasattr(message, 'reasoning_content') and message.reasoning_content:
            ai_response = message.reasoning_content
        else:
            ai_response = "{}"
            
    ai_response = ai_response.strip()
    print(f"[CHAT AI] Raw response: {ai_response[:200]}")
    
    ai_response = re.sub(r'^```(?:json)?\s*', '', ai_response)
    ai_response = re.sub(r'\s*```$', '', ai_response)
    ai_response = ai_response.strip()
    
    parsed = json.loads(ai_response)
    
    action = parsed.get('action', 'reply')
    reply = parsed.get('reply', '')
    
    if action == 'search' and parsed.get('search_query'):
        search_query = parsed['search_query']
        budget = parsed.get('budget')
        if budget:
            reply += f"\n\n💰 Budget noted: under ₹{int(budget):,}"
        return {
            'action': 'search',
            'search_query': search_query,
            'reply': reply or f"🔍 Searching for **\"{search_query}\"**... Results will appear in the main area!"
        }
    
    if action == 'recommend' and current_products:
        criteria = parsed.get('criteria', 'best')
        budget = parsed.get('budget')
        
        if criteria == 'compare':
            result = compare_products(current_products)
        else:
            result = recommend_best(current_products, criteria, budget=int(budget) if budget else None)
        
        if reply:
            result['reply'] = reply + "\n\n" + result.get('reply', '')
        return result
    
    return {
        'action': 'reply',
        'reply': reply or "I'm not sure what you mean. Try describing a product or asking about current results!"
    }


def build_chat_system_prompt(products):
    """Build system prompt for chat AI."""
    product_summary = ""
    if products:
        product_summary = "\n\nCurrent search results:\n"
        for i, p in enumerate(products[:10], 1):
            title = p.get('title', 'Unknown')[:60]
            amz = p.get('amazon_price')
            fk = p.get('flipkart_price')
            price_str = f"Amazon: ₹{amz}" if amz else ""
            if fk:
                price_str += f" | Flipkart: ₹{fk}" if price_str else f"Flipkart: ₹{fk}"
            product_summary += f"{i}. {title} - {price_str}\n"

    return f"""You are a helpful shopping assistant for eShopzz, an e-commerce price comparison platform.
Your role is to help users find the best deals across Amazon and Flipkart.

You can:
1. Recommend best/cheapest/highest-rated products from current results
2. Compare products
3. Trigger searches with new queries
4. Answer general shopping questions

Respond in JSON format:
{{
    "action": "reply" | "search" | "recommend",
    "reply": "your helpful response text with markdown formatting",
    "search_query": "extracted search term" (only for search action),
    "criteria": "best" | "cheapest" | "rating" | "compare" (only for recommend action),
    "budget": number (optional, if user mentions budget)
}}

Be concise but helpful. Use **bold** for emphasis.{product_summary}"""


def process_chat_fallback(message, current_products):
    """Fallback keyword-based processing when AI is unavailable."""
    msg = message.lower().strip()
    
    if any(kw in msg for kw in ['best', 'recommend', 'top', 'suggest', 'deal']) and current_products:
        return recommend_best(current_products, 'best')
    
    if any(kw in msg for kw in ['cheap', 'lowest', 'budget', 'affordable']) and current_products:
        budget_match = re.search(r'under\s*₹?\s*(\d[\d,]*)', msg)
        budget = int(budget_match.group(1).replace(',', '')) if budget_match else None
        return recommend_best(current_products, 'cheapest', budget=budget)
    
    if any(kw in msg for kw in ['rated', 'rating', 'stars', 'popular']) and current_products:
        return recommend_best(current_products, 'rating')
    
    if any(kw in msg for kw in ['compare', 'vs', 'versus']) and current_products:
        return compare_products(current_products)
    
    if len(msg.split()) >= 2:
        return {
            'action': 'search',
            'search_query': msg,
            'reply': f"🔍 Searching for **\"{msg}\"**..."
        }
    
    return {
        'action': 'reply',
        'reply': "Tell me what you're looking for, or ask about the current search results!"
    }


def recommend_best(products, criteria='best', budget=None):
    """Recommend the best product(s) from current results based on criteria."""
    if not products:
        return {
            'action': 'reply',
            'reply': "There are no products loaded yet. Search for something first, then ask me for recommendations!"
        }
    
    def get_min_price(p):
        prices = [p.get('amazon_price'), p.get('flipkart_price')]
        valid = [pr for pr in prices if pr is not None]
        return min(valid) if valid else float('inf')
    
    def get_savings(p):
        a = p.get('amazon_price')
        f = p.get('flipkart_price')
        if a and f:
            return abs(a - f)
        return 0
    
    filtered = products
    if budget:
        filtered = [p for p in products if get_min_price(p) <= budget]
        if not filtered:
            return {
                'action': 'reply',
                'reply': f"No products found under ₹{budget:,}. The cheapest option is ₹{get_min_price(min(products, key=get_min_price)):,.0f}. Try a higher budget?"
            }
    
    if criteria == 'cheapest':
        sorted_prods = sorted(filtered, key=get_min_price)
        top = sorted_prods[:3]
        label = "💰 **Cheapest Options**"
        if budget:
            label = f"💰 **Best Options Under ₹{budget:,}**"
        
    elif criteria == 'rating':
        sorted_prods = sorted(filtered, key=lambda p: p.get('rating') or 0, reverse=True)
        top = sorted_prods[:3]
        label = "⭐ **Highest Rated Products**"
        
    else:
        def score(p):
            price = get_min_price(p)
            rating = p.get('rating') or 0
            savings = get_savings(p)
            has_both = 1 if (p.get('amazon_price') and p.get('flipkart_price')) else 0
            price_score = max(0, 100 - (price / 1000)) if price < float('inf') else 0
            return (rating * 20) + price_score + (savings / 100) + (has_both * 10)
        
        sorted_prods = sorted(filtered, key=score, reverse=True)
        top = sorted_prods[:3]
        label = "🏆 **Best Overall Deals**"
    
    lines = [label]
    for p in top:
        title = p.get('title', 'Unknown')[:50]
        price = get_min_price(p)
        rating = p.get('rating')
        rating_str = f"⭐ {rating}" if rating else ""
        lines.append(f"• **{title}** - ₹{price:,.0f} {rating_str}")
    
    return {
        'action': 'recommend',
        'reply': '\n'.join(lines),
        'products': top
    }


def compare_products(products):
    """Compare top products side by side."""
    if not products or len(products) < 2:
        return {
            'action': 'reply',
            'reply': "Need at least 2 products to compare. Try searching for more items!"
        }
    
    top = products[:4]
    lines = ["📊 **Product Comparison**\n"]
    
    for p in top:
        title = p.get('title', 'Unknown')[:40]
        amz = p.get('amazon_price')
        fk = p.get('flipkart_price')
        rating = p.get('rating')
        
        price_display = ""
        if amz and fk:
            cheaper = "Amazon" if amz < fk else "Flipkart"
            price_display = f"₹{min(amz, fk):,.0f} (cheaper on {cheaper})"
        elif amz:
            price_display = f"₹{amz:,.0f} (Amazon only)"
        elif fk:
            price_display = f"₹{fk:,.0f} (Flipkart only)"
        else:
            price_display = "Price unavailable"
        
        rating_str = f"⭐ {rating}/5" if rating else ""
        lines.append(f"**{title}**\n💰 {price_display} {rating_str}\n")
    
    return {
        'action': 'recommend',
        'reply': '\n'.join(lines),
        'products': top
    }


# ═══════════════════════════════════════════════════════════
# Product Comparison Route
# ═══════════════════════════════════════════════════════════

@app.route('/api/compare', methods=['POST'])
def compare_products_detailed():
    """
    Detailed product comparison with specs scraped from product pages.
    """
    from scraper import scrape_product_details
    
    data = request.get_json()
    products_to_compare = data.get('products', [])
    
    if not products_to_compare:
        return jsonify({'success': False, 'error': 'No products provided'}), 400
    
    if len(products_to_compare) > 4:
        return jsonify({'success': False, 'error': 'Maximum 4 products can be compared'}), 400
    
    start_time = time.time()
    results = [None] * len(products_to_compare)
    
    def scrape_single_product_details(index, p):
        title = p.get('title', '')[:60]
        amazon_specs = {}
        flipkart_specs = {}
        
        with ThreadPoolExecutor(max_workers=2) as inner_pool:
            futures = {}
            if p.get('amazon_link'):
                futures['amazon'] = inner_pool.submit(scrape_product_details, p['amazon_link'])
            if p.get('flipkart_link'):
                futures['flipkart'] = inner_pool.submit(scrape_product_details, p['flipkart_link'])
                
            for source, future in futures.items():
                try:
                    res = future.result(timeout=25)
                    if source == 'amazon': amazon_specs = res
                    else: flipkart_specs = res
                except Exception as e:
                    print(f"[COMPARE] Error scraping {source} for {title[:20]}: {e}")
        
        merged_specs = {**flipkart_specs, **amazon_specs}
        
        results[index] = {
            'title': title,
            'image': p.get('image', ''),
            'rating': p.get('rating'),
            'amazon_price': p.get('amazon_price'),
            'flipkart_price': p.get('flipkart_price'),
            'amazon_link': p.get('amazon_link'),
            'flipkart_link': p.get('flipkart_link'),
            'specs': merged_specs
        }

    with ThreadPoolExecutor(max_workers=min(len(products_to_compare), 4)) as pool:
        for i, p in enumerate(products_to_compare):
            pool.submit(scrape_single_product_details, i, p)
    
    final_results = [r for r in results if r is not None]
    
    elapsed = time.time() - start_time
    print(f"[COMPARE] Done in {elapsed:.1f}s — returned {len(final_results)} products")
    
    return jsonify({
        'success': True,
        'comparison': final_results,
        'elapsed_time': round(elapsed, 2)
    })


# ═══════════════════════════════════════════════════════════
# Authentication & Cart Sync API (MongoDB)
# ═══════════════════════════════════════════════════════════

@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user in MongoDB."""
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password')

    if not username or not password:
        return jsonify({'message': 'Missing username or password'}), 400

    # Check if user exists
    if users_collection.find_one({'username': username}):
        return jsonify({'message': 'Username already exists'}), 400

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    
    new_user = {
        'username': username,
        'password': hashed_password,
        'created_at': datetime.utcnow()
    }
    
    result = users_collection.insert_one(new_user)
    user_id = str(result.inserted_id)

    return jsonify({
        'message': 'User registered successfully',
        'user_id': user_id
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    """Log in and return access token."""
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password')

    user = users_collection.find_one({'username': username})
    
    if user and bcrypt.check_password_hash(user['password'], password):
        access_token = create_access_token(identity=str(user['_id']))
        return jsonify({
            'access_token': access_token, 
            'username': user['username'],
            'user_id': str(user['_id'])
        }), 200

    return jsonify({'message': 'Invalid credentials'}), 401


@app.route('/api/me', methods=['GET'])
@jwt_required()
def get_me():
    """Get authenticated user info."""
    user_id = get_jwt_identity()
    
    try:
        user = users_collection.find_one({'_id': ObjectId(user_id)})
    except:
        return jsonify({'message': 'Invalid user ID'}), 400
        
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    return jsonify({
        'username': user['username'], 
        'id': str(user['_id'])
    }), 200


@app.route('/api/cart', methods=['GET'])
@jwt_required()
def get_cart():
    """Fetch user's cart from MongoDB."""
    user_id = get_jwt_identity()
    
    items = list(cart_items_collection.find(
        {'user_id': user_id}
    ).sort('added_at', ASCENDING))
    
    cart_data = []
    for item in items:
        try:
            product = item.get('product', {})
            cart_data.append({
                'product': product,
                'store': item.get('store'),
                'quantity': item.get('quantity', 1)
            })
        except:
            continue
            
    return jsonify(cart_data), 200


@app.route('/api/cart', methods=['POST'])
@jwt_required()
def update_cart_item():
    """Add or update an item in the user's persistent cart."""
    user_id = get_jwt_identity()
    data = request.get_json()
    product = data.get('product')
    store = data.get('store')
    delta = data.get('delta', 0)
    quantity = data.get('quantity')

    if not product or not store:
        return jsonify({'message': 'Invalid product data'}), 400

    product_id = product.get('id')
    
    # Find existing item
    existing_item = cart_items_collection.find_one({
        'user_id': user_id,
        'store': store,
        'product.id': product_id
    })

    if existing_item:
        # Update existing item
        if quantity is not None:
            new_quantity = max(1, quantity)
        else:
            new_quantity = max(1, existing_item.get('quantity', 1) + delta)
        
        cart_items_collection.update_one(
            {'_id': existing_item['_id']},
            {
                '$set': {
                    'quantity': new_quantity,
                    'product': product,
                    'updated_at': datetime.utcnow()
                }
            }
        )
    else:
        # Create new item
        new_item = {
            'user_id': user_id,
            'product': product,
            'store': store,
            'quantity': max(1, quantity if quantity is not None else 1),
            'added_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        cart_items_collection.insert_one(new_item)
    
    return jsonify({'message': 'Cart updated'}), 200


@app.route('/api/cart/remove', methods=['POST'])
@jwt_required()
def remove_cart_item():
    """Remove specific product from persistent cart."""
    user_id = get_jwt_identity()
    data = request.get_json()
    product_id = data.get('product_id')
    store = data.get('store')

    cart_items_collection.delete_one({
        'user_id': user_id,
        'store': store,
        'product.id': product_id
    })
        
    return jsonify({'message': 'Item removed'}), 200


@app.route('/api/cart/clear', methods=['POST'])
@jwt_required()
def reset_cart():
    """Clear all items for logged-in user."""
    user_id = get_jwt_identity()
    cart_items_collection.delete_many({'user_id': user_id})
    return jsonify({'message': 'Cart cleared'}), 200


# ═══════════════════════════════════════════════════════════
# Standard API Routes
# ═══════════════════════════════════════════════════════════

@app.route('/', methods=['GET'])
def index():
    """Root endpoint with API info."""
    return jsonify({
        'service': 'eShopzz API',
        'version': '2.0.0 (MongoDB)',
        'endpoints': {
            'search': '/search?q=query',
            'chat': '/chat (POST)',
            'health': '/health',
            'models': '/api/models',
            'compare': '/api/compare (POST)',
            'auth': {
                'register': '/api/register (POST)',
                'login': '/api/login (POST)',
                'me': '/api/me (GET)',
                'cart': '/api/cart (GET/POST)',
                'cart_remove': '/api/cart/remove (POST)',
                'cart_clear': '/api/cart/clear (POST)'
            }
        }
    })


if __name__ == '__main__':
    debug_enabled = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'
    port = int(os.getenv('FLASK_PORT', '5002'))
    use_reloader = debug_enabled and os.name != 'nt'
    app.run(debug=debug_enabled, port=port, use_reloader=use_reloader)
