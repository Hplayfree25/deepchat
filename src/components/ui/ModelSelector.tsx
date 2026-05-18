'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, Database, Settings, Sparkles } from 'lucide-react';

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

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SelectedModel>(loadStoredModel);

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
    window.addEventListener('storage', syncModel);
    window.addEventListener('modelSelected', syncModel);
    return () => {
      window.removeEventListener('storage', syncModel);
      window.removeEventListener('modelSelected', syncModel);
    };
  }, []);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex h-10 max-w-full items-center gap-1.5 rounded-full px-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 sm:max-w-[9rem] lg:max-w-[13rem]"
        aria-label="Select model"
      >
        <Sparkles className="h-5 w-5 shrink-0" />
        <span className="hidden min-w-0 truncate text-xs font-bold sm:block">{selectedModel.name || selectedModel.id}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
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
    </div>
  );
}

function ModelMenu({ currentModel, onClose, onSelect, onOpenSettings }: {
  currentModel: SelectedModel;
  onClose: () => void;
  onSelect: (modelId: string, modelName: string, connectionId: string) => void;
  onOpenSettings: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [activeCategories, setActiveCategories] = useState<Record<string, string>>({});
  const [modelsCache, setModelsCache] = useState<Record<string, ModelEntry[]>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const modelsCacheRef = useRef<Record<string, ModelEntry[]>>({});

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
        const initialConnection = selectedConnection || conns[0];
        setActiveProvider(initialConnection.id);
        fetchModelsFor(initialConnection);
      }
      setLoading(false);
    });
  }, [currentModel.connectionId, fetchModelsFor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const activeConnection = useMemo(() => connections.find(conn => conn.id === activeProvider), [connections, activeProvider]);
  const activeModels = activeProvider ? modelsCache[activeProvider] || [] : [];
  const categoryModels = activeModels.filter(isModelCategory);
  const flatModels = activeModels.filter((model): model is ModelItem => !isModelCategory(model));
  const activeCategoryName = activeCategories[activeProvider] || categoryModels[0]?.category || '';
  const visibleModels = categoryModels.length > 0
    ? categoryModels.find(category => category.category === activeCategoryName)?.models || []
    : flatModels;
  const modelGridRows = visibleModels.length <= 3 ? 'grid-rows-1' : visibleModels.length <= 6 ? 'grid-rows-2' : 'grid-rows-3';
  const bodyMaxHeight = categoryModels.length > 0 ? 'max-h-[52vh] sm:max-h-[56vh]' : 'max-h-[64vh] sm:max-h-[70vh]';

  const selectProvider = (conn: Connection) => {
    setActiveProvider(conn.id);
    fetchModelsFor(conn);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" />
      <div ref={panelRef} className="fixed bottom-[calc(9.25rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-h-[min(64vh,32rem)] w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40 sm:bottom-[calc(10rem+env(safe-area-inset-bottom))] sm:w-[min(40rem,calc(100vw-3rem))]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-slate-800">Select model</p>
            <p className="truncate text-xs font-medium text-slate-400">{activeConnection ? `${activeConnection.name} / ${activeConnection.provider}` : 'Choose a configured provider'}</p>
          </div>
          <button type="button" onClick={onOpenSettings} className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600">
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
          <div className={`${bodyMaxHeight} overflow-y-auto p-3 sm:p-4`}>
            <div onWheel={scrollHorizontally} className="flex gap-2 overflow-x-auto overscroll-contain pb-3 custom-scrollbar">
              {connections.map(conn => {
                const isActive = conn.id === activeProvider;
                return (
                  <button
                    type="button"
                    key={conn.id}
                    onClick={() => selectProvider(conn)}
                    className={`flex min-w-[160px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all sm:min-w-[190px] ${isActive ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{conn.name}</p>
                      <p className="truncate text-[11px] font-semibold opacity-70">{conn.provider}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {categoryModels.length > 0 && (
              <div onWheel={scrollHorizontally} className="flex gap-2 overflow-x-auto overscroll-contain border-y border-slate-100 py-3 custom-scrollbar">
                {categoryModels.map(category => {
                  const isActive = category.category === activeCategoryName;
                  return (
                    <button
                      type="button"
                      key={category.category}
                      onClick={() => setActiveCategories(prev => ({ ...prev, [activeProvider]: category.category }))}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-extrabold transition-colors ${isActive ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
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
                <div onWheel={scrollHorizontally} className={`grid grid-flow-col auto-cols-[minmax(210px,1fr)] ${modelGridRows} gap-2 overflow-x-auto overscroll-contain pb-2 custom-scrollbar sm:auto-cols-[minmax(240px,1fr)]`}>
                  {visibleModels.map(model => {
                    const isSelected = currentModel.id === model.id && currentModel.connectionId === activeProvider;
                    return (
                      <button
                        type="button"
                        key={model.id}
                        onClick={() => onSelect(model.id, model.name || model.id, activeProvider)}
                        className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${isSelected ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700 hover:border-indigo-200 hover:bg-slate-50'}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold">{model.name || model.id}</p>
                          <p className="truncate text-[11px] font-medium text-slate-400">{model.id}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {model.badge && (
                            <span className="rounded-full bg-white px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-indigo-600 shadow-sm">{model.badge}</span>
                          )}
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
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
