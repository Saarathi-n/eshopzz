"""
eShopzz Scraper - Amazon and Flipkart Price Aggregator
=========================================================
Uses Selenium with anti-detection settings to scrape product data
from both e-commerce sites. Based on analyzed selectors.
"""

import time
import re
import os
import math
import requests
from selenium import webdriver
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from concurrent.futures import ThreadPoolExecutor, wait, ALL_COMPLETED
from bs4 import BeautifulSoup
import torch
from sentence_transformers import SentenceTransformer, util

_MODEL = None
_MODEL_LOADED = False
SCRAPER_VERBOSE = os.getenv("SCRAPER_VERBOSE", "false").lower() == "true"
FLIPKART_DIAG_DUMP = os.getenv("FLIPKART_DIAG_DUMP", "false").lower() == "true"
DEFAULT_MAX_RESULTS = max(8, int(os.getenv("SCRAPER_MAX_RESULTS", "48")))
DEFAULT_MAX_PAGES = max(1, int(os.getenv("SCRAPER_MAX_PAGES", "2")))
DEFAULT_PAGE_TIMEOUT_SECONDS = max(4, int(os.getenv("SCRAPER_PAGE_TIMEOUT_SECONDS", "25")))
DEFAULT_EMBEDDING_MODEL = os.getenv("SCRAPER_EMBEDDING_MODEL", "all-MiniLM-L6-v2")

def preload_model():
    """Preload the Transformer model at startup for instant matching."""
    global _MODEL, _MODEL_LOADED
    if not _MODEL_LOADED:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[AI] Preloading transformer model '{DEFAULT_EMBEDDING_MODEL}' on {device}...")
        _MODEL = SentenceTransformer(DEFAULT_EMBEDDING_MODEL, device=device)
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
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-logging")
    options.add_argument("--log-level=3")
    options.add_argument("--silent")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    # Modern Chrome User Agent (Stable)
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    
    # Disable automation flags
    options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
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
    
    try:
        service = Service(log_output=os.devnull)
    except TypeError:
        service = Service()

    driver = webdriver.Edge(service=service, options=options)
    driver.set_page_load_timeout(DEFAULT_PAGE_TIMEOUT_SECONDS)
    
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
    # Keep only digits and decimal points (works across currency encodings)
    cleaned = re.sub(r'[^0-9.]', '', str(price_text))
    try:
        if not cleaned:
            return None
        return float(cleaned.split('.')[0])  # Get whole number
    except:
        return None


def _pages_needed(max_results, per_page=24, max_pages=3):
    if max_results <= 0:
        return 1
    return max(1, min(max_pages, math.ceil(max_results / per_page)))


def _dedupe_products(products, max_results):
    unique = []
    seen = set()
    for p in products:
        key = p.get("link") or f"{p.get('title','')}|{p.get('price')}|{p.get('source')}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
        if len(unique) >= max_results:
            break
    return unique


def _extract_amazon_products_from_soup(soup, max_results):
    products = []
    # Try multiple common product container selectors for robustness
    containers = soup.select("[data-component-type='s-search-result']")
    if not containers:
        containers = soup.select("div.s-result-item[data-asin]:not([data-asin=''])")
    
    for container in containers:
        try:
            # Multi-strategy Title extraction
            candidates = []
            title_selectors = [
                "[data-cy='title-recipe'] h2 span",
                "h2 span",
                "h2 a span",
                "h2 a",
                "span.a-size-medium.a-color-base.a-text-normal",
                "span.a-size-base-plus.a-color-base.a-text-normal",
            ]
            for sel in title_selectors:
                el = container.select_one(sel)
                if el:
                    text = el.get_text(strip=True)
                    if text:
                        candidates.append(text)

            # Link extraction - prioritize title links
            link_el = container.select_one("h2 a") or \
                      container.select_one("a.a-link-normal") or \
                      container.select_one("a[href*='/dp/']")
            
            link = None
            if link_el:
                href = link_el.get('href', '')
                if href:
                    if href.startswith("/"):
                        link = "https://www.amazon.in" + href
                    else:
                        link = href
                
                # Check attributes for title fallbacks
                for attr in ("aria-label", "title"):
                    val = link_el.get(attr)
                    if val and len(val) > 10:
                        candidates.append(val.strip())

            # Image extraction
            img_el = container.select_one("img.s-image")
            image = img_el.get('src') if img_el else None
            if img_el and img_el.get('alt'):
                candidates.append(img_el.get('alt').strip())

            # Finalize Title
            title = None
            if candidates:
                # Dedupe and clean
                unique_c = []
                [unique_c.append(x) for x in candidates if x not in unique_c]
                # Filter for reasonable product names
                valid = [c for c in unique_c if len(c) >= 5]
                valid.sort(key=len, reverse=True)
                for c in valid:
                    # Filter out short uppercase strings (often menu items)
                    if len(c.split()) == 1 and c.isupper() and len(c) <= 12:
                        continue
                    title = c
                    break

            # Price extraction (Standard Amazon classes)
            price = None
            # Strategy 1: Standard .a-price-whole
            price_el = container.select_one(".a-price-whole")
            if price_el:
                price = parse_price(price_el.text)
            
            # Strategy 2: .a-offscreen (contains full local currency string)
            if not price:
                price_offscreen = container.select_one(".a-price .a-offscreen")
                if price_offscreen:
                    price = parse_price(price_offscreen.text)
            
            # Strategy 3: .a-color-price (sometimes discount/sale price)
            if not price:
                price_color = container.select_one(".a-color-price")
                if price_color:
                    price = parse_price(price_color.text)

            # Rating extraction
            rating = None
            rating_el = container.select_one(".a-icon-star-small .a-icon-alt") or \
                        container.select_one(".a-icon-star .a-icon-alt") or \
                        container.select_one(".a-icon-star-mini .a-icon-alt") or \
                        container.select_one(".a-size-small .a-icon-alt")
            
            if rating_el:
                rating_text = rating_el.get_text()
                match = re.search(r'(\d+\.?\d*)', rating_text)
                if match:
                    rating = float(match.group(1))

            is_prime = len(container.select(".a-icon-prime, [aria-label*='Prime']")) > 0

            if title and price:
                products.append({
                    "title": title,
                    "price": price,
                    "image": image,
                    "link": link,
                    "rating": rating,
                    "is_prime": is_prime,
                    "source": "amazon",
                })
                if len(products) >= max_results:
                    break

        except Exception:
            pass  # Error parsing container
    return products


def _scrape_amazon_page(query, page, max_results=100, driver=None):
    owns_driver = driver is None
    try:
        if owns_driver:
            driver = get_chrome_driver()
        url = f"https://www.amazon.in/s?k={query.replace(' ', '+')}&page={page}"
        try:
            driver.get(url)
            # Check for robot check (Amazon automated traffic detection)
            if "api-services-support@amazon.com" in driver.page_source or "Sorry, we just need to make sure you're not a robot" in driver.page_source:
                time.sleep(3)  # Wait before retry
                driver.get(url)  # Basic retry
                
            # Second check if still detection page - continue anyway
            pass
        except Exception:
            # Page load timeout is OK - parse whatever loaded so far
            pass

        try:
            # Increased timeout for element presence and more generic selector
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[data-component-type='s-search-result'], div.s-result-item[data-asin]"))
            )
        except:
            pass  # Still try to parse whatever is available

        # Scroll in increments to trigger lazy-loading
        for i in range(1, 4):
            driver.execute_script(f"window.scrollTo(0, document.body.scrollHeight * {i/4});")
            time.sleep(0.5)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        page_products = _extract_amazon_products_from_soup(soup, max_results)

        return page_products
    except Exception:
        return []
    finally:
        if owns_driver and driver:
            try:
                driver.quit()
            except:
                pass


