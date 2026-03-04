import { motion } from 'framer-motion';
import ProductCard from './ProductCard';
import HomeDashboard from './HomeDashboard';

/**
 * ProductGrid Component — Modern Clean E-Commerce
 */
export default function ProductGrid({ products, isLoading, query, sortBy, onSortChange, compareList, onToggleCompare, onAddToCart, onViewDetails, recentlyViewed, cart, onSearch, onOpenCart, user }) {

    // Modern Skeleton Loader Card
    const SkeletonCard = ({ delay = 0 }) => (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay * 0.08, duration: 0.3 }}
            className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col h-[420px] shadow-sm"
        >
            {/* Image placeholder */}
            <div className="w-full h-48 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg mb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_1.5s_infinite]" style={{ animationDelay: `${delay * 0.15}s` }} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            </div>

            {/* Title placeholder */}
            <div className="space-y-2 mb-4">
                <div className="h-4 bg-slate-200 rounded-full w-[85%] animate-pulse" style={{ animationDelay: `${delay * 0.1}s` }} />
                <div className="h-4 bg-slate-100 rounded-full w-[60%] animate-pulse" style={{ animationDelay: `${delay * 0.1 + 0.1}s` }} />
            </div>

            {/* Rating placeholder */}
            <div className="flex items-center gap-2 mb-4">
                <div className="h-3 bg-slate-200 rounded-full w-20 animate-pulse" />
            </div>

            {/* Price placeholders */}
            <div className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded-full w-16 animate-pulse" />
                    <div className="h-5 bg-slate-200 rounded-full w-20 animate-pulse" />
                </div>
                <div className="space-y-2">
                    <div className="h-3 bg-slate-100 rounded-full w-16 animate-pulse" />
                    <div className="h-5 bg-slate-200 rounded-full w-20 animate-pulse" />
                </div>
            </div>
        </motion.div>
    );

    if (isLoading) {
        return (
            <div className="flex-1 bg-slate-50 min-h-screen">
                {/* Loading Header */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-[73px] z-20 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-8 h-8">
                            <motion.div
                                className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full"
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-semibold text-slate-800">Searching across stores...</span>
                            <span className="text-xs text-slate-400">Scanning Amazon & Flipkart for the best prices</span>
                        </div>
                    </div>
                </div>

                {/* Skeleton Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 px-6 py-6">
                    {[...Array(8)].map((_, idx) => (
                        <SkeletonCard key={idx} delay={idx} />
                    ))}
                </div>
            </div>
        );
    }

    if (!products || products.length === 0) {
        if (!query) {
            return (
                <HomeDashboard 
                    recentlyViewed={recentlyViewed} 
                    cart={cart} 
                    onAddToCart={onAddToCart} 
                    onViewDetails={onViewDetails} 
                    onToggleCompare={onToggleCompare} 
                    compareList={compareList} 
                    onSearch={onSearch}
                    onOpenCart={onOpenCart}
                    user={user}
                />
            );
        }

        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-[60vh]">
                <div className="text-center max-w-md p-12">
                    <div className="w-20 h-20 mx-auto mb-6 bg-slate-100 rounded-2xl flex items-center justify-center">
                        <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                        No results for "{query}"
                    </h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                        Try different keywords or check the spelling. We search across Amazon and Flipkart for you.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <main className="flex-1 bg-slate-50 relative min-h-screen">

            {/* Results Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-[73px] z-30 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        {query ? `Results for "${query}"` : "Recommended for you"}
                    </h1>
                    <span className="text-sm text-slate-500 font-medium mt-1">
                        {products.length} {products.length === 1 ? 'item' : 'items'} found
                    </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Sort by:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => onSortChange(e.target.value)}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-primary focus:border-primary block w-full p-2.5 outline-none shadow-sm cursor-pointer hover:border-slate-400 transition-colors"
                    >
                        <option value="relevance">Featured</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="rating">Avg. Customer Review</option>
                    </select>
                </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 px-6 py-6 pb-32">
                {products.map((product, index) => (
                    <ProductCard
                        key={product.id || index}
                        product={product}
                        isSelected={compareList.some(p => (p.id || p.title) === (product.id || product.title))}
                        onToggleCompare={onToggleCompare}
                        compareCount={compareList.length}
                        onAddToCart={onAddToCart}
                        onViewDetails={onViewDetails}
                    />
                ))}
            </div>
        </main>
    );
}
