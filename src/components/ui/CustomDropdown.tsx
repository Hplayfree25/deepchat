'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type DropdownOption = string | { label: string; value: string; description?: string };

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
}

const CustomDropdown = React.memo(function CustomDropdown({ value, onChange, options }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const displayLabel = useMemo(() => {
    const selectedOption = options.find(o => (typeof o === 'string' ? o : o.value) === value);
    return selectedOption ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label) : value;
  }, [options, value]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border bg-slate-50 px-4 py-3.5 cursor-pointer flex items-center justify-between transition-colors group shadow-sm rounded-2xl dark:bg-slate-950/80 dark:shadow-black/20 ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:ring-indigo-400/20' : 'border-slate-200 dark:border-slate-700'}`}
      >
        <span className="text-slate-800 font-medium dark:text-slate-100">{displayLabel}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 dark:text-slate-500 ${isOpen ? 'rotate-180 text-indigo-500 dark:text-indigo-300' : 'group-hover:text-indigo-400'}`} />
      </div>

      <div
        className={`absolute z-[300] left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] overflow-hidden transition-[opacity,transform,visibility] duration-200 ease-out origin-top dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_22px_70px_-18px_rgba(0,0,0,0.75)] ${
          isOpen ? 'opacity-100 scale-y-100 translate-y-0 visible' : 'opacity-0 scale-y-95 -translate-y-2 invisible pointer-events-none'
        }`}
      >
        <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
          {options.map((opt) => {
            const isString = typeof opt === 'string';
            const optionValue = isString ? opt : opt.value;
            const optionLabel = isString ? opt : opt.label;
            const optionDesc = isString ? undefined : opt.description;

            return (
              <div
                key={optionValue}
                onClick={() => {
                  onChange(optionValue);
                  setIsOpen(false);
                }}
                className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                  value === optionValue
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <div>
                  <p className={value === optionValue ? 'font-bold' : 'font-medium'}>{optionLabel}</p>
                  {optionDesc && <p className="text-xs opacity-70 mt-0.5">{optionDesc}</p>}
                </div>
                {value === optionValue && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default CustomDropdown;
