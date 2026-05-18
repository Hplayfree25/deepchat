'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Code2,
  File as FileIcon,
  FileText,
  Globe,
  Image as ImageIcon,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  Square,
  Video,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ModelSelector from './ModelSelector';
import { getDictationLanguage, loadGeneralSettings, subscribeGeneralSettings } from '@/lib/general-settings';

export interface ComposerFile {
  name: string;
  ext: string;
}

interface ChatComposerProps {
  value: string;
  attachedFiles: ComposerFile[];
  isUploading?: boolean;
  isBusy?: boolean;
  webSearchEnabled?: boolean;
  placeholder?: string;
  maxTextareaHeight?: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  onToggleWebSearch?: (enabled: boolean) => void;
  onFilesUpload: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string } | undefined;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const getSpeechRecognitionConstructor = () => {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
};

export default function ChatComposer({
  value,
  attachedFiles,
  isUploading = false,
  isBusy = false,
  webSearchEnabled = false,
  placeholder = 'Message DeepChat...',
  maxTextareaHeight = 192,
  onChange,
  onSubmit,
  onStop,
  onToggleWebSearch,
  onFilesUpload,
  onRemoveFile
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const dragDepthRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const dictationBaseRef = useRef('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isDictationEnabled, setIsDictationEnabled] = useState(() => loadGeneralSettings().dictationEnabled);
  const canSubmit = value.trim().length > 0 || attachedFiles.length > 0;

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxTextareaHeight)}px`;
  }, [maxTextareaHeight, value]);

  useEffect(() => {
    const unsubscribe = subscribeGeneralSettings(settings => {
      setIsDictationEnabled(settings.dictationEnabled);
      if (!settings.dictationEnabled) {
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        setIsDictating(false);
      }
    });
    return () => {
      recognitionRef.current?.abort();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (composerRef.current && !composerRef.current.contains(event.target as Node)) setIsAttachMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAttachMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAttachMenuOpen]);

  const submit = () => {
    if (!canSubmit || isBusy || isUploading) return;
    onSubmit(value);
  };

  const uploadFiles = (files: File[]) => {
    const validFiles = files.filter(file => file.size > 0);
    if (validFiles.length > 0) onFilesUpload(validFiles);
  };

  const openFilePicker = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
    setIsAttachMenuOpen(false);
  };

  const toggleDictation = () => {
    if (!isDictationEnabled) return;
    if (isDictating) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsDictating(false);
      return;
    }
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;
    const recognition = new Recognition();
    const settings = loadGeneralSettings();
    dictationBaseRef.current = value;
    recognition.lang = getDictationLanguage(settings);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || '';
        if (result?.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      const base = dictationBaseRef.current.trimEnd();
      const spokenText = `${finalTranscript}${interimTranscript}`.trimStart();
      onChange(spokenText ? `${base}${base ? ' ' : ''}${spokenText}` : base);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };
    recognitionRef.current = recognition;
    setIsDictating(true);
    recognition.start();
  };

  const getClipboardFiles = (clipboardData: DataTransfer) => {
    const files: File[] = [];

    for (let index = 0; index < clipboardData.items.length; index += 1) {
      const item = clipboardData.items[index];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      if (file.name) {
        files.push(file);
      } else {
        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        files.push(new File([file], `pasted-image-${Date.now()}-${index}.${ext}`, { type: file.type || 'image/png', lastModified: Date.now() }));
      }
    }

    return files;
  };

  return (
    <div className="flex w-full flex-col gap-2">
      {attachedFiles.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-1 pb-1 custom-scrollbar">
          {attachedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex w-[min(72vw,210px)] shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 pr-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {getComposerFileIcon(file.ext, 'h-4 w-4')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-slate-700 dark:text-slate-100">{getComposerDisplayName(file.name)}</p>
                <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{file.ext}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        ref={composerRef}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepthRef.current += 1;
          if (Array.from(event.dataTransfer.types).includes('Files')) setIsDraggingFile(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDraggingFile(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setIsDraggingFile(false);
          uploadFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = getClipboardFiles(event.clipboardData);
          if (files.length === 0) return;
          event.preventDefault();
          uploadFiles(files);
        }}
        className={`relative rounded-[1.75rem] border bg-white px-2 py-1.5 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_12px_34px_rgb(15_23_42/0.08)] transition-all focus-within:border-slate-300 focus-within:shadow-[0_2px_6px_rgb(15_23_42/0.06),0_18px_42px_rgb(15_23_42/0.11)] sm:rounded-[2rem] dark:bg-slate-950/95 dark:shadow-2xl dark:shadow-black/25 dark:focus-within:border-indigo-400/60 ${isDraggingFile ? 'border-indigo-400 ring-4 ring-indigo-100 dark:ring-indigo-500/15' : 'border-slate-200 dark:border-slate-700'}`}
      >
        <div className="flex min-h-12 items-center gap-1 sm:min-h-14 sm:gap-2">
          <div className="relative flex h-10 shrink-0 items-center justify-center sm:h-11">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={(event) => {
                uploadFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
            <motion.button
              type="button"
              disabled={isUploading}
              onClick={() => setIsAttachMenuOpen(open => !open)}
              animate={{ rotate: isAttachMenuOpen ? 45 : 0 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11 ${isAttachMenuOpen ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
              aria-label="Open tools menu"
              aria-expanded={isAttachMenuOpen}
              title="Open tools menu"
            >
              <Plus className="h-5 w-5" />
            </motion.button>
            <AnimatePresence>
              {isAttachMenuOpen && (
                <AttachMenu
                  isUploading={isUploading}
                  webSearchEnabled={webSearchEnabled}
                  onUpload={openFilePicker}
                  onToggleWebSearch={onToggleWebSearch}
                  onClose={() => setIsAttachMenuOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <textarea
            ref={textareaRef}
            placeholder={placeholder}
            className="min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] font-medium leading-snug text-slate-800 outline-none placeholder:text-slate-400 custom-scrollbar sm:min-h-11 sm:py-3 dark:text-slate-100 dark:placeholder:text-slate-500"
            style={{ maxHeight: maxTextareaHeight }}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />

          <div className="flex min-w-0 shrink-0 items-center gap-1">
            <div className="hidden min-w-0 max-w-[9rem] sm:block lg:max-w-[13rem]">
              <ModelSelector />
            </div>
            {isDictationEnabled && (
              <IconButton label={isDictating ? 'Stop dictation' : 'Voice'} onClick={toggleDictation}>
                <Mic className={`h-5 w-5 ${isDictating ? 'text-red-500' : ''}`} />
              </IconButton>
            )}
            <button
              type={isBusy ? 'button' : 'submit'}
              disabled={isUploading || (!isBusy && !canSubmit)}
              onClick={isBusy ? onStop : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-slate-300 sm:h-11 sm:w-11 ${isBusy ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-950 hover:bg-indigo-600'}`}
              aria-label={isBusy ? 'Stop generating' : 'Send message'}
              title={isBusy ? 'Stop generating' : 'Send message'}
            >
              {isBusy ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AttachMenu({ isUploading, webSearchEnabled, onUpload, onToggleWebSearch, onClose }: { isUploading?: boolean; webSearchEnabled?: boolean; onUpload: () => void; onToggleWebSearch?: (enabled: boolean) => void; onClose: () => void }) {
  const menuItems = [
    {
      label: 'Add photos & files',
      hint: 'Ctrl + U',
      icon: <Paperclip className="h-5 w-5" />,
      onClick: onUpload,
      disabled: isUploading
    },
    {
      label: 'Recent files',
      icon: <FileText className="h-5 w-5" />,
      trailing: <ChevronRight className="h-4 w-4" />,
      onClick: onClose
    },
    {
      label: 'Create image',
      icon: <ImageIcon className="h-5 w-5" />,
      onClick: onClose
    },
    {
      label: 'Deep research',
      icon: <BookOpen className="h-5 w-5" />,
      onClick: onClose
    },
    {
      label: 'Web search',
      icon: <Globe className="h-5 w-5" />,
      active: webSearchEnabled,
      onClick: () => {
        onToggleWebSearch?.(!webSearchEnabled);
        onClose();
      }
    },
    {
      label: 'More',
      icon: <MoreHorizontal className="h-5 w-5" />,
      trailing: <ChevronRight className="h-4 w-4" />,
      onClick: onClose
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-full left-0 z-50 mb-3 w-[min(17rem,calc(100vw-2rem))] origin-bottom-left overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-2xl shadow-slate-300/35 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/45"
    >
      {menuItems.map((item, index) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          onClick={item.onClick}
          className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.active ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${index === 1 ? 'mb-1 border-b border-slate-100 pb-1 dark:border-slate-800' : ''}`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-700 dark:text-slate-200">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && <span className="shrink-0 text-xs font-medium text-slate-400">{item.hint}</span>}
          {item.trailing && <span className="shrink-0 text-slate-500">{item.trailing}</span>}
        </button>
      ))}
    </motion.div>
  );
}

function IconButton({ children, disabled, label, active, onClick }: { children: React.ReactNode; disabled?: boolean; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 ${active ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function getComposerFileIcon(ext: string, className: string) {
  switch (ext.toLowerCase()) {
    case 'pdf':
      return <FileText className={className} />;
    case 'mp4':
    case 'mkv':
    case 'webm':
    case 'avi':
    case 'mov':
      return <Video className={className} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return <ImageIcon className={className} />;
    case 'ts':
    case 'js':
    case 'tsx':
    case 'jsx':
    case 'json':
    case 'html':
    case 'css':
      return <Code2 className={className} />;
    case 'md':
    case 'txt':
    case 'doc':
    case 'docx':
      return <BookOpen className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

export function getComposerDisplayName(name: string) {
  return name.replace(/^[a-f0-9]{8}-/i, '').replaceAll('_', ' ');
}
