'use client';

import { getChat, saveMessage, updateChatTitle } from '@/app/actions';
import { getEnabledMCPRuntimeServers } from '@/lib/mcp-settings';
import { publishDeepChatNotification } from '@/lib/notification-settings';
import { getEnabledToolRuntimeItems } from '@/lib/tool-settings';

interface MemoryApiMessage {
  id?: string;
  role: string;
  content?: string;
}

interface MemoryAssistantMessage {
  id: string;
  content?: string;
  [key: string]: unknown;
}

interface ChatApiMessage {
  id?: string;
  role: string;
  content?: string;
  attachedFiles?: unknown;
  [key: string]: unknown;
}

interface ChatMessageVersion {
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  versionIndex?: number;
  [key: string]: unknown;
}

interface StoredChatMessage extends MemoryAssistantMessage {
  reasoning?: string;
  reasoningDuration?: number;
  versions?: ChatMessageVersion[];
  currentVersionIndex?: number;
  isStreaming?: boolean;
  isError?: boolean;
  isStopped?: boolean;
}

interface SelectedModelConnection {
  connectionId?: string;
  id?: string;
}

export interface ChatGenerationSnapshot {
  chatId: string;
  assistantMsgId: string;
  content: string;
  reasoning: string;
  isStreaming: boolean;
  isError?: boolean;
  isStopped?: boolean;
  reasoningDuration?: number;
  status: 'running' | 'completed' | 'stopped' | 'error';
}

interface ChatGenerationTask {
  chatId: string;
  assistantMsgId: string;
  apiMessages: ChatApiMessage[];
  controller: AbortController;
  fullContent: string;
  fullReasoning: string;
  startedAt: number;
  reasoningEndTime: number;
  status: ChatGenerationSnapshot['status'];
  stopRequested: boolean;
  connection: SelectedModelConnection | null;
  promise?: Promise<void>;
  lastEmittedAt: number;
  pendingEmit: ReturnType<typeof setTimeout> | null;
}

const tasks = new Map<string, ChatGenerationTask>();
const listeners = new Map<string, Set<(snapshot: ChatGenerationSnapshot) => void>>();
const STREAM_EMIT_INTERVAL_MS = 80;

const getResponseError = async (res: Response) => {
  try {
    const data = await res.clone().json();
    if (data?.error) return data.error;
  } catch {
    try {
      const text = await res.text();
      if (text) return text;
    } catch {
    }
  }
  return `Request failed with status ${res.status}`;
};

