import { motion, AnimatePresence } from 'framer-motion';

export default function ProductDetails({ product, isOpen, onClose, onAddToCart }) {
    if (!product) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-4 md:inset-10 lg:inset-x-32 lg:inset-y-10 bg-white rounded-2xl shadow-2xl z-[90] flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-900">Product Details</h2>
                            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="flex flex-col md:flex-row gap-10">
                                {/* Image Section */}
                                <div className="w-full md:w-1/2 flex items-center justify-center bg-white border border-slate-200 rounded-2xl p-8">
                                    <img 
                                        src={product.image} 
                                        alt={product.title} 
                                        className="max-w-full max-h-[400px] object-contain"
                                    />
                                </div>

                                {/* Details Section */}
                                <div className="w-full md:w-1/2 flex flex-col">
                                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight">
                                        {product.title}
                                    </h1>
                                    
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="flex items-center gap-1 bg-yellow-100 px-3 py-1 rounded-full">
                                            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span className="text-sm font-bold text-yellow-700">{product.rating || '4.5'}</span>
                                        </div>
                                        <span className="text-sm text-slate-500">{product.reviews || '1,234'} reviews</span>
                                    </div>

                                    <div className="space-y-6 mb-8">
                                        {/* Amazon Price Block */}
                                        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                                    <span className="text-sky-600 font-bold text-xl">a</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500">Amazon</p>
                                                    <p className="text-xl font-bold text-slate-900">
                                                        {product.amazon_price ? `₹${product.amazon_price.toLocaleString('en-IN')}` : 'Unavailable'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {product.amazon_url && (
                                                    <a href={product.amazon_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                                                        View
                                                    </a>
                                                )}
                                                {product.amazon_price && (
                                                    <button onClick={() => onAddToCart(product, 'amazon')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors">
                                                        Add to Cart
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Flipkart Price Block */}
                                        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                                                    <span className="text-yellow-500 font-bold text-xl">f</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500">Flipkart</p>
                                                    <p className="text-xl font-bold text-slate-900">
                                                        {product.flipkart_price ? `₹${product.flipkart_price.toLocaleString('en-IN')}` : 'Unavailable'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {product.flipkart_url && (
                                                    <a href={product.flipkart_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                                                        View
                                                    </a>
                                                )}
                                                {product.flipkart_price && (
                                                    <button onClick={() => onAddToCart(product, 'flipkart')} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors">
                                                        Add to Cart
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-auto">
                                        <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider">Product Highlights</h3>
                                        <ul className="space-y-2 text-sm text-slate-600">
                                            <li className="flex items-start gap-2">
                                                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                Best price found: ₹{Math.min(product.amazon_price || Infinity, product.flipkart_price || Infinity).toLocaleString('en-IN')}
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                Available on {product.amazon_price && product.flipkart_price ? 'both platforms' : (product.amazon_price ? 'Amazon' : 'Flipkart')}
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
