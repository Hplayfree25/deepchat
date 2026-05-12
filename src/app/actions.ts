'use server';

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { clearChatHistory, deleteChatReferences } from './memory';
import { readLLMSettings, writeLLMSettings, type LLMSettings } from '@/lib/llm-settings';

export type { LLMSettings } from '@/lib/llm-settings';

const CHAT_DIR = path.join(process.cwd(), 'data', 'chat');
const SHARE_DIR = path.join(CHAT_DIR, 'sharechat');
const TEMP_FILE_ROOT = path.join(process.cwd(), 'data', 'temp', 'file');

type StoredAttachment = {
  name?: unknown;
  ext?: unknown;
};

type StoredMessageVersion = {
  content?: unknown;
  reasoning?: unknown;
  reasoningDuration?: unknown;
  versionIndex?: unknown;
  [key: string]: unknown;
};

type StoredMessage = {
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
  [key: string]: unknown;
};

type StoredChat = {
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
  [key: string]: unknown;
};

type UserProfileData = {
  id?: string;
  name?: string;
  avatar?: string;
  plan?: string;
};

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
  await unlinkIfExists(path.join(SHARE_DIR, `${chat.shareId}.json`));
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
  try {
    await fs.mkdir(CHAT_DIR, { recursive: true });
  } catch { }
}

export async function createChat(title: string = 'New Chat', attachedFiles?: StoredAttachment[]) {
  await ensureChatDir();
  const id = Math.random().toString(36).substring(2, 9);
  const newChat = {
    id,
    title,
    createdAt: new Date().toISOString(),
    messages: [],
    pendingAttachedFiles: attachedFiles || []
  };
  await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(newChat, null, 2));
  return id;
}

export async function getChats() {
  await ensureChatDir();
  const files = await fs.readdir(CHAT_DIR);
  const chats = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await fs.readFile(path.join(CHAT_DIR, file), 'utf-8');
      try {
        const chat = JSON.parse(content);
        if (!chat.archived) {
          chats.push(chat);
        }
      } catch { }
    }
  }
  return chats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getArchivedChats() {
  await ensureChatDir();
  const files = await fs.readdir(CHAT_DIR);
  const chats = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await fs.readFile(path.join(CHAT_DIR, file), 'utf-8');
      try {
        const chat = JSON.parse(content);
        if (chat.archived) {
          chats.push(chat);
        }
      } catch { }
    }
  }
  return chats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSharedLinks() {
  await ensureChatDir();
  const files = await fs.readdir(CHAT_DIR);
  const shared = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await fs.readFile(path.join(CHAT_DIR, file), 'utf-8');
      try {
        const chat = JSON.parse(content);
        if (chat.shareId) {
          shared.push({
            id: chat.id,
            title: chat.title || 'Untitled Chat',
            shareId: chat.shareId,
            createdAt: chat.createdAt,
            messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0
          });
        }
      } catch { }
    }
  }
  return shared.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getChat(id: string): Promise<StoredChat | null> {
  try {
    const content = await fs.readFile(path.join(CHAT_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(content) as StoredChat;
  } catch {
    return null;
  }
}

export async function shareChat(chatId: string) {
  const chat = await getChat(chatId);
  if (!chat) return null;

  await fs.mkdir(SHARE_DIR, { recursive: true });

  let shareId = chat.shareId;
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
  await fs.writeFile(path.join(CHAT_DIR, `${chatId}.json`), JSON.stringify(chat, null, 2));

  await fs.writeFile(path.join(SHARE_DIR, `${shareId}.json`), JSON.stringify(chat, null, 2));

  return shareId;
}

export async function getSharedChat(shareId: string) {
  try {
    const content = await fs.readFile(path.join(SHARE_DIR, `${shareId}.json`), 'utf-8');
    const chat = JSON.parse(content);
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
  } catch {
    return null;
  }
}

export async function saveMessage(id: string, message: StoredMessage) {
  const chat = await getChat(id);
  if (chat) {
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const idx = messages.findIndex((m) => m.id === message.id);
    const normalizedMessage = normalizeMessageVersions({
      ...message,
      chatIndex: typeof message.chatIndex === 'number'
        ? message.chatIndex
        : idx !== -1
          ? messages[idx]?.chatIndex ?? idx
          : messages.length
    });
    if (idx !== -1) {
      messages[idx] = normalizedMessage;
    } else {
      messages.push(normalizedMessage);
    }
    chat.messages = messages;

    if (chat.pendingAttachedFiles) {
      delete chat.pendingAttachedFiles;
    }

    await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    return chat;
  }
  return null;
}

export async function updateChatTitle(id: string, title: string) {
  const chat = await getChat(id);
  if (chat) {
    chat.title = title;
    await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    revalidatePath('/');
    return chat;
  }
  return null;
}

export async function updateChatTags(id: string, tags: string[]) {
  const chat = await getChat(id);
  if (chat) {
    chat.tags = tags;
    await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    revalidatePath('/');
    return chat;
  }
  return null;
}

export async function togglePinChat(id: string) {
  const chat = await getChat(id);
  if (chat) {
    chat.pinned = !chat.pinned;
    await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    revalidatePath('/');
    return chat;
  }
  return null;
}

export async function archiveChat(id: string) {
  const chat = await getChat(id);
  if (chat) {
    chat.archived = true;
    await fs.writeFile(path.join(CHAT_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    revalidatePath('/');
    return chat;
  }
  return null;
}

export async function archiveAllChats() {
  await ensureChatDir();
  try {
    const files = await fs.readdir(CHAT_DIR);
    let count = 0;
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(CHAT_DIR, file);
        try {
          const chat = JSON.parse(await fs.readFile(filePath, 'utf-8'));
          if (!chat.archived) {
            chat.archived = true;
            await fs.writeFile(filePath, JSON.stringify(chat, null, 2));
            count += 1;
          }
        } catch { }
      }
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
      await deleteSharedChatCopy(chat);
    }
    await unlinkIfExists(path.join(CHAT_DIR, `${id}.json`));
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

const USER_DIR = path.join(process.cwd(), 'data', 'user');

export async function ensureUserDir() {
  try {
    await fs.mkdir(USER_DIR, { recursive: true });
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

const LLM_DIR = path.join(process.cwd(), 'data', 'llm', 'api');

export async function ensureLLMDir() {
  try {
    await fs.mkdir(LLM_DIR, { recursive: true });
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
  await ensureChatDir();
  try {
    const files = await fs.readdir(CHAT_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(CHAT_DIR, file);
        try {
          const chat = JSON.parse(await fs.readFile(filePath, 'utf-8'));
          await deleteChatAttachments(chat);
          await deleteSharedChatCopy(chat);
        } catch { }
        await unlinkIfExists(filePath);
      }
    }
    await fs.rm(SHARE_DIR, { recursive: true, force: true });
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
  await ensureChatDir();
  await ensureUserDir();
  await ensureLLMDir();

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
    chats: await readDirJson(CHAT_DIR),
    sharedChats: await readDirJson(path.join(CHAT_DIR, 'sharechat')),
    profile: await readJson(path.join(USER_DIR, 'profile.json')),
    persona: await readJson(path.join(USER_DIR, 'persona.json')),
    memories: {
      saved: await readJson(path.join(USER_DIR, 'memories', 'reference-saved-memories.json')),
      chatHistory: await readJson(path.join(USER_DIR, 'memories', 'reference-chat-history.json'))
    },
    connections: await readDirJson(LLM_DIR)
  };
}
