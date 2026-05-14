import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, getSqlite } from './client';
import { CHAT_DIR, SHARE_DIR, MEMORY_DIR, TEMP_FILE_DIR, BACKUP_DIR, ensureDataDirectoriesSync } from '@/lib/data-directories';

export type StoredAttachment = {
  name?: unknown;
  ext?: unknown;
};

export type StoredMessageVersion = {
  content?: unknown;
  reasoning?: unknown;
  reasoningDuration?: unknown;
  versionIndex?: unknown;
  [key: string]: unknown;
};

export type StoredMessage = {
  attachedFiles?: unknown;
  attachedFile?: unknown;
  id?: unknown;
  content?: unknown;
  reasoning?: unknown;
  reasoningDuration?: unknown;
  versions?: StoredMessageVersion[];
  currentVersionIndex?: unknown;
  chatIndex?: unknown;
  role?: unknown;
  createdAt?: unknown;
  isStreaming?: unknown;
  isError?: unknown;
  [key: string]: unknown;
};

export type UserProfileData = {
  id?: string;
  name?: string;
  avatar?: string;
  plan?: string;
};

export type StoredChat = {
  messages?: StoredMessage[];
  pendingAttachedFiles?: unknown;
  shareId?: unknown;
  id?: string;
  title?: string;
  createdAt?: string;
  archived?: boolean;
  isShared?: boolean;
  pinned?: boolean;
  tags?: string[];
  ownerProfile?: UserProfileData;
  folder?: string;
  [key: string]: unknown;
};

export type SavedMemoryRecord = {
  id: string;
  content: string;
  category: string;
  importance?: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  sourceProvider?: string;
  sourceModel?: string;
  sourceConnectionId?: string;
  sourceChatId?: string;
  vector?: number[];
};

export type ChatHistoryMemoryRecord = {
  id: string;
  chatId?: string;
  userMessage: string;
  assistantMessage: string;
  createdAt: string;
  sourceProvider?: string;
  sourceModel?: string;
  sourceConnectionId?: string;
  sourceUserMessageId?: string;
  vector?: number[];
};

type ChatRow = {
  id: string;
  title: string | null;
  created_at: string;
  archived: number;
  is_shared: number;
  pinned: number;
  share_id: string | null;
  folder: string | null;
  owner_profile_json: string | null;
  tags_json: string | null;
  pending_attached_files_json: string | null;
  extra_json: string | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: string | null;
  content: string | null;
  reasoning: string | null;
  reasoning_duration_json: string | null;
  created_at: string | null;
  is_streaming: number | null;
  is_error: number | null;
  chat_index: number;
  attached_files_json: string | null;
  attached_file_json: string | null;
  versions_json: string | null;
  current_version_index: number | null;
  extra_json: string | null;
};

const LEGACY_MEMORY_FILE = path.join(process.cwd(), 'data', 'user', 'memories.json');
const SAVED_MEMORY_FILE = path.join(MEMORY_DIR, 'reference-saved-memories.json');
const CHAT_HISTORY_FILE = path.join(MEMORY_DIR, 'reference-chat-history.json');
const TEMP_FILE_ROOT = TEMP_FILE_DIR;
const MIGRATION_BACKUP_ROOT = BACKUP_DIR;

let initialized = false;
let initializing = false;

const generateChatId = () => `chat_${crypto.randomBytes(24).toString('base64url')}`;

const json = (value: unknown) => value === undefined ? null : JSON.stringify(value);

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) => {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) next[key] = item;
  }
  return next;
};

const omitKeys = <T extends Record<string, unknown>>(value: T, keys: string[]) => {
  const blocked = new Set(keys);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!blocked.has(key) && item !== undefined) next[key] = item;
  }
  return next;
};

const chatExtra = (chat: StoredChat) => {
  return omitKeys(chat, [
    'id',
    'title',
    'createdAt',
    'archived',
    'isShared',
    'pinned',
    'shareId',
    'folder',
    'ownerProfile',
    'tags',
    'pendingAttachedFiles',
    'messages'
  ]);
};

