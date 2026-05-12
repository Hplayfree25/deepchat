'use client';

export type ToolCategory = 'Web Search' | 'Web Extraction' | 'Research' | 'Browser Cloud';

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
  installed: InstalledTool[];
}

export interface ToolRuntimeItem {
  toolId: string;
  name: string;
  description: string;
  category: ToolCategory;
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
  tool('tavily', 'Tavily Search', 'AI-focused web search with research snippets and source-aware results.', 'Web Search', ['TAVILY_API_KEY'], ['search', 'research', 'web']),
  tool('brave-search', 'Brave Search', 'Public web, news, image, and local search through Brave Search API.', 'Web Search', ['BRAVE_API_KEY'], ['search', 'news', 'web']),
  tool('firecrawl', 'Firecrawl', 'Crawl websites, extract structured pages, and convert content to markdown.', 'Web Extraction', ['FIRECRAWL_API_KEY'], ['crawl', 'scrape', 'markdown']),
  tool('serpapi', 'SerpAPI', 'Google and vertical search results through SerpAPI.', 'Web Search', ['SERPAPI_API_KEY'], ['google', 'search', 'results']),
  tool('exa', 'Exa Search', 'Neural web search for semantic research and high-quality source discovery.', 'Research', ['EXA_API_KEY'], ['semantic', 'research', 'web']),
  tool('perplexity', 'Perplexity', 'Online answer and search API for current research workflows.', 'Research', ['PERPLEXITY_API_KEY'], ['ai', 'answers', 'research']),
  tool('jina-reader', 'Jina Reader', 'Read and convert public web pages into clean LLM-ready text.', 'Web Extraction', ['JINA_API_KEY'], ['reader', 'markdown', 'web']),
  tool('linkup', 'Linkup Search', 'Web search API optimized for LLM retrieval and citations.', 'Web Search', ['LINKUP_API_KEY'], ['search', 'citations', 'web']),
  tool('kagi', 'Kagi Search', 'Premium web search and summarization through Kagi APIs.', 'Web Search', ['KAGI_API_KEY'], ['search', 'summary', 'web']),
  tool('bing', 'Bing Search', 'Microsoft Bing web, news, and image search API.', 'Web Search', ['BING_SEARCH_API_KEY'], ['search', 'microsoft', 'web']),
  tool('google-custom-search', 'Google Custom Search', 'Programmable Google search engine results.', 'Web Search', ['GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID'], ['google', 'search', 'web']),
  tool('apify', 'Apify', 'Run actors for web scraping, crawling, and browser automation datasets.', 'Web Extraction', ['APIFY_API_TOKEN'], ['actors', 'scraping', 'automation']),
  tool('browserbase', 'Browserbase', 'Cloud browser sessions for scraping, automation, and screenshots.', 'Browser Cloud', ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'], ['browser', 'cloud', 'screenshots']),
  tool('browserless', 'Browserless', 'Hosted Chrome automation for screenshots, PDFs, and scripted browsing.', 'Browser Cloud', ['BROWSERLESS_API_KEY'], ['chrome', 'automation', 'cloud']),
  tool('scrapingbee', 'ScrapingBee', 'Web scraping API with proxies, rendering, and extraction helpers.', 'Web Extraction', ['SCRAPINGBEE_API_KEY'], ['scraping', 'proxy', 'web'])
];

export const defaultToolSettings: ToolSettings = {
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
  return { installed: installed.filter((item, index, list) => list.findIndex(match => match.toolId === item.toolId) === index) };
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
    installed: [...current.installed, {
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
  return saveToolSettings({ installed: current.installed.filter(item => item.id !== installedId) });
};

export const toggleTool = (installedId: string, enabled: boolean) => {
  const current = loadToolSettings();
  return saveToolSettings({
    installed: current.installed.map(item => item.id === installedId ? { ...item, enabled } : item)
  });
};

export const updateToolConfig = (installedId: string, config: Record<string, string>) => {
  const current = loadToolSettings();
  return saveToolSettings({
    installed: current.installed.map(item => item.id === installedId ? { ...item, config: normalizeConfig(config, item.env) } : item)
  });
};

export const getEnabledToolRuntimeItems = (): ToolRuntimeItem[] => loadToolSettings().installed.filter(item => item.enabled).map(item => {
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
