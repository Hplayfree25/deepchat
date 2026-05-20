'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  Bot, Search, Bell, Edit3, Folder, Download, Share2, MoreVertical,
  Settings,
  Trash2, FileText, User
} from 'lucide-react';
import Sidebar from './Sidebar';
import { DeepChatWordmarkSvg } from './brand';
import ModelSelector from './ui/ModelSelector';
import { isShortcutEvent, ShortcutCombo, useShortcutLabels } from './shortcuts';
import type { SettingsTab } from './SettingsModal';
import toast, { Toaster } from 'react-hot-toast';
import { getChat, deleteChat, shareChat, getUserProfile } from '@/app/actions';
import {
  addNotificationToInbox,
  clearNotificationInbox,
  loadNotificationInbox,
  markAllNotificationsRead as markInboxNotificationsRead,
  markNotificationRead as markInboxNotificationRead,
  subscribeNotificationInbox,
  type DeepChatNotificationDetail,
  type StoredNotification
} from '@/lib/notification-settings';
import {
  applyGeneralSettings,
  loadGeneralSettings,
  subscribeGeneralSettings
} from '@/lib/general-settings';

const SettingsModal = dynamic(() => import('./SettingsModal'), {
  ssr: false,
  loading: () => <SettingsModalSkeleton />
});

function SettingsModalSkeleton() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
      <div className="flex h-[82vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="hidden w-64 shrink-0 border-r border-slate-100 bg-slate-50 p-5 sm:block">
          <div className="mb-7 h-8 w-36 animate-pulse rounded-xl bg-slate-200" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-200" />
              <div className="mt-2 h-3 w-56 animate-pulse rounded-lg bg-slate-100" />
            </div>
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="grid flex-1 gap-4 overflow-hidden p-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-slate-100 p-4">
                <div className="mb-4 h-4 w-32 animate-pulse rounded-lg bg-slate-200" />
                <div className="space-y-3">
                  <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatData {
  title?: string;
  isShared?: boolean;
}

interface ChatUpdatedDetail {
  chatId?: string;
  title?: string;
}

interface UserProfile {
  name: string;
  avatar: string;
  plan?: string;
}

const loadStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const saved = localStorage.getItem(key);
  return saved !== null ? saved === 'true' : fallback;
};