def scrape_amazon(query, max_results=None):
    """
    Scrape Amazon India search results.
    Uses parallel page scraping with separate drivers for speed.
    """
    max_results = max_results or DEFAULT_MAX_RESULTS
    pages = list(range(1, _pages_needed(max_results, per_page=24, max_pages=DEFAULT_MAX_PAGES) + 1))

    if len(pages) == 1:
        # Single page - no parallelism needed
        driver = None
        try:
            driver = get_chrome_driver()
            products = _scrape_amazon_page(query, 1, max_results=max_results, driver=driver)
        finally:
            if driver:
                try: driver.quit()
                except: pass
        return _dedupe_products(products, max_results)

    # Multiple pages - scrape in parallel with separate drivers (limit to avoid memory issues)
    all_products = []
    max_amzn_workers = min(len(pages), 2)
    with ThreadPoolExecutor(max_workers=max_amzn_workers) as pool:
        futures = {pool.submit(_scrape_amazon_page, query, p, max_results): p for p in pages}
        for future in futures:
            try:
                # Give it slightly less than the provider timeout so we can return partial results
                page_products = future.result(timeout=DEFAULT_PAGE_TIMEOUT_SECONDS + 1)
                all_products.extend(page_products)
            except Exception:
                pass

    return _dedupe_products(all_products, max_results)


def _scrape_flipkart_page(query, page, max_results=100, driver=None):
    owns_driver = driver is None
    products = []
    diagnostics = {
        "candidate_links": 0,
        "titles_found": 0,
        "prices_found": 0,
        "data_id_nodes": 0,
        "no_results_hint": False,
        "blocked_signals": set(),
        "page": page,
    }

    try:
        if owns_driver:
            driver = get_chrome_driver()
        url = f"https://www.flipkart.com/search?q={query.replace(' ', '+')}&page={page}"
        try:
            driver.get(url)
        except Exception as nav_err:
            # Page load timeout is OK - parse whatever loaded so far
            if SCRAPER_VERBOSE:
                print(f"[FLIPKART][P{page}] nav partial load: {nav_err}")

        try:
            WebDriverWait(driver, 4).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[data-id], a[href*='/p/']"))
            )
        except:
            pass

        if page == 1:
            try:
                close_btn = driver.find_element(By.CSS_SELECTOR, "button._2KpZ6l._2doB4z, span._30XB9F")
                close_btn.click()
            except:
                pass

        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        page_text = soup.get_text(" ", strip=True).lower()
        if any(marker in page_text for marker in ("did not match any products", "no results found", "sorry, no results")):
            diagnostics["no_results_hint"] = True

        for marker in ("captcha", "access denied", "robot check", "blocked"):
            if marker in page_text:
                diagnostics["blocked_signals"].add(marker)

        product_links = soup.find_all('a', href=re.compile(r'/p/'))
        diagnostics["candidate_links"] = len(product_links)
        diagnostics["data_id_nodes"] = len(soup.select("div[data-id]"))

        seen_links = set()
        for a in product_links:
            href = a.get('href')
            if not href or href in seen_links:
                continue
            if 'Search results' in a.get_text():
                continue

            title = None
            text = a.get_text(strip=True)
            if len(text) > 15:
                title = text
            elif a.get('title') and len(a.get('title')) > 15:
                title = a.get('title')
            else:
                for d in a.find_all(['div', 'span']):
                    t = d.get_text(strip=True)
                    if len(t) > 15 and not re.match(r'^(?:\u20b9|rs)', t, re.IGNORECASE) and "OFF" not in t.upper():
                        title = t
                        break

            if not title:
                parent = a.parent
                if parent:
                    for sibling in parent.find_all(['div', 'a']):
                        t = sibling.get_text(strip=True)
                        if len(t) > 15 and not re.match(r'^(?:\u20b9|rs)', t, re.IGNORECASE) and "OFF" not in t.upper():
                            title = t
                            break

            if not title:
                continue
            diagnostics["titles_found"] += 1

            price = None
            curr = a
            for _ in range(6):
                if not curr or curr.name == 'body':
                    break

                price_texts = curr.find_all(string=re.compile(r'(?:\u20b9|rs\.?)\s*[0-9][0-9,]*', re.IGNORECASE))
                if not price_texts:
                    price_texts = curr.find_all(string=re.compile(r'[0-9][0-9,]{3,}'))

                if price_texts:
                    for pt in price_texts:
                        pt_str = str(pt).strip()
                        parent_classes = ' '.join(pt.parent.get('class', [])).lower()
                        if 'strikethrough' in parent_classes or 'discount' in parent_classes:
                            continue
                        parsed_p = parse_price(pt_str)
                        if parsed_p and 100 <= parsed_p <= 10000000:
                            price = parsed_p
                            break

                if price:
                    diagnostics["prices_found"] += 1
                    break
                curr = curr.parent

            image = None
            curr = a
            for _ in range(4):
                if not curr or curr.name == 'body':
                    break
                img_els = curr.find_all('img')
                for img in img_els:
                    src = img.get('src') or img.get('data-src')
                    if src and ('rukminim' in src or 'http' in src) and not src.endswith('.svg'):
                        image = src
                        break
                if image:
                    break
                curr = curr.parent

            rating = None
            curr = a
            for _ in range(4):
                if not curr or curr.name == 'body':
                    break
                rating_blocks = curr.find_all('div')
                for rb in rating_blocks:
                    t = rb.get_text(strip=True)
                    if re.match(r'^[1-5]\.[0-9]$', t) or re.match(r'^[1-5]$', t):
                        rating = float(t)
                        break
                if rating:
                    break
                curr = curr.parent

            link = href
            if link and not link.startswith("http"):
                link = "https://www.flipkart.com" + link

            if title and price:
                products.append({
                    "title": title,
                    "price": price,
                    "image": image,
                    "link": link,
                    "rating": rating,
                    "is_prime": False,
                    "source": "flipkart",
                })
                seen_links.add(href)
                if len(products) >= max_results:
                    break

        if SCRAPER_VERBOSE or len(products) == 0:
            print(
                f"[FLIPKART][P{page}] links={diagnostics['candidate_links']} "
                f"data-id={diagnostics['data_id_nodes']} parsed={len(products)}"
            )

    except Exception as e:
        print(f"[FLIPKART][P{page}] Scraping error: {e}")
    finally:
        if owns_driver and driver:
            try:
                driver.quit()
            except:
                pass

    return products, diagnostics


