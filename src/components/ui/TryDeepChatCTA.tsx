'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Sparkles, Zap, ArrowRight, Code2, Globe } from 'lucide-react';

export default function TryDeepChatCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-4xl mx-auto mt-24 mb-16 px-4 sm:px-0"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[32px] blur-xl opacity-40 animate-pulse"></div>
      <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[32px] opacity-20"></div>

      <div className="relative bg-white dark:bg-slate-900 border border-white/40 dark:border-slate-800 p-8 sm:p-12 rounded-[30px] shadow-2xl overflow-hidden group">

        <motion.div
          animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"
        />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex-1 text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span>Unlock AI Superpowers</span>
            </motion.div>

            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4 tracking-tight leading-tight">
              Ready to try <br className="hidden sm:block md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 animate-gradient-x">
                DeepChat
              </span>?
            </h2>

            <p className="text-slate-500 dark:text-slate-400 text-base sm:text-lg max-w-lg mx-auto md:mx-0 leading-relaxed mb-8">
              Join thousands of users who are boosting their productivity. Create your own conversations, write code, and summarize documents instantly.
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Code2 className="w-4 h-4 text-purple-500" /></div>
                Generate Code
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Globe className="w-4 h-4 text-emerald-500" /></div>
                Web Search
              </div>
            </div>
          </div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="shrink-0 w-full md:w-auto"
          >
            <Link href="/" className="relative flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold text-lg overflow-hidden group/btn shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)] w-full md:w-auto">
              <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></span>
              <Zap className="w-5 h-5 relative z-10 group-hover/btn:text-yellow-300 transition-colors duration-300" />
              <span className="relative z-10">Start Chatting Free</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
            </Link>
          </motion.div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 4s ease infinite;
        }
      `}} />
    </motion.div>
  );
}
