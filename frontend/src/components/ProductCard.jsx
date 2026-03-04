export default function ProductCard({ product, isSelected, onToggleCompare, compareCount, onAddToCart, onViewDetails }) {
    const {
        id,
        title,
        image,
        rating,
        amazon_price,
        amazon_link,
        flipkart_price,
        flipkart_link
    } = product;

    const amazonIsLower = amazon_price && flipkart_price && amazon_price < flipkart_price;
    const flipkartIsLower = amazon_price && flipkart_price && flipkart_price < amazon_price;
    const samePrice = amazon_price && flipkart_price && amazon_price === flipkart_price;

    const formatPrice = (price) => {
        if (!price) return 'N/A';
        return price.toLocaleString('en-IN');
    };

    const getSavings = () => {
        if (!amazon_price || !flipkart_price) return null;
        const diff = Math.abs(amazon_price - flipkart_price);
        if (diff === 0) return null;
        return diff.toLocaleString('en-IN');
    };

    const canAdd = compareCount < 4;

    return (
        <div className={`group flex flex-col bg-white rounded-xl border transition-all duration-300 relative overflow-hidden cursor-pointer
            ${isSelected ? 'border-primary ring-1 ring-primary shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'}`}
            onClick={() => onViewDetails(product)}
        >
            {/* Top Badges & Compare */}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
                <div className="flex flex-col gap-1.5">
                    {rating && rating >= 4.5 && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            Top Rated
                        </span>
                    )}
                </div>

                {/* Compare Checkbox */}
                <label className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow-sm border cursor-pointer transition-colors
                    ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-400 hover:border-primary hover:text-primary'}
                    ${!isSelected && !canAdd ? 'opacity-50 cursor-not-allowed hidden' : ''}`}
                    title={isSelected ? "Remove from compare" : "Add to compare"}
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            onToggleCompare(product);
                        }}
                        disabled={!isSelected && !canAdd}
                        className="sr-only"
                    />
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {isSelected ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        )}
                    </svg>
                </label>
            </div>

            {/* Image Container */}
            <div className="relative p-6 bg-white flex justify-center items-center h-64 border-b border-slate-100">
                <div className="block w-full h-full relative p-2">
                    <img
                        src={image || 'https://via.placeholder.com/300?text=No+Image'}
                        alt={title}
                        className="w-full h-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/300?text=Image+Unavailable';
                        }}
                    />
                </div>
            </div>

            {/* Content Container */}
            <div className="p-5 flex flex-col flex-grow bg-white">
                {/* Product Title */}
                <h3 className="text-sm font-medium text-slate-900 leading-snug mb-2 line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
                    {title === "Unknown Product" ? "Product Details Unavailable" : title}
                </h3>

                {/* Reviews / Rating simple representation */}
                {rating && (
                    <div className="flex items-center gap-1 mb-4">
                        <div className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map(i => (
                                <svg key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'fill-current' : 'text-slate-200 fill-current'}`} viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                            ))}
                        </div>
                        <span className="text-xs text-slate-500 ml-1">{rating}</span>
                    </div>
                )}

                {/* Price Comparison Blocks */}
                <div className="mt-auto flex flex-col gap-2">
                    {/* Amazon ROW */}
                    <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${amazonIsLower ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Amazon</span>
                            {amazon_price ? (
                                <div className="flex items-start mt-0.5">
                                    <span className="text-xs font-semibold text-slate-700 mt-0.5 mr-0.5">₹</span>
                                    <span className={`font-bold ${amazonIsLower ? 'text-green-700 text-lg' : 'text-slate-900 text-base'}`}>
                                        {formatPrice(amazon_price)}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-sm text-slate-400 font-medium">Out of Stock</span>
                            )}
                        </div>
                        {amazon_link && (
                            <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); onAddToCart(product, 'amazon'); }} className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-sm bg-primary text-white hover:bg-primary-hover">
                                    Add
                                </button>
                                <a href={amazon_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-sm
                                    ${amazonIsLower ? 'bg-green-700 text-white hover:bg-green-800' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400'}`}>
                                    View
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Flipkart ROW */}
                    <div className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${flipkartIsLower ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Flipkart</span>
                            {flipkart_price ? (
                                <div className="flex items-start mt-0.5">
                                    <span className="text-xs font-semibold text-slate-700 mt-0.5 mr-0.5">₹</span>
                                    <span className={`font-bold ${flipkartIsLower ? 'text-green-700 text-lg' : 'text-slate-900 text-base'}`}>
                                        {formatPrice(flipkart_price)}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-sm text-slate-400 font-medium">Out of Stock</span>
                            )}
                        </div>
                        {flipkart_link && (
                            <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); onAddToCart(product, 'flipkart'); }} className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-sm bg-primary text-white hover:bg-primary-hover">
                                    Add
                                </button>
                                <a href={flipkart_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-sm
                                    ${flipkartIsLower ? 'bg-green-700 text-white hover:bg-green-800' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400'}`}>
                                    View
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Savings Notification */}
                    <div className="h-5 mt-1 flex items-center justify-center">
                        {getSavings() && !samePrice && (
                            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                Save ₹{getSavings()} on best deal
                            </span>
                        )}
                        {samePrice && (
                            <span className="text-xs font-medium text-slate-500">
                                Prices are matched
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
