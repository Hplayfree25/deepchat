'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
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

type WorkbookCellPreview = {
  row: number;
  column: number;
  address: string;
  value?: unknown;
  formula?: string;
  displayValue?: unknown;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  fillColor?: string;
  horizontalAlign?: string;
  numberFormat?: string;
};

type WorkbookChartPreview = {
  title?: string;
  type?: string;
  anchor?: string;
};

type WorkbookSheetPreview = {
  name: string;
  rowCount?: number;
  columnCount?: number;
  previewRowCount?: number;
  previewColumnCount?: number;
  columnWidths?: Record<string, number>;
  mergedRanges?: string[];
  charts?: WorkbookChartPreview[];
  cells?: WorkbookCellPreview[];
};

type WorkbookPreview = {
  fileName?: string;
  activeSheet?: string;
  selectedCell?: string;
  displayValue?: unknown;
  sheets?: WorkbookSheetPreview[];
};

type AnalysisDataset = {
  name?: string;
  shape?: { rows?: number; columns?: number };
  columns?: string[];
  sample?: Record<string, unknown>[];
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
  workbookPreview?: WorkbookPreview;
  warnings?: string[];
  stderr?: string;
  execution?: {
    code?: string;
    stdout?: string;
    stderr?: string;
  };
};

const chartColors = [
  { id: 'blue', label: 'Blue', swatch: 'bg-blue-500', className: '' },
  { id: 'violet', label: 'Violet', swatch: 'bg-violet-500', className: 'hue-rotate-[34deg] saturate-[1.08]' },
  { id: 'green', label: 'Green', swatch: 'bg-emerald-500', className: 'hue-rotate-[116deg] saturate-[1.12]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-500', className: 'hue-rotate-[176deg] saturate-[1.15]' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-500', className: 'hue-rotate-[246deg] saturate-[1.1]' },
  { id: 'contrast', label: 'Contrast', swatch: 'bg-slate-800', className: 'contrast-[1.12] saturate-[1.05]' }
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

function getSpreadsheetExport(data: AnalysisArtifact | null) {
  return data?.exports?.find(item => {
    const mime = item.mimeType || '';
    const url = item.url || '';
    return Boolean(item.url) && (mime.includes('spreadsheet') || mime.includes('excel') || url.endsWith('.xlsx'));
  }) || null;
}

function normalizeChartKey(chart: AnalysisChart) {
  return [
    chart.type || 'chart',
    (chart.title || '').toLowerCase().replace(/interactive|interaktif|static|statis/g, '').replace(/[^a-z0-9]+/g, '')
  ].join(':');
}

function mergeCharts(charts: AnalysisChart[]) {
  const merged: AnalysisChart[] = [];
  charts.forEach(chart => {
    const key = normalizeChartKey(chart);
    const match = merged.find(item => normalizeChartKey(item) === key || ((item.type || 'chart') === (chart.type || 'chart') && Boolean(item.staticUrl) !== Boolean(chart.staticUrl) && Boolean(item.interactiveUrl) !== Boolean(chart.interactiveUrl)));
    if (match) {
      match.staticUrl = match.staticUrl || chart.staticUrl;
      match.interactiveUrl = match.interactiveUrl || chart.interactiveUrl;
      match.title = (match.title || '').toLowerCase().includes('interactive') || (match.title || '').toLowerCase().includes('interaktif') ? chart.title || match.title : match.title || chart.title;
      match.type = match.type || chart.type;
      return;
    }
    merged.push({ ...chart });
  });
  return merged;
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

function ExcelIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-lg bg-[#107c41] text-white shadow-sm ${className}`}>
      <span className="absolute right-1 top-1 grid h-5 w-4 grid-cols-2 gap-px opacity-70">
        <span className="bg-white/45" />
        <span className="bg-white/35" />
        <span className="bg-white/30" />
        <span className="bg-white/25" />
      </span>
      <span className="relative text-[11px] font-black leading-none">X</span>
    </span>
  );
}

function formatWorkbookValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function columnLabel(index: number) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label || 'A';
}

function getWorkbookSheet(workbook?: WorkbookPreview | null, sheetName?: string) {
  const sheets = workbook?.sheets || [];
  return sheets.find(sheet => sheet.name === sheetName) || sheets.find(sheet => sheet.name === workbook?.activeSheet) || sheets[0] || null;
}

function getWorkbookCellMap(sheet: WorkbookSheetPreview | null) {
  const map = new Map<string, WorkbookCellPreview>();
  (sheet?.cells || []).forEach(cell => {
    if (cell.address) map.set(cell.address, cell);
  });
  return map;
}

function isDarkFill(color?: string) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return false;
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  return (red * 0.299 + green * 0.587 + blue * 0.114) < 132;
}

