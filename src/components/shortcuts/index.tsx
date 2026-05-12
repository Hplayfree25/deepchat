'use client';

import React, { useSyncExternalStore } from 'react';

type ShortcutId = 'newChat' | 'search';
type ShortcutPlatform = 'apple' | 'default';
export type ShortcutLabels = Record<ShortcutId, string[]>;

const shortcutKeys: Record<ShortcutPlatform, ShortcutLabels> = {
  apple: {
    newChat: ['Cmd', 'K'],
    search: ['Cmd', 'F']
  },
  default: {
    newChat: ['Ctrl', 'K'],
    search: ['Ctrl', 'F']
  }
};

const getPlatform = (): ShortcutPlatform => {
  if (typeof navigator === 'undefined') return 'default';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'apple' : 'default';
};

export function useShortcutLabels() {
  const platform = useSyncExternalStore<ShortcutPlatform>(() => () => undefined, getPlatform, () => 'default');
  return shortcutKeys[platform];
}

export function isShortcutEvent(event: KeyboardEvent, shortcut: ShortcutId) {
  const key = event.key.toLowerCase();
  const modifierPressed = getPlatform() === 'apple' ? event.metaKey : event.ctrlKey;

  if (!modifierPressed || event.altKey || event.shiftKey) return false;
  if (shortcut === 'newChat') return key === 'k';
  return key === 'f';
}

export function ShortcutCombo({ keys, tone = 'light' }: { keys: string[]; tone?: 'light' | 'dark' }) {
  const className = tone === 'dark'
    ? 'bg-indigo-500/50 text-indigo-100 border border-indigo-400/30'
    : 'bg-white text-slate-400 border border-slate-200 shadow-sm';

  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <span key={key} className={`rounded-lg px-2 py-0.5 text-[11px] font-bold leading-5 ${className}`}>
          {key}
        </span>
      ))}
    </span>
  );
}
