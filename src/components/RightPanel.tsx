'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Zap, MessageSquarePlus, Upload, CheckCircle2, LayoutList, Shield, Search,
  BarChart3, PenTool, Puzzle, Bot, HelpCircle, Globe, Code2,
  LayoutTemplate, Info, Folder, Plus, Download, MessageCircle,
  Share2, Pin, Sparkles, FileText, Database, UserPlus, ArrowUpRight,
  Lightbulb
} from 'lucide-react';
import ComingSoonModal from './ui/ComingSoonModal';
import TipsCarousel from './ui/TipsCarousel';
import { createChat, getChat, shareChat, togglePinChat, updateChatTags } from '@/app/actions';
import { getRandomWorkflows, Workflow } from '@/lib/workflows';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

type AttachedFile = {
  name: string;
  ext: string;
};

type ChatMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  attachedFiles?: AttachedFile[];
  attachedFile?: AttachedFile;
};

type ChatDetails = {
  id: string;
  title?: string;
  createdAt: string;
  messages?: ChatMessage[];
  tags?: string[];
  pinned?: boolean;
  folder?: string;
};

export default function RightPanel({ hasActiveChat }: { hasActiveChat: boolean }) {
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [comingSoonTitle, setComingSoonTitle] = useState('');

  const openComingSoon = (title: string) => {
    setComingSoonTitle(title);
    setComingSoonOpen(true);
  };

  return (
    <>
      {hasActiveChat ? (
        <RightPanelActiveChat openComingSoon={openComingSoon} />
      ) : (
        <RightPanelWelcome openComingSoon={openComingSoon} />
      )}

      <ComingSoonModal
        isOpen={comingSoonOpen}
        onClose={() => setComingSoonOpen(false)}
        title={comingSoonTitle}
      />
    </>
  );
}

