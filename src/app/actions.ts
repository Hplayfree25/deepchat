'use server';

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { tmpdir } from 'os';
import { revalidatePath } from 'next/cache';
import { clearChatHistory, deleteChatReferences } from './memory';
import { readLLMSettings, writeLLMSettings, type LLMSettings } from '@/lib/llm-settings';
import { SHARE_DIR, TEMP_FILE_DIR, USER_DIR, LLM_API_DIR, ensureDataDirectories } from '@/lib/data-directories';
import {
  createChatRecord,
  deleteAllChatRecords,
  deleteChatRecord,
  deleteSharedSnapshot,
  ensureDataStore,
  getChatRecord,
  getSharedSnapshot,
  listChatRecords,
  listExportData,
  listSharedLinkRecords,
  saveMessageRecord,
  saveSharedSnapshot,
  updateChatRecord,
  type StoredAttachment,
  type StoredChat,
  type StoredMessage,
  type UserProfileData
} from '@/lib/db/store';

export type { LLMSettings } from '@/lib/llm-settings';

const TEMP_FILE_ROOT = TEMP_FILE_DIR;
const ANALYSIS_ROOT = path.join(tmpdir(), 'deepchat', 'analysis');
const LEGACY_ANALYSIS_ROOT = path.join(process.cwd(), 'data', 'analysis');

type ConnectionData = {
  id?: string;
};

const getStoredAttachmentPath = (file: StoredAttachment) => {
  const name = typeof file?.name === 'string' ? file.name : '';
  if (!name) return null;
  const ext = typeof file?.ext === 'string' && file.ext.trim() ? file.ext : 'other';
  const root = path.normalize(TEMP_FILE_ROOT + path.sep);
  const filePath = path.normalize(path.join(TEMP_FILE_ROOT, ext, name));
  if (!filePath.toLowerCase().startsWith(root.toLowerCase())) return null;
  return filePath;
};

const unlinkIfExists = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (error: unknown) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
};

const deleteChatAttachments = async (chat: StoredChat | null | undefined) => {
  const messages = Array.isArray(chat?.messages) ? chat.messages as StoredMessage[] : [];
  const files = [
    ...(Array.isArray(chat?.pendingAttachedFiles) ? chat.pendingAttachedFiles as StoredAttachment[] : []),
    ...messages.flatMap(message => Array.isArray(message?.attachedFiles) ? message.attachedFiles as StoredAttachment[] : [])
  ] satisfies StoredAttachment[];
  const seen = new Set<string>();

  for (const file of files) {
    const filePath = getStoredAttachmentPath(file);
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    await unlinkIfExists(filePath);
  }
};

const deleteSharedChatCopy = async (chat: StoredChat | null | undefined) => {
  if (typeof chat?.shareId !== 'string' || !chat.shareId) return;
  deleteSharedSnapshot(chat.shareId);
  await unlinkIfExists(path.join(SHARE_DIR, `${chat.shareId}.json`));
};

const rmDirIfExists = async (dirPath: string) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error: unknown) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
};

const collectAnalysisRunIdsFromValue = (value: unknown, runIds: Set<string>) => {
  if (typeof value === 'string') {
    const patterns = [
      /"runId"\s*:\s*"([a-f0-9-]{12,})"/gi,
      /[?&]runId=([a-f0-9-]{12,})/gi
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(value)) !== null) {
        runIds.add(match[1]);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectAnalysisRunIdsFromValue(item, runIds));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(item => collectAnalysisRunIdsFromValue(item, runIds));
  }
};

const deleteChatAnalysisArtifactsInRoot = async (chat: StoredChat | null | undefined, analysisRoot: string) => {
  const runIds = new Set<string>();
  collectAnalysisRunIdsFromValue(chat, runIds);
  const root = path.normalize(analysisRoot + path.sep);

  for (const runId of runIds) {
    const runPath = path.normalize(path.join(analysisRoot, runId));
    if (!runPath.toLowerCase().startsWith(root.toLowerCase())) continue;
    await rmDirIfExists(runPath);
  }

  let entries: string[] = [];
  try {
    entries = await fs.readdir(analysisRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    const runPath = path.normalize(path.join(analysisRoot, entry));
    if (!runPath.toLowerCase().startsWith(root.toLowerCase())) continue;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(runPath, 'meta.json'), 'utf-8'));
      if (meta?.chatId === chat?.id) await rmDirIfExists(runPath);
    } catch {
    }
  }
};

