'use server';

import crypto from 'crypto';
import {
  clearChatHistoryRecords,
  deleteChatHistoryForChat,
  ensureDataStore,
  listChatHistoryMemories,
  listChatRecords,
  listSavedMemories,
  replaceChatHistoryMemories,
  replaceSavedMemories
} from '@/lib/db/store';

const MAX_MEMORIES = 80;
const MAX_CHAT_HISTORY = 120;
const VECTOR_SIZE = 96;

export interface SavedMemory {
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
}

export interface ChatHistoryMemory {
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
}

interface MemoryInput {
  content: string;
  category?: string;
  importance?: 'low' | 'medium' | 'high';
}

interface MemoryMetadata {
  provider?: string;
  model?: string;
  connectionId?: string;
  chatId?: string;
  userMessageId?: string;
}

const defaultMemories: SavedMemory[] = [];

const normalizeMemoryText = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const memorySynonyms: Record<string, string> = {
  cats: 'cat',
  kucing: 'cat',
  catlover: 'cat',
  likes: 'like',
  liked: 'like',
  loves: 'like',
  loved: 'like',
  suka: 'like',
  favorite: 'like',
  favourite: 'like',
  prefers: 'like',
  preferred: 'like',
  lover: 'like',
  owner: 'own',
  owns: 'own',
  name: 'name',
  named: 'name',
  call: 'name',
  called: 'name'
};
const stopWords = new Set([
  'aku', 'saya', 'gua', 'gue', 'gw', 'lu', 'lo', 'kamu', 'anda', 'yang', 'dan', 'atau', 'ini', 'itu',
  'di', 'ke', 'dari', 'buat', 'untuk', 'tolong', 'apa', 'gimana', 'bagaimana', 'kenapa', 'adalah',
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'with', 'is', 'are', 'was', 'were',
  'user', 'users', 'this', 'that', 'has', 'have', 'about'
]);

const tokenizeContext = (text: string) => normalizeMemoryText(text)
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(token => token.length > 2 && !stopWords.has(token));

const hashToken = (token: string) => {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const vectorizeText = (text: string, category: string = '') => {
  const tokens = tokenizeContext(`${category} ${text}`).map(normalizeMemoryToken);
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
  const addToken = (token: string, weight: number) => {
    const hash = hashToken(token);
    const index = hash % VECTOR_SIZE;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] += sign * weight;
  };

  tokens.forEach(token => addToken(token, 1));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    addToken(`${tokens[index]} ${tokens[index + 1]}`, 1.35);
  }

  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map(value => Number((value / magnitude).toFixed(6)));
};

const cosineSimilarity = (left?: number[], right?: number[]) => {
  if (!left || !right || left.length !== VECTOR_SIZE || right.length !== VECTOR_SIZE) return 0;
  let score = 0;
  for (let index = 0; index < VECTOR_SIZE; index += 1) {
    score += left[index] * right[index];
  }
  return score;
};

const getSavedMemoryVector = (memory: Pick<SavedMemory, 'content' | 'category' | 'vector'>) => {
  if (Array.isArray(memory.vector) && memory.vector.length === VECTOR_SIZE) return memory.vector;
  return vectorizeText(memory.content, memory.category);
};

const getHistoryMemoryVector = (memory: Pick<ChatHistoryMemory, 'userMessage' | 'assistantMessage' | 'vector'>) => {
  if (Array.isArray(memory.vector) && memory.vector.length === VECTOR_SIZE) return memory.vector;
  return vectorizeText(`${memory.userMessage} ${memory.assistantMessage}`);
};

const scoreHistory = (queryTokens: string[], queryVector: number[], memory: ChatHistoryMemory, index: number) => {
  const source = `${memory.userMessage} ${memory.assistantMessage}`;
  const memoryTokens = new Set(tokenizeContext(source).map(normalizeMemoryToken));
  if (queryTokens.length === 0 || memoryTokens.size === 0) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (memoryTokens.has(token)) matches += 1;
  }

  const overlap = matches / Math.max(queryTokens.length, 1);
  const semantic = Math.max(0, cosineSimilarity(queryVector, getHistoryMemoryVector(memory)));
  const recency = Math.max(0, 1 - index / MAX_CHAT_HISTORY);
  return semantic * 0.62 + overlap * 0.26 + recency * 0.12;
};