const isGenericChatTitle = (title?: string) => {
  const normalized = (title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalized || normalized === 'new chat' || normalized === 'untitled chat' || normalized === 'untitled conversation';
};

const normalizeVersions = (versions: ChatMessageVersion[] = []) => versions.map((version, index) => ({
  ...version,
  versionIndex: typeof version?.versionIndex === 'number' ? version.versionIndex : index + 1
}));

const getDuration = (task: ChatGenerationTask) => {
  let durationSec = Math.round((task.reasoningEndTime - task.startedAt) / 1000);
  if (durationSec === 0 && task.fullReasoning) {
    durationSec = 1;
  }
  return task.fullReasoning ? durationSec : undefined;
};

const getSnapshot = (task: ChatGenerationTask): ChatGenerationSnapshot => ({
  chatId: task.chatId,
  assistantMsgId: task.assistantMsgId,
  content: task.fullContent,
  reasoning: task.fullReasoning,
  isStreaming: task.status === 'running',
  isError: task.status === 'error',
  isStopped: task.status === 'stopped',
  reasoningDuration: getDuration(task),
  status: task.status
});

const dispatchSnapshot = (task: ChatGenerationTask) => {
  const snapshot = getSnapshot(task);
  listeners.get(task.chatId)?.forEach(listener => listener(snapshot));
};

const emitSnapshot = (task: ChatGenerationTask, immediate = false) => {
  if (task.pendingEmit && (immediate || task.status !== 'running')) {
    clearTimeout(task.pendingEmit);
    task.pendingEmit = null;
  }

  if (immediate || task.status !== 'running') {
    task.lastEmittedAt = Date.now();
    dispatchSnapshot(task);
    return;
  }

  const now = Date.now();
  const elapsed = now - task.lastEmittedAt;
  if (elapsed >= STREAM_EMIT_INTERVAL_MS) {
    task.lastEmittedAt = now;
    dispatchSnapshot(task);
    return;
  }

  if (!task.pendingEmit) {
    task.pendingEmit = setTimeout(() => {
      task.pendingEmit = null;
      task.lastEmittedAt = Date.now();
      dispatchSnapshot(task);
    }, STREAM_EMIT_INTERVAL_MS - elapsed);
  }
};

const formatMessages = (apiMessages: ChatApiMessage[]) => {
  if (apiMessages.length <= 1) {
    return apiMessages.map(m => ({ role: m.role, content: m.content, attachedFiles: m.attachedFiles }));
  }

  const history = apiMessages.slice(0, -1);
  const lastMsg = apiMessages[apiMessages.length - 1];
  let sysContent = "You are a helpful AI assistant. Below is the history of the current conversation.\n\n=== CHAT HISTORY ===\n";

  history.forEach(m => {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    sysContent += `${role}: ${m.content}\n\n`;
  });

  sysContent += "=== END OF HISTORY ===\n\nPlease respond to the user's latest message based on the context above.";

  return [
    { role: 'system', content: sysContent },
    { role: 'user', content: lastMsg.content, attachedFiles: lastMsg.attachedFiles }
  ];
};

const getSelectedConnection = (): SelectedModelConnection | null => {
  const selectedModelStr = localStorage.getItem('selectedModelObj');
  return selectedModelStr ? JSON.parse(selectedModelStr) : null;
};

const updateMessageVersion = (message: StoredChatMessage, content: string, reasoning: string, reasoningDuration?: number) => {
  const updated = {
    ...message,
    content,
    reasoning,
    reasoningDuration
  };

  if (updated.versions && updated.currentVersionIndex !== undefined) {
    updated.versions = normalizeVersions(updated.versions);
    updated.versions[updated.currentVersionIndex] = {
      ...updated.versions[updated.currentVersionIndex],
      content,
      reasoning,
      reasoningDuration
    };
  }

  return updated;
};

const getAssistantMessage = async (chatId: string, assistantMsgId: string) => {
  const chat = await getChat(chatId);
  const messages = Array.isArray(chat?.messages) ? chat.messages as StoredChatMessage[] : [];
  return messages.find(m => m.id === assistantMsgId) || null;
};

const saveFinalMessage = async (task: ChatGenerationTask, options: { isError?: boolean; isStopped?: boolean; errorMessage?: string } = {}) => {
  const currentMsg = await getAssistantMessage(task.chatId, task.assistantMsgId);
  if (!currentMsg) return null;

  const content = options.errorMessage || task.fullContent || (options.isStopped ? 'Generation stopped.' : '');
  const finalMessage = {
    ...updateMessageVersion(currentMsg, content, task.fullReasoning, getDuration(task)),
    isStreaming: false,
    isError: options.isError === true,
    isStopped: options.isStopped === true
  };

  await saveMessage(task.chatId, finalMessage);
  return finalMessage;
};

const generateChatTitle = async (chatId: string, prompt: string, connection: SelectedModelConnection | null) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const titleRes = await fetch('/api/chat/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          connectionId: connection?.connectionId,
          modelId: connection?.id
        })
      });
      if (!titleRes.ok) continue;
      const { title } = await titleRes.json();
      if (!isGenericChatTitle(title)) {
        await updateChatTitle(chatId, title);
        window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId, title } }));
        return title;
      }
    } catch {
    }
  }
  return null;
};

const saveMemoriesFromResponse = async (chatId: string, apiMessages: MemoryApiMessage[], assistantMessage: MemoryAssistantMessage, connection: SelectedModelConnection | null) => {
  const lastUserMessage = [...apiMessages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage?.content || !assistantMessage?.content) return;

  try {
    const res = await fetch('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        userMessage: lastUserMessage.content,
        userMessageId: lastUserMessage.id,
        assistantMessage: assistantMessage.content,
        connectionId: connection?.connectionId,
        modelId: connection?.id
      })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.savedCount) return;

    const updatedMessage = {
      ...assistantMessage,
      memoriesSaved: true,
      memoriesSavedCount: data.savedCount,
      memoryProvider: data.provider,
      memoryModel: data.model
    };

    await saveMessage(chatId, updatedMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));
  } catch {
  }
};

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
};

const isAbortError = (error: unknown) => {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object');
};

const getString = (value: unknown) => typeof value === 'string' ? value : '';

const getOpenAiDelta = (json: Record<string, unknown>) => {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : null;
  const delta = choice && isRecord(choice.delta) ? choice.delta : null;
  return {
    reasoning: getString(delta?.reasoning_content),
    content: getString(delta?.content)
  };
};

const getGeminiText = (json: Record<string, unknown>) => {
  const directText = getString(json.text);
  if (directText) return directText;

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const candidate = isRecord(candidates[0]) ? candidates[0] : null;
  const content = candidate && isRecord(candidate.content) ? candidate.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  return parts.map(part => isRecord(part) ? getString(part.text) : '').join('');
};