const deleteChatAnalysisArtifacts = async (chat: StoredChat | null | undefined) => {
  await deleteChatAnalysisArtifactsInRoot(chat, ANALYSIS_ROOT);
  await deleteChatAnalysisArtifactsInRoot(chat, LEGACY_ANALYSIS_ROOT);
};

const normalizeMessageVersions = (message: StoredMessage) => {
  if (!Array.isArray(message?.versions) || message.versions.length === 0) return message;
  const versions = message.versions.map((version, index: number) => ({
    ...version,
    versionIndex: typeof version?.versionIndex === 'number' ? version.versionIndex : index + 1
  }));
  const requestedIndex = typeof message.currentVersionIndex === 'number' && Number.isInteger(message.currentVersionIndex) ? message.currentVersionIndex : versions.length - 1;
  const currentVersionIndex = Math.min(Math.max(requestedIndex, 0), versions.length - 1);
  const selectedVersion = versions[currentVersionIndex] || versions[versions.length - 1];
  return {
    ...message,
    versions,
    currentVersionIndex,
    content: typeof selectedVersion?.content === 'string' ? selectedVersion.content : message.content,
    reasoning: typeof selectedVersion?.reasoning === 'string' ? selectedVersion.reasoning : message.reasoning,
    reasoningDuration: selectedVersion?.reasoningDuration ?? message.reasoningDuration
  };
};

export async function ensureChatDir() {
  ensureDataStore();
}

export async function createChat(title: string = 'New Chat', attachedFiles?: StoredAttachment[]) {
  return createChatRecord(title, attachedFiles);
}

export async function getChats() {
  return listChatRecords(false);
}

export async function getArchivedChats() {
  return listChatRecords(true)
    .filter((chat): chat is StoredChat & { id: string } => typeof chat.id === 'string')
    .map(chat => ({
      ...chat,
      id: chat.id,
      title: chat.title || 'New Chat',
      createdAt: chat.createdAt || new Date().toISOString()
    }));
}

export async function getSharedLinks() {
  return listSharedLinkRecords();
}

export async function getChat(id: string): Promise<StoredChat | null> {
  return getChatRecord(id);
}

export async function shareChat(chatId: string) {
  const chat = await getChat(chatId);
  if (!chat) return null;

  let shareId = typeof chat.shareId === 'string' ? chat.shareId : null;
  const ownerProfile = await getUserProfile();
  if (!shareId) {
    shareId = crypto.randomBytes(16).toString('hex');
    chat.isShared = true;
    chat.shareId = shareId;
  }
  chat.ownerProfile = {
    name: ownerProfile?.name || 'Guest',
    avatar: ownerProfile?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
  };
  updateChatRecord(chatId, chat);
  saveSharedSnapshot(shareId, chatId, chat);

  return shareId;
}

export async function getSharedChat(shareId: string) {
  const chat = getSharedSnapshot(shareId);
  if (!chat) return null;
  if (!chat.ownerProfile) {
    const ownerProfile = await getUserProfile();
    return {
      ...chat,
      ownerProfile: {
        name: ownerProfile?.name || 'Guest',
        avatar: ownerProfile?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
      }
    };
  }
  return chat;
}

export async function saveMessage(id: string, message: StoredMessage) {
  return saveMessageRecord(id, normalizeMessageVersions(message));
}

export async function updateChatTitle(id: string, title: string) {
  const chat = updateChatRecord(id, { title });
  revalidatePath('/');
  return chat;
}

export async function updateChatTags(id: string, tags: string[]) {
  const chat = updateChatRecord(id, { tags });
  revalidatePath('/');
  return chat;
}

export async function togglePinChat(id: string) {
  const chat = await getChat(id);
  if (chat) {
    const next = updateChatRecord(id, { pinned: !chat.pinned });
    revalidatePath('/');
    return next;
  }
  return null;
}

export async function archiveChat(id: string) {
  const chat = updateChatRecord(id, { archived: true });
  revalidatePath('/');
  return chat;
}

