'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Scan,
  Square,
  SquareMousePointer,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { type ImageAspectRatio } from '@/lib/image-aspect-ratio';

interface ComposerFile {
  name: string;
  ext: string;
}

interface ComposerRecentFile extends ComposerFile {
  chatId: string;
  chatTitle: string;
  addedAt: string;
}

type FileIconRenderer = (ext: string, className: string) => React.ReactNode;
type FileDisplayNameGetter = (name: string) => string;

interface ComposerToolsMenuProps {
  isUploading?: boolean;
  webSearchEnabled?: boolean;
  imageGenerationEnabled?: boolean;
  imageAspectRatio: ImageAspectRatio;
  uploadShortcut: string[];
  recentFiles: ComposerRecentFile[];
  onUpload: () => void;
  onAttachRecentFile: (file: ComposerFile) => void;
  onToggleWebSearch?: (enabled: boolean) => void;
  onToggleImageGeneration?: (enabled: boolean) => void;
  onImageAspectRatioChange?: (aspectRatio: ImageAspectRatio) => void;
  onClose: () => void;
  getFileIcon: FileIconRenderer;
  getDisplayName: FileDisplayNameGetter;
}

const aspectRatioOptions: {
  value: ImageAspectRatio;
  label: string;
  hint?: string;
  icon: React.ReactNode;
}[] = [
  { value: 'auto', label: 'Auto', icon: <Scan className="h-5 w-5" /> },
  { value: '1:1', label: 'Square', hint: '1:1', icon: <Square className="h-5 w-5" /> },
  { value: '3:4', label: 'Portrait', hint: '3:4', icon: <RectangleVertical className="h-5 w-5" /> },
  { value: '9:16', label: 'Story', hint: '9:16', icon: <RectangleVertical className="h-5 w-5" /> },
  { value: '4:3', label: 'Landscape', hint: '4:3', icon: <RectangleHorizontal className="h-5 w-5" /> },
  { value: '16:9', label: 'Widescreen', hint: '16:9', icon: <RectangleHorizontal className="h-5 w-5" /> }
];

const getAspectRatioLabel = (value: ImageAspectRatio) => {
  const option = aspectRatioOptions.find(item => item.value === value);
  return option?.hint || option?.label || 'Auto';
};

