'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Code2, Download, FileSpreadsheet, FileText, Image as ImageIcon, Maximize2, MousePointer2, Palette, SlidersHorizontal, Terminal, X } from 'lucide-react';

type AnalysisChart = {
  title?: string;
  type?: string;
  staticUrl?: string;
  interactiveUrl?: string;
};

type AnalysisExport = {
  label?: string;
  url?: string;
  mimeType?: string;
};

type AnalysisDataset = {
  name?: string;
  shape?: { rows?: number; columns?: number };
  columns?: string[];
  insights?: string[];
  warnings?: string[];
  charts?: AnalysisChart[];
};

type AnalysisArtifact = {
  title?: string;
  success?: boolean;
  error?: string;
  installHint?: string;
  datasets?: AnalysisDataset[];
  exports?: AnalysisExport[];
  warnings?: string[];
  stderr?: string;
  execution?: {
    code?: string;
    stdout?: string;
    stderr?: string;
  };
};

const filters = [
  { id: 'default', label: 'Default', className: '' },
  { id: 'cool', label: 'Cool', className: 'saturate-[1.08] hue-rotate-[8deg]' },
  { id: 'warm', label: 'Warm', className: 'saturate-[1.1] sepia-[0.08]' },
  { id: 'contrast', label: 'Contrast', className: 'contrast-[1.08] saturate-[1.08]' }
];

function IconButton({ title, active = false, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${active ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}
    >
      {children}
    </button>
  );
}

function parseArtifact(value: string): AnalysisArtifact | null {
  try {
    return JSON.parse(value) as AnalysisArtifact;
  } catch {
    return null;
  }
}

