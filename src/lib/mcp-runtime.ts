import { execFile } from 'child_process';
import dns from 'dns/promises';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { promisify } from 'util';
import { parseGeneratedClarificationAnswerContent } from '@/lib/agent-clarification';

export interface ChatMCPRuntimeServer {
  serverId: string;
  name: string;
  description: string;
  category: string;
  availability: 'offline' | 'online';
  command: string;
  args: string[];
  env: string[];
  tags: string[];
  config: Record<string, string>;
  configured: boolean;
  missingEnv: string[];
}

export interface ChatToolRuntimeItem {
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

export interface MCPRuntimeUsageItem {
  id: string;
  name: string;
  status: 'completed' | 'error';
  details: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
}

const execFileAsync = promisify(execFile);
const mcpFileRoot = path.join(process.cwd(), 'data', 'mcp-files');
const MAX_URL_CONTEXT_URLS = 3;
const MAX_URL_CONTEXT_CHARS = 6000;
const MAX_SEARCH_RESULTS = 6;
const MAX_SEARCH_CONTEXT_CHARS = 9000;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];

const sanitizeMCPPrompt = (prompt: string) => {
  const clarificationAnswer = parseGeneratedClarificationAnswerContent(prompt);
  if (!clarificationAnswer) return prompt;
  return [
    clarificationAnswer.question ? `Clarification question: ${clarificationAnswer.question}` : '',
    `Clarification answer ${clarificationAnswer.shortcut}: ${clarificationAnswer.value}`
  ].filter(Boolean).join('\n');
};

const normalizeConfig = (value: unknown) => {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((config, [key, configValue]) => {
    if (typeof configValue === 'string') config[key] = configValue;
    return config;
  }, {});
};

export const normalizeChatMCPServers = (value: unknown): ChatMCPRuntimeServer[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((server): ChatMCPRuntimeServer => ({
    serverId: typeof server.serverId === 'string' ? server.serverId : '',
    name: typeof server.name === 'string' ? server.name : '',
    description: typeof server.description === 'string' ? server.description : '',
    category: typeof server.category === 'string' ? server.category : '',
    availability: server.availability === 'online' ? 'online' : 'offline',
    command: typeof server.command === 'string' ? server.command : '',
    args: asStringArray(server.args),
    env: asStringArray(server.env),
    tags: asStringArray(server.tags),
    config: normalizeConfig(server.config),
    configured: server.configured === true,
    missingEnv: asStringArray(server.missingEnv)
  })).filter(server => server.serverId && server.name);
};

export const normalizeChatTools = (value: unknown): ChatToolRuntimeItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(tool => ({
    toolId: typeof tool.toolId === 'string' ? tool.toolId : '',
    name: typeof tool.name === 'string' ? tool.name : '',
    description: typeof tool.description === 'string' ? tool.description : '',
    category: typeof tool.category === 'string' ? tool.category : '',
    env: asStringArray(tool.env),
    tags: asStringArray(tool.tags),
    config: normalizeConfig(tool.config),
    configured: tool.configured === true,
    missingEnv: asStringArray(tool.missingEnv)
  })).filter(tool => tool.toolId && tool.name);
};

const resolveSafePath = (inputPath?: string) => {
  const rawPath = inputPath?.trim();
  const resolved = rawPath ? path.resolve(rawPath) : mcpFileRoot;
  const normalizedWorkspace = path.normalize(mcpFileRoot + path.sep).toLowerCase();
  const normalizedResolved = path.normalize(resolved + path.sep).toLowerCase();
  return normalizedResolved.startsWith(normalizedWorkspace) ? resolved : mcpFileRoot;
};