def _scrape_flipkart_page_wrapper(query, page, max_results):
    """Wrapper that creates its own driver for parallel page scraping."""
    return _scrape_flipkart_page(query, page, max_results=max_results, driver=None)


def scrape_flipkart(query, max_results=None):
    """
    Scrape Flipkart search results.
    Uses parallel page scraping with separate drivers for speed.
    """
    max_results = max_results or DEFAULT_MAX_RESULTS
    pages = list(range(1, _pages_needed(max_results, per_page=24, max_pages=DEFAULT_MAX_PAGES) + 1))
    all_products = []
    merged_diag = {
        "pages_visited": 0,
        "candidate_links": 0,
        "titles_found": 0,
        "prices_found": 0,
        "data_id_nodes": 0,
        "no_results_hint": False,
        "blocked_signals": set(),
    }

    if len(pages) == 1:
        # Single page - use one driver
        driver = None
        try:
            driver = get_chrome_driver()
            page_products, page_diag = _scrape_flipkart_page(query, 1, max_results=max_results, driver=driver)
            all_products.extend(page_products)
            merged_diag["pages_visited"] += 1
            merged_diag["candidate_links"] += page_diag["candidate_links"]
            merged_diag["titles_found"] += page_diag["titles_found"]
            merged_diag["prices_found"] += page_diag["prices_found"]
            merged_diag["data_id_nodes"] += page_diag["data_id_nodes"]
            merged_diag["no_results_hint"] = page_diag["no_results_hint"]
            merged_diag["blocked_signals"].update(page_diag["blocked_signals"])
        except Exception as e:
            print(f"[FLIPKART] Page worker error: {e}")
        finally:
            if driver:
                try: driver.quit()
                except: pass
    else:
        # Multiple pages - scrape in parallel with separate drivers
        with ThreadPoolExecutor(max_workers=len(pages)) as pool:
            futures = {pool.submit(_scrape_flipkart_page_wrapper, query, p, max_results): p for p in pages}
            for future in futures:
                try:
                    # Give it slightly less than the provider timeout so we can return partial results
                    page_products, page_diag = future.result(timeout=DEFAULT_PAGE_TIMEOUT_SECONDS + 1)
                    all_products.extend(page_products)
                    merged_diag["pages_visited"] += 1
                    merged_diag["candidate_links"] += page_diag["candidate_links"]
                    merged_diag["titles_found"] += page_diag["titles_found"]
                    merged_diag["prices_found"] += page_diag["prices_found"]
                    merged_diag["data_id_nodes"] += page_diag["data_id_nodes"]
                    merged_diag["no_results_hint"] = merged_diag["no_results_hint"] or page_diag["no_results_hint"]
                    merged_diag["blocked_signals"].update(page_diag["blocked_signals"])
                except Exception as e:
                    print(f"[FLIPKART] Page worker error: {e}")

    deduped = _dedupe_products(all_products, max_results)

    if len(deduped) < 5:
        block_signals = ",".join(sorted(merged_diag["blocked_signals"])) or "none"
        print(
            "[FLIPKART][DIAG] "
            f"query='{query}' products={len(deduped)} pages={merged_diag['pages_visited']} "
            f"links={merged_diag['candidate_links']} data-id={merged_diag['data_id_nodes']} "
            f"titles={merged_diag['titles_found']} prices={merged_diag['prices_found']} "
            f"no_results_hint={merged_diag['no_results_hint']} blocked={block_signals}"
        )

    return deduped

# Global Constants
SUPPORTED_BRANDS = [
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
        'sujata', 'bosch', 'wonderchef', 'kenwood', 'inalsa', 'hamilton',
        # Stationary / Pens
        'parker', 'montblanc', 'cross', 'sheaffer', 'lamy', 'pilot', 'uniball', 'staedtler', 'faber castell',
        # Clocks / Watches
        'titan', 'casio', 'fossil', 'timex', 'fastrack', 'ajanta', 'oreva', 'seiko', 'citizen'
]
STRICT_VARIANTS = {'pro', 'plus', 'max', 'ultra', 'mini', 'air', 'lite', 'fe', 'promax'}

def normalize_title(title):
    """Normalize title for better matching."""
    if not title:
        return ""
    title = title.lower()
    
    # Remove symbols that confuse embeddings
    title = re.sub(r'[()\[\]|\-,]', ' ', title)
    
    # Standardize units (GB vs G.B vs GB.)
    title = re.sub(r'(\d+)\s*(?:gb|g\.b|gb\.)', r'\1gb', title)
    title = re.sub(r'(\d+)\s*(?:tb|t\.b|tb\.)', r'\1tb', title)
    
    # Remove common noise words/marketing fluff
    noise_words = {
        'with', 'and', 'the', 'for', 'new', 'latest', 'mobile', 'phone', 
        'smartphone', 'works', 'camera', 'control', 'chip', 'boost', 
        'battery', 'life', 'display', '5g', '4g', 'lte', 'india', 'buy', 
        'online', 'best', 'price', 'low', 'guarantee', 'warranty', 'available',
        'fast', 'delivery', 'shipping', 'original', 'genuine'
    }
    
    words = title.split()
    filtered = [w for w in words if w not in noise_words and len(w) > 1]
    return ' '.join(filtered)


def extract_key_identifiers(title):
    """Extract key product identifiers like brand, model, size, storage."""
    if not title:
        return set()
    
    title_lower = title.lower()
    identifiers = set()
    
    # Extract brand names
    for brand in SUPPORTED_BRANDS:
        if re.search(r'\b' + re.escape(brand) + r'\b', title_lower):
            identifiers.add(brand)
            
    # Brand Families (for grouping)
    if any(b in identifiers for b in ['iphone', 'macbook', 'ipad', 'apple']):
        identifiers.add('brandfamily_apple')
    if any(b in identifiers for b in ['xiaomi', 'redmi', 'mi']):
        identifiers.add('brandfamily_xiaomi')
    if 'samsung' in identifiers:
        identifiers.add('brandfamily_samsung')

    # Condition / Type Flags
    if any(x in title_lower for x in ['renewed', 'refurbished', 'unboxed', 'used', 'pre-owned']):
        identifiers.add('flag_refurbished')
    else:
        identifiers.add('flag_new')

    if any(x in title_lower for x in ['compatible', 'for ', 'case for', 'cover for', 'adapter for']):
        identifiers.add('flag_accessory')
    else:
        identifiers.add('flag_main_product')
    
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
            identifiers.add('variant_' + variant)
            if variant == 'promax':
                identifiers.add('pro')
                identifiers.add('max')
                identifiers.add('variant_pro')
                identifiers.add('variant_max')
    
    # Extract Series (TVs, Laptops, etc.) - Crucial for avoiding Series mismatches
    series_patterns = [
        r'\bfx\b', r'\bx\s*series\b', r'\ba\s*series\b', r'\bf\s*series\b', 
        r'\bg\s*series\b', r'\bfire\s*tv\b', r'\bgoogle\s*tv\b', 
        r'\bandroid\s*tv\b', r'\bwebos\b', r'\btizen\b',
        r'\bmacbook\s*air\b', r'\bmacbook\s*pro\b', r'\bthinkpad\b', 
        r'\bzenbook\b', r'\bvivobook\b', r'\brog\b', r'\btuf\b', r'\baliware\b',
        r'\binspiron\b', r'\bvostro\b', r'\blatitude\b', r'\bxps\b',
        r'\bideapad\b', r'\blegion\b', r'\byoga\b', r'\bpavilion\b', r'\benvy\b', r'\bspectre\b', r'\bomen\b',
        r'\bloq\b', r'\bpredator\b', r'\bnitro\b', r'\bvictus\b'
    ]
    for pattern in series_patterns:
        match = re.search(pattern, title_lower)
        if match:
            identifiers.add('series_' + match.group(0).replace(' ', ''))
            
    # Extract CPU/GPU for laptops
    cpu_gpu_patterns = [
        r'i\d-\d{4,5}[hxu]?', r'ryzen\s*\d\s*\d{4}[hxu]?', r'rtx\s*\d{4}', r'gtx\s*\d{4}', r'rx\s*\d{4}'
    ]
    for pattern in cpu_gpu_patterns:
        match = re.search(pattern, title_lower)
        if match:
            identifiers.add('spec_' + match.group(0).replace(' ', ''))
            
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
            model_token = match.group(0).replace(' ', '')
            identifiers.add(model_token)
            identifiers.add('model_' + model_token)

    # Explicit iPhone generation token (helps prevent Air vs 17 Pro mismatches)
    iphone_gen_match = re.search(r'\biphone\s*(\d{1,2})\b', title_lower)
    if iphone_gen_match:
        identifiers.add(f"iphone_gen_{iphone_gen_match.group(1)}")
    
    return identifiers


