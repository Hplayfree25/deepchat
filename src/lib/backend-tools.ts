'use client';

import { loadToolSettings, shouldUseSmartSearch } from '@/lib/tool-settings';
import { parseAgentClarification } from '@/lib/agent-clarification';
import { type ImageAspectRatio } from '@/lib/image-aspect-ratio';

export interface BackendChatMessage {
  id?: string;
  role: string;
  content?: string;
  attachedFiles?: unknown;
  webSearchEnabled?: boolean;
  imageGenerationEnabled?: boolean;
  imageAspectRatio?: ImageAspectRatio;
  [key: string]: unknown;
}

export interface BackendSelectedConnection {
  connectionId?: string;
  id?: string;
}

export interface AttachedDataFile {
  name: string;
  ext: string;
}

export type AnalysisRuntimeMode = 'excel_light' | 'table' | 'chart' | 'analysis';

export interface BackendToolDecision {
  useSearch: boolean;
  useCodeAnalysis: boolean;
  reason?: string;
  source: 'manual' | 'ai' | 'heuristic';
}

const DATA_ANALYSIS_EXTENSIONS = new Set(['csv', 'json', 'jsonl', 'xlsx', 'xls']);
const DATA_ANALYSIS_PROMPT_PATTERN = /(analy[sz]e\s+(this\s+)?(data|dataset|file|csv|spreadsheet)|data\s+analysis|csv|excel|spreadsheet|statistics|mean|median|standard deviation|correlation|regression|cluster|clustering|pivot|grouping|aggregate|outlier|analisis\s+data|statistik|korelasi|regresi|pivot|agregasi|rata-rata|median|visuali[sz](e|ation)\s+(this\s+)?(data|dataset|csv|spreadsheet|prices?|stocks?|market|sales|revenue|harga|saham|tren|trend)|(?:chart|plot|grafik)\s+(?:of|for|data|dataset|prices?|stocks?|market|sales|revenue|harga|saham|tren|trend)|\b(?:buat(?:kan)?|bikin(?:kan)?|generate|create)\b[\s\S]{0,120}\b(?:chart|plot|grafik|visualisasi)\b)/i;
const CODE_EXECUTION_PROMPT_PATTERN = /(\b(run|execute|test|evaluate)\b[\s\S]{0,80}\b(code|script|python|snippet)\b|\b(code|script|python|snippet)\b[\s\S]{0,80}\b(run|execute|test|evaluate)\b|\b(calculate|compute|simulate|simulation|monte carlo|numerically solve|optimi[sz]e|benchmark)\b|\b(hitung|kalkulasi|simulasi|jalankan|eksekusi|uji)\b[\s\S]{0,80}\b(kode|skrip|python|angka|perhitungan|rumus)\b)/i;
const CURRENT_MARKET_ANALYSIS_PATTERN = /((stock|stocks|ticker|market|crypto|coin|forex|exchange rate|price|prices|saham|bursa|emiten|kripto|koin|kurs|harga).*(visuali[sz]e|visualization|chart|plot|grafik|forecast|predict|prediction|projection|trend|outlook|analy[sz]e|analysis|prediksi|proyeksi|tren|analisis|kedepan|ke depan|mendatang))|((visuali[sz]e|visualization|chart|plot|grafik|forecast|predict|prediction|projection|trend|outlook|analy[sz]e|analysis|prediksi|proyeksi|tren|analisis).*(stock|stocks|ticker|market|crypto|coin|forex|exchange rate|price|prices|saham|bursa|emiten|kripto|koin|kurs|harga))/i;
const SPREADSHEET_REQUEST_PATTERN = /\b(excel|spreadsheet|workbook|xlsx|sheet|worksheet|table|tabel|lembar kerja|rumus|formula|cashflow|cash flow|arus kas)\b/i;
const CURRENT_SEARCH_PATTERN = /\b(harga|kurs|rupiah|dollar|dolar|usd|idr|rate|nilai tukar|exchange rate|market|pasar|saham|crypto|kripto|bitcoin|emas|oil|minyak|terbaru|terkini|sekarang|saat ini|hari ini|latest|current|today|now|live|real[-\s]?time)\b/i;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const getString = (value: unknown) => typeof value === 'string' ? value : '';

export const getLatestUserMessage = (messages: BackendChatMessage[]) => [...messages].reverse().find(message => message.role === 'user');

export const shouldRequestImageGeneration = (message: BackendChatMessage | undefined) => message?.imageGenerationEnabled === true;