const listWorkspaceFiles = async (rootPath: string) => {
  await fs.mkdir(rootPath, { recursive: true });
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries.slice(0, 80).map(entry => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`).join('\n');
};

const collectFilesystemContext = async (server: ChatMCPRuntimeServer, prompt: string) => {
  if (!/(file|folder|directory|workspace|project|list|read|struktur|direktori|berkas|folder)/i.test(prompt)) return '';
  const rootPath = resolveSafePath(server.config.ALLOWED_DIRECTORIES?.split(/[;,]/)[0]);
  const files = await listWorkspaceFiles(rootPath);
  return `MCP Filesystem (${rootPath})\n${files}`;
};

const collectGitContext = async (server: ChatMCPRuntimeServer, prompt: string) => {
  if (!/(git|commit|branch|diff|status|repository|repo|perubahan)/i.test(prompt)) return '';
  const cwd = resolveSafePath(server.config.GIT_REPOSITORY_PATH);
  const status = await execFileAsync('git', ['status', '--short'], { cwd, timeout: 3000 }).then(result => result.stdout.trim()).catch(error => `git status unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
  const branch = await execFileAsync('git', ['branch', '--show-current'], { cwd, timeout: 3000 }).then(result => result.stdout.trim()).catch(() => '');
  const latest = await execFileAsync('git', ['log', '-1', '--pretty=%h %s'], { cwd, timeout: 3000 }).then(result => result.stdout.trim()).catch(() => '');
  return `MCP Git (${cwd})\nbranch: ${branch || 'unknown'}\nlatest: ${latest || 'unknown'}\nstatus:\n${status || 'clean'}`;
};

const collectTimeContext = (prompt: string) => {
  if (!/(time|date|today|tomorrow|yesterday|jam|tanggal|hari ini|besok|kemarin)/i.test(prompt)) return '';
  return `MCP Time\n${new Date().toISOString()}`;
};

const tokenize = (value: string) => {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'yang', 'dan', 'untuk', 'dari', 'bisa', 'agar', 'atau']);
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !stopWords.has(token));
};

const getMCPRelevanceScore = (server: ChatMCPRuntimeServer, prompt: string) => {
  const promptTokens = new Set(tokenize(prompt));
  const haystack = [server.serverId, server.name, server.description, server.category, ...server.tags].join(' ').toLowerCase();
  const serverTokens = tokenize(haystack);
  const overlap = serverTokens.reduce((score, token) => score + (promptTokens.has(token) ? 1 : 0), 0);
  const explicitName = prompt.toLowerCase().includes(server.name.toLowerCase()) || prompt.toLowerCase().includes(server.serverId.toLowerCase());
  const explicitTag = server.tags.some(tag => prompt.toLowerCase().includes(tag.toLowerCase()));
  const categoryBoost = [
    server.category === 'Developer Tools' && /(code|repo|git|debug|test|build|deploy|error|bug|refactor|implement)/i.test(prompt),
    server.category === 'Databases' && /(database|sql|postgres|mysql|sqlite|mongodb|redis|query|schema|migration|migrasi|data)/i.test(prompt),
    server.category === 'Files' && /(file|folder|document|pdf|csv|json|excel|read|extract|berkas|dokumen)/i.test(prompt),
    server.category === 'Communication' && /(email|slack|discord|teams|message|chat|inbox|reply)/i.test(prompt),
    server.category === 'Productivity' && /(task|doc|note|calendar|project|issue|planning|jadwal|meeting)/i.test(prompt),
    server.category === 'Observability' && /(log|metric|trace|incident|monitor|alert|sentry|datadog|grafana)/i.test(prompt),
    server.category === 'Cloud' && /(cloud|aws|azure|gcp|vercel|netlify|deploy|bucket|worker|dns)/i.test(prompt),
    server.category === 'AI' && /(model|llm|reason|thinking|analy[sz]e|plan|complex|prompt)/i.test(prompt),
    server.category === 'Local System' && /(terminal|shell|process|clipboard|desktop|powershell|command)/i.test(prompt)
  ].filter(Boolean).length;
  return overlap + categoryBoost * 2 + (explicitName ? 8 : 0) + (explicitTag ? 3 : 0);
};

