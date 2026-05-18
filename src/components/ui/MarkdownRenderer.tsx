'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { createHighlighter, Highlighter } from 'shiki';
import 'katex/dist/katex.min.css';
import { ClientOnly } from '@/lib/utils';
import CodePreview from '@/components/ui/CodePreview';
import DataAnalysisResult, { DataAnalysisActions } from '@/components/ui/DataAnalysisResult';

let highlighterPromise: Promise<Highlighter> | null = null;
const ANALYSIS_ACTIONS_INLINE_PREFIX = 'deepchat-analysis-actions:';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  searchSources?: SearchSource[];
}

interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
}

const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, isStreaming = false, searchSources = [] }: MarkdownRendererProps) {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

  useEffect(() => {
    if (!highlighterPromise) {
      highlighterPromise = createHighlighter({
        themes: ['github-light', 'github-dark', 'light-plus'],
        langs: ['javascript', 'typescript', 'html', 'css', 'json', 'markdown', 'python', 'bash', 'shell', 'yaml']
      });
    }
    highlighterPromise.then(setHighlighter).catch(console.error);
  }, []);

  const processedContent = content
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
    .replace(/\[([^\[\]\n]{1,64})\](?!\()/g, (match, value) => {
      const references = getSourceReferences(value, searchSources);
      if (references.length === 0) return match;
      return references.map(reference => `[${reference.label}](${formatMarkdownHref(searchSources[reference.index].url)})`).join(' ');
    });

  return (
    <ClientOnly>
      <div className="prose prose-slate max-w-none dark:prose-invert prose-pre:bg-transparent prose-pre:p-0 prose-p:leading-relaxed prose-a:text-indigo-600 hover:prose-a:text-indigo-700 prose-strong:text-slate-800 dark:prose-strong:text-slate-200 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={transformMarkdownUrl}
          components={{
            code({ className, children, ...props }: React.ComponentProps<'code'>) {
              const match = /language-([\w-]+)/.exec(className || '');
              const language = match ? match[1] : '';
              const isInline = !match;

              if (!isInline) {
                return <CodeBlock language={language} value={String(children).replace(/\n$/, '')} highlighter={highlighter} isStreaming={isStreaming} />;
              }

              const inlineValue = getChildrenText(children);
              if (inlineValue.startsWith(ANALYSIS_ACTIONS_INLINE_PREFIX)) {
                const value = decodeAnalysisPayload(inlineValue.slice(ANALYSIS_ACTIONS_INLINE_PREFIX.length));
                return value ? <DataAnalysisActions value={value} /> : null;
              }

              return (
                <code className="bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-slate-200 dark:border-slate-700" {...props}>
                  {children}
                </code>
              );
            },
            p({ children }) {
              return <p className="mb-4 last:mb-0 leading-relaxed text-[15px] dark:text-slate-300">{children}</p>;
            },
            ul({ children }) {
              return <ul className="list-disc pl-6 mb-4 space-y-1 dark:text-slate-300">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal pl-6 mb-4 space-y-1 dark:text-slate-300">{children}</ol>;
            },
            li({ children }) {
              return <li className="leading-relaxed text-[15px]">{children}</li>;
            },
            h1({ children }) {
              return <h1 className="text-2xl font-bold mt-6 mb-4 text-slate-800 dark:text-slate-100">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-xl font-bold mt-5 mb-3 text-slate-800 dark:text-slate-100">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-lg font-bold mt-4 mb-2 text-slate-800 dark:text-slate-100">{children}</h3>;
            },
            blockquote({ children }) {
              return <blockquote className="border-l-4 border-indigo-200 dark:border-indigo-500/30 pl-4 py-1 italic text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50 rounded-r-lg my-4">{children}</blockquote>;
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto mb-4 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <table className="w-full text-left text-sm whitespace-nowrap">{children}</table>
                </div>
              );
            },
            th({ children }) {
              return <th className="bg-slate-50 dark:bg-slate-800/80 p-3 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">{children}</th>;
            },
            td({ children }) {
              return <td className="p-3 border-b border-slate-100 dark:border-slate-700/50 text-slate-600 dark:text-slate-400">{children}</td>;
            },
            a({ href, children }) {
              const linkedSource = typeof href === 'string' ? getSourceByUrl(href, searchSources) : null;
              if (linkedSource && isCitationText(children)) {
                return <CitationLink source={linkedSource} />;
              }
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline font-medium">{children}</a>;
            },
            img({ src, alt }) {
              const imageSrc = typeof src === 'string' ? src : '';
              if (!imageSrc) return null;
              return <GeneratedMarkdownImage src={imageSrc} alt={alt || 'Generated image'} />;
            }
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </ClientOnly>
  );
});

function GeneratedMarkdownImage({ src, alt }: { src: string; alt: string }) {
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1024 });
  const ratio = imageSize.width / imageSize.height;
  const displayWidth = ratio < 1
    ? Math.min(Math.max(imageSize.width, 260), Math.max(260, Math.round(520 * ratio)))
    : Math.min(Math.max(imageSize.width, 260), 760);

  return (
    <span
      className="not-prose my-4 block max-w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-950"
      style={{
        width: `min(100%, ${displayWidth}px)`
      }}
    >
      {React.createElement('img', {
        src,
        alt,
        loading: 'lazy',
        decoding: 'async',
        onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => {
          const target = event.currentTarget;
          if (target.naturalWidth > 0 && target.naturalHeight > 0) {
            setImageSize({ width: target.naturalWidth, height: target.naturalHeight });
          }
        },
        className: 'block h-auto max-h-[72vh] w-full rounded-[1.35rem] object-contain'
      })}
    </span>
  );
}

