'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { getChat, saveMessage, uploadFile, getUserProfile } from '@/app/actions';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import ChatComposer, { getComposerFileIcon } from '@/components/ui/ChatComposer';
import {
  ChatGenerationSnapshot,
  getChatGenerationState,
  startChatGeneration,
  stopChatGeneration,
  subscribeChatGeneration
} from '@/lib/chat-generation';
import {
  Copy, ThumbsUp, ThumbsDown, RefreshCcw,
  Bot, Check, ChevronDown, ChevronRight, BrainCircuit, ChevronLeft, Edit3, X
} from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_USER_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';

type UserProfile = {
  name?: string;
  avatar?: string;
};

type AttachedFile = {
  name: string;
  ext: string;
};

type MessageVersion = {
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  versionIndex?: number;
  [key: string]: unknown;
};

type ChatMessage = {
  id: string;
  role: string;
  content?: string;
  reasoning?: string;
  reasoningDuration?: number;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  chatIndex?: number;
  attachedFiles?: AttachedFile[];
  createdAt?: string;
  isStreaming?: boolean;
  isError?: boolean;
  isStopped?: boolean;
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
  if (!Array.isArray(message.versions) || message.versions.length === 0) {
    return { ...message, isStreaming: false };
  }

  const versions = normalizeVersions(message.versions);
  const requestedIndex = typeof message.currentVersionIndex === 'number' && Number.isInteger(message.currentVersionIndex) ? message.currentVersionIndex : versions.length - 1;
  const currentVersionIndex = Math.min(Math.max(requestedIndex, 0), versions.length - 1);
  const currentVersion = versions[currentVersionIndex];

  return {
    ...message,
    versions,
    currentVersionIndex,
    content: currentVersion?.content ?? message.content,
    reasoning: currentVersion?.reasoning ?? message.reasoning,
    reasoningDuration: currentVersion?.reasoningDuration ?? message.reasoningDuration,
    isStreaming: false
  };
};

const mergeGenerationSnapshot = (items: ChatMessage[], snapshot: ChatGenerationSnapshot) => items.map(m => {
  if (m.id !== snapshot.assistantMsgId) return m;

  const updated = {
    ...m,
    content: snapshot.content,
    reasoning: snapshot.reasoning,
    reasoningDuration: snapshot.reasoningDuration,
    isStreaming: snapshot.isStreaming,
    isError: snapshot.isError === true,
    isStopped: snapshot.isStopped === true
  };

  if (updated.versions && updated.currentVersionIndex !== undefined) {
    updated.versions = normalizeVersions(updated.versions);
    updated.versions[updated.currentVersionIndex] = {
      ...updated.versions[updated.currentVersionIndex],
      content: snapshot.content,
      reasoning: snapshot.reasoning,
      reasoningDuration: snapshot.reasoningDuration
    };
  }

  return updated;
});

const mergeActiveGeneration = (chatId: string, items: ChatMessage[]) => {
  const snapshot = getChatGenerationState(chatId);
  return snapshot ? mergeGenerationSnapshot(items, snapshot) : items;
};

