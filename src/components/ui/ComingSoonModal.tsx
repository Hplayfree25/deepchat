import React from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export default function ComingSoonModal({ isOpen, onClose, title }: ComingSoonModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 sm:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />

          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col items-center text-center relative z-10">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-200 rounded-2xl flex items-center justify-center shadow-inner mb-6">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight mb-2">
              {title}
            </h3>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Coming Soon
            </div>
            <p className="text-slate-500 text-sm leading-relaxed max-w-[260px]">
              We are working hard to bring you this feature. Stay tuned for our next exciting updates!
            </p>
            <button 
              onClick={onClose}
              className="mt-8 px-6 py-2.5 bg-slate-900 text-white rounded-full font-semibold text-sm hover:bg-slate-800 transition-colors w-full"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
