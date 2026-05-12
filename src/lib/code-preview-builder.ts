import ts from 'typescript';
import { browserScriptLanguages, normalizeCodeLanguage } from '@/lib/code-runner-detection';
import { buildCssPreviewMarkup, extractWebPreviewSource, isWebPreviewCode } from '@/lib/code-web-preview';

const previewScrollbarStyle = `
<style>
html {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #e2e8f0, #cbd5e1);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #cbd5e1, #94a3b8);
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-corner {
  background: transparent;
}
</style>`;

const getConsoleBridge = (previewId: string) => `
<script>
(() => {
  const send = (type, args) => parent.postMessage({
    source: 'deepchat-code-preview-console',
    previewId: '${previewId}',
    type,
    args: args.map((item) => {
      if (typeof item === 'string') return item;
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
  }, '*');
  ['log', 'info', 'warn', 'error'].forEach((method) => {
    const original = console[method];
    console[method] = (...args) => {
      send(method, args);
      original.apply(console, args);
    };
  });
  window.addEventListener('error', (event) => send('error', [event.message]));
  window.addEventListener('unhandledrejection', (event) => send('error', [event.reason]));
  parent.postMessage({ source: 'deepchat-code-preview-console', previewId: '${previewId}', type: 'system', args: ['Running code'] }, '*');
})();
<\/script>`;