const collectGenericMCPContext = (server: ChatMCPRuntimeServer, prompt: string) => {
  const score = getMCPRelevanceScore(server, prompt);
  if (score < 3) return '';
  const reasonParts = [
    `matched category ${server.category}`,
    server.tags.length > 0 ? `matched capability tags ${server.tags.slice(0, 5).join(', ')}` : '',
    `relevance score ${score}`
  ].filter(Boolean);
  return [
    `MCP ${server.name}`,
    `Selected because it ${reasonParts.join('; ')}.`,
    `Capability: ${server.description}`,
    `Runtime command: ${server.command} ${server.args.join(' ')}`.trim(),
    server.env.length > 0 ? `Required configuration: ${server.env.join(', ')}` : 'Required configuration: none',
    'Use this MCP selection to decide what external context, checks, or actions are relevant. If no concrete tool result is present, state the verification needed instead of inventing data.'
  ].join('\n');
};

export const getMCPRuntimeCandidateServers = (servers: ChatMCPRuntimeServer[], latestUserMessage: string) => {
  const runtimePrompt = sanitizeMCPPrompt(latestUserMessage);
  return servers.filter(server => {
    if (!server.configured && server.env.length > 0) return false;
    if (server.serverId === 'filesystem') return /(file|folder|directory|workspace|project|list|read|struktur|direktori|berkas|folder)/i.test(runtimePrompt);
    if (server.serverId === 'git') return /(git|commit|branch|diff|status|repository|repo|perubahan)/i.test(runtimePrompt);
    if (server.serverId === 'time') return /(time|date|today|tomorrow|yesterday|jam|tanggal|hari ini|besok|kemarin)/i.test(runtimePrompt);
    if (server.serverId === 'sequential-thinking') return shouldUseSequentialThinking(runtimePrompt);
    return getMCPRelevanceScore(server, runtimePrompt) >= 3;
  });
};

const shouldUseSequentialThinking = (prompt: string) => {
  const normalized = prompt.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;
  if (/(sequential[-\s]?thinking|step[-\s]?by[-\s]?step|chain of thought|reasoning)/i.test(normalized)) return true;
  const strategicSignals = [
    /plan|rencana|strategy|strategi|roadmap/,
    /compare|comparison|option|opsi|alternative|alternatif|evaluate|decision|decide|pilih/,
    /assumption|asumsi|branch|cabang|scenario|skenario|what[-\s]?if/,
    /risk|risiko|resiko|trade[-\s]?off|mitigation|mitigasi/,
    /revise|revisi|iterate|ulang|fallback|rollback/,
    /migration|migrasi|upgrade|downtime|deploy|production/,
    /analy[sz]e|analisis|debug|investigate|audit|review/,
    /architecture|arsitektur|design|desain|refactor|implement/,
    /constraint|batasan|requirement|syarat|dependency/
  ];
  const score = strategicSignals.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  const strongSingleSignal = /(compare|option|alternative|architecture|assumption|branch|decision|migration|downtime|risk|rollback|strategy|roadmap)/i.test(normalized);
  return score >= 2 || strongSingleSignal || normalized.length > 160 && score >= 1;
};

const getSentenceMatches = (prompt: string, pattern: RegExp) => {
  return prompt
    .split(/(?<=[.!?])\s+|\n+/)
    .map(item => item.trim())
    .filter(item => item && pattern.test(item))
    .slice(0, 4);
};