export function ComposerToolsMenu({
  isUploading,
  webSearchEnabled,
  imageGenerationEnabled,
  uploadShortcut,
  recentFiles,
  onUpload,
  onAttachRecentFile,
  onToggleWebSearch,
  onToggleImageGeneration,
  onClose,
  getFileIcon,
  getDisplayName
}: ComposerToolsMenuProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const openLibrary = () => {
    window.dispatchEvent(new Event('openFileLibrary'));
    onClose();
  };
  const menuItems = [
    {
      label: 'Add photos & files',
      hint: uploadShortcut.join(' + '),
      icon: <Paperclip className="h-[18px] w-[18px]" />,
      onClick: onUpload,
      disabled: isUploading
    },
    {
      label: 'Recent files',
      icon: <FileText className="h-[18px] w-[18px]" />,
      trailing: <ChevronRight className="h-4 w-4" />,
      submenu: true
    },
    {
      label: 'Image',
      icon: <ImageIcon className="h-[18px] w-[18px]" />,
      active: imageGenerationEnabled,
      onClick: () => {
        onToggleImageGeneration?.(!imageGenerationEnabled);
        onClose();
      }
    },
    {
      label: 'Deep research',
      icon: <BookOpen className="h-[18px] w-[18px]" />,
      onClick: onClose
    },
    {
      label: 'Web search',
      icon: <Globe className="h-[18px] w-[18px]" />,
      active: webSearchEnabled,
      onClick: () => {
        onToggleWebSearch?.(!webSearchEnabled);
        onClose();
      }
    },
    {
      label: 'More',
      icon: <MoreHorizontal className="h-[18px] w-[18px]" />,
      trailing: <ChevronRight className="h-4 w-4" />,
      submenu: true
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-full left-0 z-50 mb-3 w-[min(14.75rem,calc(100vw-2rem))] origin-bottom-left overflow-visible rounded-2xl border border-slate-200 bg-white p-1 text-slate-800 shadow-2xl shadow-slate-300/35 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/45"
    >
      {menuItems.map((item, index) => (
        <div
          key={item.label}
          onMouseEnter={() => setActiveSubmenu(item.submenu ? item.label : null)}
          onPointerEnter={() => setActiveSubmenu(item.submenu ? item.label : null)}
          onMouseLeave={() => {
            if (item.submenu) setActiveSubmenu(null);
          }}
          onFocus={() => setActiveSubmenu(item.submenu ? item.label : null)}
          className={`group/item relative ${index === 1 ? 'mb-1 border-b border-slate-100 pb-1 dark:border-slate-800' : ''}`}
        >
          <button
            type="button"
            disabled={item.disabled}
            onClick={item.submenu ? () => setActiveSubmenu(activeSubmenu === item.label ? null : item.label) : item.onClick}
            className={`flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.active ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-slate-700 dark:text-slate-200">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs font-medium text-slate-400 opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100">{item.hint}</span>}
            {item.trailing && <span className="shrink-0 text-slate-500">{item.trailing}</span>}
          </button>
          {item.submenu && (
            <div className={`absolute left-full z-[60] w-[min(17rem,calc(100vw-2rem))] pl-2 transition-opacity max-[760px]:bottom-full max-[760px]:left-0 max-[760px]:top-auto max-[760px]:mb-2 max-[760px]:pl-0 ${item.label === 'More' ? 'bottom-0' : 'top-0'} ${activeSubmenu === item.label ? 'pointer-events-auto block opacity-100' : 'pointer-events-none hidden opacity-0 group-focus-within/item:pointer-events-auto group-focus-within/item:block group-focus-within/item:opacity-100 group-hover/item:pointer-events-auto group-hover/item:block group-hover/item:opacity-100'}`}>
              <div className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl shadow-slate-300/35 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/45">
                {item.label === 'Recent files' ? (
                  <RecentFilesMenu
                    recentFiles={recentFiles}
                    onOpenLibrary={openLibrary}
                    onAttachRecentFile={onAttachRecentFile}
                    getFileIcon={getFileIcon}
                    getDisplayName={getDisplayName}
                  />
                ) : (
                  <MoreMenu onClose={onClose} />
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </motion.div>
  );
}

export function SearchToolBadge({ enabled, onDisable }: { enabled?: boolean; onDisable?: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {enabled && (
        <motion.button
          key="search-tool-badge"
          type="button"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={onDisable}
          className="group/search-tool inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-white px-3 text-sm font-medium text-[#202020] shadow-sm ring-1 ring-black/5 transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-700"
          aria-label="Disable web search"
          aria-pressed="true"
        >
          <span className="relative h-[18px] w-[18px] shrink-0">
            <Globe className="absolute inset-0 h-[18px] w-[18px] transition-all duration-150 group-hover/search-tool:scale-75 group-hover/search-tool:opacity-0" strokeWidth={2.25} />
            <X className="absolute inset-0 h-[18px] w-[18px] scale-75 opacity-0 transition-all duration-150 group-hover/search-tool:scale-100 group-hover/search-tool:opacity-100" strokeWidth={2.35} />
          </span>
          <span>Search</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function ImageToolBadge({ enabled, aspectRatio, onDisable, onAspectRatioChange }: { enabled?: boolean; aspectRatio: ImageAspectRatio; onDisable?: () => void; onAspectRatioChange?: (aspectRatio: ImageAspectRatio) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = aspectRatioOptions.find(option => option.value === aspectRatio) || aspectRatioOptions[0];
  const isAspectMenuOpen = Boolean(enabled && isOpen);

  useEffect(() => {
    if (!isAspectMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAspectMenuOpen]);

  return (
    <AnimatePresence initial={false}>
      {enabled && (
        <motion.div
          key="image-tool-badge"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          ref={containerRef}
          className="relative inline-flex h-9 shrink-0 items-center rounded-full bg-white text-sm font-medium text-[#202020] shadow-sm ring-1 ring-black/5 dark:bg-slate-800 dark:text-slate-100 dark:ring-white/10"
        >
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onDisable?.();
            }}
            className="group/image-tool inline-flex h-9 shrink-0 items-center gap-2 rounded-l-full px-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
            aria-label="Disable image generation"
            aria-pressed="true"
          >
            <span className="relative h-[18px] w-[18px] shrink-0">
              <ImageIcon className="absolute inset-0 h-[18px] w-[18px] transition-all duration-150 group-hover/image-tool:scale-75 group-hover/image-tool:opacity-0" strokeWidth={2.25} />
              <X className="absolute inset-0 h-[18px] w-[18px] scale-75 opacity-0 transition-all duration-150 group-hover/image-tool:scale-100 group-hover/image-tool:opacity-100" strokeWidth={2.35} />
            </span>
            <span>Image</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(open => !open)}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-r-full px-2 pr-3 text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700 ${isAspectMenuOpen ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
            aria-label="Choose image aspect ratio"
            aria-expanded={isAspectMenuOpen}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-600 dark:text-slate-300">{selectedOption.icon}</span>
            <span>{getAspectRatioLabel(aspectRatio)}</span>
            <motion.span
              animate={{ rotate: isAspectMenuOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="flex h-4 w-4 shrink-0 items-center justify-center"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2.35} />
            </motion.span>
          </button>
          <AnimatePresence>
            {isAspectMenuOpen && (
              <motion.div
                key="image-aspect-menu"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-full left-0 z-[70] mb-2 w-[min(16rem,calc(100vw-2rem))] origin-bottom-left rounded-2xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl shadow-slate-300/35 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/45"
              >
                <div className="space-y-1">
                  {aspectRatioOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onAspectRatioChange?.(option.value);
                        setIsOpen(false);
                      }}
                      className={`flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition-colors ${aspectRatio === option.value ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-700 dark:text-slate-200">{option.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint && <span className="shrink-0 text-xs font-semibold text-slate-400">{option.hint}</span>}
                      {aspectRatio === option.value && <Check className="h-4 w-4 shrink-0 text-blue-500" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RecentFilesMenu({ recentFiles, onOpenLibrary, onAttachRecentFile, getFileIcon, getDisplayName }: { recentFiles: ComposerRecentFile[]; onOpenLibrary: () => void; onAttachRecentFile: (file: ComposerFile) => void; getFileIcon: FileIconRenderer; getDisplayName: FileDisplayNameGetter }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenLibrary}
        className="flex h-9 w-full items-center gap-2 rounded-xl px-1.5 text-left text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <BookOpen className="h-5 w-5 shrink-0 text-slate-700 dark:text-slate-200" />
        <span className="min-w-0 flex-1 truncate">Add from library</span>
      </button>
      <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
      <div className="px-1.5 pb-2 text-sm font-medium text-slate-400">Recents</div>
      {recentFiles.length > 0 ? (
        <div className="max-h-64 overflow-y-auto custom-scrollbar">
          {recentFiles.map(file => (
            <button
              key={`${file.chatId}-${file.name}-${file.ext}`}
              type="button"
              onClick={() => onAttachRecentFile({ name: file.name, ext: file.ext })}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50 text-slate-700 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                {getFileIcon(file.ext, 'h-4 w-4')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-5">{getDisplayName(file.name)}</span>
                <span className="block truncate text-xs font-medium leading-4 text-slate-400">{formatRecentFileTime(file.addedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-2 py-8 text-center text-sm font-semibold text-slate-400">No recent files</div>
      )}
    </>
  );
}

function MoreMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <SquareMousePointer className="h-5 w-5 shrink-0 text-slate-700 dark:text-slate-200" />
        <span className="min-w-0 flex-1 truncate">Agent mode</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center text-slate-700 dark:text-slate-200">
          <PenLine className="h-5 w-5" />
          <Plus className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white dark:bg-slate-950" />
        </span>
        <span className="min-w-0 flex-1 truncate">Canvas</span>
      </button>
    </div>
  );
}

function formatRecentFileTime(value: string) {
  if (!value) return 'Recently added';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently added';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
