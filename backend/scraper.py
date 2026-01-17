"""
ShopSync Scraper - Amazon and Flipkart Price Aggregator
=========================================================
Uses Selenium with anti-detection settings to scrape product data
from both e-commerce sites. Based on analyzed selectors.
"""

import time
import re
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from bs4 import BeautifulSoup
import torch
from sentence_transformers import SentenceTransformer, util

_SERVICE = None
_MODEL = None
_MODEL_LOADED = False

def preload_model():
    """Preload the Transformer model at startup for instant matching."""
    global _MODEL, _MODEL_LOADED
    if not _MODEL_LOADED:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[AI] Preloading transformer model on {device}...")
        _MODEL = SentenceTransformer('all-mpnet-base-v2', device=device)
        # Warm up the model with a dummy encode
        _MODEL.encode(["warmup"], convert_to_tensor=True)
        _MODEL_LOADED = True
        print(f"[AI] Model ready on {device.upper()}!")
    return _MODEL

def get_model():
    """Get the preloaded model (or load if not ready)."""
    global _MODEL
    if _MODEL is None:
        return preload_model()
    return _MODEL

def get_chrome_driver():
    """Configure Chrome with anti-detection settings."""
    global _SERVICE
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    
    # Disable automation flags
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    # Performance optimization: Block images and CSS
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.default_content_setting_values.notifications": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.cookies": 2,
        "profile.managed_default_content_settings.javascript": 1,  # JS needed!
        "profile.managed_default_content_settings.plugins": 1,
        "profile.managed_default_content_settings.popups": 2,
        "profile.managed_default_content_settings.geolocation": 2,
        "profile.managed_default_content_settings.media_stream": 2,
    }
    options.add_experimental_option("prefs", prefs)
    options.page_load_strategy = 'eager'  # Don't wait for full page load
    
    if not _SERVICE:
        _SERVICE = Service(ChromeDriverManager().install())
    
    driver = webdriver.Chrome(service=_SERVICE, options=options)
    
    # Execute CDP commands to hide webdriver
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
        """
    })
    
    return driver


def parse_price(price_text):
    """Extract numeric price from text."""
    if not price_text:
        return None
    # Remove currency symbols and commas
    cleaned = re.sub(r'[₹$,\s]', '', price_text)
    try:
        return float(cleaned.split('.')[0])  # Get whole number
    except:
        return None


def scrape_amazon(query, max_results=100):
    """
    Scrape Amazon India search results (multi-page for 100 results).
    
    Selectors (from analysis):
    - Container: [data-component-type='s-search-result']
    - Title: h2 a span
    - Price: .a-price-whole
    - Image: img.s-image
    - Link: h2 a
    - Rating: .a-icon-star-small span
    """
    driver = None
    products = []
    
    try:
        driver = get_chrome_driver()
        
        # Scrape multiple pages to get 100 results (Amazon shows ~20-24 per page)
        pages_needed = min(3, (max_results // 24) + 1)  # Max 3 pages
        
        for page in range(1, pages_needed + 1):
            if len(products) >= max_results:
                break
                
            url = f"https://www.amazon.in/s?k={query.replace(' ', '+')}&page={page}"
            driver.get(url)
            
            # Wait for search results (reduced timeout for speed)
            try:
                WebDriverWait(driver, 6).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "[data-component-type='s-search-result']"))
                )
            except:
                if page == 1:
                    raise
                break  # No more pages
            
            # Quick scroll to trigger lazy loading
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.2)  # Scroll back to top
        
            # Parse with BeautifulSoup (MUCH faster than Selenium selectors)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            containers = soup.select("[data-component-type='s-search-result']")
            
            for container in containers:
                try:
                    # Extract title - robust across layouts and categories
                    candidates = []

                    # Common span selectors
                    title_selectors = [
                        "span.a-size-base-plus.a-color-base.a-text-normal",
                        "span.a-size-medium.a-color-base.a-text-normal",
                        "h2 a span",
                        "h2 span",
                        "[data-cy='title-recipe'] h2 span"
                    ]
                    for sel in title_selectors:
                        for el in container.select(sel):
                            text = el.get_text(strip=True)
                            if text:
                                candidates.append(text)

                    # Try link attributes (often contains full title)
                    link_el = container.select_one("h2 a")
                    if link_el:
                        for attr in ("aria-label", "title"):
                            val = link_el.get(attr)
                            if val:
                                candidates.append(val.strip())

                    # Try image alt (fallback)
                    img_el = container.select_one("img.s-image")
                    if img_el:
                        alt = img_el.get("alt")
                        if alt:
                            candidates.append(alt.strip())

                    # Choose the longest meaningful candidate (avoid single-word brand only)
                    title = None
                    if candidates:
                        candidates = [c for c in candidates if len(c) >= 8]
                        candidates.sort(key=len, reverse=True)
                        for c in candidates:
                            # Skip titles that are just brand (single word, all caps, very short)
                            if len(c.split()) == 1 and c.isupper() and len(c) <= 12:
                                continue
                            title = c
                            break

                    if not title:
                        title = "Unknown Product"
                
                    # Extract price
                    price_el = container.select(".a-price-whole")
                    price = parse_price(price_el[0].text) if price_el else None
                    
                    # Extract image
                    img_el = container.select("img.s-image")
                    image = img_el[0].get('src') if img_el else None
                    
                    # Extract link
                    link_el = container.select("h2 a, a.a-link-normal.s-underline-text, a.a-link-normal.s-no-outline")
                    link = None
                    if link_el:
                        href = link_el[0].get('href')
                        if href:
                            if href.startswith("/"):
                                link = "https://www.amazon.in" + href
                            else:
                                link = href
                                
                    if link and "https://www.amazon.inhttps" in link:
                        link = link.replace("https://www.amazon.inhttps", "https")
                    
                    # Extract rating
                    rating_el = container.select(".a-icon-star-small span, .a-icon-alt")
                    rating_text = rating_el[0].get_text() if rating_el else None
                    rating = None
                    if rating_text:
                        match = re.search(r'(\d+\.?\d*)', rating_text)
                        if match:
                            rating = float(match.group(1))
                    
                    # Check for Prime
                    prime_el = container.select(".a-icon-prime, [aria-label*='Prime']")
                    is_prime = len(prime_el) > 0
                    
                    if title and price:  # Only add if we have title and price
                        products.append({
                            "title": title,
                            "price": price,
                            "image": image,
                            "link": link,
                            "rating": rating,
                            "is_prime": is_prime,
                            "source": "amazon"
                        })
                        if len(products) >= max_results:
                            break
                        
                except Exception as e:
                    print(f"[AMAZON] Error parsing product: {e}")
                    continue
                    
    except Exception as e:
        print(f"[AMAZON] Scraping error: {e}")
        
    finally:
        if driver:
            driver.quit()
    
    return products


def scrape_flipkart(query, max_results=100):
    """
    Scrape Flipkart search results (multi-page for 100 results).
    
    Selectors (from analysis):
    - Container: div[data-id]
    - Title: div._4rR01T, a.s1Q9rs
    - Price: div._30jeq3
    - Image: img._396cs4, img._2r_T1I
    - Link: a._1fQZEK, a._2rpwqI
    - Rating: div._3LWZlK
    """
    driver = None
    products = []
    
    try:
        driver = get_chrome_driver()
        
        # Scrape multiple pages (Flipkart shows ~24 per page)
        pages_needed = min(3, (max_results // 24) + 1)
        
        for page in range(1, pages_needed + 1):
            if len(products) >= max_results:
                break
                
            url = f"https://www.flipkart.com/search?q={query.replace(' ', '+')}&page={page}"
            driver.get(url)
            
            # Wait for either layout (reduced timeout)
            try:
                WebDriverWait(driver, 6).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div[data-id], div._1AtVbE, div._13oc-S"))
                )
            except:
                if page == 1:
                    pass  # Continue anyway for first page
                else:
                    break  # No more pages
                
            # Close login popup if it appears (only on first page)
            if page == 1:
                try:
                    close_btn = driver.find_element(By.CSS_SELECTOR, "button._2KpZ6l._2doB4z, span._30XB9F")
                    close_btn.click()
                except:
                    pass
            
            # Quick scroll to trigger lazy loading
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.2)
        
            # Parse with BeautifulSoup (MUCH faster)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            containers = soup.select("div[data-id]")
            
            if not containers:
                # Try alternative layout
                containers = soup.select("div._1AtVbE div._13oc-S")
            
            for container in containers:
                try:
                    # Extract title
                    title_el = container.select("div.RG5Slk, div._4rR01T, a.s1Q9rs, a.IRpwTa")
                    title = title_el[0].get_text().strip() if title_el else None
                
                    # Extract price
                    price_el = container.select("div.hZ3P6w, div._30jeq3, div._1_WHN1")
                    price = parse_price(price_el[0].get_text()) if price_el else None
                    
                    # Extract image
                    img_el = container.select("img.UCc1lI, img._396cs4, img._2r_T1I")
                    image = img_el[0].get('src') if img_el else None
                    
                    # Extract link
                    link_el = container.select("a.k7wcnx, a._1fQZEK, a._2rpwqI, a.CGtC98")
                    if not link_el:
                        link_el = container.select("a[href*='/p/']")
                    link = None
                    if link_el:
                        href = link_el[0].get('href')
                        if href and not href.startswith("http"):
                            link = "https://www.flipkart.com" + href
                        else:
                            link = href
                    
                    # Extract rating
                    rating_el = container.select("div.MKiFS6, div._3LWZlK")
                    rating = None
                    if rating_el:
                        try:
                            # "4.6" + star image
                            rating = float(rating_el[0].get_text().split()[0])
                        except:
                            pass
                    
                    if title and price:
                        products.append({
                            "title": title,
                            "price": price,
                            "image": image,
                            "link": link,
                            "rating": rating,
                            "is_prime": False,  # Flipkart doesn't have Prime
                            "source": "flipkart"
                        })
                        if len(products) >= max_results:
                            break
                        
                except Exception as e:
                    print(f"[FLIPKART] Error parsing product: {e}")
                    continue
                    
    except Exception as e:
        print(f"[FLIPKART] Scraping error: {e}")
        
    finally:
        if driver:
            driver.quit()
    
    return products


def normalize_title(title):
    """Normalize title for better matching."""
    if not title:
        return ""
    title = title.lower()
    # Remove common noise words
    noise_words = ['with', 'and', 'the', 'for', 'new', 'latest', 'mobile', 'phone', 
                   'smartphone', 'works', 'camera', 'control', 'chip', 'boost', 
                   'battery', 'life', 'display', '5g', '4g', 'lte', 'india']
    words = title.split()
    filtered = [w for w in words if w not in noise_words]
    return ' '.join(filtered)


def extract_key_identifiers(title):
    """Extract key product identifiers like brand, model, size, storage."""
    if not title:
        return set()
    
    title_lower = title.lower()
    identifiers = set()
    
    # Extract brand names (expanded list)
    brands = [
        # Phones
        'apple', 'iphone', 'samsung', 'oneplus', 'xiaomi', 'redmi', 'realme', 
        'oppo', 'vivo', 'poco', 'motorola', 'google', 'pixel', 'nothing',
        # TVs
        'mi', 'lg', 'sony', 'toshiba', 'tcl', 'panasonic', 'philips', 'haier',
        'hisense', 'vu', 'acer', 'acerpure', 'kenstar', 'onida', 'iffalcon',
        # Laptops
        'hp', 'dell', 'lenovo', 'asus', 'msi', 'macbook', 'thinkpad',
        # Audio
        'boat', 'jbl', 'bose', 'sennheiser', 'noise', 'zebronics', 'skullcandy',
        # Kitchen Appliances
        'prestige', 'bajaj', 'philips', 'butterfly', 'preethi', 'pigeon', 
        'havells', 'morphy richards', 'usha', 'crompton', 'kent', 'maharaja',
        'sujata', 'bosch', 'wonderchef', 'kenwood', 'inalsa', 'hamilton'
    ]
    for brand in brands:
        if brand in title_lower:
            identifiers.add(brand)
    
    # Extract screen sizes for TVs/Monitors (e.g., 32 inch, 43 inch, 55", 80cm)
    # Using word boundaries and specific patterns to avoid catching other numbers
    size_match = re.search(r'(\d{2,3})\s*(?:inch|cm|\"|\')', title_lower)
    if size_match:
        val = int(size_match.group(1))
        unit = size_match.group(0).lower()
        if 'cm' in unit:
            # Standardize common cm to inch mappings to avoid rounding errors
            cm_to_inch = {80: 32, 108: 43, 109: 43, 126: 50, 138: 55, 139: 55, 164: 65, 189: 75}
            inch = cm_to_inch.get(val, round(val / 2.54))
            identifiers.add(f"{inch}inch")
        else:
            identifiers.add(f"{val}inch")
    
    # Extract storage/RAM sizes (e.g., 8GB RAM, 128GB Storage, 1TB)
    storage_candidates = []
    for match in re.finditer(r'(\d+)\s*(gb|tb)', title_lower):
        val = int(match.group(1))
        unit = match.group(2)
        token = f"{val}{unit}"
        identifiers.add(token)

        start, end = match.span()
        window = title_lower[max(0, start - 12):min(len(title_lower), end + 12)]

        if 'ram' in window:
            identifiers.add(f"ram_{token}")
        elif 'rom' in window or 'storage' in window:
            identifiers.add(f"storage_{token}")
            storage_candidates.append((val, unit, token))
        else:
            storage_candidates.append((val, unit, token))

    # If no explicit storage identified, assume the largest size is storage
    if storage_candidates and not any(i.startswith('storage_') for i in identifiers):
        def size_value(v, u):
            return v * 1024 if u == 'tb' else v
        best = max(storage_candidates, key=lambda t: size_value(t[0], t[1]))
        identifiers.add(f"storage_{best[2]}")
    
    # Extract resolution types - more robust matching
    res_map = {
        '4k': '4k', 'uhd': '4k', 'ultra hd': '4k', '2160p': '4k',
        'full hd': 'fhd', 'fhd': 'fhd', '1080p': 'fhd',
        'hd ready': 'hd', '720p': 'hd'
    }
    for res_str, res_id in res_map.items():
        if res_str in title_lower:
            identifiers.add(res_id)
    
    # Special check for generic "HD" which is often used for 720p/HD Ready
    if 'hd' not in identifiers and re.search(r'\bhd\b', title_lower):
        if 'fhd' not in identifiers and '4k' not in identifiers:
            identifiers.add('hd')
    
    # Panel types
    panels = ['qled', 'oled', 'led', 'lcd']
    for panel in panels:
        if panel in title_lower:
            identifiers.add(panel)
    
    # --- Wattage for Appliances (Mixers, Grinders, etc.) ---
    watt_match = re.search(r'(\d+)\s*(?:watt|w)\b', title_lower)
    if watt_match:
        identifiers.add('watt_' + watt_match.group(1))
    
    # --- Appliance Model Names (Critical for kitchen appliances) ---
    appliance_models = [
        # Prestige models
        'apex', 'iris', 'popular', 'deluxe', 'teon', 'nakshatra', 'omega', 'manttra',
        # Philips models
        'viva', 'daily', 'avance',
        # Bajaj models
        'gx', 'twister', 'classic', 'bravo', 'platini',
        # Butterfly models
        'jet', 'hero', 'matchless', 'desire', 'splendid',
        # Preethi models
        'zodiac', 'blue leaf', 'eco', 'peppy',
        # Generic appliance terms
        'juicer', 'blender', 'chopper', 'grinder', 'mixer'
    ]
    for model in appliance_models:
        if re.search(r'\b' + model + r'\b', title_lower):
            identifiers.add('appmodel_' + model)
    
    # --- Jar Count for Mixers ---
    jar_match = re.search(r'(\d+)\s*(?:jar|jars)\b', title_lower)
    if jar_match:
        identifiers.add('jars_' + jar_match.group(1))
            
    # --- New General Identifiers ---
    
    # Colors (important for clothing and gadgets)
    colors = ['black', 'white', 'silver', 'gold', 'blue', 'red', 'green', 'yellow', 'pink', 'purple', 'orange', 'grey', 'gray', 'brown', 'multicolor']
    for color in colors:
        if re.search(r'\b' + color + r'\b', title_lower):
            identifiers.add('color_' + color)
            
    # Quantity / Pack Size (e.g., "Pack of 2", "Set of 3", "2kg", "500ml")
    qty_patterns = [
        r'\bpack\s*of\s*(\d+)\b',
        r'\bset\s*of\s*(\d+)\b',
        r'(\d+)\s*(?:kg|gram|gm|ml|ltr|litre|pounds|lbs)\b',
        r'(\d+)\s*piece(?:s)?\b',
    ]
    for pattern in qty_patterns:
        match = re.search(pattern, title_lower)
        if match:
            # Add a 'unit_' prefix to differentiate from screen sizes or storage
            identifiers.add('unit_' + match.group(0).replace(' ', ''))
            
    # Alphanumeric Model Numbers (e.g., SM-G991B, WH-1000XM4, B07XJ8C8F5)
    # Improved to be hyphen-tolerant and catch mixed clusters
    tokens = re.split(r'[\s/]+', title_lower)
    for token in tokens:
        clean_token = token.strip('(),.[]"\'')
        if len(clean_token) >= 4 and any(c.isdigit() for c in clean_token) and any(c.isalpha() for c in clean_token):
             # Normalize: remove non-alphanumeric chars for matching
             norm = re.sub(r'[^a-z0-9]', '', clean_token)
             if len(norm) >= 4 and norm not in ['pack', 'inch', 'with', 'from', 'best', 'india', '500ml', 'gen1', 'gen2', 'gen3']:
                 identifiers.add('model_' + norm)
            
    # Variants (moved down and expanded)
    variants = ['pro', 'max', 'plus', 'ultra', 'mini', 'air', 'lite', 'fe', 'promax', 'v2', 'gen', 'generation']
    for variant in variants:
        if re.search(r'\b' + variant + r'\b', title_lower):
            identifiers.add(variant)
            if variant == 'promax':
                identifiers.add('pro')
                identifiers.add('max')
    
    # Extract Series (TVs, Laptops, etc.) - Crucial for avoiding Series mismatches
    series_patterns = [
        r'\bfx\b', r'\bx\s*series\b', r'\ba\s*series\b', r'\bf\s*series\b', 
        r'\bg\s*series\b', r'\bfire\s*tv\b', r'\bgoogle\s*tv\b', 
        r'\bandroid\s*tv\b', r'\bwebos\b', r'\btizen\b',
        r'\bmacbook\s*air\b', r'\bmacbook\s*pro\b', r'\bthinkpad\b', 
        r'\bzenbook\b', r'\bvivobook\b', r'\brog\b', r'\btuf\b', r'\baliware\b',
        r'\binspiron\b', r'\bvostro\b', r'\blatitude\b', r'\bxps\b',
        r'\bideapad\b', r'\blegion\b', r'\byoga\b', r'\bpavilion\b', r'\benvy\b', r'\bspectre\b', r'\bomen\b'
    ]
    for pattern in series_patterns:
        match = re.search(pattern, title_lower)
        if match:
            identifiers.add('series_' + match.group(0).replace(' ', ''))
            
    # Extract phone model patterns
    model_patterns = [
        r'iphone\s*(\d+)(?:\s*(pro|plus|max))?',
        r's(\d+)(?:\s*(ultra|plus|\+))?',
        r'galaxy\s*(\w+)',
        r'(\d+)\s*pro',
        r'nord\s*(\w+)',
    ]
    for pattern in model_patterns:
        match = re.search(pattern, title_lower)
        if match:
            identifiers.add(match.group(0).replace(' ', ''))
    
    return identifiers


def match_products(amazon_products, flipkart_products):
    """
    Match similar products from Amazon and Flipkart.
    Uses AI Embeddings (RTX 4050 accelerated) + Regex Heuristics.
    """
    if not amazon_products or not flipkart_products:
        return []

    unified_products = []
    used_flipkart = set()
    
    # Initialize AI Model
    model = get_model()
    
    # 1. Pre-calculate Amazon Identifiers and Embeddings
    amz_titles = [p['title'] for p in amazon_products]
    print(f"[AI] Encoding {len(amz_titles)} Amazon products...")
    amz_embeddings = model.encode(amz_titles, convert_to_tensor=True, show_progress_bar=False)
    
    amz_data = []
    for idx, amz_p in enumerate(amazon_products):
        amz_data.append({
            'p': amz_p,
            'embedding': amz_embeddings[idx],
            'identifiers': extract_key_identifiers(amz_p['title']),
            'words': set(normalize_title(amz_p['title']).split())
        })

    # 2. Pre-calculate Flipkart Identifiers and Embeddings
    fk_titles = [p['title'] for p in flipkart_products]
    print(f"[AI] Encoding {len(fk_titles)} Flipkart products...")
    fk_embeddings = model.encode(fk_titles, convert_to_tensor=True, show_progress_bar=False)
    
    fk_data = []
    for idx, fk_p in enumerate(flipkart_products):
        fk_data.append({
            'idx': idx,
            'p': fk_p,
            'embedding': fk_embeddings[idx],
            'identifiers': extract_key_identifiers(fk_p['title']),
            'words': set(normalize_title(fk_p['title']).split())
        })

    # 3. Batch compute all cosine similarities (GPU accelerated)
    # Resulting matrix shape: [len(amz), len(fk)]
    cosine_scores = util.cos_sim(amz_embeddings, fk_embeddings)

    # 4. Perform matching with conflict detection
    for i, amz in enumerate(amz_data):
        amz_product = amz['p']
        amz_identifiers = amz['identifiers']
        
        best_match = None
        best_score = 0
        best_idx = -1
        
        for j, fk in enumerate(fk_data):
            if fk['idx'] in used_flipkart:
                continue
            
            # Get semantic similarity from our matrix
            semantic_score = float(cosine_scores[i][j])
            
            # Series conflict check (FX vs A-Series)
            amz_series = {x for x in amz_identifiers if x.startswith('series_')}
            fk_series = {x for x in fk['identifiers'] if x.startswith('series_')}
            series_conflict = False
            if amz_series and fk_series and amz_series != fk_series:
                series_conflict = True

            # Resolution conflict check
            res_types = {'4k', 'fhd', 'hd'}
            amz_res = amz_identifiers.intersection(res_types)
            fk_res = fk['identifiers'].intersection(res_types)
            resolution_conflict = False
            if amz_res and fk_res and not amz_res.intersection(fk_res):
                resolution_conflict = True

            # Size conflict check (TVs/Monitors)
            amz_sizes = {x for x in amz_identifiers if x.endswith('inch')}
            fk_sizes = {x for x in fk['identifiers'] if x.endswith('inch')}
            size_conflict = False
            if amz_sizes and fk_sizes:
                amz_val = int(list(amz_sizes)[0].replace('inch', ''))
                fk_val = int(list(fk_sizes)[0].replace('inch', ''))
                if abs(amz_val - fk_val) > 1:
                    size_conflict = True

            # Model Variant Conflict
            variant_conflict = False
            variants = {'pro', 'max', 'plus', 'ultra', 'mini', 'air', 'lite', 'fe', 'v2', 'gen', 'generation'}
            amz_vars = amz_identifiers.intersection(variants)
            fk_vars = fk['identifiers'].intersection(variants)
            if amz_vars != fk_vars:
                variant_conflict = True

            # Price difference check (Sanity check)
            price_conflict = False
            if amz_product['price'] and fk['p']['price']:
                p1 = amz_product['price']
                p2 = fk['p']['price']
                if abs(p1 - p2) / min(p1, p2) > 0.8:
                    price_conflict = True

            # Color conflict
            amz_colors = {x for x in amz_identifiers if x.startswith('color_')}
            fk_colors = {x for x in fk['identifiers'] if x.startswith('color_')}
            color_conflict = False
            if amz_colors and fk_colors and amz_colors != fk_colors:
                color_conflict = True
                
            # Quantity/Unit conflict
            amz_units = {x for x in amz_identifiers if x.startswith('unit_')}
            fk_units = {x for x in fk['identifiers'] if x.startswith('unit_')}
            unit_conflict = False
            if amz_units and fk_units and amz_units != fk_units:
                unit_conflict = True

            # Storage conflict check (ignore RAM, use storage_ only)
            amz_storage = {x for x in amz_identifiers if x.startswith('storage_')}
            fk_storage = {x for x in fk['identifiers'] if x.startswith('storage_')}
            storage_conflict = False
            if amz_storage and fk_storage and not amz_storage.intersection(fk_storage):
                storage_conflict = True

            # Wattage conflict check (Appliances: 500W vs 750W etc.)
            amz_watt = {x for x in amz_identifiers if x.startswith('watt_')}
            fk_watt = {x for x in fk['identifiers'] if x.startswith('watt_')}
            watt_conflict = False
            if amz_watt and fk_watt and amz_watt != fk_watt:
                watt_conflict = True

            # Appliance Model conflict (Apex vs Iris vs Popular etc.)
            amz_appmodel = {x for x in amz_identifiers if x.startswith('appmodel_')}
            fk_appmodel = {x for x in fk['identifiers'] if x.startswith('appmodel_')}
            appmodel_conflict = False
            if amz_appmodel and fk_appmodel and not amz_appmodel.intersection(fk_appmodel):
                appmodel_conflict = True

            # Jar count conflict (3 jars vs 4 jars)
            amz_jars = {x for x in amz_identifiers if x.startswith('jars_')}
            fk_jars = {x for x in fk['identifiers'] if x.startswith('jars_')}
            jars_conflict = False
            if amz_jars and fk_jars and amz_jars != fk_jars:
                jars_conflict = True

            # Exact Model Match Boost
            amz_models = {x for x in amz_identifiers if x.startswith('model_')}
            fk_models = {x for x in fk['identifiers'] if x.startswith('model_')}
            model_match = bool(amz_models and fk_models and amz_models.intersection(fk_models))
            
            # Final scoring logic: Semantic + Heuristic
            # Semantic score is baseline (0 to 1)
            # We scale it and add heuristic boosts
            score = semantic_score 
            
            # Boost for shared identifiers (brand, size, etc.)
            identifier_overlap = len(amz_identifiers & fk['identifiers'])
            score += (identifier_overlap * 0.1)

            if model_match:
                score += 0.5 # Huge boost for exact model match
            
            # Hard Rejection on Conflicts
            if series_conflict or resolution_conflict or size_conflict or storage_conflict or color_conflict or unit_conflict or variant_conflict or price_conflict or watt_conflict or appmodel_conflict or jars_conflict:
                continue
            
            # High threshold for semantic matching to prevent hallucinations
            # But if key identifiers match (brand+storage+color), we can be more lenient
            key_match_count = 0
            # Check brand match
            brand_ids = {'apple', 'iphone', 'samsung', 'oneplus', 'xiaomi', 'redmi', 'realme', 'oppo', 'vivo', 'poco', 'motorola', 'google', 'pixel', 'nothing', 'mi', 'lg', 'sony', 'boat', 'jbl'}
            if amz_identifiers.intersection(brand_ids) & fk['identifiers'].intersection(brand_ids):
                key_match_count += 1
            # Check storage match
            if amz_storage and fk_storage and amz_storage == fk_storage:
                key_match_count += 1
            # Check color match  
            if amz_colors and fk_colors and amz_colors == fk_colors:
                key_match_count += 1
                
            if score > best_score:
                # Strong identifier match (brand+storage+color all match) = lower threshold
                if key_match_count >= 3 and semantic_score > 0.5:
                    best_score = score
                    best_match = fk['p']
                    best_idx = fk['idx']
                # Moderate identifier match = medium threshold
                elif key_match_count >= 2 and semantic_score > 0.6:
                    best_score = score
                    best_match = fk['p']
                    best_idx = fk['idx']
                # Model number exact match = trust it
                elif model_match:
                    best_score = score
                    best_match = fk['p']
                    best_idx = fk['idx']
                # Pure semantic match needs high confidence
                elif semantic_score > 0.78:
                    best_score = score
                    best_match = fk['p']
                    best_idx = fk['idx']
        
        unified = {
            "id": len(unified_products) + 1,
            "title": amz_product['title'],
            "image": amz_product['image'],
            "rating": amz_product['rating'],
            "is_prime": amz_product['is_prime'],
            "amazon_price": amz_product['price'],
            "amazon_link": amz_product['link'],
            "flipkart_price": best_match['price'] if best_match else None,
            "flipkart_link": best_match['link'] if best_match else None
        }
        
        if best_match:
            used_flipkart.add(best_idx)
        
        unified_products.append(unified)
    
    # Add unmatched Flipkart products
    for idx, fk_product in enumerate(flipkart_products):
        if idx not in used_flipkart:
            unified_products.append({
                "id": len(unified_products) + 1,
                "title": fk_product['title'],
                "image": fk_product['image'],
                "rating": fk_product['rating'],
                "is_prime": False,
                "amazon_price": None,
                "amazon_link": None,
                "flipkart_price": fk_product['price'],
                "flipkart_link": fk_product['link']
            })
    
    # Sort: matched products (with both prices) first, then unmatched
    matched = [p for p in unified_products if p['amazon_price'] and p['flipkart_price']]
    unmatched = [p for p in unified_products if not (p['amazon_price'] and p['flipkart_price'])]
    
    # Re-assign IDs after sorting
    sorted_products = matched + unmatched
    for i, product in enumerate(sorted_products):
        product['id'] = i + 1
        product['has_comparison'] = bool(product['amazon_price'] and product['flipkart_price'])
    
    return sorted_products


def search_products(query, timeout=15):
    """
    Search both Amazon and Flipkart concurrently.
    Returns unified product list.
    """
    amazon_products = []
    flipkart_products = []
    
    # Increase timeout for slower machines/connections
    timeout = 45 
    
    with ThreadPoolExecutor(max_workers=2) as executor:
        print("[SCRAPER] Starting threads...")
        amazon_future = executor.submit(scrape_amazon, query)
        flipkart_future = executor.submit(scrape_flipkart, query)
        
        try:
            print(f"[SCRAPER] Waiting for Amazon (timeout={timeout}s)...")
            amazon_products = amazon_future.result(timeout=timeout)
            print(f"[AMAZON] Found {len(amazon_products)} products")
        except TimeoutError:
            print("[AMAZON] Timeout - operation took too long")
        except Exception as e:
            print(f"[AMAZON] Error: {e}")
            
        try:
            print(f"[SCRAPER] Waiting for Flipkart (timeout={timeout}s)...")
            flipkart_products = flipkart_future.result(timeout=timeout)
            print(f"[FLIPKART] Found {len(flipkart_products)} products")
        except TimeoutError:
            print("[FLIPKART] Timeout - operation took too long")
        except Exception as e:
            print(f"[FLIPKART] Error: {e}")
    
    print("[SCRAPER] Matching products...")
    # Match and unify products
    unified = match_products(amazon_products, flipkart_products)
    return unified


if __name__ == "__main__":
    # Test the scraper
    import json
    results = search_products("iphone 15")
    print(json.dumps(results, indent=2))
