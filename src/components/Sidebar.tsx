'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { getChats, togglePinChat, archiveChat, deleteChat } from '@/app/actions';
import toast from 'react-hot-toast';
import {
  ChevronDown, Pin, MoreVertical, Archive, Trash2, FileText, User, Brain
} from 'lucide-react';
import { useShortcutLabels } from './shortcuts';
import Tooltip from './ui/Tooltip';
import type { SettingsTab } from './SettingsModal';

type SidebarSettingsTab = Extract<SettingsTab, 'general' | 'profile' | 'personality'>;

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  isMobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
  onOpenSettings: (tab?: SidebarSettingsTab) => void;
  onOpenSearch: () => void;
  onOpenActions: () => void;
}

interface ChatItem {
  id: string;
  title: string;
  pinned?: boolean;
}

const loadStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const saved = localStorage.getItem(key);
  return saved !== null ? saved === 'true' : fallback;
};

export default function Sidebar({ isOpen, setIsOpen, isMobileOpen, setMobileOpen, onOpenSettings, onOpenSearch, onOpenActions }: SidebarProps) {
  const shortcuts = useShortcutLabels();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState(() => loadStoredBoolean('isPinnedOpen', true));
  const [isRecentOpen, setIsRecentOpen] = useState(() => loadStoredBoolean('isRecentOpen', true));
  const [profile, setProfile] = useState({ name: 'Guest', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', plan: '' });

  const togglePinned = () => {
    const val = !isPinnedOpen;
    setIsPinnedOpen(val);
    localStorage.setItem('isPinnedOpen', val.toString());
  };

  const toggleRecent = () => {
    const val = !isRecentOpen;
    setIsRecentOpen(val);
    localStorage.setItem('isRecentOpen', val.toString());
  };
  
  const pathname = usePathname();
  const router = useRouter();

  const loadChats = () => getChats().then(result => setChats(result as ChatItem[]));
  const loadProfile = () => import('@/app/actions').then(m => m.getUserProfile()).then(setProfile);

  useEffect(() => {
    loadChats();
    loadProfile();
    window.addEventListener('chatUpdated', loadChats);
    window.addEventListener('profileUpdated', loadProfile);
    return () => {
      window.removeEventListener('chatUpdated', loadChats);
      window.removeEventListener('profileUpdated', loadProfile);
    };
  }, [pathname]);

  const handleNewChat = () => {
    localStorage.removeItem('deepchat-draft-new');
    window.dispatchEvent(new Event('deepchat:new-home-prompt'));
    router.push('/');
    setMobileOpen(false);
  };

  const handleAction = async (action: string, id: string) => {
    try {
      if (action === 'pin') {
        await togglePinChat(id);
        toast.success('Chat pin toggled');
      } else if (action === 'archive') {
        await archiveChat(id);
        toast.success('Chat archived');
        if (pathname === `/chat/${id}`) router.push('/');
      } else if (action === 'delete') {
        await deleteChat(id);
        toast.success('Chat deleted');
        if (pathname === `/chat/${id}`) router.push('/');
      }
      loadChats();
    } catch {
      toast.error(`Failed to ${action} chat`);
    }
  };

  const pinnedChats = chats.filter(c => c.pinned);
  const unpinnedChats = chats.filter(c => !c.pinned);
  const visibleRecent = showAllRecent ? unpinnedChats : unpinnedChats.slice(0, 4);

  const handleOpenSettings = (tab: SidebarSettingsTab = 'general') => {
    setProfileMenuOpen(false);
    setMobileOpen(false);
    onOpenSettings(tab);
  };

  const handleOpenDocs = () => {
    setProfileMenuOpen(false);
    setMobileOpen(false);
    toast('Docs are available in the project documentation.');
  };

  const profileMenuRefs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideProfileMenu = profileMenuRefs.current.some(node => node?.contains(target));
      if (!isInsideProfileMenu) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  const renderProfile = (variant: 'expanded' | 'mobile', refIndex: number) => {
    const isExpanded = variant === 'expanded';
    const avatarSrc = profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
    return (
    <div className="relative" ref={(node) => { profileMenuRefs.current[refIndex] = node; }}>
      <button
        type="button"
        className={isExpanded
          ? "flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left text-black transition-colors hover:bg-black/5 active:scale-[0.99]"
          : "flex w-full items-center gap-3 rounded-2xl bg-slate-800/50 p-2 text-left transition-colors hover:bg-slate-800 active:scale-[0.99]"}
        onClick={() => setProfileMenuOpen(!profileMenuOpen)}
        aria-expanded={profileMenuOpen}
        aria-label="Open profile menu"
      >
        <Image
          src={avatarSrc}
          alt="User"
          width={isExpanded ? 34 : 40}
          height={isExpanded ? 34 : 40}
          unoptimized
          className={isExpanded
            ? "h-[34px] w-[34px] rounded-full border border-black/10 bg-white object-cover"
            : "h-10 w-10 rounded-full border-2 border-slate-700 object-cover"}
        />
        <div className="flex-1 min-w-0">
          <p className={isExpanded ? "truncate text-[15px] font-medium leading-tight text-black" : "truncate text-sm font-medium text-white"}>{profile.name || 'Guest'}</p>
          <p className={isExpanded ? "truncate text-xs font-medium leading-tight text-[#8f8989]" : "truncate text-xs text-slate-400"}>{profile.plan || 'No Plan'}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${profileMenuOpen ? 'rotate-180' : ''} ${isExpanded ? 'text-[#8f8989]' : 'text-slate-400'}`} strokeWidth={1.75} />
      </button>
      
      {profileMenuOpen && (
        <div className={isExpanded
          ? "absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl shadow-black/10"
          : "absolute bottom-16 left-0 right-0 z-50 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl"}
        >
          <button type="button" onClick={() => handleOpenSettings('general')} className={isExpanded ? "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5" : "flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"}>
            <IconifyFill icon="material-symbols:settings-rounded" className="h-4 w-4 shrink-0" /> Settings
          </button>
          <button type="button" onClick={() => handleOpenSettings('profile')} className={isExpanded ? "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5" : "flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"}>
            <User className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Profile
          </button>
          <button type="button" onClick={() => handleOpenSettings('personality')} className={isExpanded ? "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5" : "flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"}>
            <Brain className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Personalization
          </button>
          <button type="button" onClick={handleOpenDocs} className={isExpanded ? "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5" : "flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"}>
            <FileText className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Docs
          </button>
        </div>
      )}
    </div>
    );
  };

  const renderMobileProfilePill = () => {
    const avatarSrc = profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
    return (
      <div className="relative" ref={(node) => { profileMenuRefs.current[1] = node; }}>
        <div className="flex h-8 items-center gap-1 rounded-full bg-[#e7e5e5] px-1.5">
          <button
            type="button"
            onClick={() => handleOpenSettings('general')}
            className="flex h-6 w-6 items-center justify-center rounded-full text-black transition-colors hover:bg-black/5 active:scale-95"
            aria-label="Open settings"
          >
            <IconifyFill icon="material-symbols:settings-rounded" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setProfileMenuOpen(open => !open)}
            className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#efe7ff] ring-1 ring-black/5 active:scale-95"
            aria-label="Open profile menu"
            aria-expanded={profileMenuOpen}
          >
            <Image src={avatarSrc} alt="User" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />
          </button>
        </div>
        {profileMenuOpen && (
          <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-black/5 bg-[#ffffff] py-1 shadow-xl shadow-black/10">
            <div className="border-b border-black/5 px-3 py-3">
              <p className="truncate text-sm font-semibold text-black">{profile.name || 'Guest'}</p>
              <p className="truncate text-xs font-medium text-[#8f8989]">{profile.plan || 'No Plan'}</p>
            </div>
            <button type="button" onClick={() => handleOpenSettings('profile')} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5">
              <User className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Profile
            </button>
            <button type="button" onClick={() => handleOpenSettings('personality')} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5">
              <Brain className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Personalization
            </button>
            <button type="button" onClick={handleOpenDocs} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-black transition-colors hover:bg-black/5">
              <FileText className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Docs
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`hidden min-h-0 shrink-0 flex-col items-center bg-white py-2 text-black transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:flex dark:bg-slate-950 dark:text-white ${isOpen ? 'w-0 overflow-hidden opacity-0 pointer-events-none' : 'w-[44px] opacity-100'}`}>
        <Tooltip label="Open sidebar" side="right" align="center">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group/collapse-logo mb-6 flex h-8 w-8 items-center justify-center rounded-xl text-black transition-all hover:bg-black/5 active:scale-95 dark:text-white dark:hover:bg-white/10"
            aria-label="Open sidebar"
          >
            <Image src="/icon.svg" alt="DeepChat" width={28} height={28} priority className="h-7 w-7 transition-opacity group-hover/collapse-logo:opacity-0" />
            <IconifyFill icon="mynaui:sidebar-solid" className="absolute h-5 w-5 opacity-0 transition-opacity group-hover/collapse-logo:opacity-100" />
          </button>
        </Tooltip>

        <div className="flex flex-1 flex-col items-center">
          <div className="flex flex-col items-center gap-4">
            <CollapsedSidebarButton label="New Chat" shortcuts={[{ label: shortcuts.newChat.join('+'), tone: 'muted' }]} onClick={handleNewChat}>
              <IconifyFill icon="streamline-flex:pencil-square-solid" className="h-[18px] w-[18px]" />
            </CollapsedSidebarButton>
            <CollapsedSidebarButton label="Search" shortcuts={[{ label: shortcuts.search.join('+'), tone: 'muted' }]} onClick={onOpenSearch}>
              <IconifyFill icon="material-symbols:search-rounded" />
            </CollapsedSidebarButton>
            <CollapsedSidebarButton label="Action menu" onClick={onOpenActions}>
              <IconifyFill icon="material-symbols:action-key" />
            </CollapsedSidebarButton>
          </div>

          <div className="mt-auto flex flex-col items-center gap-4 pb-1">
            <CollapsedSidebarButton label="Settings" onClick={() => handleOpenSettings()}>
              <IconifyFill icon="material-symbols:settings-rounded" />
            </CollapsedSidebarButton>
            <button
              type="button"
              onClick={() => handleOpenSettings('profile')}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
              aria-label="Profile"
            >
              <Image src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'} alt="User" width={28} height={28} unoptimized className="h-7 w-7 rounded-full object-cover" />
            </button>
          </div>
        </div>
      </div>

      <div className={`hidden min-h-0 origin-left overflow-hidden sm:flex flex-col bg-[#efeeee] text-black transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,opacity,transform] ${isOpen ? 'w-[248px] xl:w-[250px] translate-x-0 opacity-100 shadow-[18px_0_45px_rgba(15,23,42,0.06)] rounded-br-[2.35rem]' : 'w-0 -translate-x-4 opacity-0 pointer-events-none'}`}>
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <button type="button" className="flex min-w-0 items-center" onClick={() => router.push('/')} aria-label="DeepChat home">
            <span className="truncate text-[25px] font-medium leading-none tracking-normal text-black">DeepChat</span>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-black transition-colors hover:bg-black/5 active:scale-95"
            aria-label="Close sidebar"
          >
            <IconifyFill icon="mynaui:sidebar-solid" className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 px-3 pb-4 pt-3">
          <div className="space-y-2">
            <ExpandedSidebarMenuItem label="New Chat" icon="streamline-flex:pencil-square-solid" onClick={handleNewChat} />
            <ExpandedSidebarMenuItem label="Library" icon="solar:library-bold-duotone" onClick={() => window.dispatchEvent(new Event('openFileLibrary'))} />
            <ExpandedSidebarMenuItem label="Images" icon="material-symbols:image-rounded" onClick={() => toast('Images are available from the composer image tool.')} />
            <ExpandedSidebarMenuItem label="Project" icon="solar:folder-bold" onClick={() => toast('Projects are coming soon.')} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 custom-scrollbar">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-1.5 text-left text-[16px] font-normal leading-none text-[#8f8989] transition-colors hover:text-black"
            onClick={togglePinned}
          >
            <span>Pin chat</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isPinnedOpen ? '' : '-rotate-90'}`} strokeWidth={1.75} />
          </button>
          <div>
            {isPinnedOpen && (
              <div className="space-y-1">
                {pinnedChats.map((chat) => (
                  <ExpandedChatItem
                    key={chat.id}
                    chat={chat}
                    active={pathname === `/chat/${chat.id}`}
                    onAction={handleAction}
                    onClick={() => router.push(`/chat/${chat.id}`)}
                  />
                ))}
                {pinnedChats.length === 0 && (
                  <div className="px-1 py-1 text-sm font-medium text-[#aaa4a4]">No pinned chats</div>
                )}
              </div>
            )}
          </div>

          <div className={isPinnedOpen ? 'mt-3' : 'mt-0'}>
            <button
              type="button"
              className="flex h-8 w-full items-center gap-1.5 text-left text-[16px] font-normal leading-none text-[#8f8989] transition-colors hover:text-black"
              onClick={toggleRecent}
            >
              <span>Recent</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isRecentOpen ? '' : '-rotate-90'}`} strokeWidth={1.75} />
            </button>
            {isRecentOpen && (
              <div className="space-y-1">
                {visibleRecent.map((chat) => (
                  <ExpandedChatItem
                    key={chat.id}
                    chat={chat}
                    active={pathname === `/chat/${chat.id}`}
                    onAction={handleAction}
                    onClick={() => router.push(`/chat/${chat.id}`)}
                  />
                ))}
                
                {unpinnedChats.length > 4 && (
                  <button 
                    onClick={() => setShowAllRecent(!showAllRecent)}
                    className="mt-1 w-full rounded-xl px-1 py-2 text-left text-sm font-medium text-[#8f8989] transition-colors hover:text-black"
                  >
                    {showAllRecent ? 'Show less' : `Show ${unpinnedChats.length - 4} more`}
                  </button>
                )}
                
                {unpinnedChats.length === 0 && (
                  <div className="px-1 py-2 text-sm font-medium text-[#aaa4a4]">No recent chats</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3 pt-2">
          {renderProfile('expanded', 0)}
        </div>
      </div>

      <div className={`fixed inset-0 z-50 h-dvh sm:hidden ${isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!isMobileOpen}>
        <div className={`relative flex h-dvh w-screen flex-col overflow-hidden bg-[#ffffff] text-black shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <button type="button" className="text-[20px] font-bold leading-none tracking-normal text-black" onClick={() => { router.push('/'); setMobileOpen(false); }}>
              DeepChat
            </button>
            {renderMobileProfilePill()}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-32 pt-6 custom-scrollbar">
            <div className="space-y-5">
              <MobileMenuButton label="Project" icon="solar:folder-bold" onClick={() => toast('Projects are coming soon.')} />
              <MobileMenuButton label="Images" icon="material-symbols:image-rounded" onClick={() => toast('Images are available from the composer image tool.')} />
              <button
                type="button"
                onClick={() => setIsMoreOpen(open => !open)}
                className="flex h-9 w-full items-center gap-7 text-left text-black transition-colors active:scale-[0.99]"
                aria-expanded={isMoreOpen}
              >
                <IconifyFill icon="material-symbols:more-horiz" className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[20px] font-normal leading-none">More</span>
                <ChevronDown className={`ml-auto h-4 w-4 text-[#8f8989] transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} strokeWidth={1.8} />
              </button>
              {isMoreOpen && (
                <div className="ml-[46px] space-y-1">
                  <MobileMoreButton label="Library" onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event('openFileLibrary')); }} />
                  <MobileMoreButton label="Search" onClick={() => { setMobileOpen(false); onOpenSearch(); }} />
                  <MobileMoreButton label="Action menu" onClick={() => { setMobileOpen(false); onOpenActions(); }} />
                  <MobileMoreButton label="Docs" onClick={handleOpenDocs} />
                </div>
              )}
            </div>

            <div className="mt-8">
              <button
                type="button"
                className="flex h-8 w-full items-center gap-1.5 text-left text-[18px] font-semibold leading-none text-[#9b9696] transition-colors hover:text-black"
                onClick={togglePinned}
              >
                <span>Pin chat</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isPinnedOpen ? '' : '-rotate-90'}`} strokeWidth={1.75} />
              </button>
              {isPinnedOpen && (
                <div className="mt-2 space-y-1">
                  {pinnedChats.map((chat) => (
                    <ChatMenuItem
                      key={chat.id}
                      chat={chat}
                      active={pathname === `/chat/${chat.id}`}
                      onAction={handleAction}
                      onClick={() => { router.push(`/chat/${chat.id}`); setMobileOpen(false); }}
                    />
                  ))}
                  {pinnedChats.length === 0 && (
                    <div className="px-0 py-1 text-sm font-medium text-[#aaa4a4]">No pinned chats</div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5">
              <button
                type="button"
                className="flex h-8 w-full items-center gap-1.5 text-left text-[18px] font-semibold leading-none text-[#9b9696] transition-colors hover:text-black"
                onClick={toggleRecent}
              >
                <span>Recent</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isRecentOpen ? '' : '-rotate-90'}`} strokeWidth={1.75} />
              </button>
              {isRecentOpen && (
                <div className="mt-2 space-y-1">
                  {visibleRecent.map((chat) => (
                    <ChatMenuItem
                      key={chat.id}
                      chat={chat}
                      active={pathname === `/chat/${chat.id}`}
                      onAction={handleAction}
                      onClick={() => { router.push(`/chat/${chat.id}`); setMobileOpen(false); }}
                    />
                  ))}
                  {unpinnedChats.length > 4 && (
                    <button
                      onClick={() => setShowAllRecent(!showAllRecent)}
                      className="w-full rounded-xl py-2 text-left text-sm font-medium text-[#8f8989] transition-colors hover:text-black"
                    >
                      {showAllRecent ? 'Show less' : `Show ${unpinnedChats.length - 4} more`}
                    </button>
                  )}
                  {unpinnedChats.length === 0 && (
                    <div className="px-0 py-2 text-sm font-medium text-[#aaa4a4]">No recent chats</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="absolute bottom-6 right-5 z-10 flex h-12 items-center gap-2 rounded-[18px] bg-[#d9d9d9] px-4 text-[18px] font-normal text-black shadow-sm transition-transform active:scale-95"
          >
            <IconifyFill icon="streamline-flex:pencil-square-solid" className="h-[16px] w-[16px]" />
            <span>New Chat</span>
          </button>
        </div>
      </div>
    </>
  );
}

function MobileMenuButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-7 text-left text-black transition-colors active:scale-[0.99]"
    >
      <IconifyFill icon={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="text-[20px] font-normal leading-none">{label}</span>
    </button>
  );
}

function MobileMoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl px-2 py-2 text-left text-[15px] font-medium text-[#5f5a5a] transition-colors hover:bg-black/5 hover:text-black"
    >
      {label}
    </button>
  );
}

function CollapsedSidebarButton({ children, label, shortcuts = [], onClick }: { children: React.ReactNode; label: string; shortcuts?: Array<{ label: string; tone: 'muted' }>; onClick: () => void }) {
  return (
    <Tooltip label={label} shortcuts={shortcuts} side="right" align="center">
      <button
        type="button"
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-black/80 transition-all hover:bg-black/5 hover:text-black active:scale-95 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ExpandedSidebarMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-8 w-full items-center gap-2.5 rounded-xl px-1.5 text-left text-black/90 transition-all hover:bg-black/5 hover:text-black active:scale-[0.99]"
    >
      <IconifyFill icon={icon} className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105" />
      <span className="truncate text-[20px] font-medium leading-none tracking-normal">{label}</span>
    </button>
  );
}

function IconifyFill({ icon, className = 'h-5 w-5' }: { icon: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} bg-current`}
      style={{
        WebkitMaskImage: `url("https://api.iconify.design/${icon}.svg")`,
        maskImage: `url("https://api.iconify.design/${icon}.svg")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain'
      }}
    />
  );
}

function ExpandedChatItem({ chat, active, onAction, onClick }: { chat: ChatItem; active?: boolean; onAction: (action: string, id: string) => void; onClick?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <div
        className={`group flex h-8 w-full items-center justify-between gap-2 rounded-xl px-1.5 text-left transition-colors ${active ? 'bg-black/5 text-black' : 'text-black/90 hover:bg-black/5 hover:text-black'}`}
      >
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate text-left text-[16px] font-normal leading-none"
        >
          {chat.title}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(open => !open);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#8f8989] opacity-0 transition-all hover:bg-black/5 hover:text-black group-hover:opacity-100"
          aria-label={`Open ${chat.title} menu`}
        >
          <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-8 z-50 w-32 overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl shadow-black/10">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('pin', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black transition-colors hover:bg-black/5">
            <Pin className="h-3.5 w-3.5" /> {chat.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('archive', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black transition-colors hover:bg-black/5">
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('delete', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ChatMenuItem({ chat, active, icon, onAction, onClick }: { chat: ChatItem, active?: boolean, icon?: React.ReactNode, onAction: (action: string, id: string) => void, onClick?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative group" ref={menuRef}>
      <button onClick={onClick} className={`flex h-9 w-full items-center justify-between rounded-xl py-1.5 pr-9 text-left transition-colors ${active ? 'bg-black/5 text-black' : 'text-black hover:bg-black/5'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-[16px] font-normal leading-none">{chat.title}</span>
        </div>
      </button>
      
      <div className={`absolute right-2 top-1/2 -translate-y-1/2 ${menuOpen ? 'flex' : 'hidden group-hover:flex'}`}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} className="rounded-lg p-1.5 text-[#8f8989] transition-colors hover:bg-black/5 hover:text-black">
          <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      
      {menuOpen && (
        <div className="absolute right-2 top-8 z-50 w-32 overflow-hidden rounded-xl border border-black/5 bg-[#ffffff] py-1 shadow-xl shadow-black/10">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('pin', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black transition-colors hover:bg-black/5">
            <Pin className="h-3.5 w-3.5" /> {chat.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('archive', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-black transition-colors hover:bg-black/5">
            <Archive className="h-3.5 w-3.5" /> Archive
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('delete', chat.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
