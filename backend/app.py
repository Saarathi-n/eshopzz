"""
ShopSync Flask API
==================
Backend API for the ShopSync e-commerce aggregator.
Provides /search endpoint that scrapes Amazon and Flipkart.
"""

import os
import json
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177", "http://localhost:5178"], supports_credentials=True)

# Load fallback data
FALLBACK_DATA_PATH = os.path.join(os.path.dirname(__file__), 'fallback_data.json')

def load_fallback_data():
    """Load fallback data from JSON file."""
    try:
        with open(FALLBACK_DATA_PATH, 'r') as f:
            data = json.load(f)
            return data.get('products', [])
    except Exception as e:
        print(f"Error loading fallback data: {e}")
        return []


def search_with_timeout(query, timeout=15):
    """
    Execute scraper with timeout.
    Falls back to mock data if scraping fails or takes too long.
    """
    from scraper import search_products
    
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(search_products, query, timeout)
        
        try:
            results = future.result(timeout=timeout)
            if results and len(results) > 0:
                return results, False  # Results, is_fallback
        except FuturesTimeoutError:
            print(f"[API] Scraping timed out after {timeout}s")
        except Exception as e:
            print(f"[API] Scraping error: {e}")
    
    # Return fallback data
    return load_fallback_data(), True


@app.route('/search', methods=['GET'])
def search():
    """
    Search endpoint for product aggregation.
    
    Query Parameters:
        q (str): Search query string
        sort (str): Sort option (relevance, price_asc, price_desc, rating)
        
    Returns:
        JSON response with products array
    """
    query = request.args.get('q', '').strip()
    use_mock = request.args.get('mock', 'false').lower() == 'true'
    sort_by = request.args.get('sort', 'relevance').lower()
    
    if not query:
        return jsonify({
            'success': False,
            'error': 'Query parameter "q" is required',
            'products': []
        }), 400
    
    print(f"[API] Searching for: {query} (Sort: {sort_by})")
    start_time = time.time()
    
    if use_mock:
        # Force use of fallback data (for demo/testing)
        products = load_fallback_data()
        is_fallback = True
    else:
        # Increase timeout for live scraping
        products, is_fallback = search_with_timeout(query, timeout=45)
    
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
        # default is relevance (matched first), which scraper.py already handles
    
    elapsed = time.time() - start_time
    print(f"[API] Returning {len(products)} products in {elapsed:.2f}s (fallback={is_fallback})")
    
    return jsonify({
        'success': True,
        'query': query,
        'count': len(products),
        'is_fallback': is_fallback,
        'products': products,
        'elapsed_time': round(elapsed, 2)
    })


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'ShopSync API'
    })


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with API info."""
    return jsonify({
        'name': 'ShopSync API',
        'version': '1.0.0',
        'endpoints': {
            '/search': 'GET - Search products (params: q, sort, mock)',
            '/health': 'GET - Health check'
        },
        'sort_options': ['relevance', 'price_asc', 'price_desc', 'rating']
    })


if __name__ == '__main__':
    print("=" * 50)
    print("ShopSync API Server")
    print("=" * 50)
    
    # Preload AI model at startup (not lazy)
    print("[STARTUP] Preloading AI model...")
    from scraper import preload_model
    preload_model()
    
    print("Endpoints:")
    print("  GET /search?q=<query>  - Search products")
    print("  GET /health            - Health check")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=5002, debug=True)