function downloadUrl(url: string, name = 'analysis-artifact') {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getPrimaryDataset(data: AnalysisArtifact | null) {
  return data?.datasets?.[0] || null;
}

function getCharts(data: AnalysisArtifact | null) {
  return data?.datasets?.flatMap(dataset => dataset.charts || []) || [];
}

function getExportTitle(item: AnalysisExport, index: number) {
  const mime = item.mimeType || '';
  if (mime.includes('pdf')) return 'Download PDF';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'Download Excel';
  return `Download file ${index + 1}`;
}

function ExportIcon({ item }: { item: AnalysisExport }) {
  const mime = item.mimeType || '';
  if (mime.includes('pdf')) return <FileText className="h-4 w-4" />;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return <FileSpreadsheet className="h-4 w-4" />;
  return <Download className="h-4 w-4" />;
}

function AnalysisModal({ data, onClose }: { data: AnalysisArtifact; onClose: () => void }) {
  const code = data.execution?.code || '';
  const stdout = data.execution?.stdout || '';
  const stderr = data.execution?.stderr || data.stderr || data.error || '';

  return (
    <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Code2 className="h-4 w-4" />
            </span>
            <h2 className="truncate text-base font-extrabold text-slate-950">Analysis</h2>
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 custom-scrollbar lg:grid-cols-2">
          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-extrabold uppercase text-slate-500">
              <Code2 className="h-3.5 w-3.5" />
              Python
            </div>
            <pre className="max-h-[62vh] overflow-auto whitespace-pre rounded-none bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 custom-scrollbar">{code || 'No Python code was recorded.'}</pre>
          </section>
          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-extrabold uppercase text-slate-500">
              <Terminal className="h-3.5 w-3.5" />
              Output
            </div>
            <div className="max-h-[62vh] overflow-auto bg-slate-50 p-4 font-mono text-xs leading-6 custom-scrollbar">
              {stdout && <pre className="whitespace-pre-wrap text-slate-800">{stdout}</pre>}
              {stderr && <pre className="mt-3 whitespace-pre-wrap text-red-600">{stderr}</pre>}
              {!stdout && !stderr && <p className="font-sans text-sm font-semibold text-slate-400">No output was recorded.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ChartCanvas({ chart, interactive, filterClass, expanded = false }: { chart?: AnalysisChart; interactive: boolean; filterClass: string; expanded?: boolean }) {
  if (!chart) {
    return (
      <div className="flex h-80 items-center justify-center text-sm font-bold text-slate-400">
        No chart available
      </div>
    );
  }
  if ((interactive || !chart.staticUrl) && chart.interactiveUrl) {
    return (
      <iframe
        title={chart.title || 'Interactive chart'}
        src={chart.interactiveUrl}
        className={`h-full min-h-[360px] w-full border-0 bg-white ${expanded ? 'min-h-[calc(100vh-72px)]' : ''}`}
      />
    );
  }
  if (chart.staticUrl) {
    return (
      <div className={`flex h-full min-h-[360px] items-center justify-center bg-white ${expanded ? 'min-h-[calc(100vh-72px)]' : ''}`}>
        <img src={chart.staticUrl} alt={chart.title || 'Analysis chart'} className={`max-h-full max-w-full object-contain transition ${filterClass}`} />
      </div>
    );
  }
  return (
    <div className="flex h-80 items-center justify-center text-sm font-bold text-slate-400">
      Chart file unavailable
    </div>
  );
}

export function DataAnalysisActions({ value }: { value: string }) {
  const data = useMemo(() => parseArtifact(value), [value]);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  if (!data) return null;

  return (
    <span className="not-prose ml-1 inline-flex align-[-0.18em]">
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 p-0.5 shadow-sm">
        <button type="button" onClick={() => setAnalysisOpen(true)} title="View analysis" aria-label="View analysis" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
          <Code2 className="h-3 w-3" />
        </button>
      </span>
      {analysisOpen && createPortal(<AnalysisModal data={data} onClose={() => setAnalysisOpen(false)} />, document.body)}
    </span>
  );
}

export default function DataAnalysisResult({ value }: { value: string }) {
  const data = useMemo(() => parseArtifact(value), [value]);
  const charts = useMemo(() => getCharts(data), [data]);
  const dataset = getPrimaryDataset(data);
  const [activeChart, setActiveChart] = useState(0);
  const [interactive, setInteractive] = useState(false);
  const [filter, setFilter] = useState(filters[0].id);
  const [colorOpen, setColorOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const colorRef = useRef<HTMLDivElement | null>(null);
  const chart = charts[activeChart] || charts[0];
  const filterClass = filters.find(item => item.id === filter)?.className || '';
  const exports = data?.exports?.filter(item => item.url) || [];
  const warnings = [...(data?.warnings || []), ...(dataset?.warnings || [])].filter(Boolean);

  useEffect(() => {
    if (!colorOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(event.target as Node)) setColorOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [colorOpen]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  if (!data) {
    return (
      <div className="not-prose rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
        Invalid analysis artifact.
      </div>
    );
  }

  if (data.success === false) {
    return (
      <div className="not-prose rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-extrabold">Code Execution failed</p>
        <p className="mt-2 whitespace-pre-wrap font-mono text-xs">{data.error || 'Unknown analysis error'}</p>
        {data.installHint && <p className="mt-3 font-semibold text-red-600">{data.installHint}</p>}
      </div>
    );
  }

  const title = chart?.title || data.title || dataset?.name || 'Data Analysis';
  const fullscreen = expanded ? (
    <div className="fixed inset-0 z-[999999] bg-white">
      <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => setExpanded(false)} title="Close" aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
          <h2 className="truncate text-base font-extrabold text-slate-950">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <IconButton title="Switch to Interactive Chart" active={interactive} onClick={() => setInteractive(current => !current)}>
            <MousePointer2 className="h-4 w-4" />
          </IconButton>
          <IconButton title="Download Chart" onClick={() => downloadUrl(chart?.staticUrl || exports[0]?.url || '', `${title}.png`)}>
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="grid h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-hidden bg-white">
          <ChartCanvas chart={chart} interactive={interactive} filterClass={filterClass} expanded />
        </div>
        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-100 bg-slate-50 p-5 lg:block">
          {exports.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {exports.map((item, index) => (
                <a key={index} href={item.url} title={getExportTitle(item, index)} aria-label={getExportTitle(item, index)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-indigo-600 hover:ring-indigo-200">
                  <ExportIcon item={item} />
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  ) : null;

  return (
    <div className="not-prose my-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold text-slate-950">{title}</h3>
        </div>
        <div className="relative flex shrink-0 items-center gap-1" ref={colorRef}>
          <IconButton title="Switch to Interactive Chart" active={interactive} onClick={() => setInteractive(current => !current)}>
            <MousePointer2 className="h-4 w-4" />
          </IconButton>
          <IconButton title="Customize Chart Colors" active={colorOpen} onClick={() => setColorOpen(current => !current)}>
            <SlidersHorizontal className="h-4 w-4" />
          </IconButton>
          <IconButton title="Download Chart" onClick={() => downloadUrl(chart?.staticUrl || exports[0]?.url || '', `${title}.png`)}>
            <Download className="h-4 w-4" />
          </IconButton>
          <IconButton title="Expand Chart" onClick={() => setExpanded(true)}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
          {colorOpen && (
            <div className="absolute right-9 top-10 z-20 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase text-slate-400">
                <Palette className="h-3.5 w-3.5" />
                Chart Style
              </p>
              <div className="grid grid-cols-2 gap-2">
                {filters.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-extrabold transition ${filter === item.id ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {charts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 custom-scrollbar">
          {charts.map((item, index) => (
            <button
              key={`${item.title || 'chart'}-${index}`}
              type="button"
              onClick={() => setActiveChart(index)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${activeChart === index ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              {item.type === 'heatmap' ? <ImageIcon className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
              <span>{item.type || 'chart'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="h-[360px] border-t border-slate-100 bg-white sm:h-[420px]">
        <ChartCanvas chart={chart} interactive={interactive} filterClass={filterClass} />
      </div>
      {warnings.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {warnings.join(' ')}
          </div>
        </div>
      )}
      {fullscreen && createPortal(fullscreen, document.body)}
    </div>
  );
}