export const normalizeAttachedDataFiles = (value: unknown): AttachedDataFile[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item): AttachedDataFile | null => {
    if (!isRecord(item)) return null;
    const name = getString(item.name);
    const ext = getString(item.ext).toLowerCase().replace(/^\./, '');
    if (!name || !DATA_ANALYSIS_EXTENSIONS.has(ext)) return null;
    return { name, ext };
  }).filter((item): item is AttachedDataFile => Boolean(item));
};

export const isSpreadsheetAnalysisRequest = (message: BackendChatMessage | undefined) => Boolean(message && SPREADSHEET_REQUEST_PATTERN.test(message.content || ''));

export const getAnalysisRuntimeMode = (message: BackendChatMessage | undefined, requestedCharts: string[]): AnalysisRuntimeMode => {
  const content = message?.content || '';
  const hasFiles = normalizeAttachedDataFiles(message?.attachedFiles).length > 0;
  if (isSpreadsheetAnalysisRequest(message)) return 'table';
  if (requestedCharts.length > 0 || /\b(chart|plot|grafik|visuali[sz]|visualisasi|tren|trend)\b/i.test(content)) return 'chart';
  if (/\b(regression|regresi|cluster|clustering|forecast|predict|prediction|prediksi|proyeksi|statistics|statistik|correlation|korelasi|outlier|model)\b/i.test(content)) return 'analysis';
  return hasFiles ? 'table' : 'analysis';
};

const shouldUseCodeAnalysis = (message: BackendChatMessage | undefined) => {
  if (!message) return false;
  if (!loadToolSettings().codeExecutionEnabled) return false;
  const files = normalizeAttachedDataFiles(message.attachedFiles);
  const content = message.content || '';
  return files.length > 0 || DATA_ANALYSIS_PROMPT_PATTERN.test(content) || CODE_EXECUTION_PROMPT_PATTERN.test(content) || CURRENT_MARKET_ANALYSIS_PATTERN.test(content);
};

const shouldRequestWebSearch = (message: BackendChatMessage | undefined) => {
  if (!message) return false;
  if (message.webSearchEnabled === true) return true;
  const content = message.content || '';
  if (CURRENT_SEARCH_PATTERN.test(content)) return true;
  if (CURRENT_MARKET_ANALYSIS_PATTERN.test(content)) return true;
  return shouldUseSmartSearch(content);
};

const getHeuristicToolDecision = (message: BackendChatMessage | undefined): BackendToolDecision => ({
  useSearch: shouldRequestWebSearch(message),
  useCodeAnalysis: shouldUseCodeAnalysis(message),
  source: message?.webSearchEnabled === true ? 'manual' : 'heuristic'
});

const getRecentConversationContext = (messages: BackendChatMessage[]) => messages.slice(-6).map(message => {
  const role = message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'User' : 'System';
  const content = parseAgentClarification(message.content || '').visibleContent.replace(/\s+/g, ' ').trim();
  return `${role}: ${content.slice(0, 700)}`;
}).join('\n');

const getToolDecisionInstruction = (codeAnalysisEnabled: boolean, manualSearch: boolean) => [
  'You are DeepChat Tool Router. Choose which backend runtime tools should run before the assistant answers.',
  'Return only compact JSON with this exact shape: {"useSearch":boolean,"useCodeAnalysis":boolean,"reason":"short reason"}.',
  'Available tools:',
  'Search: finds fresh web facts and returns source-aware context. Use it for current/latest/recent information, prices, currency exchange rates, Rupiah/USD/IDR, availability, news, public people or organizations, product specs, releases, citations, and facts likely to change.',
  codeAnalysisEnabled ? 'Code Execution: creates real Python-backed results, charts, downloadable Excel workbooks, spreadsheet previews, formulas, formatted tables, projections, calculations, simulations, benchmarks, statistics, aggregations, and dataset analysis. If the user asks to run code, execute Python, calculate, simulate, or make an Excel/XLSX/workbook/table with formulas or styling, use Code Execution.' : 'Code Execution is disabled, so useCodeAnalysis must be false.',
  manualSearch ? 'The user manually enabled Search, so useSearch must be true.' : 'If the request can be answered from conversation context or stable general knowledge, do not use Search.',
  'Use Search for questions containing current prices, exchange rates, "harga", "kurs", "rupiah", "sekarang", "hari ini", "terbaru", or "saat ini".',
  'Prefer no tool for greetings, translation, writing, brainstorming, coding help, explanations, or local reasoning unless the user explicitly asks for current external facts.',
  'Use both Search and Code Execution when the user asks for analysis, visualization, charting, forecasting, or prediction based on current web facts.',
  'Never ask the user which tool to use.'
].join('\n');