def _has_hard_match_conflict(amz_ids, fk_ids):
    """Reject clearly incompatible pairs even if semantic/API score is high."""
    amz_brands = {
        x for x in amz_ids
        if not x.startswith((
            'brandfamily_', 'flag_', 'unit_', 'watt_', 'jars_', 'appmodel_',
            'storage_', 'ram_', 'series_', 'model_', 'color_', 'variant_', 'iphone_gen_'
        )) and x in SUPPORTED_BRANDS
    }
    fk_brands = {
        x for x in fk_ids
        if not x.startswith((
            'brandfamily_', 'flag_', 'unit_', 'watt_', 'jars_', 'appmodel_',
            'storage_', 'ram_', 'series_', 'model_', 'color_', 'variant_', 'iphone_gen_'
        )) and x in SUPPORTED_BRANDS
    }
    if amz_brands and fk_brands and not amz_brands.intersection(fk_brands):
        amz_families = {x for x in amz_ids if x.startswith('brandfamily_')}
        fk_families = {x for x in fk_ids if x.startswith('brandfamily_')}
        if not amz_families.intersection(fk_families):
            return True

    amz_storage = {x for x in amz_ids if x.startswith('storage_')}
    fk_storage = {x for x in fk_ids if x.startswith('storage_')}
    if amz_storage and fk_storage and amz_storage != fk_storage:
        return True

    amz_variants = {x.replace('variant_', '') for x in amz_ids if x.startswith('variant_')}
    fk_variants = {x.replace('variant_', '') for x in fk_ids if x.startswith('variant_')}
    amz_strict_variants = amz_variants.intersection(STRICT_VARIANTS)
    fk_strict_variants = fk_variants.intersection(STRICT_VARIANTS)
    if amz_strict_variants and fk_strict_variants and not amz_strict_variants.intersection(fk_strict_variants):
        return True

    amz_iphone_gen = {x for x in amz_ids if x.startswith('iphone_gen_')}
    fk_iphone_gen = {x for x in fk_ids if x.startswith('iphone_gen_')}
    if amz_iphone_gen and fk_iphone_gen and amz_iphone_gen != fk_iphone_gen:
        return True

    return False


def _has_price_conflict(amz_price, fk_price):
    """Reject matches where the price difference is too large based on price magnitude."""
    if not amz_price or not fk_price:
        return False
    
    try:
        p1 = float(amz_price)
        p2 = float(fk_price)
    except (ValueError, TypeError):
        return False
        
    if p1 <= 0 or p2 <= 0:
        return False
        
    # General rule: if one is less than half or more than double the other, reject
    if p1 < p2 * 0.5 or p1 > p2 * 2.0:
        return True
        
    diff = abs(p1 - p2)
    avg_price = (p1 + p2) / 2
    
    # Dynamic thresholds based on price magnitude
    if avg_price < 5000:
        # Small appliances, accessories (e.g., grinders)
        if diff > 2000:
            return True
    elif avg_price < 20000:
        # Budget phones, monitors
        if diff > 5000:
            return True
    elif avg_price < 50000:
        # Mid-range phones, budget laptops
        if diff > 10000:
            return True
    else:
        # Premium laptops, high-end phones
        if diff > 20000:
            return True
            
    return False


def _extract_json_array_from_ai_text(raw_text):
    """
    Best-effort extraction of a JSON array from model text that may contain
    thinking traces, markdown fences, or preamble text.
    """
    import json as json_mod
    import re as re_mod

    text = (raw_text or "").strip()
    if not text:
        return []

    # Remove fenced markdown wrappers.
    text = re_mod.sub(r'^```(?:json)?\s*', '', text, flags=re_mod.IGNORECASE)
    text = re_mod.sub(r'\s*```$', '', text)

    # Remove complete think tags if present.
    text = re_mod.sub(r'<think>[\s\S]*?</think>', '', text, flags=re_mod.IGNORECASE)
    text = text.strip()

    # If response starts with <think> and never closes, trim everything before first '['.
    first_bracket = text.find('[')
    if first_bracket > 0 and text[:first_bracket].lstrip().lower().startswith('<think'):
        text = text[first_bracket:]
        
    # If there's no <think> tag but there's a lot of text before the JSON array, just find the first '['
    elif first_bracket > 0:
        text = text[first_bracket:]

    # Parse the first balanced JSON array.
    start = text.find('[')
    if start == -1:
        # Try to find JSON array using regex if simple parsing fails
        match = re_mod.search(r'\[\s*\{.*?\}\s*\]', text, re_mod.DOTALL)
        if match:
            text = match.group(0)
            start = 0
        else:
            # If it's a thinking model that got cut off, try to extract any valid JSON objects
            objects = re_mod.findall(r'\{\s*"a"\s*:\s*\d+\s*,\s*"f"\s*:\s*\d+\s*,\s*"confidence"\s*:\s*0\.\d+\s*\}', text)
            if objects:
                return json_mod.loads('[' + ','.join(objects) + ']')
            raise ValueError("No JSON array found in model response")

    depth = 0
    end = -1
    for i, ch in enumerate(text[start:], start=start):
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        raise ValueError("Unbalanced JSON array in model response")

    candidate = text[start:end + 1].strip()
    try:
        parsed = json_mod.loads(candidate)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    # Try lenient normalization for near-JSON payloads.
    normalized = candidate.replace("'", '"')
    normalized = re_mod.sub(r'(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', normalized)
    normalized = re_mod.sub(r',\s*([}\]])', r'\1', normalized)
    try:
        parsed = json_mod.loads(normalized)
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass

    # Last resort: regex-extract loose objects containing a/f/confidence.
    recovered = []
    obj_blocks = re_mod.findall(r'\{[^{}]+\}', text)
    for block in obj_blocks:
        a_m = re_mod.search(r'["\']?a["\']?\s*[:=]\s*(\d+)', block, re_mod.IGNORECASE)
        f_m = re_mod.search(r'["\']?f["\']?\s*[:=]\s*(\d+)', block, re_mod.IGNORECASE)
        c_m = re_mod.search(r'["\']?confidence["\']?\s*[:=]\s*([01](?:\.\d+)?)', block, re_mod.IGNORECASE)
        if a_m and f_m:
            recovered.append({
                "a": int(a_m.group(1)),
                "f": int(f_m.group(1)),
                "confidence": float(c_m.group(1)) if c_m else 0.8,
            })

    if recovered:
        return recovered

    # If we still haven't found anything, try to find any numbers that look like indices
    # This is a very aggressive fallback for models that just output text like "A0 matches F4"
    matches = re_mod.findall(r'[Aa](\d+).*?[Ff](\d+)', text)
    if matches:
        for a, f in matches:
            recovered.append({
                "a": int(a),
                "f": int(f),
                "confidence": 0.8
            })
        return recovered

    raise ValueError("No parseable match JSON found in model response")


