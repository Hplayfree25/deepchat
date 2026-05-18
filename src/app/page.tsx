'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { createChat, getChats, uploadFile } from './actions';
import ChatComposer, { getComposerDisplayName, getComposerFileIcon } from '@/components/ui/ChatComposer';
import {
  ArrowUpRight,
  BarChart3,
  Grid2X2,
  Image as ImageIcon,
  Lightbulb,
  PenLine,
} from 'lucide-react';

interface AttachedFile {
  name: string;
  ext: string;
}

interface RecentFile extends AttachedFile {
  chatId: string;
  chatTitle: string;
  addedAt: string;
}

interface ChatMessage {
  attachedFiles?: AttachedFile[];
  createdAt?: string;
}

interface ChatSummary {
  id: string;
  title?: string;
  createdAt?: string;
  pendingAttachedFiles?: AttachedFile[];
  messages?: ChatMessage[];
}

const quickPrompts = [
  {
    icon: Lightbulb,
    title: 'Brainstorm ideas',
    desc: 'for a project',
    prompt: 'Help me brainstorm practical ideas for a project.'
  },
  {
    icon: PenLine,
    title: 'Write content',
    desc: 'blog or social',
    prompt: 'Draft polished content for a blog or social post.'
  },
  {
    icon: BarChart3,
    title: 'Analyze data',
    desc: 'and trends',
    prompt: 'Analyze this data and identify the key trends.'
  },
  {
    icon: ImageIcon,
    title: 'Create images',
    desc: 'from a prompt',
    prompt: 'Help me create a clear image prompt.'
  },
  {
    icon: Grid2X2,
    title: 'More',
    desc: 'tools',
    prompt: 'Show me useful ways to get started with DeepChat.'
  }
];

export default function WelcomePage() {
  const router = useRouter();
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('deepchat-draft-new') || '';
  });
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  useEffect(() => {
    localStorage.setItem('deepchat-draft-new', input);
  }, [input]);

  useEffect(() => {
    let mounted = true;
    const loadRecentFiles = async () => {
      const chats = await getChats() as ChatSummary[];
      if (!mounted) return;
      const seen = new Set<string>();
      const files = chats.flatMap(chat => {
        const pending = (chat.pendingAttachedFiles || []).map(file => ({
          ...file,
          chatId: chat.id,
          chatTitle: chat.title || 'New Chat',
          addedAt: chat.createdAt || ''
        }));
        const fromMessages = (chat.messages || []).flatMap(message => (message.attachedFiles || []).map(file => ({
          ...file,
          chatId: chat.id,
          chatTitle: chat.title || 'New Chat',
          addedAt: message.createdAt || chat.createdAt || ''
        })));
        return [...pending, ...fromMessages];
      }).filter(file => {
        const key = `${file.name}-${file.ext}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
      setRecentFiles(files);
    };
    void loadRecentFiles();
    window.addEventListener('chatUpdated', loadRecentFiles);
    return () => {
      mounted = false;
      window.removeEventListener('chatUpdated', loadRecentFiles);
    };
  }, []);

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i += 1) {
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

  const startChat = async (inputMsg?: string, files: AttachedFile[] = attachedFiles, useWebSearch = webSearchEnabled) => {
    localStorage.removeItem('deepchat-draft-new');
    const id = await createChat('New Chat', files);
    const query = new URLSearchParams();
    if (inputMsg || files.length > 0) query.set('msg', inputMsg || '');
    if (useWebSearch) query.set('web', '1');
    const qString = query.toString();
    router.push(`/chat/${id}${qString ? `?${qString}` : ''}`);
  };

  const openRecentFile = (file: RecentFile) => {
    void startChat(`Please analyze ${getComposerDisplayName(file.name)}.`, [{ name: file.name, ext: file.ext }]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className={`flex min-h-0 flex-1 justify-center px-4 sm:px-6 lg:px-10 ${recentFiles.length > 0 ? 'items-start overflow-y-auto py-8 custom-scrollbar' : 'items-center overflow-hidden py-4'}`}>
        <div className={`mx-auto flex w-full max-w-5xl flex-col items-center gap-5 sm:gap-6 ${recentFiles.length > 0 ? 'justify-start pb-8' : 'max-h-full justify-center overflow-hidden'}`}>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.42 }}
            className="max-w-3xl text-center text-3xl font-black leading-tight tracking-normal text-slate-950 sm:text-5xl lg:text-6xl"
          >
            What can I help with?
          </motion.h1>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.42 }}
            className="flex w-full max-w-4xl gap-3 overflow-x-auto px-1 pb-1 custom-scrollbar sm:flex-wrap sm:justify-center sm:overflow-visible"
          >
            {quickPrompts.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.title}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.23 + index * 0.04, duration: 0.34 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startChat(item.prompt)}
                  className="group flex min-w-[180px] items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700 transition-colors group-hover:bg-slate-950 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-black leading-5 text-slate-900">
                      {item.title}
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-700" />
                    </span>
                    <span className="block text-xs font-medium leading-5 text-slate-500">{item.desc}</span>
                  </span>
                </motion.button>
              );
            })}
          </motion.section>

          <AnimatePresence>
            {recentFiles.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35 }}
                className="flex min-h-0 w-full max-w-4xl flex-col gap-3"
              >
                <div className="flex items-end justify-between gap-4 px-1">
                  <div>
                    <h2 className="text-sm font-black text-slate-900">Recent files</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Open a file in a new chat</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                    {recentFiles.length}
                  </span>
                </div>
                <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recentFiles.map((file, index) => (
                    <motion.button
                      key={`${file.name}-${file.ext}-${file.chatId}`}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.28 }}
                      whileHover={{ y: -2 }}
                      onClick={() => openRecentFile(file)}
                      className="group flex min-h-20 min-w-0 items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                        {getComposerFileIcon(file.ext, 'h-5 w-5')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-800">{getComposerDisplayName(file.name)}</span>
                        <span className="mt-1 block truncate text-xs font-semibold text-slate-400">{file.chatTitle}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          <ChatComposer
            value={input}
            attachedFiles={attachedFiles}
            isUploading={isUploading}
            webSearchEnabled={webSearchEnabled}
            onChange={setInput}
            onSubmit={(value) => startChat(value)}
            onToggleWebSearch={setWebSearchEnabled}
            onFilesUpload={handleFilesUpload}
            onAttachRecentFile={(file) => setAttachedFiles(prev => prev.some(item => item.name === file.name && item.ext === file.ext) ? prev : [...prev, file])}
            onRemoveFile={(index) => setAttachedFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
          />

          <p className="hidden text-center text-xs font-semibold text-slate-400 sm:block">
            DeepChat can make mistakes. Verify important information before using it.
          </p>
        </div>
      </div>
    </div>
  );
}
