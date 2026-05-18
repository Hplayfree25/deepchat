'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getChat, saveMessage, uploadFile } from '@/app/actions';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import ChatComposer, { getComposerFileIcon } from '@/components/ui/ChatComposer';
import Tooltip from '@/components/ui/Tooltip';
import {
  ChatGenerationSnapshot,
  type MCPUsageItem,
  getChatGenerationState,
  startChatGeneration,
  stopChatGeneration,
  subscribeChatGeneration
} from '@/lib/chat-generation';
import { formatClarificationAnswer, isGeneratedClarificationAnswerContent, parseAgentClarification, type AgentClarification, type AgentClarificationAnswer, type AgentClarificationOption } from '@/lib/agent-clarification';
import { IMAGE_GENERATION_STATUS_TEXTS, getGenerationMode, type GenerationMode } from '@/lib/image-generation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Copy, ThumbsUp, ThumbsDown, RefreshCcw,
  Bot, Check, ChevronDown, ChevronRight, BrainCircuit, ChevronLeft, Edit3, X, Cpu, Code2
} from 'lucide-react';
import toast from 'react-hot-toast';

type AttachedFile = {
  name: string;
  ext: string;
};

type SearchSource = {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
};

type MessageVersion = {
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  mcpNotice?: string;
  mcpUsage?: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources?: SearchSource[];
  clarification?: AgentClarification;
  clarificationAnswer?: AgentClarificationAnswer;
  versionIndex?: number;
  generationMode?: GenerationMode;
  [key: string]: unknown;
};

type ChatMessage = {
  id: string;
  role: string;
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  mcpNotice?: string;
  mcpUsage?: MCPUsageItem[];
  mcpContentOffset?: number;
  searchSources?: SearchSource[];
  clarification?: AgentClarification;
  clarificationAnswer?: AgentClarificationAnswer;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  chatIndex?: number;
  attachedFiles?: AttachedFile[];
  webSearchEnabled?: boolean;
  createdAt?: string;
  isStreaming?: boolean;
  isError?: boolean;
  isStopped?: boolean;
  generationMode?: GenerationMode;
  memoriesSaved?: boolean;
  memoriesSavedCount?: number;
  memoryProvider?: unknown;
  memoryModel?: unknown;
  [key: string]: unknown;
};

type ChatPayload = {
  messages?: ChatMessage[];
  pendingAttachedFiles?: AttachedFile[];
};

const normalizeVersions = (versions: MessageVersion[] = []) => versions.map((version, index) => ({
  ...version,
  versionIndex: typeof version?.versionIndex === 'number' ? version.versionIndex : index + 1
}));

const normalizeMessageForDisplay = (message: ChatMessage) => {
  const parsedMessage = parseAgentClarification(message.content || '');
  if (!Array.isArray(message.versions) || message.versions.length === 0) {
    return {
      ...message,
      content: parsedMessage.visibleContent,
      clarification: message.clarification || parsedMessage.clarification,
      isStreaming: false
    };
  }

  const versions = normalizeVersions(message.versions);
  const requestedIndex = typeof message.currentVersionIndex === 'number' && Number.isInteger(message.currentVersionIndex) ? message.currentVersionIndex : versions.length - 1;
  const currentVersionIndex = Math.min(Math.max(requestedIndex, 0), versions.length - 1);
  const currentVersion = versions[currentVersionIndex];
  const parsedVersion = parseAgentClarification(currentVersion?.content ?? message.content ?? '');

  return {
    ...message,
    versions,
    currentVersionIndex,
    content: parsedVersion.visibleContent,
    reasoning: currentVersion?.reasoning ?? message.reasoning,
    reasoningDuration: currentVersion?.reasoningDuration ?? message.reasoningDuration,
    mcpNotice: currentVersion?.mcpNotice ?? message.mcpNotice,
    mcpUsage: currentVersion?.mcpUsage ?? message.mcpUsage,
    mcpContentOffset: currentVersion?.mcpContentOffset ?? message.mcpContentOffset,
    searchSources: currentVersion?.searchSources ?? message.searchSources,
    clarification: currentVersion?.clarification ?? message.clarification ?? parsedVersion.clarification,
    clarificationAnswer: currentVersion?.clarificationAnswer ?? message.clarificationAnswer,
    generationMode: currentVersion?.generationMode ?? message.generationMode,
    isStreaming: false
  };
};

const mergeGenerationSnapshot = (items: ChatMessage[], snapshot: ChatGenerationSnapshot) => items.map(m => {
  if (m.id !== snapshot.assistantMsgId) return m;
  const parsedSnapshot = parseAgentClarification(snapshot.content);

  const updated = {
    ...m,
    content: parsedSnapshot.visibleContent,
    reasoning: snapshot.reasoning,
    reasoningDuration: snapshot.reasoningDuration,
    mcpNotice: snapshot.mcpNotice,
    mcpUsage: snapshot.mcpUsage,
    mcpContentOffset: snapshot.mcpContentOffset,
    searchSources: snapshot.searchSources,
    clarification: snapshot.clarification || parsedSnapshot.clarification,
    clarificationAnswer: m.clarificationAnswer,
    generationMode: snapshot.generationMode ?? m.generationMode,
    isStreaming: snapshot.isStreaming,
    isError: snapshot.isError === true,
    isStopped: snapshot.isStopped === true
  };

  if (updated.versions && updated.currentVersionIndex !== undefined) {
    updated.versions = normalizeVersions(updated.versions);
    updated.versions[updated.currentVersionIndex] = {
      ...updated.versions[updated.currentVersionIndex],
      content: parsedSnapshot.visibleContent,
      reasoning: snapshot.reasoning,
      reasoningDuration: snapshot.reasoningDuration,
      mcpNotice: snapshot.mcpNotice,
      mcpUsage: snapshot.mcpUsage,
      mcpContentOffset: snapshot.mcpContentOffset,
      searchSources: snapshot.searchSources,
      clarification: snapshot.clarification || parsedSnapshot.clarification,
      clarificationAnswer: updated.versions[updated.currentVersionIndex]?.clarificationAnswer,
      generationMode: snapshot.generationMode ?? updated.versions[updated.currentVersionIndex]?.generationMode
    };
  }

  return updated;
});

