import { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProductGrid from './components/ProductGrid';
import Chatbot from './components/Chatbot';
import SettingsPanel from './components/SettingsPanel';
import ComparisonTable from './components/ComparisonTable';
import CartDrawer from './components/CartDrawer';
import ProductDetails from './components/ProductDetails';
import AuthModal from './components/AuthModal';
import './App.css';

// API Configuration
const API_BASE_URL = 'http://localhost:5002';

/**
 * eShopzz - E-Commerce Price Aggregator
 * Main application component that replicates Amazon UI
 * while showing price comparisons from Amazon and Flipkart
 */
function App() {
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isFallback, setIsFallback] = useState(false);
    const [sortBy, setSortBy] = useState('relevance');
    const [useNvidia, setUseNvidia] = useState(true);
    const [aiModel, setAiModel] = useState('moonshotai/kimi-k2-instruct-0905');
    const [compareList, setCompareList] = useState([]);
    
    // Auth State
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authInitialUsername, setAuthInitialUsername] = useState('');
    const [savedAccounts, setSavedAccounts] = useState(() => {
        try {
            const saved = localStorage.getItem('savedAccounts');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });

    // Initial auth check
    useEffect(() => {
        if (token) {
            fetch(`${API_BASE_URL}/api/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.username) {
                    setUser(data);
                    syncCartWithBackend(token);
                } else {
                    handleLogout();
                }
            })
            .catch(() => handleLogout());
        }
    }, [token]);

    const handleAuthSuccess = (data) => {
        setToken(data.access_token);
        setUser({ username: data.username, id: data.user_id });
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', data.username);
        syncCartWithBackend(data.access_token);

        // Save account to saved accounts list
        setSavedAccounts(prev => {
            const exists = prev.some(a => a.username === data.username);
            const updated = exists
                ? prev.map(a => a.username === data.username ? { ...a, token: data.access_token } : a)
                : [...prev, { username: data.username, token: data.access_token }];
            localStorage.setItem('savedAccounts', JSON.stringify(updated));
            return updated;
        });
    };

    const handleLogout = () => {
        // Tag account as logged out in saved accounts instead of removing it
        setSavedAccounts(prev => {
            const updated = prev.map(a => a.username === user?.username ? { ...a, token: null } : a);
            localStorage.setItem('savedAccounts', JSON.stringify(updated));
            return updated;
        });
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setCart([]); // Clear cart locally on logout
    };

    const handleSwitchAccount = async (account) => {
        // If it's tagged as logged out, prompt for password
        if (!account.token) {
            setAuthInitialUsername(account.username);
            setIsAuthModalOpen(true);
            return;
        }

        try {
            // Validate the saved token is still valid
            const res = await fetch(`${API_BASE_URL}/api/me`, {
                headers: { 'Authorization': `Bearer ${account.token}` }
            });
            const data = await res.json();
            if (data.username) {
                setToken(account.token);
                setUser({ username: data.username, id: data.id });
                localStorage.setItem('token', account.token);
                localStorage.setItem('username', data.username);
                syncCartWithBackend(account.token);
            } else {
                // Token expired — Tag as logged out and ask to re-login
                setSavedAccounts(prev => {
                    const updated = prev.map(a => a.username === account.username ? { ...a, token: null } : a);
                    localStorage.setItem('savedAccounts', JSON.stringify(updated));
                    return updated;
                });
                setAuthInitialUsername(account.username);
                setIsAuthModalOpen(true);
            }
        } catch {
            setSavedAccounts(prev => {
                const updated = prev.map(a => a.username === account.username ? { ...a, token: null } : a);
                localStorage.setItem('savedAccounts', JSON.stringify(updated));
                return updated;
            });
            setAuthInitialUsername(account.username);
            setIsAuthModalOpen(true);
        }
    };

    const handleAddAccount = () => {
        setAuthInitialUsername('');
        setIsAuthModalOpen(true);
    };

    const handleDeleteAccount = (usernameToDelete) => {
        setSavedAccounts(prev => {
            const updated = prev.filter(a => a.username !== usernameToDelete);
            localStorage.setItem('savedAccounts', JSON.stringify(updated));
            return updated;
        });
    };

    const syncCartWithBackend = async (authToken) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/cart`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setCart(data);
            }
        } catch (err) {
            console.error("Cart sync failed:", err);
        }
    };

    const [cart, setCart] = useState(() => {
        try {
            const saved = localStorage.getItem('cart');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
    // Helper to get user-specific storage key
    const getUserKey = (base) => {
        const username = user?.username || 'guest';
        return `${base}_${username}`;
    };

    const [recentlyViewed, setRecentlyViewed] = useState([]);

    // Reload recentlyViewed when user changes
    useEffect(() => {
        try {
            const key = `recentlyViewed_${user?.username || 'guest'}`;
            const saved = localStorage.getItem(key);
            setRecentlyViewed(saved ? JSON.parse(saved) : []);
        } catch (e) { setRecentlyViewed([]); }
    }, [user]);
    const [comparisonData, setComparisonData] = useState(null);
    const [isComparing, setIsComparing] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [filters, setFilters] = useState({
        category: 'All Categories',
        priceRange: null,
        minRating: null
    });

    // Apply filters to products
    const applyFilters = useCallback((productList, currentFilters) => {
        let result = [...productList];

        // Price range filter
        if (currentFilters.priceRange) {
            result = result.filter(p => {
                const price = p.amazon_price || p.flipkart_price;
                if (!price) return false;
                
                if (currentFilters.priceRange.max === null) {
                    return price >= currentFilters.priceRange.min;
                }
                return price >= currentFilters.priceRange.min && price <= currentFilters.priceRange.max;
            });
        }

        // Rating filter
        if (currentFilters.minRating) {
            result = result.filter(p => p.rating >= currentFilters.minRating);
        }

        return result;
    }, []);

    // Update filtered products when filters or products change
    useEffect(() => {
        let result = applyFilters(products, filters);

        // Apply Sorting
        const getMinPrice = (p) => {
            const prices = [p.amazon_price, p.flipkart_price].filter(p => p !== null);
            return prices.length > 0 ? Math.min(...prices) : Infinity;
        };

        result.sort((a, b) => {
            // Primary Sort: Prioritize products with comparisons (matches)
            const aHasMatch = a.amazon_price && a.flipkart_price;
            const bHasMatch = b.amazon_price && b.flipkart_price;

            if (aHasMatch && !bHasMatch) return -1;
            if (!aHasMatch && bHasMatch) return 1;

            // Secondary Sort: Based on selected criteria
            if (sortBy === 'price_asc') {
                return getMinPrice(a) - getMinPrice(b);
            } else if (sortBy === 'price_desc') {
                return getMinPrice(b) - getMinPrice(a);
            } else if (sortBy === 'rating') {
                return (b.rating || 0) - (a.rating || 0);
            } else {
                // Default Relevance: use original ID as tie-breaker
                return a.id - b.id;
            }
        });

        setFilteredProducts(result);
    }, [products, filters, applyFilters, sortBy]);

    // Persist cart and recently viewed to local storage
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart));
    }, [cart]);

    useEffect(() => {
        const key = `recentlyViewed_${user?.username || 'guest'}`;
        localStorage.setItem(key, JSON.stringify(recentlyViewed));
    }, [recentlyViewed, user]);

    // Helper to add to recent searches (per-account)
    const addToRecentSearches = (query) => {
        if (!query || typeof query !== 'string') return;
        const key = `recentSearches_${user?.username || 'guest'}`;
        const saved = localStorage.getItem(key);
        let recent = saved ? JSON.parse(saved) : [];
        recent = [query, ...recent.filter(s => s !== query)].slice(0, 5);
        localStorage.setItem(key, JSON.stringify(recent));
        // Dispatch a custom event so Navbar/HomeDashboard can update their state
        window.dispatchEvent(new Event('recentSearchesUpdated'));
    };

    // Search products from API
    const handleSearch = async (query) => {
        setSearchQuery(query);
        setIsLoading(true);
        setError(null);
        setIsCartOpen(false); // Close cart view when searching for new products
        
        // Reset filters and sorting for new search
        setFilters({
            category: 'All Categories',
            priceRange: null,
            minRating: null
        });
        setSortBy('relevance');
        
        addToRecentSearches(query);

        try {
            // Try live scraping first (may take 15-30 seconds)
            const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&use_nvidia=${useNvidia}&model=${encodeURIComponent(aiModel)}`);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                setProducts(data.products || []);
                setIsFallback(data.is_fallback || false);
            } else {
                throw new Error(data.error || 'Search failed');
            }
        } catch (err) {
            console.error('Live scraping failed, trying fallback:', err);

            // Fallback to mock data
            try {
                const fallbackResponse = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&mock=1`);
                const fallbackData = await fallbackResponse.json();

                if (fallbackData.success) {
                    setProducts(fallbackData.products || []);
                    setIsFallback(true);
                    setError(null); // Clear error since fallback worked
                } else {
                    throw new Error('Fallback also failed');
                }
            } catch (fallbackErr) {
                console.error('Fallback failed:', fallbackErr);
                setError('Could not fetch products. Please try again.');
                setProducts([]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Handle filter changes
    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

    // Toggle a product in compare list
    const handleToggleCompare = (product) => {
        setCompareList(prev => {
            const key = product.id || product.title;
            const exists = prev.some(p => (p.id || p.title) === key);
            if (exists) {
                return prev.filter(p => (p.id || p.title) !== key);
            }
            if (prev.length >= 4) return prev;
            return [...prev, product];
        });
    };

    // Start comparison — calls backend
    const startComparison = async () => {
        if (compareList.length < 2) return;
        setIsComparing(true);
        setShowComparison(true);
        setComparisonData(null);

        try {
            const response = await fetch(`${API_BASE_URL}/compare-details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: compareList })
            });
            const data = await response.json();
            if (data.success) {
                setComparisonData(data.comparison);
            } else {
                console.error('Comparison failed:', data.error);
            }
        } catch (err) {
            console.error('Comparison error:', err);
        } finally {
            setIsComparing(false);
        }
    };

    // Close comparison overlay
    const closeComparison = () => {
        setShowComparison(false);
        setComparisonData(null);
    };

    // Clear compare list
    const clearCompareList = () => {
        setCompareList([]);
    };

    // Add to cart
    const handleAddToCart = async (product, store) => {
        // Local state update for immediate feedback
        setCart(prev => {
            const existing = prev.find(item => item.product.title === product.title && item.store === store);
            if (existing) {
                return prev.map(item => 
                    item.product.title === product.title && item.store === store 
                        ? { ...item, quantity: item.quantity + 1 } 
                        : item
                );
            }
            return [...prev, { product, store, quantity: 1 }];
        });
        
        // Backend persistent sync if logged in
        if (token) {
            try {
                await fetch(`${API_BASE_URL}/api/cart`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ product, store, delta: 1 })
                });
            } catch (err) { console.error("Sync to backend failed:", err); }
        }

        // Also add the product title to recent searches
        if (product.title) {
            const shortTitle = product.title.split(' ').slice(0, 4).join(' ');
            addToRecentSearches(shortTitle);
        }
    };

    // Update cart item quantity
    const updateCartItemQuantity = async (productId, store, delta) => {
        setCart(prev => prev.map(item => {
            if (item.product.title === productId && item.store === store) {
                const newQuantity = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQuantity };
            }
            return item;
        }));

        if (token) {
            try {
                const item = cart.find(i => i.product.title === productId && i.store === store);
                if (item) {
                    await fetch(`${API_BASE_URL}/api/cart`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ product: item.product, store, delta })
                    });
                }
            } catch (err) { console.error("Sync update failed:", err); }
        }
    };

    // Remove item from cart
    const removeCartItem = async (productId, store) => {
        setCart(prev => prev.filter(item => !(item.product.title === productId && item.store === store)));

        if (token) {
            try {
                await fetch(`${API_BASE_URL}/api/cart/remove`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ product_id: productId, store })
                });
            } catch (err) { console.error("Remove sync failed:", err); }
        }
    };

    // Open product details
    const handleViewDetails = (product) => {
        setSelectedProduct(product);
        setIsProductDetailsOpen(true);
        
        // Add to recently viewed
        setRecentlyViewed(prev => {
            const filtered = prev.filter(p => p.id !== product.id);
            return [product, ...filtered].slice(0, 10); // Keep last 10
        });
        
        // Also add the product title to recent searches
        if (product.title) {
            // Extract a shorter, more generic search term from the title
            const shortTitle = product.title.split(' ').slice(0, 4).join(' ');
            addToRecentSearches(shortTitle);
        }
    };

    // Navigate to home
    const handleGoHome = () => {
        setSearchQuery('');
        setProducts([]);
        setFilteredProducts([]);
        setIsCartOpen(false); // Close cart when going home
    };

    return (
        <div className="min-h-screen bg-background text-slate-900 font-sans selection:bg-primary/20 selection:text-primary">
            {/* Navbar */}
            <Navbar 
                onSearch={handleSearch} 
                isLoading={isLoading} 
                cartCount={cart.reduce((acc, item) => acc + item.quantity, 0)} 
                onCartClick={() => setIsCartOpen(true)}
                onHomeClick={handleGoHome}
                user={user}
                onLoginClick={() => setIsAuthModalOpen(true)}
                onLogout={handleLogout}
                savedAccounts={savedAccounts}
                onSwitchAccount={handleSwitchAccount}
                onAddAccount={handleAddAccount}
                onDeleteAccount={handleDeleteAccount}
            />

            {/* Auth Modal */}
            <AuthModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                onAuthSuccess={handleAuthSuccess}
                initialUsername={authInitialUsername}
            />

            {/* Fallback Banner */}
            {isFallback && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm font-medium text-amber-800">
                        Live routing unavailable. Displaying cached results.
                    </span>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-red-800">
                        {error}
                    </span>
                </div>
            )}

            {/* Main Content */}
            <div className="flex">
                {/* Sidebar */}
                <Sidebar filters={filters} onFilterChange={handleFilterChange} isFallback={isFallback} />

                {/* Product Grid */}
                <ProductGrid
                    products={filteredProducts}
                    isLoading={isLoading}
                    query={searchQuery}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    compareList={compareList}
                    onToggleCompare={handleToggleCompare}
                    onAddToCart={handleAddToCart}
                    onViewDetails={handleViewDetails}
                    recentlyViewed={recentlyViewed}
                    cart={cart}
                    onSearch={handleSearch}
                    onOpenCart={() => setIsCartOpen(true)}
                    user={user}
                />
            </div>

            {/* Cart Drawer */}
            <CartDrawer 
                isOpen={isCartOpen} 
                onClose={() => setIsCartOpen(false)} 
                cart={cart} 
                onUpdateQuantity={updateCartItemQuantity} 
                onRemoveItem={removeCartItem} 
            />

            {/* Product Details Modal */}
            <ProductDetails 
                product={selectedProduct} 
                isOpen={isProductDetailsOpen} 
                onClose={() => setIsProductDetailsOpen(false)} 
                onAddToCart={handleAddToCart} 
            />

            {/* Chatbot */}
            <Chatbot onSearch={handleSearch} products={filteredProducts} aiModel={aiModel} onViewDetails={handleViewDetails} />

            {/* Settings Panel */}
            <SettingsPanel useNvidia={useNvidia} setUseNvidia={setUseNvidia} aiModel={aiModel} setAiModel={setAiModel} />

            {/* Floating Compare Bar */}
            {compareList.length > 0 && !showComparison && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40 transform transition-transform">
                    <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="font-bold text-lg text-slate-900 leading-tight">Compare<br />Products</span>
                                <span className="text-sm text-primary font-medium">{compareList.length} Selected</span>
                            </div>

                            <div className="flex gap-3">
                                {compareList.map((p, i) => (
                                    <div key={i} className="relative group cursor-pointer w-16 h-16 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary transition-colors">
                                        <img
                                            src={p.image || 'https://via.placeholder.com/64'}
                                            alt={p.title}
                                            className="w-full h-full object-contain p-2 rounded-lg"
                                            onClick={() => handleToggleCompare(p)}
                                            title={`Remove ${p.title}`}
                                        />
                                        <div className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity border border-slate-200">
                                            <svg className="w-4 h-4 text-slate-500 hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </div>
                                    </div>
                                ))}
                                {/* Empty Placeholders */}
                                {Array.from({ length: Math.max(0, 4 - compareList.length) }).map((_, i) => (
                                    <div key={`empty-${i}`} className="w-16 h-16 border border-dashed border-slate-300 rounded-lg bg-slate-50 flex items-center justify-center">
                                        <span className="text-xs text-slate-400 font-medium">Add</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 items-center">
                            <button className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors" onClick={clearCompareList}>
                                Clear all
                            </button>
                            <button
                                className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all shadow-sm ${compareList.length < 2 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-hover hover:shadow-md'}`}
                                onClick={startComparison}
                                disabled={compareList.length < 2}
                            >
                                Start Comparison
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comparison Overlay */}
            {showComparison && (
                <ComparisonTable
                    data={comparisonData}
                    isLoading={isComparing}
                    onClose={closeComparison}
                />
            )}

            {/* Modern E-Commerce Footer */}
            <footer className="bg-slate-900 text-slate-300 py-12 mt-12">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                        <div>
                            <h4 className="text-white font-semibold mb-4">Get to Know Us</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Press Releases</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-4">Connect with Us</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">Facebook</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-4">Make Money with Us</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">Sell on eShopzz</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Affiliate Program</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Fulfillment</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-semibold mb-4">Let Us Help You</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">Your Account</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Returns Centre</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">100% Purchase Protection</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Help</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between">
                        <div className="flex items-center gap-2 mb-4 md:mb-0">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
                                S
                            </div>
                            <span className="text-xl font-bold tracking-tight text-white">eShopzz</span>
                        </div>
                        <div className="text-sm">
                            &copy; 2026 eShopzz. All rights reserved. Not a real store.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App;
