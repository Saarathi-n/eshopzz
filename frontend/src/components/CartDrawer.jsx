import { motion, AnimatePresence } from 'framer-motion';

export default function CartDrawer({ isOpen, onClose, cart, onUpdateQuantity, onRemoveItem }) {
    const calculateTotal = () => {
        return cart.reduce((total, item) => {
            const price = item.store === 'amazon' ? item.product.amazon_price : item.product.flipkart_price;
            return total + (price || 0) * item.quantity;
        }, 0);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Main Cart Page Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed inset-0 bg-white z-40 flex flex-col pt-20 overflow-y-auto"
                    >
                        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                                <div>
                                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                                        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        Shopping Cart
                                    </h2>
                                    <p className="text-slate-500 mt-1">Review your items before checking out</p>
                                </div>
                                <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all font-medium">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back to Shopping
                                </button>
                            </div>

                            <div className="flex flex-col lg:flex-row gap-8 flex-1 overflow-hidden">
                                {/* Cart Items */}
                                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                                    {cart.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 py-20">
                                            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-2xl font-bold text-slate-800">Your cart is empty</h3>
                                            <p className="text-slate-500 text-center max-w-[300px]">Looks like you haven't added any products to your cart yet.</p>
                                            <button onClick={onClose} className="mt-6 px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all shadow-md hover:shadow-lg scale-100 active:scale-95">
                                                Start Shopping
                                            </button>
                                        </div>
                                    ) : (
                                        cart.map((item, idx) => {
                                            const price = item.store === 'amazon' ? item.product.amazon_price : item.product.flipkart_price;
                                            const link = item.store === 'amazon' ? item.product.amazon_link : item.product.flipkart_link;
                                            return (
                                                <div key={`${item.product.title}-${item.store}-${idx}`} className="flex gap-6 bg-white border border-slate-100 rounded-2xl p-4 hover:border-primary/20 hover:shadow-sm transition-all group">
                                                    <div className="w-32 h-32 flex-shrink-0 bg-white border border-slate-100 rounded-xl p-3">
                                                        <img src={item.product.image} alt={item.product.title} className="w-full h-full object-contain mix-blend-multiply" />
                                                    </div>
                                                    <div className="flex-1 flex flex-col">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h3 className="text-lg font-semibold text-slate-900 line-clamp-2 mb-2 group-hover:text-primary transition-colors">{item.product.title}</h3>
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${item.store === 'amazon' ? 'bg-sky-100 text-sky-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                                        {item.store}
                                                                    </span>
                                                                    {link && (
                                                                        <a 
                                                                            href={link} 
                                                                            target="_blank" 
                                                                            rel="noopener noreferrer" 
                                                                            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                                                                        >
                                                                            View on {item.store}
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                            </svg>
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xl font-bold text-slate-900">₹{price?.toLocaleString('en-IN')}</div>
                                                                <div className="text-xs text-slate-400 mt-1">Inclusive of all taxes</div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between mt-auto pt-4">
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                                                    <button onClick={() => onUpdateQuantity(item.product.title, item.store, -1)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors">-</button>
                                                                    <span className="px-4 py-1.5 text-sm font-bold text-slate-700 border-x border-slate-200 min-w-[3rem] text-center bg-white">{item.quantity}</span>
                                                                    <button onClick={() => onUpdateQuantity(item.product.title, item.store, 1)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors">+</button>
                                                                </div>
                                                                <button onClick={() => onRemoveItem(item.product.title, item.store)} className="text-sm font-semibold text-red-500 hover:text-red-600 flex items-center gap-1.5 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Summary Sidebar */}
                                {cart.length > 0 && (
                                    <div className="w-full lg:w-80 flex-shrink-0">
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sticky top-0">
                                            <h3 className="text-lg font-bold text-slate-900 mb-6">Order Summary</h3>
                                            <div className="space-y-4 mb-6">
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
                                                    <span>₹{calculateTotal().toLocaleString('en-IN')}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Delivery</span>
                                                    <span className="text-green-600 font-medium">FREE</span>
                                                </div>
                                                <div className="border-t border-slate-200 pt-4 flex justify-between">
                                                    <span className="text-lg font-bold text-slate-900">Total</span>
                                                    <span className="text-2xl font-extrabold text-primary">₹{calculateTotal().toLocaleString('en-IN')}</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    cart.forEach(item => {
                                                        const link = item.store === 'amazon' ? item.product.amazon_link : item.product.flipkart_link;
                                                        if (link) window.open(link, '_blank');
                                                    });
                                                }}
                                                className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg hover:bg-primary-hover hover:shadow-xl transition-all active:scale-[0.98] mb-4"
                                            >
                                                Buy All
                                            </button>
                                            <p className="text-[10px] text-slate-400 text-center">
                                                By proceeding, you agree to our Terms of Service and Privacy Policy.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
