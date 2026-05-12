'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { createHighlighter, Highlighter } from 'shiki';
import 'katex/dist/katex.min.css';
import { ClientOnly } from '@/lib/utils';
import CodePreview from '@/components/ui/CodePreview';

let highlighterPromise: Promise<Highlighter> | null = null;

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
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
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');

  return (
    <ClientOnly>
      <div className="prose prose-slate max-w-none dark:prose-invert prose-pre:bg-transparent prose-pre:p-0 prose-p:leading-relaxed prose-a:text-indigo-600 hover:prose-a:text-indigo-700 prose-strong:text-slate-800 dark:prose-strong:text-slate-200 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            code({ className, children, ...props }: React.ComponentProps<'code'>) {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';
              const isInline = !match;

              if (!isInline) {
                return <CodeBlock language={language} value={String(children).replace(/\n$/, '')} highlighter={highlighter} isStreaming={isStreaming} />;
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
              return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline font-medium">{children}</a>;
            }
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </ClientOnly>
  );
});

function CodeBlock({ language, value, highlighter, isStreaming }: { language: string, value: string, highlighter: Highlighter | null, isStreaming: boolean }) {
  return <CodePreview language={language} value={value} highlighter={highlighter} isStreaming={isStreaming} />;
}

export default MarkdownRenderer;
