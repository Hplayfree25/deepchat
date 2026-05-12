import React from 'react';
import { getSharedChat } from '@/app/actions';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { Bot, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import TryDeepChatCTA from '@/components/ui/TryDeepChatCTA';
import Image from 'next/image';

type SharedChatMessage = {
  id: string;
  role: string;
  content?: string;
  reasoning?: string;
  isError?: boolean;
};

type SharedChat = {
  title?: string;
  ownerProfile?: {
    avatar?: string;
    name?: string;
  };
  messages: SharedChatMessage[];
};

export default async function SharedChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = await getSharedChat(id) as SharedChat | null;

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-20 h-20 bg-white shadow-xl shadow-slate-200/50 rounded-3xl flex items-center justify-center mb-8 border border-slate-100">
          <MessageSquare className="w-10 h-10 text-slate-300" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Chat Not Found</h1>
        <p className="text-slate-500 mb-10 max-w-md text-center text-lg">This shared conversation might have been deleted or the link is invalid.</p>
        <Link href="/" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-200 transition-all active:scale-95">
          Go to DeepChat
        </Link>
      </div>
    );
  }

  const ownerProfile = chat.ownerProfile || {};
  const ownerAvatar = ownerProfile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
  const ownerName = ownerProfile.name || 'User';

  return (
    <div className="w-full bg-[#F8FAFC] font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col relative pb-20">
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/40 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-200/40 rounded-full blur-[120px] pointer-events-none z-0"></div>

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 z-10">

        <div className="flex flex-col items-center justify-center mb-16 text-center animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-30 rounded-full"></div>
            <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[20px] shadow-lg shadow-indigo-200 border border-white/20">
              <Bot className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight mb-4 leading-tight">
            {chat.title}
          </h1>
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-slate-200/60 px-4 py-1.5 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
              Shared Conversation
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-8 sm:gap-10">
          {chat.messages.map((msg, index: number) => {
            const isUser = msg.role === 'user';
            const hasReasoning = !isUser && msg.reasoning;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-4 sm:gap-6 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
              >
                <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 border shadow-sm mt-1 overflow-hidden ${isUser ? 'bg-white border-slate-200' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100'}`}>
                  {isUser ? (
                    <Image src={ownerAvatar} alt={ownerName} fill sizes="48px" unoptimized className="object-cover" />
                  ) : (
                    <Bot className="w-6 h-6 text-indigo-600" />
                  )}
                </div>

                <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                  {hasReasoning && (
                    <details className="mb-3 max-w-full w-full bg-[#0F172A] border border-slate-800 rounded-2xl p-4 shadow-xl group cursor-pointer transition-all duration-300">
                      <summary className="flex items-center gap-3 text-slate-300 hover:text-white font-bold text-sm select-none list-none [&::-webkit-details-marker]:hidden outline-none">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-indigo-400 group-open:animate-pulse" />
                        </div>
                        <span className="font-mono tracking-tight">AI Reasoning Process</span>
                        <div className="ml-auto text-[11px] font-mono font-medium px-2 py-1 rounded bg-slate-800 text-slate-400 group-open:hidden border border-slate-700">
                          EXPAND
                        </div>
                      </summary>
                      <div className="mt-4 pt-4 border-t border-slate-800/80 text-slate-400 text-[13.5px] font-mono whitespace-pre-wrap leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300">
                        {msg.reasoning}
                      </div>
                    </details>
                  )}

                  {msg.content && (
                    <div className={`max-w-full rounded-[1.5rem] px-4 py-3 shadow-sm sm:rounded-[28px] sm:px-7 sm:py-5 ${isUser
                      ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-200'
                      : msg.isError
                        ? 'bg-red-50 border border-red-100 text-red-800 rounded-tl-sm'
                        : 'bg-white border border-slate-200/60 text-slate-800 rounded-tl-sm'
                      }`}>
                      {isUser ? (
                        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed sm:text-[17px]">
                          {msg.content}
                        </div>
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <TryDeepChatCTA />

      </div>
    </div>
  );
}
