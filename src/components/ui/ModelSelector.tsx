'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, Database, Settings, Sparkles, ArrowRight } from 'lucide-react';
import { useShortcutLabels } from '@/components/shortcuts';
import Tooltip from '@/components/ui/Tooltip';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';

interface SelectedModel {
  id: string;
  name: string;
  connectionId: string;
}

interface Connection {
  id: string;
  provider: string;
  name: string;
}

interface ModelItem {
  id: string;
  name?: string;
  badge?: string;
}

interface ModelCategory {
  category: string;
  models: ModelItem[];
}

type ModelEntry = ModelItem | ModelCategory;

const defaultModel: SelectedModel = { id: 'GPT-4o', name: 'GPT-4o', connectionId: '' };
const isModelCategory = (model: ModelEntry | undefined): model is ModelCategory => Boolean(model && 'category' in model);
const scrollHorizontally = (event: React.WheelEvent<HTMLElement>) => {
  const target = event.currentTarget;
  if (target.scrollWidth <= target.clientWidth) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  target.scrollLeft += delta;
};

const loadStoredModel = (): SelectedModel => {
  if (typeof window === 'undefined') return defaultModel;
  const savedModel = localStorage.getItem('selectedModelObj');
  if (savedModel) {
    try {
      const parsed = JSON.parse(savedModel) as Partial<SelectedModel>;
      if (parsed.id) return { id: parsed.id, name: parsed.name || parsed.id, connectionId: parsed.connectionId || '' };
    } catch {
      return defaultModel;
    }
  }
  const oldModel = localStorage.getItem('selectedModel');
  return oldModel ? { id: oldModel, name: oldModel, connectionId: '' } : defaultModel;
};

