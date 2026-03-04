"""
End-to-end test of the updated scrape_flipkart function.
"""
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

# Force reimport
import importlib
import scraper
importlib.reload(scraper)

from scraper import scrape_flipkart

print("Testing scrape_flipkart('lenovo', max_results=10)...")
results = scrape_flipkart("lenovo", max_results=10)
print(f"\nFound {len(results)} results:")
for i, r in enumerate(results):
    print(f"  {i+1}. {r['title'][:55]:55s} | Rs.{r['price']}")
    print(f"     Image: {str(r.get('image',''))[:50]}")
    print(f"     Link:  {str(r.get('link',''))[:50]}")
    print(f"     Rating: {r.get('rating')}")
    print()