const normalizeMemoryToken = (token: string) => {
  const clean = token.replace(/'s$/, '');
  const singular = clean.length > 4 && clean.endsWith('s') ? clean.slice(0, -1) : clean;
  return memorySynonyms[clean] || memorySynonyms[singular] || singular;
};

const getMemoryTokens = (content: string, category: string = '') => new Set(
  normalizeMemoryText(`${category} ${content}`)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(normalizeMemoryToken)
    .filter(token => token.length > 2 && !stopWords.has(token))
);

const getTokenOverlap = (left: Set<string>, right: Set<string>) => {
  if (left.size === 0 || right.size === 0) return 0;
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) matches += 1;
  }
  return matches / Math.min(left.size, right.size);
};

const areSimilarSavedMemories = (left: { content: string; category?: string }, right: { content: string; category?: string }) => {
  if (normalizeMemoryText(left.content) === normalizeMemoryText(right.content)) return true;
  const leftTokens = getMemoryTokens(left.content, left.category);
  const rightTokens = getMemoryTokens(right.content, right.category);
  const overlap = getTokenOverlap(leftTokens, rightTokens);
  const semantic = cosineSimilarity(vectorizeText(left.content, left.category), vectorizeText(right.content, right.category));
  if (overlap >= 0.6) return true;
  if (semantic >= 0.88 && overlap >= 0.34) return true;
  const bothLikeCat = leftTokens.has('cat') && rightTokens.has('cat') && (leftTokens.has('like') || rightTokens.has('like'));
  const bothName = leftTokens.has('name') && rightTokens.has('name') && overlap >= 0.5;
  return bothLikeCat || bothName;
};

const importanceRank = (importance?: 'low' | 'medium' | 'high') => {
  if (importance === 'high') return 3;
  if (importance === 'medium') return 2;
  return 1;
};

const choosePreferredMemory = (current: SavedMemory, incoming: SavedMemory) => {
  const currentRank = importanceRank(current.importance);
  const incomingRank = importanceRank(incoming.importance);
  if (incomingRank > currentRank) return incoming;
  if (incomingRank < currentRank) return current;
  if (incoming.content.length > current.content.length + 12) return incoming;
  return current;
};

const normalizeSavedMemory = (memory: SavedMemory): SavedMemory => ({
  ...memory,
  category: memory.category || 'General',
  importance: memory.importance || 'medium',
  createdAt: memory.createdAt || new Date().toISOString(),
  updatedAt: memory.updatedAt || memory.createdAt || new Date().toISOString(),
  vector: getSavedMemoryVector(memory)
});

const normalizeHistoryMemory = (memory: ChatHistoryMemory): ChatHistoryMemory => ({
  ...memory,
  vector: getHistoryMemoryVector(memory)
});

const dedupeSavedMemoryList = (memories: SavedMemory[]) => {
  const deduped: SavedMemory[] = [];
  for (const memory of memories) {
    const index = deduped.findIndex(item => areSimilarSavedMemories(item, memory));
    if (index === -1) {
      deduped.push(memory);
    } else {
      deduped[index] = choosePreferredMemory(deduped[index], memory);
    }
  }
  return deduped;
};

const getExistingChatIds = async () => {
  const chats = listChatRecords(false).concat(listChatRecords(true));
  return new Set(chats.map(chat => chat.id).filter((id): id is string => typeof id === 'string'));
};

export async function ensureMemoryFile() {
  ensureDataStore();
}

