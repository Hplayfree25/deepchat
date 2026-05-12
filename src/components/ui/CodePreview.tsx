'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftToLine, ArrowRightToLine, Check, Code2, Copy, Download, Edit3, FileDown, Maximize2, PanelBottom, Play, Square, Trash2, X } from 'lucide-react';
import type { Highlighter } from 'shiki';
import { browserScriptLanguages, normalizeCodeLanguage } from '@/lib/code-runner-detection';
import { buildCssPreviewMarkup, extractWebPreviewSource, isWebPreviewCode } from '@/lib/code-web-preview';

type ConsoleEntry = {
  id: number;
  type: string;
  text: string;
};

type SessionOutput = {
  type: string;
  text: string;
};

interface CodePreviewProps {
  language: string;
  value: string;
  highlighter: Highlighter | null;
  isStreaming?: boolean;
}

const runnableLanguages = new Set(['javascript', 'js', 'typescript', 'ts', 'python', 'py', 'php', 'bash', 'shell', 'sh', 'powershell', 'ps1', 'ruby', 'rb', 'go', 'java', 'rust', 'c', 'cpp', 'c++']);
const FULLSCREEN_EXIT_MS = 320;

const normalizeLanguage = (language: string) => normalizeCodeLanguage(language);
const isDocumentDark = () => {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.classList.contains('dark') || root.dataset.appearance === 'dark';
};

const getFileName = (language: string) => {
  const normalized = normalizeLanguage(language);
  if (normalized === 'svg') return 'preview.svg';
  if (normalized === 'html') return 'preview.html';
  const extensions: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    powershell: 'ps1',
    shell: 'sh',
    ruby: 'rb',
    rust: 'rs',
    cpp: 'cpp',
    'c++': 'cpp'
  };
  return `code.${extensions[normalized] || normalized || 'txt'}`;
};

const serializeConsoleValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

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

const buildHtmlDocument = (code: string, previewId: string) => {
  const bridge = `${previewScrollbarStyle}${getConsoleBridge(previewId)}`;
  if (/<head[\s>]/i.test(code)) {
    return code.replace(/<head([^>]*)>/i, `<head$1>${bridge}`);
  }
  if (/<html[\s>]/i.test(code)) {
    return code.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="utf-8">${bridge}</head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}<style>html,body{margin:0;min-height:100%;background:#ffffff;font-family:Arial,sans-serif}</style></head><body>${code}</body></html>`;
};

const buildPreviewDocument = (code: string, language: string, previewId: string) => {
  const bridge = `${previewScrollbarStyle}${getConsoleBridge(previewId)}`;
  const normalizedLanguage = normalizeLanguage(language);
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
    return `<!doctype html><html><head><meta charset="utf-8">${bridge}<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:#ffffff;font-family:Arial,sans-serif;color:#475569}</style></head><body>Preparing preview...</body></html>`;
  }
  if (browserScriptLanguages.has(normalizedLanguage)) {
    const executableCode = normalizedLanguage === 'typescript' || normalizedLanguage === 'ts' ? transformTypeScriptForRunner(code) : code;
    return `<!doctype html><html><head><meta charset="utf-8">${bridge}<style>html,body{margin:0;min-height:100%;background:#ffffff}</style></head><body><script type="module">${executableCode}<\/script></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}</head><body>${code}</body></html>`;
};

const transformTypeScriptForRunner = (code: string) => code
  .replace(/^\s*interface\s+\w+\s*\{[\s\S]*?\}\s*$/gm, '')
  .replace(/^\s*type\s+\w+\s*=\s*[^;]+;?\s*$/gm, '')
  .replace(/:\s*[A-Za-z_$][\w$<>,\[\]\s|&?.]*(?=\s*[,)=;])/g, '')
  .replace(/\s+as\s+[A-Za-z_$][\w$<>,\[\]\s|&?.]*/g, '');

const isWebLikeCode = (language: string, code: string) => isWebPreviewCode(language, code);