const finishSuccessfulTask = async (task: ChatGenerationTask) => {
  if (!task.fullContent && !task.fullReasoning) {
    throw new Error('The provider returned an empty response.');
  }

  task.status = 'completed';
  const finalMessage = await saveFinalMessage(task);
  emitSnapshot(task, true);

  if (finalMessage) {
    void saveMemoriesFromResponse(task.chatId, task.apiMessages, finalMessage, task.connection);
    const currentChat = await getChat(task.chatId);
    const latestUserPrompt = [...task.apiMessages].reverse().find(m => m.role === 'user')?.content;
    if (latestUserPrompt && isGenericChatTitle(currentChat?.title)) {
      try {
        await generateChatTitle(task.chatId, latestUserPrompt, task.connection);
      } catch {
      }
    }
  }

  publishDeepChatNotification({
    id: `generation-finished-${task.chatId}-${task.assistantMsgId}`,
    type: 'responseFinished',
    title: 'Response finished',
    description: 'Your background response is ready to read.',
    severity: 'success',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const finishStoppedTask = async (task: ChatGenerationTask) => {
  task.status = 'stopped';
  task.fullContent = task.fullContent || 'Generation stopped.';
  await saveFinalMessage(task, { isStopped: true });
  emitSnapshot(task, true);
  publishDeepChatNotification({
    id: `generation-stopped-${task.chatId}-${task.assistantMsgId}`,
    type: 'task',
    title: 'Task stopped',
    description: 'The active generation task was stopped.',
    severity: 'warning',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const finishErroredTask = async (task: ChatGenerationTask, error: unknown) => {
  task.status = 'error';
  const errorMessage = getErrorMessage(error);
  const message = errorMessage ? `I encountered an error while processing your request: ${errorMessage}` : 'I encountered an error while processing your request.';
  await saveFinalMessage(task, { isError: true, errorMessage: message });
  task.fullContent = message;
  emitSnapshot(task, true);
  publishDeepChatNotification({
    id: `generation-error-${task.chatId}-${task.assistantMsgId}`,
    type: 'task',
    title: 'Task failed',
    description: 'The generation task could not be completed.',
    severity: 'error',
    chatId: task.chatId,
    href: `/chat/${task.chatId}`
  });
};

const consumeStream = async (task: ChatGenerationTask, res: Response) => {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const provider = res.headers.get('x-provider') || '';

  if (!reader) return;

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || line.startsWith(':')) continue;

      const data = line.replace(/^data:\s*/, '').trim();
      if (data === '[DONE]') break;

      let json: Record<string, unknown>;
      try {
        const parsed = JSON.parse(data) as unknown;
        if (!isRecord(parsed)) continue;
        json = parsed;
      } catch {
        continue;
      }

      if (json.error) {
        throw new Error(getString(json.error) || 'Provider returned an error.');
      }

      if (provider === 'anthropic') {
        const delta = isRecord(json.delta) ? json.delta : null;
        if (json.type === 'content_block_delta') {
          task.fullContent += getString(delta?.text);
        }
      } else if (provider === 'gemini' || provider === 'vertexai') {
        task.fullContent += getGeminiText(json);
      } else {
        const delta = getOpenAiDelta(json);
        if (delta.reasoning) {
          task.fullReasoning += delta.reasoning;
          task.reasoningEndTime = Date.now();
        }
        if (delta.content) {
          task.fullContent += delta.content;
        }
      }
    }

    emitSnapshot(task);
  }
};

const runTask = async (task: ChatGenerationTask) => {
  try {
    const formattedMessages = formatMessages(task.apiMessages);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: formattedMessages,
        connectionId: task.connection?.connectionId,
        modelId: task.connection?.id,
        mcpServers: getEnabledMCPRuntimeServers(),
        tools: getEnabledToolRuntimeItems()
      }),
      signal: task.controller.signal
    });

    if (!res.ok) throw new Error(await getResponseError(res));

    await consumeStream(task, res);

    if (task.stopRequested) {
      await finishStoppedTask(task);
    } else {
      await finishSuccessfulTask(task);
    }
  } catch (error: unknown) {
    if (task.stopRequested || isAbortError(error)) {
      await finishStoppedTask(task);
    } else {
      await finishErroredTask(task, error);
    }
  } finally {
    tasks.delete(task.chatId);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId: task.chatId } }));
  }
};

export const startChatGeneration = (chatId: string, apiMessages: ChatApiMessage[], assistantMsgId: string) => {
  const existing = tasks.get(chatId);
  if (existing) return getSnapshot(existing);

  const task: ChatGenerationTask = {
    chatId,
    assistantMsgId,
    apiMessages,
    controller: new AbortController(),
    fullContent: '',
    fullReasoning: '',
    startedAt: Date.now(),
    reasoningEndTime: Date.now(),
    status: 'running',
    stopRequested: false,
    connection: getSelectedConnection(),
    lastEmittedAt: 0,
    pendingEmit: null
  };

  tasks.set(chatId, task);
  emitSnapshot(task, true);
  task.promise = runTask(task);
  return getSnapshot(task);
};

export const stopChatGeneration = (chatId: string) => {
  const task = tasks.get(chatId);
  if (!task || task.status !== 'running') return false;
  task.stopRequested = true;
  task.controller.abort();
  return true;
};

export const getChatGenerationState = (chatId: string) => {
  const task = tasks.get(chatId);
  return task ? getSnapshot(task) : null;
};

export const subscribeChatGeneration = (chatId: string, listener: (snapshot: ChatGenerationSnapshot) => void) => {
  const set = listeners.get(chatId) || new Set<(snapshot: ChatGenerationSnapshot) => void>();
  set.add(listener);
  listeners.set(chatId, set);

  const task = tasks.get(chatId);
  if (task) listener(getSnapshot(task));

  return () => {
    const current = listeners.get(chatId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(chatId);
  };
};
