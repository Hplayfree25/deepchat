'use client';

export type ToolCategory = 'API Search' | 'No API Search';

export interface ToolCatalogItem {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  env: string[];
  tags: string[];
}

export interface InstalledTool {
  id: string;
  toolId: string;
  name: string;
  description: string;
  category: ToolCategory;
  env: string[];
  tags: string[];
  config: Record<string, string>;
  enabled: boolean;
  installedAt: string;
}

export interface ToolSettings {
  searchEnabled: boolean;
  codeExecutionEnabled: boolean;
  urlContextEnabled: boolean;
  installed: InstalledTool[];
}

export interface ToolRuntimeItem {
  toolId: string;
  name: string;
  description: string;
  category: string;
  env: string[];
  tags: string[];
  config: Record<string, string>;
  configured: boolean;
  missingEnv: string[];
}

const tool = (id: string, name: string, description: string, category: ToolCategory, env: string[], tags: string[]): ToolCatalogItem => ({
  id,
  name,
  description,
  category,
  env,
  tags
});

export const TOOL_CATALOG: ToolCatalogItem[] = [
  tool('openai-compatible-search', 'OpenAI Compatible', 'Use an OpenAI-compatible search endpoint with a custom base URL and API key.', 'API Search', ['OPENAI_COMPATIBLE_SEARCH_BASE_URL', 'OPENAI_COMPATIBLE_SEARCH_API_KEY'], ['openai-compatible', 'api', 'search']),
  tool('tavily', 'Tavily', 'AI-focused web search with source-aware results for research workflows.', 'API Search', ['TAVILY_API_KEY'], ['api', 'search', 'research']),
  tool('exa', 'Exa', 'Neural search for semantic web discovery and high-quality source retrieval.', 'API Search', ['EXA_API_KEY'], ['api', 'semantic', 'search']),
  tool('perplexity', 'Perplexity', 'Online answer and search API for current web research.', 'API Search', ['PERPLEXITY_API_KEY'], ['api', 'answers', 'search']),
  tool('brave-search', 'Brave Search', 'Public web, news, image, and local search through the Brave Search API.', 'API Search', ['BRAVE_API_KEY'], ['api', 'news', 'search']),
  tool('serpapi', 'SerpAPI', 'Google and vertical search results through SerpAPI.', 'API Search', ['SERPAPI_API_KEY'], ['api', 'google', 'search']),
  tool('linkup', 'Linkup', 'Web search API optimized for LLM retrieval and citations.', 'API Search', ['LINKUP_API_KEY'], ['api', 'citations', 'search']),
  tool('kagi', 'Kagi', 'Premium web search and summarization through Kagi APIs.', 'API Search', ['KAGI_API_KEY'], ['api', 'summary', 'search']),
  tool('google-custom-search', 'Google Custom Search', 'Programmable Google search engine results.', 'API Search', ['GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID'], ['api', 'google', 'search']),
  tool('bing', 'Bing', 'No-key web search option for lightweight browsing-style queries.', 'No API Search', [], ['no-api', 'bing', 'search']),
  tool('duckduckgo', 'DuckDuckGo', 'No-key web search option focused on general web results.', 'No API Search', [], ['no-api', 'privacy', 'search']),
  tool('wikipedia', 'Wikipedia', 'No-key encyclopedia lookup for public knowledge pages.', 'No API Search', [], ['no-api', 'encyclopedia', 'search'])
];

export const defaultToolSettings: ToolSettings = {
  searchEnabled: true,
  codeExecutionEnabled: true,
  urlContextEnabled: true,
  installed: []
};

const SETTINGS_KEY = 'deepchat-tool-settings';
const SETTINGS_EVENT = 'deepchat:tool-settings-updated';
const validToolIds = new Set(TOOL_CATALOG.map(item => item.id));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');

const normalizeConfig = (value: unknown, env: string[]) => {
  if (!isRecord(value)) return {};
  return env.reduce<Record<string, string>>((config, key) => {
    const configValue = value[key];
    if (typeof configValue === 'string') config[key] = configValue;
    return config;
  }, {});
};

const normalizeInstalledTool = (value: unknown): InstalledTool | null => {
  if (!isRecord(value)) return null;
  const toolId = typeof value.toolId === 'string' && validToolIds.has(value.toolId) ? value.toolId : null;
  if (!toolId) return null;
  const catalogItem = TOOL_CATALOG.find(item => item.id === toolId);
  if (!catalogItem) return null;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `${toolId}-${Date.now()}`,
    toolId,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : catalogItem.name,
    description: typeof value.description === 'string' && value.description.trim() ? value.description : catalogItem.description,
    category: catalogItem.category,
    env: catalogItem.env,
    tags: catalogItem.tags,
    config: normalizeConfig(value.config, catalogItem.env),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    installedAt: typeof value.installedAt === 'string' && value.installedAt.trim() ? value.installedAt : new Date().toISOString()
  };
};

const normalizeSettings = (settings: unknown): ToolSettings => {
  if (!isRecord(settings)) return defaultToolSettings;
  const installed = Array.isArray(settings.installed)
    ? settings.installed.map(normalizeInstalledTool).filter((item): item is InstalledTool => Boolean(item))
    : [];
  const uniqueInstalled = installed.filter((item, index, list) => list.findIndex(match => match.toolId === item.toolId) === index);
  const selectedTool = uniqueInstalled.find(item => item.enabled) || uniqueInstalled[0];
  const selectedInstalled = selectedTool ? [selectedTool] : [];
  return {
    searchEnabled: typeof settings.searchEnabled === 'boolean' ? settings.searchEnabled : true,
    codeExecutionEnabled: typeof settings.codeExecutionEnabled === 'boolean' ? settings.codeExecutionEnabled : true,
    urlContextEnabled: typeof settings.urlContextEnabled === 'boolean' ? settings.urlContextEnabled : true,
    installed: selectedInstalled
  };
};