const collectSequentialThinkingContext = (prompt: string) => {
  if (!shouldUseSequentialThinking(prompt)) return '';
  const goal = prompt.replace(/\s+/g, ' ').trim().slice(0, 600);
  const constraints = getSentenceMatches(prompt, /(must|should|only|if|when|without|under|limit|downtime|production|pastikan|jangan|kalau|bila|harus|maksimal|minimal|batas)/i);
  const riskTerms = getSentenceMatches(prompt, /(risk|risiko|resiko|downtime|rollback|failure|fail|error|incident|data loss|corruption|latency|security|auth|backup)/i);
  const steps = [
    'Clarify the objective and success criteria before proposing execution steps.',
    'Separate discovery, preparation, execution, validation, rollback, and communication work.',
    'Identify risks that can break the objective, especially data loss, downtime, compatibility, and operational visibility.',
    'Prefer reversible steps and explicit checkpoints before any destructive or high-impact action.',
    'Revise the plan when constraints make the first approach unsafe or too slow.'
  ];
  return [
    'MCP Sequential Thinking',
    `Objective: ${goal}`,
    constraints.length > 0 ? `Detected constraints:\n${constraints.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : 'Detected constraints: infer from the user request and state assumptions only when needed.',
    riskTerms.length > 0 ? `Risk signals:\n${riskTerms.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : 'Risk signals: evaluate likely technical, operational, and rollback risks.',
    `Reasoning scaffold:\n${steps.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
    'Output requirement: answer directly with the final useful plan or analysis. Do not expose hidden chain-of-thought; use concise rationale, checkpoints, risks, and revision criteria.'
  ].join('\n');
};

export const collectMCPRuntimeContextWithUsage = async (servers: ChatMCPRuntimeServer[], latestUserMessage: string) => {
  const runtimePrompt = sanitizeMCPPrompt(latestUserMessage);
  const context: string[] = [];
  const usage: MCPRuntimeUsageItem[] = [];
  for (const server of servers.filter(item => item.configured || item.env.length === 0)) {
    try {
      let value = '';
      if (server.serverId === 'filesystem') {
        value = await collectFilesystemContext(server, runtimePrompt);
      } else if (server.serverId === 'git') {
        value = await collectGitContext(server, runtimePrompt);
      } else if (server.serverId === 'time') {
        value = collectTimeContext(runtimePrompt);
      } else if (server.serverId === 'sequential-thinking') {
        value = collectSequentialThinkingContext(runtimePrompt);
      } else {
        value = collectGenericMCPContext(server, runtimePrompt);
      }
      if (value) {
        context.push(value);
        usage.push({
          id: server.serverId,
          name: server.name,
          status: 'completed',
          details: value
        });
      }
    } catch (error) {
      const details = `MCP ${server.name} error: ${error instanceof Error ? error.message : 'unknown error'}`;
      context.push(details);
      usage.push({
        id: server.serverId,
        name: server.name,
        status: 'error',
        details
      });
    }
  }
  return { context: context.join('\n\n'), usage };
};

export const collectMCPRuntimeContext = async (servers: ChatMCPRuntimeServer[], latestUserMessage: string) => {
  const result = await collectMCPRuntimeContextWithUsage(servers, latestUserMessage);
  return result.context;
};

const isPrivateIPv4 = (address: string) => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168) || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 || a >= 224;
};

const isPrivateIPv6 = (address: string) => {
  const value = address.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('2001:db8:');
};

const isBlockedAddress = (address: string) => {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);
  return true;
};

const assertSafeUrl = async (rawUrl: string) => {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS links are supported');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Local URLs are not allowed');
  if (net.isIP(hostname) && isBlockedAddress(hostname)) throw new Error('Private network URLs are not allowed');
  if (!net.isIP(hostname)) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0 || records.some(record => isBlockedAddress(record.address))) throw new Error('Private network URLs are not allowed');
  }
  return parsed;
};

const extractUrls = (text: string) => {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return Array.from(new Set(matches.map(url => url.replace(/[),.;!?]+$/g, '')))).slice(0, MAX_URL_CONTEXT_URLS);
};

const htmlToText = (text: string) => text
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const fetchUrlText = async (rawUrl: string, redirects = 0): Promise<{ url: string; text: string }> => {
  const parsed = await assertSafeUrl(rawUrl);
  const response = await fetch(parsed.toString(), {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: 'text/html, text/plain, text/markdown, application/json, application/xhtml+xml;q=0.9, */*;q=0.1',
      'User-Agent': 'DeepChat URL Context'
    }
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3) throw new Error('Too many redirects');
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect missing location');
    return fetchUrlText(new URL(location, parsed).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/(text\/|application\/json|application\/xhtml\+xml)/i.test(contentType)) throw new Error('URL did not return readable text');
  const text = await response.text();
  return { url: response.url || parsed.toString(), text: htmlToText(text).slice(0, MAX_URL_CONTEXT_CHARS) };
};

const decodeHtmlEntities = (value: string) => htmlToText(value);

const getHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const truncateText = (value: string, max = 420) => value.replace(/\s+/g, ' ').trim().slice(0, max);

const normalizeSearchSource = (source: Partial<SearchSource>): SearchSource | null => {
  const url = typeof source.url === 'string' ? source.url.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = truncateText(typeof source.title === 'string' && source.title.trim() ? source.title : getHost(url) || url, 120);
  const snippet = typeof source.snippet === 'string' ? truncateText(source.snippet) : '';
  return {
    title,
    url,
    snippet,
    displayUrl: typeof source.displayUrl === 'string' && source.displayUrl.trim() ? truncateText(source.displayUrl, 160) : getHost(url)
  };
};

const uniqueSources = (sources: SearchSource[]) => {
  const seen = new Set<string>();
  return sources.filter(source => {
    const key = source.url.replace(/[#?].*$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SEARCH_RESULTS);
};

const getJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Search request failed with ${response.status}`);
  return response.json() as Promise<unknown>;
};

const getText = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1',
      'User-Agent': 'DeepChat Search',
      ...(init?.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Search request failed with ${response.status}`);
  return response.text();
};

const searchDuckDuckGo = async (query: string) => {
  const html = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const sources: SearchSource[] = [];
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = resultPattern.exec(html)) && sources.length < MAX_SEARCH_RESULTS) {
    const rawUrl = decodeHtmlEntities(match[1]);
    const parsedUrl = rawUrl.includes('/l/?') ? new URL(rawUrl, 'https://duckduckgo.com').searchParams.get('uddg') || rawUrl : rawUrl;
    const source = normalizeSearchSource({
      url: parsedUrl,
      title: decodeHtmlEntities(match[2]),
      snippet: decodeHtmlEntities(match[3])
    });
    if (source) sources.push(source);
  }
  return uniqueSources(sources);
};

const searchBing = async (query: string) => {
  const html = await getText(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
  const sources: SearchSource[] = [];
  const resultPattern = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = resultPattern.exec(html)) && sources.length < MAX_SEARCH_RESULTS) {
    const source = normalizeSearchSource({
      url: decodeHtmlEntities(match[1]),
      title: decodeHtmlEntities(match[2]),
      snippet: decodeHtmlEntities(match[3] || '')
    });
    if (source) sources.push(source);
  }
  return uniqueSources(sources);
};

const searchWikipedia = async (query: string) => {
  const data = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${MAX_SEARCH_RESULTS}`);
  const items = isRecord(data) && isRecord(data.query) && Array.isArray(data.query.search) ? data.query.search : [];
  return uniqueSources(items.map(item => {
    if (!isRecord(item)) return null;
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) return null;
    return normalizeSearchSource({
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
      snippet: typeof item.snippet === 'string' ? item.snippet : ''
    });
  }).filter((item): item is SearchSource => Boolean(item)));
};