const mergeActiveGeneration = (chatId: string, items: ChatMessage[]) => {
  const snapshot = getChatGenerationState(chatId);
  return snapshot ? mergeGenerationSnapshot(items, snapshot) : items;
};

const getSelectedGenerationMode = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    const selected = JSON.parse(localStorage.getItem('selectedModelObj') || '{}') as { id?: string; name?: string };
    return getGenerationMode(selected.id || selected.name);
  } catch {
    return getGenerationMode(localStorage.getItem('selectedModel'));
  }
};

export default function ChatView({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerContentRef = useRef<HTMLDivElement>(null);
  const dotsContainerRef = useRef<HTMLDivElement>(null);
  const initialMsgProcessed = useRef(false);
  const messagesRef = useRef(messages);
  const sendMessageRef = useRef<((text: string, overrideFiles?: AttachedFile[], overrideWebSearch?: boolean) => void | Promise<void>) | null>(null);
  const [activeUserMsgId, setActiveUserMsgId] = useState<string | null>(null);
  const [activeMobileActionMsgId, setActiveMobileActionMsgId] = useState<string | null>(null);
  const [composerReserve, setComposerReserve] = useState(160);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await uploadFile(formData);
        if (res.success) {
          setAttachedFiles(prev => [...prev, { name: res.fileName!, ext: res.ext! }]);
          toast.success(`Attached ${res.fileName}`);
        } else {
          toast.error(res.error || 'Upload failed');
        }
      } catch {
        toast.error('Upload failed');
      }
    }

    setIsUploading(false);
  };
  useEffect(() => {
    if (initialMsgProcessed.current) {
      localStorage.setItem(`deepchat-draft-${chatId}`, input);
    }
  }, [input, chatId]);

  useEffect(() => {
    if (activeUserMsgId && dotsContainerRef.current) {
      const activeDot = dotsContainerRef.current.querySelector(`[data-dot-id="${activeUserMsgId}"]`);
      if (activeDot) {
        activeDot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeUserMsgId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const measureComposerReserve = () => {
      const scrollNode = scrollContainerRef.current;
      const composerNode = composerContentRef.current;
      if (!scrollNode || !composerNode) return;
      const scrollRect = scrollNode.getBoundingClientRect();
      const composerRect = composerNode.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      const nextReserve = Math.ceil(Math.max(isMobile ? 92 : 112, scrollRect.bottom - composerRect.top + (isMobile ? 8 : 12)));
      setComposerReserve(current => Math.abs(current - nextReserve) > 1 ? nextReserve : current);
    };

    measureComposerReserve();

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureComposerReserve) : null;
    if (resizeObserver) {
      if (composerContentRef.current) resizeObserver.observe(composerContentRef.current);
      if (scrollContainerRef.current) resizeObserver.observe(scrollContainerRef.current);
    }

    window.addEventListener('resize', measureComposerReserve);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureComposerReserve);
    };
  }, [attachedFiles.length, input, isLoading, messages]);

  useEffect(() => {
    let mounted = true;
    const loadChat = async () => {
      const chat = await getChat(chatId) as ChatPayload | null;
      const urlParams = new URLSearchParams(window.location.search);
      const initialMsg = urlParams.get('msg');
      const draftMsg = urlParams.get('draft');
      const initialWebSearch = urlParams.get('web') === '1';

      if (!mounted) return;

      if (chat?.pendingAttachedFiles && chat.pendingAttachedFiles.length > 0 && !initialMsgProcessed.current) {
        setAttachedFiles(chat.pendingAttachedFiles);
      }

      if (draftMsg && !initialMsgProcessed.current) {
        initialMsgProcessed.current = true;
        window.history.replaceState({}, '', `/chat/${chatId}`);
        setInput(draftMsg);

        if (chat && chat.messages) {
          setMessages(mergeActiveGeneration(chatId, chat.messages.map(normalizeMessageForDisplay)));
        }
      } else if (initialMsg !== null && !initialMsgProcessed.current) {
        initialMsgProcessed.current = true;
        window.history.replaceState({}, '', `/chat/${chatId}`);

        if (!chat || !chat.messages || chat.messages.length === 0) {
          setTimeout(() => {
            if (mounted) void sendMessageRef.current?.(initialMsg, chat?.pendingAttachedFiles, initialWebSearch);
          }, 0);
        } else {
          setMessages(mergeActiveGeneration(chatId, chat.messages.map(normalizeMessageForDisplay)));
        }
      } else {
        if (!initialMsgProcessed.current) {
          const savedDraft = localStorage.getItem(`deepchat-draft-${chatId}`);
          if (savedDraft) {
            setInput(savedDraft);
          }
          initialMsgProcessed.current = true;
        }
        if (chat && chat.messages) {
          if (chat.messages.length > 0) {
            setMessages(mergeActiveGeneration(chatId, chat.messages.map(normalizeMessageForDisplay)));
          }
        }
      }
    };

    loadChat();
    return () => { mounted = false; };
  }, [chatId]);

  useEffect(() => {
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace('msg-', '');
            setActiveUserMsgId(id);
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '-10% 0px -50% 0px',
        threshold: 0,
      }
    );

    const userNodes = document.querySelectorAll('.message-user');
    userNodes.forEach((node) => observerRef.current?.observe(node));

    return () => observerRef.current?.disconnect();
  }, [messages]);

  const applyGenerationSnapshot = useCallback((snapshot: ChatGenerationSnapshot) => {
    setMessages(prev => mergeGenerationSnapshot(prev, snapshot));
    setIsLoading(snapshot.isStreaming);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncId = window.setTimeout(() => {
      if (cancelled) return;
      const snapshot = getChatGenerationState(chatId);
      setIsLoading(snapshot?.isStreaming === true);
      if (snapshot) applyGenerationSnapshot(snapshot);
    }, 0);
    const unsubscribe = subscribeChatGeneration(chatId, applyGenerationSnapshot);
    return () => {
      cancelled = true;
      window.clearTimeout(syncId);
      unsubscribe();
    };
  }, [applyGenerationSnapshot, chatId]);

  useEffect(() => {
    let mounted = true;
    const reloadChatMessages = async (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (detail?.chatId && detail.chatId !== chatId) return;
      const chat = await getChat(chatId) as ChatPayload | null;
      if (!mounted || !chat?.messages) return;
      setMessages(mergeActiveGeneration(chatId, chat.messages.map(normalizeMessageForDisplay)));
    };

    window.addEventListener('chatUpdated', reloadChatMessages);
    return () => {
      mounted = false;
      window.removeEventListener('chatUpdated', reloadChatMessages);
    };
  }, [chatId]);

  const sendMessage = useCallback(async (text: string, overrideFiles?: AttachedFile[], overrideWebSearch?: boolean) => {
    const filesToUse = overrideFiles || attachedFiles;
    const useWebSearch = typeof overrideWebSearch === 'boolean' ? overrideWebSearch : webSearchEnabled;
    if ((!text.trim() && filesToUse.length === 0) || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      attachedFiles: filesToUse.length > 0 ? [...filesToUse] : undefined,
      webSearchEnabled: useWebSearch,
      createdAt: new Date().toISOString(),
      chatIndex: messagesRef.current.length
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const generationMode = getSelectedGenerationMode();
    const assistantMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      mcpUsage: [],
      mcpContentOffset: undefined,
      searchSources: [],
      clarification: undefined,
      createdAt: new Date().toISOString(),
      isStreaming: true,
      generationMode,
      chatIndex: messagesRef.current.length + 1
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setAttachedFiles([]);
    setWebSearchEnabled(false);
    localStorage.removeItem(`deepchat-draft-${chatId}`);

    await saveMessage(chatId, userMessage);
    await saveMessage(chatId, assistantMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));

    const currentMessages = await getChat(chatId).then(c => (c as ChatPayload | null)?.messages || []);
    const apiMessages = [...currentMessages.filter((m) => m.id !== assistantMsgId)];

    const snapshot = startChatGeneration(chatId, apiMessages, assistantMsgId);
    applyGenerationSnapshot(snapshot);
  }, [applyGenerationSnapshot, attachedFiles, chatId, isLoading, webSearchEnabled]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleRegenerate = async (msgId: string) => {
    if (isLoading) return;

    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex <= 0) return;

    const assistantMsg = messages[msgIndex];
    if (assistantMsg.role !== 'assistant') return;

    const apiMessages = messages.slice(0, msgIndex);

    const currentVersions = normalizeVersions(assistantMsg.versions || [{
      content: assistantMsg.content,
      reasoning: assistantMsg.reasoning,
      reasoningDuration: assistantMsg.reasoningDuration,
      mcpNotice: assistantMsg.mcpNotice,
      mcpUsage: assistantMsg.mcpUsage,
      mcpContentOffset: assistantMsg.mcpContentOffset,
      searchSources: assistantMsg.searchSources,
      clarification: assistantMsg.clarification,
      clarificationAnswer: assistantMsg.clarificationAnswer
    }]);

    const newVersionIndex = currentVersions.length;

    const updatedAssistantMessage = {
      ...assistantMsg,
      versions: [...currentVersions, { content: '', reasoning: '', versionIndex: newVersionIndex + 1 }],
      currentVersionIndex: newVersionIndex,
      content: '',
      reasoning: '',
      mcpNotice: undefined,
      mcpUsage: [],
      mcpContentOffset: undefined,
      searchSources: [],
      clarification: undefined,
      clarificationAnswer: undefined,
      reasoningDuration: undefined,
      isStreaming: true,
      isError: false,
      generationMode: getSelectedGenerationMode(),
      memoriesSaved: false,
      memoriesSavedCount: undefined,
      memoryProvider: undefined,
      memoryModel: undefined
    };

    setMessages(prev => prev.map(m => m.id === msgId ? updatedAssistantMessage : m));
    await saveMessage(chatId, updatedAssistantMessage);

    const snapshot = startChatGeneration(chatId, apiMessages, msgId);
    applyGenerationSnapshot(snapshot);
  };

  const handleStopGeneration = () => {
    if (stopChatGeneration(chatId)) {
      toast.success('Generation stopped.');
    }
  };

  const handleEditUserMessage = useCallback(async (msgId: string, content: string) => {
    if (isLoading) return false;
    const nextContent = content.trim();
    if (!nextContent) {
      toast.error('Message cannot be empty.');
      return false;
    }

    const currentMessages = messagesRef.current;
    const latestUserMessage = [...currentMessages].reverse().find(m => m.role === 'user');
    if (latestUserMessage?.id !== msgId) return false;

    const targetIndex = currentMessages.findIndex(m => m.id === msgId);
    const targetMessage = currentMessages[targetIndex];
    if (!targetMessage || targetMessage.role !== 'user') return false;

    const updatedUserMessage = {
      ...targetMessage,
      content: nextContent
    };
    const nextMessage = currentMessages[targetIndex + 1];
    const assistantMessage = nextMessage?.role === 'assistant'
      ? {
        ...nextMessage,
        content: '',
        reasoning: '',
        mcpNotice: undefined,
        mcpUsage: [],
        mcpContentOffset: undefined,
        searchSources: [],
        clarification: undefined,
        clarificationAnswer: undefined,
        reasoningDuration: undefined,
        versions: undefined,
        currentVersionIndex: undefined,
        isStreaming: true,
        isError: false,
        isStopped: false,
        generationMode: getSelectedGenerationMode(),
        memoriesSaved: false,
        memoriesSavedCount: undefined,
        memoryProvider: undefined,
        memoryModel: undefined
      }
      : {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        reasoning: '',
        mcpUsage: [],
        mcpContentOffset: undefined,
        searchSources: [],
        clarification: undefined,
        clarificationAnswer: undefined,
        createdAt: new Date().toISOString(),
        isStreaming: true,
        generationMode: getSelectedGenerationMode(),
        chatIndex: targetIndex + 1
      };
    const nextMessages = [
      ...currentMessages.slice(0, targetIndex),
      updatedUserMessage,
      assistantMessage
    ];

    setMessages(nextMessages);
    await saveMessage(chatId, updatedUserMessage);
    await saveMessage(chatId, assistantMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));

    const snapshot = startChatGeneration(chatId, nextMessages.slice(0, targetIndex + 1), assistantMessage.id);
    applyGenerationSnapshot(snapshot);
    return true;
  }, [applyGenerationSnapshot, chatId, isLoading]);

  const switchVersion = async (msgId: string, delta: number) => {
    if (isLoading) return;

    const targetMessage = messagesRef.current.find(m => m.id === msgId);
    if (!targetMessage?.versions) return;

    const versions = normalizeVersions(targetMessage.versions);
    let newIdx = (targetMessage.currentVersionIndex || 0) + delta;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= versions.length) newIdx = versions.length - 1;

    const version = versions[newIdx];
    const updatedMessage = {
      ...targetMessage,
      versions,
      currentVersionIndex: newIdx,
      content: version.content,
      reasoning: version.reasoning,
      reasoningDuration: version.reasoningDuration,
      mcpNotice: version.mcpNotice,
      mcpUsage: version.mcpUsage,
      mcpContentOffset: version.mcpContentOffset,
      searchSources: version.searchSources,
      clarification: version.clarification,
      clarificationAnswer: version.clarificationAnswer,
      generationMode: version.generationMode,
      isError: false
    };

    setMessages(prev => prev.map(m => m.id === msgId ? updatedMessage : m));
    await saveMessage(chatId, updatedMessage);
  };

  const handleClarificationAnswer = useCallback(async (msgId: string, option: AgentClarificationOption, customValue?: string) => {
    if (isLoading) return false;
    const currentMessages = messagesRef.current;
    const msgIndex = currentMessages.findIndex(m => m.id === msgId);
    const assistantMsg = currentMessages[msgIndex];
    if (!assistantMsg || assistantMsg.role !== 'assistant' || !assistantMsg.clarification) return false;

    const answerValue = option.shortcut === '4' ? (customValue || '').trim() : option.value;
    if (!answerValue) {
      toast.error('Type your answer first.');
      return false;
    }

    const answer: AgentClarificationAnswer = {
      shortcut: option.shortcut,
      question: assistantMsg.clarification.question,
      label: option.shortcut === '4' ? answerValue : option.label,
      value: answerValue
    };
    const continuationPrompt = formatClarificationAnswer(assistantMsg.clarification, option, answerValue);
    const versions = assistantMsg.versions ? normalizeVersions(assistantMsg.versions) : undefined;
    const currentVersionIndex = versions ? Math.min(Math.max(typeof assistantMsg.currentVersionIndex === 'number' ? assistantMsg.currentVersionIndex : versions.length - 1, 0), versions.length - 1) : undefined;
    if (versions && currentVersionIndex !== undefined && versions[currentVersionIndex]) {
      versions[currentVersionIndex] = {
        ...versions[currentVersionIndex],
        clarification: undefined,
        clarificationAnswer: answer
      };
    }

    const updatedAssistantMessage = {
      ...assistantMsg,
      content: '',
      reasoning: '',
      mcpNotice: undefined,
      mcpUsage: [],
      mcpContentOffset: undefined,
      searchSources: [],
      clarification: undefined,
      clarificationAnswer: answer,
      versions,
      currentVersionIndex,
      reasoningDuration: undefined,
      isStreaming: true,
      isError: false,
      isStopped: false,
      memoriesSaved: false,
      memoriesSavedCount: undefined,
      memoryProvider: undefined,
      memoryModel: undefined
    };
    const nextMessages = currentMessages.map(m => m.id === msgId ? updatedAssistantMessage : m);

    setMessages(nextMessages);
    setInput('');
    await saveMessage(chatId, updatedAssistantMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));

    const apiMessages = [
      ...nextMessages.slice(0, msgIndex),
      {
        id: `clarification-${Date.now()}`,
        role: 'user',
        content: continuationPrompt
      }
    ];
    const snapshot = startChatGeneration(chatId, apiMessages, msgId);
    applyGenerationSnapshot(snapshot);
    return true;
  }, [applyGenerationSnapshot, chatId, isLoading]);

  const displayMessages = messages.filter(m => !(m.role === 'user' && isGeneratedClarificationAnswerContent(m.content)));
  const userMessages = displayMessages.filter(m => m.role === 'user');
  const latestUserMessageId = userMessages[userMessages.length - 1]?.id;
  const showCustomScrollbar = userMessages.length >= 3;
  const activeClarificationMessage = [...messages].reverse().find(m => m.role === 'assistant' && m.clarification && !m.clarificationAnswer && !m.isStreaming);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto px-3 py-4 sm:p-6 ${showCustomScrollbar ? '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]' : 'custom-scrollbar'}`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6" style={{ paddingBottom: composerReserve }}>
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full mt-20 text-center opacity-50">
              <Bot className="w-16 h-16 mb-4 text-slate-400" />
              <h3 className="text-xl font-bold text-slate-600">Start a conversation</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-sm">Type a message below to begin chatting with the AI.</p>
            </div>
          )}

          {displayMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onRegenerate={() => handleRegenerate(msg.id)}
              onSwitchVersion={(delta) => switchVersion(msg.id, delta)}
              canEditUserMessage={msg.role === 'user' && msg.id === latestUserMessageId}
              onEditUserMessage={(content) => handleEditUserMessage(msg.id, content)}
              isMobileActionsOpen={activeMobileActionMsgId === msg.id}
              onActivateMobileActions={() => setActiveMobileActionMsgId(msg.id)}
            />
          ))}

        </div>
      </div>

      {showCustomScrollbar && (
        <div className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 sm:flex">
          <div className="rounded-full border border-slate-200/60 bg-slate-200/30 px-2 py-4 shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-200/50 dark:border-slate-700/70 dark:bg-slate-950/80 dark:shadow-black/30 dark:hover:bg-slate-900/90">
            <div
              ref={dotsContainerRef}
              className="flex flex-col items-center gap-3 overflow-y-auto max-h-[100px] scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full"
            >
              {userMessages.map((m, idx) => {
                const isActive = activeUserMsgId === m.id;
                return (
                  <button
                    key={m.id}
                    data-dot-id={m.id}
                    title={`Jump to User Message ${idx + 1}`}
                    onClick={() => document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className={`shrink-0 rounded-full transition-all shadow-sm duration-300 ${isActive
                      ? 'w-3 h-3 bg-indigo-500 ring-2 ring-indigo-400/30 scale-110'
                      : 'w-2 h-2 bg-slate-400 hover:bg-indigo-400 hover:scale-125 dark:bg-slate-600 dark:hover:bg-indigo-400'
                      }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="deepchat-composer-dock pointer-events-none absolute bottom-0 left-0 z-20 flex w-full flex-col items-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 sm:p-6">
        <div ref={composerContentRef} className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2">
          {activeClarificationMessage?.clarification ? (
            <ClarificationDock
              clarification={activeClarificationMessage.clarification}
              isBusy={isLoading}
              onSelect={(option, customValue) => handleClarificationAnswer(activeClarificationMessage.id, option, customValue)}
            />
          ) : (
            <ChatComposer
              value={input}
              attachedFiles={attachedFiles}
              isUploading={isUploading}
              isBusy={isLoading}
              webSearchEnabled={webSearchEnabled}
              maxTextareaHeight={256}
              onChange={setInput}
              onSubmit={(value) => sendMessage(value)}
              onStop={handleStopGeneration}
              onToggleWebSearch={setWebSearchEnabled}
              onFilesUpload={handleFilesUpload}
              onAttachRecentFile={(file) => setAttachedFiles(prev => prev.some(item => item.name === file.name && item.ext === file.ext) ? prev : [...prev, file])}
              onRemoveFile={(index) => setAttachedFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
            />
          )}
          <div className="mt-3 hidden text-center sm:block">
            <p className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-slate-400 dark:bg-slate-950/70 dark:text-slate-500 dark:ring-1 dark:ring-slate-800/80">DeepChat can make mistakes. Consider verifying important information.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReasoningSection({ content, isStreaming = false, duration }: { content: string, isStreaming?: boolean, duration?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof window.setInterval> | undefined;
    if (isStreaming) {
      interval = setInterval(() => {
        setLiveSeconds(s => s + 1);
      }, 1000);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [isStreaming]);

  const displayDuration = duration !== undefined ? duration : liveSeconds;
  let title = isStreaming ? `Thinking${liveSeconds > 0 ? ` (${liveSeconds}s)` : '...'}` : 'Reasoning';
  if (!isStreaming) {
    if (displayDuration < 5) {
      title = 'Thought for a few seconds';
    } else {
      title = `Thought for ${displayDuration} seconds`;
    }
  }

  return (
    <div className="mb-3 max-w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors mb-1.5"
      >
        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
          <BrainCircuit className={`w-3.5 h-3.5 ${isStreaming ? 'animate-pulse text-indigo-500' : ''}`} />
        </div>
        <span>{title}</span>
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {isExpanded && (
        <div className="pl-4 border-l-2 border-slate-100 ml-3 py-1 italic text-slate-500 text-sm whitespace-pre-wrap leading-relaxed animate-in fade-in slide-in-from-left-1 duration-300">
          {content}
        </div>
      )}
    </div>
  );
}