const utilityRuntime = `
<script>
const colors = {
  white: '#ffffff', black: '#000000', transparent: 'transparent',
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
  gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827', 950: '#030712' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' },
  sky: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95' },
  purple: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87' },
  fuchsia: { 50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337' }
};
const spacing = { px: '1px', 0: '0', 0.5: '0.125rem', 1: '0.25rem', 1.5: '0.375rem', 2: '0.5rem', 2.5: '0.625rem', 3: '0.75rem', 3.5: '0.875rem', 4: '1rem', 5: '1.25rem', 6: '1.5rem', 7: '1.75rem', 8: '2rem', 9: '2.25rem', 10: '2.5rem', 11: '2.75rem', 12: '3rem', 14: '3.5rem', 16: '4rem', 20: '5rem', 24: '6rem', 28: '7rem', 32: '8rem', 36: '9rem', 40: '10rem', 48: '12rem', 56: '14rem', 64: '16rem', 72: '18rem', 80: '20rem', 96: '24rem' };
function rgba(hex, alpha) {
  if (!hex || hex === 'transparent') return hex;
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}
function colorValue(token) {
  const parts = token.split('/');
  const base = parts[0];
  const alpha = parts[1] ? Number(parts[1]) / 100 : null;
  if (colors[base] && typeof colors[base] === 'string') return alpha === null ? colors[base] : rgba(colors[base], alpha);
  const match = base.match(/^([a-z]+)-(\\d+)$/);
  if (!match) return null;
  const color = colors[match[1]] && colors[match[1]][match[2]];
  return alpha === null ? color : rgba(color, alpha);
}
function sizeValue(value) {
  if (value === 'full') return '100%';
  if (value === 'screen') return '100vh';
  if (value === 'min') return 'min-content';
  if (value === 'max') return 'max-content';
  if (value === 'fit') return 'fit-content';
  if (spacing[value] !== undefined) return spacing[value];
  if (/^\\[.+\\]$/.test(value)) return value.slice(1, -1).replace(/_/g, ' ');
  return null;
}
function setGradient(node) {
  if (!node.__twFrom && !node.__twTo) return;
  const direction = node.__twDirection || 'to right';
  const stops = [node.__twFrom, node.__twVia, node.__twTo].filter(Boolean).join(', ');
  node.style.backgroundImage = 'linear-gradient(' + direction + ', ' + stops + ')';
}
function baseClass(token) {
  const parts = token.split(':');
  return parts[parts.length - 1];
}
function applyUtility(node, rawToken) {
  const variants = rawToken.split(':').slice(0, -1);
  if (variants.some((variant) => ['dark', 'hover', 'focus', 'active', 'group-hover', 'disabled', 'visited'].includes(variant))) return;
  const token = baseClass(rawToken);
  const negative = token.startsWith('-');
  const name = negative ? token.slice(1) : token;
  const valueSign = negative ? '-' : '';
  if (token === 'block') node.style.display = 'block';
  else if (token === 'inline-block') node.style.display = 'inline-block';
  else if (token === 'inline') node.style.display = 'inline';
  else if (token === 'flex') node.style.display = 'flex';
  else if (token === 'inline-flex') node.style.display = 'inline-flex';
  else if (token === 'grid') node.style.display = 'grid';
  else if (token === 'hidden') node.style.display = 'none';
  else if (token === 'relative') node.style.position = 'relative';
  else if (token === 'absolute') node.style.position = 'absolute';
  else if (token === 'fixed') node.style.position = 'fixed';
  else if (token === 'sticky') node.style.position = 'sticky';
  else if (token === 'items-center') node.style.alignItems = 'center';
  else if (token === 'items-start') node.style.alignItems = 'flex-start';
  else if (token === 'items-end') node.style.alignItems = 'flex-end';
  else if (token === 'justify-center') node.style.justifyContent = 'center';
  else if (token === 'justify-between') node.style.justifyContent = 'space-between';
  else if (token === 'justify-end') node.style.justifyContent = 'flex-end';
  else if (token === 'flex-col') node.style.flexDirection = 'column';
  else if (token === 'flex-wrap') node.style.flexWrap = 'wrap';
  else if (token === 'text-center') node.style.textAlign = 'center';
  else if (token === 'text-left') node.style.textAlign = 'left';
  else if (token === 'text-right') node.style.textAlign = 'right';
  else if (token === 'font-bold') node.style.fontWeight = '700';
  else if (token === 'font-semibold') node.style.fontWeight = '600';
  else if (token === 'font-medium') node.style.fontWeight = '500';
  else if (token === 'font-light') node.style.fontWeight = '300';
  else if (token === 'italic') node.style.fontStyle = 'italic';
  else if (token === 'overflow-hidden') node.style.overflow = 'hidden';
  else if (token === 'overflow-auto') node.style.overflow = 'auto';
  else if (token === 'mx-auto') { node.style.marginLeft = 'auto'; node.style.marginRight = 'auto'; }
  else if (token === 'my-auto') { node.style.marginTop = 'auto'; node.style.marginBottom = 'auto'; }
  else if (token === 'min-h-screen') node.style.minHeight = '100vh';
  else if (token === 'w-full') node.style.width = '100%';
  else if (token === 'h-full') node.style.height = '100%';
  else if (token === 'rounded-full') node.style.borderRadius = '9999px';
  else if (token === 'rounded') node.style.borderRadius = '0.25rem';
  else if (token === 'rounded-lg') node.style.borderRadius = '0.5rem';
  else if (token === 'rounded-xl') node.style.borderRadius = '0.75rem';
  else if (token === 'rounded-2xl') node.style.borderRadius = '1rem';
  else if (token === 'rounded-3xl') node.style.borderRadius = '1.5rem';
  else if (token === 'shadow') node.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.12), 0 1px 2px rgba(15, 23, 42, 0.08)';
  else if (token === 'shadow-lg') node.style.boxShadow = '0 10px 15px rgba(15, 23, 42, 0.12), 0 4px 6px rgba(15, 23, 42, 0.08)';
  else if (token === 'shadow-xl') node.style.boxShadow = '0 20px 25px rgba(15, 23, 42, 0.14), 0 8px 10px rgba(15, 23, 42, 0.08)';
  else if (token === 'shadow-2xl') node.style.boxShadow = '0 25px 50px rgba(15, 23, 42, 0.22)';
  else if (token === 'backdrop-blur-sm') node.style.backdropFilter = 'blur(4px)';
  else if (token === 'backdrop-blur') node.style.backdropFilter = 'blur(8px)';
  else if (token === 'blur-xl') node.style.filter = 'blur(24px)';
  else if (token === 'bg-clip-text') { node.style.backgroundClip = 'text'; node.style.webkitBackgroundClip = 'text'; }
  else if (token === 'text-transparent') { node.style.color = 'transparent'; node.style.webkitTextFillColor = 'transparent'; }
  else if (token === 'leading-relaxed') node.style.lineHeight = '1.625';
  else if (token === 'leading-tight') node.style.lineHeight = '1.25';
  else if (token === 'bg-gradient-to-r') { node.__twDirection = 'to right'; setGradient(node); }
  else if (token === 'bg-gradient-to-br') { node.__twDirection = 'to bottom right'; setGradient(node); }
  else if (token === 'bg-gradient-to-b') { node.__twDirection = 'to bottom'; setGradient(node); }
  else if (token.startsWith('from-')) { node.__twFrom = colorValue(token.slice(5)); setGradient(node); }
  else if (token.startsWith('via-')) { node.__twVia = colorValue(token.slice(4)); setGradient(node); }
  else if (token.startsWith('to-')) { node.__twTo = colorValue(token.slice(3)); setGradient(node); }
  else if (token.startsWith('bg-')) { const color = colorValue(token.slice(3)); if (color) node.style.backgroundColor = color; }
  else if (token.startsWith('text-')) {
    const sizes = { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem', '6xl': '3.75rem', '7xl': '4.5rem' };
    const key = token.slice(5);
    const color = colorValue(key);
    if (sizes[key]) node.style.fontSize = sizes[key];
    else if (color) node.style.color = color;
  }
  else if (token.startsWith('border-')) { const color = colorValue(token.slice(7)); if (color) node.style.borderColor = color; else node.style.borderWidth = '1px'; node.style.borderStyle = 'solid'; }
  else if (token === 'border') { node.style.borderWidth = '1px'; node.style.borderStyle = 'solid'; node.style.borderColor = '#e5e7eb'; }
  else if (token.startsWith('opacity-')) node.style.opacity = String(Number(token.slice(8)) / 100);
  else if (token.startsWith('z-')) node.style.zIndex = token.slice(2);
  else if (token.startsWith('grid-cols-')) node.style.gridTemplateColumns = 'repeat(' + token.slice(10) + ', minmax(0, 1fr))';
  else if (token.startsWith('gap-')) { const size = sizeValue(token.slice(4)); if (size) node.style.gap = size; }
  else if (token.startsWith('space-y-')) {
    const size = sizeValue(token.slice(8));
    if (size) Array.from(node.children).forEach((child, index) => { if (index > 0) child.style.marginTop = size; });
  }
  else if (token.startsWith('max-w-')) {
    const map = { sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem', '6xl': '72rem', '7xl': '80rem', full: '100%' };
    const key = token.slice(6);
    node.style.maxWidth = map[key] || sizeValue(key) || node.style.maxWidth;
  }
  else if (/^(p|m|px|py|pt|pr|pb|pl|mt|mr|mb|ml|top|right|bottom|left|inset|w|h)-/.test(name)) {
    const index = name.indexOf('-');
    const prop = name.slice(0, index);
    const raw = name.slice(index + 1);
    const size = sizeValue(raw);
    if (!size) return;
    const value = valueSign + size;
    const map = {
      p: ['padding'], px: ['paddingLeft', 'paddingRight'], py: ['paddingTop', 'paddingBottom'], pt: ['paddingTop'], pr: ['paddingRight'], pb: ['paddingBottom'], pl: ['paddingLeft'],
      m: ['margin'], mt: ['marginTop'], mr: ['marginRight'], mb: ['marginBottom'], ml: ['marginLeft'],
      top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'], inset: ['top', 'right', 'bottom', 'left'], w: ['width'], h: ['height']
    };
    (map[prop] || []).forEach((styleName) => { node.style[styleName] = value; });
  }
}
function applyUtilityStyles(root) {
  const nodes = [root, ...root.querySelectorAll('[class]')].filter(Boolean);
  nodes.forEach((node) => {
    String(node.getAttribute('class') || '').split(/\\s+/).filter(Boolean).forEach((token) => applyUtility(node, token));
  });
}
document.addEventListener('DOMContentLoaded', () => applyUtilityStyles(document.body));
<\/script>`;

