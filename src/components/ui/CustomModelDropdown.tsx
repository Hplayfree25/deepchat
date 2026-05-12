'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, ChevronRight } from 'lucide-react';

type ModelItem = {
  id: string;
  name?: string;
  badge?: string;
};

type ModelCategory = {
  category: string;
  models: ModelItem[];
};

type ModelEntry = ModelItem | ModelCategory;

const isModelCategory = (model: ModelEntry): model is ModelCategory => 'category' in model && Array.isArray(model.models);

interface CustomModelDropdownProps {
  value: string;
  onChange: (value: string) => void;
  models: ModelEntry[];
}

export default function CustomModelDropdown({ value, onChange, models }: CustomModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const validCategories = useMemo(() => models.filter(isModelCategory).filter(c => c.models.length > 0), [models]);
  const selectedCategory = useMemo(() => {
    return validCategories.find(cat => cat.models.some(m => m.id === value))?.category || validCategories[0]?.category || '';
  }, [validCategories, value]);
  const activeCategoryValue = validCategories.some(c => c.category === activeCategory) ? activeCategory : selectedCategory;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const displayValue = useMemo(() => {
    for (const cat of models) {
      if (!isModelCategory(cat)) continue;
      const found = cat.models.find(m => m.id === value);
      if (found) return found.name || found.id;
    }
    return value;
  }, [models, value]);

  const activeCategoryData = validCategories.find(c => c.category === activeCategoryValue);

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-slate-50 border ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'} rounded-xl px-4 py-3 cursor-pointer flex items-center justify-between transition-all group shadow-sm`}
      >
        <span className="text-slate-800 font-medium truncate pr-4">{displayValue || 'Select a model'}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-500' : 'group-hover:text-indigo-400'}`} />
      </div>

      <div 
        className={`absolute z-[300] left-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] overflow-hidden transition-all duration-200 origin-top flex min-w-full sm:w-[480px] h-[340px] max-w-[85vw] ${
          isOpen ? 'opacity-100 scale-y-100 translate-y-0' : 'opacity-0 scale-y-95 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="w-[42%] shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50 p-2 custom-scrollbar sm:w-1/3">
          <div className="px-3 py-2 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
            Categories
          </div>
          <div className="space-y-1">
            {validCategories.map(cat => (
              <button
                key={cat.category}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveCategory(cat.category);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                  activeCategoryValue === cat.category
                    ? 'bg-white shadow-sm border border-slate-200 text-indigo-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 font-medium border border-transparent'
                }`}
              >
                <span className="text-[13px] truncate">{cat.category}</span>
                {activeCategoryValue === cat.category && <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0 ml-1" />}
              </button>
            ))}
          </div>
        </div>

        <div className="w-[58%] overflow-y-auto bg-white p-2 custom-scrollbar sm:w-2/3">
          <div className="px-3 py-2 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider sticky top-0 bg-white/95 backdrop-blur-sm z-10">
            {activeCategoryData?.category} Models
          </div>
          <div className="space-y-0.5">
            {activeCategoryData?.models.map((m) => {
              const isSelected = value === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                    isSelected 
                      ? 'bg-indigo-50 text-indigo-700 font-bold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className={`text-[13px] truncate ${isSelected ? 'text-indigo-700 font-bold' : ''}`}>{m.name || m.id}</span>
                    {m.badge && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 text-[9px] font-bold uppercase tracking-wider shrink-0">{m.badge}</span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>
              );
            })}
            
            {!activeCategoryData?.models?.length && (
               <div className="px-3 py-4 text-sm text-slate-400 font-medium text-center">
                 No models available
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