function RightPanelWelcome({ openComingSoon }: { openComingSoon: (t: string) => void }) {
  const router = useRouter();
  const [workflows] = useState<Workflow[]>(() => getRandomWorkflows(4));

  const handleStartChat = async (prompt?: string) => {
    const id = await createChat('New Chat');
    router.push(`/chat/${id}${prompt ? `?draft=${encodeURIComponent(prompt)}` : ''}`);
  };

  const getIcon = (name: string, className: string) => {
    const icons: Record<string, React.ReactNode> = {
      Search: <Search className={className} />,
      BarChart3: <BarChart3 className={className} />,
      PenTool: <PenTool className={className} />,
      Puzzle: <Puzzle className={className} />,
      Code2: <Code2 className={className} />,
      Globe: <Globe className={className} />,
      Database: <Database className={className} />,
      FileText: <FileText className={className} />,
      Lightbulb: <Lightbulb className={className} />,
      MessageCircle: <MessageCircle className={className} />
    };
    return icons[name] || <Sparkles className={className} />;
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Zap className="w-4 h-4 text-indigo-500" /> Quick Actions
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <ToolButton onClick={() => handleStartChat()} icon={<MessageSquarePlus className="w-5 h-5 text-indigo-600" />} label="New Chat" />
          <ToolButton onClick={() => openComingSoon("File Manager")} icon={<Folder className="w-5 h-5 text-blue-600" />} label="Files" />
          <ToolButton onClick={() => openComingSoon("Create Task")} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} label="Task" />
          <ToolButton onClick={() => openComingSoon("New Character")} icon={<UserPlus className="w-5 h-5 text-purple-600" />} label="Character" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Shield className="w-4 h-4 text-emerald-500" /> Suggested Workflows
          </div>
        </div>
        <div className="space-y-2">
          {workflows.map(wf => (
            <WorkflowItem
              key={wf.id}
              onClick={() => handleStartChat(wf.prompt)}
              icon={getIcon(wf.icon, "w-4 h-4 text-indigo-500")}
              title={wf.title}
              desc={wf.desc}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Bot className="w-4 h-4 text-indigo-500" /> AI Tools
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <ToolButton onClick={() => handleStartChat("Please summarize the following text:\n\n[\n\n]")} icon={<LayoutList className="w-5 h-5 text-indigo-600" />} label="Summarize" />
          <ToolButton onClick={() => handleStartChat("Can you explain the following concept in simple terms?\n\n[\n\n]")} icon={<HelpCircle className="w-5 h-5 text-blue-600" />} label="Explain" />
          <ToolButton onClick={() => handleStartChat("Translate the following text to English (or specify the language):\n\n[\n\n]")} icon={<Globe className="w-5 h-5 text-emerald-600" />} label="Translate" />
          <ToolButton onClick={() => handleStartChat("Write a code snippet for the following requirement:\n\n[\n\n]")} icon={<Code2 className="w-5 h-5 text-purple-600" />} label="Code" />
        </div>
      </div>

      <TipsCarousel />
    </>
  );
}

function RightPanelActiveChat({ openComingSoon }: { openComingSoon: (t: string) => void }) {
  const pathname = usePathname();
  const [chat, setChat] = useState<ChatDetails | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  useEffect(() => {
    const fetchChatDetails = async () => {
      const parts = pathname.split('/');
      const id = parts[parts.length - 1];
      if (id && id !== 'new') {
        const c = await getChat(id) as ChatDetails | null;
        if (c) {
          setChat(c);
          setTags(c.tags || []);
        }
      }
    };

    fetchChatDetails();

    const handleUpdate = () => fetchChatDetails();
    window.addEventListener('chatUpdated', handleUpdate);
    return () => window.removeEventListener('chatUpdated', handleUpdate);
  }, [pathname]);

  const handleAddTag = async () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updatedTags = [...tags, newTag.trim()];
      setTags(updatedTags);
      if (chat) {
        await updateChatTags(chat.id, updatedTags);
      }
    }
    setNewTag("");
    setShowTagInput(false);
  };

  const handleQuickAction = async (action: string) => {
    if (!chat) return;

    if (action === 'export') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chat, null, 2));
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `chat-${chat.id}.json`);
      dlAnchorElem.click();
      toast.success('Chat exported successfully!');
    } else if (action === 'share') {
      const shareId = await shareChat(chat.id);
      if (shareId) {
        const url = `${window.location.origin}/chat/s/${shareId}`;
        navigator.clipboard.writeText(url);
        toast.success('Shared link copied to clipboard!');
      } else {
        toast.error('Failed to share chat.');
      }
    } else if (action === 'pin') {
      const updated = await togglePinChat(chat.id);
      if (updated) {
        toast.success(updated.pinned ? 'Chat pinned!' : 'Chat unpinned!');
        window.dispatchEvent(new CustomEvent('chatUpdated', { detail: { chatId: chat.id } }));
      }
    }
  };

  if (!chat) return <div className="p-4 text-center text-sm text-slate-500">Loading details...</div>;

  const createdAt = new Date(chat.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const totalMessages = chat.messages?.length || 0;

  let tokensInRaw = 0;
  let tokensOutRaw = 0;
  if (chat.messages) {
    chat.messages.forEach((m) => {
      const length = (m.content || '').length + (m.reasoning || '').length;
      if (m.role === 'user') tokensInRaw += Math.ceil(length / 4);
      else if (m.role === 'assistant') tokensOutRaw += Math.ceil(length / 4);
    });
  }

  const tokensIn = tokensInRaw > 0 ? tokensInRaw + 150 : 0;
  const tokensOut = tokensOutRaw;
  const cacheTokens = totalMessages > 2 ? Math.round(tokensIn * 0.8) : 0;

  const uploadedFiles = (chat.messages || []).reduce<AttachedFile[]>((acc, m) => {
    if (m.attachedFiles && Array.isArray(m.attachedFiles)) {
      acc.push(...m.attachedFiles);
    } else if (m.attachedFile) {
      acc.push(m.attachedFile);
    }
    return acc;
  }, []);

  const generateChartPoints = (color: string) => {
    if (!chat.messages || chat.messages.length === 0) return "0,45 100,45";
    
    const relevantMsgs = chat.messages.filter((m) => color === 'blue' ? m.role === 'user' : m.role === 'assistant');
    if (relevantMsgs.length === 0) return "0,45 100,45";
    
    let points = "0,45 ";
    const stepX = 100 / Math.max(relevantMsgs.length, 1);
    let currentX = 0;
    
    relevantMsgs.forEach((m) => {
      const length = (m.content || '').length + (m.reasoning || '').length;
      const tokens = Math.ceil(length / 4);
      const normalizedHeight = Math.min(Math.max((tokens / 200) * 35, 5), 35);
      const y = 45 - normalizedHeight; 
      currentX += stepX;
      points += `${currentX},${y} `;
    });
    
    if (relevantMsgs.length === 1) {
      const tokens = Math.ceil(((relevantMsgs[0].content || '').length + (relevantMsgs[0].reasoning || '').length) / 4);
      const normalizedHeight = Math.min(Math.max((tokens / 200) * 35, 5), 35);
      points += `100,${45 - normalizedHeight}`;
    }
    
    return points.trim();
  };
  return (
    <>
      <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <LayoutTemplate className="w-4 h-4 text-indigo-500" /> Conversation Details
          </div>
          <button className="text-slate-400 hover:text-slate-600 bg-white p-1.5 rounded-full shadow-sm"><Info className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-xs text-slate-500 font-semibold">Title</span>
            <div className="col-span-2 flex items-start justify-between">
              <span className="text-sm text-slate-800 font-bold leading-tight">{chat.title || 'New Chat'}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <span className="text-xs text-slate-500 font-semibold">Created</span>
            <span className="col-span-2 text-sm text-slate-700 font-medium">{createdAt}</span>
          </div>

          {chat.folder && (
            <div className="grid grid-cols-3 gap-2 items-center">
              <span className="text-xs text-slate-500 font-semibold">Folder</span>
              <div className="col-span-2 flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-slate-700 font-bold bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-sm">{chat.folder}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 items-start">
            <span className="text-xs text-slate-500 font-semibold mt-1">Tags</span>
            <div className="col-span-2 flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={i} className="text-[11px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-1 rounded-full shadow-sm">{tag}</span>
              ))}

              {showTagInput ? (
                <div className="flex items-center gap-1">
                  <input 
                    type="text" 
                    value={newTag} 
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                    autoFocus
                    placeholder="tag..."
                    className="text-[11px] font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full shadow-sm w-16 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ) : (
                <button onClick={() => setShowTagInput(true)} className="text-[11px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded-full hover:bg-slate-50 shadow-sm">
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Upload className="w-4 h-4 text-blue-500" /> Uploaded Files
          </div>
        </div>
        <div className="space-y-2">
          {uploadedFiles.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-[20px] p-4 text-center">
              <p className="text-xs font-semibold text-slate-400">No files uploaded in this chat.</p>
            </div>
          ) : (
            <>
              {uploadedFiles.slice(0, 3).map((f, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-[16px] shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{f.name}</p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">{f.ext}</p>
                  </div>
                </div>
              ))}
              {uploadedFiles.length > 3 && (
                <button 
                  onClick={() => openComingSoon("File Manager")}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[16px] text-xs font-bold text-indigo-600 transition-colors"
                >
                  +{uploadedFiles.length - 3} more
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-green-500" /> Tasks
          </div>
          <button onClick={() => openComingSoon("Agent Tasks")} className="text-xs font-bold text-indigo-600 hover:underline">Add Task</button>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-[24px] shadow-sm text-center">
          <p className="text-sm font-semibold text-slate-500 mb-1">Agent Tasks</p>
          <p className="text-xs text-slate-400">Coming soon for autonomous agents.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Sparkles className="w-4 h-4 text-pink-500" /> Quick Actions
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <ToolButton onClick={() => handleQuickAction('export')} icon={<Download className="w-4 h-4 text-slate-600" />} label="Export" />
          <ToolButton onClick={() => handleQuickAction('share')} icon={<Share2 className="w-4 h-4 text-slate-600" />} label="Share" />
          <ToolButton onClick={() => handleQuickAction('pin')} icon={<Pin className={`w-4 h-4 ${chat.pinned ? 'text-indigo-600' : 'text-slate-600'}`} />} label={chat.pinned ? "Unpin" : "Pin"} />
          <ToolButton onClick={() => openComingSoon("Convert to Agent")} icon={<Bot className="w-4 h-4 text-slate-600" />} label="Agent" />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 relative overflow-hidden shadow-xl mt-4">
        <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between mb-4 relative z-10">
          <span className="font-bold text-white text-sm">Session Activity</span>
        </div>

        {totalMessages === 0 ? (
          <div className="relative z-10 flex flex-col items-center justify-center py-6 text-center">
            <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1">No Activity</p>
            <p className="text-[11px] text-slate-500">Start a conversation to see stats.</p>
          </div>
        ) : (
          <>
            <div className="relative z-10 grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Messages</p>
                <p className="text-2xl font-extrabold text-white">{totalMessages}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">Cache Hits</p>
                <p className="text-2xl font-extrabold text-emerald-400">{cacheTokens.toLocaleString()}</p>
              </div>
            </div>

            <div className="relative z-10 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <div className="w-2 h-2 rounded-sm bg-blue-500"></div> In: {tokensIn.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <div className="w-2 h-2 rounded-sm bg-purple-500"></div> Out: {tokensOut.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="w-full h-16 relative flex items-end overflow-hidden border-b border-slate-700">
                <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="absolute inset-0 w-full h-full stroke-none fill-blue-500/10">
                  <path d={`M0,50 L${generateChartPoints('blue')} L100,50 Z`} />
                  <motion.path 
                    key={`blue-${totalMessages}`}
                    d={`M0,45 L${generateChartPoints('blue')}`} 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="2" 
                    vectorEffect="non-scaling-stroke"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                </svg>
                <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="absolute inset-0 w-full h-full stroke-none fill-purple-500/10">
                  <path d={`M0,50 L${generateChartPoints('purple')} L100,50 Z`} />
                  <motion.path 
                    key={`purple-${totalMessages}`}
                    d={`M0,45 L${generateChartPoints('purple')}`} 
                    fill="none" 
                    stroke="#a855f7" 
                    strokeWidth="2" 
                    vectorEffect="non-scaling-stroke"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                  />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
function WorkflowItem({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-[20px] bg-white border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all text-left group">
      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-50 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500 truncate mt-0.5">{desc}</p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
    </button>
  );
}

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 p-3 rounded-[20px] border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md transition-all group">
      <div className="p-2.5 rounded-2xl bg-slate-50 group-hover:bg-white group-hover:shadow-sm transition-all">
        {icon}
      </div>
      <span className="text-[11px] font-bold text-slate-600 group-hover:text-indigo-700 text-center leading-tight">{label}</span>
    </button>
  );
}
