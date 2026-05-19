'use client';

import { getChat, saveMessage, updateChatTitle } from '@/app/actions';
import { getEnabledMCPRuntimeServers } from '@/lib/mcp-settings';
import { publishDeepChatNotification } from '@/lib/notification-settings';
import { getEnabledToolRuntimeItems, loadToolSettings, shouldUseSmartSearch } from '@/lib/tool-settings';
import { parseAgentClarification, parseGeneratedClarificationAnswerContent, type AgentClarification } from '@/lib/agent-clarification';
import { getGenerationMode, stripGeneratedImageMarkdown, type GenerationMode } from '@/lib/image-generation';
import { normalizeImageAspectRatio, type ImageAspectRatio } from '@/lib/image-aspect-ratio';

interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
}

interface MemoryApiMessage {
  id?: string;
  role: string;
  content?: string;
}

interface MemoryAssistantMessage {
  id: string;
  content?: string;
  [key: string]: unknown;
}

interface ChatApiMessage {
  id?: string;
  role: string;
  content?: string;
  attachedFiles?: unknown;
  webSearchEnabled?: boolean;
  imageGenerationEnabled?: boolean;
  imageAspectRatio?: ImageAspectRatio;
  [key: string]: unknown;
}

interface AttachedDataFile {
  name: string;
  ext: string;
}

interface CodeAnalysisResponse {
  success?: boolean;
  error?: string;
  installHint?: string;
  datasets?: unknown[];
  exports?: unknown[];
  execution?: {
    code?: string;
    stdout?: string;
    stderr?: string;
  };
  [key: string]: unknown;
}

type AnalysisRuntimeMode = 'excel_light' | 'table' | 'chart' | 'analysis';

interface ToolDecision {
  useSearch: boolean;
  useCodeAnalysis: boolean;
  reason?: string;
  source: 'manual' | 'ai' | 'heuristic';
}

interface ChatMessageVersion {
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  mcpNotice?: string;
  mcpUsage?: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources?: SearchSource[];
  clarification?: AgentClarification;
  versionIndex?: number;
  generationMode?: GenerationMode;
  [key: string]: unknown;
}

export interface MCPUsageItem {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  details?: string;
}

interface StoredChatMessage extends MemoryAssistantMessage {
  reasoning?: string;
  reasoningDuration?: number;
  mcpNotice?: string;
  mcpUsage?: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources?: SearchSource[];
  clarification?: AgentClarification;
  versions?: ChatMessageVersion[];
  currentVersionIndex?: number;
  isStreaming?: boolean;
  isError?: boolean;
  isStopped?: boolean;
  generationMode?: GenerationMode;
}

interface SelectedModelConnection {
  connectionId?: string;
  id?: string;
}

export interface ChatGenerationSnapshot {
  chatId: string;
  assistantMsgId: string;
  content: string;
  reasoning: string;
  mcpNotice?: string;
  mcpUsage: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources: SearchSource[];
  clarification?: AgentClarification;
  isStreaming: boolean;
  isError?: boolean;
  isStopped?: boolean;
  reasoningDuration?: number;
  generationMode?: GenerationMode;
  status: 'running' | 'completed' | 'stopped' | 'error';
}

interface ChatGenerationTask {
  chatId: string;
  assistantMsgId: string;
  apiMessages: ChatApiMessage[];
  controller: AbortController;
  fullContent: string;
  fullReasoning: string;
  mcpNotice?: string;
  mcpUsage: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources: SearchSource[];
  clarification?: AgentClarification;
  startedAt: number;
  reasoningEndTime: number;
  status: ChatGenerationSnapshot['status'];
  stopRequested: boolean;
  connection: SelectedModelConnection | null;
  generationMode?: GenerationMode;
  promise?: Promise<void>;
  lastEmittedAt: number;
  pendingEmit: ReturnType<typeof setTimeout> | null;
}

const tasks = new Map<string, ChatGenerationTask>();
const listeners = new Map<string, Set<(snapshot: ChatGenerationSnapshot) => void>>();
const STREAM_EMIT_INTERVAL_MS = 80;

const getResponseError = async (res: Response) => {
  try {
    const data = await res.clone().json();
    if (data?.error) return data.error;
  } catch {
    try {
      const text = await res.text();
      if (text) return text;
    } catch {
    }
  }
  return `Request failed with status ${res.status}`;
};

