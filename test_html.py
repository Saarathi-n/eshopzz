from bs4 import BeautifulSoup
import re
import json

print("Testing Robust Scraping...")
with open("flipkart_dump.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

products = []
# Best way to find flipkart products is looking for links that match /p/ 
# and have a title or an image and a price nearby.
links = soup.select('a[href*="/p/"]')

seen_links = set()

for a in links:
    href = a.get('href')
    if href in seen_links: continue
    
    # Needs to be a substantial link, not just a tiny fragment
    text = a.get_text(strip=True)
    title = None
    
    # 1. Is this link the title itself?
    if len(text) > 15:
         title = text
    # 2. Or does it have a title attribute?
    elif a.get('title') and len(a.get('title')) > 15:
         title = a.get('title')
    # 3. Does it contain a child div with the title?
    else:
         child_divs = a.find_all('div')
         for d in child_divs:
              t = d.get_text(strip=True)
              if len(t) > 15 and not t.startswith('₹'):
                   title = t
                   break

    if not title: continue
    
    # Look for price in the parent tree
    price = None
    curr = a
    for _ in range(5): # Go up 5 levels max
        if not curr: break
        
        # Look for the characteristic Rupee symbol in any child
        price_texts = curr.find_all(string=re.compile(r'₹[0-9,]+'))
        if price_texts:
             for pt in price_texts:
                  # Ensure it's not the original price (strikethrough)
                  parent_classes = pt.parent.get('class', [])
                  if parent_classes and any('strikethrough' in c.lower() or 'discount' in c.lower() for c in parent_classes):
                       continue
                  # Usually the current price is the first one or largest one
                  price = pt.strip()
                  break
        
        if price: break
        curr = curr.parent

    if title and price:
         products.append({
             'title': title,
             'price': price,
             'link': href[:30] + '...'
         })
         seen_links.add(href)

print(f"Found {len(products)} products using robust heuristic.")
for p in products[:5]:
    print(p)