export default function ChatView({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Guest', avatar: DEFAULT_USER_AVATAR });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dotsContainerRef = useRef<HTMLDivElement>(null);
  const initialMsgProcessed = useRef(false);
  const messagesRef = useRef(messages);
  const sendMessageRef = useRef<((text: string, overrideFiles?: AttachedFile[]) => void | Promise<void>) | null>(null);
  const [activeUserMsgId, setActiveUserMsgId] = useState<string | null>(null);
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
    let mounted = true;
    const loadProfile = async () => {
      const savedProfile = await getUserProfile() as UserProfile;
      if (!mounted) return;
      setUserProfile({
        name: savedProfile?.name || 'Guest',
        avatar: savedProfile?.avatar || DEFAULT_USER_AVATAR
      });
    };

    void loadProfile();
    window.addEventListener('profileUpdated', loadProfile);
    return () => {
      mounted = false;
      window.removeEventListener('profileUpdated', loadProfile);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadChat = async () => {
      const chat = await getChat(chatId) as ChatPayload | null;
      const urlParams = new URLSearchParams(window.location.search);
      const initialMsg = urlParams.get('msg');
      const draftMsg = urlParams.get('draft');

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
            if (mounted) void sendMessageRef.current?.(initialMsg, chat?.pendingAttachedFiles);
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

  const sendMessage = useCallback(async (text: string, overrideFiles?: AttachedFile[]) => {
    const filesToUse = overrideFiles || attachedFiles;
    if ((!text.trim() && filesToUse.length === 0) || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      attachedFiles: filesToUse.length > 0 ? [...filesToUse] : undefined,
      createdAt: new Date().toISOString(),
      chatIndex: messagesRef.current.length
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      chatIndex: messagesRef.current.length + 1
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setAttachedFiles([]);
    localStorage.removeItem(`deepchat-draft-${chatId}`);

    await saveMessage(chatId, userMessage);
    await saveMessage(chatId, assistantMessage);
    window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId } }));

    const currentMessages = await getChat(chatId).then(c => (c as ChatPayload | null)?.messages || []);
    const apiMessages = [...currentMessages.filter((m) => m.id !== assistantMsgId)];

    const snapshot = startChatGeneration(chatId, apiMessages, assistantMsgId);
    applyGenerationSnapshot(snapshot);
  }, [applyGenerationSnapshot, attachedFiles, chatId, isLoading]);

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
      reasoningDuration: assistantMsg.reasoningDuration
    }]);

    const newVersionIndex = currentVersions.length;

    const updatedAssistantMessage = {
      ...assistantMsg,
      versions: [...currentVersions, { content: '', reasoning: '', versionIndex: newVersionIndex + 1 }],
      currentVersionIndex: newVersionIndex,
      content: '',
      reasoning: '',
      reasoningDuration: undefined,
      isStreaming: true,
      isError: false,
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
        reasoningDuration: undefined,
        versions: undefined,
        currentVersionIndex: undefined,
        isStreaming: true,
        isError: false,
        isStopped: false,
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
        createdAt: new Date().toISOString(),
        isStreaming: true,
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
      isError: false
    };

    setMessages(prev => prev.map(m => m.id === msgId ? updatedMessage : m));
    await saveMessage(chatId, updatedMessage);
  };

  const userMessages = messages.filter(m => m.role === 'user');
  const latestUserMessageId = userMessages[userMessages.length - 1]?.id;
  const showCustomScrollbar = userMessages.length >= 3;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto px-3 py-4 sm:p-6 ${showCustomScrollbar ? '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]' : 'custom-scrollbar'}`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-44 sm:gap-6 sm:pb-52">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full mt-20 text-center opacity-50">
              <Bot className="w-16 h-16 mb-4 text-slate-400" />
              <h3 className="text-xl font-bold text-slate-600">Start a conversation</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-sm">Type a message below to begin chatting with the AI.</p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              userAvatar={userProfile.avatar}
              userName={userProfile.name}
              onRegenerate={() => handleRegenerate(msg.id)}
              onSwitchVersion={(delta) => switchVersion(msg.id, delta)}
              canEditUserMessage={msg.role === 'user' && msg.id === latestUserMessageId}
              onEditUserMessage={(content) => handleEditUserMessage(msg.id, content)}
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

      <div className="deepchat-composer-dock pointer-events-none absolute bottom-0 left-0 z-20 flex w-full flex-col items-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-12 sm:p-6">
        <div className="pointer-events-auto w-full max-w-4xl flex flex-col gap-2">
          <ChatComposer
            value={input}
            attachedFiles={attachedFiles}
            isUploading={isUploading}
            isBusy={isLoading}
            maxTextareaHeight={256}
            onChange={setInput}
            onSubmit={(value) => sendMessage(value)}
            onStop={handleStopGeneration}
            onFilesUpload={handleFilesUpload}
            onRemoveFile={(index) => setAttachedFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
          />
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

type MessageBubbleProps = {
  message: ChatMessage;
  userAvatar?: string;
  userName?: string;
  onRegenerate?: () => void;
  onSwitchVersion?: (delta: number) => void;
  canEditUserMessage?: boolean;
  onEditUserMessage?: (content: string) => Promise<boolean>;
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

const MessageBubble = React.memo(function MessageBubble({ message, userAvatar, userName, onRegenerate, onSwitchVersion, canEditUserMessage = false, onEditUserMessage }: MessageBubbleProps) {
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

  return (
    <div id={`msg-${message.id}`} className={`group/message flex items-start gap-2 sm:gap-4 ${isUser ? 'flex-row-reverse message-user' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2`}>
      <div className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1 overflow-hidden ${isUser ? 'bg-slate-100 border-slate-200' : 'bg-indigo-100 border-indigo-200'
        }`}>
        {isUser ? (
          <Image src={userAvatar || DEFAULT_USER_AVATAR} alt={userName || 'User'} fill sizes="40px" unoptimized className="rounded-full bg-slate-100 object-cover" />
        ) : (
          <Bot className="w-5 h-5 text-indigo-600" />
        )}
      </div>

      <div className={`flex min-w-0 flex-col ${isUser ? 'max-w-[82%] items-end sm:max-w-[75%]' : 'max-w-[86%] items-start sm:max-w-[75%]'}`}>
        {!isUser && message.reasoning && (
          <ReasoningSection content={message.reasoning} isStreaming={message.isStreaming && !message.content} duration={message.reasoningDuration} />
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

        {message.content ? (
          <div className={`px-4 sm:px-5 py-3 rounded-2xl sm:rounded-3xl shadow-sm max-w-full ${isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : message.isError
              ? 'bg-red-50 border border-red-100 text-red-800 rounded-tl-sm'
              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
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
              <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
            )}
          </div>
        ) : message.isStreaming && !message.reasoning && (
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm min-h-[44px] flex items-center w-fit">
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
          <div className="mt-2 flex items-center justify-end gap-1.5 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
              title={copied ? 'Copied' : 'Copy'}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
            {canEditUserMessage && (
              <button
                onClick={startUserEdit}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                title="Edit"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1.5 mt-2 ml-1 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
            {hasVersions && (
              <div className="flex items-center gap-1 bg-slate-100/80 rounded-lg px-1.5 py-1 mr-2 border border-slate-200/60">
                <button
                  onClick={() => onSwitchVersion && onSwitchVersion(-1)}
                  disabled={currentIdx === 0}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-bold text-slate-500 w-7 text-center">
                  {currentIdx + 1} / {totalVersions}
                </span>
                <button
                  onClick={() => onSwitchVersion && onSwitchVersion(1)}
                  disabled={currentIdx === totalVersions - 1}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="Like"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Dislike"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="Regenerate"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.message === next.message && prev.userAvatar === next.userAvatar && prev.userName === next.userName && prev.canEditUserMessage === next.canEditUserMessage && prev.onEditUserMessage === next.onEditUserMessage);
