'use client';

export type MCPServerCategory = 'Files' | 'Databases' | 'Developer Tools' | 'Productivity' | 'Communication' | 'Automation' | 'Observability' | 'Commerce' | 'AI' | 'Cloud' | 'CRM' | 'Creative' | 'Security' | 'Local System';
export type MCPServerAvailability = 'offline' | 'online';

export interface MCPCatalogServer {
  id: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  availability: MCPServerAvailability;
  command: string;
  args: string[];
  env: string[];
  tags: string[];
}

export interface InstalledMCPServer {
  id: string;
  serverId: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  availability: MCPServerAvailability;
  command: string;
  args: string[];
  env: string[];
  tags: string[];
  config: Record<string, string>;
  enabled: boolean;
  installedAt: string;
}

export interface MCPSettings {
  installed: InstalledMCPServer[];
}

export interface MCPRuntimeServer {
  serverId: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  availability: MCPServerAvailability;
  command: string;
  args: string[];
  env: string[];
  tags: string[];
  config: Record<string, string>;
  configured: boolean;
  missingEnv: string[];
}

const mcp = (id: string, name: string, description: string, category: MCPServerCategory, availability: MCPServerAvailability, packageName: string, env: string[], tags: string[]): MCPCatalogServer => ({
  id,
  name,
  description,
  category,
  availability,
  command: 'npx',
  args: ['-y', packageName],
  env,
  tags
});