const getToolDecisionUserPrompt = (messages: BackendChatMessage[], latestUserMessage: BackendChatMessage, codeAnalysisEnabled: boolean) => {
  const files = normalizeAttachedDataFiles(latestUserMessage.attachedFiles);
  return [
    `Latest user message: ${latestUserMessage.content || ''}`,
    `Manual Search toggle: ${latestUserMessage.webSearchEnabled === true ? 'on' : 'off'}`,
    `Code Analysis enabled: ${codeAnalysisEnabled ? 'yes' : 'no'}`,
    files.length ? `Attached data files: ${files.map(file => `${file.name} (${file.ext})`).join(', ')}` : 'Attached data files: none',
    'Recent conversation:',
    getRecentConversationContext(messages)
  ].join('\n\n');
};

const extractJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readRouterResponseText = async (res: Response) => {
  if (!res.ok) return '';
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const provider = res.headers.get('x-provider') || '';
  let text = '';
  let buffer = '';
  if (!reader) return '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim() || line.startsWith(':')) continue;
      const data = line.replace(/^data:\s*/, '').trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!isRecord(parsed) || parsed.error) continue;
        if (typeof parsed.text === 'string') text += parsed.text;
        if (parsed.type === 'deepchat_content') text += getString(parsed.text);
        if (provider === 'anthropic' && parsed.type === 'content_block_delta' && isRecord(parsed.delta)) text += getString(parsed.delta.text);
        if ((provider === 'gemini' || provider === 'vertexai') && Array.isArray(parsed.candidates)) {
          const candidate = isRecord(parsed.candidates[0]) ? parsed.candidates[0] : null;
          const content = candidate && isRecord(candidate.content) ? candidate.content : null;
          const parts = content && Array.isArray(content.parts) ? content.parts : [];
          text += parts.map(part => isRecord(part) ? getString(part.text) : '').join('');
        }
        if (Array.isArray(parsed.choices)) {
          const choice = isRecord(parsed.choices[0]) ? parsed.choices[0] : null;
          const delta = choice && isRecord(choice.delta) ? choice.delta : isRecord(choice?.message) ? choice.message : null;
          text += getString(delta?.content);
        }
      } catch {
      }
    }
  }
  return text.trim();
};

const mergeToolDecision = (fallback: BackendToolDecision, value: Record<string, unknown> | null, codeAnalysisEnabled: boolean, manualSearch: boolean): BackendToolDecision => {
  const aiSearch = value?.useSearch === true;
  const aiCodeAnalysis = value?.useCodeAnalysis === true;
  const useSearch = manualSearch || fallback.useSearch || aiSearch;
  const useCodeAnalysis = fallback.useCodeAnalysis || (codeAnalysisEnabled && aiCodeAnalysis);
  const source: BackendToolDecision['source'] = manualSearch ? 'manual' : aiSearch || aiCodeAnalysis ? 'ai' : fallback.source;
  return {
    useSearch,
    useCodeAnalysis,
    source,
    reason: getString(value?.reason).slice(0, 240) || fallback.reason
  };
};

export const decideBackendTools = async (messages: BackendChatMessage[], latestUserMessage: BackendChatMessage | undefined, selectedConnection: BackendSelectedConnection | null, signal?: AbortSignal): Promise<BackendToolDecision> => {
  const fallback = getHeuristicToolDecision(latestUserMessage);
  if (!latestUserMessage) return fallback;
  const codeAnalysisEnabled = loadToolSettings().codeExecutionEnabled;
  const manualSearch = latestUserMessage.webSearchEnabled === true;
  if (!selectedConnection?.connectionId && !selectedConnection?.id) return fallback;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: getToolDecisionInstruction(codeAnalysisEnabled, manualSearch) },
          { role: 'user', content: getToolDecisionUserPrompt(messages, latestUserMessage, codeAnalysisEnabled) }
        ],
        connectionId: selectedConnection.connectionId,
        modelId: selectedConnection.id,
        mcpServers: [],
        tools: [],
        skipAgentLoop: true,
        skipRuntimeIntegrations: true
      }),
      signal
    });
    const parsed = extractJsonObject(await readRouterResponseText(res));
    return mergeToolDecision(fallback, parsed, codeAnalysisEnabled, manualSearch);
  } catch {
    return fallback;
  }
};
