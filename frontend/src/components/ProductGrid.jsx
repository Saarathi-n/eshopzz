import ProductCard from './ProductCard';

/**
 * ProductGrid Component
 * Responsive grid layout for displaying product cards
 */
export default function ProductGrid({ products, isLoading, query, sortBy, onSortChange }) {
    // Skeleton loader for loading state
    const SkeletonCard = () => (
        <div className="bg-white rounded-sm border border-gray-200 p-4 animate-pulse">
            <div className="w-full h-48 bg-gray-200 rounded mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-3 bg-gray-200 rounded w-24 mb-4"></div>
            <div className="border border-gray-200 rounded p-2">
                <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded mb-2"></div>
                <div className="h-6 bg-gray-200 rounded"></div>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex-1">
                {/* Results Header */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
                        <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
                    </div>
                </div>

                {/* Skeleton Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4">
                    {[...Array(8)].map((_, idx) => (
                        <SkeletonCard key={idx} />
                    ))}
                </div>
            </div>
        );
    }

    if (!products || products.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white rounded-sm border border-gray-200 m-4 p-16">
                <div className="text-center">
                    <svg className="w-24 h-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-amazon-text mb-2">
                        {query ? `No results for "${query}"` : 'Search for products'}
                    </h3>
                    <p className="text-gray-500 text-sm">
                        {query
                            ? 'Try checking your spelling or using different keywords.'
                            : 'Enter a product name to compare prices across Amazon and Flipkart.'
                        }
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1">
            {/* Results Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 mb-4 flex items-center justify-between sticky top-[108px] z-10">
                <div>
                    <span className="text-sm text-gray-600">
                        {query && <span>Results for <span className="text-amazon-orange font-medium">"{query}"</span></span>}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                        ({products.length} {products.length === 1 ? 'product' : 'products'})
                    </span>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Sort by:</span>
                    <select 
                        value={sortBy}
                        onChange={(e) => onSortChange(e.target.value)}
                        className="border border-gray-300 rounded text-sm px-2 py-1 bg-gray-50 cursor-pointer hover:bg-gray-100 outline-none"
                    >
                        <option value="relevance">Featured</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="rating">Avg. Customer Review</option>
                    </select>
                </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4 pb-8">
                {products.map((product, index) => (
                    <ProductCard key={product.id || index} product={product} />
                ))}
            </div>
        </div>
    );
}