function CitationLink({ source }: { source: SearchSource }) {
  const displayLabel = getCitationLabel(source);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const cardWidth = Math.min(360, window.innerWidth - margin * 2);
    const cardHeight = 172;
    let left = rect.right + gap;
    let top = rect.top + rect.height / 2 - cardHeight / 2;
    if (window.innerWidth < 640) {
      left = rect.left + rect.width / 2 - cardWidth / 2;
      top = rect.bottom + gap;
    } else if (left + cardWidth > window.innerWidth - margin) {
      left = rect.left - cardWidth - gap;
    }
    if (left < margin) left = margin;
    if (left + cardWidth > window.innerWidth - margin) left = window.innerWidth - cardWidth - margin;
    if (top < margin) top = margin;
    if (top + cardHeight > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - cardHeight - margin);
    setCardStyle({
      left,
      top,
      width: cardWidth
    });
  };
  const openCard = () => {
    updatePosition();
    setIsOpen(true);
  };
  const closeCard = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <span className="not-prose relative mx-1 inline-flex align-baseline">
      <a
        ref={anchorRef}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-5 max-w-32 items-center justify-center rounded-full !bg-slate-100 px-2 !text-[11px] font-bold leading-none !text-slate-500 !no-underline ring-1 ring-slate-200 transition duration-150 ease-out hover:!bg-slate-200 hover:!text-slate-800 dark:!bg-slate-800 dark:!text-slate-300 dark:ring-slate-700 dark:hover:!bg-slate-700 dark:hover:!text-slate-100"
        aria-label={`Source: ${source.title}`}
        onMouseEnter={openCard}
        onMouseLeave={closeCard}
        onFocus={openCard}
        onBlur={closeCard}
      >
        <span className="truncate">{displayLabel}</span>
      </a>
      <span
        style={cardStyle}
        className={`pointer-events-none fixed z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl shadow-slate-900/12 transition duration-150 ease-out dark:border-slate-700 dark:bg-slate-950 ${isOpen ? 'translate-x-0 scale-100 opacity-100' : '-translate-x-1 scale-95 opacity-0'}`}
      >
        <span className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            <Image src={getFaviconUrl(source)} alt="" width={16} height={16} unoptimized className="h-4 w-4 rounded-sm" />
          </span>
          <span className="block min-w-0 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{source.displayUrl || getSourceHost(source.url)}</span>
        </span>
        <span className="block px-3 pt-3 text-sm font-extrabold leading-snug text-slate-900 dark:text-slate-100">{source.title}</span>
        {source.snippet && (
          <span className="block px-3 pb-3 pt-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">{source.snippet}</span>
        )}
      </span>
    </span>
  );
}

function getSourceReferences(label: string, sources: SearchSource[]) {
  const tokens = label.split(/[,;]+/).map(item => item.trim()).filter(Boolean);
  const candidates = tokens.length > 1 ? tokens : [label.trim()];
  const references = candidates.map(candidate => {
    const index = getSourceIndex(candidate, sources);
    if (index < 0) return null;
    return {
      index,
      label: getCitationLabel(sources[index])
    };
  }).filter((item): item is { index: number; label: string } => Boolean(item));
  const seen = new Set<number>();
  return references.filter(reference => {
    if (seen.has(reference.index)) return false;
    seen.add(reference.index);
    return true;
  });
}

function getSourceIndex(label: string, sources: SearchSource[]) {
  const normalized = normalizeCitationText(label);
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= sources.length) return numeric - 1;
  return sources.findIndex(source => {
    const sourceValues = [
      source.title,
      source.displayUrl,
      getSourceHost(source.url),
      getSourceHost(source.url).split('.')[0]
    ].filter((value): value is string => typeof value === 'string' && value.length > 0).map(normalizeCitationText).filter(Boolean);
    return sourceValues.some(value => value === normalized || value.includes(normalized) || normalized.includes(value));
  });
}

function getSourceByUrl(url: string, sources: SearchSource[]) {
  const normalized = normalizeUrl(url);
  return sources.find(source => normalizeUrl(source.url) === normalized) || null;
}

function formatMarkdownHref(url: string) {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
}

function transformMarkdownUrl(url: string) {
  const value = url.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s/g, '');
  if (/^(https?:|mailto:|irc:|ircs:|xmpp:)/i.test(value)) return value;
  if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(value)) return value;
  return '';
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  }
}

function isCitationText(children: React.ReactNode) {
  const text = getChildrenText(children);
  return /^[\[\](),;\s0-9a-zA-Z.-]{1,64}$/.test(text);
}

function getChildrenText(children: React.ReactNode) {
  return React.Children.toArray(children).map(item => typeof item === 'string' || typeof item === 'number' ? String(item) : '').join('').trim();
}

function getCitationLabel(source: SearchSource) {
  return source.displayUrl || getSourceHost(source.url) || source.title || 'source';
}

function normalizeCitationText(value: string) {
  return value.toLowerCase().replace(/^www\./, '').replace(/\.(com|co\.id|id|net|org|io)$/i, '').replace(/[^a-z0-9]+/g, '');
}

function getFaviconUrl(source: SearchSource) {
  const host = getSourceHost(source.url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function decodeAnalysisPayload(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function CodeBlock({ language, value, highlighter, isStreaming }: { language: string, value: string, highlighter: Highlighter | null, isStreaming: boolean }) {
  if (language === 'deepchat-analysis') return <DataAnalysisResult value={value} />;
  if (language === 'deepchat-analysis-actions') return <DataAnalysisActions value={value} />;
  return <CodePreview language={language} value={value} highlighter={highlighter} isStreaming={isStreaming} />;
}

export default MarkdownRenderer;