def _match_products_lightweight(amazon_products, flipkart_products):
    """Fast fallback matcher without embedding inference."""
    if not amazon_products and not flipkart_products:
        return []
    if not amazon_products:
        return [{
            "id": i + 1,
            "title": p['title'], "image": p['image'], "rating": p['rating'],
            "is_prime": False,
            "amazon_price": None, "amazon_link": None,
            "flipkart_price": p['price'], "flipkart_link": p['link'],
            "has_comparison": False, "match_confidence": 0
        } for i, p in enumerate(flipkart_products)]
    if not flipkart_products:
        return [{
            "id": i + 1,
            "title": p['title'], "image": p['image'], "rating": p['rating'],
            "is_prime": p['is_prime'],
            "amazon_price": p['price'], "amazon_link": p['link'],
            "flipkart_price": None, "flipkart_link": None,
            "has_comparison": False, "match_confidence": 0
        } for i, p in enumerate(amazon_products)]

    amz_data = [{
        "idx": i,
        "p": p,
        "ids": extract_key_identifiers(p.get("title", "")),
    } for i, p in enumerate(amazon_products)]
    fk_data = [{
        "idx": i,
        "p": p,
        "ids": extract_key_identifiers(p.get("title", "")),
    } for i, p in enumerate(flipkart_products)]

    used_fk = set()
    unified = []

    for amz in amz_data:
        best = None
        best_score = 0.0
        for fk in fk_data:
            if fk["idx"] in used_fk:
                continue
            if _has_hard_match_conflict(amz["ids"], fk["ids"]):
                continue
            if _has_price_conflict(amz["p"].get("price"), fk["p"].get("price")):
                continue

            union = amz["ids"] | fk["ids"]
            overlap = amz["ids"] & fk["ids"]
            jacc = (len(overlap) / len(union)) if union else 0.0
            brand_bonus = 0.1 if any(x in SUPPORTED_BRANDS for x in overlap) else 0.0
            score = jacc + brand_bonus
            if score > best_score:
                best_score = score
                best = fk

        best_match = None
        if best and best_score >= 0.18:
            best_match = best["p"]
            used_fk.add(best["idx"])

        unified.append({
            "id": len(unified) + 1,
            "title": amz["p"]["title"],
            "image": amz["p"]["image"],
            "rating": amz["p"]["rating"],
            "is_prime": amz["p"]["is_prime"],
            "amazon_price": amz["p"]["price"],
            "amazon_link": amz["p"]["link"],
            "flipkart_price": best_match["price"] if best_match else None,
            "flipkart_link": best_match["link"] if best_match else None,
            "has_comparison": bool(best_match),
            "match_confidence": round(best_score, 2) if best_match else 0,
        })

    for fk in fk_data:
        if fk["idx"] not in used_fk:
            unified.append({
                "id": len(unified) + 1,
                "title": fk["p"]["title"],
                "image": fk["p"]["image"],
                "rating": fk["p"]["rating"],
                "is_prime": False,
                "amazon_price": None,
                "amazon_link": None,
                "flipkart_price": fk["p"]["price"],
                "flipkart_link": fk["p"]["link"],
                "has_comparison": False,
                "match_confidence": 0
            })

    matched = [p for p in unified if p["has_comparison"]]
    unmatched = [p for p in unified if not p["has_comparison"]]
    sorted_products = matched + unmatched
    for i, p in enumerate(sorted_products):
        p["id"] = i + 1
    return sorted_products