export const MCP_CATALOG: MCPCatalogServer[] = [
  mcp('filesystem', 'Filesystem', 'Read and manage local project files from approved directories.', 'Files', 'offline', '@modelcontextprotocol/server-filesystem', ['ALLOWED_DIRECTORIES'], ['files', 'workspace', 'local']),
  mcp('git', 'Git', 'Inspect commits, branches, diffs, and repository history from local projects.', 'Developer Tools', 'offline', '@modelcontextprotocol/server-git', ['GIT_REPOSITORY_PATH'], ['git', 'diffs', 'local']),
  mcp('sqlite', 'SQLite', 'Inspect local SQLite databases and run structured queries.', 'Databases', 'offline', '@modelcontextprotocol/server-sqlite', ['SQLITE_DB_PATH'], ['sql', 'local', 'database']),
  mcp('memory', 'Memory', 'Store and retrieve long-term local project and user memories.', 'Productivity', 'offline', '@modelcontextprotocol/server-memory', [], ['memory', 'knowledge', 'local']),
  mcp('time', 'Time', 'Resolve local time zones, dates, schedules, and locale-aware time data.', 'Automation', 'offline', '@modelcontextprotocol/server-time', [], ['dates', 'timezone', 'local']),
  mcp('sequential-thinking', 'Sequential Thinking', 'Break complex tasks into structured local reasoning steps.', 'AI', 'offline', '@modelcontextprotocol/server-sequential-thinking', [], ['reasoning', 'planning', 'local']),
  mcp('desktop-commander', 'Desktop Commander', 'Operate local desktop files, terminal commands, and project workflows.', 'Local System', 'offline', '@wonderwhy-er/desktop-commander', ['DESKTOP_COMMANDER_ROOT'], ['desktop', 'terminal', 'local']),
  mcp('everything-search', 'Everything Search', 'Search Windows files through the local Everything index.', 'Files', 'offline', 'everything-mcp-server', ['EVERYTHING_SDK_PATH'], ['windows', 'files', 'search']),
  mcp('ripgrep', 'Ripgrep', 'Search local code and text files with fast regex queries.', 'Developer Tools', 'offline', 'ripgrep-mcp-server', ['RIPGREP_ROOT'], ['code', 'search', 'local']),
  mcp('code-index', 'Code Index', 'Index local repositories for symbol, definition, and reference lookup.', 'Developer Tools', 'offline', 'code-index-mcp-server', ['CODE_INDEX_ROOT'], ['code', 'symbols', 'local']),
  mcp('local-markdown', 'Markdown Notes', 'Read local markdown notes, docs, journals, and knowledge folders.', 'Files', 'offline', 'markdown-notes-mcp-server', ['MARKDOWN_NOTES_PATH'], ['notes', 'markdown', 'local']),
  mcp('obsidian', 'Obsidian', 'Search and read local Obsidian vault notes and backlinks.', 'Productivity', 'offline', 'obsidian-mcp-server', ['OBSIDIAN_VAULT_PATH'], ['notes', 'vault', 'local']),
  mcp('local-pdf', 'Local PDF Reader', 'Extract text and metadata from local PDF files.', 'Files', 'offline', 'pdf-reader-mcp-server', ['PDF_LIBRARY_PATH'], ['pdf', 'documents', 'local']),
  mcp('local-docx', 'Local Word Docs', 'Read local DOCX files and extract document text.', 'Files', 'offline', 'docx-mcp-server', ['DOCX_LIBRARY_PATH'], ['word', 'documents', 'local']),
  mcp('local-excel', 'Local Excel', 'Inspect local XLSX workbooks, sheets, ranges, and formulas.', 'Files', 'offline', 'excel-mcp-server', ['EXCEL_LIBRARY_PATH'], ['spreadsheets', 'xlsx', 'local']),
  mcp('local-csv', 'Local CSV', 'Profile and query local CSV datasets with structured summaries.', 'Files', 'offline', 'csv-mcp-server', ['CSV_LIBRARY_PATH'], ['csv', 'data', 'local']),
  mcp('local-json', 'Local JSON', 'Read, validate, query, and summarize local JSON files.', 'Files', 'offline', 'json-mcp-server', ['JSON_LIBRARY_PATH'], ['json', 'data', 'local']),
  mcp('local-media', 'Local Media Metadata', 'Inspect image, video, and audio metadata from local folders.', 'Files', 'offline', 'media-metadata-mcp-server', ['MEDIA_LIBRARY_PATH'], ['media', 'metadata', 'local']),
  mcp('clipboard', 'Clipboard', 'Read and manage local clipboard text for desktop workflows.', 'Local System', 'offline', 'clipboard-mcp-server', [], ['clipboard', 'desktop', 'local']),
  mcp('powershell', 'PowerShell', 'Run approved local PowerShell automation from configured workspace roots.', 'Local System', 'offline', 'powershell-mcp-server', ['POWERSHELL_ALLOWED_ROOT'], ['windows', 'shell', 'local']),
  mcp('terminal', 'Terminal', 'Run approved local shell commands within configured project roots.', 'Local System', 'offline', 'terminal-mcp-server', ['TERMINAL_ALLOWED_ROOT'], ['shell', 'commands', 'local']),
  mcp('local-processes', 'Process Monitor', 'Inspect local processes, ports, and machine runtime status.', 'Local System', 'offline', 'process-monitor-mcp-server', [], ['processes', 'ports', 'local']),
  mcp('local-calendar-ics', 'Local ICS Calendar', 'Read local ICS calendar files and event schedules.', 'Productivity', 'offline', 'ics-calendar-mcp-server', ['ICS_CALENDAR_PATH'], ['calendar', 'events', 'local']),
  mcp('local-email-mbox', 'Local MBOX Email', 'Search local MBOX archives and exported email history.', 'Communication', 'offline', 'mbox-mcp-server', ['MBOX_ARCHIVE_PATH'], ['email', 'archive', 'local']),
  mcp('ollama', 'Ollama', 'Interact with local Ollama models and model metadata.', 'AI', 'offline', 'ollama-mcp-server', ['OLLAMA_BASE_URL'], ['llm', 'local', 'models']),
  mcp('lm-studio', 'LM Studio', 'Connect to a local LM Studio server and model catalog.', 'AI', 'offline', 'lmstudio-mcp-server', ['LM_STUDIO_BASE_URL'], ['llm', 'local', 'models']),
  mcp('chroma-local', 'Chroma Local', 'Query local Chroma vector collections and embeddings.', 'Databases', 'offline', 'chroma-mcp-server', ['CHROMA_PATH'], ['vectors', 'embeddings', 'local']),
  mcp('qdrant-local', 'Qdrant Local', 'Search local Qdrant vector collections and payloads.', 'Databases', 'offline', 'qdrant-mcp-server', ['QDRANT_URL'], ['vectors', 'semantic', 'local']),
  mcp('duckdb', 'DuckDB', 'Query local DuckDB analytical databases and parquet datasets.', 'Databases', 'offline', 'duckdb-mcp-server', ['DUCKDB_PATH'], ['analytics', 'sql', 'local']),
  mcp('postgres-local', 'Local PostgreSQL', 'Inspect and query a locally running PostgreSQL database.', 'Databases', 'offline', '@modelcontextprotocol/server-postgres', ['POSTGRES_CONNECTION_STRING'], ['postgres', 'sql', 'local']),
  mcp('mysql-local', 'Local MySQL', 'Inspect and query a locally running MySQL database.', 'Databases', 'offline', 'mysql-mcp-server', ['MYSQL_CONNECTION_STRING'], ['mysql', 'sql', 'local']),
  mcp('redis-local', 'Local Redis', 'Inspect local Redis keys, values, streams, queues, and cache state.', 'Databases', 'offline', 'redis-mcp-server', ['REDIS_URL'], ['redis', 'cache', 'local']),
  mcp('mongodb-local', 'Local MongoDB', 'Inspect local MongoDB databases, collections, documents, and indexes.', 'Databases', 'offline', 'mongodb-mcp-server', ['MONGODB_URI'], ['mongodb', 'documents', 'local']),
  mcp('docker', 'Docker', 'Inspect local containers, images, logs, compose services, and runtime state.', 'Developer Tools', 'offline', 'docker-mcp', [], ['containers', 'runtime', 'local']),
  mcp('kubernetes-local', 'Local Kubernetes', 'Browse local Kubernetes contexts, pods, services, and events.', 'Developer Tools', 'offline', 'kubernetes-mcp-server', ['KUBECONFIG'], ['cluster', 'devops', 'local']),
  mcp('playwright', 'Playwright', 'Automate local browser testing, screenshots, and interaction checks.', 'Automation', 'offline', '@playwright/mcp', [], ['browser', 'testing', 'local']),
  mcp('puppeteer', 'Puppeteer', 'Control local Chromium sessions for browser automation and screenshots.', 'Automation', 'offline', '@modelcontextprotocol/server-puppeteer', [], ['browser', 'automation', 'local']),
  mcp('chrome-devtools', 'Chrome DevTools', 'Debug local Chrome pages, performance, network traffic, and console output.', 'Developer Tools', 'offline', 'chrome-devtools-mcp', [], ['chrome', 'debugging', 'local']),
  mcp('browser-mcp', 'Browser MCP', 'Control a local browser profile for private browsing automation.', 'Automation', 'offline', 'browser-mcp', [], ['browser', 'desktop', 'local']),
  mcp('blender', 'Blender', 'Control local Blender scenes, objects, materials, and rendering workflows.', 'Creative', 'offline', 'blender-mcp-server', ['BLENDER_HOST'], ['3d', 'creative', 'local']),
  mcp('unity', 'Unity', 'Interact with local Unity editor projects, scenes, assets, and play mode.', 'Creative', 'offline', 'unity-mcp-server', ['UNITY_PROJECT_PATH'], ['game', 'editor', 'local']),
  mcp('godot', 'Godot', 'Inspect and automate local Godot projects, scenes, and scripts.', 'Creative', 'offline', 'godot-mcp-server', ['GODOT_PROJECT_PATH'], ['game', 'editor', 'local']),
  mcp('github', 'GitHub', 'Search repositories, inspect issues, manage pull requests, and read code.', 'Developer Tools', 'online', '@modelcontextprotocol/server-github', ['GITHUB_PERSONAL_ACCESS_TOKEN'], ['git', 'issues', 'online']),
  mcp('gitlab', 'GitLab', 'Work with GitLab repositories, merge requests, pipelines, and issues.', 'Developer Tools', 'online', '@modelcontextprotocol/server-gitlab', ['GITLAB_PERSONAL_ACCESS_TOKEN'], ['git', 'ci', 'online']),
  mcp('bitbucket', 'Bitbucket', 'Browse Bitbucket repositories, pull requests, branches, and workspace issues.', 'Developer Tools', 'online', 'bitbucket-mcp-server', ['BITBUCKET_USERNAME', 'BITBUCKET_APP_PASSWORD'], ['git', 'repositories', 'online']),
  mcp('vercel', 'Vercel', 'Inspect projects, deployments, domains, logs, and production environment state.', 'Cloud', 'online', 'vercel-mcp-server', ['VERCEL_TOKEN'], ['deployments', 'hosting', 'online']),
  mcp('netlify', 'Netlify', 'Browse sites, deploys, functions, build logs, and environment variables.', 'Cloud', 'online', 'netlify-mcp-server', ['NETLIFY_AUTH_TOKEN'], ['hosting', 'deploys', 'online']),
  mcp('cloudflare', 'Cloudflare', 'Manage zones, DNS records, Workers, Pages, caches, and account resources.', 'Cloud', 'online', 'cloudflare-mcp-server', ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], ['dns', 'workers', 'online']),
  mcp('aws', 'AWS', 'Inspect AWS services, resources, logs, and cloud infrastructure context.', 'Cloud', 'online', 'aws-mcp-server', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'], ['cloud', 'infrastructure', 'online']),
  mcp('azure', 'Azure', 'Browse Azure subscriptions, resources, logs, and cloud service metadata.', 'Cloud', 'online', 'azure-mcp-server', ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'], ['cloud', 'microsoft', 'online']),
  mcp('gcp', 'Google Cloud', 'Inspect GCP projects, logs, storage buckets, jobs, and cloud resources.', 'Cloud', 'online', 'gcp-mcp-server', ['GOOGLE_APPLICATION_CREDENTIALS'], ['cloud', 'gcp', 'online']),
  mcp('supabase', 'Supabase', 'Browse Supabase projects, tables, auth users, edge functions, and storage.', 'Databases', 'online', '@supabase/mcp-server-supabase', ['SUPABASE_ACCESS_TOKEN'], ['postgres', 'auth', 'online']),
  mcp('firebase', 'Firebase', 'Inspect Firestore, Authentication, Storage, and project resources.', 'Cloud', 'online', 'firebase-mcp-server', ['FIREBASE_SERVICE_ACCOUNT'], ['firestore', 'auth', 'online']),
  mcp('neon', 'Neon', 'Manage Neon Postgres projects, branches, databases, and connection metadata.', 'Databases', 'online', 'neon-mcp-server', ['NEON_API_KEY'], ['postgres', 'serverless', 'online']),
  mcp('planetscale', 'PlanetScale', 'Explore PlanetScale databases, branches, schema changes, and deploy requests.', 'Databases', 'online', 'planetscale-mcp-server', ['PLANETSCALE_SERVICE_TOKEN'], ['mysql', 'branches', 'online']),
  mcp('mongodb-atlas', 'MongoDB Atlas', 'Inspect Atlas projects, clusters, collections, documents, and indexes.', 'Databases', 'online', 'mongodb-atlas-mcp-server', ['MONGODB_ATLAS_PUBLIC_KEY', 'MONGODB_ATLAS_PRIVATE_KEY'], ['mongodb', 'cloud', 'online']),
  mcp('upstash', 'Upstash', 'Manage Upstash Redis databases, Kafka topics, vectors, and usage metadata.', 'Databases', 'online', 'upstash-mcp-server', ['UPSTASH_EMAIL', 'UPSTASH_API_KEY'], ['redis', 'serverless', 'online']),
  mcp('clickhouse-cloud', 'ClickHouse Cloud', 'Query ClickHouse Cloud analytics databases and schemas.', 'Databases', 'online', 'clickhouse-mcp-server', ['CLICKHOUSE_HOST', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD'], ['analytics', 'olap', 'online']),
  mcp('snowflake', 'Snowflake', 'Search warehouses, schemas, tables, and analytics data from Snowflake.', 'Databases', 'online', 'snowflake-mcp-server', ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PASSWORD'], ['warehouse', 'analytics', 'online']),
  mcp('bigquery', 'BigQuery', 'Inspect datasets, tables, jobs, and analytics queries in Google BigQuery.', 'Cloud', 'online', 'bigquery-mcp-server', ['GOOGLE_APPLICATION_CREDENTIALS'], ['analytics', 'gcp', 'online']),
  mcp('slack', 'Slack', 'Search channels, read messages, and summarize workspace conversations.', 'Communication', 'online', '@modelcontextprotocol/server-slack', ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'], ['chat', 'team', 'online']),
  mcp('discord', 'Discord', 'Search servers, channels, members, and message history from Discord communities.', 'Communication', 'online', 'discord-mcp-server', ['DISCORD_BOT_TOKEN'], ['community', 'chat', 'online']),
  mcp('gmail', 'Gmail', 'Search mail, read threads, draft replies, and organize inbox context.', 'Communication', 'online', 'gmail-mcp-server', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['email', 'google', 'online']),
  mcp('outlook', 'Outlook Mail', 'Search Microsoft mailboxes, read threads, and draft email responses.', 'Communication', 'online', 'outlook-mcp-server', ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'], ['email', 'microsoft', 'online']),
  mcp('teams', 'Microsoft Teams', 'Search chats, channels, meetings, and workspace collaboration data.', 'Communication', 'online', 'teams-mcp-server', ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'], ['chat', 'meetings', 'online']),
  mcp('telegram', 'Telegram', 'Read channels, messages, and bot-accessible Telegram conversation context.', 'Communication', 'online', 'telegram-mcp-server', ['TELEGRAM_BOT_TOKEN'], ['chat', 'bot', 'online']),
  mcp('google-drive', 'Google Drive', 'Find docs, sheets, slides, and files stored in Google Drive.', 'Productivity', 'online', '@modelcontextprotocol/server-gdrive', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['docs', 'files', 'online']),
  mcp('google-calendar', 'Google Calendar', 'Inspect calendars, events, attendees, and scheduling availability.', 'Productivity', 'online', 'google-calendar-mcp-server', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['calendar', 'events', 'online']),
  mcp('google-sheets', 'Google Sheets', 'Read spreadsheets, ranges, formulas, and structured business data.', 'Productivity', 'online', 'google-sheets-mcp-server', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['sheets', 'data', 'online']),
  mcp('notion', 'Notion', 'Search pages, databases, notes, and team knowledge in Notion.', 'Productivity', 'online', 'notion-mcp-server', ['NOTION_API_KEY'], ['notes', 'wiki', 'online']),
  mcp('linear', 'Linear', 'Browse issues, projects, cycles, and engineering planning context.', 'Productivity', 'online', 'linear-mcp-server', ['LINEAR_API_KEY'], ['issues', 'planning', 'online']),
  mcp('figma', 'Figma', 'Inspect design files, frames, components, and product specs.', 'Productivity', 'online', 'figma-developer-mcp', ['FIGMA_ACCESS_TOKEN'], ['design', 'components', 'online']),
  mcp('confluence', 'Confluence', 'Search spaces, pages, comments, and documentation knowledge bases.', 'Productivity', 'online', 'confluence-mcp-server', ['ATLASSIAN_SITE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'], ['docs', 'wiki', 'online']),
  mcp('jira', 'Jira', 'Search issues, boards, sprints, epics, and release planning data.', 'Productivity', 'online', 'jira-mcp-server', ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'], ['issues', 'agile', 'online']),
  mcp('airtable', 'Airtable', 'Read bases, tables, records, and lightweight database workflows.', 'Productivity', 'online', 'airtable-mcp-server', ['AIRTABLE_API_KEY'], ['tables', 'records', 'online']),
  mcp('trello', 'Trello', 'Search boards, cards, lists, labels, and lightweight project workflows.', 'Productivity', 'online', 'trello-mcp-server', ['TRELLO_API_KEY', 'TRELLO_TOKEN'], ['cards', 'boards', 'online']),
  mcp('asana', 'Asana', 'Browse tasks, projects, goals, comments, and team planning data.', 'Productivity', 'online', 'asana-mcp-server', ['ASANA_ACCESS_TOKEN'], ['tasks', 'projects', 'online']),
  mcp('clickup', 'ClickUp', 'Search tasks, spaces, docs, goals, and project management context.', 'Productivity', 'online', 'clickup-mcp-server', ['CLICKUP_API_TOKEN'], ['tasks', 'docs', 'online']),
  mcp('monday', 'Monday.com', 'Inspect boards, items, automations, and team work management records.', 'Productivity', 'online', 'monday-mcp-server', ['MONDAY_API_TOKEN'], ['boards', 'tasks', 'online']),
  mcp('sentry', 'Sentry', 'Review production errors, releases, traces, and issue context.', 'Observability', 'online', 'sentry-mcp', ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'], ['errors', 'monitoring', 'online']),
  mcp('datadog', 'Datadog', 'Search metrics, dashboards, traces, logs, monitors, and incident context.', 'Observability', 'online', 'datadog-mcp-server', ['DATADOG_API_KEY', 'DATADOG_APP_KEY'], ['metrics', 'logs', 'online']),
  mcp('grafana', 'Grafana', 'Inspect dashboards, alerts, data sources, logs, and observability panels.', 'Observability', 'online', 'grafana-mcp-server', ['GRAFANA_URL', 'GRAFANA_API_KEY'], ['dashboards', 'alerts', 'online']),
  mcp('stripe', 'Stripe', 'Inspect customers, subscriptions, invoices, prices, and payment data.', 'Commerce', 'online', 'stripe-mcp-server', ['STRIPE_SECRET_KEY'], ['billing', 'payments', 'online']),
  mcp('shopify', 'Shopify', 'Browse products, orders, customers, inventory, and storefront data.', 'Commerce', 'online', 'shopify-mcp-server', ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'], ['store', 'orders', 'online']),
  mcp('hubspot', 'HubSpot', 'Search contacts, companies, deals, tickets, and CRM timeline activity.', 'CRM', 'online', 'hubspot-mcp-server', ['HUBSPOT_ACCESS_TOKEN'], ['crm', 'deals', 'online']),
  mcp('salesforce', 'Salesforce', 'Browse accounts, leads, opportunities, cases, and CRM objects.', 'CRM', 'online', 'salesforce-mcp-server', ['SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET'], ['crm', 'sales', 'online']),
  mcp('openai', 'OpenAI', 'Connect OpenAI models, files, vector stores, and assistant resources.', 'AI', 'online', 'openai-mcp-server', ['OPENAI_API_KEY'], ['ai', 'models', 'online']),
  mcp('anthropic', 'Anthropic', 'Connect Claude APIs and Anthropic account resources for model workflows.', 'AI', 'online', 'anthropic-mcp-server', ['ANTHROPIC_API_KEY'], ['ai', 'models', 'online']),
  mcp('huggingface', 'Hugging Face', 'Search models, datasets, spaces, and inference endpoints.', 'AI', 'online', 'huggingface-mcp-server', ['HUGGINGFACE_API_TOKEN'], ['models', 'datasets', 'online'])
];

export const defaultMCPSettings: MCPSettings = {
  installed: []
};

const SETTINGS_KEY = 'deepchat-mcp-settings';
const SETTINGS_EVENT = 'deepchat:mcp-settings-updated';
const validCatalogIds = new Set(MCP_CATALOG.map(server => server.id));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object');
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

const normalizeConfig = (value: unknown, env: string[]) => {
  if (!isRecord(value)) return {};
  return env.reduce<Record<string, string>>((config, key) => {
    const configValue = value[key];
    if (typeof configValue === 'string') config[key] = configValue;
    return config;
  }, {});
};

const normalizeInstalledServer = (value: unknown): InstalledMCPServer | null => {
  if (!isRecord(value)) return null;
  const serverId = typeof value.serverId === 'string' && validCatalogIds.has(value.serverId) ? value.serverId : null;
  if (!serverId) return null;
  const catalogServer = MCP_CATALOG.find(server => server.id === serverId);
  if (!catalogServer) return null;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `${serverId}-${Date.now()}`,
    serverId,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : catalogServer.name,
    description: typeof value.description === 'string' && value.description.trim() ? value.description : catalogServer.description,
    category: catalogServer.category,
    availability: catalogServer.availability,
    command: typeof value.command === 'string' && value.command.trim() ? value.command : catalogServer.command,
    args: isStringArray(value.args) ? value.args : catalogServer.args,
    env: isStringArray(value.env) ? value.env : catalogServer.env,
    tags: isStringArray(value.tags) ? value.tags : catalogServer.tags,
    config: normalizeConfig(value.config, catalogServer.env),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    installedAt: typeof value.installedAt === 'string' && value.installedAt.trim() ? value.installedAt : new Date().toISOString()
  };
};

const normalizeSettings = (settings: unknown): MCPSettings => {
  if (!isRecord(settings)) return defaultMCPSettings;
  const installed = Array.isArray(settings.installed)
    ? settings.installed.map(normalizeInstalledServer).filter((server): server is InstalledMCPServer => Boolean(server))
    : [];
  const uniqueInstalled = installed.filter((server, index, list) => list.findIndex(item => item.serverId === server.serverId) === index);
  return { installed: uniqueInstalled };
};

export const loadMCPSettings = () => {
  if (typeof window === 'undefined') return defaultMCPSettings;
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
  } catch {
    return defaultMCPSettings;
  }
};

export const saveMCPSettings = (settings: MCPSettings) => {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
};

export const installMCPServer = (serverId: string) => {
  const catalogServer = MCP_CATALOG.find(server => server.id === serverId);
  const current = loadMCPSettings();
  if (!catalogServer) return current;
  if (current.installed.some(server => server.serverId === serverId)) return current;
  const nextServer: InstalledMCPServer = {
    ...catalogServer,
    id: `${catalogServer.id}-${Date.now()}`,
    serverId: catalogServer.id,
    config: {},
    enabled: true,
    installedAt: new Date().toISOString()
  };
  return saveMCPSettings({ installed: [...current.installed, nextServer] });
};

export const uninstallMCPServer = (installedId: string) => {
  const current = loadMCPSettings();
  return saveMCPSettings({ installed: current.installed.filter(server => server.id !== installedId) });
};

export const toggleMCPServer = (installedId: string, enabled: boolean) => {
  const current = loadMCPSettings();
  return saveMCPSettings({
    installed: current.installed.map(server => server.id === installedId ? { ...server, enabled } : server)
  });
};

export const updateMCPServerConfig = (installedId: string, config: Record<string, string>) => {
  const current = loadMCPSettings();
  return saveMCPSettings({
    installed: current.installed.map(server => server.id === installedId ? { ...server, config: normalizeConfig(config, server.env) } : server)
  });
};

export const getEnabledMCPRuntimeServers = (): MCPRuntimeServer[] => loadMCPSettings().installed.filter(server => server.enabled).map(server => {
  const missingEnv = server.env.filter(envKey => !server.config?.[envKey]);
  return {
    serverId: server.serverId,
    name: server.name,
    description: server.description,
    category: server.category,
    availability: server.availability,
    command: server.command,
    args: server.args,
    env: server.env,
    tags: server.tags,
    config: server.config || {},
    configured: missingEnv.length === 0,
    missingEnv
  };
});

export const subscribeMCPSettings = (listener: (settings: MCPSettings) => void) => {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent) listener(normalizeSettings(event.detail));
  };
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
};
