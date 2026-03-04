import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar({ onSearch, isLoading, cartCount = 0, onCartClick, onHomeClick, user, onLoginClick, onLogout, savedAccounts = [], onSwitchAccount, onAddAccount, onDeleteAccount }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [scrolled, setScrolled] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [showRecent, setShowRecent] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState(null);

    // User-specific storage key
    const getSearchKey = () => `recentSearches_${user?.username || 'guest'}`;

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        
        // Load recent searches from local storage (per-account)
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
        
        // Listen for custom event to update recent searches from other components
        window.addEventListener('recentSearchesUpdated', loadRecentSearches);
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('recentSearchesUpdated', loadRecentSearches);
        };
    }, [user]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        
        // Save to recent searches (per-account)
        const updatedSearches = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
        setRecentSearches(updatedSearches);
        localStorage.setItem(getSearchKey(), JSON.stringify(updatedSearches));
        
        setShowRecent(false);
        onSearch(searchQuery);
    };

    const handleRecentClick = (query) => {
        setSearchQuery(query);
        setShowRecent(false);
        
        // Move to top of recent searches (per-account)
        const updatedSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
        setRecentSearches(updatedSearches);
        localStorage.setItem(getSearchKey(), JSON.stringify(updatedSearches));
        
        onSearch(query);
    };

    const clearRecentSearches = (e) => {
        e.stopPropagation();
        setRecentSearches([]);
        localStorage.removeItem(getSearchKey());
    };

    return (
        <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-md' : 'bg-surface border-b border-light'}`}>


            {/* Main Navbar */}
            <div className="flex items-center justify-between px-6 py-4 gap-8 max-w-screen-2xl mx-auto">

                {/* Logo Section */}
                <div className="flex-shrink-0 cursor-pointer flex items-center gap-2" onClick={onHomeClick}>
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-sm">
                        S
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xl font-bold tracking-tight text-slate-900 leading-tight">eShopzz</span>
                        <span className="text-[10px] uppercase font-semibold text-primary tracking-wider leading-none">Smart Aggregator</span>
                    </div>
                </div>

                {/* Search Bar - Modern Rounded Pill */}
                <form
                    onSubmit={handleSubmit}
                    className="flex-1 max-w-3xl relative group"
                >
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setShowRecent(true)}
                        onBlur={() => setTimeout(() => setShowRecent(false), 200)}
                        placeholder="Search for laptops, phones, electronics..."
                        className="w-full pl-12 pr-32 py-3 bg-slate-100 border border-transparent focus:bg-white focus:border-primary/30 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1)] rounded-full outline-none text-slate-900 transition-all text-sm sm:text-base placeholder-slate-400"
                        disabled={isLoading}
                    />

                    {/* Recent Searches Dropdown */}
                    <AnimatePresence>
                        {showRecent && recentSearches.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                            >
                                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Searches</span>
                                    <button 
                                        type="button"
                                        onClick={clearRecentSearches}
                                        className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <ul>
                                    {recentSearches.map((query, idx) => (
                                        <li key={idx}>
                                            <button
                                                type="button"
                                                onClick={() => handleRecentClick(query)}
                                                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                                            >
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="text-sm text-slate-700">{query}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`px-6 py-2 rounded-full font-medium text-sm transition-all
                            ${isLoading
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : 'bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow active:scale-95'}`}
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Searching</span>
                                </div>
                            ) : 'Search'}
                        </button>
                    </div>
                </form>

                {/* Right Section - Account & Cart */}
                <div className="flex items-center gap-6">

                    {/* User Profile */}
                    <div className="hidden lg:flex items-center gap-3 relative">
                        <div
                            onClick={(user || savedAccounts.length > 0) ? () => setShowUserMenu(!showUserMenu) : onLoginClick}
                            className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        >
                            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                {user ? (
                                    <span className="font-bold text-sm uppercase">{user.username.charAt(0)}</span>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                )}
                            </div>
                            <div className="flex flex-col">
                                {user ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-900 leading-none">{user.username}</span>
                                        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-500">Welcome,</span>
                                            <span className="text-sm font-semibold text-slate-900">Sign In</span>
                                        </div>
                                        {savedAccounts.length > 0 && (
                                            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* User Dropdown Menu */}
                        <AnimatePresence>
                            {showUserMenu && (user || savedAccounts.length > 0) && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute top-full right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50"
                                    onMouseLeave={() => setShowUserMenu(false)}
                                >
                                    {/* Current Account */}
                                    {user && (
                                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 text-sm">{user.username}</p>
                                                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span>
                                                        Active
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Other Saved Accounts */}
                                    {savedAccounts.filter(a => a.username !== user?.username).length > 0 && (
                                        <div className="border-b border-slate-100">
                                            <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch Account</p>
                                            {savedAccounts.filter(a => a.username !== user?.username).map((account, idx) => (
                                                <div key={idx} className="flex relative items-center w-full px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                                                    <button
                                                        onClick={() => {
                                                            setShowUserMenu(false);
                                                            onSwitchAccount(account);
                                                        }}
                                                        className="flex-1 flex items-center gap-3 text-left overflow-hidden"
                                                    >
                                                        <div className="w-8 h-8 flex-shrink-0 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-sm">
                                                            {account.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col truncate">
                                                            <span className="text-sm font-medium text-slate-700 truncate">{account.username}</span>
                                                            {!account.token && <span className="text-[10px] text-red-500 font-semibold leading-none mt-0.5">Logged out</span>}
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowUserMenu(false);
                                                            setAccountToDelete(account.username);
                                                        }}
                                                        className="ml-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all absolute right-4"
                                                        title="Remove Account"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                    <svg className="w-4 h-4 text-slate-300 group-hover:opacity-0 transition-opacity absolute right-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                    </svg>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="p-2">
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                onAddAccount();
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 rounded-lg transition-colors text-left"
                                        >
                                            <div className="w-8 h-8 bg-blue-50 border-2 border-dashed border-blue-300 rounded-full flex items-center justify-center">
                                                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </div>
                                            <span className="text-sm font-medium text-primary">{user ? 'Add Another Account' : 'Log in to another account'}</span>
                                        </button>
                                        {user && (
                                            <button
                                                onClick={() => {
                                                    setShowUserMenu(false);
                                                    setShowLogoutConfirm(true);
                                                }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 rounded-lg transition-colors text-left mt-1"
                                            >
                                                <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                    </svg>
                                                </div>
                                                <span className="text-sm font-medium text-red-600">Log Out</span>
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Logout Confirmation Modal */}
                    <AnimatePresence>
                        {showLogoutConfirm && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100]"
                                />
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-2xl shadow-2xl z-[101] overflow-hidden"
                                >
                                    <div className="p-6 text-center">
                                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-2">Log Out?</h3>
                                        <p className="text-sm text-slate-500 mb-6">
                                            Are you sure you want to log out of <span className="font-semibold text-slate-700">{user?.username}</span>? Your cart will be cleared.
                                        </p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setShowLogoutConfirm(false)}
                                                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98]"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowLogoutConfirm(false);
                                                    onLogout();
                                                }}
                                                className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
                                            >
                                                Log Out
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Delete Account Confirmation Modal */}
                    <AnimatePresence>
                        {accountToDelete && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setAccountToDelete(null)}
                                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100]"
                                />
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-2xl shadow-2xl z-[101] overflow-hidden"
                                >
                                    <div className="p-6 text-center">
                                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-2">Remove Account?</h3>
                                        <p className="text-sm text-slate-500 mb-6">
                                            Are you sure you want to remove <span className="font-semibold text-slate-700">{accountToDelete}</span> from this device?
                                        </p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setAccountToDelete(null)}
                                                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98]"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => {
                                                    onDeleteAccount(accountToDelete);
                                                    setAccountToDelete(null);
                                                }}
                                                className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Cart Tool */}
                    <div className="relative cursor-pointer group flex items-center p-2" onClick={onCartClick}>
                        <div className="relative">
                            <svg className="w-6 h-6 text-slate-700 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            {cartCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    {cartCount}
                                </span>
                            )}
                        </div>
                        <span className="ml-3 hidden sm:block text-sm font-medium text-slate-700 group-hover:text-primary transition-colors">Cart</span>
                    </div>
                </div>
            </div>
        </nav>
    );
}
