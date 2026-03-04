import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ComparisonTable({ data, isLoading, onClose }) {
    const [highlightDiffs, setHighlightDiffs] = useState(true);

    if (!data && !isLoading) return null;

    const allKeys = [];
    const seenKeys = new Set();
    if (data) {
        const priorityKeys = ['Brand', 'Model', 'Model Name', 'Model Number', 'Colour', 'Color',
            'RAM', 'Storage', 'ROM', 'Display', 'Screen Size', 'Battery', 'Battery Capacity',
            'Processor', 'Operating System', 'OS', 'Camera', 'Weight', 'Warranty',
            'Key Features', 'Highlights', 'Description'];

        for (const key of priorityKeys) {
            for (const p of data) {
                if (p.specs[key] && !seenKeys.has(key)) {
                    allKeys.push(key);
                    seenKeys.add(key);
                }
            }
        }

        for (const p of data) {
            for (const key of Object.keys(p.specs)) {
                if (!seenKeys.has(key)) {
                    allKeys.push(key);
                    seenKeys.add(key);
                }
            }
        }
    }

    const formatPrice = (price) => {
        if (!price) return 'N/A';
        return price.toLocaleString('en-IN');
    };

    const getMinPrice = (p) => {
        const prices = [p.amazon_price, p.flipkart_price].filter(v => v != null);
        return prices.length > 0 ? Math.min(...prices) : null;
    };

    const valuesDiffer = (key) => {
        if (!data || data.length < 2) return false;
        const vals = data.map(p => (p.specs[key] || '').toLowerCase().trim()).filter(v => v && v !== '—');
        if (vals.length < 2) return false;
        return !vals.every(v => v === vals[0]);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-7xl max-h-full bg-white rounded-2xl flex flex-col relative overflow-hidden shadow-2xl border border-slate-200"
                >
                    {/* Header */}
                    <div className="bg-white border-b border-slate-200 p-4 md:p-6 flex justify-between items-center z-20 sticky top-0 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Product Comparison</h2>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {isLoading ? 'Analyzing product data...' : `Comparing ${data?.length || 0} products head-to-head`}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            {!isLoading && data && (
                                <label className="flex items-center gap-2.5 cursor-pointer group bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-primary/50 transition-colors">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={highlightDiffs}
                                            onChange={(e) => setHighlightDiffs(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-8 h-4 rounded-full transition-colors ${highlightDiffs ? 'bg-primary' : 'bg-slate-300'}`}></div>
                                        <motion.div
                                            className="absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full shadow-sm"
                                            animate={{ x: highlightDiffs ? 16 : 0 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 select-none">Highlight Differences</span>
                                </label>
                            )}
                            <button
                                onClick={onClose}
                                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex-1 flex flex-col items-center justify-center p-20 z-10 bg-slate-50/50">
                            <div className="relative w-16 h-16 mb-6">
                                <motion.div
                                    className="absolute inset-0 border-4 border-slate-200 border-t-primary rounded-full"
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Analyzing Specifications</h3>
                            <p className="text-slate-500 text-center max-w-sm">
                                Standardizing specs across different retailers. This usually takes about 15-30 seconds.
                            </p>
                        </div>
                    )}

                    {/* Data Grid */}
                    {!isLoading && data && data.length > 0 && (
                        <div className="flex-1 overflow-auto bg-slate-50 z-10 p-6 no-scrollbar">
                            <table className="w-full text-left border-collapse bg-white rounded-xl shadow-sm overflow-hidden ring-1 ring-slate-200">
                                <thead>
                                    <tr>
                                        <th className="p-4 border-b border-r border-slate-200 w-48 sticky left-0 bg-slate-50 z-20 top-0">
                                            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Specs</span>
                                        </th>
                                        {data.map((p, i) => (
                                            <th key={i} className="p-4 border-b border-slate-200 min-w-[280px] bg-white top-0 z-10">
                                                <div className="flex flex-col items-center text-center">
                                                    <div className="w-32 h-32 bg-white p-2 mb-3 flex items-center justify-center">
                                                        <img
                                                            src={p.image || 'https://via.placeholder.com/150'}
                                                            alt={p.title}
                                                            className="w-full h-full object-contain mix-blend-multiply"
                                                            onError={(e) => { e.target.src = 'https://via.placeholder.com/150'; }}
                                                        />
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug">{p.title}</p>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Best Price Row */}
                                    <tr>
                                        <td className="p-4 border-b border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                                            <span className="text-sm font-semibold text-slate-900">Best Price</span>
                                        </td>
                                        {data.map((p, i) => {
                                            const minP = getMinPrice(p);
                                            const allMins = data.map(getMinPrice).filter(v => v != null);
                                            const isLowest = minP != null && minP === Math.min(...allMins) && allMins.length > 1;
                                            return (
                                                <td key={i} className={`p-4 border-b border-slate-200 text-center ${isLowest ? 'bg-green-50' : 'bg-white'}`}>
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className={`text-3xl font-bold ${isLowest ? 'text-green-700' : 'text-slate-900'}`}>
                                                            <span className="text-xl mr-0.5">₹</span>{formatPrice(minP)}
                                                        </span>
                                                        {isLowest && <span className="text-[10px] font-bold bg-green-200 text-green-800 px-2 py-0.5 rounded mt-1 uppercase tracking-wide">Best Deal</span>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Amazon Row */}
                                    <tr>
                                        <td className="p-4 border-b border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-700">Amazon</span>
                                            </div>
                                        </td>
                                        {data.map((p, i) => (
                                            <td key={i} className="p-4 border-b border-slate-200 text-center bg-white">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="text-xl font-bold text-slate-800">₹{formatPrice(p.amazon_price)}</span>
                                                    {p.amazon_link && (
                                                        <a href={p.amazon_link} target="_blank" rel="noopener noreferrer"
                                                            className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-1.5 rounded-full transition-colors">
                                                            View on Amazon
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>

                                    {/* Flipkart Row */}
                                    <tr>
                                        <td className="p-4 border-b border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-700">Flipkart</span>
                                            </div>
                                        </td>
                                        {data.map((p, i) => (
                                            <td key={i} className="p-4 border-b border-slate-200 text-center bg-white">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="text-xl font-bold text-slate-800">₹{formatPrice(p.flipkart_price)}</span>
                                                    {p.flipkart_link && (
                                                        <a href={p.flipkart_link} target="_blank" rel="noopener noreferrer"
                                                            className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-1.5 rounded-full transition-colors">
                                                            View on Flipkart
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>

                                    {/* Rating Row */}
                                    <tr>
                                        <td className="p-4 border-b border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                                            <span className="text-sm font-medium text-slate-700">Rating</span>
                                        </td>
                                        {data.map((p, i) => {
                                            const allRatings = data.map(d => d.rating).filter(v => v != null);
                                            const isBest = p.rating != null && p.rating === Math.max(...allRatings) && allRatings.length > 1;
                                            return (
                                                <td key={i} className={`p-4 border-b border-slate-200 text-center bg-white`}>
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="flex items-center gap-1 text-amber-500 mb-1">
                                                            <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                                            <span className={`font-bold text-lg ${isBest ? 'text-slate-900' : 'text-slate-700'}`}>
                                                                {p.rating || 'N/A'}
                                                            </span>
                                                        </div>
                                                        {isBest && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wide">Top Rated</span>}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Detailed Specs loop */}
                                    {allKeys.map((key) => {
                                        const differs = highlightDiffs && valuesDiffer(key);
                                        return (
                                            <tr key={key} className="hover:bg-slate-50 transition-colors">
                                                <td className={`p-4 border-b border-r border-slate-200 sticky left-0 z-20 transition-colors
                                                    ${differs ? 'bg-primary/5 text-primary font-semibold' : 'bg-slate-50 text-slate-700 text-sm font-medium'}`}>
                                                    {key}
                                                </td>
                                                {data.map((p, i) => {
                                                    const val = p.specs[key] || '—';
                                                    return (
                                                        <td key={i} className={`p-4 border-b border-slate-200 text-center text-sm transition-colors
                                                            ${differs ? 'bg-primary/5 text-slate-900 font-medium' : 'bg-white text-slate-600'}
                                                            ${val === '—' ? 'text-slate-400 italic' : ''}`}>
                                                            {val}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}

                                    {allKeys.length === 0 && (
                                        <tr>
                                            <td colSpan={data.length + 1} className="text-center py-16 bg-white border-b border-slate-200">
                                                <div className="flex flex-col items-center">
                                                    <svg className="w-12 h-12 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <p className="text-lg font-semibold text-slate-900">Detailed specs unavailable</p>
                                                    <p className="text-slate-500 mt-1">We couldn't extract detailed specifications for these products.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
