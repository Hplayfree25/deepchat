'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Code2,
  File as FileIcon,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Lightbulb,
  Mic,
  Paperclip,
  Send,
  Square,
  Video,
  X
} from 'lucide-react';
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
  placeholder?: string;
  maxTextareaHeight?: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
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
  placeholder = 'Message DeepChat...',
  maxTextareaHeight = 192,
  onChange,
  onSubmit,
  onStop,
  onFilesUpload,
  onRemoveFile
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const dictationBaseRef = useRef('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
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

  const submit = () => {
    if (!canSubmit || isBusy || isUploading) return;
    onSubmit(value);
  };

  const uploadFiles = (files: File[]) => {
    const validFiles = files.filter(file => file.size > 0);
    if (validFiles.length > 0) onFilesUpload(validFiles);
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
        className={`rounded-[1.5rem] border bg-white p-2 shadow-sm transition-all focus-within:border-slate-300 focus-within:shadow-md sm:rounded-[2rem] dark:bg-slate-950/95 dark:shadow-2xl dark:shadow-black/25 dark:focus-within:border-indigo-400/60 ${isDraggingFile ? 'border-indigo-400 ring-4 ring-indigo-100 dark:ring-indigo-500/15' : 'border-slate-200 dark:border-slate-700'}`}
      >
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          className="min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[15px] font-medium text-slate-800 outline-none placeholder:text-slate-400 custom-scrollbar sm:px-4 dark:text-slate-100 dark:placeholder:text-slate-500"
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

        <div className="flex items-center justify-between gap-1 px-1 pt-1 sm:gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
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
            <IconButton label="Attach files" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-5 w-5" />
            </IconButton>
            <IconButton label="Web">
              <Globe className="h-5 w-5" />
            </IconButton>
            <div className="min-w-0">
              <ModelSelector />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 sm:flex">
              <IconButton label="Prompt tag">
                <Hash className="h-5 w-5" />
              </IconButton>
              {isDictationEnabled && (
                <IconButton label={isDictating ? 'Stop dictation' : 'Voice'} onClick={toggleDictation}>
                  <Mic className={`h-5 w-5 ${isDictating ? 'text-red-500' : ''}`} />
                </IconButton>
              )}
              <IconButton label="Idea">
                <Lightbulb className="h-5 w-5" />
              </IconButton>
            </div>
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

function IconButton({ children, disabled, label, onClick }: { children: React.ReactNode; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      aria-label={label}
      title={label}
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