const isGenericChatTitle = (title?: string) => {
  const normalized = (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalized || normalized === 'new chat' || normalized === 'untitled chat' || normalized === 'untitled conversation';
};

const normalizeVersions = (versions: ChatMessageVersion[] = []) => versions.map((version, index) => ({
  ...version,
  versionIndex: typeof version?.versionIndex === 'number' ? version.versionIndex : index + 1
}));

const getDuration = (task: ChatGenerationTask) => {
  let durationSec = Math.round((task.reasoningEndTime - task.startedAt) / 1000);
  if (durationSec === 0 && task.fullReasoning) {
    durationSec = 1;
  }
  return task.fullReasoning ? durationSec : undefined;
};

const getSnapshot = (task: ChatGenerationTask): ChatGenerationSnapshot => ({
  chatId: task.chatId,
  assistantMsgId: task.assistantMsgId,
  content: task.fullContent,
  reasoning: task.fullReasoning,
  mcpNotice: task.mcpNotice,
  mcpUsage: task.mcpUsage,
  mcpContentOffset: task.mcpContentOffset,
  searchSources: task.searchSources,
  clarification: task.clarification,
  isStreaming: task.status === 'running',
  isError: task.status === 'error',
  isStopped: task.status === 'stopped',
  reasoningDuration: getDuration(task),
  generationMode: task.generationMode,
  status: task.status
});

const dispatchSnapshot = (task: ChatGenerationTask) => {
  const snapshot = getSnapshot(task);
  listeners.get(task.chatId)?.forEach(listener => listener(snapshot));
};

const emitSnapshot = (task: ChatGenerationTask, immediate = false) => {
  if (task.pendingEmit && (immediate || task.status !== 'running')) {
    clearTimeout(task.pendingEmit);
    task.pendingEmit = null;
  }

  if (immediate || task.status !== 'running') {
    task.lastEmittedAt = Date.now();
    dispatchSnapshot(task);
    return;
  }

  const now = Date.now();
  const elapsed = now - task.lastEmittedAt;
  if (elapsed >= STREAM_EMIT_INTERVAL_MS) {
    task.lastEmittedAt = now;
    dispatchSnapshot(task);
    return;
  }

  if (!task.pendingEmit) {
    task.pendingEmit = setTimeout(() => {
      task.pendingEmit = null;
      task.lastEmittedAt = Date.now();
      dispatchSnapshot(task);
    }, STREAM_EMIT_INTERVAL_MS - elapsed);
  }
};

const formatMessages = (apiMessages: ChatApiMessage[]) => {
  const sanitizeContent = (content?: string) => stripGeneratedImageMarkdown(parseAgentClarification(content || '').visibleContent)
    .replace(/```deepchat-analysis[\s\S]*?```/g, '[analysis chart omitted]')
    .replace(/```deepchat-analysis-actions[\s\S]*?```/g, '[analysis action omitted]')
    .replace(/`deepchat-analysis-actions:[^`]+`/g, '[analysis action omitted]');
  const latestRealUser = (items: ChatApiMessage[]) => [...items].reverse().find(item => item.role === 'user' && !parseGeneratedClarificationAnswerContent(item.content));
  if (apiMessages.length <= 1) {
    return apiMessages.map(m => ({ role: m.role, content: sanitizeContent(m.content), attachedFiles: m.attachedFiles, webSearchEnabled: m.webSearchEnabled, imageGenerationEnabled: m.imageGenerationEnabled, imageAspectRatio: m.imageAspectRatio }));
  }

  const history = apiMessages.slice(0, -1);
  const lastMsg = apiMessages[apiMessages.length - 1];
  const clarificationAnswer = parseGeneratedClarificationAnswerContent(lastMsg.content);
  const originalUserMessage = clarificationAnswer ? latestRealUser(history) : undefined;
  const runtimePromptContent = clarificationAnswer
    ? [
      sanitizeContent(originalUserMessage?.content),
      clarificationAnswer.question ? `Clarification question: ${clarificationAnswer.question}` : '',
      `Clarification answer ${clarificationAnswer.shortcut}: ${clarificationAnswer.value}`
    ].filter(Boolean).join('\n\n')
    : undefined;
  let sysContent = "You are a helpful AI assistant. Below is the history of the current conversation.\n\n=== CHAT HISTORY ===\n";

  history.forEach(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    sysContent += `${role}: ${sanitizeContent(m.content)}\n\n`;
  });

  sysContent += "=== END OF HISTORY ===\n\nPlease respond to the user's latest message based on the context above.";

  return [
    { role: 'system', content: sysContent },
    { role: 'user', content: sanitizeContent(lastMsg.content), attachedFiles: lastMsg.attachedFiles, webSearchEnabled: lastMsg.webSearchEnabled, imageGenerationEnabled: lastMsg.imageGenerationEnabled, imageAspectRatio: lastMsg.imageAspectRatio, runtimePromptContent }
  ];
};

const getSelectedConnection = (): SelectedModelConnection | null => {
  const selectedModelStr = localStorage.getItem('selectedModelObj');
  return selectedModelStr ? JSON.parse(selectedModelStr) : null;
};

const updateMessageVersion = (message: StoredChatMessage, content: string, reasoning: string, reasoningDuration?: number, mcpNotice?: string, mcpUsage: MCPUsageItem[] = [], mcpContentOffset?: number, searchSources: SearchSource[] = [], clarification?: AgentClarification, generationMode?: GenerationMode) => {
  const updated = {
    ...message,
    content,
    reasoning,
    reasoningDuration,
    mcpNotice,
    mcpUsage,
    mcpContentOffset,
    searchSources,
    clarification,
    generationMode
  };

  if (updated.versions && updated.currentVersionIndex !== undefined) {
    updated.versions = normalizeVersions(updated.versions);
    updated.versions[updated.currentVersionIndex] = {
      ...updated.versions[updated.currentVersionIndex],
      content,
      reasoning,
      reasoningDuration,
      mcpNotice,
      mcpUsage,
      mcpContentOffset,
      searchSources,
      clarification,
      generationMode
    };
  }

  return updated;
};

const getAssistantMessage = async (chatId: string, assistantMsgId: string) => {
  const chat = await getChat(chatId);
  const messages = Array.isArray(chat?.messages) ? chat.messages as StoredChatMessage[] : [];
  return messages.find(m => m.id === assistantMsgId) || null;
};

const saveFinalMessage = async (task: ChatGenerationTask, options: { isError?: boolean; isStopped?: boolean; errorMessage?: string } = {}) => {
  const currentMsg = await getAssistantMessage(task.chatId, task.assistantMsgId);
  if (!currentMsg) return null;

  const parsedContent = parseAgentClarification(task.fullContent);
  const clarification = task.clarification || parsedContent.clarification;
  const content = options.errorMessage || parsedContent.visibleContent || (options.isStopped ? 'Generation stopped.' : '');
  const finalMessage = {
    ...updateMessageVersion(currentMsg, content, task.fullReasoning, getDuration(task), task.mcpNotice, task.mcpUsage, task.mcpContentOffset, task.searchSources, clarification, task.generationMode),
    isStreaming: false,
    isError: options.isError === true,
    isStopped: options.isStopped === true
  };

  await saveMessage(task.chatId, finalMessage);
  return finalMessage;
};

const generateChatTitle = async (chatId: string, prompt: string, connection: SelectedModelConnection | null) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const titleRes = await fetch('/api/chat/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          connectionId: connection?.connectionId,
          modelId: connection?.id
        })
      });
      if (!titleRes.ok) continue;
      const { title } = await titleRes.json();
      if (!isGenericChatTitle(title)) {
        await updateChatTitle(chatId, title);
        window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId, title } }));
        return title;
      }
    } catch {
    }
  }
  return null;
};

const saveMemoriesFromResponse = async (chatId: string, apiMessages: MemoryApiMessage[], assistantMessage: MemoryAssistantMessage, connection: SelectedModelConnection | null) => {
  const lastUserMessage = [...apiMessages].reverse().find(m => m.role === 'user');
  const assistantMemoryContent = stripGeneratedImageMarkdown(assistantMessage.content);
  if (!lastUserMessage?.content || !assistantMemoryContent || !assistantMemoryContent.trim() || assistantMemoryContent === '[generated image omitted]') return;

  try {
    const res = await fetch('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        userMessage: lastUserMessage.content,
        userMessageId: lastUserMessage.id,
        assistantMessage: assistantMemoryContent,
        connectionId: connection?.connectionId,
        modelId: connection?.id
      })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.savedCount) return;

    const updatedMessage = {
      ...assistantMessage,
      memoriesSaved: true,
      memoriesSavedCount: data.savedCount,
      memoryProvider: data.provider,
      memoryModel: data.model
    };

    await saveMessage(chatId, updatedMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));
  } catch {
  }
};

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
};

const isAbortError = (error: unknown) => {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object');
};

const getString = (value: unknown) => typeof value === 'string' ? value : '';

const getOpenAiDelta = (json: Record<string, unknown>) => {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : null;
  const delta = choice && isRecord(choice.delta) ? choice.delta : null;
  return {
    reasoning: getString(delta?.reasoning_content),
    content: getString(delta?.content)
  };
};

const getGeminiText = (json: Record<string, unknown>) => {
  const directText = getString(json.text);
  if (directText) return directText;

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const candidate = isRecord(candidates[0]) ? candidates[0] : null;
  const content = candidate && isRecord(candidate.content) ? candidate.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  return parts.map(part => isRecord(part) ? getString(part.text) : '').join('');
};

const normalizeMCPUsageEvent = (json: Record<string, unknown>): MCPUsageItem | null => {
  const id = getString(json.id);
  const name = getString(json.name);
  const rawStatus = getString(json.status);
  const status = rawStatus === 'completed' || rawStatus === 'error' ? rawStatus : 'running';
  if (!id || !name) return null;
  return {
    id,
    name,
    status,
    details: getString(json.details)
  };
};

const normalizeSearchSources = (value: unknown): SearchSource[] => {
  if (!Array.isArray(value)) return [];
  const sources = value.map((item): SearchSource | null => {
    if (!isRecord(item)) return null;
    const title = getString(item.title);
    const url = getString(item.url);
    if (!url) return null;
    return {
      title: title || url,
      url,
      snippet: getString(item.snippet),
      displayUrl: getString(item.displayUrl)
    };
  }).filter((item): item is SearchSource => Boolean(item));
  return sources;
};

const readChatResponseText = async (res: Response) => {
  if (!res.ok) throw new Error(await getResponseError(res));
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const provider = res.headers.get('x-provider') || '';
  const sources: SearchSource[] = [];
  let text = '';
  let buffer = '';

  if (!reader) return { text, sources };

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

      let json: Record<string, unknown>;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!isRecord(parsed)) continue;
        json = parsed;
      } catch {
        continue;
      }

      if (json.error) throw new Error(getString(json.error) || 'Provider returned an error.');
      if (json.type === 'deepchat_sources') {
        sources.splice(0, sources.length, ...normalizeSearchSources(json.sources));
        continue;
      }
      if (json.type === 'deepchat_content') {
        text += getString(json.text);
        continue;
      }
      if (provider === 'anthropic') {
        const delta = isRecord(json.delta) ? json.delta : null;
        if (json.type === 'content_block_delta') text += getString(delta?.text);
      } else if (provider === 'gemini' || provider === 'vertexai') {
        text += getGeminiText(json);
      } else {
        text += getOpenAiDelta(json).content;
      }
    }
  }

  return { text: text.trim(), sources };
};

const DATA_ANALYSIS_EXTENSIONS = new Set(['csv', 'json', 'jsonl', 'xlsx', 'xls']);
const DATA_ANALYSIS_PROMPT_PATTERN = /(analy[sz]e\s+(this\s+)?(data|dataset|file|csv|spreadsheet)|data\s+analysis|csv|excel|spreadsheet|statistics|mean|median|standard deviation|correlation|regression|cluster|clustering|pivot|grouping|aggregate|outlier|analisis\s+data|statistik|korelasi|regresi|pivot|agregasi|rata-rata|median|visuali[sz](e|ation)\s+(this\s+)?(data|dataset|csv|spreadsheet|prices?|stocks?|market|sales|revenue|harga|saham|tren|trend)|(?:chart|plot|grafik)\s+(?:of|for|data|dataset|prices?|stocks?|market|sales|revenue|harga|saham|tren|trend)|\b(?:buat(?:kan)?|bikin(?:kan)?|generate|create)\b[\s\S]{0,120}\b(?:chart|plot|grafik|visualisasi)\b)/i;
const CODE_EXECUTION_PROMPT_PATTERN = /(\b(run|execute|test|evaluate)\b[\s\S]{0,80}\b(code|script|python|snippet)\b|\b(code|script|python|snippet)\b[\s\S]{0,80}\b(run|execute|test|evaluate)\b|\b(calculate|compute|simulate|simulation|monte carlo|numerically solve|optimi[sz]e|benchmark)\b|\b(hitung|kalkulasi|simulasi|jalankan|eksekusi|uji)\b[\s\S]{0,80}\b(kode|skrip|python|angka|perhitungan|rumus)\b)/i;
const CURRENT_MARKET_ANALYSIS_PATTERN = /((stock|stocks|ticker|market|crypto|coin|forex|exchange rate|price|prices|saham|bursa|emiten|kripto|koin|kurs|harga).*(visuali[sz]e|visualization|chart|plot|grafik|forecast|predict|prediction|projection|trend|outlook|analy[sz]e|analysis|prediksi|proyeksi|tren|analisis|kedepan|ke depan|mendatang))|((visuali[sz]e|visualization|chart|plot|grafik|forecast|predict|prediction|projection|trend|outlook|analy[sz]e|analysis|prediksi|proyeksi|tren|analisis).*(stock|stocks|ticker|market|crypto|coin|forex|exchange rate|price|prices|saham|bursa|emiten|kripto|koin|kurs|harga))/i;
const SPREADSHEET_REQUEST_PATTERN = /\b(excel|spreadsheet|workbook|xlsx|sheet|worksheet|table|tabel|lembar kerja|rumus|formula|cashflow|cash flow|arus kas)\b/i;

const getLatestUserMessage = (messages: ChatApiMessage[]) => [...messages].reverse().find(message => message.role === 'user');
const shouldRequestImageGeneration = (message: ChatApiMessage | undefined) => message?.imageGenerationEnabled === true;

const getRecentConversationContext = (messages: ChatApiMessage[]) => messages.slice(-6).map(message => {
  const role = message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'User' : 'System';
  const content = parseAgentClarification(message.content || '').visibleContent.replace(/\s+/g, ' ').trim();
  return `${role}: ${content.slice(0, 700)}`;
}).join('\n');

const normalizeAttachedDataFiles = (value: unknown): AttachedDataFile[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item): AttachedDataFile | null => {
    if (!isRecord(item)) return null;
    const name = getString(item.name);
    const ext = getString(item.ext).toLowerCase().replace(/^\./, '');
    if (!name || !DATA_ANALYSIS_EXTENSIONS.has(ext)) return null;
    return { name, ext };
  }).filter((item): item is AttachedDataFile => Boolean(item));
};

const shouldUseCodeAnalysis = (message: ChatApiMessage | undefined) => {
  if (!message) return false;
  if (!loadToolSettings().codeExecutionEnabled) return false;
  const files = normalizeAttachedDataFiles(message.attachedFiles);
  const content = message.content || '';
  return files.length > 0 || DATA_ANALYSIS_PROMPT_PATTERN.test(content) || CODE_EXECUTION_PROMPT_PATTERN.test(content) || CURRENT_MARKET_ANALYSIS_PATTERN.test(content);
};

const isSpreadsheetAnalysisRequest = (message: ChatApiMessage | undefined) => Boolean(message && SPREADSHEET_REQUEST_PATTERN.test(message.content || ''));

const getAnalysisRuntimeMode = (message: ChatApiMessage | undefined, requestedCharts: string[]): AnalysisRuntimeMode => {
  const content = message?.content || '';
  const hasFiles = normalizeAttachedDataFiles(message?.attachedFiles).length > 0;
  if (isSpreadsheetAnalysisRequest(message)) return 'table';
  if (requestedCharts.length > 0 || /\b(chart|plot|grafik|visuali[sz]|visualisasi|tren|trend)\b/i.test(content)) return 'chart';
  if (/\b(regression|regresi|cluster|clustering|forecast|predict|prediction|prediksi|proyeksi|statistics|statistik|correlation|korelasi|outlier|model)\b/i.test(content)) return 'analysis';
  return hasFiles ? 'table' : 'analysis';
};

const shouldRequestWebSearch = (message: ChatApiMessage | undefined) => {
  if (!message) return false;
  if (message.webSearchEnabled === true) return true;
  if (CURRENT_MARKET_ANALYSIS_PATTERN.test(message.content || '')) return true;
  return shouldUseSmartSearch(message.content || '');
};

const getHeuristicToolDecision = (message: ChatApiMessage | undefined): ToolDecision => ({
  useSearch: shouldRequestWebSearch(message),
  useCodeAnalysis: shouldUseCodeAnalysis(message),
  source: message?.webSearchEnabled === true ? 'manual' : 'heuristic'
});

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

const normalizeToolDecision = (value: Record<string, unknown>, fallback: ToolDecision, codeAnalysisEnabled: boolean, manualSearch: boolean): ToolDecision => {
  const useSearch = manualSearch || value.useSearch === true;
  const useCodeAnalysis = codeAnalysisEnabled && value.useCodeAnalysis === true;
  return {
    useSearch,
    useCodeAnalysis,
    source: manualSearch ? 'manual' : 'ai',
    reason: getString(value.reason).slice(0, 240) || fallback.reason
  };
};

const getToolDecisionInstruction = (codeAnalysisEnabled: boolean, manualSearch: boolean) => [
  'You are DeepChat Tool Router. Choose which runtime tools should run before the assistant answers.',
  'Return only compact JSON with this exact shape: {"useSearch":boolean,"useCodeAnalysis":boolean,"reason":"short reason"}.',
  'Available tools:',
  'Search: finds fresh web facts and returns source-aware context. Use it for current/latest/recent information, prices, availability, news, public people or organizations, product specs, releases, citations, and facts likely to change.',
  codeAnalysisEnabled ? 'Code Execution: creates real Python-backed results, charts, downloadable Excel workbooks, spreadsheet previews, formulas, formatted tables, projections, calculations, simulations, benchmarks, statistics, aggregations, and dataset analysis. If the user asks to run code, execute Python, calculate, simulate, or make an Excel/XLSX/workbook/table with formulas or styling, use Code Execution.' : 'Code Execution is disabled, so useCodeAnalysis must be false.',
  manualSearch ? 'The user manually enabled Search, so useSearch must be true.' : 'If the request can be answered from conversation context or stable general knowledge, do not use Search.',
  'Prefer no tool for greetings, translation, writing, brainstorming, coding help, explanations, or local reasoning unless the user explicitly asks for current external facts.',
  'Use Search only for web fact-finding tasks such as "find the latest...", "carikan data terbaru...", company profiles, news, product information, or source-backed summaries when no numeric computation or chart is requested.',
  'Use Code Execution for attached files, explicit computation/charting over data that is already available in the conversation, runnable code requests, calculations, simulations, or spreadsheet/table generation such as Excel, XLSX, workbook, formulas, pivot tables, and formatted data tables.',
  'Use both Search and Code Execution when the user asks for analysis, visualization, charting, forecasting, or prediction based on current web facts, such as stock prices, crypto prices, market trends, exchange rates, commodity prices, or recent public datasets.',
  'Examples: "visualisasi harga saham B ke depannya" => both true; "carikan berita terbaru saham B" => Search true, Code Execution false; "analisis CSV ini dan buat grafik" => Search false, Code Execution true; "buatkan tabel Excel dengan rumus" => Search false, Code Execution true; "jalankan kode Python ini" => Search false, Code Execution true; "siapa CEO terbaru X?" => Search true, Code Execution false.',
  'Never ask the user which tool to use.'
].join('\n');

const getToolDecisionUserPrompt = (messages: ChatApiMessage[], latestUserMessage: ChatApiMessage, codeAnalysisEnabled: boolean) => {
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

const decideToolsWithAI = async (task: ChatGenerationTask, latestUserMessage: ChatApiMessage, fallback: ToolDecision): Promise<ToolDecision> => {
  const codeAnalysisEnabled = loadToolSettings().codeExecutionEnabled;
  const manualSearch = latestUserMessage.webSearchEnabled === true;
  if (!task.connection?.connectionId && !task.connection?.id) return fallback;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: getToolDecisionInstruction(codeAnalysisEnabled, manualSearch) },
          { role: 'user', content: getToolDecisionUserPrompt(task.apiMessages, latestUserMessage, codeAnalysisEnabled) }
        ],
        connectionId: task.connection?.connectionId,
        modelId: task.connection?.id,
        mcpServers: [],
        tools: [],
        skipAgentLoop: true,
        skipRuntimeIntegrations: true
      }),
      signal: task.controller.signal
    });
    const result = await readChatResponseText(res);
    const parsed = extractJsonObject(result.text);
    return parsed ? normalizeToolDecision(parsed, fallback, codeAnalysisEnabled, manualSearch) : fallback;
  } catch {
    return fallback;
  }
};

const decideTools = async (task: ChatGenerationTask, latestUserMessage: ChatApiMessage | undefined): Promise<ToolDecision> => {
  const fallback = getHeuristicToolDecision(latestUserMessage);
  if (!latestUserMessage) return fallback;
  if (fallback.useCodeAnalysis) return fallback;
  if (latestUserMessage.webSearchEnabled === true) {
    const decision = await decideToolsWithAI(task, latestUserMessage, fallback);
    return { ...decision, useSearch: true, source: 'manual' };
  }
  return decideToolsWithAI(task, latestUserMessage, fallback);
};

const getRequestedChartTypes = (prompt: string) => {
  const text = prompt.toLowerCase();
  const chartTypes = [
    ['line', /\b(line|trend|time series|tren)\b/],
    ['bar', /\b(bar|column|batang)\b/],
    ['pie', /\b(pie|donut|doughnut|proporsi|share)\b/],
    ['scatter', /\b(scatter|relationship|hubungan)\b/],
    ['heatmap', /\b(heatmap|correlation|korelasi)\b/],
    ['boxplot', /\b(box|boxplot|outlier)\b/]
  ] as const;
  return chartTypes.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
};

const normalizeGeneratedPythonCode = (code: string) => code
  .replace(/freq\s*=\s*(['"])M\1/g, 'freq=$1ME$1')
  .replace(/freq\s*=\s*(['"])Q\1/g, 'freq=$1QE$1')
  .replace(/freq\s*=\s*(['"])Y\1/g, 'freq=$1YE$1');

const getPythonFromModelText = (text: string) => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (isRecord(parsed) && typeof parsed.code === 'string') return normalizeGeneratedPythonCode(parsed.code.trim());
    } catch {
    }
  }
  const pythonFence = text.match(/```(?:python|py)?\s*([\s\S]*?)```/i);
  if (pythonFence?.[1]) return normalizeGeneratedPythonCode(pythonFence[1].trim());
  return '';
};

const isUsablePythonCode = (code: string) => {
  const text = code.trim();
  if (!text) return false;
  if (/deepchat-analysis|analysis-actions/i.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^</.test(text)) return false;
  return /(pd\.|np\.|plt\.|sns\.|px\.|dataframes|df\b|save_current_matplotlib_chart|save_plotly_chart|import\s+\w+|from\s+\w+\s+import|print\s*\()/m.test(text);
};

const compactAnalysisContext = (data: CodeAnalysisResponse) => {
  const datasets = Array.isArray(data.datasets) ? data.datasets.slice(0, 3) : [];
  const compactDatasets = datasets.map(item => {
    if (!isRecord(item)) return item;
    return {
      name: item.name,
      shape: item.shape,
      columns: Array.isArray(item.columns) ? item.columns.slice(0, 24) : item.columns,
      sample: Array.isArray(item.sample) ? item.sample.slice(0, 5) : item.sample,
      insights: Array.isArray(item.insights) ? item.insights.slice(0, 6) : item.insights,
      warnings: item.warnings,
      charts: Array.isArray(item.charts) ? item.charts.map(chart => isRecord(chart) ? { title: chart.title, type: chart.type } : chart).slice(0, 8) : []
    };
  });
  return JSON.stringify({
    success: data.success,
    error: data.error,
    title: data.title,
    datasets: compactDatasets,
    exports: Array.isArray(data.exports) ? data.exports.map(item => isRecord(item) ? { label: item.label, mimeType: item.mimeType } : item) : [],
    stdout: Array.isArray(data.stdout) ? data.stdout.slice(0, 4) : data.stdout
  }).slice(0, 9000);
};

const encodeAnalysisPayload = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const hasRenderableAnalysisOutput = (data: CodeAnalysisResponse) => {
  const charts = Array.isArray(data.datasets)
    ? data.datasets.flatMap(dataset => isRecord(dataset) && Array.isArray(dataset.charts) ? dataset.charts : [])
    : [];
  const hasChart = charts.some(chart => isRecord(chart) && (getString(chart.staticUrl) || getString(chart.interactiveUrl)));
  const hasExport = Array.isArray(data.exports) && data.exports.some(item => isRecord(item) && getString(item.url));
  const workbook = isRecord(data.workbookPreview) ? data.workbookPreview : null;
  const hasWorkbook = Array.isArray(workbook?.sheets) && workbook.sheets.length > 0;
  return hasChart || hasExport || hasWorkbook;
};

const formatAnalysisMarkdown = (content: string, data: CodeAnalysisResponse) => {
  const artifactJson = JSON.stringify(data, null, 2);
  const chartBlock = [
    '```deepchat-analysis',
    artifactJson,
    '```'
  ].join('\n');
  const actionsToken = `\`deepchat-analysis-actions:${encodeAnalysisPayload(artifactJson)}\``;
  const canRender = hasRenderableAnalysisOutput(data);
  const cleanContent = content.replaceAll('{{DEEPCHAT_ANALYSIS_ACTIONS}}', '').replaceAll('{{DEEPCHAT_ANALYSIS_CHART}}', canRender ? '{{DEEPCHAT_ANALYSIS_CHART}}' : '').trim();
  const withChart = canRender
    ? cleanContent.includes('{{DEEPCHAT_ANALYSIS_CHART}}')
      ? cleanContent.replace('{{DEEPCHAT_ANALYSIS_CHART}}', `\n\n${chartBlock}\n\n`)
      : [cleanContent, chartBlock].filter(Boolean).join('\n\n')
    : cleanContent;
  return `${withChart.trimEnd()} ${actionsToken}`;
};