const miniRuntime = `
<script>
const Fragment = Symbol('Fragment');
const stateStore = [];
let stateCursor = 0;
let rootRenderer = null;
function h(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(Infinity) };
}
function useState(initialValue) {
  const cursor = stateCursor;
  stateStore[cursor] = stateStore.length > cursor ? stateStore[cursor] : (typeof initialValue === 'function' ? initialValue() : initialValue);
  const setValue = (value) => {
    stateStore[cursor] = typeof value === 'function' ? value(stateStore[cursor]) : value;
    if (rootRenderer) rootRenderer();
  };
  stateCursor += 1;
  return [stateStore[cursor], setValue];
}
function useEffect(callback) {
  setTimeout(callback, 0);
}
function useMemo(factory) {
  return factory();
}
function useRef(value) {
  return { current: value };
}
const React = { createElement: h, Fragment, useState, useEffect, useMemo, useRef };
function appendChild(parent, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) {
    child.forEach((item) => appendChild(parent, item));
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    parent.appendChild(document.createTextNode(String(child)));
    return;
  }
  parent.appendChild(renderNode(child));
}
function applyStyle(node, style) {
  if (!style || typeof style !== 'object') return;
  Object.entries(style).forEach(([key, value]) => {
    node.style[key] = typeof value === 'number' ? value + 'px' : value;
  });
}
function applyProps(node, props) {
  Object.entries(props || {}).forEach(([key, value]) => {
    if (key === 'children' || value === null || value === undefined || value === false) return;
    if (key === 'className') {
      node.setAttribute('class', String(value));
      return;
    }
    if (key === 'style') {
      applyStyle(node, value);
      return;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      return;
    }
    if (value === true) {
      node.setAttribute(key, '');
      return;
    }
    node.setAttribute(key, String(value));
  });
}
function renderNode(vnode) {
  if (typeof vnode.type === 'function') {
    return renderNode(vnode.type({ ...(vnode.props || {}), children: vnode.children }));
  }
  if (vnode.type === Fragment) {
    const fragment = document.createDocumentFragment();
    vnode.children.forEach((child) => appendChild(fragment, child));
    return fragment;
  }
  const node = document.createElement(vnode.type);
  applyProps(node, vnode.props);
  vnode.children.forEach((child) => appendChild(node, child));
  return node;
}
function mount(component) {
  const root = document.getElementById('root');
  rootRenderer = () => {
    stateCursor = 0;
    root.replaceChildren(renderNode(h(component)));
    applyUtilityStyles(root);
  };
  rootRenderer();
}
<\/script>`;