export async function archiveAllChats() {
  try {
    const chats = listChatRecords(false);
    let count = 0;
    for (const chat of chats) {
      if (!chat.id) continue;
      updateChatRecord(chat.id, { archived: true });
      count += 1;
    }
    revalidatePath('/');
    return { success: true, count };
  } catch {
    return { success: false, count: 0 };
  }
}

export async function deleteChat(id: string) {
  try {
    const chat = await getChat(id);
    if (chat) {
      await deleteChatAttachments(chat);
      await deleteChatAnalysisArtifacts(chat);
      await deleteSharedChatCopy(chat);
    }
    deleteChatRecord(id);
    await deleteChatReferences(id);
    revalidatePath('/');
    return true;
  } catch {
    return false;
  }
}

export async function uploadFile(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) return { success: false, error: 'No file provided' };

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let ext = path.extname(file.name).slice(1).toLowerCase();
    if (!ext) ext = 'other';

    const uploadDir = path.join(process.cwd(), 'data', 'temp', 'file', ext);
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = `${crypto.randomBytes(4).toString('hex')}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    
    await fs.writeFile(filePath, buffer);

    return { success: true, fileName: safeName, ext };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

export async function ensureUserDir() {
  try {
    await ensureDataDirectories();
  } catch { }
}

export async function getUserProfile() {
  await ensureUserDir();
  try {
    const content = await fs.readFile(path.join(USER_DIR, 'profile.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    const defaultProfile = {
      id: crypto.randomUUID(),
      name: 'Guest',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
      plan: ''
    };
    await fs.writeFile(path.join(USER_DIR, 'profile.json'), JSON.stringify(defaultProfile, null, 2));
    return defaultProfile;
  }
}

export async function saveUserProfile(profile: UserProfileData) {
  await ensureUserDir();
  await fs.writeFile(path.join(USER_DIR, 'profile.json'), JSON.stringify(profile, null, 2));
  return profile;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  return readLLMSettings();
}

export async function saveLLMSettings(settings: Partial<LLMSettings>) {
  return writeLLMSettings(settings);
}

const LLM_DIR = LLM_API_DIR;

export async function ensureLLMDir() {
  try {
    await ensureDataDirectories();
  } catch { }
}

export async function getConnections() {
  await ensureLLMDir();
  try {
    const files = await fs.readdir(LLM_DIR);
    const connections = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(LLM_DIR, file), 'utf-8');
        connections.push(JSON.parse(content));
      }
    }
    return connections;
  } catch {
    return [];
  }
}

export async function saveConnection(connection: ConnectionData) {
  await ensureLLMDir();
  if (!connection.id) connection.id = crypto.randomUUID();
  await fs.writeFile(path.join(LLM_DIR, `${connection.id}.json`), JSON.stringify(connection, null, 2));
  return connection;
}

export async function deleteConnection(id: string) {
  try {
    await fs.unlink(path.join(LLM_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllChats() {
  try {
    const chats = listChatRecords(false).concat(listChatRecords(true));
    for (const chat of chats) {
      await deleteChatAttachments(chat);
      await deleteChatAnalysisArtifacts(chat);
      await deleteSharedChatCopy(chat);
    }
    await rmDirIfExists(ANALYSIS_ROOT);
    await rmDirIfExists(LEGACY_ANALYSIS_ROOT);
    deleteAllChatRecords();
    await clearChatHistory();
    revalidatePath('/');
    return true;
  } catch {
    return false;
  }
}

export async function deleteAllConnections() {
  await ensureLLMDir();
  try {
    const files = await fs.readdir(LLM_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(LLM_DIR, file));
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function exportData() {
  await ensureUserDir();
  await ensureLLMDir();
  const dynamicData = listExportData();

  const readDirJson = async (dir: string) => {
    try {
      const files = await fs.readdir(dir);
      const items = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            items.push(JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')));
          } catch { }
        }
      }
      return items;
    } catch {
      return [];
    }
  };

  const readJson = async (filePath: string) => {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch {
      return null;
    }
  };

  return {
    exportedAt: new Date().toISOString(),
    chats: dynamicData.chats,
    sharedChats: dynamicData.sharedChats,
    profile: await readJson(path.join(USER_DIR, 'profile.json')),
    persona: await readJson(path.join(USER_DIR, 'persona.json')),
    memories: {
      saved: dynamicData.savedMemories,
      chatHistory: dynamicData.chatHistory
    },
    connections: await readDirJson(LLM_DIR)
  };
}