export async function getSavedMemories(): Promise<SavedMemory[]> {
  await ensureMemoryFile();
  try {
    const parsed = listSavedMemories() as SavedMemory[];
    const valid = parsed
      .filter(item => typeof item?.content === 'string' && item.content.trim())
      .map(normalizeSavedMemory)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    const deduped = dedupeSavedMemoryList(valid).slice(0, MAX_MEMORIES);
    if (parsed.some(item => !Array.isArray(item?.vector) || item.vector.length !== VECTOR_SIZE)) {
      replaceSavedMemories(deduped);
    }
    return deduped;
  } catch {
    return [];
  }
}

const scoreSavedMemory = (queryTokens: string[], queryVector: number[], memory: SavedMemory, index: number) => {
  const memoryTokens = getMemoryTokens(memory.content, memory.category);
  const overlap = getTokenOverlap(new Set(queryTokens), memoryTokens);
  const semantic = Math.max(0, cosineSimilarity(queryVector, getSavedMemoryVector(memory)));
  const importance = importanceRank(memory.importance) / 3;
  const recency = Math.max(0, 1 - index / MAX_MEMORIES);
  return semantic * 0.58 + overlap * 0.24 + importance * 0.1 + recency * 0.08;
};

export async function getRelevantSavedMemories(query: string, limit = 12): Promise<SavedMemory[]> {
  const memories = await getSavedMemories();
  const queryTokens = tokenizeContext(query).map(normalizeMemoryToken);
  const queryVector = vectorizeText(query);

  if (queryTokens.length === 0) {
    return memories
      .sort((a, b) => importanceRank(b.importance) - importanceRank(a.importance) || new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
      .slice(0, Math.min(limit, 8));
  }

  return memories
    .map((memory, index) => ({
      memory,
      score: scoreSavedMemory(queryTokens, queryVector, memory, index)
    }))
    .filter(item => item.score > 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);
}

export async function saveExtractedMemories(items: MemoryInput[], metadata: MemoryMetadata = {}) {
  await ensureMemoryFile();
  const existing = await getSavedMemories();
  const now = new Date().toISOString();
  const seen = new Set(existing.map(memory => normalizeMemoryText(memory.content)));
  const saved: SavedMemory[] = [];
  const next = [...existing];
  let changed = false;

  for (const item of items) {
    const content = typeof item?.content === 'string' ? item.content.replace(/\s+/g, ' ').trim() : '';
    if (!content || content.length < 8 || content.length > 260) continue;
    const normalized = normalizeMemoryText(content);
    if (seen.has(normalized)) continue;

    const memory: SavedMemory = {
      id: crypto.randomUUID(),
      content,
      category: item.category?.replace(/\s+/g, ' ').trim() || 'General',
      importance: item.importance || 'medium',
      createdAt: now,
      updatedAt: now,
      sourceProvider: metadata.provider,
      sourceModel: metadata.model,
      sourceConnectionId: metadata.connectionId,
      sourceChatId: metadata.chatId,
      vector: vectorizeText(content, item.category || 'General')
    };

    const duplicateIndex = next.findIndex(existingMemory => areSimilarSavedMemories(existingMemory, memory));
    if (duplicateIndex !== -1) {
      const preferred = choosePreferredMemory(next[duplicateIndex], memory);
      if (preferred.id !== next[duplicateIndex].id) {
        next[duplicateIndex] = {
          ...preferred,
          updatedAt: now
        };
        changed = true;
      }
      seen.add(normalized);
      continue;
    }

    seen.add(normalized);
    next.unshift(memory);
    saved.push(memory);
    changed = true;
  }

  if (changed) {
    replaceSavedMemories(dedupeSavedMemoryList(next).slice(0, MAX_MEMORIES));
  }

  return saved;
}

export async function recordChatHistoryMemory(userMessage: string, assistantMessage: string, metadata: MemoryMetadata = {}) {
  await ensureMemoryFile();
  const cleanUser = userMessage.replace(/\s+/g, ' ').trim();
  const cleanAssistant = assistantMessage.replace(/\s+/g, ' ').trim();
  if (!cleanUser || !cleanAssistant) return null;
  const userTokens = tokenizeContext(cleanUser);
  const assistantTokens = tokenizeContext(cleanAssistant);
  const explicitMemoryIntent = /\b(?:ingat|remember|catat|save|panggil|call me|nama saya|nama aku|nama gue|nama gua|nama gw|my name is)\b/i.test(cleanUser);
  if (!explicitMemoryIntent && (userTokens.length < 3 || userTokens.length + assistantTokens.length < 12)) return null;

  const existing = await getChatHistoryMemories();
  const duplicateIndex = existing.findIndex(item => {
    if (metadata.userMessageId && item.sourceUserMessageId === metadata.userMessageId) return true;
    if (!metadata.userMessageId && item.chatId === metadata.chatId && normalizeMemoryText(item.userMessage) === normalizeMemoryText(cleanUser)) {
      return cosineSimilarity(getHistoryMemoryVector(item), vectorizeText(`${cleanUser} ${cleanAssistant}`)) > 0.72;
    }
    return false;
  });

  const entry: ChatHistoryMemory = {
    id: duplicateIndex === -1 ? crypto.randomUUID() : existing[duplicateIndex].id,
    chatId: metadata.chatId,
    userMessage: cleanUser.slice(0, 600),
    assistantMessage: cleanAssistant.slice(0, 900),
    createdAt: duplicateIndex === -1 ? new Date().toISOString() : existing[duplicateIndex].createdAt,
    sourceProvider: metadata.provider,
    sourceModel: metadata.model,
    sourceConnectionId: metadata.connectionId,
    sourceUserMessageId: metadata.userMessageId,
    vector: vectorizeText(`${cleanUser} ${cleanAssistant}`)
  };

  const next = duplicateIndex === -1
    ? [entry, ...existing]
    : [entry, ...existing.filter((_, index) => index !== duplicateIndex)];

  replaceChatHistoryMemories(next.slice(0, MAX_CHAT_HISTORY));
  return entry;
}

export async function getChatHistoryMemories(): Promise<ChatHistoryMemory[]> {
  await ensureMemoryFile();
  try {
    const parsed = listChatHistoryMemories() as ChatHistoryMemory[];
    const existingChatIds = await getExistingChatIds();
    const valid = parsed
      .filter(item => typeof item?.userMessage === 'string' && typeof item?.assistantMessage === 'string')
      .filter(item => !existingChatIds || !item.chatId || existingChatIds.has(item.chatId))
      .map(normalizeHistoryMemory)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (
      valid.length !== parsed.length ||
      parsed.some(item => !Array.isArray(item?.vector) || item.vector.length !== VECTOR_SIZE)
    ) {
      replaceChatHistoryMemories(valid.slice(0, MAX_CHAT_HISTORY));
    }
    return valid;
  } catch {
    return [];
  }
}

export async function getRelevantChatHistoryMemories(query: string, limit = 8): Promise<ChatHistoryMemory[]> {
  const history = await getChatHistoryMemories();
  const queryTokens = tokenizeContext(query).map(normalizeMemoryToken);
  const queryVector = vectorizeText(query);
  if (queryTokens.length === 0) return history.slice(0, Math.min(limit, 4));

  const ranked = history
    .map((memory, index) => ({
      memory,
      score: scoreHistory(queryTokens, queryVector, memory, index)
    }))
    .filter(item => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory);

  return ranked.slice(0, limit);
}

export async function deleteSavedMemory(id: string) {
  await ensureMemoryFile();
  try {
    const memories = await getSavedMemories();
    const next = memories.filter(memory => memory.id !== id);
    replaceSavedMemories(next);
    return true;
  } catch {
    return false;
  }
}

export async function clearSavedMemories() {
  await ensureMemoryFile();
  try {
    replaceSavedMemories(defaultMemories);
    return true;
  } catch {
    return false;
  }
}

export async function clearChatHistory() {
  await ensureMemoryFile();
  try {
    clearChatHistoryRecords();
    return true;
  } catch {
    return false;
  }
}

export async function deleteChatReferences(chatId: string) {
  await ensureMemoryFile();
  try {
    deleteChatHistoryForChat(chatId);
    return true;
  } catch {
    return false;
  }
}