function IconButton({ title, onClick, children, active = false }: { title: string, onClick: () => void, children: React.ReactNode, active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${active ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
    >
      {children}
    </button>
  );
}

const CodeStreamingSpinner = React.memo(function CodeStreamingSpinner() {
  const animationDelay = '-0.35s';
  return <span className="deepchat-code-spinner" style={{ animationDelay }} aria-hidden="true" />;
});

function ModeSwitch({ mode, onShowCode, onRunPreview }: { mode: 'preview' | 'code', onShowCode: () => void, onRunPreview: () => void }) {
  const activeOffset = mode === 'code' ? 'translate-x-0' : 'translate-x-full';

  return (
    <div className="relative grid h-9 w-[76px] grid-cols-2 overflow-hidden rounded-full bg-slate-100 p-1 text-slate-600 ring-1 ring-slate-200">
      <span className={`absolute left-1 top-1 h-7 w-[34px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${activeOffset}`} />
      <button
        type="button"
        onClick={onShowCode}
        title="Show code"
        aria-label="Show code"
        className={`relative z-10 inline-flex items-center justify-center rounded-full transition-colors duration-300 ${mode === 'code' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}
      >
        <Code2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onRunPreview}
        title="Run preview"
        aria-label="Run preview"
        className={`relative z-10 inline-flex items-center justify-center rounded-full transition-colors duration-300 ${mode === 'preview' ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}
      >
        <Play className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CodeSurface({ code, html, editing, onChange, fill = false }: { code: string, html: string, editing: boolean, onChange: (value: string) => void, fill?: boolean }) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorHydratedRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      editorHydratedRef.current = false;
      return;
    }
    if (!editorRef.current || editorHydratedRef.current) return;
    if (html) {
      editorRef.current.innerHTML = html;
    } else {
      editorRef.current.textContent = code;
    }
    editorHydratedRef.current = true;
  }, [code, editing, html]);

  const syncEditableCode = () => {
    if (!editorRef.current) return;
    onChange(editorRef.current.innerText.replace(/\n$/, ''));
  };

  if (editing) {
    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onInput={syncEditableCode}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          document.execCommand('insertText', false, '  ');
          syncEditableCode();
        }}
        className={`code-preview-code modern-scrollbar overflow-auto bg-white p-4 text-sm text-slate-900 outline-none ring-0 selection:bg-indigo-200/70 [&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:!p-0 [&_code]:!bg-transparent ${fill ? 'h-full' : 'min-h-[340px]'}`}
      />
    );
  }

  return (
    <div className={`code-preview-code modern-scrollbar overflow-auto bg-white text-sm ${fill ? 'h-full' : 'max-h-[420px]'}`}>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} className="[&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:!p-4 [&_code]:!bg-transparent" />
      ) : (
        <pre className="m-0 overflow-x-auto p-4 text-slate-900">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

function PreviewFrame({ srcDoc, compact = false }: { srcDoc: string, compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-slate-200 ${compact ? 'h-full min-h-[360px]' : 'min-h-[420px]'}`}>
      <iframe
        title="Code preview"
        srcDoc={srcDoc}
        sandbox="allow-forms allow-modals allow-popups allow-scripts"
        className="h-full min-h-[inherit] w-full border-0 bg-white"
      />
    </div>
  );
}

function ConsolePanel({ entries, isRunning, large = false, showRun = true, terminalInput, onTerminalInputChange, onTerminalSubmit, onClear, onClose, onRun, onStop }: { entries: ConsoleEntry[], isRunning: boolean, large?: boolean, showRun?: boolean, terminalInput?: string, onTerminalInputChange?: (value: string) => void, onTerminalSubmit?: () => void, onClear: () => void, onClose?: () => void, onRun?: () => void, onStop?: () => void }) {
  const showTerminalInput = large && isRunning && onTerminalInputChange && onTerminalSubmit;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="text-sm font-bold text-slate-950">Console</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            title="Clear console"
            aria-label="Clear console"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close console"
              aria-label="Close console"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {showRun && onRun && onStop && (
            <button
              type="button"
              onClick={isRunning ? onStop : onRun}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-bold transition ${isRunning ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' : 'border-slate-200 bg-white text-slate-950 hover:bg-slate-50'}`}
            >
              {isRunning ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Stop' : 'Run'}
            </button>
          )}
        </div>
      </div>
      <div className={`modern-scrollbar min-h-0 flex-1 overflow-auto px-5 py-4 font-mono text-sm leading-7 text-slate-500 ${large ? 'h-full' : 'h-36'}`}>
        {entries.length > 0 ? entries.map((entry) => (
          <div key={entry.id} className={`whitespace-pre-wrap ${entry.type === 'error' ? 'text-red-500' : entry.type === 'warn' ? 'text-amber-600' : entry.type === 'input' ? 'text-slate-950' : entry.type === 'system' ? 'text-slate-400' : 'text-slate-950'}`}>
            {entry.text}
          </div>
        )) : (
          <div>No logs</div>
        )}
        {showTerminalInput && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onTerminalSubmit();
            }}
            className="mt-1 flex items-center gap-2 text-slate-950"
          >
            <span className="text-slate-400">$</span>
            <input
              value={terminalInput || ''}
              onChange={(event) => onTerminalInputChange(event.target.value)}
              spellCheck={false}
              autoFocus
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-950 outline-none"
            />
          </form>
        )}
      </div>
    </div>
  );
}