const stripImports = (code: string) => code
  .replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

const normalizeComponentExports = (code: string) => {
  let componentName = 'PreviewComponent';
  let normalized = stripImports(code)
    .replace(/^\s*['"]use client['"];?\s*/m, '')
    .replace(/^\s*['"]use server['"];?\s*/m, '');

  const namedDefault = normalized.match(/\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (namedDefault) {
    componentName = namedDefault[1];
    normalized = normalized.replace(/\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/, 'function $1(');
  } else if (/\bexport\s+default\s+function\s*\(/.test(normalized)) {
    normalized = normalized.replace(/\bexport\s+default\s+function\s*\(/, `function ${componentName}(`);
  } else if (/\bexport\s+default\s+/.test(normalized)) {
    normalized = normalized.replace(/\bexport\s+default\s+/, `const ${componentName} = `);
  } else {
    const fallback = normalized.match(/\bfunction\s+(Page|App|Component|Preview)\s*\(/) || normalized.match(/\bconst\s+(Page|App|Component|Preview)\s*=/);
    if (fallback) componentName = fallback[1];
  }

  normalized = normalized
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\s+)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

  return { code: normalized, componentName };
};

const buildJsxDocument = (code: string, language: string, previewId: string) => {
  const { code: normalizedCode, componentName } = normalizeComponentExports(code);
  const transpiled = ts.transpileModule(normalizedCode, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      jsxFactory: 'h',
      jsxFragmentFactory: 'Fragment',
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: false
    },
    fileName: `preview.${language}`
  }).outputText;
  return `<!doctype html><html><head><meta charset="utf-8">${previewScrollbarStyle}${getConsoleBridge(previewId)}<style>html,body,#root{margin:0;min-height:100%;background:#ffffff;font-family:Arial,sans-serif}</style></head><body><div id="root"></div>${utilityRuntime}${miniRuntime}<script>${transpiled}
if (typeof ${componentName} === 'function') {
  mount(${componentName});
}
<\/script></body></html>`;
};

const transformTypeScriptForRunner = (code: string) => ts.transpileModule(code, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    strict: false
  }
}).outputText;

const buildHtmlDocument = (code: string, previewId: string) => {
  const bridge = `${previewScrollbarStyle}${getConsoleBridge(previewId)}`;
  if (/<head[\s>]/i.test(code)) {
    return code.replace(/<head([^>]*)>/i, `<head$1>${bridge}${utilityRuntime}`);
  }
  if (/<html[\s>]/i.test(code)) {
    return code.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8">${bridge}${utilityRuntime}</head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}${utilityRuntime}<style>html,body{margin:0;min-height:100%;background:#ffffff;font-family:Arial,sans-serif}</style></head><body>${code}</body></html>`;
};

export const buildPreviewDocument = (code: string, language: string, previewId: string) => {
  const bridge = `${previewScrollbarStyle}${getConsoleBridge(previewId)}`;
  const normalizedLanguage = normalizeCodeLanguage(language);
  const extracted = extractWebPreviewSource(code, normalizedLanguage);
  if (extracted.kind === 'svg') {
    return `<!doctype html><html><head><meta charset="utf-8">${bridge}<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:#ffffff}svg{max-width:100%;height:auto}</style></head><body>${extracted.code}</body></html>`;
  }
  if (extracted.kind === 'css') {
    return buildHtmlDocument(buildCssPreviewMarkup(extracted.code), previewId);
  }
  if (extracted.kind === 'html') {
    return buildHtmlDocument(extracted.code, previewId);
  }
  if (normalizedLanguage === 'tsx' || normalizedLanguage === 'jsx' || (browserScriptLanguages.has(normalizedLanguage) && /<\w+[\s>]/.test(code))) {
    return buildJsxDocument(code, normalizedLanguage || 'tsx', previewId);
  }
  if (browserScriptLanguages.has(normalizedLanguage)) {
    const executableCode = normalizedLanguage === 'typescript' || normalizedLanguage === 'ts' ? transformTypeScriptForRunner(code) : code;
    return `<!doctype html><html><head><meta charset="utf-8">${bridge}<style>html,body{margin:0;min-height:100%;background:#ffffff}</style></head><body><script type="module">${executableCode}<\/script></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}</head><body>${code}</body></html>`;
};

export const isPreviewLanguage = (language: string, code: string) => {
  return isWebPreviewCode(language, code);
};
