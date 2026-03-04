import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_MODELS = [
    { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi-K2', provider: 'Moonshot AI', desc: 'High accuracy product matching' },
];

export default function SettingsPanel({ useNvidia, setUseNvidia, aiModel, setAiModel }) {
    const [isOpen, setIsOpen] = useState(false);
    const [showModelList, setShowModelList] = useState(false);
    const [aiModels, setAiModels] = useState(DEFAULT_MODELS);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    useEffect(() => {
        const fetchModels = async () => {
            setIsLoadingModels(true);
            try {
                const response = await fetch('http://localhost:5002/api/models');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        setAiModels(data);
                        // If current selected model is not in the fetched list, update it to the first available model
                        setAiModel(current => {
                            if (!data.find(m => m.id === current)) {
                                return data[0].id;
                            }
                            return current;
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to fetch AI models:", error);
            } finally {
                setIsLoadingModels(false);
            }
        };

        fetchModels();
    }, [setAiModel]);

    const currentModel = aiModels.find(m => m.id === aiModel) || aiModels[0];

    return (
        <>
            {/* Modern Settings Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 left-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-105 active:scale-95 border
                ${isOpen ? 'bg-slate-100 text-slate-700 border-slate-300 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:text-primary hover:border-primary/30'}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Settings"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </motion.button>

            {/* Modern Settings Window (Centered Modal) */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setIsOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-white rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh]"
                        >
                            {/* Settings Header */}
                            <div className="bg-slate-50 border-b border-slate-200 p-5 flex justify-between items-center flex-shrink-0">
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight">System Settings</h3>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content Area */}
                            <div className="p-6 flex flex-col gap-6 overflow-y-auto">

                                {/* AI Control Module */}
                                <div className={`p-5 rounded-xl border transition-all duration-300 relative bg-white ${useNvidia ? 'border-primary shadow-sm shadow-primary/10' : 'border-slate-200 shadow-sm'}`}>
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex flex-col">
                                            <span className={`text-base font-bold ${useNvidia ? 'text-primary' : 'text-slate-800'}`}>
                                                Cloud AI Routing
                                            </span>
                                            <span className="text-xs font-medium text-slate-500 mt-0.5">
                                                {currentModel.name} — {currentModel.provider}
                                            </span>
                                        </div>

                                        {/* Modern Toggle Switch */}
                                        <button
                                            onClick={() => setUseNvidia(!useNvidia)}
                                            className={`w-12 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${useNvidia ? 'bg-primary' : 'bg-slate-300'}`}
                                        >
                                            <motion.div
                                                className="absolute top-1 bottom-1 w-4 h-4 bg-white rounded-full shadow-sm"
                                                animate={{ x: useNvidia ? 26 : 4 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                            />
                                        </button>
                                    </div>

                                    {/* Status Dashboard */}
                                    <div className={`p-3 rounded-lg flex items-start gap-3 transition-colors ${useNvidia ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50 border border-slate-100'}`}>
                                        {useNvidia ? (
                                            <>
                                                <div className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-blue-900 leading-snug">
                                                        <strong className="block mb-1 text-primary">Connected to Cloud AI</strong>
                                                        Routing through <strong>{currentModel.name}</strong> for higher accuracy.
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="mt-0.5 w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-slate-600 leading-snug">
                                                        <strong className="block mb-1 text-slate-800">Using Local Fallback</strong>
                                                        Falling back to standard localized sentence-transformer models.
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* AI Model Selector */}
                                {useNvidia && (
                                    <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex flex-col">
                                                <span className="text-base font-bold text-slate-800">AI Model</span>
                                                <span className="text-xs text-slate-500 mt-0.5">Switch if current model is unavailable</span>
                                            </div>
                                            <button
                                                onClick={() => setShowModelList(!showModelList)}
                                                className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
                                            >
                                                Change
                                                <svg className={`w-3.5 h-3.5 transition-transform ${showModelList ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Current Model Badge */}
                                        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg mb-2">
                                            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{currentModel.name}</p>
                                                <p className="text-[11px] text-slate-500">{currentModel.provider} — {currentModel.desc}</p>
                                            </div>
                                            <div className="ml-auto">
                                                <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span>
                                            </div>
                                        </div>

                                        {/* Model List */}
                                        <AnimatePresence>
                                            {showModelList && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="space-y-1.5 pt-2 border-t border-slate-100 mt-2 max-h-60 overflow-y-auto pr-1">
                                                        {isLoadingModels ? (
                                                            <div className="p-4 text-center text-sm text-slate-500">Loading models...</div>
                                                        ) : (
                                                            aiModels.map(model => (
                                                                <button
                                                                    key={model.id}
                                                                    onClick={() => {
                                                                        setAiModel(model.id);
                                                                        setShowModelList(false);
                                                                    }}
                                                                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all
                                                                        ${model.id === aiModel 
                                                                            ? 'bg-primary/5 border border-primary/20' 
                                                                            : 'hover:bg-slate-50 border border-transparent'
                                                                        }`}
                                                                >
                                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold
                                                                        ${model.id === aiModel ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                                        {model.name.charAt(0)}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className={`text-sm font-medium truncate ${model.id === aiModel ? 'text-primary' : 'text-slate-800'}`}>
                                                                            {model.name}
                                                                        </p>
                                                                        <p className="text-[10px] text-slate-400 truncate">{model.provider} — {model.desc}</p>
                                                                    </div>
                                                                    {model.id === aiModel && (
                                                                        <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <p className="text-xs text-slate-400 text-center pt-2">
                                    Changes are applied automatically to the next routing cycle.
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