export default function ModelSelector({ renderTrigger = true, mobileOnly = false, desktopOnly = false }: { renderTrigger?: boolean; mobileOnly?: boolean; desktopOnly?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SelectedModel>(loadStoredModel);
  const shortcuts = useShortcutLabels();

  const handleSelect = (modelId: string, modelName: string, connectionId: string) => {
    const nextModel = { id: modelId, name: modelName, connectionId };
    setSelectedModel(nextModel);
    localStorage.setItem('selectedModelObj', JSON.stringify(nextModel));
    localStorage.setItem('selectedModel', modelId);
    window.dispatchEvent(new CustomEvent('modelSelected', { detail: nextModel }));
    setIsOpen(false);
  };

  useEffect(() => {
    const syncModel = () => setSelectedModel(loadStoredModel());
    const openModelSelector = () => {
      const isDesktop = window.matchMedia('(min-width: 640px)').matches;
      if (mobileOnly && isDesktop) return;
      if (desktopOnly && !isDesktop) return;
      setIsOpen(true);
    };
    const closeModelSelector = () => setIsOpen(false);
    window.addEventListener('storage', syncModel);
    window.addEventListener('modelSelected', syncModel);
    window.addEventListener('openModelSelector', openModelSelector);
    window.addEventListener('closeModelSelector', closeModelSelector);
    return () => {
      window.removeEventListener('storage', syncModel);
      window.removeEventListener('modelSelected', syncModel);
      window.removeEventListener('openModelSelector', openModelSelector);
      window.removeEventListener('closeModelSelector', closeModelSelector);
    };
  }, [desktopOnly, mobileOnly]);

  useEffect(() => {
    if (isOpen) window.dispatchEvent(new Event('modelSelectorOpened'));
  }, [isOpen]);

  const menu = (
    <AnimatePresence>
      {isOpen && (
        <ModelMenu
          currentModel={selectedModel}
          onClose={() => setIsOpen(false)}
          onSelect={handleSelect}
          onOpenSettings={() => {
            setIsOpen(false);
            window.dispatchEvent(new Event('openSettings'));
          }}
        />
      )}
    </AnimatePresence>
  );

  if (!renderTrigger) return menu;

  return (
    <div className="relative min-w-0">
      <Tooltip label="Select Model" shortcuts={[{ label: shortcuts.selectModel.join('+'), tone: 'muted' }]} side="bottom" disabled={isOpen}>
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className={desktopOnly
            ? "flex items-center text-[15px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors px-1"
            : "flex h-10 max-w-full items-center gap-1.5 rounded-full px-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 sm:max-w-[9rem] lg:max-w-[13rem]"}
          aria-label="Select model"
        >
          {!desktopOnly && <Sparkles className="h-5 w-5 shrink-0" strokeWidth={2.35} />}
          <span className={desktopOnly ? "block min-w-0 truncate" : "hidden min-w-0 truncate text-xs font-bold sm:block"}>
            {selectedModel.name || selectedModel.id}
          </span>
          {!desktopOnly && <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
        </button>
      </Tooltip>
      {menu}
    </div>
  );
}

function getProviderLabel(connection: Connection) {
  return connection.name || connection.provider;
}

function sortConnectionsForMobile(connections: Connection[]) {
  const order = ['openai', 'google', 'gemini', 'vertex', 'nvidia', 'deepseek'];
  return [...connections].sort((a, b) => {
    const aValue = `${a.provider} ${a.name}`.toLowerCase();
    const bValue = `${b.provider} ${b.name}`.toLowerCase();
    const aIndex = order.findIndex(item => aValue.includes(item));
    const bIndex = order.findIndex(item => bValue.includes(item));
    return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
  });
}

function ModelMenu({ currentModel, onClose, onSelect, onOpenSettings }: {
  currentModel: SelectedModel;
  onClose: () => void;
  onSelect: (modelId: string, modelName: string, connectionId: string) => void;
  onOpenSettings: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [activeCategories, setActiveCategories] = useState<Record<string, string>>({});
  const [modelsCache, setModelsCache] = useState<Record<string, ModelEntry[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const modelsCacheRef = useRef<Record<string, ModelEntry[]>>({});
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(!window.matchMedia('(min-width: 640px)').matches);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const fetchModelsFor = useCallback(async (conn: Connection) => {
    if (modelsCacheRef.current[conn.id]) return;
    setFetchingModels(prev => ({ ...prev, [conn.id]: true }));
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conn)
      });
      const data = await res.json() as { models?: ModelEntry[] };
      const models = data.models || [];
      modelsCacheRef.current = { ...modelsCacheRef.current, [conn.id]: models };
      setModelsCache(modelsCacheRef.current);
      const firstCategory = models.find(isModelCategory);
      if (firstCategory) {
        setActiveCategories(prev => ({ ...prev, [conn.id]: prev[conn.id] || firstCategory.category }));
      }
    } catch {
      modelsCacheRef.current = { ...modelsCacheRef.current, [conn.id]: [] };
      setModelsCache(modelsCacheRef.current);
    }
    setFetchingModels(prev => ({ ...prev, [conn.id]: false }));
  }, []);

  useEffect(() => {
    import('@/app/actions').then(async actions => {
      const conns = await actions.getConnections() as Connection[];
      setConnections(conns);
      if (conns.length > 0) {
        const selectedConnection = conns.find(conn => conn.id === currentModel.connectionId);
        const sortedConnections = sortConnectionsForMobile(conns);
        const isMobileViewport = window.matchMedia('(max-width: 639px)').matches;
        const initialConnection = isMobileViewport ? sortedConnections[0] : selectedConnection || sortedConnections[0];
        setActiveProvider(initialConnection.id);
        fetchModelsFor(initialConnection);
      }
      setLoading(false);
    });
  }, [currentModel.connectionId, fetchModelsFor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideMobile = panelRef.current?.contains(target);
      const insideDesktop = desktopPanelRef.current?.contains(target);
      if (!insideMobile && !insideDesktop) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const activeConnection = useMemo(() => connections.find(conn => conn.id === activeProvider), [connections, activeProvider]);
  const displayConnections = useMemo(() => sortConnectionsForMobile(connections), [connections]);
  const activeModels = activeProvider ? modelsCache[activeProvider] || [] : [];
  const categoryModels = activeModels.filter(isModelCategory);
  const flatModels = activeModels.filter((model): model is ModelItem => !isModelCategory(model));
  const activeCategoryName = activeCategories[activeProvider] || categoryModels[0]?.category || '';
  const visibleModels = categoryModels.length > 0
    ? categoryModels.find(category => category.category === activeCategoryName)?.models || []
    : flatModels;
  const modelGridRows = visibleModels.length <= 3 ? 'grid-rows-1' : visibleModels.length <= 6 ? 'grid-rows-2' : 'grid-rows-3';
  const bodyMaxHeight = categoryModels.length > 0 ? 'max-h-[calc(100%-8.5rem)] sm:max-h-[56vh]' : 'max-h-[calc(100%-6.25rem)] sm:max-h-[70vh]';

  const selectProvider = (conn: Connection) => {
    setActiveProvider(conn.id);
    fetchModelsFor(conn);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  if (isMobile) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/45"
        />
        <motion.div
          ref={panelRef}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={{ top: 0.05, bottom: 0.75 }}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="fixed bottom-0 left-0 right-0 z-50 flex h-[min(460px,50dvh)] flex-col rounded-t-[40px] bg-[#e2deda] px-6 pb-6 pt-3 shadow-2xl dark:bg-slate-900"
        >
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-400/30 dark:bg-slate-700/50" />
          
          <div className="flex items-center justify-between mb-4">
            <div className="rounded-full bg-[#efeeee] px-4 py-1.5 dark:bg-slate-800">
              <span className="font-extrabold text-[15px] tracking-tight text-[#1a1a1a] dark:text-slate-100">Select Model</span>
            </div>
          </div>

          <div className="mb-5 rounded-[22px] bg-[#968b85] p-1.5 dark:bg-slate-850">
            <div className="flex items-center justify-between px-3 py-1">
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar min-w-0 flex-1">
                {displayConnections.map((conn, index) => {
                  const isActive = conn.id === activeProvider;
                  return (
                    <React.Fragment key={conn.id}>
                      {index > 0 && <span className="text-[#e2deda] opacity-40 font-light">|</span>}
                      <button
                        type="button"
                        onClick={() => selectProvider(conn)}
                        className={`shrink-0 text-[15px] font-black leading-none transition-colors ${isActive ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60'}`}
                        aria-pressed={isActive}
                      >
                        {getProviderLabel(conn)}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e2deda] text-black active:scale-90 transition-transform dark:bg-slate-700 dark:text-white"
                aria-label="Open settings"
              >
                <ArrowRight className="h-4 w-4 text-black dark:text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {categoryModels.length > 0 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3 mb-1">
              {categoryModels.map(category => {
                const isActive = category.category === activeCategoryName;
                return (
                  <button
                    key={category.category}
                    type="button"
                    onClick={() => setActiveCategories(prev => ({ ...prev, [activeProvider]: category.category }))}
                    className={`h-[27px] shrink-0 rounded-full px-4 text-[12px] font-bold leading-none transition-colors ${isActive ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-[#efeeee] text-black dark:bg-slate-800 dark:text-slate-200'}`}
                  >
                    {category.category}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-x-auto no-scrollbar pb-2">
            {fetchingModels[activeProvider] ? (
              <div className="grid grid-flow-col auto-cols-max grid-rows-3 gap-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="h-9 w-28 animate-pulse rounded-full bg-slate-300/40" />
                ))}
              </div>
            ) : visibleModels.length > 0 ? (
              <div className="grid grid-flow-col auto-cols-max grid-rows-3 gap-3">
                {visibleModels.map(model => {
                  const isSelected = currentModel.id === model.id && currentModel.connectionId === activeProvider;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => onSelect(model.id, model.name || model.id, activeProvider)}
                      className={`flex h-9 min-w-0 shrink-0 items-center justify-center rounded-full bg-[#efeeee] px-4 text-center transition-all active:scale-95 dark:bg-slate-800 ${isSelected ? 'ring-2 ring-[#968b85] dark:ring-slate-500' : ''}`}
                    >
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[13px] font-extrabold text-[#1a1a1a] dark:text-slate-200">{model.name || model.id}</span>
                        {model.badge && (
                          <>
                            <span className="text-[#1a1a1a]/30 dark:text-white/30 font-light text-[13px]">|</span>
                            <span className="rounded-full bg-[#82756e] px-2 py-0.5 text-[9px] font-extrabold text-white leading-none tracking-wide">
                              {model.badge}
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-2xl bg-white/30 text-xs font-bold text-slate-500 dark:bg-slate-800/30">
                No models available
              </div>
            )}
          </div>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" />
      <div ref={desktopPanelRef} className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-1/2 z-50 hidden max-h-[min(64vh,32rem)] w-[min(40rem,calc(100vw-3rem))] -translate-x-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40 sm:block">
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1.5 w-28 rounded-full bg-slate-100/80" />
        </div>
        <div className="flex items-center justify-between gap-3 px-6 pb-4 pt-5 sm:border-b sm:border-slate-100 sm:px-5 sm:py-3">
          <div className="min-w-0 rounded-full bg-[#e3e3e3] px-5 py-2.5 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0">
            <p className="text-[28px] font-black leading-none text-black sm:text-sm sm:text-slate-800">Select Model</p>
            <p className="hidden truncate text-xs font-medium text-slate-400 sm:block">{activeConnection ? `${activeConnection.name} / ${activeConnection.provider}` : 'Choose a configured provider'}</p>
          </div>
          <button type="button" onClick={onOpenSettings} className="hidden shrink-0 items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 sm:flex">
            <Settings className="h-4 w-4" />
            API
          </button>
        </div>

        {loading ? (
          <ModelMenuSkeleton />
        ) : connections.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center px-6 text-center">
            <Database className="mb-3 h-9 w-9 text-slate-300" />
            <p className="text-sm font-extrabold text-slate-700">No API Connected</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Add a connection before choosing a model.</p>
            <button type="button" onClick={onOpenSettings} className="mt-4 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700">
              Configure API
            </button>
          </div>
        ) : (
          <div className={`${bodyMaxHeight} no-scrollbar mx-0 overflow-y-auto rounded-t-[2.75rem] bg-[#e3e3e3] p-6 pt-5 sm:m-0 sm:rounded-none sm:bg-transparent sm:p-4`}>
            <div onWheel={scrollHorizontally} className="no-scrollbar flex items-center gap-0 overflow-x-auto overscroll-contain rounded-full bg-[#c7c4c4] px-3 py-3 sm:gap-2 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0 sm:pb-3">
              {displayConnections.map(conn => {
                const isActive = conn.id === activeProvider;
                return (
                  <button
                    type="button"
                    key={conn.id}
                    onClick={() => selectProvider(conn)}
                    className={`flex min-w-28 shrink-0 items-center justify-center border-r border-black/80 px-4 py-0 text-center transition-all last:border-r-0 sm:min-w-[190px] sm:justify-start sm:gap-3 sm:rounded-2xl sm:border sm:px-3 sm:py-3 sm:text-left ${isActive ? 'text-black sm:border-indigo-200 sm:bg-indigo-55 sm:text-indigo-700' : 'text-black hover:text-slate-700 sm:border-slate-200 sm:text-slate-600 sm:hover:border-slate-300 sm:hover:bg-slate-55'}`}
                  >
                    <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex ${isActive ? 'bg-white text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[28px] font-black leading-none sm:text-sm sm:font-extrabold">{getProviderLabel(conn)}</p>
                      <p className="hidden truncate text-[11px] font-semibold opacity-70 sm:block">{conn.provider}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {categoryModels.length > 0 && (
              <div onWheel={scrollHorizontally} className="hidden gap-2 overflow-x-auto overscroll-contain py-3 no-scrollbar sm:flex sm:border-y sm:border-slate-100">
                {categoryModels.map(category => {
                  const isActive = category.category === activeCategoryName;
                  return (
                    <button
                      type="button"
                      key={category.category}
                      onClick={() => setActiveCategories(prev => ({ ...prev, [activeProvider]: category.category }))}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold transition-colors ${isActive ? 'border-indigo-200 bg-indigo-55 text-indigo-700' : 'border-slate-200 text-slate-505 hover:border-slate-300 hover:text-slate-700'}`}
                    >
                      {category.category}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="pt-3">
              {fetchingModels[activeProvider] ? (
                <ModelGridSkeleton />
              ) : visibleModels.length > 0 ? (
                <div onWheel={scrollHorizontally} className={`no-scrollbar grid grid-flow-col auto-cols-[9.25rem] grid-rows-4 gap-x-8 gap-y-4 overflow-x-auto overscroll-contain pb-2 sm:auto-cols-[minmax(240px,1fr)] ${modelGridRows}`}>
                  {visibleModels.map(model => {
                    const isSelected = currentModel.id === model.id && currentModel.connectionId === activeProvider;
                    return (
                      <button
                        type="button"
                        key={model.id}
                        onClick={() => onSelect(model.id, model.name || model.id, activeProvider)}
                        className={`flex min-h-8 items-center justify-center gap-2 rounded-full border-0 bg-[#c7c4c4] px-3 py-2 text-center text-black transition-all sm:min-h-16 sm:justify-between sm:rounded-2xl sm:border sm:bg-transparent sm:text-left ${isSelected ? 'ring-2 ring-black/20 sm:border-indigo-200 sm:bg-indigo-50 sm:text-indigo-700 sm:ring-0' : 'hover:bg-[#bbb8b8] sm:border-slate-200 sm:text-slate-700 sm:hover:border-indigo-200 sm:hover:bg-slate-55'}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-lg font-medium leading-none sm:text-sm sm:font-extrabold">{model.name || model.id}</p>
                          <p className="hidden truncate text-[11px] font-medium text-slate-400 sm:block">{model.id}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {model.badge && (
                            <span className="rounded-full bg-[#806f6f] px-2 py-1 text-[10px] font-bold text-white shadow-sm sm:bg-white sm:text-[9px] sm:font-extrabold sm:uppercase sm:tracking-wide sm:text-indigo-600">{model.badge}</span>
                          )}
                          {isSelected && <CheckCircle2 className="hidden h-4 w-4 text-indigo-500 sm:block" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-400">
                  No models available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ModelMenuSkeleton() {
  return (
    <div className="h-72 p-4">
      <div className="flex gap-2 overflow-hidden pb-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 px-3 py-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
              <div className="h-2.5 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-y border-slate-100 py-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-slate-100" />
        ))}
      </div>
      <ModelGridSkeleton />
    </div>
  );
}

function ModelGridSkeleton() {
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] grid-rows-3 gap-2 overflow-hidden pb-2 sm:auto-cols-[minmax(240px,1fr)]">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-slate-100 px-3 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="h-2.5 w-36 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-6 w-14 shrink-0 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
