import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = 'http://localhost:5002';

// Simple markdown renderer for bot messages
function renderMarkdown(text) {
    // Split by newlines, process each line
    return text.split('\n').map((line, i) => {
        // Process inline markdown: bold **text** or __text__
        const parts = [];
        let remaining = line;
        let key = 0;
        
        const boldRegex = /\*\*(.+?)\*\*|__(.+?)__/g;
        let match;
        let lastIndex = 0;
        
        while ((match = boldRegex.exec(remaining)) !== null) {
            // Text before the match
            if (match.index > lastIndex) {
                parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
            }
            // Bold text
            parts.push(<strong key={key++}>{match[1] || match[2]}</strong>);
            lastIndex = match.index + match[0].length;
        }
        
        // Remaining text after last match
        if (lastIndex < remaining.length) {
            parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
        }
        
        if (parts.length === 0) {
            parts.push(<span key={0}>{line}</span>);
        }
        
        return (
            <span key={i}>
                {parts}
                {i < text.split('\n').length - 1 && <br />}
            </span>
        );
    });
}

export default function Chatbot({ onSearch, products, aiModel, onViewDetails }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        {
            role: 'bot',
            text: "Hi there! I'm your eShopzz assistant.\n\nI can help you:\n• Find the best deals across platforms\n• Search for specific products\n• Compare prices\n\nHow can I help you today?",
            products: null
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const addBotMessage = (text, chatProducts = null) => {
        setMessages(prev => [...prev, { role: 'bot', text, products: chatProducts }]);
    };

    const handleSend = async () => {
        const userMsg = input.trim();
        if (!userMsg || isTyping) return;

        setMessages(prev => [...prev, { role: 'user', text: userMsg, products: null }]);
        setInput('');
        setIsTyping(true);

        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg,
                    current_products: products.slice(0, 20),
                    model: aiModel
                })
            });

            const data = await response.json();

            if (data.success) {
                if (data.action === 'search' && data.search_query) {
                    addBotMessage(data.reply);
                    onSearch(data.search_query);
                } else if (data.action === 'recommend' && data.recommended_products) {
                    addBotMessage(data.reply, data.recommended_products);
                } else {
                    addBotMessage(data.reply);
                }
            } else {
                addBotMessage("I'm sorry, I encountered an error processing your request.");
            }
        } catch (err) {
            console.error('Chat error:', err);
            addBotMessage("I'm having trouble connecting to the server right now. Please try again later.");
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Modern Chat Toggle */}
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95
                ${isOpen ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200' : 'bg-primary text-white hover:bg-primary-hover shadow-primary/30'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                {isOpen ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                )}
            </motion.button>

            {/* Modern Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-24 right-6 w-[380px] h-[600px] max-h-[80vh] bg-white rounded-2xl flex flex-col z-50 shadow-2xl overflow-hidden border border-slate-200"
                    >
                        {/* Header */}
                        <div className="bg-primary text-white p-4 flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-primary rounded-full"></span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-[15px] leading-tight">eShopzz Assistant</span>
                                <span className="text-xs text-primary-light">Typically replies instantly</span>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 no-scrollbar">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-3.5 max-w-[85%] rounded-2xl text-sm leading-relaxed shadow-sm
                                        ${msg.role === 'user'
                                            ? 'bg-primary text-white rounded-tr-sm'
                                            : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                                        }`}
                                    >
                                        <p className="whitespace-pre-line">
                                            {msg.role === 'bot' ? renderMarkdown(msg.text) : msg.text}
                                        </p>

                                        {/* Products Injection */}
                                        {msg.products && msg.products.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {msg.products.map((p, pidx) => (
                                                    <div 
                                                        key={pidx} 
                                                        onClick={() => onViewDetails && onViewDetails(p)}
                                                        className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex gap-3 hover:border-primary/40 hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                                    >
                                                        <div className="w-10 h-10 bg-white border border-slate-100 rounded flex-shrink-0 p-1 flex items-center justify-center">
                                                            <img src={p.image} alt="" className="max-w-full max-h-full object-contain" />
                                                        </div>
                                                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                                                            <div className="text-xs font-medium text-slate-900 truncate group-hover:text-primary transition-colors">{p.title}</div>
                                                            <div className="text-sm font-bold text-primary mt-0.5">
                                                                ₹{p.amazon_price?.toLocaleString('en-IN') || p.flipkart_price?.toLocaleString('en-IN') || '---'}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-[10px] text-slate-400 mt-1 mx-1`}>
                                        {msg.role === 'user' ? 'You' : 'Assistant'}
                                    </span>
                                </div>
                            ))}

                            {isTyping && (
                                <div className="flex flex-col items-start">
                                    <div className="p-3 bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm flex gap-1 items-center h-[42px]">
                                        <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
                                        <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
                                        <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-3">
                            {/* Suggested Prompts */}
                            {products.length > 0 && messages.length <= 2 && (
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => { setInput("What's the best deal?"); setTimeout(handleSend, 100); }}
                                        className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 transition-colors border border-slate-200">
                                        Find best deal
                                    </button>
                                    <button onClick={() => { setInput("What's the cheapest option?"); setTimeout(handleSend, 100); }}
                                        className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 transition-colors border border-slate-200">
                                        Find cheapest
                                    </button>
                                </div>
                            )}

                            <div className="flex items-end gap-2">
                                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl focus-within:border-primary focus-within:bg-white focus-within:ring-1 focus-within:ring-primary transition-all p-1">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type your message..."
                                        className="w-full bg-transparent outline-none text-slate-900 text-sm px-3 py-2 resize-none h-[40px] max-h-[120px] leading-relaxed placeholder-slate-400"
                                        disabled={isTyping}
                                        rows={1}
                                    />
                                </div>
                                <button
                                    onClick={handleSend}
                                    disabled={isTyping || !input.trim()}
                                    className="h-[48px] w-[48px] rounded-xl flex items-center justify-center bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex-shrink-0"
                                >
                                    <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
