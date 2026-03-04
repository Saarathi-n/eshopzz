import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ProductCard from './ProductCard';

export default function HomeDashboard({ recentlyViewed, cart, onAddToCart, onViewDetails, onToggleCompare, compareList, onSearch, onOpenCart, user }) {
    const [recentSearches, setRecentSearches] = useState([]);
    const [viewAllSection, setViewAllSection] = useState(null); // 'cart', 'recent', 'ai'

    useEffect(() => {
        const loadRecentSearches = () => {
            const key = `recentSearches_${user?.username || 'guest'}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    setRecentSearches(JSON.parse(saved));
                } catch (e) {
                    console.error('Failed to parse recent searches', e);
                }
            } else {
                setRecentSearches([]);
            }
        };
        
        loadRecentSearches();
        window.addEventListener('recentSearchesUpdated', loadRecentSearches);
        return () => window.removeEventListener('recentSearchesUpdated', loadRecentSearches);
    }, [user]);

    // Mock AI similar items based on recently viewed
    // In a real app, this would be an API call to the backend
    const getSimilarItems = () => {
        if (!recentlyViewed || recentlyViewed.length === 0) return [];
        
        // Just returning the recently viewed items slightly shuffled as a mock for "similar items"
        // since we don't have a real AI endpoint for this yet.
        return [...recentlyViewed].reverse().map(item => ({
            ...item,
            id: item.id + '_similar',
            title: `Similar to: ${item.title}`,
            amazon_price: item.amazon_price ? item.amazon_price * 0.9 : null,
            flipkart_price: item.flipkart_price ? item.flipkart_price * 0.95 : null,
        }));
    };

    const similarItems = getSimilarItems();
    
    // Deduplicate cart products
    const cartProducts = Array.from(new Map(cart.map(item => [item.product.id, item.product])).values());

    const renderViewAllModal = () => {
        let title = '';
        let items = [];

        if (viewAllSection === 'cart') {
            title = 'Items in your Cart';
            items = cartProducts;
        } else if (viewAllSection === 'recent') {
            title = 'Recently Viewed';
            items = recentlyViewed;
        } else if (viewAllSection === 'ai') {
            title = 'AI Recommendations';
            items = similarItems;
        }

        return createPortal(
            <AnimatePresence>
                {viewAllSection && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-10" 
                        onClick={() => setViewAllSection(null)}
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden" 
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                                <button onClick={() => setViewAllSection(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                    {items.map((product, index) => (
                                        <ProductCard
                                            key={`modal-${product.id || index}`}
                                            product={product}
                                            isSelected={compareList.some(p => (p.id || p.title) === (product.id || product.title))}
                                            onToggleCompare={onToggleCompare}
                                            compareCount={compareList.length}
                                            onAddToCart={onAddToCart}
                                            onViewDetails={onViewDetails}
                                        />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        );
    };

    return (
        <div className="flex-1 bg-slate-50 min-h-screen p-6 md:p-10 space-y-12">
            {renderViewAllModal()}
            
            {/* Welcome Header */}
            <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Welcome back to eShopzz</h1>
                    <p className="text-slate-500">Your smart AI-powered shopping assistant. Search for any product to compare prices across Amazon and Flipkart instantly.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-semibold flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        AI Powered
                    </div>
                </div>
            </div>

            {/* Recent Searches */}
            {recentSearches.length > 0 && (
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Your Recent Searches
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {recentSearches.map((query, idx) => (
                            <button
                                key={idx}
                                onClick={() => onSearch(query)}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-medium text-slate-700 hover:border-primary hover:text-primary transition-colors shadow-sm"
                            >
                                {query}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Cart Dashboard */}
                {cartProducts.length > 0 && (
                    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                Items in your Cart
                            </h2>
                            <div className="flex items-center gap-4">
                                <button onClick={onOpenCart} className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
                                    View Cart
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </button>
                                {cartProducts.length > 2 && (
                                    <button onClick={() => setViewAllSection('cart')} className="text-sm font-semibold text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                                        View All
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {cartProducts.slice(0, 2).map((product, index) => (
                                <ProductCard
                                    key={`cart-${product.id || index}`}
                                    product={product}
                                    isSelected={compareList.some(p => (p.id || p.title) === (product.id || product.title))}
                                    onToggleCompare={onToggleCompare}
                                    compareCount={compareList.length}
                                    onAddToCart={onAddToCart}
                                    onViewDetails={onViewDetails}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Recently Viewed */}
                {recentlyViewed.length > 0 && (
                    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Recently Viewed
                            </h2>
                            {recentlyViewed.length > 2 && (
                                <button onClick={() => setViewAllSection('recent')} className="text-sm font-semibold text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                                    View All
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {recentlyViewed.slice(0, 2).map((product, index) => (
                                <ProductCard
                                    key={`recent-${product.id || index}`}
                                    product={product}
                                    isSelected={compareList.some(p => (p.id || p.title) === (product.id || product.title))}
                                    onToggleCompare={onToggleCompare}
                                    compareCount={compareList.length}
                                    onAddToCart={onAddToCart}
                                    onViewDetails={onViewDetails}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {/* AI Recommendations */}
            {similarItems.length > 0 && (
                <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            AI Recommendations Based on Your History
                        </h2>
                        {similarItems.length > 4 && (
                            <button onClick={() => setViewAllSection('ai')} className="text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1">
                                View All
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {similarItems.slice(0, 4).map((product, index) => (
                            <ProductCard
                                key={`similar-${product.id || index}`}
                                product={product}
                                isSelected={compareList.some(p => (p.id || p.title) === (product.id || product.title))}
                                onToggleCompare={onToggleCompare}
                                compareCount={compareList.length}
                                onAddToCart={onAddToCart}
                                onViewDetails={onViewDetails}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Empty State if nothing to show */}
            {cartProducts.length === 0 && recentlyViewed.length === 0 && recentSearches.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <button 
                        onClick={() => document.querySelector('input[type="text"]').focus()}
                        className="group flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95"
                    >
                        <div className="w-24 h-24 bg-slate-100 group-hover:bg-primary/10 rounded-full flex items-center justify-center mb-6 transition-colors shadow-sm group-hover:shadow-md">
                            <svg className="w-12 h-12 text-slate-300 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 group-hover:text-primary mb-2 transition-colors">Start your search</h3>
                    </button>
                    <p className="text-slate-500 max-w-md mt-2">Type a product name in the search bar above to compare prices across Amazon and Flipkart. Your recently viewed items and AI recommendations will appear here.</p>
                </div>
            )}
        </div>
    );
}