const callAnalysisModel = async (task: ChatGenerationTask, messages: ChatApiMessage[], instruction: string, useSearch: boolean) => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: instruction }, ...messages],
      connectionId: task.connection?.connectionId,
      modelId: task.connection?.id,
      mcpServers: getEnabledMCPRuntimeServers(),
      tools: getEnabledToolRuntimeItems(useSearch),
      skipAgentLoop: true
    }),
    signal: task.controller.signal
  });
  return readChatResponseText(res);
};

const stripAnalysisStreamingTokens = (text: string) => {
  const chartToken = '{{DEEPCHAT_ANALYSIS_CHART}}';
  const actionsToken = '{{DEEPCHAT_ANALYSIS_ACTIONS}}';
  let clean = text.replaceAll(chartToken, '').replaceAll(actionsToken, '');
  [chartToken, actionsToken].forEach(token => {
    for (let index = 1; index < token.length; index++) {
      const partial = token.slice(0, index);
      if (clean.endsWith(partial)) {
        clean = clean.slice(0, -partial.length);
        break;
      }
    }
  });
  return clean;
};

const streamAnalysisModel = async (task: ChatGenerationTask, messages: ChatApiMessage[], instruction: string, useSearch: boolean, options: { baseContent?: string; stripTokens?: boolean; emit?: boolean } = {}) => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: instruction }, ...messages],
      connectionId: task.connection?.connectionId,
      modelId: task.connection?.id,
      mcpServers: getEnabledMCPRuntimeServers(),
      tools: getEnabledToolRuntimeItems(useSearch),
      skipAgentLoop: true
    }),
    signal: task.controller.signal
  });
  if (!res.ok) throw new Error(await getResponseError(res));

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const provider = res.headers.get('x-provider') || '';
  const sources: SearchSource[] = [];
  let text = '';
  let buffer = '';

  if (!reader) return { text, sources };

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

      let json: Record<string, unknown>;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!isRecord(parsed)) continue;
        json = parsed;
      } catch {
        continue;
      }

      if (json.error) throw new Error(getString(json.error) || 'Provider returned an error.');
      if (json.type === 'deepchat_sources') {
        sources.splice(0, sources.length, ...normalizeSearchSources(json.sources));
        task.searchSources = sources;
        emitSnapshot(task, true);
        continue;
      }

      let chunk = '';
      if (json.type === 'deepchat_content') {
        chunk = getString(json.text);
      } else if (provider === 'anthropic') {
        const delta = isRecord(json.delta) ? json.delta : null;
        if (json.type === 'content_block_delta') chunk = getString(delta?.text);
      } else if (provider === 'gemini' || provider === 'vertexai') {
        chunk = getGeminiText(json);
      } else {
        chunk = getOpenAiDelta(json).content;
      }

      if (chunk) {
        text += chunk;
        if (options.emit !== false) {
          const visibleText = options.stripTokens === false ? text : stripAnalysisStreamingTokens(text);
          task.fullContent = [options.baseContent, visibleText].filter(Boolean).join('\n\n');
          emitSnapshot(task, true);
        }
      }
    }
  }

  return { text: text.trim(), sources };
};

