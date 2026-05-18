'use client';

import React, { useSyncExternalStore } from 'react';

type ShortcutId = 'newChat' | 'search' | 'uploadFile' | 'selectModel' | 'dictation';
type ShortcutPlatform = 'apple' | 'default';
export type ShortcutLabels = Record<ShortcutId, string[]>;

const shortcutKeys: Record<ShortcutPlatform, ShortcutLabels> = {
  apple: {
    newChat: ['Cmd', 'K'],
    search: ['Cmd', 'F'],
    uploadFile: ['Cmd', 'U'],
    selectModel: ['Cmd', 'Shift', 'M'],
    dictation: ['Cmd', 'Shift', 'D']
  },
  default: {
    newChat: ['Ctrl', 'K'],
    search: ['Ctrl', 'F'],
    uploadFile: ['Ctrl', 'U'],
    selectModel: ['Ctrl', 'Shift', 'M'],
    dictation: ['Ctrl', 'Shift', 'D']
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

  if (!modifierPressed || event.altKey) return false;
  if (shortcut === 'selectModel') return event.shiftKey && key === 'm';
  if (shortcut === 'dictation') return event.shiftKey && key === 'd';
  if (event.shiftKey) return false;
  if (shortcut === 'newChat') return key === 'k';
  if (shortcut === 'search') return key === 'f';
  return key === 'u';
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
