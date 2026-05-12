import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

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

const execFileAsync = promisify(execFile);
const mcpFileRoot = path.join(process.cwd(), 'data', 'mcp-files');
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];

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

export const collectMCPRuntimeContext = async (servers: ChatMCPRuntimeServer[], latestUserMessage: string) => {
  const context: string[] = [];
  for (const server of servers.filter(item => item.configured || item.env.length === 0)) {
    try {
      if (server.serverId === 'filesystem') {
        const value = await collectFilesystemContext(server, latestUserMessage);
        if (value) context.push(value);
      } else if (server.serverId === 'git') {
        const value = await collectGitContext(server, latestUserMessage);
        if (value) context.push(value);
      } else if (server.serverId === 'time') {
        const value = collectTimeContext(latestUserMessage);
        if (value) context.push(value);
      }
    } catch (error) {
      context.push(`MCP ${server.name} error: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  return context.join('\n\n');
};

export const buildIntegrationSystemPrompt = (servers: ChatMCPRuntimeServer[], tools: ChatToolRuntimeItem[], context: string) => {
  const enabledServers = servers.map(server => `${server.name} [${server.availability}, ${server.category}] ${server.configured ? 'configured' : `missing ${server.missingEnv.join(', ') || 'configuration'}`}`).join('\n');
  const enabledTools = tools.map(tool => `${tool.name} [${tool.category}] ${tool.configured ? 'configured' : `missing ${tool.missingEnv.join(', ') || 'configuration'}`}`).join('\n');
  if (!enabledServers && !enabledTools && !context) return '';
  return [
    'DeepChat runtime integrations are enabled for this conversation.',
    enabledServers ? `Enabled MCP servers:\n${enabledServers}` : '',
    enabledTools ? `Enabled tools:\n${enabledTools}` : '',
    context ? `Runtime context collected from local MCP servers:\n${context}` : '',
    'Use configured integrations when they are relevant. If an integration is missing required configuration, ask the user to configure it in Settings before relying on it. Do not reveal secret values.'
  ].filter(Boolean).join('\n\n');
};