const getAnalysisPrefaceInstruction = () => [
  'Decide whether to write an assistant preface before the data/code analysis starts.',
  'You are running inside DeepChat, which can use Search for fresh web facts and Code Execution for Python analysis, charts, Excel workbooks, downloadable artifacts, and previews.',
  'Use the user language and the conversation context.',
  'If a preface improves the response, write it as a confident action statement about what you will do next.',
  'If the best experience is to start analyzing silently, return no text.',
  'You may use available search context when it helps make the preface factual or grounded.',
  'Never ask a question, offer options, request confirmation, or say you cannot directly create downloadable files.',
  'Do not explain a manual workaround for Excel, charts, or files; the platform tool will create them after this preface.',
  'Do not claim the analysis, chart, workbook, or generated file is already finished.',
  'Do not mention internal tool names, Python code, MCP, or implementation details.',
  'Do not include markdown tables or code blocks.'
].join('\n');

const normalizeAnalysisPreface = (text: string) => {
  const clean = text.trim();
  if (!clean) return '';
  if (/\?+\s*$/.test(clean)) return '';
  if (/(tidak dapat|tidak bisa|cannot|can't|unable to|apakah anda ingin|apakah kamu ingin|do you want|would you like)/i.test(clean)) return '';
  return clean;
};

const getRuntimeManifestText = async (mode: AnalysisRuntimeMode) => {
  try {
    const response = await fetch(`/api/code/analysis?mode=${encodeURIComponent(mode)}`);
    if (!response.ok) return '';
    const manifest = await response.json() as Record<string, unknown>;
    return JSON.stringify({
      mode: manifest.mode || mode,
      python: manifest.python,
      packages: manifest.packages,
      helpers: manifest.helpers
    });
  } catch {
    return JSON.stringify({ mode });
  }
};

const getAnalysisCodeInstruction = (files: AttachedDataFile[], requestedCharts: string[], useSearch: boolean, runtimeMode: AnalysisRuntimeMode, runtimeManifest: string, previousError = '', previousCode = '') => [
  'You are DeepChat Code Execution. Generate Python code for a data analysis task.',
  'Return only valid JSON with this exact shape: {"code":"..."}',
  'The code must be authored specifically for the user request, not a generic template.',
  `Runtime mode: ${runtimeMode}.`,
  runtimeManifest ? `Runtime manifest: ${runtimeManifest}` : '',
  runtimeMode === 'table' ? 'Available libraries are intentionally lightweight: pandas as pd, numpy as np, and openpyxl. Do not import charting or ML libraries in this mode.' : '',
  runtimeMode === 'chart' ? 'Available libraries: pandas as pd, numpy as np, matplotlib.pyplot as plt, seaborn as sns, plotly.express as px, and openpyxl. Do not import ML libraries unless you call install_package first.' : '',
  runtimeMode === 'analysis' ? 'Available Python libraries include pandas as pd, numpy as np, matplotlib.pyplot as plt, seaborn as sns, plotly.express as px, sklearn, scipy, statsmodels, pyarrow, pillow, openpyxl, and xlsxwriter.' : '',
  'The runtime already provides these variables when the selected mode supports them: dataframes, df, input_files, output_dir, save_excel_workbook(file_name, sheets), save_current_matplotlib_chart(title, chart_type), save_plotly_chart(fig, title, chart_type), install_package(package).',
  'For Excel, spreadsheet, workbook, or table requests, create a polished tabular workbook instead of a chart unless the user also asks for a chart.',
  'For spreadsheet requests, use save_excel_workbook(file_name, sheets) to save an .xlsx artifact. Use formulas in the workbook when totals, averages, rates, projections, or summary calculations are useful.',
  'If a missing Python package is truly necessary, call install_package("package-name") before importing it. Prefer the available runtime packages and never install packages for simple pandas/openpyxl/chart work.',
  'Use current pandas offset aliases such as ME, QE, and YE instead of deprecated M, Q, or Y.',
  'Infer the user language from the latest request and use that language for chart titles, axis labels, legends, annotations, and printed summaries when possible.',
  'If attached files exist, use df or dataframes as the source data. If no files exist, create a compact DataFrame that directly models the user request and label assumptions in variables or output text, not in UI warnings.',
  useSearch ? 'Fresh web search context may be available in the messages. Use it only as factual input when it is relevant, but do not scrape websites from Python. If the task needs current market or price data and no file is attached, build a small clearly labeled DataFrame from the searched facts and timestamps that are present in the conversation.' : 'No web search context is available. Do not invent current web data or pretend to have browsed.',
  'For forecasts or predictions, make a transparent baseline projection from the available values, label it as an estimate or projection, and avoid presenting it as certainty.',
  'Create the chart type requested by the user when possible.',
  requestedCharts.length ? `Requested chart types: ${requestedCharts.join(', ')}.` : 'If no chart type is specified, choose the most appropriate chart type.',
  files.length ? `Attached data files: ${files.map(file => `${file.name} (${file.ext})`).join(', ')}.` : 'No attached dataset is available.',
  previousCode ? `Previous Python code that failed:\n${previousCode.slice(0, 6000)}` : '',
  previousError ? `The previous execution failed. Fix the code based on this error and do not repeat the same mistake:\n${previousError.slice(0, 4000)}` : '',
  'Save every important Matplotlib chart by calling save_current_matplotlib_chart(title, chart_type).',
  'Save every important Plotly chart by calling save_plotly_chart(fig, title, chart_type).',
  'Print a concise execution summary with the key computed values.'
].filter(Boolean).join('\n');

const getFinalAnalysisInstruction = (analysisContext: string, hasRenderableOutput: boolean) => [
  'Continue the assistant response after Code Execution and do not repeat the opening setup sentence.',
  'Write the final user-facing answer naturally in the user language.',
  'Use the analysis output below as tool context.',
  'Do not mention tool-status filler.',
  'Do not paste the Python code.',
  'Do not repeat auto-generated technical insight bullets verbatim.',
  'Explain the meaningful result, caveats, and chart interpretation briefly.',
  hasRenderableOutput ? 'Put the exact token {{DEEPCHAT_ANALYSIS_CHART}} where the chart, spreadsheet preview, or generated table should appear in the response. Place it after a natural setup sentence when helpful.' : 'Do not include the token {{DEEPCHAT_ANALYSIS_CHART}} because the tool produced text-only analysis without a renderable chart, workbook, preview, or file.',
  'Do not mention PDF. If the result is a spreadsheet, briefly say that an Excel workbook is ready and that the preview can be expanded or downloaded.',
  'If the result is a chart, do not mention downloadable reports or generated file summaries. The chart UI already handles chart download.',
  'Do not mention View Analysis. The interface will place the View Analysis action at the end of the final content.',
  'For predictions or forecasts, state that the chart is an estimate based on available data and should not be treated as financial advice.',
  '',
  analysisContext
].join('\n');

const getAnalysisFailureInstruction = (errorContext: string) => [
  'The Code Execution tool failed after retrying. Continue the assistant response naturally in the user language.',
  'Do not include traceback, file paths, stack traces, package logs, or raw technical errors.',
  'Say clearly that the code execution tool could not be used for this request, so the chart, spreadsheet, or computed artifact was not generated.',
  'Give a brief useful explanation or next-best answer from conversation context only.',
  'Do not claim that a file, chart, workbook, preview, or download is available.',
  'Do not mention View Analysis or internal tool names except the short phrase "Code execution error" if needed.',
  '',
  `Private error context for your awareness only:\n${errorContext.slice(0, 3000)}`
].join('\n');

const getAnalysisError = (data: CodeAnalysisResponse) => [
  data.error,
  data.execution?.stderr,
  data.execution?.stdout
].filter(Boolean).join('\n').trim();

const readAnalysisResponse = async (response: Response): Promise<CodeAnalysisResponse> => {
  try {
    return await response.clone().json() as CodeAnalysisResponse;
  } catch {
    const text = await response.text().catch(() => '');
    return {
      success: false,
      error: text || `Code Execution request failed with status ${response.status}`,
      execution: {
        stdout: '',
        stderr: text || `HTTP ${response.status}`
      }
    };
  }
};

const getSpreadsheetFinalText = (data: CodeAnalysisResponse) => {
  const exportItem = Array.isArray(data.exports) && isRecord(data.exports[0]) ? data.exports[0] : null;
  const fileName = isRecord(data.workbookPreview) ? getString(data.workbookPreview.fileName) : '';
  const label = getString(exportItem?.label) || fileName || 'workbook Excel';
  return [
    `${label} sudah dibuat dan siap dipreview atau diunduh.`,
    '',
    '{{DEEPCHAT_ANALYSIS_CHART}}'
  ].join('\n');
};

const runCodeAnalysisTool = async (task: ChatGenerationTask, latestUserMessage: ChatApiMessage, decision: ToolDecision) => {
  const files = normalizeAttachedDataFiles(latestUserMessage.attachedFiles);
  const requestedCharts = getRequestedChartTypes(latestUserMessage.content || '');
  const wantsSpreadsheet = isSpreadsheetAnalysisRequest(latestUserMessage);
  const runtimeMode = getAnalysisRuntimeMode(latestUserMessage, requestedCharts);
  const formattedMessages = formatMessages(task.apiMessages);
  let prefaceResult: { text: string; sources: SearchSource[] } = { text: '', sources: [] };
  try {
    prefaceResult = await streamAnalysisModel(task, formattedMessages, getAnalysisPrefaceInstruction(), decision.useSearch, { stripTokens: false, emit: true });
  } catch {
    prefaceResult = { text: '', sources: [] };
  }
  const prefaceContent = normalizeAnalysisPreface(prefaceResult.text);
  task.searchSources = prefaceResult.sources.length ? prefaceResult.sources : task.searchSources;
  task.fullContent = prefaceContent;
  task.mcpContentOffset = task.fullContent.length;
  task.mcpUsage = [{
    id: 'code-execution',
    name: 'Code Execution',
    status: 'running',
    details: JSON.stringify({ code: '', stdout: wantsSpreadsheet ? 'Preparing the Excel workbook...' : 'Asking the model to write Python analysis code...', stderr: '' }, null, 2)
  }];
  emitSnapshot(task, true);

  const maxAttempts = 3;
  let code = '';
  let data: CodeAnalysisResponse | null = null;
  let lastError = '';
  const runtimeManifest = await getRuntimeManifestText(runtimeMode);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    task.mcpUsage = [{
      id: 'code-execution',
      name: 'Code Execution',
      status: 'running',
      details: JSON.stringify({
        code,
        stdout: attempt === 1 ? 'Asking the model to write Python analysis code...' : `Retrying Python analysis after an execution error (${attempt}/${maxAttempts})...`,
        stderr: lastError
      }, null, 2)
    }];
    emitSnapshot(task, true);

    const codeResult = await callAnalysisModel(task, formattedMessages, getAnalysisCodeInstruction(files, requestedCharts, decision.useSearch, runtimeMode, runtimeManifest, lastError, code), decision.useSearch);
    code = getPythonFromModelText(codeResult.text);
    task.searchSources = codeResult.sources.length ? codeResult.sources : task.searchSources;
    if (!isUsablePythonCode(code)) {
      lastError = 'The model did not return valid executable Python code. Return only JSON with a Python code string, and never return UI artifact tokens.';
      continue;
    }
    task.mcpUsage = [{
      id: 'code-execution',
      name: 'Code Execution',
      status: 'running',
      details: JSON.stringify({ code, stdout: `Running Python analysis (${attempt}/${maxAttempts})...`, stderr: '' }, null, 2)
    }];
    emitSnapshot(task, true);

    const response = await fetch('/api/code/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: task.chatId,
        prompt: latestUserMessage.content || '',
        displayCode: code,
        code,
        requestedCharts,
        analysisMode: runtimeMode,
        files
      }),
      signal: task.controller.signal
    });
    const nextData = await readAnalysisResponse(response);
    if (response.ok && nextData.success !== false) {
      data = nextData;
      break;
    }
    lastError = getAnalysisError(nextData) || 'Code Execution failed.';
    if (attempt === maxAttempts) {
      data = nextData;
    }
  }

  if (!data || data.success === false) {
    task.mcpUsage = [{
      id: 'code-execution',
      name: 'Code Execution',
      status: 'error',
      details: JSON.stringify({
        code,
        stdout: data?.execution?.stdout || '',
        stderr: lastError || getAnalysisError(data || {}) || 'Code Execution failed.'
      }, null, 2)
    }];
    emitSnapshot(task, true);
    let fallbackText = '';
    try {
      const fallbackResult = await streamAnalysisModel(task, formattedMessages, getAnalysisFailureInstruction(lastError || getAnalysisError(data || {}) || 'Code Execution failed.'), decision.useSearch, { baseContent: prefaceContent });
      task.searchSources = fallbackResult.sources.length ? fallbackResult.sources : task.searchSources;
      fallbackText = fallbackResult.text;
    } catch {
      fallbackText = 'Code execution error. Tool analisis tidak bisa digunakan untuk permintaan ini, jadi file atau visualisasi belum berhasil dibuat.';
    }
    const errorArtifact: CodeAnalysisResponse = {
      ...(data || {}),
      success: false,
      error: lastError || getAnalysisError(data || {}) || 'Code Execution failed.',
      execution: {
        code: data?.execution?.code || code,
        stdout: data?.execution?.stdout || '',
        stderr: data?.execution?.stderr || lastError || getAnalysisError(data || {}) || 'Code Execution failed.'
      }
    };
    task.fullContent = [prefaceContent, formatAnalysisMarkdown(fallbackText, errorArtifact)].filter(Boolean).join('\n\n');
    await finishSuccessfulTask(task);
    return;
  }

  task.mcpUsage = [{
    id: 'code-execution',
    name: 'Code Execution',
    status: 'completed',
    details: JSON.stringify({
      code: data.execution?.code || code,
      stdout: data.execution?.stdout || 'Python analysis completed.',
      stderr: data.execution?.stderr || data.error || ''
    }, null, 2)
  }];
  emitSnapshot(task, true);

  let finalText = '';
  const hasRenderableOutput = hasRenderableAnalysisOutput(data);
  try {
    const finalResult = await streamAnalysisModel(task, formattedMessages, getFinalAnalysisInstruction(compactAnalysisContext(data), hasRenderableOutput), decision.useSearch, { baseContent: prefaceContent });
    task.searchSources = finalResult.sources.length ? finalResult.sources : task.searchSources;
    finalText = finalResult.text;
  } catch {
    finalText = hasRenderableOutput ? wantsSpreadsheet ? getSpreadsheetFinalText(data) : 'Hasil analisis sudah siap. {{DEEPCHAT_ANALYSIS_CHART}}' : 'Hasil analisis selesai, tetapi tidak ada chart, workbook, atau file preview yang perlu ditampilkan.';
  }
  task.fullContent = [prefaceContent, formatAnalysisMarkdown(finalText || 'Here is the analysis.', data)].filter(Boolean).join('\n\n');
  await finishSuccessfulTask(task);
};