const messageExtra = (message: StoredMessage) => {
  return omitKeys(message, [
    'id',
    'role',
    'content',
    'reasoning',
    'reasoningDuration',
    'createdAt',
    'isStreaming',
    'isError',
    'chatIndex',
    'attachedFiles',
    'attachedFile',
    'versions',
    'currentVersionIndex'
  ]);
};

const createSchema = () => {
  const db = getSqlite();
  ensureDataDirectoriesSync();
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      is_shared INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      share_id TEXT,
      folder TEXT,
      owner_profile_json TEXT,
      tags_json TEXT,
      pending_attached_files_json TEXT,
      extra_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);
    CREATE INDEX IF NOT EXISTS idx_chats_archived ON chats(archived);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT,
      content TEXT,
      reasoning TEXT,
      reasoning_duration_json TEXT,
      created_at TEXT,
      is_streaming INTEGER,
      is_error INTEGER,
      chat_index INTEGER NOT NULL,
      attached_files_json TEXT,
      attached_file_json TEXT,
      versions_json TEXT,
      current_version_index INTEGER,
      extra_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat_index ON messages(chat_id, chat_index);
    CREATE TABLE IF NOT EXISTS shared_chats (
      share_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      importance TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_provider TEXT,
      source_model TEXT,
      source_connection_id TEXT,
      source_chat_id TEXT,
      vector_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_saved_memories_updated ON saved_memories(updated_at);
    CREATE TABLE IF NOT EXISTS chat_history_memories (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source_provider TEXT,
      source_model TEXT,
      source_connection_id TEXT,
      source_user_message_id TEXT,
      vector_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history_memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_history_chat ON chat_history_memories(chat_id);
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      message_id TEXT,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
};

const readJsonArray = <T>(filePath: string): T[] => {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readJsonObject = <T>(filePath: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
};

const hasLegacyData = () => {
  try {
    const chatFiles = fs.existsSync(CHAT_DIR)
      ? fs.readdirSync(CHAT_DIR).filter(file => file.endsWith('.json'))
      : [];
    return chatFiles.length > 0 || fs.existsSync(SAVED_MEMORY_FILE) || fs.existsSync(CHAT_HISTORY_FILE) || fs.existsSync(LEGACY_MEMORY_FILE);
  } catch {
    return false;
  }
};

const copyJsonFiles = (sourceDir: string, targetDir: string) => {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const item of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(targetDir, item.name);
    if (item.isDirectory()) {
      copyJsonFiles(sourcePath, targetPath);
    } else if (item.isFile() && item.name.endsWith('.json')) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
};

const backupLegacyData = () => {
  if (!hasLegacyData()) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = path.join(MIGRATION_BACKUP_ROOT, `json-migration-${stamp}`);
  fs.mkdirSync(root, { recursive: true });
  copyJsonFiles(CHAT_DIR, path.join(root, 'chat'));
  copyJsonFiles(MEMORY_DIR, path.join(root, 'memories'));
  if (fs.existsSync(LEGACY_MEMORY_FILE)) {
    fs.copyFileSync(LEGACY_MEMORY_FILE, path.join(root, 'memories.json'));
  }
};

const insertAttachment = (chatId: string, messageId: string | null, file: StoredAttachment, index: number, createdAt: string) => {
  const name = typeof file?.name === 'string' ? file.name : '';
  if (!name) return;
  const ext = typeof file?.ext === 'string' && file.ext.trim() ? file.ext : 'other';
  const filePath = path.join(TEMP_FILE_ROOT, ext, name);
  getSqlite().prepare(`
    INSERT OR REPLACE INTO attachments (id, chat_id, message_id, name, ext, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`${chatId}:${messageId || 'pending'}:${index}:${name}`, chatId, messageId, name, ext, filePath, createdAt);
};

const upsertChatRow = (chat: StoredChat) => {
  const db = getSqlite();
  const id = chat.id || crypto.randomUUID();
  const createdAt = chat.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO chats (
      id, title, created_at, archived, is_shared, pinned, share_id, folder,
      owner_profile_json, tags_json, pending_attached_files_json, extra_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      created_at = excluded.created_at,
      archived = excluded.archived,
      is_shared = excluded.is_shared,
      pinned = excluded.pinned,
      share_id = excluded.share_id,
      folder = excluded.folder,
      owner_profile_json = excluded.owner_profile_json,
      tags_json = excluded.tags_json,
      pending_attached_files_json = excluded.pending_attached_files_json,
      extra_json = excluded.extra_json
  `).run(
    id,
    chat.title || 'New Chat',
    createdAt,
    chat.archived === true ? 1 : 0,
    chat.isShared === true ? 1 : 0,
    chat.pinned === true ? 1 : 0,
    typeof chat.shareId === 'string' ? chat.shareId : null,
    typeof chat.folder === 'string' ? chat.folder : null,
    json(chat.ownerProfile),
    json(chat.tags),
    json(chat.pendingAttachedFiles),
    json(chatExtra(chat))
  );
  if (Array.isArray(chat.pendingAttachedFiles)) {
    chat.pendingAttachedFiles.forEach((file, index) => insertAttachment(id, null, file as StoredAttachment, index, createdAt));
  }
  return { ...chat, id, createdAt };
};

const upsertMessageRow = (chatId: string, message: StoredMessage, indexFallback = 0) => {
  const db = getSqlite();
  const id = typeof message.id === 'string' ? message.id : crypto.randomUUID();
  const chatIndex = typeof message.chatIndex === 'number' ? message.chatIndex : indexFallback;
  db.prepare(`
    INSERT INTO messages (
      id, chat_id, role, content, reasoning, reasoning_duration_json, created_at,
      is_streaming, is_error, chat_index, attached_files_json, attached_file_json,
      versions_json, current_version_index, extra_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      chat_id = excluded.chat_id,
      role = excluded.role,
      content = excluded.content,
      reasoning = excluded.reasoning,
      reasoning_duration_json = excluded.reasoning_duration_json,
      created_at = excluded.created_at,
      is_streaming = excluded.is_streaming,
      is_error = excluded.is_error,
      chat_index = excluded.chat_index,
      attached_files_json = excluded.attached_files_json,
      attached_file_json = excluded.attached_file_json,
      versions_json = excluded.versions_json,
      current_version_index = excluded.current_version_index,
      extra_json = excluded.extra_json
  `).run(
    id,
    chatId,
    typeof message.role === 'string' ? message.role : null,
    typeof message.content === 'string' ? message.content : null,
    typeof message.reasoning === 'string' ? message.reasoning : null,
    json(message.reasoningDuration),
    typeof message.createdAt === 'string' ? message.createdAt : null,
    typeof message.isStreaming === 'boolean' ? (message.isStreaming ? 1 : 0) : null,
    typeof message.isError === 'boolean' ? (message.isError ? 1 : 0) : null,
    chatIndex,
    json(message.attachedFiles),
    json(message.attachedFile),
    json(message.versions),
    typeof message.currentVersionIndex === 'number' ? message.currentVersionIndex : null,
    json(messageExtra(message))
  );
  if (Array.isArray(message.attachedFiles)) {
    message.attachedFiles.forEach((file, index) => insertAttachment(chatId, id, file as StoredAttachment, index, typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString()));
  } else if (message.attachedFile && typeof message.attachedFile === 'object') {
    insertAttachment(chatId, id, message.attachedFile as StoredAttachment, 0, typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString());
  }
  return { ...message, id, chatIndex };
};

const importLegacyData = () => {
  const db = getSqlite();
  const chatCount = db.prepare('SELECT COUNT(*) AS count FROM chats').get() as { count: number };
  const metadata = db.prepare('SELECT value FROM store_metadata WHERE key = ?').get('legacy_imported') as { value: string } | undefined;
  if (metadata?.value === 'true' || chatCount.count > 0 || !hasLegacyData()) return;
  backupLegacyData();
  const run = db.transaction(() => {
    if (fs.existsSync(CHAT_DIR)) {
      for (const file of fs.readdirSync(CHAT_DIR)) {
        if (!file.endsWith('.json')) continue;
        const chat = readJsonObject<StoredChat>(path.join(CHAT_DIR, file));
        if (!chat) continue;
        const id = chat.id || path.basename(file, '.json');
        const nextChat = upsertChatRow({ ...chat, id });
        if (Array.isArray(chat.messages)) {
          chat.messages.forEach((message, index) => upsertMessageRow(nextChat.id!, message, index));
        }
      }
    }
    if (fs.existsSync(SHARE_DIR)) {
      for (const file of fs.readdirSync(SHARE_DIR)) {
        if (!file.endsWith('.json')) continue;
        const shareId = path.basename(file, '.json');
        const snapshot = readJsonObject<StoredChat>(path.join(SHARE_DIR, file));
        if (!snapshot) continue;
        db.prepare(`
          INSERT OR REPLACE INTO shared_chats (share_id, chat_id, snapshot_json, created_at)
          VALUES (?, ?, ?, ?)
        `).run(shareId, snapshot.id || '', JSON.stringify(snapshot), new Date().toISOString());
      }
    }
    const legacyMemories = readJsonArray<SavedMemoryRecord>(LEGACY_MEMORY_FILE);
    const saved = readJsonArray<SavedMemoryRecord>(SAVED_MEMORY_FILE);
    for (const memory of [...legacyMemories, ...saved]) {
      if (!memory?.id || typeof memory.content !== 'string') continue;
      upsertSavedMemory(memory);
    }
    for (const memory of readJsonArray<ChatHistoryMemoryRecord>(CHAT_HISTORY_FILE)) {
      if (!memory?.id || typeof memory.userMessage !== 'string' || typeof memory.assistantMessage !== 'string') continue;
      upsertChatHistoryMemory(memory);
    }
    db.prepare('INSERT OR REPLACE INTO store_metadata (key, value) VALUES (?, ?)').run('legacy_imported', 'true');
  });
  run();
};

export const ensureDataStore = () => {
  if (initialized || initializing) return;
  initializing = true;
  getDb();
  createSchema();
  try {
    importLegacyData();
    initialized = true;
  } finally {
    initializing = false;
  }
};

const hydrateMessage = (row: MessageRow): StoredMessage => {
  const extra = parseJson<Record<string, unknown>>(row.extra_json, {});
  return stripUndefined({
    ...extra,
    id: row.id,
    role: row.role ?? undefined,
    content: row.content ?? undefined,
    reasoning: row.reasoning ?? undefined,
    reasoningDuration: parseJson(row.reasoning_duration_json, undefined),
    createdAt: row.created_at ?? undefined,
    isStreaming: row.is_streaming === null ? undefined : row.is_streaming === 1,
    isError: row.is_error === null ? undefined : row.is_error === 1,
    chatIndex: row.chat_index,
    attachedFiles: parseJson(row.attached_files_json, undefined),
    attachedFile: parseJson(row.attached_file_json, undefined),
    versions: parseJson(row.versions_json, undefined),
    currentVersionIndex: row.current_version_index ?? undefined
  }) as StoredMessage;
};

const hydrateChat = (row: ChatRow, messages: StoredMessage[] = []): StoredChat => {
  const extra = parseJson<Record<string, unknown>>(row.extra_json, {});
  return stripUndefined({
    ...extra,
    id: row.id,
    title: row.title || 'New Chat',
    createdAt: row.created_at,
    archived: row.archived === 1,
    isShared: row.is_shared === 1,
    pinned: row.pinned === 1,
    shareId: row.share_id ?? undefined,
    folder: row.folder ?? undefined,
    ownerProfile: parseJson(row.owner_profile_json, undefined),
    tags: parseJson(row.tags_json, undefined),
    pendingAttachedFiles: parseJson(row.pending_attached_files_json, undefined),
    messages
  }) as StoredChat;
};

export const createChatRecord = (title = 'New Chat', attachedFiles?: StoredAttachment[]) => {
  ensureDataStore();
  let id = generateChatId();
  while (getSqlite().prepare('SELECT 1 FROM chats WHERE id = ?').get(id)) {
    id = generateChatId();
  }
  upsertChatRow({
    id,
    title,
    createdAt: new Date().toISOString(),
    messages: [],
    pendingAttachedFiles: attachedFiles || []
  });
  return id;
};

export const getChatRecord = (id: string): StoredChat | null => {
  ensureDataStore();
  const db = getSqlite();
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
  if (!chat) return null;
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY chat_index ASC, created_at ASC').all(id) as MessageRow[];
  return hydrateChat(chat, rows.map(hydrateMessage));
};

export const listChatRecords = (archived: boolean) => {
  ensureDataStore();
  const rows = getSqlite().prepare('SELECT * FROM chats WHERE archived = ? ORDER BY datetime(created_at) DESC').all(archived ? 1 : 0) as ChatRow[];
  return rows.map(row => hydrateChat(row));
};

export const listSharedLinkRecords = () => {
  ensureDataStore();
  const rows = getSqlite().prepare('SELECT * FROM chats WHERE share_id IS NOT NULL ORDER BY datetime(created_at) DESC').all() as ChatRow[];
  return rows.filter(row => typeof row.share_id === 'string' && row.share_id.length > 0).map(row => {
    const messageCount = getSqlite().prepare('SELECT COUNT(*) AS count FROM messages WHERE chat_id = ?').get(row.id) as { count: number };
    return {
      id: row.id,
      title: row.title || 'Untitled Chat',
      shareId: row.share_id as string,
      createdAt: row.created_at,
      messageCount: messageCount.count
    };
  });
};

export const saveMessageRecord = (id: string, message: StoredMessage) => {
  ensureDataStore();
  const chat = getChatRecord(id);
  if (!chat) return null;
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const idx = messages.findIndex(item => item.id === message.id);
  const chatIndex = typeof message.chatIndex === 'number'
    ? message.chatIndex
    : idx !== -1
      ? typeof messages[idx]?.chatIndex === 'number' ? messages[idx].chatIndex : idx
      : messages.length;
  const normalized = upsertMessageRow(id, { ...message, chatIndex }, chatIndex);
  if (chat.pendingAttachedFiles) {
    getSqlite().prepare('UPDATE chats SET pending_attached_files_json = NULL WHERE id = ?').run(id);
  }
  if (idx !== -1) {
    messages[idx] = normalized;
  } else {
    messages.push(normalized);
  }
  return { ...chat, pendingAttachedFiles: undefined, messages };
};

export const updateChatRecord = (id: string, patch: Partial<StoredChat>) => {
  ensureDataStore();
  const chat = getChatRecord(id);
  if (!chat) return null;
  const next = { ...chat, ...patch, messages: chat.messages || [] };
  upsertChatRow(next);
  return getChatRecord(id);
};

export const deleteChatRecord = (id: string) => {
  ensureDataStore();
  getSqlite().prepare('DELETE FROM chats WHERE id = ?').run(id);
};

export const deleteAllChatRecords = () => {
  ensureDataStore();
  const db = getSqlite();
  db.prepare('DELETE FROM shared_chats').run();
  db.prepare('DELETE FROM attachments').run();
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM chats').run();
};

export const saveSharedSnapshot = (shareId: string, chatId: string, chat: StoredChat) => {
  ensureDataStore();
  getSqlite().prepare(`
    INSERT OR REPLACE INTO shared_chats (share_id, chat_id, snapshot_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(shareId, chatId, JSON.stringify(chat), new Date().toISOString());
};

export const getSharedSnapshot = (shareId: string) => {
  ensureDataStore();
  const row = getSqlite().prepare('SELECT snapshot_json FROM shared_chats WHERE share_id = ?').get(shareId) as { snapshot_json: string } | undefined;
  return row ? parseJson<StoredChat | null>(row.snapshot_json, null) : null;
};

export const deleteSharedSnapshot = (shareId: string) => {
  ensureDataStore();
  getSqlite().prepare('DELETE FROM shared_chats WHERE share_id = ?').run(shareId);
};

export const listSavedMemories = (): SavedMemoryRecord[] => {
  ensureDataStore();
  const rows = getSqlite().prepare('SELECT * FROM saved_memories ORDER BY datetime(updated_at) DESC').all() as Array<Record<string, unknown>>;
  return rows.map(row => stripUndefined({
    id: row.id,
    content: row.content,
    category: row.category,
    importance: row.importance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceProvider: row.source_provider,
    sourceModel: row.source_model,
    sourceConnectionId: row.source_connection_id,
    sourceChatId: row.source_chat_id,
    vector: parseJson(row.vector_json as string | null, undefined)
  }) as SavedMemoryRecord);
};

export function upsertSavedMemory(memory: SavedMemoryRecord) {
  ensureDataStore();
  getSqlite().prepare(`
    INSERT INTO saved_memories (
      id, content, category, importance, created_at, updated_at, source_provider,
      source_model, source_connection_id, source_chat_id, vector_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      category = excluded.category,
      importance = excluded.importance,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      source_provider = excluded.source_provider,
      source_model = excluded.source_model,
      source_connection_id = excluded.source_connection_id,
      source_chat_id = excluded.source_chat_id,
      vector_json = excluded.vector_json
  `).run(
    memory.id,
    memory.content,
    memory.category || 'General',
    memory.importance || 'medium',
    memory.createdAt,
    memory.updatedAt,
    memory.sourceProvider || null,
    memory.sourceModel || null,
    memory.sourceConnectionId || null,
    memory.sourceChatId || null,
    json(memory.vector)
  );
}

export const replaceSavedMemories = (memories: SavedMemoryRecord[]) => {
  ensureDataStore();
  const db = getSqlite();
  const run = db.transaction(() => {
    db.prepare('DELETE FROM saved_memories').run();
    memories.forEach(upsertSavedMemory);
  });
  run();
};

export const deleteSavedMemoryRecord = (id: string) => {
  ensureDataStore();
  getSqlite().prepare('DELETE FROM saved_memories WHERE id = ?').run(id);
};

export const listChatHistoryMemories = (): ChatHistoryMemoryRecord[] => {
  ensureDataStore();
  const rows = getSqlite().prepare('SELECT * FROM chat_history_memories ORDER BY datetime(created_at) DESC').all() as Array<Record<string, unknown>>;
  return rows.map(row => stripUndefined({
    id: row.id,
    chatId: row.chat_id,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    createdAt: row.created_at,
    sourceProvider: row.source_provider,
    sourceModel: row.source_model,
    sourceConnectionId: row.source_connection_id,
    sourceUserMessageId: row.source_user_message_id,
    vector: parseJson(row.vector_json as string | null, undefined)
  }) as ChatHistoryMemoryRecord);
};

export function upsertChatHistoryMemory(memory: ChatHistoryMemoryRecord) {
  ensureDataStore();
  getSqlite().prepare(`
    INSERT INTO chat_history_memories (
      id, chat_id, user_message, assistant_message, created_at,
      source_provider, source_model, source_connection_id, source_user_message_id, vector_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      chat_id = excluded.chat_id,
      user_message = excluded.user_message,
      assistant_message = excluded.assistant_message,
      created_at = excluded.created_at,
      source_provider = excluded.source_provider,
      source_model = excluded.source_model,
      source_connection_id = excluded.source_connection_id,
      source_user_message_id = excluded.source_user_message_id,
      vector_json = excluded.vector_json
  `).run(
    memory.id,
    memory.chatId || null,
    memory.userMessage,
    memory.assistantMessage,
    memory.createdAt,
    memory.sourceProvider || null,
    memory.sourceModel || null,
    memory.sourceConnectionId || null,
    memory.sourceUserMessageId || null,
    json(memory.vector)
  );
}

export const replaceChatHistoryMemories = (memories: ChatHistoryMemoryRecord[]) => {
  ensureDataStore();
  const db = getSqlite();
  const run = db.transaction(() => {
    db.prepare('DELETE FROM chat_history_memories').run();
    memories.forEach(upsertChatHistoryMemory);
  });
  run();
};

export const deleteChatHistoryForChat = (chatId: string) => {
  ensureDataStore();
  getSqlite().prepare('DELETE FROM chat_history_memories WHERE chat_id = ?').run(chatId);
};

export const clearChatHistoryRecords = () => {
  ensureDataStore();
  getSqlite().prepare('DELETE FROM chat_history_memories').run();
};

export const listExportData = () => {
  ensureDataStore();
  const shared = getSqlite().prepare('SELECT snapshot_json FROM shared_chats ORDER BY datetime(created_at) DESC').all() as Array<{ snapshot_json: string }>;
  return {
    chats: listChatRecords(false).concat(listChatRecords(true)).map(chat => getChatRecord(chat.id || '')).filter(Boolean),
    sharedChats: shared.map(row => parseJson(row.snapshot_json, null)).filter(Boolean),
    savedMemories: listSavedMemories(),
    chatHistory: listChatHistoryMemories()
  };
};