const searchPerplexity = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is missing');
  const data = await getJson('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    })
  });
  const citations = isRecord(data) && Array.isArray(data.citations) ? data.citations : [];
  const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  const snippet = typeof message?.content === 'string' ? message.content : '';
  return uniqueSources(citations.map(citation => typeof citation === 'string' ? normalizeSearchSource({
    title: getHost(citation) || citation,
    url: citation,
    snippet
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchBrave = async (query: string, tool: ChatToolRuntimeItem) => {
  const token = tool.config.BRAVE_API_KEY;
  if (!token) throw new Error('BRAVE_API_KEY is missing');
  const data = await getJson(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_SEARCH_RESULTS}`, {
    headers: { 'X-Subscription-Token': token }
  });
  const results = isRecord(data) && isRecord(data.web) && Array.isArray(data.web.results) ? data.web.results : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    snippet: typeof item.description === 'string' ? item.description : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchTavily = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is missing');
  const data = await getJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: MAX_SEARCH_RESULTS, include_answer: false })
  });
  const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    snippet: typeof item.content === 'string' ? item.content : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchSerpApi = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY is missing');
  const data = await getJson(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}&num=${MAX_SEARCH_RESULTS}`);
  const results = isRecord(data) && Array.isArray(data.organic_results) ? data.organic_results : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.link === 'string' ? item.link : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchGoogleCustom = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.GOOGLE_SEARCH_API_KEY;
  const cx = tool.config.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) throw new Error('Google Custom Search configuration is missing');
  const data = await getJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${MAX_SEARCH_RESULTS}`);
  const results = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.link === 'string' ? item.link : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchExa = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY is missing');
  const data = await getJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query, numResults: MAX_SEARCH_RESULTS, contents: { text: { maxCharacters: 420 } } })
  });
  const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    snippet: typeof item.text === 'string' ? item.text : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchKagi = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.KAGI_API_KEY;
  if (!apiKey) throw new Error('KAGI_API_KEY is missing');
  const data = await getJson(`https://kagi.com/api/v0/search?q=${encodeURIComponent(query)}&limit=${MAX_SEARCH_RESULTS}`, {
    headers: { Authorization: `Bot ${apiKey}` }
  });
  const results = isRecord(data) && isRecord(data.data) && Array.isArray(data.data.results) ? data.data.results : Array.isArray((data as Record<string, unknown>)?.data) ? (data as Record<string, unknown>).data as unknown[] : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchLinkup = async (query: string, tool: ChatToolRuntimeItem) => {
  const apiKey = tool.config.LINKUP_API_KEY;
  if (!apiKey) throw new Error('LINKUP_API_KEY is missing');
  const data = await getJson('https://api.linkup.so/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ q: query, depth: 'standard', outputType: 'searchResults' })
  });
  const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  return uniqueSources(results.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.name === 'string' ? item.name : typeof item.title === 'string' ? item.title : '',
    url: typeof item.url === 'string' ? item.url : '',
    snippet: typeof item.content === 'string' ? item.content : typeof item.snippet === 'string' ? item.snippet : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchOpenAICompatible = async (query: string, tool: ChatToolRuntimeItem) => {
  const baseUrl = tool.config.OPENAI_COMPATIBLE_SEARCH_BASE_URL?.replace(/\/+$/, '');
  const apiKey = tool.config.OPENAI_COMPATIBLE_SEARCH_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('OpenAI compatible search configuration is missing');
  const data = await getJson(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, q: query, limit: MAX_SEARCH_RESULTS, max_results: MAX_SEARCH_RESULTS })
  });
  const records = isRecord(data) && Array.isArray(data.results) ? data.results : isRecord(data) && Array.isArray(data.data) ? data.data : [];
  return uniqueSources(records.map(item => isRecord(item) ? normalizeSearchSource({
    title: typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : '',
    url: typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '',
    snippet: typeof item.snippet === 'string' ? item.snippet : typeof item.content === 'string' ? item.content : ''
  }) : null).filter((item): item is SearchSource => Boolean(item)));
};