const applyMCPUsageEvent = (task: ChatGenerationTask, event: MCPUsageItem) => {
  const index = task.mcpUsage.findIndex(item => item.id === event.id);
  if (index === -1) {
    task.mcpUsage.push(event);
  } else {
    task.mcpUsage[index] = { ...task.mcpUsage[index], ...event };
  }
};

const finishSuccessfulTask = async (task: ChatGenerationTask) => {
  if (!task.fullContent && !task.fullReasoning && !task.clarification) {
    throw new Error('The provider returned an empty response.');
  }

  task.status = 'completed';
  let finalMessage: StoredChatMessage | null = null;
  try {
    finalMessage = await saveFinalMessage(task);
  } catch {
    finalMessage = null;
  }
  emitSnapshot(task, true);

  if (finalMessage) {
    void saveMemoriesFromResponse(task.chatId, task.apiMessages, finalMessage, task.connection);
    const currentChat = await getChat(task.chatId);
    const latestUserPrompt = [...task.apiMessages].reverse().find(m => m.role === 'user')?.content;
    if (latestUserPrompt && isGenericChatTitle(currentChat?.title)) {
      try {
        await generateChatTitle(task.chatId, latestUserPrompt, task.connection);
      } catch {
      }
    }
  }

  publishDeepChatNotification({
    id: `generation-finished-${task.chatId}-${task.assistantMsgId}`,
    type: 'responseFinished',
    title: 'Response finished',
    description: 'Your background response is ready to read.',
    severity: 'success',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const finishStoppedTask = async (task: ChatGenerationTask) => {
  task.status = 'stopped';
  task.fullContent = task.fullContent || 'Generation stopped.';
  task.mcpUsage = task.mcpUsage.map(item => item.id === 'code-execution' && item.status === 'running' ? { ...item, status: 'completed' } : item);
  await saveFinalMessage(task, { isStopped: true });
  emitSnapshot(task, true);
  publishDeepChatNotification({
    id: `generation-stopped-${task.chatId}-${task.assistantMsgId}`,
    type: 'task',
    title: 'Task stopped',
    description: 'The active generation task was stopped.',
    severity: 'warning',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const finishErroredTask = async (task: ChatGenerationTask, error: unknown) => {
  task.status = 'error';
  const errorMessage = getErrorMessage(error);
  const message = errorMessage.startsWith('Tool code execution error')
    ? 'Code execution error.'
    : errorMessage
      ? `I encountered an error while processing your request.`
      : 'I encountered an error while processing your request.';
  await saveFinalMessage(task, { isError: true, errorMessage: message });
  task.fullContent = message;
  emitSnapshot(task, true);
  publishDeepChatNotification({
    id: `generation-error-${task.chatId}-${task.assistantMsgId}`,
    type: 'task',
    title: 'Task failed',
    description: 'The generation task could not be completed.',
    severity: 'error',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const consumeStream = async (task: ChatGenerationTask, res: Response) => {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const provider = res.headers.get('x-provider') || '';

  if (!reader) return;

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || line.startsWith(':')) continue;

      const data = line.replace(/^data:\s*/, '').trim();
      if (data === '[DONE]') break;

      let json: Record<string, unknown>;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!isRecord(parsed)) continue;
        json = parsed;
      } catch {
        continue;
      }

      if (json.error) {
        throw new Error(getString(json.error) || 'Provider returned an error.');
      }

      if (json.type === 'deepchat_content') {
        task.fullContent += getString(json.text);
        emitSnapshot(task, true);
        continue;
      }

      if (json.type === 'deepchat_clarification') {
        const clarification = isRecord(json.clarification) ? json.clarification as unknown as AgentClarification : undefined;
        if (clarification) {
          task.clarification = clarification;
          task.fullContent = parseAgentClarification(task.fullContent).visibleContent;
          emitSnapshot(task, true);
        }
        continue;
      }

      if (json.type === 'deepchat_mcp_notice') {
        task.mcpNotice = getString(json.text);
        emitSnapshot(task, true);
        continue;
      }

      if (json.type === 'deepchat_mcp') {
        const event = normalizeMCPUsageEvent(json);
        if (event) {
          if (task.mcpContentOffset === undefined) {
            task.mcpContentOffset = task.fullContent.length;
          }
          applyMCPUsageEvent(task, event);
          emitSnapshot(task, true);
        }
        continue;
      }

      if (json.type === 'deepchat_sources') {
        task.searchSources = normalizeSearchSources(json.sources);
        emitSnapshot(task, true);
        continue;
      }

      if (provider === 'anthropic') {
        const delta = isRecord(json.delta) ? json.delta : null;
        if (json.type === 'content_block_delta') {
          task.fullContent += getString(delta?.text);
        }
      } else if (provider === 'gemini' || provider === 'vertexai') {
        task.fullContent += getGeminiText(json);
      } else {
        const delta = getOpenAiDelta(json);
        if (delta.reasoning) {
          task.fullReasoning += delta.reasoning;
          task.reasoningEndTime = Date.now();
        }
        if (delta.content) {
          task.fullContent += delta.content;
        }
      }
    }

    emitSnapshot(task);
  }
  const parsedContent = parseAgentClarification(task.fullContent);
  task.fullContent = parsedContent.visibleContent;
  if (parsedContent.clarification && !task.clarification) {
    task.clarification = parsedContent.clarification;
    emitSnapshot(task, true);
  }
};

const runTask = async (task: ChatGenerationTask) => {
  try {
    const latestUserMessage = getLatestUserMessage(task.apiMessages);
    const toolDecision = await decideTools(task, latestUserMessage);
    if (latestUserMessage && toolDecision.useCodeAnalysis) {
      await runCodeAnalysisTool(task, latestUserMessage, toolDecision);
      return;
    }
    const formattedMessages = formatMessages(task.apiMessages);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: formattedMessages,
        connectionId: task.connection?.connectionId,
        modelId: task.connection?.id,
        imageAspectRatio: normalizeImageAspectRatio(latestUserMessage?.imageAspectRatio),
        mcpServers: getEnabledMCPRuntimeServers(),
        tools: getEnabledToolRuntimeItems(toolDecision.useSearch)
      }),
      signal: task.controller.signal
    });

    if (!res.ok) throw new Error(await getResponseError(res));

    await consumeStream(task, res);

    if (task.stopRequested) {
      await finishStoppedTask(task);
    } else {
      await finishSuccessfulTask(task);
    }
  } catch (error: unknown) {
    if (task.stopRequested || isAbortError(error)) {
      await finishStoppedTask(task);
    } else {
      await finishErroredTask(task, error);
    }
  } finally {
    tasks.delete(task.chatId);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId: task.chatId } }));
  }
};

