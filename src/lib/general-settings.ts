'use client';

import { LANGUAGE_OPTIONS } from './languages';

export type AppearanceMode = 'system' | 'dark' | 'light';
export type ContrastMode = 'system' | 'medium' | 'increased';
export type AccentColor = 'default' | 'blue' | 'green' | 'yellow' | 'pink' | 'orange' | 'purple' | 'black';

export interface GeneralSettings {
  appearance: AppearanceMode;
  contrast: ContrastMode;
  accentColor: AccentColor;
  language: string;
  dictationEnabled: boolean;
}

export const APPEARANCE_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' }
];

export const CONTRAST_OPTIONS = [
  { label: 'System', value: 'system' },
  { label: 'Medium', value: 'medium' },
  { label: 'Increased', value: 'increased' }
];

export const ACCENT_COLOR_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Blue', value: 'blue' },
  { label: 'Green', value: 'green' },
  { label: 'Yellow', value: 'yellow' },
  { label: 'Pink', value: 'pink' },
  { label: 'Orange', value: 'orange' },
  { label: 'Purple', value: 'purple' },
  { label: 'Black', value: 'black' }
];

export const defaultGeneralSettings: GeneralSettings = {
  appearance: 'system',
  contrast: 'system',
  accentColor: 'default',
  language: 'auto',
  dictationEnabled: true
};

const SETTINGS_KEY = 'deepchat-general-settings';
const SETTINGS_EVENT = 'deepchat:general-settings-updated';
const validAppearances = new Set<string>(APPEARANCE_OPTIONS.map(option => option.value));
const validContrasts = new Set<string>(CONTRAST_OPTIONS.map(option => option.value));
const validAccentColors = new Set<string>(ACCENT_COLOR_OPTIONS.map(option => option.value));
const validLanguages = new Set<string>(LANGUAGE_OPTIONS.map(option => option.value));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const normalizeSettings = (settings: unknown): GeneralSettings => {
  if (!isRecord(settings)) return defaultGeneralSettings;
  return {
    appearance: typeof settings.appearance === 'string' && validAppearances.has(settings.appearance) ? settings.appearance as AppearanceMode : defaultGeneralSettings.appearance,
    contrast: typeof settings.contrast === 'string' && validContrasts.has(settings.contrast) ? settings.contrast as ContrastMode : defaultGeneralSettings.contrast,
    accentColor: typeof settings.accentColor === 'string' && validAccentColors.has(settings.accentColor) ? settings.accentColor as AccentColor : defaultGeneralSettings.accentColor,
    language: typeof settings.language === 'string' && validLanguages.has(settings.language) ? settings.language : defaultGeneralSettings.language,
    dictationEnabled: typeof settings.dictationEnabled === 'boolean' ? settings.dictationEnabled : defaultGeneralSettings.dictationEnabled
  };
};

const getSystemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
const getSystemPrefersMoreContrast = () => typeof window !== 'undefined' && window.matchMedia('(prefers-contrast: more)').matches;

export const applyGeneralSettings = (settings: GeneralSettings) => {
  if (typeof document === 'undefined') return;
  const normalized = normalizeSettings(settings);
  const root = document.documentElement;
  const dark = normalized.appearance === 'dark' || (normalized.appearance === 'system' && getSystemPrefersDark());
  const contrast = normalized.contrast === 'system' ? getSystemPrefersMoreContrast() ? 'increased' : 'medium' : normalized.contrast;
  root.classList.toggle('dark', dark);
  root.dataset.appearance = normalized.appearance;
  root.dataset.contrast = contrast;
  root.dataset.accentColor = normalized.accentColor;
  root.dataset.language = normalized.language;
};

export const loadGeneralSettings = () => {
  if (typeof window === 'undefined') return defaultGeneralSettings;
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return defaultGeneralSettings;
  }
};

export const saveGeneralSettings = (settings: GeneralSettings) => {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  applyGeneralSettings(normalized);
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
};

export const subscribeGeneralSettings = (listener: (settings: GeneralSettings) => void) => {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent) {
      listener(normalizeSettings(event.detail));
    }
  };
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
};

export const getDictationLanguage = (settings: GeneralSettings) => {
  if (settings.language !== 'auto') return settings.language;
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
};
