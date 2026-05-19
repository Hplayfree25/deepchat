'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Code2,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  CornerDownLeft,
  Send,
  Square,
  Video,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getChats } from '@/app/actions';
import { isShortcutEvent, useShortcutLabels } from '@/components/shortcuts';
import ModelSelector from './ModelSelector';
import Tooltip from './Tooltip';
import { ComposerToolsMenu, ImageToolBadge, SearchToolBadge } from './ComposerToolsMenu';
import { getDictationLanguage, loadGeneralSettings, subscribeGeneralSettings } from '@/lib/general-settings';
import { type ImageAspectRatio } from '@/lib/image-aspect-ratio';

export interface ComposerFile {
  name: string;
  ext: string;
}

interface ComposerRecentFile extends ComposerFile {
  chatId: string;
  chatTitle: string;
  addedAt: string;
}

interface ComposerChatMessage {
  attachedFiles?: ComposerFile[];
  createdAt?: string;
}

interface ComposerChatSummary {
  id?: string;
  title?: string;
  createdAt?: string;
  pendingAttachedFiles?: ComposerFile[];
  messages?: ComposerChatMessage[];
}

interface TextareaSlot {
  left: number;
  top: number;
  width: number;
  minHeight: number;
}

interface ChatComposerProps {
  value: string;
  attachedFiles: ComposerFile[];
  isUploading?: boolean;
  isBusy?: boolean;
  webSearchEnabled?: boolean;
  imageGenerationEnabled?: boolean;
  imageAspectRatio?: ImageAspectRatio;
  placeholder?: string;
  maxTextareaHeight?: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  onToggleWebSearch?: (enabled: boolean) => void;
  onToggleImageGeneration?: (enabled: boolean) => void;
  onImageAspectRatioChange?: (aspectRatio: ImageAspectRatio) => void;
  onFilesUpload: (files: File[]) => void;
  onAttachRecentFile: (file: ComposerFile) => void;
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
  imageGenerationEnabled = false,
  imageAspectRatio = 'auto',
  placeholder = 'Message DeepChat...',
  maxTextareaHeight = 192,
  onChange,
  onSubmit,
  onStop,
  onToggleWebSearch,
  onToggleImageGeneration,
  onImageAspectRatioChange,
  onFilesUpload,
  onAttachRecentFile,
  onRemoveFile
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const compactTextSlotRef = useRef<HTMLDivElement>(null);
  const expandedTextSlotRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const dictationBaseRef = useRef('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isDictationEnabled, setIsDictationEnabled] = useState(() => loadGeneralSettings().dictationEnabled);
  const [recentFiles, setRecentFiles] = useState<ComposerRecentFile[]>([]);
  const [textareaSlot, setTextareaSlot] = useState<TextareaSlot | null>(null);
  const [textareaHeight, setTextareaHeight] = useState(44);
  const shortcuts = useShortcutLabels();
  const canSubmit = value.trim().length > 0 || attachedFiles.length > 0;
  const isToolComposerActive = webSearchEnabled || imageGenerationEnabled;
  const textareaTop = textareaSlot ? textareaSlot.top + (isToolComposerActive ? 0 : Math.max(0, (textareaSlot.minHeight - textareaHeight) / 2)) : 0;

  const measureTextareaSlot = useCallback(() => {
    const composerNode = composerRef.current;
    const targetNode = isToolComposerActive ? expandedTextSlotRef.current : compactTextSlotRef.current;
    if (!composerNode || !targetNode) return;

    const composerRect = composerNode.getBoundingClientRect();
    const targetRect = targetNode.getBoundingClientRect();
    const nextSlot = {
      left: targetRect.left - composerRect.left,
      top: targetRect.top - composerRect.top,
      width: targetRect.width,
      minHeight: targetRect.height
    };

    setTextareaSlot(current => {
      if (
        current &&
        Math.abs(current.left - nextSlot.left) < 0.5 &&
        Math.abs(current.top - nextSlot.top) < 0.5 &&
        Math.abs(current.width - nextSlot.width) < 0.5 &&
        Math.abs(current.minHeight - nextSlot.minHeight) < 0.5
      ) {
        return current;
      }

      return nextSlot;
    });
  }, [isToolComposerActive]);

  useLayoutEffect(() => {
    measureTextareaSlot();
  }, [measureTextareaSlot, textareaHeight]);

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      measureTextareaSlot();
      window.requestAnimationFrame(measureTextareaSlot);
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [isToolComposerActive, measureTextareaSlot]);