function getCellClass(cell?: WorkbookCellPreview) {
  const align = cell?.horizontalAlign === 'center' ? 'text-center' : cell?.horizontalAlign === 'right' ? 'text-right' : 'text-left';
  const color = isDarkFill(cell?.fillColor) ? 'text-white' : cell?.bold ? 'text-slate-950' : 'text-slate-900';
  return [align, cell?.bold ? `font-extrabold ${color}` : `font-medium ${color}`, cell?.italic ? 'italic' : ''].filter(Boolean).join(' ');
}

function getCellStyle(cell?: WorkbookCellPreview): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (cell?.fillColor && cell.fillColor.toLowerCase() !== '#000000') style.backgroundColor = cell.fillColor;
  if (cell?.textColor && cell.textColor.toLowerCase() !== '#000000') style.color = cell.textColor;
  return Object.keys(style).length ? style : undefined;
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

function WorkbookInlinePreview({ workbook, onOpen }: { workbook: WorkbookPreview; onOpen: () => void }) {
  const sheet = getWorkbookSheet(workbook);
  const cellMap = useMemo(() => getWorkbookCellMap(sheet), [sheet]);
  const rowCount = Math.min(Math.max(sheet?.previewRowCount || sheet?.rowCount || 8, 8), 12);
  const columnCount = Math.min(Math.max(sheet?.previewColumnCount || sheet?.columnCount || 5, 5), 8);

  if (!sheet) {
    return (
      <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">
        No workbook preview available
      </div>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="block max-h-[420px] w-full overflow-auto bg-white text-left custom-scrollbar">
      <div className="min-w-max">
        <div className="grid border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500" style={{ gridTemplateColumns: `40px repeat(${columnCount}, minmax(88px, 1fr))` }}>
          <div className="h-7 border-r border-slate-200" />
          {Array.from({ length: columnCount }, (_, index) => (
            <div key={index} className="flex h-7 items-center justify-center border-r border-slate-200">
              {columnLabel(index + 1)}
            </div>
          ))}
        </div>
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <div key={rowIndex} className="grid min-h-8 border-b border-slate-100 text-xs" style={{ gridTemplateColumns: `40px repeat(${columnCount}, minmax(88px, 1fr))` }}>
            <div className="flex items-center justify-center border-r border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
              {rowIndex + 1}
            </div>
            {Array.from({ length: columnCount }, (_, columnIndex) => {
              const address = `${columnLabel(columnIndex + 1)}${rowIndex + 1}`;
              const cell = cellMap.get(address);
              return (
                <div key={address} className={`flex min-h-8 items-center truncate border-r border-slate-100 px-2 ${getCellClass(cell)}`} style={getCellStyle(cell)}>
                  {formatWorkbookValue(cell?.displayValue ?? cell?.value)}
                </div>
              );
            })}
          </div>
        ))}
        {Boolean(sheet?.charts?.length) && (
          <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
            {sheet?.charts?.slice(0, 3).map((chart, index) => (
              <span key={`${chart.title || 'chart'}-${index}`} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                <BarChart3 className="h-3 w-3" />
                {chart.title || chart.type || 'Chart'}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function ExcelWorkbookFullscreen({ workbook, title, downloadHref, onClose }: { workbook: WorkbookPreview; title: string; downloadHref: string; onClose: () => void }) {
  const [activeSheetName, setActiveSheetName] = useState(workbook.activeSheet || workbook.sheets?.[0]?.name || '');
  const sheet = getWorkbookSheet(workbook, activeSheetName);
  const cellMap = useMemo(() => getWorkbookCellMap(sheet), [sheet]);
  const firstCell = sheet?.cells?.[0]?.address || workbook.selectedCell || 'A1';
  const [selectedCell, setSelectedCell] = useState(firstCell);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(100);
  const rowCount = Math.min(Math.max(sheet?.previewRowCount || sheet?.rowCount || 24, 24), 200);
  const columnCount = Math.min(Math.max(sheet?.previewColumnCount || sheet?.columnCount || 12, 12), 50);
  const selected = cellMap.get(selectedCell);
  const selectedKey = `${sheet?.name || ''}!${selectedCell}`;
  const getEditableValue = (address: string, cell?: WorkbookCellPreview) => {
    const key = `${sheet?.name || ''}!${address}`;
    if (Object.prototype.hasOwnProperty.call(edits, key)) return edits[key];
    return formatWorkbookValue(cell?.displayValue ?? cell?.value);
  };
  const formulaValue = Object.prototype.hasOwnProperty.call(edits, selectedKey) ? edits[selectedKey] : formatWorkbookValue(selected?.formula || selected?.displayValue || selected?.value || workbook.displayValue);
  const gridScale = zoom / 100;
  const gridTemplateColumns = `40px ${Array.from({ length: columnCount }, (_, index) => `${Math.round(sheet?.columnWidths?.[String(index + 1)] || 96)}px`).join(' ')}`;
  const sheetNames = workbook.sheets?.map(item => item.name) || [];
  const sheetCharts = sheet?.charts || [];
  const selectSheet = (name: string) => {
    const nextSheet = getWorkbookSheet(workbook, name);
    setActiveSheetName(name);
    setSelectedCell(nextSheet?.cells?.[0]?.address || 'A1');
  };
  const updateSelectedValue = (value: string) => {
    setEdits(current => ({ ...current, [selectedKey]: value }));
  };

  return (
    <div className="fixed inset-0 z-[999999] flex flex-col bg-white text-slate-950">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
          <ExcelIcon />
          <h2 className="truncate text-sm font-extrabold sm:text-base">{workbook.fileName || title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="h-8 rounded-full border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition hover:bg-slate-50 focus:border-slate-300">
            {[75, 90, 100, 125, 150].map(item => <option key={item} value={item}>{item}%</option>)}
          </select>
          <IconButton title="Download Spreadsheet" onClick={() => downloadUrl(downloadHref, workbook.fileName || `${title}.xlsx`)}>
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 text-xs sm:px-4">
        <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white font-bold text-slate-600">
          {selectedCell}
        </div>
        <input value={formulaValue} onChange={(event) => updateSelectedValue(event.target.value)} aria-label="Cell value" className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white custom-scrollbar">
        <div className="min-w-max origin-top-left" style={{ transform: `scale(${gridScale})`, transformOrigin: 'top left', width: `${100 / gridScale}%` }}>
          <div className="sticky top-0 z-20 grid border-b border-slate-300 bg-slate-100 text-xs font-semibold text-slate-600" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-30 h-6 border-r border-slate-300 bg-slate-100" />
            {Array.from({ length: columnCount }, (_, index) => (
              <div key={index} className="flex h-6 items-center justify-center border-r border-slate-300">
                {columnLabel(index + 1)}
              </div>
            ))}
          </div>
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <div key={rowIndex} className="grid min-h-[22px] border-b border-slate-100 text-xs" style={{ gridTemplateColumns }}>
              <div className="sticky left-0 z-10 flex items-center justify-center border-r border-slate-300 bg-slate-50 font-semibold text-slate-500">
                {rowIndex + 1}
              </div>
              {Array.from({ length: columnCount }, (_, columnIndex) => {
                const address = `${columnLabel(columnIndex + 1)}${rowIndex + 1}`;
                const cell = cellMap.get(address);
                const isSelected = selectedCell === address;
                return (
                  <div
                    key={address}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCell(address)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedCell(address);
                    }}
                    className={`relative flex min-h-[22px] items-center truncate border-r border-slate-100 px-1.5 outline-none ${getCellClass(cell)} ${isSelected ? 'z-10 ring-2 ring-slate-900 ring-inset' : 'hover:bg-slate-50'}`}
                    style={getCellStyle(cell)}
                  >
                    {isSelected ? (
                      <input value={getEditableValue(address, cell)} onChange={(event) => updateSelectedValue(event.target.value)} onClick={(event) => event.stopPropagation()} aria-label={address} className="h-full min-h-[20px] w-full bg-transparent text-inherit outline-none" />
                    ) : (
                      <span className="truncate">{getEditableValue(address, cell)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {sheetCharts.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 custom-scrollbar">
          {sheetCharts.map((chart, index) => (
            <div key={`${chart.title || 'chart'}-${index}`} className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
              <BarChart3 className="h-4 w-4" />
              <span className="max-w-56 truncate">{chart.title || chart.type || 'Embedded chart'}</span>
              {chart.anchor && <span className="text-emerald-600">{chart.anchor}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 custom-scrollbar">
        {sheetNames.map(name => (
          <button
            key={name}
            type="button"
            onClick={() => selectSheet(name)}
            className={`h-8 shrink-0 border-b-2 px-4 text-xs font-extrabold transition ${name === sheet?.name ? 'border-slate-950 bg-white text-slate-950' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800'}`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpreadsheetPreview({ data, expanded = false, onOpen = () => {} }: { data: AnalysisArtifact; expanded?: boolean; onOpen?: () => void }) {
  if (data.workbookPreview?.sheets?.length) {
    return <WorkbookInlinePreview workbook={data.workbookPreview} onOpen={onOpen} />;
  }

  const dataset = getPrimaryDataset(data);
  const rows = dataset?.sample || [];
  const columns = dataset?.columns?.length ? dataset.columns : Object.keys(rows[0] || {});

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm font-bold text-slate-400">
        No table preview available
      </div>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={`block w-full overflow-auto bg-white text-left custom-scrollbar ${expanded ? 'h-[calc(100vh-48px)]' : 'max-h-[420px]'}`}>
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {columns.map(column => (
              <th key={column} className="border-b border-slate-200 px-3 py-2 text-xs font-extrabold uppercase text-slate-500">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white even:bg-slate-50/60">
              {columns.map(column => (
                <td key={`${rowIndex}-${column}`} className="max-w-56 truncate border-b border-slate-100 px-3 py-2 text-slate-700">
                  {String(row[column] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </button>
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
  if (interactive && chart.interactiveUrl) {
    return (
      <iframe
        title={chart.title || 'Interactive chart'}
        src={chart.interactiveUrl}
        className={`h-full min-h-[360px] w-full border-0 bg-white transition ${filterClass} ${expanded ? 'min-h-[calc(100vh-72px)]' : ''}`}
      />
    );
  }
  if (chart.staticUrl) {
    return (
      <div className={`flex h-full min-h-[360px] items-center justify-center bg-white ${expanded ? 'min-h-[calc(100vh-72px)]' : ''}`}>
        <Image src={chart.staticUrl} alt={chart.title || 'Analysis chart'} width={1400} height={900} unoptimized className={`max-h-full max-w-full object-contain transition ${filterClass}`} />
      </div>
    );
  }
  return (
    <div className="flex h-80 items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
      {chart.interactiveUrl ? 'Press the interactive chart button to view this chart.' : 'Chart file unavailable'}
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
  const charts = useMemo(() => mergeCharts(getCharts(data)), [data]);
  const dataset = getPrimaryDataset(data);
  const [activeChart, setActiveChart] = useState(0);
  const [interactive, setInteractive] = useState(false);
  const [filter, setFilter] = useState(chartColors[0].id);
  const [colorOpen, setColorOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const colorRef = useRef<HTMLDivElement | null>(null);
  const chart = charts[activeChart] || charts[0];
  const filterClass = chartColors.find(item => item.id === filter)?.className || '';
  const exports = data?.exports?.filter(item => item.url) || [];
  const spreadsheetExport = getSpreadsheetExport(data);
  const isSpreadsheet = Boolean(spreadsheetExport && charts.length === 0);
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
  if (isSpreadsheet) {
    const spreadsheetTitle = data.workbookPreview?.fileName || spreadsheetExport?.label || dataset?.name || 'Excel workbook';
    const workbook = data.workbookPreview;
    const canShowWorkbookFullscreen = Boolean(workbook?.sheets?.length);
    const spreadsheetFullscreen = expanded ? canShowWorkbookFullscreen && workbook ? (
      <ExcelWorkbookFullscreen
        workbook={workbook}
        title={spreadsheetTitle}
        downloadHref={spreadsheetExport?.url || ''}
        onClose={() => setExpanded(false)}
      />
    ) : (
      <div className="fixed inset-0 z-[999999] bg-white">
        <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setExpanded(false)} title="Close" aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-800 transition hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            <h2 className="truncate text-base font-extrabold text-slate-950">{spreadsheetTitle}</h2>
          </div>
          <div className="flex items-center gap-1">
            <IconButton title="Download Spreadsheet" onClick={() => downloadUrl(spreadsheetExport?.url || '', `${spreadsheetTitle}.xlsx`)}>
              <Download className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <SpreadsheetPreview data={data} expanded />
      </div>
    ) : null;

    return (
      <div className="not-prose my-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ExcelIcon className="h-6 w-6 shrink-0" />
            <h3 className="truncate text-base font-extrabold text-slate-950">{spreadsheetTitle}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton title="Download Spreadsheet" onClick={() => downloadUrl(spreadsheetExport?.url || '', `${spreadsheetTitle}.xlsx`)}>
              <Download className="h-4 w-4" />
            </IconButton>
            <IconButton title="Expand Preview" onClick={() => setExpanded(true)}>
              <Maximize2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <SpreadsheetPreview data={data} onOpen={() => setExpanded(true)} />
        </div>
        {warnings.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {warnings.join(' ')}
            </div>
          </div>
        )}
        {spreadsheetFullscreen && createPortal(spreadsheetFullscreen, document.body)}
      </div>
    );
  }

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
                Line Color
              </p>
              <div className="grid grid-cols-2 gap-2">
                {chartColors.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-extrabold transition ${filter === item.id ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${item.swatch}`} />
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
              onClick={() => {
                setActiveChart(index);
                setInteractive(false);
              }}
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