export const startChatGeneration = (chatId: string, apiMessages: ChatApiMessage[], assistantMsgId: string) => {
  const existing = tasks.get(chatId);
  if (existing) return getSnapshot(existing);
  const selectedConnection = getSelectedConnection();

  const task: ChatGenerationTask = {
    chatId,
    assistantMsgId,
    apiMessages,
    controller: new AbortController(),
    fullContent: '',
    fullReasoning: '',
    mcpUsage: [],
    mcpContentOffset: undefined,
    searchSources: [],
    clarification: undefined,
    startedAt: Date.now(),
    reasoningEndTime: Date.now(),
    status: 'running',
    stopRequested: false,
    connection: selectedConnection,
    generationMode: shouldRequestImageGeneration(getLatestUserMessage(apiMessages)) ? 'image' : getGenerationMode(selectedConnection?.id),
    lastEmittedAt: 0,
    pendingEmit: null
  };

  tasks.set(chatId, task);
  emitSnapshot(task, true);
  task.promise = runTask(task);
  return getSnapshot(task);
};

export const stopChatGeneration = (chatId: string) => {
  const task = tasks.get(chatId);
  if (!task || task.status !== 'running') return false;
  task.stopRequested = true;
  task.controller.abort();
  return true;
};

export const getChatGenerationState = (chatId: string) => {
  const task = tasks.get(chatId);
  return task ? getSnapshot(task) : null;
};

export const subscribeChatGeneration = (chatId: string, listener: (snapshot: ChatGenerationSnapshot) => void) => {
  const set = listeners.get(chatId) || new Set<(snapshot: ChatGenerationSnapshot) => void>();
  set.add(listener);
  listeners.set(chatId, set);

  const task = tasks.get(chatId);
  if (task) listener(getSnapshot(task));

  return () => {
    const current = listeners.get(chatId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(chatId);
  };
};