const searchWithTool = async (query: string, tool: ChatToolRuntimeItem) => {
  if (tool.toolId === 'brave-search') return searchBrave(query, tool);
  if (tool.toolId === 'tavily') return searchTavily(query, tool);
  if (tool.toolId === 'perplexity') return searchPerplexity(query, tool);
  if (tool.toolId === 'serpapi') return searchSerpApi(query, tool);
  if (tool.toolId === 'google-custom-search') return searchGoogleCustom(query, tool);
  if (tool.toolId === 'exa') return searchExa(query, tool);
  if (tool.toolId === 'kagi') return searchKagi(query, tool);
  if (tool.toolId === 'linkup') return searchLinkup(query, tool);
  if (tool.toolId === 'openai-compatible-search') return searchOpenAICompatible(query, tool);
  if (tool.toolId === 'wikipedia') return searchWikipedia(query);
  if (tool.toolId === 'bing') return searchBing(query);
  return searchDuckDuckGo(query);
};

const collectSearchContext = async (tools: ChatToolRuntimeItem[], prompt: string) => {
  const searchTools = tools.filter(tool => tool.toolId !== 'url-context');
  if (searchTools.length === 0) return { context: '', sources: [] as SearchSource[] };
  const runtimePrompt = sanitizeMCPPrompt(prompt).replace(/\s+/g, ' ').trim();
  if (!runtimePrompt) return { context: '', sources: [] as SearchSource[] };
  const errors: string[] = [];
  for (const tool of searchTools) {
    if (!tool.configured) {
      errors.push(`${tool.name}: missing ${tool.missingEnv.join(', ') || 'configuration'}`);
      continue;
    }
    try {
      const sources = await searchWithTool(runtimePrompt, tool);
      if (sources.length > 0) {
        const sourceContext = sources.map((source, index) => [
          `[${index + 1}] ${source.title}`,
          `URL: ${source.url}`,
          source.snippet ? `Snippet: ${source.snippet}` : ''
        ].filter(Boolean).join('\n')).join('\n\n');
        return {
          context: [
            `Web Search Sources from ${tool.name}`,
            sourceContext,
            'Search instructions: treat these sources as current external context, prefer the most relevant and recent sources, and cite source numbers inline only for factual claims that are supported by the listed sources. Do not cite unsupported claims, do not invent source titles or URLs, and do not expose raw search diagnostics to the user.'
          ].join('\n\n').slice(0, MAX_SEARCH_CONTEXT_CHARS),
          sources
        };
      }
      errors.push(`${tool.name}: no results`);
    } catch (error) {
      errors.push(`${tool.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  return {
    context: errors.length > 0 ? `Web Search unavailable\n${errors.join('\n')}` : '',
    sources: [] as SearchSource[]
  };
};

export const collectToolRuntimeContextWithSources = async (tools: ChatToolRuntimeItem[], latestUserMessage: string) => {
  const context: string[] = [];
  const search = await collectSearchContext(tools, latestUserMessage);
  if (search.context) context.push(search.context);
  const urls = extractUrls(latestUserMessage);
  if (tools.some(tool => tool.toolId === 'url-context' && tool.configured) && urls.length > 0) {
    for (const url of urls) {
      try {
        const page = await fetchUrlText(url);
        if (page.text) context.push(`Source: ${page.url}\n${page.text}`);
      } catch (error) {
        context.push(`Source: ${url}\nURL Context error: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }
  return {
    context: context.length > 0 ? context.join('\n\n') : '',
    sources: search.sources
  };
};

export const collectToolRuntimeContext = async (tools: ChatToolRuntimeItem[], latestUserMessage: string) => {
  const result = await collectToolRuntimeContextWithSources(tools, latestUserMessage);
  return result.context;
};

export const buildIntegrationSystemPrompt = (servers: ChatMCPRuntimeServer[], tools: ChatToolRuntimeItem[], context: string) => {
  const enabledServers = servers.map(server => `${server.name} [${server.availability}, ${server.category}] ${server.configured ? 'configured' : `missing ${server.missingEnv.join(', ') || 'configuration'}`}`).join('\n');
  const enabledTools = tools.map(tool => `${tool.name} [${tool.category}] ${tool.configured ? 'configured' : `missing ${tool.missingEnv.join(', ') || 'configuration'}`}`).join('\n');
  if (!enabledServers && !enabledTools && !context) return '';
  return [
    'DeepChat runtime integrations are enabled for this conversation.',
    enabledServers ? `Enabled MCP servers:\n${enabledServers}` : '',
    enabledTools ? `Enabled tools:\n${enabledTools}` : '',
    context ? `Runtime context collected from enabled integrations:\n${context}` : '',
    'Use configured integrations only when they are relevant to the user request. If web search sources are present, answer directly from them, cite source numbers inline, and keep citations attached to the exact claims they support. If Code Execution context is present, use it for quantitative or file-based analysis rather than guessing calculations. If an integration is missing required configuration, ask the user to configure it in Settings before relying on it. Do not reveal secret values.'
  ].filter(Boolean).join('\n\n');
};
