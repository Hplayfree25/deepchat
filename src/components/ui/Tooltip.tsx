'use client';

import React from 'react';

export type TooltipShortcutTone = 'key' | 'muted' | 'icon';

export type TooltipShortcut = {
  label: React.ReactNode;
  tone?: TooltipShortcutTone;
};

type TooltipProps = {
  label: string;
  shortcuts?: TooltipShortcut[];
  children: React.ReactElement;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
};

const alignClass = {
  start: 'left-0 translate-x-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0 translate-x-0'
};

const sideClass = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2'
};

const shortcutClass = {
  key: 'border border-white/15 bg-white/12 px-1.5 py-0.5 text-white',
  muted: 'text-slate-400',
  icon: 'text-slate-300'
};

export default function Tooltip({ label, shortcuts = [], children, side = 'bottom', align = 'center', disabled = false }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      {!disabled && (
        <span
          className={`pointer-events-none absolute z-[80] hidden max-w-[18rem] whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-[13px] font-medium leading-none text-white opacity-0 shadow-xl shadow-slate-950/25 transition-opacity duration-150 group-hover/tooltip:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:inline-flex ${sideClass[side]} ${alignClass[align]}`}
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span>{label}</span>
            {shortcuts.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                {shortcuts.map((shortcut, index) => (
                  <span key={index} className={`inline-flex items-center rounded-md text-[11px] font-medium leading-none ${shortcutClass[shortcut.tone || 'key']}`}>
                    {shortcut.label}
                  </span>
                ))}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