const detailFromEvent = (event: CustomEvent<DeepChatNotificationDetail>) => event.detail;
const settingsTabs: SettingsTab[] = ['general', 'profile', 'personality', 'connection', 'notifications', 'mcp', 'tools', 'agent', 'data'];
const isSettingsTab = (value: unknown): value is SettingsTab => typeof value === 'string' && settingsTabs.includes(value as SettingsTab);

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasActiveChat = pathname.startsWith('/chat');
  const isSharedChat = pathname.startsWith('/chat/s/');
  const shortcuts = useShortcutLabels();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRefs = useRef<Array<HTMLDivElement | null>>([]);
  const profileMenuRefs = useRef<Array<HTMLDivElement | null>>([]);
  const mobileSwipeStartRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);

  const [isSidebarOpen, setSidebarOpen] = useState(() => loadStoredBoolean('isSidebarOpen', pathname.startsWith('/chat')));
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general');
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({ name: 'Guest', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', plan: '' });
  const [notifications, setNotifications] = useState<StoredNotification[]>(() => loadNotificationInbox());

  const setSidebarState = useCallback((val: boolean) => {
    setSidebarOpen(val);
    localStorage.setItem('isSidebarOpen', val.toString());
  }, []);

  const handleCreateChat = useCallback(() => {
    localStorage.removeItem('deepchat-draft-new');
    window.dispatchEvent(new Event('deepchat:new-home-prompt'));
    router.push('/');
    setMobileMenuOpen(false);
  }, [router]);

  const handleOpenSearch = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      return;
    }
    toast('Search is available in chat view.');
  }, []);

  const handleOpenActions = useCallback(() => {
    toast('Action menu is available from the composer tools.');
  }, []);

  const loadProfile = useCallback(() => {
    getUserProfile().then((savedProfile) => {
      setProfile(savedProfile as UserProfile);
    });
  }, []);

  const openSettings = useCallback((tab: SettingsTab = 'general') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  }, []);

  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const tab = event instanceof CustomEvent && isSettingsTab(event.detail?.tab) ? event.detail.tab : 'general';
      openSettings(tab);
    };
    window.addEventListener('openSettings', handleOpenSettings);
    return () => window.removeEventListener('openSettings', handleOpenSettings);
  }, [openSettings]);

  useEffect(() => {
    const handleOpenFileLibrary = () => {
      toast('Library panel has been removed from chat view.');
    };
    window.addEventListener('openFileLibrary', handleOpenFileLibrary);
    return () => window.removeEventListener('openFileLibrary', handleOpenFileLibrary);
  }, []);

  useEffect(() => {
    applyGeneralSettings(loadGeneralSettings());
    const unsubscribe = subscribeGeneralSettings(applyGeneralSettings);
    const handleSystemAppearanceChange = () => applyGeneralSettings(loadGeneralSettings());
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');
    darkQuery.addEventListener('change', handleSystemAppearanceChange);
    contrastQuery.addEventListener('change', handleSystemAppearanceChange);
    return () => {
      unsubscribe();
      darkQuery.removeEventListener('change', handleSystemAppearanceChange);
      contrastQuery.removeEventListener('change', handleSystemAppearanceChange);
    };
  }, []);

  useEffect(() => {
    const playNotificationSound = () => {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      window.setTimeout(() => void context.close(), 260);
    };

    window.addEventListener('deepchat:notification-sound', playNotificationSound);
    return () => window.removeEventListener('deepchat:notification-sound', playNotificationSound);
  }, []);

  useEffect(() => {
    const handleDeepChatNotification = (event: Event) => {
      const detail = event instanceof CustomEvent ? detailFromEvent(event) : null;
      if (!detail?.title || !detail.description) return;

      if (detail.delivery.inApp) {
        setNotifications(addNotificationToInbox(detail));
      }
      if (detail.delivery.sound) {
        window.dispatchEvent(new CustomEvent('deepchat:notification-sound', { detail }));
      }
    };

    window.addEventListener('deepchat:notification', handleDeepChatNotification);
    const unsubscribeInbox = subscribeNotificationInbox(setNotifications);
    return () => {
      window.removeEventListener('deepchat:notification', handleDeepChatNotification);
      unsubscribeInbox();
    };
  }, []);

  useEffect(() => {
    loadProfile();
    window.addEventListener('profileUpdated', loadProfile);
    return () => window.removeEventListener('profileUpdated', loadProfile);
  }, [loadProfile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideNotification = notificationRefs.current.some(node => node?.contains(target));
      const insideProfile = profileMenuRefs.current.some(node => node?.contains(target));

      if (!insideNotification) {
        setNotificationOpen(false);
      }
      if (!insideProfile) {
        setProfileMenuOpen(false);
      }
    };

    if (isNotificationOpen || isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationOpen, isProfileMenuOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isShortcutEvent(event, 'search')) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (isShortcutEvent(event, 'newChat')) {
        event.preventDefault();
        void handleCreateChat();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleCreateChat]);

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (window.innerWidth >= 640 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      mobileSwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        edge: touch.clientX <= 28
      };
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = mobileSwipeStartRef.current;
      mobileSwipeStartRef.current = null;
      if (!start || window.innerWidth >= 640 || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = Math.abs(touch.clientY - start.y);
      if (!isMobileMenuOpen && start.edge && deltaX > 72 && deltaY < 64) {
        setMobileMenuOpen(true);
      }
      if (isMobileMenuOpen && deltaX < -72 && deltaY < 64) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobileMenuOpen]);

  const [chatTitle, setChatTitle] = useState('');
  const [folderName, setFolderName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const loadChat = (e?: Event) => {
      if (hasActiveChat) {
        const parts = pathname.split('/');
        const id = parts[parts.length - 1];
        const detail = e instanceof CustomEvent ? e.detail as ChatUpdatedDetail : undefined;

        if (detail?.chatId === id && detail?.title) {
          setChatTitle(detail.title);
          return;
        }

        if (id && id !== 'new') {
          getChat(id).then(c => {
            if (c) {
              const chat = c as ChatData;
              setChatTitle(chat.title || 'New Chat');
              setIsShared(chat.isShared === true);
            }
          });
        } else {
          setChatTitle('New Chat');
          setFolderName('');
          setIsShared(false);
        }
      }
    };
    loadChat();
    window.addEventListener('chatUpdated', loadChat);
    return () => window.removeEventListener('chatUpdated', loadChat);
  }, [pathname, hasActiveChat]);

  const handleShareChat = async () => {
    setIsMenuOpen(false);
    const parts = pathname.split('/');
    const id = parts[parts.length - 1];
    if (id && id !== 'new') {
      const shareId = await shareChat(id);
      if (shareId) {
        setIsShared(true);
        const url = `${window.location.origin}/chat/s/${shareId}`;
        navigator.clipboard.writeText(url);
        toast.success(
          <div>
            Chat shared! Link copied.<br />
            <a href={url} target="_blank" rel="noreferrer" className="text-indigo-400 underline mt-1 inline-block text-sm">Open Shared Chat</a>
          </div>,
          { duration: 5000 }
        );
      } else {
        toast.error('Failed to share chat.');
      }
    }
  };

  const handleDownloadChat = async () => {
    setIsMenuOpen(false);
    const parts = pathname.split('/');
    const id = parts[parts.length - 1];
    if (id && id !== 'new') {
      const chatData = await getChat(id);
      if (chatData) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatData, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `chat-${id}.json`);
        dlAnchorElem.click();
        toast.success('Chat downloaded successfully!');
      }
    }
  };

  const handleDeleteChat = async () => {
    setIsMenuOpen(false);
    const parts = pathname.split('/');
    const id = parts[parts.length - 1];
    if (id && id !== 'new') {
      const success = await deleteChat(id);
      if (success) {
        toast.success('Chat deleted');
        router.push('/');
      } else {
        toast.error('Failed to delete chat');
      }
    }
  };

  const unreadNotifications = notifications.filter(notification => notification.unread).length;

  const openProfileSettings = () => {
    setProfileMenuOpen(false);
    openSettings('profile');
  };

  const openGeneralSettings = () => {
    setProfileMenuOpen(false);
    openSettings('general');
  };

  const markNotificationRead = (id: string) => {
    const notification = notifications.find(item => item.id === id);
    const next = markInboxNotificationRead(id);
    setNotifications(next);
    if (notification?.href) {
      setNotificationOpen(false);
      router.push(notification.href);
    } else if (notification?.chatId) {
      setNotificationOpen(false);
      router.push(`/chat/${notification.chatId}`);
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications(markInboxNotificationsRead());
  };

  const clearNotifications = () => {
    setNotifications(clearNotificationInbox());
  };

  const renderNotifications = () => (
    <div className="fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/30 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[340px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-extrabold text-slate-800">Notifications</p>
          <p className="text-xs font-medium text-slate-400">{unreadNotifications > 0 ? `${unreadNotifications} unread` : 'All caught up'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={markAllNotificationsRead} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:text-slate-300" disabled={unreadNotifications === 0}>
            Mark all read
          </button>
          <button onClick={clearNotifications} className="text-xs font-bold text-slate-400 hover:text-red-500 disabled:text-slate-300" disabled={notifications.length === 0}>
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-2">
        {notifications.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Bell className="mx-auto mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm font-bold text-slate-700">No notifications</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Background events will appear here.</p>
          </div>
        ) : notifications.map(notification => (
          <button
            key={notification.id}
            onClick={() => markNotificationRead(notification.id)}
            className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <div className="flex gap-3">
              <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.unread ? notification.severity === 'error' ? 'bg-red-500' : notification.severity === 'warning' ? 'bg-amber-500' : 'bg-indigo-500' : 'bg-slate-200'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold text-slate-800">{notification.title}</p>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">{notification.time}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{notification.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderProfileMenu = () => (
    <div className="fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/30 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-72">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <Image src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'} alt="User" width={44} height={44} unoptimized className="h-11 w-11 rounded-full border border-slate-200 bg-slate-100 object-cover" />
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-800">{profile.name || 'Guest'}</p>
          <p className="truncate text-xs font-medium text-slate-400">{profile.plan || 'No Plan'}</p>
        </div>
      </div>
      <div className="p-2">
        <button onClick={openProfileSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <User className="h-4 w-4 text-slate-400" />
          Edit Profile
        </button>
        <button onClick={openGeneralSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <Settings className="h-4 w-4 text-slate-400" />
          Settings
        </button>
        <button onClick={() => { setProfileMenuOpen(false); toast('Docs are coming soon.'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
          <FileText className="h-4 w-4 text-slate-400" />
          Docs
        </button>
      </div>
    </div>
  );

  if (isSharedChat) {
    return (
      <div className="flex h-dvh flex-col bg-[#F8FAFC] font-sans">
        <div className="flex shrink-0 h-[72px] sm:h-[84px] items-center justify-between px-4 sm:px-8 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3 sm:gap-4 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-[14px] sm:rounded-2xl flex items-center justify-center shadow-md shadow-indigo-200">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <DeepChatWordmarkSvg className="h-7 w-[106px] sm:h-8 sm:w-[120px] text-slate-800" />
          </div>
          <div className="flex items-center" />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
        <Toaster
          position="top-center"
          containerStyle={{ zIndex: 99999 }}
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#fff',
              borderRadius: '16px',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 500,
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white font-sans sm:flex-row dark:bg-slate-950">
      <div className="relative z-20 flex h-[54px] shrink-0 items-center bg-white px-4 dark:bg-slate-950 sm:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileMenuOpen(true)} className="flex h-[35px] w-[35px] items-center justify-center rounded-[12px] bg-[#efeeee] active:scale-95 transition-transform dark:bg-slate-800/80" aria-label="Open menu">
            <div className="flex flex-col items-start gap-[4px]">
              <span className="h-[2.5px] w-[18px] rounded-full bg-[#303030] dark:bg-slate-200" />
              <span className="h-[2.5px] w-[12px] rounded-full bg-[#303030] dark:bg-slate-200" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('openModelSelector'))}
            className="flex h-[35px] items-center justify-center rounded-[12px] bg-[#efeeee] px-[16px] text-black active:scale-95 transition-transform dark:bg-slate-800/80 dark:text-white"
            aria-label="Select model"
          >
            <span className="font-extrabold text-[15px] tracking-tight text-[#1a1a1a] dark:text-slate-100">DeepChat</span>
          </button>
          <button className="flex h-[35px] w-[35px] items-center justify-center rounded-[12px] bg-[#efeeee] text-[#303030] active:scale-95 transition-transform dark:bg-slate-800/80 dark:text-slate-200" aria-label="Search">
            <Search className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setSidebarState}
        isMobileOpen={isMobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        onOpenSettings={openSettings}
        onOpenSearch={handleOpenSearch}
        onOpenActions={handleOpenActions}
      />

      <div className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${hasActiveChat ? 'bg-white shadow-none sm:m-0 sm:rounded-none sm:border-0 dark:bg-slate-950' : 'bg-white shadow-none sm:m-0 sm:rounded-none sm:border-0'}`}>

        {hasActiveChat && (
        <div className="hidden">
          <div className="flex min-w-0 items-center gap-4" />

          <div className="mx-6 max-w-2xl flex-1 xl:mx-12">
            <div className="relative group">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chats, messages, files..."
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-12 pr-14 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner shadow-slate-100/50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-black/20"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <ShortcutCombo keys={shortcuts.search} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 xl:gap-5">
            <div className="flex items-center gap-3">
              <div
                className="relative"
                ref={(node) => {
                  notificationRefs.current[1] = node;
                }}
              >
                <button onClick={() => { setNotificationOpen(open => !open); setProfileMenuOpen(false); }} className="relative p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                  <Bell className="w-6 h-6" />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-indigo-500 px-1 text-[10px] font-bold text-white shadow-sm">
                      {unreadNotifications}
                    </span>
                  )}
                </button>
                {isNotificationOpen && renderNotifications()}
              </div>
              <div
                className="relative"
                ref={(node) => {
                  profileMenuRefs.current[1] = node;
                }}
              >
                <button onClick={() => { setProfileMenuOpen(open => !open); setNotificationOpen(false); }} className="block rounded-full">
                  <Image src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'} alt="User" width={40} height={40} unoptimized className="w-10 h-10 rounded-full border border-slate-200 cursor-pointer object-cover hover:ring-2 hover:ring-indigo-500/30 transition-all shadow-sm" />
                </button>
                {isProfileMenuOpen && renderProfileMenu()}
              </div>
            </div>
          </div>
        </div>
        )}

        {hasActiveChat ? (
          <div className="hidden">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {folderName ? (
                <>
                  <Folder className="w-4 h-4 text-slate-400" />
                  <span className="font-medium hover:text-slate-700 cursor-pointer transition-colors">{folderName}</span>
                  <span className="text-slate-300">›</span>
                </>
              ) : null}
              <span className="font-semibold text-slate-800">{chatTitle || 'Loading...'}</span>
            </div>
            <div className="flex items-center gap-3">
              {isShared && (
                <div className="flex items-center text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm">
                  <Share2 className="w-3 h-3 mr-1.5 text-slate-400" /> Shared
                </div>
              )}
              <div className="relative">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-lg z-50 py-1 origin-top-right animate-in fade-in scale-in-95 duration-200">
                      <button onClick={handleShareChat} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors">
                        <Share2 className="w-4 h-4 text-slate-400" /> Share Link
                      </button>
                      <button onClick={handleDownloadChat} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors">
                        <Download className="w-4 h-4 text-slate-400" /> Download Chat
                      </button>
                      <button onClick={() => setIsMenuOpen(false)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors border-t border-slate-100 mt-1 pt-2">
                        <Edit3 className="w-4 h-4 text-slate-400" /> Rename
                      </button>
                      <button onClick={handleDeleteChat} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors mt-1 border-t border-slate-100 pt-2">
                        <Trash2 className="w-4 h-4 text-red-400" /> Delete Chat
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {children}

      </div>

      <ModelSelector renderTrigger={false} mobileOnly />

      {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} initialTab={settingsInitialTab} />}

      <Toaster
        position="top-center"
        containerStyle={{ zIndex: 99999 }}
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#fff',
            borderRadius: '16px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: 500,
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </div>
  );
}