export default function CodePreview({ language, value, highlighter, isStreaming = false }: CodePreviewProps) {
  const previewId = useId();
  const normalizedLanguage = normalizeLanguage(language);
  const [codeState, setCodeState] = useState(() => ({ source: value, draft: value }));
  const [mode, setMode] = useState<'preview' | 'code'>('code');
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenClosing, setFullscreenClosing] = useState(false);
  const [showFullscreenCode, setShowFullscreenCode] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [isDarkTheme, setIsDarkTheme] = useState(isDocumentDark);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [previewSrcDoc, setPreviewSrcDoc] = useState('');
  const [downloadPrompt, setDownloadPrompt] = useState<{ open: boolean, runtime: string }>({ open: false, runtime: '' });
  const activeSessionRef = useRef<string | null>(null);
  const runnerAbortRef = useRef<AbortController | null>(null);
  const fullscreenCloseTimerRef = useRef<number | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    { id: 1, type: 'system', text: 'Run started' }
  ]);

  const draftCode = codeState.source === value ? codeState.draft : value;
  const setDraftCode = (draft: string) => setCodeState({ source: value, draft });
  const isPreviewable = isWebLikeCode(normalizedLanguage, draftCode);
  const isRunnable = runnableLanguages.has(normalizedLanguage);
  const isCodeRunner = isRunnable && !isPreviewable;

  const appendSessionOutput = (output: SessionOutput[]) => {
    if (!Array.isArray(output) || output.length === 0) return;
    const runtimeError = output.find((item) => /^Runtime not available in this sandbox:/i.test(item.text || ''));
    if (runtimeError) {
      setDownloadPrompt({
        open: true,
        runtime: runtimeError.text.replace(/^Runtime not available in this sandbox:\s*/i, '').trim()
      });
    }
    setConsoleEntries((entries) => [
      ...entries,
      ...output.map((item, index) => ({
        id: Date.now() + index + Math.random(),
        type: item.type || 'log',
        text: item.text || ''
      }))
    ]);
  };

  useEffect(() => {
    if (!fullscreen && !fullscreenClosing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen, fullscreenClosing]);

  useEffect(() => () => {
    if (fullscreenCloseTimerRef.current !== null) {
      window.clearTimeout(fullscreenCloseTimerRef.current);
    }
  }, []);

  useEffect(() => () => {
    runnerAbortRef.current?.abort();
    const sessionId = activeSessionRef.current;
    if (sessionId) {
      fetch('/api/code/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', sessionId })
      }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const syncTheme = () => setIsDarkTheme(isDocumentDark());
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    syncTheme();
    window.addEventListener('deepchat:general-settings-updated', syncTheme);
    mediaQuery.addEventListener('change', syncTheme);
    return () => {
      window.removeEventListener('deepchat:general-settings-updated', syncTheme);
      mediaQuery.removeEventListener('change', syncTheme);
    };
  }, []);

  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/code/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'read', sessionId: activeSessionId })
        });
        const data = await response.json();
        appendSessionOutput(data.output || []);
        if (data.ended) {
          setActiveSessionId(null);
          setIsRunning(false);
          setConsoleEntries((entries) => [...entries, { id: Date.now(), type: 'system', text: `Run finished${typeof data.exitCode === 'number' ? ` with exit code ${data.exitCode}` : ''}` }]);
        }
      } catch (error: unknown) {
        setActiveSessionId(null);
        setIsRunning(false);
        setConsoleEntries((entries) => [...entries, { id: Date.now(), type: 'error', text: serializeConsoleValue(error) }]);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [activeSessionId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'deepchat-code-preview-console') return;
      if (data.previewId !== previewId) return;
      const text = Array.isArray(data.args) ? data.args.map(serializeConsoleValue).join(' ') : '';
      setConsoleEntries((entries) => [...entries, { id: Date.now() + Math.random(), type: String(data.type || 'log'), text }]);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewId]);

  const highlightedCode = useMemo(() => {
    if (!highlighter) return '';
    const theme = isDarkTheme ? 'github-dark' : 'light-plus';
    const fallbackTheme = isDarkTheme ? 'github-dark' : 'github-light';
    try {
      return highlighter.codeToHtml(draftCode, { lang: language || 'text', theme });
    } catch {
      return highlighter.codeToHtml(draftCode, { lang: 'text', theme: fallbackTheme });
    }
  }, [draftCode, highlighter, isDarkTheme, language]);

  const fallbackSrcDoc = useMemo(() => buildPreviewDocument(draftCode, language, previewId), [draftCode, language, previewId]);
  const srcDoc = previewSrcDoc || fallbackSrcDoc;

  useEffect(() => {
    if (!isPreviewable) return;
    const abortController = new AbortController();
    setPreviewSrcDoc('');
    fetch('/api/code/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
      body: JSON.stringify({ language, code: draftCode, previewId })
    })
      .then((response) => response.json())
      .then((data) => {
        if (!abortController.signal.aborted && typeof data.srcDoc === 'string') {
          setPreviewSrcDoc(data.srcDoc);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) setPreviewSrcDoc(fallbackSrcDoc);
    });
    return () => abortController.abort();
  }, [draftCode, fallbackSrcDoc, isPreviewable, language, previewId]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draftCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([draftCode], { type: normalizedLanguage === 'svg' ? 'image/svg+xml' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getFileName(language);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const confirmDownloadFromPrompt = () => {
    handleDownload();
    setDownloadPrompt({ open: false, runtime: '' });
  };

  const openFullscreen = (withCode: boolean) => {
    if (fullscreenCloseTimerRef.current !== null) {
      window.clearTimeout(fullscreenCloseTimerRef.current);
      fullscreenCloseTimerRef.current = null;
    }
    setFullscreenClosing(false);
    setShowFullscreenCode(withCode);
    setFullscreen(true);
  };

  const closeFullscreen = () => {
    if (fullscreenClosing) return;
    setFullscreenClosing(true);
    fullscreenCloseTimerRef.current = window.setTimeout(() => {
      setFullscreen(false);
      setFullscreenClosing(false);
      fullscreenCloseTimerRef.current = null;
    }, FULLSCREEN_EXIT_MS);
  };

  const handleEdit = () => {
    setMode('code');
    openFullscreen(true);
  };

  const runPreview = () => {
    setConsoleEntries([{ id: Date.now(), type: 'system', text: 'Run started' }]);
    setRunId((current) => current + 1);
    setMode('preview');
  };

  const stopCodeRun = () => {
    if (activeSessionId) {
      fetch('/api/code/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', sessionId: activeSessionId })
      }).catch(() => undefined);
      setActiveSessionId(null);
    }
    runnerAbortRef.current?.abort();
    runnerAbortRef.current = null;
    setIsRunning(false);
    setConsoleEntries((entries) => [...entries, { id: Date.now(), type: 'system', text: 'Run stopped' }]);
  };

  const startInteractiveRun = async () => {
    openFullscreen(true);
    setConsoleOpen(true);
    setIsRunning(true);
    setTerminalInput('');
    setConsoleEntries([
      { id: Date.now(), type: 'system', text: 'Run started' },
      { id: Date.now() + 1, type: 'system', text: 'Initializing environment' }
    ]);

    try {
      const response = await fetch('/api/code/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', language: normalizedLanguage, code: draftCode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Runner session failed');
      appendSessionOutput(data.output || []);
      if (data.ended) {
        setIsRunning(false);
        setConsoleEntries((entries) => [...entries, { id: Date.now() + 2, type: 'system', text: `Run finished${typeof data.exitCode === 'number' ? ` with exit code ${data.exitCode}` : ''}` }]);
        return;
      }
      setActiveSessionId(data.sessionId);
    } catch (error: unknown) {
      setIsRunning(false);
      setConsoleEntries((entries) => [...entries, { id: Date.now() + 3, type: 'error', text: serializeConsoleValue(error) }]);
    }
  };

  const submitTerminalInput = async () => {
    if (!activeSessionId || !terminalInput.trim()) return;
    const value = terminalInput;
    setTerminalInput('');
    setConsoleEntries((entries) => [...entries, { id: Date.now(), type: 'input', text: value }]);
    try {
      const response = await fetch('/api/code/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'input', sessionId: activeSessionId, input: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Runner input failed');
      appendSessionOutput(data.output || []);
      if (data.ended) {
        setActiveSessionId(null);
        setIsRunning(false);
        setConsoleEntries((entries) => [...entries, { id: Date.now() + 1, type: 'system', text: `Run finished${typeof data.exitCode === 'number' ? ` with exit code ${data.exitCode}` : ''}` }]);
      }
    } catch (error: unknown) {
      setActiveSessionId(null);
      setIsRunning(false);
      setConsoleEntries((entries) => [...entries, { id: Date.now() + 2, type: 'error', text: serializeConsoleValue(error) }]);
    }
  };

  const runCode = async () => {
    runnerAbortRef.current?.abort();

    if (isCodeRunner) {
      await startInteractiveRun();
      return;
    }

    openFullscreen(true);
    setConsoleOpen(true);

    setIsRunning(true);
    setConsoleEntries([
      { id: Date.now(), type: 'system', text: 'Run started' },
      { id: Date.now() + 1, type: 'system', text: 'Initializing environment' }
    ]);

    const start = performance.now();
    const abortController = new AbortController();
    runnerAbortRef.current = abortController;

    try {
      setConsoleEntries((entries) => [...entries, { id: Date.now() + 2, type: 'system', text: 'Running code' }]);
      const response = await fetch('/api/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ language: normalizedLanguage, code: draftCode, input: '' })
      });
      const data = await response.json();
      if (!response.ok && data?.needsInput) {
        setConsoleEntries((entries) => [
          ...entries,
          { id: Date.now() + 3, type: 'warn', text: 'This program is waiting for input. Type in the console and press Enter.' }
        ]);
        return;
      }
      if (!response.ok) throw new Error(data?.error || 'Runner request failed');

      const duration = typeof data.durationMs === 'number' ? data.durationMs : Math.round(performance.now() - start);
      setConsoleEntries((entries) => [
        ...entries,
        ...(data.stdout ? [{ id: Date.now() + 3, type: 'log', text: data.stdout }] : []),
        ...(data.stderr ? [{ id: Date.now() + 4, type: data.success ? 'warn' : 'error', text: data.stderr }] : []),
        { id: Date.now() + 5, type: 'system', text: `Run completed in ${duration}ms` }
      ]);
    } catch (error: unknown) {
      if (abortController.signal.aborted) return;
      setConsoleEntries((entries) => [...entries, { id: Date.now() + 6, type: 'error', text: serializeConsoleValue(error) }]);
    } finally {
      if (runnerAbortRef.current === abortController) {
        runnerAbortRef.current = null;
      }
      if (!abortController.signal.aborted) {
        setIsRunning(false);
      }
    }
  };

  const displayLanguage = language || 'text';
  const clearConsole = () => setConsoleEntries([]);

  const downloadPromptContent = downloadPrompt.open ? (
    <div className="deepchat-download-modal-backdrop fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="deepchat-download-modal-panel w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="mb-4 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
            <FileDown className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">Runtime unavailable</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {downloadPrompt.runtime || displayLanguage} is not installed in this sandbox. You can download the generated file and run it locally.
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 font-mono text-xs text-slate-500 ring-1 ring-slate-100">
          {getFileName(language)}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDownloadPrompt({ open: false, runtime: '' })}
            className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={confirmDownloadFromPrompt}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Download file
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const fullscreenContent = (fullscreen || fullscreenClosing) ? (
    <div className="deepchat-fullscreen-shell fixed inset-0 z-[999999] bg-white" data-state={fullscreenClosing ? 'closing' : 'open'}>
      <div className="deepchat-fullscreen-toolbar flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (isCodeRunner && isRunning) stopCodeRun();
              closeFullscreen();
            }}
            title="Close"
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-900 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowFullscreenCode((current) => !current)}
            title={showFullscreenCode ? 'Hide code' : 'Show code'}
            aria-label={showFullscreenCode ? 'Hide code' : 'Show code'}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-bold ring-1 ring-slate-200 transition-all duration-300 ${showFullscreenCode ? 'bg-slate-200 text-slate-950' : 'bg-slate-100 text-slate-950 hover:bg-slate-200'}`}
          >
            {showFullscreenCode ? <ArrowLeftToLine className="h-4 w-4" /> : <ArrowRightToLine className="h-4 w-4" />}
            {showFullscreenCode ? 'Hide code' : 'Show code'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {!isCodeRunner && (
            <IconButton title="Toggle console" onClick={() => setConsoleOpen((current) => !current)} active={consoleOpen}>
              <PanelBottom className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton title={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </IconButton>
          {!isCodeRunner && (
            <IconButton title="Download file" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      <div className={`deepchat-fullscreen-stage relative h-[calc(100vh-48px)] ${showFullscreenCode || isCodeRunner ? 'p-3 pt-0' : 'p-0'}`}>
        <div className={`deepchat-fullscreen-workspace flex h-full overflow-hidden p-0 transition-[gap] duration-300 ${showFullscreenCode ? 'gap-3 rounded-[24px] bg-white shadow-sm ring-1 ring-slate-200' : 'gap-0 rounded-none bg-transparent shadow-none ring-0'}`}>
          <div data-open={showFullscreenCode ? 'true' : 'false'} className={`deepchat-fullscreen-editor-pane min-h-0 shrink-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white transition-[width,opacity,transform] duration-300 ease-out ${showFullscreenCode ? 'w-[38%] translate-x-0 opacity-100' : 'w-0 -translate-x-6 border-transparent opacity-0'}`}>
            <div className="h-full min-w-[320px] overflow-auto">
              <CodeSurface code={draftCode} html={highlightedCode} editing onChange={setDraftCode} fill />
            </div>
          </div>
          <div className="deepchat-fullscreen-viewer-pane min-h-0 min-w-0 flex-1 overflow-hidden rounded-[22px] bg-white">
            {isCodeRunner ? (
              <ConsolePanel entries={consoleEntries} isRunning={isRunning} large terminalInput={terminalInput} onTerminalInputChange={setTerminalInput} onTerminalSubmit={submitTerminalInput} onClear={clearConsole} onRun={runCode} onStop={stopCodeRun} />
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="min-h-0 flex-1 overflow-hidden rounded-[22px]">
                  <PreviewFrame key={`fullscreen-${runId}`} srcDoc={srcDoc} compact />
                </div>
                <div className={`deepchat-fullscreen-console shrink-0 overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-out ${consoleOpen ? 'max-h-56 translate-y-0 opacity-100' : 'max-h-0 translate-y-3 opacity-0 pointer-events-none'}`}>
                  <ConsolePanel entries={consoleEntries} isRunning={false} showRun={false} onClear={clearConsole} onClose={() => setConsoleOpen(false)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="not-prose mb-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
            {isStreaming ? <CodeStreamingSpinner /> : <Code2 className="h-4 w-4" />}
          </span>
          <span className="truncate rounded-full bg-slate-100 px-3 py-1.5 font-sans text-xs font-black uppercase tracking-wide text-slate-900 ring-1 ring-slate-200">{displayLanguage}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isCodeRunner ? (
            <>
              <IconButton title={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </IconButton>
              <IconButton title="Run" onClick={runCode}>
                <Play className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <>
              {isPreviewable && (
                <ModeSwitch mode={mode} onShowCode={() => setMode('code')} onRunPreview={runPreview} />
              )}
              {mode === 'code' ? (
                <IconButton title={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </IconButton>
              ) : (
                <IconButton title="Download file" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton title="Edit" onClick={handleEdit}>
                <Edit3 className="h-4 w-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div className={mode === 'preview' && isPreviewable ? 'p-3 pt-0' : 'border-t border-slate-100'}>
        {mode === 'preview' && isPreviewable ? (
          <div className="relative">
            <PreviewFrame key={runId} srcDoc={srcDoc} />
            <button
              type="button"
              onClick={() => openFullscreen(false)}
              title="Fullscreen"
              aria-label="Fullscreen"
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-800 shadow-sm transition hover:bg-slate-100"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <CodeSurface code={draftCode} html={highlightedCode} editing={false} onChange={setDraftCode} />
        )}
      </div>

      {fullscreenContent && createPortal(fullscreenContent, document.body)}
      {downloadPromptContent && createPortal(downloadPromptContent, document.body)}
    </div>
  );
}
