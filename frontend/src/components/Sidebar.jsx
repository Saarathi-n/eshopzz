import { useState } from 'react';
import { motion } from 'framer-motion';

export default function Sidebar({ filters, onFilterChange, isFallback }) {
    const categories = [
        'Electronics', 'Computers', 'Mobile Phones', 'Headphones', 'Footwear', 'Fashion', 'Home & Kitchen', 'Books', 'Sports'
    ];

    const priceRanges = [
        { label: 'Under ₹1,000', min: 0, max: 1000 },
        { label: '₹1,000 - ₹5,000', min: 1000, max: 5000 },
        { label: '₹5,000 - ₹10,000', min: 5000, max: 10000 },
        { label: '₹10,000 - ₹25,000', min: 10000, max: 25000 },
        { label: '₹25,000 - ₹50,000', min: 25000, max: 50000 },
        { label: 'Over ₹50,000', min: 50000, max: null }
    ];

    const handleCategoryChange = (category) => {
        onFilterChange({ ...filters, category });
    };

    const handlePriceChange = (range) => {
        const currentLabel = filters.priceRange?.label;
        if (currentLabel === range.label) {
            onFilterChange({ ...filters, priceRange: null });
        } else {
            onFilterChange({ ...filters, priceRange: range });
        }
    };

    const handleCustomPriceSubmit = (e) => {
        e.preventDefault();
        const min = parseInt(e.target.min.value) || 0;
        const max = parseInt(e.target.max.value) || null;
        
        if (min === 0 && max === null) return;

        const label = max ? `₹${min.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}` : `Over ₹${min.toLocaleString('en-IN')}`;
        
        onFilterChange({ 
            ...filters, 
            priceRange: { label, min, max } 
        });
    };

    const handleRatingChange = (rating) => {
        if (filters.minRating === rating) {
            onFilterChange({ ...filters, minRating: null });
        } else {
            onFilterChange({ ...filters, minRating: rating });
        }
    };

    return (
        <aside className="w-64 lg:w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overscroll-contain">

            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">

                {/* Fallback Warning - Modern Look */}
                {isFallback && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
                        <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <h4 className="text-sm font-semibold text-amber-800">Fallback Mode</h4>
                            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Displaying cached product data. Live scraping is currently unavailable.</p>
                        </div>
                    </div>
                )}

                {/* Categories */}
                <div className="hidden">
                    <h3 className="text-base font-bold text-slate-900 mb-3 tracking-tight">Department</h3>
                    <ul className="space-y-1">
                        <li>
                            <button
                                onClick={() => handleCategoryChange('All Categories')}
                                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2
                                    ${filters.category === 'All Categories' ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                                {filters.category === 'All Categories' && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                All Categories
                            </button>
                        </li>
                        {categories.map(cat => (
                            <li key={cat}>
                                <button
                                    onClick={() => handleCategoryChange(cat)}
                                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2
                                        ${filters.category === cat ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                >
                                    {filters.category === cat && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                    {cat}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Price Range */}
                <div>
                    <h3 className="text-base font-bold text-slate-900 mb-3 tracking-tight">Price</h3>
                    <div className="space-y-1.5">
                        {priceRanges.map((range, i) => {
                            const isSelected = filters.priceRange?.label === range.label;
                            return (
                                <div 
                                    key={i}
                                    onClick={() => handlePriceChange(range)}
                                    className={`cursor-pointer flex items-center p-2 -ml-2 rounded-md transition-all duration-200 ${
                                        isSelected 
                                        ? 'bg-blue-100 border border-blue-200 shadow-sm' 
                                        : 'hover:bg-slate-50 border border-transparent'}`}
                                >
                                    <span className={`text-sm ${isSelected ? 'font-bold text-blue-700' : 'text-slate-600'}`}>
                                        {range.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Custom Price Input */}
                    <form onSubmit={handleCustomPriceSubmit} className="mt-3 flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500 text-sm">₹</span>
                            <input 
                                type="number" 
                                name="min" 
                                placeholder="Min" 
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                        <span className="text-slate-400">-</span>
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500 text-sm">₹</span>
                            <input 
                                type="number" 
                                name="max" 
                                placeholder="Max" 
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                        <button 
                            type="submit" 
                            className="px-3 py-1 bg-white border border-slate-300 rounded text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Go
                        </button>
                    </form>
                </div>

                {/* Ratings */}
                <div>
                    <h3 className="text-base font-bold text-slate-900 mb-3 tracking-tight">Customer Reviews</h3>
                    <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => {
                            const isSelected = filters.minRating === rating;
                            return (
                                <div
                                    key={rating}
                                    onClick={() => handleRatingChange(rating)}
                                    className={`cursor-pointer flex items-center p-2 -ml-2 rounded-md transition-all duration-200 ${
                                        isSelected 
                                        ? 'bg-amber-100 border border-amber-200 shadow-sm' 
                                        : 'hover:bg-slate-50 border border-transparent'}`}
                                >
                                    <div className="flex gap-0.5 mr-2">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <svg
                                                key={i}
                                                className={`w-4 h-4 ${i <= rating ? 'text-amber-500 fill-current' : 'text-slate-200'}`}
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                            </svg>
                                        ))}
                                    </div>
                                    <span className={`text-sm ${isSelected ? 'font-bold text-amber-900' : 'text-slate-600'}`}>
                                        & Up
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Clear Filters Button */}
            <div className="p-4 border-t border-slate-200 bg-slate-50">
                <button
                    onClick={() => onFilterChange({ category: 'All Categories', priceRange: null, minRating: null })}
                    className="w-full py-2.5 px-4 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors focus:ring-2 focus:ring-primary/20 outline-none"
                >
                    Clear All Filters
                </button>
            </div>
        </aside>
    );
}
