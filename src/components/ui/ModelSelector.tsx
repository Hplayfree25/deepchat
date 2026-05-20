'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, Database, Settings, Sparkles, ArrowRight, X } from 'lucide-react';
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
            ? "flex h-8 max-w-[5.75rem] items-center justify-center rounded-full px-2 text-[13px] font-medium text-[#202020] transition-colors hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10 lg:max-w-[6.75rem]"
            : "flex h-10 max-w-full items-center gap-1.5 rounded-full px-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 sm:max-w-[9rem] lg:max-w-[13rem]"}
          aria-label="Select model"
        >
          {!desktopOnly && <Sparkles className="h-5 w-5 shrink-0" strokeWidth={2.35} />}
          <span className={desktopOnly ? "block min-w-0 truncate leading-none" : "hidden min-w-0 truncate text-xs font-bold sm:block"}>
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 hidden bg-white/90 sm:block"
      />
      <motion.div
        ref={desktopPanelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select Model"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.985 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="deepchat-model-selector-light fixed left-1/2 top-1/2 z-50 hidden h-[min(58vh,30rem)] w-[min(88vw,60rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2.15rem] border border-[#e6dfdf] bg-white sm:block"
      >
        <div className="flex h-full flex-col px-6 pb-6 pt-5 lg:px-7 lg:pb-7 lg:pt-6">
          <div className="mb-5 flex shrink-0 items-start justify-between gap-5">
            <div className="min-w-0">
              <h2 className="text-[34px] font-medium leading-none tracking-normal text-black lg:text-[38px]">Select Model</h2>
              <p className="mt-2 text-sm font-medium text-[#8e8888]">
                {activeConnection ? `${activeConnection.name || activeConnection.provider} models` : 'Choose a configured provider'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-10 items-center gap-2 rounded-full bg-[#f4f1f1] px-3.5 text-sm font-semibold text-black transition-colors hover:bg-[#ece8e8]"
              >
                <Settings className="h-4 w-4" />
                API
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f1f1] text-black transition-colors hover:bg-[#ece8e8]"
                aria-label="Close model selector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-[1.65rem] bg-[#f5f2f2] p-4">
              <ModelMenuSkeleton />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[1.65rem] bg-[#f7f4f4] px-6 text-center">
              <Database className="mb-4 h-10 w-10 text-[#b7b0b0]" />
              <p className="text-lg font-semibold text-black">No API Connected</p>
              <p className="mt-2 text-sm font-medium text-[#8e8888]">Add a connection before choosing a model.</p>
              <button type="button" onClick={onOpenSettings} className="mt-6 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a2a]">
                Configure API
              </button>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] gap-5">
              <aside className="flex min-h-0 flex-col rounded-[1.65rem] bg-[#f5f2f2] p-4 shadow-inner shadow-white">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b9595]">Providers</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8d8787]">{displayConnections.length}</span>
                </div>
                <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {displayConnections.map(conn => {
                    const isActive = conn.id === activeProvider;
                    return (
                      <button
                        type="button"
                        key={conn.id}
                        onClick={() => selectProvider(conn)}
                        className={`flex w-full items-center gap-2.5 rounded-[1.25rem] px-3 py-3 text-left transition-all ${isActive ? 'bg-white text-black shadow-lg shadow-black/5' : 'text-[#7e7777] hover:bg-white/70 hover:text-black'}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isActive ? 'bg-[#efeeee]' : 'bg-white'}`}>
                          <Bot className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold leading-tight">{getProviderLabel(conn)}</span>
                          <span className="mt-1 block truncate text-xs font-medium text-[#9b9595]">{conn.provider}</span>
                        </span>
                        {isActive && <CheckCircle2 className="h-4 w-4 shrink-0 text-black" />}
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="flex min-h-0 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-semibold text-black">{activeConnection ? getProviderLabel(activeConnection) : 'Models'}</p>
                    <p className="mt-0.5 text-sm font-medium text-[#9b9595]">{visibleModels.length} available models</p>
                  </div>
                  {currentModel.id && (
                    <div className="hidden max-w-[18rem] rounded-full bg-[#f5f2f2] px-4 py-2 text-sm font-medium text-[#7f7878] lg:block">
                      <span className="text-[#aaa3a3]">Current</span> {currentModel.name || currentModel.id}
                    </div>
                  )}
                </div>

                <div className="mb-3 shrink-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9b9595]">Categories</p>
                  <div onWheel={scrollHorizontally} className="no-scrollbar flex gap-2 overflow-x-auto overscroll-contain pb-1">
                    {categoryModels.length > 0 ? categoryModels.map(category => {
                      const isActive = category.category === activeCategoryName;
                      return (
                        <button
                          type="button"
                          key={category.category}
                          onClick={() => setActiveCategories(prev => ({ ...prev, [activeProvider]: category.category }))}
                          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${isActive ? 'model-selector-invert bg-black text-white' : 'bg-[#f5f2f2] text-[#7f7878] hover:bg-[#ece8e8] hover:text-black'}`}
                        >
                          {category.category}
                        </button>
                      );
                    }) : (
                      <span className="model-selector-invert rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">All Models</span>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-[1.65rem] bg-[#faf8f8] p-3">
                  {fetchingModels[activeProvider] ? (
                    <ModelGridSkeleton />
                  ) : visibleModels.length > 0 ? (
                    <div className="custom-scrollbar grid max-h-full grid-cols-2 gap-2.5 overflow-y-auto pr-1 xl:grid-cols-3">
                      {visibleModels.map(model => {
                        const isSelected = currentModel.id === model.id && currentModel.connectionId === activeProvider;
                        return (
                          <button
                            type="button"
                            key={model.id}
                            onClick={() => onSelect(model.id, model.name || model.id, activeProvider)}
                            className={`group flex min-h-[5.75rem] flex-col justify-between rounded-[1.15rem] border p-3 text-left transition-all ${isSelected ? 'border-black bg-white shadow-lg shadow-black/5' : 'border-transparent bg-white/75 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:shadow-black/5'}`}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-black">{model.name || model.id}</span>
                                <span className="mt-1 block truncate text-xs font-medium text-[#9b9595]">{model.id}</span>
                              </span>
                              {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-black" />}
                            </span>
                            <span className="mt-4 flex items-center justify-between gap-3">
                              <span className="rounded-full bg-[#f1eeee] px-3 py-1 text-xs font-semibold text-[#8a8383]">
                                {activeCategoryName || 'Model'}
                              </span>
                              {model.badge && (
                                <span className="model-selector-invert rounded-full bg-black px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">{model.badge}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[1.5rem] bg-white text-sm font-semibold text-[#9b9595]">
                      No models available
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </motion.div>
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