  useLayoutEffect(() => {
    const textareaNode = textareaRef.current;
    if (!textareaNode) return;
    const minHeight = 44;
    const previousHeight = textareaNode.style.height;
    textareaNode.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textareaNode.scrollHeight, minHeight), maxTextareaHeight);
    textareaNode.style.height = previousHeight;
    setTextareaHeight(current => Math.abs(current - nextHeight) > 0.5 ? nextHeight : current);
  }, [isToolComposerActive, maxTextareaHeight, textareaSlot?.minHeight, textareaSlot?.width, value]);

  useEffect(() => {
    measureTextareaSlot();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureTextareaSlot) : null;
    if (resizeObserver) {
      if (composerRef.current) resizeObserver.observe(composerRef.current);
      if (compactTextSlotRef.current) resizeObserver.observe(compactTextSlotRef.current);
      if (expandedTextSlotRef.current) resizeObserver.observe(expandedTextSlotRef.current);
    }
    window.addEventListener('resize', measureTextareaSlot);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureTextareaSlot);
    };
  }, [measureTextareaSlot]);

  useEffect(() => {
    if (!isToolComposerActive) return;
    textareaRef.current?.focus();
  }, [isToolComposerActive]);

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

  useEffect(() => {
    const closeAttachMenu = () => setIsAttachMenuOpen(false);
    window.addEventListener('modelSelectorOpened', closeAttachMenu);
    return () => window.removeEventListener('modelSelectorOpened', closeAttachMenu);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadRecentFiles = async () => {
      const chats = await getChats() as ComposerChatSummary[];
      if (!mounted) return;
      const seen = new Set<string>();
      const files = chats.flatMap(chat => {
        if (!chat.id) return [];
        const pending = (chat.pendingAttachedFiles || []).map(file => ({
          ...file,
          chatId: chat.id || '',
          chatTitle: chat.title || 'New Chat',
          addedAt: chat.createdAt || ''
        }));
        const fromMessages = (chat.messages || []).flatMap(message => (message.attachedFiles || []).map(file => ({
          ...file,
          chatId: chat.id || '',
          chatTitle: chat.title || 'New Chat',
          addedAt: message.createdAt || chat.createdAt || ''
        })));
        return [...pending, ...fromMessages];
      }).filter(file => {
        const key = `${file.name}-${file.ext}`;
        if (!file.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);
      setRecentFiles(files);
    };
    void loadRecentFiles();
    window.addEventListener('chatUpdated', loadRecentFiles);
    return () => {
      mounted = false;
      window.removeEventListener('chatUpdated', loadRecentFiles);
    };
  }, []);

  const submit = () => {
    if (!canSubmit || isBusy || isUploading) return;
    onSubmit(value);
  };

  const uploadFiles = (files: File[]) => {
    const validFiles = files.filter(file => file.size > 0);
    if (validFiles.length > 0) onFilesUpload(validFiles);
  };

  const openFilePicker = useCallback(() => {
    if (isUploading) return;
    fileInputRef.current?.click();
    setIsAttachMenuOpen(false);
  }, [isUploading]);

  const toggleAttachMenu = () => {
    setIsAttachMenuOpen(open => {
      const nextOpen = !open;
      if (nextOpen) window.dispatchEvent(new Event('closeModelSelector'));
      return nextOpen;
    });
  };

  useEffect(() => {
    const handleUploadShortcut = (event: KeyboardEvent) => {
      if (!isShortcutEvent(event, 'uploadFile')) return;
      event.preventDefault();
      event.stopPropagation();
      openFilePicker();
    };
    window.addEventListener('keydown', handleUploadShortcut, true);
    return () => window.removeEventListener('keydown', handleUploadShortcut, true);
  }, [openFilePicker]);

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

  useEffect(() => {
    const handleComposerShortcut = (event: KeyboardEvent) => {
      if (isShortcutEvent(event, 'selectModel')) {
        event.preventDefault();
        event.stopPropagation();
        setIsAttachMenuOpen(false);
        window.dispatchEvent(new Event('openModelSelector'));
        return;
      }
      if (isShortcutEvent(event, 'dictation')) {
        event.preventDefault();
        event.stopPropagation();
        toggleDictation();
      }
    };
    window.addEventListener('keydown', handleComposerShortcut, true);
    return () => window.removeEventListener('keydown', handleComposerShortcut, true);
  });

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

  const toolsButton = (
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
      <Tooltip label="Add Files and more" shortcuts={[{ label: '/', tone: 'key' }]} side="bottom" align="start" disabled={isAttachMenuOpen}>
        <motion.button
          type="button"
          disabled={isUploading}
          onClick={toggleAttachMenu}
          animate={{ rotate: isAttachMenuOpen ? 45 : 0 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11 ${isAttachMenuOpen ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
          aria-label="Open tools menu"
          aria-expanded={isAttachMenuOpen}
        >
          <Plus className="h-5 w-5" strokeWidth={2.35} />
        </motion.button>
      </Tooltip>
      <AnimatePresence>
        {isAttachMenuOpen && (
          <ComposerToolsMenu
            isUploading={isUploading}
            webSearchEnabled={webSearchEnabled}
            imageGenerationEnabled={imageGenerationEnabled}
            imageAspectRatio={imageAspectRatio}
            uploadShortcut={shortcuts.uploadFile}
            recentFiles={recentFiles}
            onUpload={openFilePicker}
            onAttachRecentFile={(file) => {
              onAttachRecentFile(file);
              setIsAttachMenuOpen(false);
            }}
            onToggleWebSearch={(enabled) => {
              setIsAttachMenuOpen(false);
              onToggleWebSearch?.(enabled);
            }}
            onToggleImageGeneration={(enabled) => {
              setIsAttachMenuOpen(false);
              onToggleImageGeneration?.(enabled);
            }}
            onImageAspectRatioChange={onImageAspectRatioChange}
            onClose={() => setIsAttachMenuOpen(false)}
            getFileIcon={getComposerFileIcon}
            getDisplayName={getComposerDisplayName}
          />
        )}
      </AnimatePresence>
    </div>
  );

  const searchToolBadge = (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      <SearchToolBadge enabled={webSearchEnabled} onDisable={() => onToggleWebSearch?.(false)} />
      <ImageToolBadge enabled={imageGenerationEnabled} aspectRatio={imageAspectRatio} onDisable={() => onToggleImageGeneration?.(false)} />
    </div>
  );

  const actionControls = (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
      <div className="hidden min-w-0 max-w-[9rem] sm:block lg:max-w-[13rem]">
        <ModelSelector />
      </div>
      {isDictationEnabled && (
        <IconButton label={isDictating ? 'Stop dictation' : 'Dictate'} tooltip={isDictating ? 'Stop dictation' : 'Dictate'} shortcut={shortcuts.dictation.join('+')} onClick={toggleDictation}>
          <Mic className={`h-5 w-5 ${isDictating ? 'text-red-500' : ''}`} strokeWidth={2.35} />
        </IconButton>
      )}
      <Tooltip label={isBusy ? 'Stop generating' : 'Send prompt'} shortcuts={isBusy ? [] : [{ label: <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2.4} />, tone: 'icon' }]} side="bottom" align="end">
        <button
          type={isBusy ? 'button' : 'submit'}
          disabled={isUploading || (!isBusy && !canSubmit)}
          onClick={isBusy ? onStop : undefined}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-slate-300 sm:h-11 sm:w-11 ${isBusy ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-950 hover:bg-indigo-600'}`}
          aria-label={isBusy ? 'Stop generating' : 'Send message'}
        >
          {isBusy ? <Square className="h-4 w-4 fill-current" strokeWidth={2.35} /> : <Send className="h-5 w-5" strokeWidth={2.35} />}
        </button>
      </Tooltip>
    </div>
  );

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

      <motion.form
        initial={false}
        animate={{ minHeight: isToolComposerActive ? Math.max(104, textareaHeight + 64) : Math.max(68, textareaHeight + 12) }}
        transition={{ duration: 0.32, ease: [0.33, 1, 0.68, 1] }}
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
        className={`relative rounded-[1.75rem] border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.05),0_12px_34px_rgb(15_23_42/0.08)] transition-[border-color,box-shadow] duration-[340ms] ease-out focus-within:border-slate-300 focus-within:shadow-[0_2px_6px_rgb(15_23_42/0.06),0_18px_42px_rgb(15_23_42/0.11)] sm:rounded-[2rem] dark:bg-slate-950/95 dark:shadow-2xl dark:shadow-black/25 dark:focus-within:border-indigo-400/60 ${isToolComposerActive ? 'px-4 py-3 shadow-[0_2px_10px_rgb(15_23_42/0.08),0_18px_44px_rgb(15_23_42/0.11)] sm:px-5 sm:py-3.5' : 'px-2 py-1.5'} ${isDraggingFile ? 'border-indigo-400 ring-4 ring-indigo-100 dark:ring-indigo-500/15' : isToolComposerActive ? 'border-blue-200 dark:border-blue-400/35' : 'border-slate-200 dark:border-slate-700'}`}
      >
        <motion.div
          initial={false}
          animate={{
            minHeight: isToolComposerActive ? Math.max(104, textareaHeight + 56) : Math.max(56, textareaHeight),
            gridTemplateRows: isToolComposerActive ? `${Math.max(44, textareaHeight)}px 44px` : `0px ${Math.max(56, textareaHeight)}px`,
            rowGap: isToolComposerActive ? 8 : 0
          }}
          transition={{ duration: 0.32, ease: [0.33, 1, 0.68, 1] }}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] overflow-visible gap-x-0.5 sm:gap-x-2"
        >
          <div className="col-start-1 row-start-2 flex min-w-0 items-center">
            {toolsButton}
          </div>
          <div className="col-start-2 row-start-2 flex min-w-0 items-center">
            {searchToolBadge}
          </div>
          <div
            ref={expandedTextSlotRef}
            className="pointer-events-none invisible col-start-1 col-end-4 row-start-1 min-w-0"
            aria-hidden="true"
          />
          <div
            ref={compactTextSlotRef}
            className="pointer-events-none invisible col-start-2 col-end-3 row-start-2 min-w-0"
            aria-hidden="true"
          />
          <div className="col-start-3 row-start-2 flex items-center justify-end">
            {actionControls}
          </div>
        </motion.div>
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          className={`absolute z-20 resize-none bg-transparent text-[16px] font-medium leading-snug text-slate-800 outline-none placeholder:text-slate-400 custom-scrollbar transition-[left,top,width,height,padding] duration-[280ms] ease-[cubic-bezier(0.33,1,0.68,1)] dark:text-slate-100 dark:placeholder:text-slate-500 ${isToolComposerActive ? 'px-0 py-2' : 'px-1 py-2.5'}`}
          style={{
            left: textareaSlot ? `${textareaSlot.left}px` : 0,
            top: `${textareaTop}px`,
            width: textareaSlot ? `${textareaSlot.width}px` : '100%',
            height: `${textareaHeight}px`,
            maxHeight: maxTextareaHeight,
            opacity: textareaSlot ? 1 : 0
          }}
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
      </motion.form>
    </div>
  );
}

function IconButton({ children, disabled, label, tooltip = label, shortcut, active, onClick }: { children: React.ReactNode; disabled?: boolean; label: string; tooltip?: string; shortcut?: string; active?: boolean; onClick?: () => void }) {
  return (
    <Tooltip label={tooltip} shortcuts={shortcut ? [{ label: shortcut, tone: 'muted' }] : []} side="bottom">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 ${active ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </button>
    </Tooltip>
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

