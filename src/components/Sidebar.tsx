'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { getChats, createChat, togglePinChat, archiveChat, deleteChat } from '@/app/actions';
import toast from 'react-hot-toast';
import {
  Bot, Plus, Home, Compass, MessageSquare, LayoutTemplate,
  Book, Puzzle, ChevronDown, Star, Pin, X, MoreVertical, Archive, Trash2, Settings, FileText
} from 'lucide-react';
import { DeepChatWordmarkSvg } from './brand';
import { ShortcutCombo, useShortcutLabels } from './shortcuts';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  isMobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
  onOpenSettings: () => void;
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

export default function Sidebar({ isOpen, setIsOpen, isMobileOpen, setMobileOpen, onOpenSettings }: SidebarProps) {
  const shortcuts = useShortcutLabels();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
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

  const handleNewChat = async () => {
    try {
      const id = await createChat('New Chat');
      toast.success('New chat created!');
      router.push(`/chat/${id}`);
      setMobileOpen(false);
    } catch {
      toast.error('Failed to create chat');
    }
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

  const handleOpenSettings = () => {
    setProfileMenuOpen(false);
    setMobileOpen(false);
    onOpenSettings();
    window.dispatchEvent(new Event('openSettings'));
  };

  const handleSettingsPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    handleOpenSettings();
  };

  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  const renderProfile = () => (
    <div className="relative" ref={profileRef}>
      <div 
        className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-2xl cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={() => setProfileMenuOpen(!profileMenuOpen)}
      >
        <Image src={profile.avatar} alt="User" width={40} height={40} unoptimized className="w-10 h-10 rounded-full border-2 border-slate-700 object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{profile.name}</p>
          <p className="text-xs text-slate-400 truncate">{profile.plan || 'No Plan'}</p>
        </div>
      </div>
      
      {profileMenuOpen && (
        <div className="absolute bottom-16 left-0 right-0 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden">
          <button onPointerDown={handleSettingsPointerDown} onClick={event => event.preventDefault()} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">
            <Settings className="w-4 h-4" /> Settings
          </button>
          <button onClick={() => setProfileMenuOpen(false)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">
            <FileText className="w-4 h-4" /> Docs
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className={`hidden min-h-0 origin-left overflow-hidden sm:flex flex-col bg-[#0f172a] text-slate-300 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,opacity,transform,margin] ${isOpen ? 'w-[248px] xl:w-[260px] m-3 translate-x-0 scale-100 rounded-3xl opacity-100 shadow-xl' : 'w-0 m-0 -translate-x-5 scale-[0.98] opacity-0 pointer-events-none'}`}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-2xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <DeepChatWordmarkSvg className="h-7 w-[105px] text-white transition-all duration-200 group-hover:scale-[1.02]" />
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="group flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5 text-slate-400 transition-all duration-300 hover:bg-white/10 hover:text-white active:scale-90"
            aria-label="Close sidebar"
          >
            <span className="relative h-5 w-5 transition-transform duration-300 group-hover:rotate-90">
              <span className="absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current transition-all duration-300 group-hover:w-4" />
              <span className="absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current transition-all duration-300 group-hover:w-4" />
            </span>
          </button>
        </div>

        <div className="px-4 py-2">
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-2xl font-medium transition-colors shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />
            New Chat
            <span className="ml-auto"><ShortcutCombo keys={shortcuts.newChat} tone="dark" /></span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-2">
          <div className="px-3 space-y-1">
            <NavItem icon={<Home className="w-5 h-5" />} label="Home" onClick={() => router.push('/')} />
            <NavItem icon={<Compass className="w-5 h-5" />} label="Explore" badge="New" />
            <NavItem icon={<MessageSquare className="w-5 h-5" />} label="Threads" />
            <NavItem icon={<LayoutTemplate className="w-5 h-5" />} label="Templates" />
            <NavItem icon={<Book className="w-5 h-5" />} label="Knowledge Base" />
            <NavItem icon={<Puzzle className="w-5 h-5" />} label="Integrations" />
          </div>

          <div className="mt-6 px-3">
            <div 
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3 flex justify-between items-center cursor-pointer hover:text-slate-300"
              onClick={togglePinned}
            >
              Pinned
              <ChevronDown className={`w-3 h-3 transition-transform ${isPinnedOpen ? '' : '-rotate-90'}`} />
            </div>
            {isPinnedOpen && (
              <div className="space-y-0.5">
                {pinnedChats.map((chat) => (
                  <ChatMenuItem 
                    key={chat.id} 
                    chat={chat}
                    active={pathname === `/chat/${chat.id}`}
                    icon={<Star className="w-4 h-4 flex-shrink-0 text-yellow-500" />}
                    onAction={handleAction}
                    onClick={() => router.push(`/chat/${chat.id}`)}
                  />
                ))}
                {pinnedChats.length === 0 && (
                  <div className="text-xs text-slate-500 px-3 py-1">No pinned chats</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 px-3 mb-6">
            <div 
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3 flex justify-between items-center cursor-pointer hover:text-slate-300"
              onClick={toggleRecent}
            >
              Recent Conversations
              <ChevronDown className={`w-3 h-3 transition-transform ${isRecentOpen ? '' : '-rotate-90'}`} />
            </div>
            {isRecentOpen && (
              <div className="space-y-0.5">
                {visibleRecent.map((chat) => (
                  <ChatMenuItem 
                    key={chat.id} 
                    chat={chat}
                    active={pathname === `/chat/${chat.id}`}
                    icon={<Image src={profile.avatar} width={20} height={20} unoptimized className="w-5 h-5 rounded-full border border-slate-700 flex-shrink-0 object-cover" alt="" />}
                    onAction={handleAction}
                    onClick={() => router.push(`/chat/${chat.id}`)}
                  />
                ))}
                
                {unpinnedChats.length > 4 && (
                  <button 
                    onClick={() => setShowAllRecent(!showAllRecent)}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                  >
                    {showAllRecent ? 'Show less' : `Show ${unpinnedChats.length - 4} more`}
                  </button>
                )}
                
                {unpinnedChats.length === 0 && (
                  <div className="text-xs text-slate-500 px-3 py-2">No recent chats</div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-800">
           {renderProfile()}
        </div>
      </div>

      <div className={`fixed inset-0 z-50 flex transition sm:hidden ${isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${isMobileOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileOpen(false)}></div>
          <div className={`relative flex h-full w-[min(88vw,320px)] flex-col overflow-hidden rounded-r-3xl bg-[#0f172a] shadow-2xl transition-transform duration-300 ease-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => { router.push('/'); setMobileOpen(false); }}>
                <div className="w-8 h-8 bg-indigo-600 rounded-2xl flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <DeepChatWordmarkSvg className="h-7 w-[105px] text-white" />
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-slate-300">
              <button onClick={handleNewChat} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-medium text-white shadow-lg shadow-indigo-600/20">
                <Plus className="w-5 h-5" /> New Chat
              </button>
              
              <div className="space-y-1">
                <NavItem icon={<Home className="w-5 h-5" />} label="Home" onClick={() => { router.push('/'); setMobileOpen(false); }} />
                <NavItem icon={<Compass className="w-5 h-5" />} label="Explore" />
                <NavItem icon={<MessageSquare className="w-5 h-5" />} label="Threads" />
                <NavItem icon={<LayoutTemplate className="w-5 h-5" />} label="Templates" />
                <NavItem icon={<Book className="w-5 h-5" />} label="Knowledge Base" />
                <NavItem icon={<Puzzle className="w-5 h-5" />} label="Integrations" />
              </div>
              
              <div className="mt-6">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Pinned</div>
                <div className="space-y-0.5">
                  {pinnedChats.map((chat) => (
                    <ChatMenuItem 
                      key={chat.id} 
                      chat={chat}
                      active={pathname === `/chat/${chat.id}`}
                      icon={<Star className="w-4 h-4 flex-shrink-0 text-yellow-500" />}
                      onAction={handleAction}
                      onClick={() => { router.push(`/chat/${chat.id}`); setMobileOpen(false); }}
                    />
                  ))}
                  {pinnedChats.length === 0 && (
                    <div className="text-xs text-slate-500 px-3 py-1">No pinned chats</div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Recent</div>
                <div className="space-y-0.5">
                  {visibleRecent.map((chat) => (
                    <ChatMenuItem 
                      key={chat.id} 
                      chat={chat}
                      active={pathname === `/chat/${chat.id}`}
                      icon={<Image src={profile.avatar} width={20} height={20} unoptimized className="w-5 h-5 rounded-full border border-slate-700 flex-shrink-0 bg-slate-100 object-cover" alt="" />}
                      onAction={handleAction}
                      onClick={() => { router.push(`/chat/${chat.id}`); setMobileOpen(false); }}
                    />
                  ))}
                  {unpinnedChats.length > 4 && (
                    <button 
                      onClick={() => setShowAllRecent(!showAllRecent)}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                    >
                      {showAllRecent ? 'Show less' : `Show ${unpinnedChats.length - 4} more`}
                    </button>
                  )}
                  {unpinnedChats.length === 0 && (
                    <div className="text-xs text-slate-500 px-3 py-2">No recent chats</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800">
               {renderProfile()}
            </div>
          </div>
        </div>
    </>
  );
}

function NavItem({ icon, label, badge, onClick }: { icon: React.ReactNode, label: string, badge?: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors group">
      <div className="flex items-center gap-3">
        <span className="text-slate-400 group-hover:text-indigo-400 transition-colors">{icon}</span>
        <span className="font-medium text-sm">{label}</span>
      </div>
      {badge && <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}

function ChatMenuItem({ chat, active, icon, onAction, onClick }: { chat: ChatItem, active?: boolean, icon: React.ReactNode, onAction: (action: string, id: string) => void, onClick?: () => void }) {
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
      <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl transition-colors ${active ? 'bg-indigo-600/10 text-indigo-400' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
        <div className="flex items-center gap-3 min-w-0 pr-6">
          {icon}
          <span className={`font-medium text-sm truncate ${active ? 'text-indigo-300' : ''}`}>{chat.title}</span>
        </div>
      </button>
      
      <div className={`absolute right-2 top-1/2 -translate-y-1/2 ${menuOpen ? 'flex' : 'hidden group-hover:flex'}`}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      
      {menuOpen && (
        <div className="absolute right-2 top-8 z-50 w-32 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden py-1">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('pin', chat.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">
            <Pin className="w-3.5 h-3.5" /> {chat.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('archive', chat.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAction('delete', chat.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-slate-700 hover:text-red-300">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