def match_products(amazon_products, flipkart_products):
    """
    Match similar products from Amazon and Flipkart.
    Uses AI Embeddings (RTX 4050 accelerated) + Regex Heuristics.
    """
    if not amazon_products and not flipkart_products:
        return []

    unified_products = []
    used_flipkart = set()
    
    # Handle single source results
    if not amazon_products:
        for p in flipkart_products:
            unified_products.append({
                "id": len(unified_products) + 1,
                "title": p['title'],
                "image": p['image'],
                "rating": p['rating'],
                "is_prime": False,
                "amazon_price": None,
                "amazon_link": None,
                "flipkart_price": p['price'],
                "flipkart_link": p['link'],
                "has_comparison": False,
                "match_confidence": 0
            })
        return unified_products

    if not flipkart_products:
        for p in amazon_products:
            unified_products.append({
                "id": len(unified_products) + 1,
                "title": p['title'],
                "image": p['image'],
                "rating": p['rating'],
                "is_prime": p['is_prime'],
                "amazon_price": p['price'],
                "amazon_link": p['link'],
                "flipkart_price": None,
                "flipkart_link": None,
                "has_comparison": False,
                "match_confidence": 0
            })
        return unified_products

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
        amz_ids = amz['identifiers']
        
        # Determine Category
        amz_cat = 'general'
        if any(x.endswith('inch') for x in amz_ids) or any(x in amz_ids for x in ['4k', 'fhd', 'hd']):
            amz_cat = 'tv'
        elif any(x.startswith('storage_') for x in amz_ids) and any(x in amz_ids for x in ['apple', 'samsung', 'oneplus', 'xiaomi', 'redmi', 'realme', 'oppo', 'vivo', 'poco', 'motorola']):
            amz_cat = 'mobile'
        elif any(x.startswith('watt_') for x in amz_ids) or any(x.startswith('jars_') for x in amz_ids):
            amz_cat = 'appliance'

        best_match = None
        best_score = 0
        best_idx = -1
        
        for j, fk in enumerate(fk_data):
            if fk['idx'] in used_flipkart:
                continue
            
            fk_ids = fk['identifiers']
            semantic_score = float(cosine_scores[i][j])
            
            # --- VETO LOGIC (100% Fatal Conflicts) ---
            
            # 1. Accessory vs Main Product Conflict
            if amz_ids.intersection({'flag_accessory', 'flag_main_product'}) != fk_ids.intersection({'flag_accessory', 'flag_main_product'}):
                continue

            # 2. Refurbished vs New Conflict
            if amz_ids.intersection({'flag_refurbished', 'flag_new'}) != fk_ids.intersection({'flag_refurbished', 'flag_new'}):
                continue
            
            # 3. Brand Conflict
            amz_brands = {x for x in amz_ids if not x.startswith(('brandfamily_', 'flag_', 'unit_', 'watt_', 'jars_', 'appmodel_', 'storage_', 'ram_', 'series_', 'model_', 'color_', 'variant_', 'iphone_gen_')) and x in SUPPORTED_BRANDS}
            fk_brands = {x for x in fk_ids if not x.startswith(('brandfamily_', 'flag_', 'unit_', 'watt_', 'jars_', 'appmodel_', 'storage_', 'ram_', 'series_', 'model_', 'color_', 'variant_', 'iphone_gen_')) and x in SUPPORTED_BRANDS}
            
            brand_conflict = False
            if amz_brands and fk_brands:
                # Check for explicit brand overlap
                if not amz_brands.intersection(fk_brands):
                    # Check for brand family overlap (e.g. Mi belongs to Xiaomi)
                    amz_families = {x for x in amz_ids if x.startswith('brandfamily_')}
                    fk_families = {x for x in fk_ids if x.startswith('brandfamily_')}
                    if not amz_families.intersection(fk_families):
                        continue # Hard brand mismatch

            # 4. Storage Conflict (Strict for Mobiles)
            amz_storage = {x for x in amz_ids if x.startswith('storage_')}
            fk_storage = {x for x in fk_ids if x.startswith('storage_')}
            if amz_storage and fk_storage and amz_storage != fk_storage:
                continue

            # 5. Quantity/Unit Conflict
            amz_units = {x for x in amz_ids if x.startswith('unit_')}
            fk_units = {x for x in fk_ids if x.startswith('unit_')}
            if amz_units and fk_units and amz_units != fk_units:
                continue

            # 6. Category Specific Vetoes
            if amz_cat == 'tv':
                # Screen size match
                amz_sizes = {x for x in amz_ids if x.endswith('inch')}
                fk_sizes = {x for x in fk_ids if x.endswith('inch')}
                if amz_sizes and fk_sizes and amz_sizes != fk_sizes:
                    continue
                # Resolution match
                amz_res = amz_ids.intersection({'4k', 'fhd', 'hd'})
                fk_res = fk_ids.intersection({'4k', 'fhd', 'hd'})
                if amz_res and fk_res and amz_res != fk_res:
                    continue
            
            if amz_cat == 'appliance':
                # Wattage match
                amz_watt = {x for x in amz_ids if x.startswith('watt_')}
                fk_watt = {x for x in fk_ids if x.startswith('watt_')}
                if amz_watt and fk_watt and amz_watt != fk_watt:
                    continue
                # Jar count match
                amz_jars = {x for x in amz_ids if x.startswith('jars_')}
                fk_jars = {x for x in fk_ids if x.startswith('jars_')}
                if amz_jars and fk_jars and amz_jars != fk_jars:
                    continue

            # 7. Series/Variant Conflict
            amz_series = {x for x in amz_ids if x.startswith('series_')}
            fk_series = {x for x in fk_ids if x.startswith('series_')}
            if amz_series and fk_series and amz_series != fk_series:
                continue

            # 8. Strict variant conflict (especially important for phones/laptops)
            amz_variants = {x.replace('variant_', '') for x in amz_ids if x.startswith('variant_')}
            fk_variants = {x.replace('variant_', '') for x in fk_ids if x.startswith('variant_')}
            amz_strict_variants = amz_variants.intersection(STRICT_VARIANTS)
            fk_strict_variants = fk_variants.intersection(STRICT_VARIANTS)
            if amz_strict_variants and fk_strict_variants and not amz_strict_variants.intersection(fk_strict_variants):
                continue

            # 9. iPhone generation mismatch (e.g., iPhone 16 vs iPhone 17)
            amz_iphone_gen = {x for x in amz_ids if x.startswith('iphone_gen_')}
            fk_iphone_gen = {x for x in fk_ids if x.startswith('iphone_gen_')}
            if amz_iphone_gen and fk_iphone_gen and amz_iphone_gen != fk_iphone_gen:
                continue

            # 10. Price Conflict
            if _has_price_conflict(amz_product.get('price'), fk['p'].get('price')):
                continue

            # --- DYNAMIC SCORING ---
            score = semantic_score
            
            # Boost for shared identifiers
            overlap_count = len(amz_ids & fk_ids)
            score += (overlap_count * 0.05)
            
            # Boost for brand match
            brand_match = bool(amz_brands.intersection(fk_brands))
            if brand_match:
                score += 0.15
            
            # Boost for model match
            amz_models = {x for x in amz_ids if x.startswith('model_')}
            fk_models = {x for x in fk_ids if x.startswith('model_')}
            if amz_models and fk_models and amz_models.intersection(fk_models):
                score += 0.4 # Significant boost
                
            # Penalty for color mismatch (not a veto)
            amz_colors = {x for x in amz_ids if x.startswith('color_')}
            fk_colors = {x for x in fk_ids if x.startswith('color_')}
            if amz_colors and fk_colors and amz_colors != fk_colors:
                score -= 0.2

            # Final Decision based on confidence levels
            is_valid = False
            
            # Level 1: Extremely high confidence (Model match OR Brand+Storage+Series)
            if amz_models and fk_models and amz_models.intersection(fk_models) and semantic_score > 0.4:
                is_valid = True
            # Level 2: High overlap + decent semantic
            elif brand_match and overlap_count >= 4 and semantic_score > 0.55:
                is_valid = True
            # Level 3: Pure semantic (needs to be very high for electronics)
            elif semantic_score > 0.82:
                is_valid = True
            
            if is_valid and score > best_score:
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
            "flipkart_link": best_match['link'] if best_match else None,
            "match_confidence": round(best_score, 2) if best_match else 0
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
                "flipkart_link": fk_product['link'],
                "match_confidence": 0
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