export const loadToolSettings = () => {
  if (typeof window === 'undefined') return defaultToolSettings;
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return defaultToolSettings;
  }
};

export const saveToolSettings = (settings: ToolSettings) => {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
};

export const installTool = (toolId: string) => {
  const catalogItem = TOOL_CATALOG.find(item => item.id === toolId);
  const current = loadToolSettings();
  if (!catalogItem) return current;
  if (current.installed.some(item => item.toolId === toolId)) return current;
  return saveToolSettings({
    ...current,
    installed: [{
      ...catalogItem,
      id: `${catalogItem.id}-${Date.now()}`,
      toolId: catalogItem.id,
      config: {},
      enabled: true,
      installedAt: new Date().toISOString()
    }]
  });
};

export const uninstallTool = (installedId: string) => {
  const current = loadToolSettings();
  return saveToolSettings({ ...current, installed: current.installed.filter(item => item.id !== installedId) });
};

export const toggleTool = (installedId: string, enabled: boolean) => {
  const current = loadToolSettings();
  return saveToolSettings({
    ...current,
    installed: current.installed.map(item => item.id === installedId ? { ...item, enabled } : { ...item, enabled: false })
  });
};

export const updateToolConfig = (installedId: string, config: Record<string, string>) => {
  const current = loadToolSettings();
  return saveToolSettings({
    ...current,
    installed: current.installed.map(item => item.id === installedId ? { ...item, config: normalizeConfig(config, item.env) } : item)
  });
};

export const updateToolFeatureSettings = (patch: Partial<Pick<ToolSettings, 'searchEnabled' | 'codeExecutionEnabled' | 'urlContextEnabled'>>) => {
  const current = loadToolSettings();
  return saveToolSettings({ ...current, ...patch });
};

const getInstalledSearchRuntimeItems = (settings: ToolSettings): ToolRuntimeItem[] => settings.installed.filter(item => item.enabled).map(item => {
  const missingEnv = item.env.filter(envKey => !item.config?.[envKey]);
  return {
    toolId: item.toolId,
    name: item.name,
    description: item.description,
    category: item.category,
    env: item.env,
    tags: item.tags,
    config: item.config || {},
    configured: missingEnv.length === 0,
    missingEnv
  };
});

const getDuckDuckGoRuntimeItem = (): ToolRuntimeItem => ({
  toolId: 'duckduckgo',
  name: 'DuckDuckGo',
  description: 'No-key web search option focused on general web results.',
  category: 'No API Search',
  env: [],
  tags: ['no-api', 'privacy', 'search'],
  config: {},
  configured: true,
  missingEnv: []
});

const getEnabledSearchRuntimeItems = (settings: ToolSettings, requested: boolean): ToolRuntimeItem[] => {
  if (!settings.searchEnabled) return [];
  if (!requested) return [];
  const installed = getInstalledSearchRuntimeItems(settings);
  const configuredInstalled = installed.filter(item => item.configured);
  if (configuredInstalled.length > 0) return configuredInstalled;
  return [getDuckDuckGoRuntimeItem()];
};

export const getEnabledToolRuntimeItems = (webSearchRequested = false): ToolRuntimeItem[] => {
  const settings = loadToolSettings();
  const runtimeItems = getEnabledSearchRuntimeItems(settings, webSearchRequested);
  if (settings.urlContextEnabled) {
    runtimeItems.push({
      toolId: 'url-context',
      name: 'URL Context',
      description: 'Automatically reads links from the user message and adds the fetched page text as conversation context.',
      category: 'Context',
      env: [],
      tags: ['url', 'browse', 'context'],
      config: {},
      configured: true,
      missingEnv: []
    });
  }
  return runtimeItems;
};

export const shouldUseSmartSearch = (prompt: string) => {
  const text = prompt.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text) return false;
  if (/\b(without|no|disable|skip|avoid)\s+(web|internet|search|browsing|sources?)\b/.test(text)) return false;
  if (/\b(do not|don't|dont)\s+(search|browse|look up|use the web|use internet)\b/.test(text)) return false;
  if (/\boffline answer\b|\bfrom memory\b|\bno sources?\b/.test(text)) return false;
  if (/\b(tanpa|jangan|tidak perlu|nggak perlu|ga perlu|gak perlu)\s+(internet|web|search|cari|pencarian|browse|browsing)\b/.test(text)) return false;
  const directIntent = /\b(web search|search online|look up|browse|google|research online|source|sources|cite|citation|fact check|carikan|telusuri|riset web|sumber|referensi|validasi sumber)\b/;
  const freshnessIntent = /\b(latest|newest|current|recent|today|this week|this month|this year|now|live|real time|up to date|terbaru|terkini|saat ini|sekarang|hari ini|minggu ini|bulan ini|tahun ini|update|berita)\b/;
  const marketIntent = /\b(price|prices|pricing|stock|buy|deal|discount|promo|coupon|release date|harga|stok|tersedia|beli|jual|diskon|rilis)\b/;
  const comparisonIntent = /\b(compare|comparison|versus|vs|best|top|recommended|recommendation|alternatives|bandingkan|perbandingan|terbaik|rekomendasi|alternatif)\b/;
  const domainHint = /\b[a-z0-9-]+\.(com|co|id|net|org|io|dev|app|ai|co\.id)\b/;
  return directIntent.test(text) || freshnessIntent.test(text) || marketIntent.test(text) || domainHint.test(text) || comparisonIntent.test(text) && freshnessIntent.test(text);
};
