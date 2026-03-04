"""
Debug script to understand why Flipkart scraper returns 0 results.
Dumps detailed info about the page state.
"""
import sys, os, time, re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from scraper import get_chrome_driver, parse_price
from bs4 import BeautifulSoup

driver = None
try:
    driver = get_chrome_driver()
    url = "https://www.flipkart.com/search?q=lenovo"
    print(f"[1] Loading: {url}")
    driver.get(url)
    
    # Wait longer
    print("[2] Waiting 6 seconds for page load...")
    time.sleep(6)
    
    # Try closing login popup
    from selenium.webdriver.common.by import By
    try:
        close_btn = driver.find_element(By.CSS_SELECTOR, "button._2KpZ6l._2doB4z, span._30XB9F")
        close_btn.click()
        print("[3] Closed login popup")
    except:
        print("[3] No login popup found")
    
    # Scroll to trigger lazy loading
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight/2);")
    time.sleep(0.5)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(0.5)
    
    html = driver.page_source
    print(f"[4] HTML length: {len(html)} bytes")
    
    # Save for inspection
    with open("flipkart_debug.html", "w", encoding="utf-8") as f:
        f.write(html)
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Check for bot detection / captcha
    title = soup.title.string if soup.title else "No title"
    print(f"[5] Page title: {title}")
    
    # Check for common block indicators
    if 'captcha' in html.lower() or 'robot' in html.lower():
        print("[!] CAPTCHA or robot check detected!")
    
    # Count all links
    all_links = soup.find_all('a', href=True)
    print(f"[6] Total links on page: {len(all_links)}")
    
    # Count product links specifically
    product_links = soup.find_all('a', href=re.compile(r'/p/'))
    print(f"[7] Links containing '/p/': {len(product_links)}")
    
    # Show first 5 product link hrefs
    for i, a in enumerate(product_links[:5]):
        print(f"    Link {i}: href={a['href'][:60]}...")
        print(f"           text={a.get_text(strip=True)[:40]}...")
    
    # Try the robust heuristic from the updated scraper
    products_found = 0
    seen = set()
    for a in product_links:
        href = a.get('href')
        if not href or href in seen:
            continue
        
        text = a.get_text(strip=True)
        title = None
        if len(text) > 15:
            title = text
        elif a.get('title') and len(a.get('title')) > 15:
            title = a.get('title')
        
        if not title:
            continue
        
        # Look for price
        price = None
        curr = a
        for _ in range(6):
            if not curr or curr.name == 'body':
                break
            price_texts = curr.find_all(string=re.compile(r'₹[0-9,]+'))
            if price_texts:
                for pt in price_texts:
                    parsed = parse_price(str(pt).strip())
                    if parsed:
                        price = parsed
                        break
            if price:
                break
            curr = curr.parent
        
        if title and price:
            products_found += 1
            seen.add(href)
            if products_found <= 3:
                print(f"[8] Product: {title[:50]}... | ₹{price}")
    
    print(f"\n[RESULT] Found {products_found} products total")
    
finally:
    if driver:
        driver.quit()