def scrape_product_details(url):
    """
    Scrape detailed product specifications from an individual Amazon or Flipkart product page.
    Uses Selenium to handle JavaScript-rendered content.
    Returns a dict of specification key-value pairs.
    """
    if not url:
        return {}
    
    driver = None
    specs = {}
    
    try:
        driver = get_chrome_driver()
        driver.set_page_load_timeout(15)
        print(f"[DETAIL SCRAPE] Loading: {url[:80]}...")
        driver.get(url)
        time.sleep(2)  # Let page render
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        if "amazon" in url.lower():
            # Amazon Product Details
            
            # Method 1: Technical Details table (#productDetails_techSpec_section_1)
            tech_table = soup.find('table', {'id': 'productDetails_techSpec_section_1'})
            if tech_table:
                for row in tech_table.find_all('tr'):
                    th = row.find('th')
                    td = row.find('td')
                    if th and td:
                        key = th.get_text(strip=True)
                        val = td.get_text(strip=True)
                        if key and val:
                            specs[key] = val
            
            # Method 2: Additional Info table (#productDetails_detailBullets_sections1)
            detail_table = soup.find('table', {'id': 'productDetails_detailBullets_sections1'})
            if detail_table:
                for row in detail_table.find_all('tr'):
                    th = row.find('th')
                    td = row.find('td')
                    if th and td:
                        key = th.get_text(strip=True)
                        val = td.get_text(strip=True)
                        if key and val and key not in specs:
                            specs[key] = val
            
            # Method 3: Detail Bullets (#detailBullets_feature_div)
            bullets_div = soup.find('div', {'id': 'detailBullets_feature_div'})
            if bullets_div:
                for li in bullets_div.find_all('li'):
                    spans = li.find_all('span', class_='a-list-item')
                    for span in spans:
                        text = span.get_text(strip=True)
                        if ':' in text or '\u200f' in text:
                            parts = re.split(r'[:\u200f]', text, 1)
                            if len(parts) == 2:
                                key = parts[0].strip().strip('\u200e')
                                val = parts[1].strip().strip('\u200e')
                                if key and val and key not in specs:
                                    specs[key] = val
            
            # Method 4: Feature bullets (#feature-bullets)
            feature_div = soup.find('div', {'id': 'feature-bullets'})
            if feature_div:
                features = []
                for li in feature_div.find_all('li'):
                    text = li.get_text(strip=True)
                    if text and len(text) > 5:
                        features.append(text)
                if features:
                    specs['Key Features'] = ' | '.join(features[:6])
            
            # Product description
            desc = soup.find('div', {'id': 'productDescription'})
            if desc:
                desc_text = desc.get_text(strip=True)[:300]
                if desc_text:
                    specs['Description'] = desc_text
                    
        elif "flipkart" in url.lower():
            # Flipkart Product Details
            
            # Method 1: Specification tables (_14cfVK or _3Fm-hO pattern)
            spec_divs = soup.find_all('div', class_=re.compile(r'_14cfVK|GNDEQ-|_3k-BhJ'))
            if not spec_divs:
                # Try alternative class patterns
                spec_divs = soup.find_all('div', class_=re.compile(r'X3BRps|_3dtsli'))
            
            for div in spec_divs:
                rows = div.find_all('tr', class_=re.compile(r'_1s_Smc|WJdYP6|row'))
                if not rows:
                    rows = div.find_all('tr')
                for row in rows:
                    tds = row.find_all('td')
                    if len(tds) >= 2:
                        key = tds[0].get_text(strip=True)
                        val_el = tds[1].find('li') or tds[1]
                        val = val_el.get_text(strip=True)
                        if key and val:
                            specs[key] = val
            
            # Method 2: Key Specs section (often _2RngUh or _2418kt)
            key_specs = soup.find_all('li', class_=re.compile(r'_2RngUh|_21lJbe'))
            if key_specs:
                features = [li.get_text(strip=True) for li in key_specs if li.get_text(strip=True)]
                if features:
                    specs['Highlights'] = ' | '.join(features[:6])

            # Method 3: Read more description
            desc_div = soup.find('div', class_=re.compile(r'_1mXcCf|_2o0sEQ'))
            if desc_div:
                desc_text = desc_div.get_text(strip=True)[:300]
                if desc_text:
                    specs['Description'] = desc_text
        
        print(f"[DETAIL SCRAPE] Found {len(specs)} specs from {url[:50]}...")
        
    except Exception as e:
        print(f"[DETAIL SCRAPE] Error scraping {url[:60]}: {e}")
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass
    
    return specs


def search_products(query, timeout=45, use_nvidia=False, model=None):
    """
    Search both Amazon and Flipkart concurrently.
    Returns unified product list.
    use_nvidia: If True, uses NVIDIA Kimi-K2 for product matching instead of sentence-transformers.
    """
    amazon_products = []
    flipkart_products = []
    
    # Overall request budget is provided by caller (API layer). Keep provider wait bounded separately.
    request_timeout = max(timeout, 10)
    provider_timeout = min(request_timeout, int(os.getenv("SCRAPER_PROVIDER_TIMEOUT_SECONDS", "35")))
    target_results = DEFAULT_MAX_RESULTS
    started_at = time.time()
    
    executor = ThreadPoolExecutor(max_workers=2)
    try:
        print("[SCRAPER] Starting threads...")
        amazon_future = executor.submit(scrape_amazon, query, target_results)
        flipkart_future = executor.submit(scrape_flipkart, query, target_results)

        print(f"[SCRAPER] Waiting for providers (timeout={provider_timeout}s)...")
        done, not_done = wait(
            [amazon_future, flipkart_future],
            timeout=provider_timeout,
            return_when=ALL_COMPLETED,
        )

        if amazon_future in done:
            try:
                amazon_products = amazon_future.result()
                print(f"[AMAZON] Found {len(amazon_products)} products")
            except Exception as e:
                print(f"[AMAZON] Error: {e}")
        else:
            print("[AMAZON] Timeout - operation took too long, attempting to retrieve partial results")
            try:
                # Try to get whatever was scraped so far if the future is still running
                # This relies on the inner threads timing out slightly before this outer timeout
                amazon_products = amazon_future.result(timeout=1)
                print(f"[AMAZON] Recovered {len(amazon_products)} products after timeout")
            except Exception:
                pass

        if flipkart_future in done:
            try:
                flipkart_products = flipkart_future.result()
                print(f"[FLIPKART] Found {len(flipkart_products)} products")
            except Exception as e:
                print(f"[FLIPKART] Error: {e}")
        else:
            print("[FLIPKART] Timeout - operation took too long, attempting to retrieve partial results")
            try:
                flipkart_products = flipkart_future.result(timeout=1)
                print(f"[FLIPKART] Recovered {len(flipkart_products)} products after timeout")
            except Exception:
                pass

        for future in not_done:
            future.cancel()
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    
    if use_nvidia:
        print(f"[SCRAPER] Using NVIDIA AI for product matching (model: {model or 'kimi-k2'})...")
        unified = match_products_nvidia(
            amazon_products,
            flipkart_products,
            timeout_seconds=None,
            model=model,
        )
    else:
        print("[SCRAPER] Using local model for product matching...")
        unified = match_products(amazon_products, flipkart_products)
    return unified