function MCPUsageSection({ notice, usage = [] }: { notice?: string, usage?: MCPUsageItem[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!notice && usage.length === 0) return null;
  if (usage.length === 1 && usage[0].id === 'code-execution') {
    return <CodeExecutionUsageSection usage={usage[0]} />;
  }

  const names = usage.map(item => item.name).join(', ');
  const hasRunning = usage.some(item => item.status === 'running');
  const hasError = usage.some(item => item.status === 'error');
  const title = names ? `Using MCP ${names}` : 'Using MCP';

  return (
    <div className="mb-3 max-w-full">
      {notice && (
        <div className="mb-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
          {notice}
        </div>
      )}
      {usage.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/70 shadow-sm">
          <button
            type="button"
            onClick={() => setIsExpanded(open => !open)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                <Cpu className={`h-4 w-4 ${hasRunning ? 'animate-pulse' : ''}`} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold text-slate-800">{title}</span>
                <span className={`mt-0.5 block text-xs font-bold ${hasError ? 'text-red-500' : hasRunning ? 'text-indigo-500' : 'text-emerald-600'}`}>
                  {hasError ? 'Needs attention' : hasRunning ? 'Working' : 'Completed'}
                </span>
              </span>
            </span>
            {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-indigo-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-indigo-500" />}
          </button>
          {isExpanded && (
            <div className="space-y-3 border-t border-indigo-100 bg-white px-4 py-3">
              {usage.map(item => (
                <div key={item.id}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-xs font-extrabold text-slate-700">{item.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${item.status === 'error' ? 'bg-red-50 text-red-500' : item.status === 'running' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-600'}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.details && (
                    <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 custom-scrollbar">{item.details}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClarificationDock({ clarification, isBusy, onSelect }: { clarification: AgentClarification, isBusy?: boolean, onSelect: (option: AgentClarificationOption, customValue?: string) => Promise<boolean> | boolean }) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const customOption = clarification.options.find(option => option.shortcut === '4');
  const submitCustom = async () => {
    if (!customOption) return;
    const sent = await onSelect(customOption, customValue);
    if (sent) {
      setCustomValue('');
      setIsCustomOpen(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/60">
      <p className="px-2 pb-3 text-center text-sm font-extrabold leading-relaxed text-slate-800">{clarification.question}</p>
      {isCustomOpen ? (
        <div className="space-y-2">
          <textarea
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsCustomOpen(false);
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submitCustom();
            }}
            rows={3}
            autoFocus
            placeholder="Type your own answer..."
            className="max-h-40 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCustomOpen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              disabled={isBusy || !customValue.trim()}
              onClick={() => void submitCustom()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Check className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {clarification.options.map(option => (
            <button
              key={option.shortcut}
              type="button"
              disabled={isBusy}
              onClick={() => option.shortcut === '4' ? setIsCustomOpen(true) : void onSelect(option)}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${option.tone === 'muted' ? 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100' : 'border-indigo-100 bg-indigo-50/80 text-slate-800 hover:border-indigo-200 hover:bg-indigo-100/80'}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${option.tone === 'muted' ? 'bg-white text-slate-500' : 'bg-white text-indigo-600'}`}>
                {option.shortcut}
              </span>
              <span className="min-w-0 text-sm font-extrabold leading-snug">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClarificationAnswerBadge({ answer }: { answer: AgentClarificationAnswer }) {
  return (
    <div className="mb-3 max-w-full rounded-2xl rounded-tl-sm border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-slate-800 shadow-sm">
      {answer.question && (
        <p className="mb-2 text-xs font-bold leading-relaxed text-slate-500">{answer.question}</p>
      )}
      <div className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-indigo-700">
        <Check className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">Answer {answer.shortcut}: {answer.label}</span>
      </div>
    </div>
  );
}

function CodeExecutionUsageSection({ usage }: { usage: MCPUsageItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = usage.status === 'running';
  const isError = usage.status === 'error';
  if (usage.status === 'completed') return null;
  const details = getCodeExecutionDisplayDetails(usage);
  const title = isError ? 'Code execution error' : 'Analyzing';

  return (
    <div className="mb-3 ml-1 max-w-full">
      <button
        type="button"
        onClick={() => setIsExpanded(open => !open)}
        className={`inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-sm font-semibold transition-colors ${isError ? 'text-red-400 hover:text-red-500' : 'deepchat-subtle-analyzing text-slate-400 hover:text-slate-500'}`}
      >
        {isError && <Code2 className="h-3.5 w-3.5" />}
        <span>{title}</span>
        {isRunning && <span className="deepchat-subtle-analyzing-dot" />}
        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {isExpanded && (
        <div className="deepchat-analysis-dropdown mt-2 max-w-xl rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-500 shadow-sm">
          {details.map((item) => (
            <div key={item} className="flex gap-2 py-0.5">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${isError ? 'bg-red-300' : 'bg-slate-300'}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getCodeExecutionDisplayDetails(usage: MCPUsageItem) {
  const fallback = usage.status === 'error'
    ? ['The analysis runner could not finish. Technical details are available from the analysis button.']
    : ['Preparing the analysis.'];
  if (!usage.details) return fallback;
  try {
    const parsed = JSON.parse(usage.details) as unknown;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const value = parsed as Record<string, unknown>;
    const stdout = typeof value.stdout === 'string' ? value.stdout : '';
    const stderr = typeof value.stderr === 'string' ? value.stderr : '';
    if (usage.status === 'error') return fallback;
    if (/Running Excel engine/i.test(stdout)) return ['Running the Excel engine.', 'Building sheets, formulas, styles, and preview values.'];
    if (/workbook|spreadsheet|excel/i.test(stdout)) return ['Preparing the spreadsheet workbook.'];
    if (/Retrying Python analysis/i.test(stdout) || stderr.trim()) return ['Repairing the generated analysis and trying again.'];
    if (/Running Python analysis/i.test(stdout)) return ['Running calculations in the isolated Python workspace.', 'The first run can take longer while the local runtime warms up.'];
    if (/Asking the model/i.test(stdout)) return ['Planning the analysis and preparing the code.'];
    if (/completed/i.test(stdout)) return ['Analysis completed.'];
    return fallback;
  } catch {
    return fallback;
  }
}

type MessageBubbleProps = {
  message: ChatMessage;
  onRegenerate?: () => void;
  onSwitchVersion?: (delta: number) => void;
  canEditUserMessage?: boolean;
  onEditUserMessage?: (content: string) => Promise<boolean>;
  isMobileActionsOpen?: boolean;
  onActivateMobileActions?: () => void;
};

function MemorySavedBadge({ memoryKey }: { memoryKey: string }) {
  return <MemorySavedBadgeContent key={memoryKey} />;
}

function MemorySavedBadgeContent() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const hideTimer = window.setTimeout(() => setVisible(false), 3600);
    const unmountTimer = window.setTimeout(() => setMounted(false), 3920);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`mt-2 ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 shadow-sm transition-all duration-300 ease-out will-change-transform ${visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-1 opacity-0 scale-95'}`}
    >
      <Check className="h-3.5 w-3.5" />
      Memories saved.
    </div>
  );
}

function ImageGenerationLoader() {
  const [textIndex, setTextIndex] = useState(0);
  const dotRows = 13;
  const dotCols = 13;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTextIndex(index => (index + 1) % IMAGE_GENERATION_STATUS_TEXTS.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="deepchat-image-loader relative aspect-square w-[min(74vw,320px)] overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/55">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: dotRows * dotCols }).map((_, index) => {
          const row = Math.floor(index / dotCols);
          const col = index % dotCols;
          const diagonalDelay = ((dotRows - 1 - row) + (dotCols - 1 - col)) * 0.075;
          const cx = 8 + col * 7;
          const cy = 8 + row * 7;
          return (
            <motion.circle
              key={index}
              cx={cx}
              cy={cy}
              fill="rgb(148 163 184)"
              animate={{
                r: [0.42, 0.42, 0.98, 0.42, 0.42],
                opacity: [0.22, 0.22, 0.68, 0.22, 0.22],
                filter: [
                  'drop-shadow(0 0 0 rgba(148, 163, 184, 0))',
                  'drop-shadow(0 0 0 rgba(148, 163, 184, 0))',
                  'drop-shadow(0 0 7px rgba(148, 163, 184, 0.42))',
                  'drop-shadow(0 0 0 rgba(148, 163, 184, 0))',
                  'drop-shadow(0 0 0 rgba(148, 163, 184, 0))'
                ]
              }}
              transition={{
                duration: 5.8,
                ease: 'easeInOut',
                repeat: Infinity,
                delay: diagonalDelay,
                times: [0, 0.42, 0.5, 0.58, 1]
              }}
            />
          );
        })}
      </svg>
      <div className="relative z-10 flex h-full flex-col items-start justify-start">
        <div className="relative h-8 w-full max-w-[230px]">
          <AnimatePresence mode="wait">
            <motion.p
              key={textIndex}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 top-0 text-left text-sm font-bold leading-snug text-slate-500"
            >
              {IMAGE_GENERATION_STATUS_TEXTS[textIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function MessageActionButton({ label, tooltip = label, disabled, className, onClick, children }: { label: string; tooltip?: string; disabled?: boolean; className: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={tooltip}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={className}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const MessageBubble = React.memo(function MessageBubble({ message, onRegenerate, onSwitchVersion, canEditUserMessage = false, onEditUserMessage, isMobileActionsOpen = false, onActivateMobileActions }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isEditingUserMessage, setIsEditingUserMessage] = useState(false);
  const [userDraft, setUserDraft] = useState(message.content || '');
  const userEditRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditingUserMessage) return;
    const node = userEditRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [isEditingUserMessage]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard!');
  };

  const startUserEdit = () => {
    setUserDraft(message.content || '');
    setIsEditingUserMessage(true);
  };

  const cancelUserEdit = () => {
    setUserDraft(message.content || '');
    setIsEditingUserMessage(false);
  };

  const saveUserEdit = async () => {
    if (!onEditUserMessage) return;
    const saved = await onEditUserMessage(userDraft);
    if (saved) setIsEditingUserMessage(false);
  };

  const hasVersions = message.versions && message.versions.length > 1;
  const totalVersions = message.versions?.length || 1;
  const currentIdx = Math.min(Math.max(message.currentVersionIndex || 0, 0), totalVersions - 1);
  const visibleMCPUsage = message.isStopped ? (message.mcpUsage || []).filter(item => !(item.id === 'code-execution' && item.status === 'running')) : (message.mcpUsage || []);
  const hasMCPUsage = !isUser && visibleMCPUsage.length > 0;
  const hasActiveCodeExecution = !isUser && message.isStreaming === true && Boolean(visibleMCPUsage.some(item => item.id === 'code-execution' && item.status === 'running'));
  const mcpOffset = typeof message.mcpContentOffset === 'number' ? Math.min(Math.max(message.mcpContentOffset, 0), (message.content || '').length) : undefined;
  const preMCPContent = hasMCPUsage && mcpOffset !== undefined ? (message.content || '').slice(0, mcpOffset).trim() : '';
  const postMCPContent = hasMCPUsage && mcpOffset !== undefined ? (message.content || '').slice(mcpOffset).trim() : '';
  const standardContent = hasMCPUsage && mcpOffset !== undefined ? '' : message.content;

  return (
    <div
      id={`msg-${message.id}`}
      onClick={onActivateMobileActions}
      className={`group/message flex w-full items-start ${isUser ? 'justify-end message-user' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
    >
      <div className={`flex min-w-0 flex-col ${isUser ? 'max-w-[92%] items-end sm:max-w-[75%]' : 'w-full max-w-3xl items-start'}`}>
        {!isUser && message.reasoning && (
          <ReasoningSection content={message.reasoning} isStreaming={message.isStreaming && !message.content} duration={message.reasoningDuration} />
        )}

        {!isUser && message.clarificationAnswer && (
          <ClarificationAnswerBadge answer={message.clarificationAnswer} />
        )}

        {!isUser && preMCPContent && (
          <div className="mb-2 max-w-full px-1 py-1 text-slate-800">
            <MarkdownRenderer content={preMCPContent} isStreaming={message.isStreaming && !postMCPContent} searchSources={message.searchSources} />
          </div>
        )}

        {!isUser && hasMCPUsage && (
          <MCPUsageSection notice={message.mcpNotice} usage={visibleMCPUsage} />
        )}

        {isUser && message.attachedFiles && message.attachedFiles.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 mb-2">
            {message.attachedFiles.map((file, idx: number) => (
              <div key={idx} className="flex items-center gap-2 p-1.5 pr-2.5 bg-indigo-50 border border-indigo-100 rounded-xl shadow-sm max-w-[200px]">
                <div className="w-8 h-8 shrink-0 bg-white border border-indigo-100 shadow-sm flex items-center justify-center rounded-lg">
                  {getComposerFileIcon(file.ext, "w-4 h-4 text-indigo-600")}
                </div>
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="text-[11px] font-bold text-indigo-900 truncate block w-full">{file.name}</span>
                  <span className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wider">{file.ext}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {(standardContent || postMCPContent) ? (
          <div className={`max-w-full ${isUser
            ? 'rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-white shadow-sm sm:rounded-3xl sm:px-5 sm:py-3'
            : message.isError
              ? 'px-1 py-1 text-red-600'
              : 'px-1 py-0 text-slate-800'
            }`}>
            {isUser && isEditingUserMessage ? (
              <div className="w-[min(72vw,520px)]">
                <textarea
                  ref={userEditRef}
                  value={userDraft}
                  onChange={(event) => setUserDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') cancelUserEdit();
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void saveUserEdit();
                  }}
                  rows={Math.min(8, Math.max(3, userDraft.split('\n').length))}
                  className="w-full resize-none rounded-2xl border border-white/25 bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-950 shadow-inner outline-none transition focus:border-white focus:ring-2 focus:ring-white/60"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelUserEdit}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveUserEdit()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save
                  </button>
                </div>
              </div>
            ) : isUser ? (
              <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {message.content}
              </div>
            ) : (
              <MarkdownRenderer content={postMCPContent || standardContent || ''} isStreaming={message.isStreaming} searchSources={message.searchSources} />
            )}
          </div>
        ) : message.isStreaming && !message.reasoning && !hasActiveCodeExecution && message.generationMode === 'image' ? (
          <ImageGenerationLoader />
        ) : message.isStreaming && !message.reasoning && !hasActiveCodeExecution && (
          <div className="flex min-h-8 w-fit items-center px-1 py-2">
            <div className="flex space-x-1.5">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}

        {!isUser && !message.isStreaming && message.memoriesSaved && (
          <MemorySavedBadge memoryKey={`${message.id}-${message.memoriesSavedCount || 1}`} />
        )}

        {isUser && !isEditingUserMessage && (
          <div className={`mt-0 flex h-7 max-w-full flex-wrap items-center justify-end gap-1 transition-opacity duration-200 sm:gap-1.5 sm:pointer-events-none sm:opacity-0 sm:group-hover/message:pointer-events-auto sm:group-hover/message:opacity-100 sm:group-focus-within/message:pointer-events-auto sm:group-focus-within/message:opacity-100 ${isMobileActionsOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
            <MessageActionButton
              label={copied ? 'Copied' : 'Copy message'}
              tooltip={copied ? 'Copied' : 'Copy message'}
              onClick={handleCopy}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2.35} />}
            </MessageActionButton>
            {canEditUserMessage && (
              <MessageActionButton
                label="Edit message"
                tooltip="Edit message"
                onClick={startUserEdit}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              >
                <Edit3 className="h-4 w-4" strokeWidth={2.35} />
              </MessageActionButton>
            )}
          </div>
        )}

        {!isUser && !message.isStreaming && (
          <div className={`mt-0 ml-1 flex h-7 max-w-full flex-wrap items-center gap-1 transition-opacity duration-200 sm:gap-1.5 sm:pointer-events-none sm:opacity-0 sm:group-hover/message:pointer-events-auto sm:group-hover/message:opacity-100 sm:group-focus-within/message:pointer-events-auto sm:group-focus-within/message:opacity-100 ${isMobileActionsOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
            {hasVersions && (
              <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg px-1.5 py-1 mr-2 border border-slate-200/60">
                <MessageActionButton
                  label="Previous response version"
                  tooltip="Previous version"
                  onClick={() => onSwitchVersion && onSwitchVersion(-1)}
                  disabled={currentIdx === 0}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.35} />
                </MessageActionButton>
                <span className="text-[11px] font-bold text-slate-500 w-7 text-center">
                  {currentIdx + 1} / {totalVersions}
                </span>
                <MessageActionButton
                  label="Next response version"
                  tooltip="Next version"
                  onClick={() => onSwitchVersion && onSwitchVersion(1)}
                  disabled={currentIdx === totalVersions - 1}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={2.35} />
                </MessageActionButton>
              </div>
            )}

            <MessageActionButton
              label={copied ? 'Copied' : 'Copy response'}
              tooltip={copied ? 'Copied' : 'Copy response'}
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.5} /> : <Copy className="w-4 h-4" strokeWidth={2.35} />}
            </MessageActionButton>
            <MessageActionButton
              label="Like response"
              tooltip="Like response"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            >
              <ThumbsUp className="w-4 h-4" strokeWidth={2.35} />
            </MessageActionButton>
            <MessageActionButton
              label="Dislike response"
              tooltip="Dislike response"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <ThumbsDown className="w-4 h-4" strokeWidth={2.35} />
            </MessageActionButton>
            {onRegenerate && (
              <MessageActionButton
                label="Regenerate response"
                tooltip="Regenerate response"
                onClick={onRegenerate}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              >
                <RefreshCcw className="w-4 h-4" strokeWidth={2.35} />
              </MessageActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.message === next.message && prev.canEditUserMessage === next.canEditUserMessage && prev.onEditUserMessage === next.onEditUserMessage && prev.isMobileActionsOpen === next.isMobileActionsOpen);
