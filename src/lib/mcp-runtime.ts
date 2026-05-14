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

const execFileAsync = promisify(execFile);
const mcpFileRoot = path.join(process.cwd(), 'data', 'mcp-files');
const MAX_URL_CONTEXT_URLS = 3;
const MAX_URL_CONTEXT_CHARS = 6000;
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

export const collectToolRuntimeContext = async (tools: ChatToolRuntimeItem[], latestUserMessage: string) => {
  if (!tools.some(tool => tool.toolId === 'url-context' && tool.configured)) return '';
  const urls = extractUrls(latestUserMessage);
  if (urls.length === 0) return '';
  const context: string[] = [];
  for (const url of urls) {
    try {
      const page = await fetchUrlText(url);
      if (page.text) context.push(`Source: ${page.url}\n${page.text}`);
    } catch (error) {
      context.push(`Source: ${url}\nURL Context error: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  return context.length > 0 ? `URL Context\n${context.join('\n\n')}` : '';
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
    'Use configured integrations when they are relevant. If an integration is missing required configuration, ask the user to configure it in Settings before relying on it. Do not reveal secret values.'
  ].filter(Boolean).join('\n\n');
};