def match_products_nvidia(amazon_products, flipkart_products, timeout_seconds=None, model=None):
    """
    Match products using AI model via NVIDIA API.
    Sends product titles to AI and asks it to find matching pairs.
    Falls back to local matching if API fails.
    """
    if not amazon_products and not flipkart_products:
        return []
    
    # Single source - no matching needed
    if not amazon_products:
        return [{
            "id": i + 1,
            "title": p['title'], "image": p['image'], "rating": p['rating'],
            "is_prime": False,
            "amazon_price": None, "amazon_link": None,
            "flipkart_price": p['price'], "flipkart_link": p['link'],
            "has_comparison": False, "match_confidence": 0
        } for i, p in enumerate(flipkart_products)]

    if not flipkart_products:
        return [{
            "id": i + 1,
            "title": p['title'], "image": p['image'], "rating": p['rating'],
            "is_prime": p['is_prime'],
            "amazon_price": p['price'], "amazon_link": p['link'],
            "flipkart_price": None, "flipkart_link": None,
            "has_comparison": False, "match_confidence": 0
        } for i, p in enumerate(amazon_products)]

    try:
        from openai import OpenAI
        import json as json_mod
        
        ai_model_id = model or "moonshotai/kimi-k2-instruct-0905"
        nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")
        if not nvidia_api_key:
            raise ValueError("NVIDIA_API_KEY not configured")
        
        # All models are provided by NVIDIA NIM API
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1", 
            api_key=nvidia_api_key
        )
        ai_model = ai_model_id
        
        nvidia_timeout = float(timeout_seconds) if timeout_seconds else None
        
        # Larger batch for more matches.
        max_batch = max(8, int(os.getenv("NVIDIA_MATCH_MAX_BATCH", "30")))
        amz_batch = amazon_products[:max_batch]
        fk_batch = flipkart_products[:max_batch]
        
        # Build product lists for AI
        amz_list = "\n".join([f"A{i}: {p['title'][:100]} | Price: {p.get('price', 'N/A')}" for i, p in enumerate(amz_batch)])
        fk_list = "\n".join([f"F{i}: {p['title'][:100]} | Price: {p.get('price', 'N/A')}" for i, p in enumerate(fk_batch)])
        
        prompt = f"""Match identical products between Amazon (A) and Flipkart (F).

AMAZON:
{amz_list}

FLIPKART:
{fk_list}

RULES:
- Match products that are the SAME item (same brand, model, key specs like storage/RAM)
- Brand must match
- Different storage/RAM/color variants = different products, do NOT match
- If two products clearly refer to the same SKU (e.g. "iPhone 16 Pro 128GB" on both), match them
- Be generous with matching when brand + model + key specs align, even if titles have different filler words
- SPECIFICATIONS MATCH: Ensure 100% match on key specifications . Do not match if any of these differ.
- PRICE CHECK: Compare prices of potential matches. Acceptable price gaps vary by category and price range:
  * Lower priced items (e.g., ₹1k-₹10k) should have smaller price differences (up to ~₹1,000).
  * Higher priced items (e.g., ₹50k-₹3L) can have larger price differences (up to ~₹15k-₹20k) due to sales/offers.
  * General rule: if one product costs less than half or more than double the other, it is almost certainly NOT the same product (e.g. a ₹500 accessory vs a ₹50,000 phone). Reject such mismatches.

Return ONLY a JSON array. Each element: {{"a": <amazon_index>, "f": <flipkart_index>, "confidence": <0.7-1.0>}}
Example: [{{"a": 0, "f": 3, "confidence": 0.95}}]
Return [] only if genuinely zero products match."""

        print(f"[NVIDIA] Sending {len(amz_batch)} Amazon + {len(fk_batch)} Flipkart products for matching (model: {ai_model})...")
        
        import time
        nvidia_start_time = time.time()
        
        # Thinking/reasoning models need much higher max_tokens since they
        # use most of the budget on chain-of-thought before producing output.
        is_thinking_model = any(kw in ai_model.lower() for kw in ['thinking', 'reasoning', 'oss', 'r1', 'qwq'])
        token_limit = 16384 if is_thinking_model else 2048
        if is_thinking_model:
            print(f"[NVIDIA] Detected thinking model, using max_tokens={token_limit}")
        
        completion = client.chat.completions.create(
            model=ai_model,
            messages=[
                {"role": "system", "content": "You are a product matching engine. Return ONLY valid JSON arrays. Never include explanations, reasoning, think tags, or markdown fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            top_p=0.9,
            max_tokens=token_limit,
            stream=False,
            timeout=nvidia_timeout
        )
        
        nvidia_elapsed = time.time() - nvidia_start_time
        
        message = completion.choices[0].message
        ai_response = message.content
        
        # Handle thinking models that might put content in reasoning_content or return None
        if not ai_response:
            if hasattr(message, 'reasoning_content') and message.reasoning_content:
                print(f"[NVIDIA] Model returned reasoning_content but no content. Extracting from reasoning.")
                ai_response = message.reasoning_content
            else:
                print(f"[NVIDIA] Model returned None for content and no reasoning_content.")
                ai_response = "[]"
                
        ai_response = ai_response.strip()
        print(f"[NVIDIA] Raw response: {ai_response[:300]}")
        matches = _extract_json_array_from_ai_text(ai_response)
        print(f"[NVIDIA] Found {len(matches)} matches in {nvidia_elapsed:.2f}s")
        
        # Build unified products from AI matches
        unified_products = []
        used_flipkart = set()
        matched_amazon = set()
        
        for m in matches:
            a_idx = m.get('a', -1)
            f_idx = m.get('f', -1)
            confidence = m.get('confidence', 0)
            
            if a_idx < 0 or a_idx >= len(amz_batch) or f_idx < 0 or f_idx >= len(fk_batch):
                continue
            if f_idx in used_flipkart:
                continue
            if confidence < 0.7:
                continue
            
            amz_p = amz_batch[a_idx]
            fk_p = fk_batch[f_idx]
            
            unified_products.append({
                "id": len(unified_products) + 1,
                "title": amz_p['title'],
                "image": amz_p['image'],
                "rating": amz_p['rating'],
                "is_prime": amz_p['is_prime'],
                "amazon_price": amz_p['price'],
                "amazon_link": amz_p['link'],
                "flipkart_price": fk_p['price'],
                "flipkart_link": fk_p['link'],
                "has_comparison": True,
                "match_confidence": round(confidence, 2)
            })
            used_flipkart.add(f_idx)
            matched_amazon.add(a_idx)
        
        # Add unmatched Amazon products
        for i, p in enumerate(amz_batch):
            if i not in matched_amazon:
                unified_products.append({
                    "id": len(unified_products) + 1,
                    "title": p['title'], "image": p['image'], "rating": p['rating'],
                    "is_prime": p['is_prime'],
                    "amazon_price": p['price'], "amazon_link": p['link'],
                    "flipkart_price": None, "flipkart_link": None,
                    "has_comparison": False, "match_confidence": 0
                })
        
        # Add unmatched Flipkart products
        for i, p in enumerate(fk_batch):
            if i not in used_flipkart:
                unified_products.append({
                    "id": len(unified_products) + 1,
                    "title": p['title'], "image": p['image'], "rating": p['rating'],
                    "is_prime": False,
                    "amazon_price": None, "amazon_link": None,
                    "flipkart_price": p['price'], "flipkart_link": p['link'],
                    "has_comparison": False, "match_confidence": 0
                })
        
        # Sort: matched first
        matched = [p for p in unified_products if p['has_comparison']]
        unmatched = [p for p in unified_products if not p['has_comparison']]
        sorted_products = matched + unmatched
        for i, product in enumerate(sorted_products):
            product['id'] = i + 1
        
        print(f"[NVIDIA] Returning {len(sorted_products)} unified products ({len(matched)} matched)")
        return sorted_products
        
    except Exception as e:
        # Fallback to lightweight matching on error
        return _match_products_lightweight(amazon_products[:30], flipkart_products[:30])
