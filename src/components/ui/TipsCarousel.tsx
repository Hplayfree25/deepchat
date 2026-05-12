import React, { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShortcutCombo, useShortcutLabels, type ShortcutLabels } from '@/components/shortcuts';

interface TipItem {
  id: number;
  content: (shortcuts: ShortcutLabels) => React.ReactNode;
}

const ALL_TIPS: TipItem[] = [
  { id: 1, content: () => <>Use <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">/</span> to access commands like /summarize, /translate, /code.</> },
  { id: 2, content: () => <>You can quickly switch between LLM models using the dropdown at the top.</> },
  { id: 3, content: (shortcuts) => <>Press <ShortcutCombo keys={shortcuts.search} /> to search through your chats.</> },
  { id: 4, content: () => <>Organize your conversations by creating folders in the sidebar.</> },
  { id: 5, content: () => <>Click &quot;Share&quot; to generate a public link for your conversation.</> },
  { id: 6, content: () => <>Enable &quot;Reasoning Process&quot; to see how the AI derives its answers.</> },
  { id: 7, content: () => <>Upload PDFs or images to let the AI analyze them for you.</> },
  { id: 8, content: () => <>Hover over an AI message to quickly copy its content.</> },
];

export default function TipsCarousel() {
  const shortcuts = useShortcutLabels();
  const tips = ALL_TIPS.slice(0, 3);
  const [slide, setSlide] = useState({ index: 0, direction: 1 });

  useEffect(() => {
    if (tips.length === 0) return;
    const interval = setInterval(() => {
      setSlide((prev) => {
        const nextDirection = prev.index === tips.length - 1 ? -1 : prev.index === 0 ? 1 : prev.direction;
        return { index: prev.index + nextDirection, direction: nextDirection };
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [tips.length]);

  if (tips.length === 0) return null;

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 20 : -20,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -20 : 20,
      opacity: 0,
    }),
  };

  return (
    <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-[24px] relative overflow-hidden">
      <div className="flex items-center gap-2 font-bold text-slate-800 mb-2">
        <Lightbulb className="w-4 h-4 text-amber-500" /> Tips
      </div>
      <div className="relative h-16 w-full">
        <AnimatePresence custom={slide.direction} mode="wait">
          <motion.div
            key={slide.index}
            custom={slide.direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="absolute inset-0 text-sm text-slate-600 leading-relaxed"
          >
            {tips[slide.index].content(shortcuts)}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex justify-center gap-1.5 mt-2">
        {tips.map((_, idx) => (
          <span
            key={idx}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === slide.index ? 'bg-indigo-500' : 'bg-slate-300'}`}
          />
        ))}
      </div>
    </div>
  );
}
