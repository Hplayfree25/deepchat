'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import NextImage from 'next/image';
import { X, User, Link as LinkIcon, Cpu, Settings as SettingsIcon, Plus, Bot, CheckCircle2, Loader2, AlertCircle, Zap, RefreshCw, Database, Trash2, ShieldAlert, MessageSquare, Brain, HelpCircle, Archive, Download, Search, ExternalLink, Copy, Bell, BellRing, Monitor, Volume2 } from 'lucide-react';
import { getUserProfile, saveUserProfile, getConnections, saveConnection, deleteConnection, deleteAllChats, deleteAllConnections, getSharedLinks, getArchivedChats, archiveAllChats, exportData, deleteChat, getLLMSettings, saveLLMSettings, type LLMSettings } from '@/app/actions';
import { getPersona, savePersona } from '@/app/persona';
import { clearSavedMemories, deleteSavedMemory, getSavedMemories, type SavedMemory } from '@/app/memory';
import CustomDropdown from './ui/CustomDropdown';
import CustomModelDropdown from './ui/CustomModelDropdown';
import geminiModels from '@/lib/gemini-models';
import {
  defaultNotificationSettings,
  loadNotificationSettings,
  notificationEventLabels,
  requestPushPermission,
  saveNotificationSettings,
  type NotificationEventSetting,
  type NotificationEventKey,
  type NotificationSettings
} from '@/lib/notification-settings';
import {
  ACCENT_COLOR_OPTIONS,
  APPEARANCE_OPTIONS,
  CONTRAST_OPTIONS,
  defaultGeneralSettings,
  loadGeneralSettings,
  saveGeneralSettings,
  type GeneralSettings
} from '@/lib/general-settings';
import { LANGUAGE_OPTIONS } from '@/lib/languages';
import {
  MCP_CATALOG,
  defaultMCPSettings,
  installMCPServer,
  loadMCPSettings,
  toggleMCPServer,
  uninstallMCPServer,
  updateMCPServerConfig,
  type MCPCatalogServer,
  type InstalledMCPServer,
  type MCPServerCategory,
  type MCPSettings
} from '@/lib/mcp-settings';
import {
  TOOL_CATALOG,
  defaultToolSettings,
  installTool,
  loadToolSettings,
  toggleTool,
  uninstallTool,
  updateToolConfig,
  updateToolFeatureSettings,
  type InstalledTool,
  type ToolCategory,
  type ToolSettings
} from '@/lib/tool-settings';

const STYLE_TONE_OPTIONS = [
  { label: 'Default', value: 'default', description: 'Standard AI behavior.' },
  { label: 'Professional', value: 'professional', description: 'Formal, polite, and objective.' },
  { label: 'Friendly', value: 'friendly', description: 'Warm, approachable, and conversational.' },
  { label: 'Direct', value: 'direct', description: 'Straight to the point, no fluff.' },
  { label: 'Playful', value: 'playful', description: 'Fun, witty, and slightly informal.' },
  { label: 'Efficient', value: 'efficient', description: 'Highly concise, focusing only on answers.' },
  { label: 'Sarcastic', value: 'sarcastic', description: 'Dry humor, slightly cynical but helpful.' },
];

const WARMTH_OPTIONS = [
  { label: 'Default', value: 'default', description: 'Standard warmth.' },
  { label: 'Less', value: 'less', description: 'More clinical.' },
  { label: 'More', value: 'more', description: 'Highly empathetic.' }
];

const ENTHUSIASTIC_OPTIONS = [
  { label: 'Default', value: 'default', description: 'Standard enthusiasm.' },
  { label: 'Less', value: 'less', description: 'Calm and collected.' },
  { label: 'More', value: 'more', description: 'Highly energetic.' }
];

const HEADERS_OPTIONS = [
  { label: 'Default', value: 'default', description: 'Standard formatting.' },
  { label: 'Less', value: 'less', description: 'Prefers paragraphs.' },
  { label: 'More', value: 'more', description: 'Highly structured.' }
];

const EMOJI_OPTIONS = [
  { label: 'Default', value: 'default', description: 'Standard emoji use.' },
  { label: 'Less', value: 'less', description: 'Rarely uses emojis.' },
  { label: 'More', value: 'more', description: 'Expressive with emojis.' }
];

const PROVIDER_OPTIONS = ['OpenAI Compatible', 'OpenAI', 'Anthropic', 'Deepseek', 'Mistral', 'NVIDIA NIM', 'Gemini', 'VertexAI'];
const VERTEX_LOCATION_OPTIONS = ['us-central1', 'us-east4', 'us-west1', 'europe-west4', 'europe-west1', 'asia-southeast1', 'asia-northeast1'];
const REASONING_LEVEL_OPTIONS = [
  { label: 'Minimal', value: 'minimal', description: 'Fastest thinking budget for simple prompts.' },
  { label: 'Low', value: 'low', description: 'Light reasoning with lower latency.' },
  { label: 'Medium', value: 'medium', description: 'Balanced thinking for everyday tasks.' },
  { label: 'High', value: 'high', description: 'Deeper reasoning for complex work.' },
  { label: 'Heavy', value: 'heavy', description: 'Maximum thinking preference when supported.' }
];
const DEFAULT_BASE_URL_BY_PROVIDER: Record<string, string> = {
  Mistral: 'https://api.mistral.ai',
  'NVIDIA NIM': 'https://integrate.api.nvidia.com'
};
const NOTIFICATION_EVENT_KEYS = Object.keys(defaultNotificationSettings.events) as NotificationEventKey[];
const MCP_CATEGORY_OPTIONS = ['All', ...Array.from(new Set(MCP_CATALOG.map(server => server.category)))] as Array<'All' | MCPServerCategory>;
const MCP_AVAILABILITY_OPTIONS = ['All', 'offline', 'online'] as Array<'All' | 'offline' | 'online'>;
const TOOL_CATEGORY_OPTIONS = ['All', ...Array.from(new Set(TOOL_CATALOG.map(tool => tool.category)))] as Array<'All' | ToolCategory>;

const Cropper = dynamic(() => import('react-easy-crop'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-950/30 p-6">
      <div className="h-full max-h-64 w-full max-w-64 animate-pulse rounded-3xl border border-white/15 bg-white/15" />
    </div>
  )
});

export type SettingsTab = 'general' | 'profile' | 'personality' | 'connection' | 'notifications' | 'mcp' | 'tools' | 'agent' | 'data';
type VerifyStepStatus = 'pending' | 'loading' | 'success' | 'error';

interface UserProfile {
  id?: string;
  name: string;
  avatar: string;
  plan: string;
}

interface Connection {
  id: string;
  provider: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  projectId: string;
  location: string;
  model: string;
}

interface SharedLinkItem {
  id: string;
  title: string;
  shareId: string;
  createdAt: string;
  messageCount: number;
}

interface ArchivedChatItem {
  id: string;
  title: string;
  createdAt: string;
  messages?: unknown[];
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
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
type ModelCollection = ModelEntry[];
type ConfirmAction = 'deleteChats' | 'deleteConnections';

interface ConfirmDialogState {
  action: ConfirmAction;
  title: string;
  description: string;
  confirmLabel: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const isModelCategory = (model: ModelEntry | undefined): model is ModelCategory => Boolean(model && 'category' in model);
const getVertexBaseUrl = (location: string) => `https://${location}-aiplatform.googleapis.com`;
const getDefaultBaseUrl = (provider: string) => DEFAULT_BASE_URL_BY_PROVIDER[provider] || '';
const dedupeModelItems = (models: ModelItem[]) => {
  const seen = new Set<string>();
  return models.filter(model => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
};
const dedupeModelCollection = (models: ModelCollection): ModelCollection => models.map(model => (
  isModelCategory(model)
    ? { ...model, models: dedupeModelItems(model.models) }
    : model
)).filter((model, index, collection) => {
  if (isModelCategory(model)) return model.models.length > 0;
  return !collection.slice(0, index).some(item => !isModelCategory(item) && item.id === model.id);
});
const modalAnimationMs = 180;

export default function SettingsModal({ isOpen, onClose, initialTab = 'general' }: SettingsModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(defaultGeneralSettings);
  const [profile, setProfile] = useState<UserProfile>({ name: '', avatar: '', plan: '' });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false);
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
  const [isAddConnectionClosing, setIsAddConnectionClosing] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [isConnectionProfilesOpen, setIsConnectionProfilesOpen] = useState(false);
  const [llmStreamingResponse, setLlmStreamingResponse] = useState(true);
  const [llmReasoning, setLlmReasoning] = useState(false);
  const [llmReasoningLevel, setLlmReasoningLevel] = useState<LLMSettings['reasoningLevel']>('medium');
  const [isLLMSettingsLoading, setIsLLMSettingsLoading] = useState(false);
  const [isSavingLLMSettings, setIsSavingLLMSettings] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [pushPermission, setPushPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('default');

  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerifyClosing, setIsVerifyClosing] = useState(false);
  const [verifySteps, setVerifySteps] = useState<Record<'nonStream' | 'stream', VerifyStepStatus>>({
    nonStream: 'pending',
    stream: 'pending'
  });
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [isDeletingAllChats, setIsDeletingAllChats] = useState(false);
  const [isDeletingAllConnections, setIsDeletingAllConnections] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isConfirmClosing, setIsConfirmClosing] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const [isCropClosing, setIsCropClosing] = useState(false);
  const [isSavedMemoriesOpen, setIsSavedMemoriesOpen] = useState(false);
  const [isSavedMemoriesClosing, setIsSavedMemoriesClosing] = useState(false);
  const [savedMemories, setSavedMemories] = useState<SavedMemory[]>([]);
  const [isSavedMemoriesLoading, setIsSavedMemoriesLoading] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [isClearingMemories, setIsClearingMemories] = useState(false);
  const [isSharedLinksOpen, setIsSharedLinksOpen] = useState(false);
  const [isSharedLinksClosing, setIsSharedLinksClosing] = useState(false);
  const [sharedLinks, setSharedLinks] = useState<SharedLinkItem[]>([]);
  const [isSharedLinksLoading, setIsSharedLinksLoading] = useState(false);
  const [isArchivedChatsOpen, setIsArchivedChatsOpen] = useState(false);
  const [isArchivedChatsClosing, setIsArchivedChatsClosing] = useState(false);
  const [archivedChats, setArchivedChats] = useState<ArchivedChatItem[]>([]);
  const [archivedChatSearch, setArchivedChatSearch] = useState('');
  const [isArchivedChatsLoading, setIsArchivedChatsLoading] = useState(false);
  const [deletingArchivedChatId, setDeletingArchivedChatId] = useState<string | null>(null);
  const [isArchivingAllChats, setIsArchivingAllChats] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [mcpSettings, setMcpSettings] = useState<MCPSettings>(defaultMCPSettings);
  const [isMCPManagerOpen, setIsMCPManagerOpen] = useState(false);
  const [isMCPManagerClosing, setIsMCPManagerClosing] = useState(false);
  const [mcpManagerTab, setMcpManagerTab] = useState<'installed' | 'browse'>('installed');
  const [mcpSearch, setMcpSearch] = useState('');
  const [mcpCategory, setMcpCategory] = useState<'All' | MCPServerCategory>('All');
  const [mcpAvailability, setMcpAvailability] = useState<'All' | 'offline' | 'online'>('All');
  const [configuringMCP, setConfiguringMCP] = useState<InstalledMCPServer | null>(null);
  const [mcpConfigDraft, setMcpConfigDraft] = useState<Record<string, string>>({});
  const [isMCPConfigClosing, setIsMCPConfigClosing] = useState(false);
  const [toolSettings, setToolSettings] = useState<ToolSettings>(defaultToolSettings);
  const [toolSearch, setToolSearch] = useState('');
  const [toolCategory, setToolCategory] = useState<'All' | ToolCategory>('All');
  const [isSearchManagerOpen, setIsSearchManagerOpen] = useState(false);
  const [isSearchManagerClosing, setIsSearchManagerClosing] = useState(false);
  const [configuringTool, setConfiguringTool] = useState<InstalledTool | null>(null);
  const [toolConfigDraft, setToolConfigDraft] = useState<Record<string, string>>({});
  const [isToolConfigClosing, setIsToolConfigClosing] = useState(false);

  const [personaInstructions, setPersonaInstructions] = useState('');
  const [personaStyleTone, setPersonaStyleTone] = useState('default');
  const [personaCharWarm, setPersonaCharWarm] = useState('default');
  const [personaCharEnthusiastic, setPersonaCharEnthusiastic] = useState('default');
  const [personaCharHeaders, setPersonaCharHeaders] = useState('default');
  const [personaCharEmoji, setPersonaCharEmoji] = useState('default');
  const [personaAboutName, setPersonaAboutName] = useState('');
  const [personaAboutOccupation, setPersonaAboutOccupation] = useState('');
  const [personaAboutMore, setPersonaAboutMore] = useState('');
  const [memoryReferenceSaved, setMemoryReferenceSaved] = useState(true);
  const [memoryReferenceHistory, setMemoryReferenceHistory] = useState(true);
  const [isPersonaLoading, setIsPersonaLoading] = useState(false);
  const [isSavingPersona, setIsSavingPersona] = useState(false);

  const mountedRef = useRef(false);
  const generalSettingsLoadedRef = useRef(false);
  const profileLoadedRef = useRef(false);
  const connectionsLoadedRef = useRef(false);
  const personaLoadedRef = useRef(false);
  const notificationLoadedRef = useRef(false);
  const mcpLoadedRef = useRef(false);
  const toolsLoadedRef = useRef(false);
  const profileLoadRef = useRef<Promise<void> | null>(null);
  const connectionsLoadRef = useRef<Promise<void> | null>(null);
  const personaLoadRef = useRef<Promise<void> | null>(null);
  const llmSettingsLoadRef = useRef<Promise<void> | null>(null);
  const closeTimerRef = useRef<number[]>([]);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeTimerRef.current.forEach(timer => window.clearTimeout(timer));
    };
  }, []);

  const runAfterExit = useCallback((callback: () => void) => {
    const timer = window.setTimeout(() => {
      closeTimerRef.current = closeTimerRef.current.filter(item => item !== timer);
      callback();
    }, modalAnimationMs);
    closeTimerRef.current.push(timer);
  }, []);

  const loadGeneralSettingsState = useCallback((force = false) => {
    if (!force && generalSettingsLoadedRef.current) return;
    setGeneralSettings(loadGeneralSettings());
    generalSettingsLoadedRef.current = true;
  }, []);

  const loadProfile = useCallback(() => {
    if (profileLoadedRef.current || profileLoadRef.current) return profileLoadRef.current || Promise.resolve();
    setIsProfileLoading(true);
    profileLoadRef.current = getUserProfile()
      .then(p => {
        if (mountedRef.current) setProfile(p);
        profileLoadedRef.current = true;
      })
      .catch(() => {
        profileLoadedRef.current = false;
      })
      .finally(() => {
        profileLoadRef.current = null;
        if (mountedRef.current) setIsProfileLoading(false);
      });
    return profileLoadRef.current;
  }, []);

  const loadConnections = useCallback((force = false) => {
    if (!force && (connectionsLoadedRef.current || connectionsLoadRef.current)) return connectionsLoadRef.current || Promise.resolve();
    setIsConnectionsLoading(true);
    connectionsLoadRef.current = getConnections()
      .then(data => {
        if (mountedRef.current) setConnections(data);
        connectionsLoadedRef.current = true;
      })
      .catch(() => {
        connectionsLoadedRef.current = false;
      })
      .finally(() => {
        connectionsLoadRef.current = null;
        if (mountedRef.current) setIsConnectionsLoading(false);
      });
    return connectionsLoadRef.current;
  }, []);

  const loadLLMSettings = useCallback((force = false) => {
    if (!force && llmSettingsLoadRef.current) return llmSettingsLoadRef.current;
    setIsLLMSettingsLoading(true);
    llmSettingsLoadRef.current = getLLMSettings()
      .then(settings => {
        if (!mountedRef.current) return;
        setLlmStreamingResponse(settings.streamingResponse);
        setLlmReasoning(settings.reasoning);
        setLlmReasoningLevel(settings.reasoningLevel);
      })
      .catch(() => {
        toast.error('Failed to load LLM settings');
      })
      .finally(() => {
        llmSettingsLoadRef.current = null;
        if (mountedRef.current) setIsLLMSettingsLoading(false);
      });
    return llmSettingsLoadRef.current;
  }, []);

  const loadNotificationSettingsState = useCallback((force = false) => {
    if (!force && notificationLoadedRef.current) return;
    setNotificationSettings(loadNotificationSettings());
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushPermission('unsupported');
    } else {
      setPushPermission(Notification.permission);
    }
    notificationLoadedRef.current = true;
  }, []);

  const loadMCPSettingsState = useCallback((force = false) => {
    if (!force && mcpLoadedRef.current) return;
    setMcpSettings(loadMCPSettings());
    mcpLoadedRef.current = true;
  }, []);

  const loadToolSettingsState = useCallback((force = false) => {
    if (!force && toolsLoadedRef.current) return;
    setToolSettings(loadToolSettings());
    toolsLoadedRef.current = true;
  }, []);

  const loadPersona = useCallback(() => {
    if (personaLoadedRef.current || personaLoadRef.current) return personaLoadRef.current || Promise.resolve();
    setIsPersonaLoading(true);
    personaLoadRef.current = getPersona()
      .then(data => {
        if (!mountedRef.current) return;
        setPersonaInstructions(data.instructions || '');
        setPersonaStyleTone(data.styleTone || 'default');
        setPersonaCharWarm(data.charWarm || 'default');
        setPersonaCharEnthusiastic(data.charEnthusiastic || 'default');
        setPersonaCharHeaders(data.charHeaders || 'default');
        setPersonaCharEmoji(data.charEmoji || 'default');
        setPersonaAboutName(data.aboutName || '');
        setPersonaAboutOccupation(data.aboutOccupation || '');
        setPersonaAboutMore(data.aboutMore || '');
        setMemoryReferenceSaved(data.memoryReferenceSaved ?? true);
        setMemoryReferenceHistory(data.memoryReferenceHistory ?? true);
        personaLoadedRef.current = true;
      })
      .catch(() => {
        personaLoadedRef.current = false;
      })
      .finally(() => {
        personaLoadRef.current = null;
        if (mountedRef.current) setIsPersonaLoading(false);
      });
    return personaLoadRef.current;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'general') {
      loadGeneralSettingsState();
    } else if (activeTab === 'profile') {
      loadProfile();
    } else if (activeTab === 'connection') {
      loadConnections();
      loadLLMSettings();
    } else if (activeTab === 'notifications') {
      window.setTimeout(() => loadNotificationSettingsState(), 0);
    } else if (activeTab === 'personality') {
      loadPersona();
    } else if (activeTab === 'mcp') {
      loadMCPSettingsState();
    } else if (activeTab === 'tools') {
      loadToolSettingsState();
    }
  }, [activeTab, isOpen, loadConnections, loadGeneralSettingsState, loadLLMSettings, loadMCPSettingsState, loadNotificationSettingsState, loadPersona, loadProfile, loadToolSettingsState]);

  const handleSaveProfile = async () => {
    try {
      await saveUserProfile(profile);
      window.dispatchEvent(new Event('profileUpdated'));
      toast.success('Profile saved successfully!');
    } catch {
      toast.error('Failed to save profile');
    }
  };

  const updateGeneralSettings = (patch: Partial<GeneralSettings>) => {
    setGeneralSettings(prev => saveGeneralSettings({ ...prev, ...patch }));
  };

  const openMCPManager = (tab: 'installed' | 'browse' = 'browse') => {
    loadMCPSettingsState(true);
    setMcpManagerTab(tab);
    setIsMCPManagerOpen(true);
  };

  const handleInstallMCP = (serverId: string) => {
    const nextSettings = installMCPServer(serverId);
    setMcpSettings(nextSettings);
    setMcpManagerTab('installed');
    toast.success('MCP installed');
  };

  const openMCPConfig = (server: InstalledMCPServer) => {
    setConfiguringMCP(server);
    setMcpConfigDraft(server.config || {});
  };

  const handleConfigureCatalogMCP = (serverId: string) => {
    let nextSettings = loadMCPSettings();
    let installedServer = nextSettings.installed.find(server => server.serverId === serverId) || null;
    if (!installedServer) {
      nextSettings = installMCPServer(serverId);
      installedServer = nextSettings.installed.find(server => server.serverId === serverId) || null;
      setMcpSettings(nextSettings);
    }
    if (installedServer) openMCPConfig(installedServer);
  };

  const handleSaveMCPConfig = () => {
    if (!configuringMCP) return;
    const nextSettings = updateMCPServerConfig(configuringMCP.id, mcpConfigDraft);
    setMcpSettings(nextSettings);
    const updatedServer = nextSettings.installed.find(server => server.id === configuringMCP.id) || null;
    setConfiguringMCP(updatedServer);
    toast.success('MCP configuration saved');
    closeMCPConfigModal();
  };

  const handleUninstallMCP = (installedId: string) => {
    setMcpSettings(uninstallMCPServer(installedId));
    toast.success('MCP removed');
  };

  const handleToggleMCP = (installedId: string, enabled: boolean) => {
    setMcpSettings(toggleMCPServer(installedId, enabled));
  };

  const handleInstallTool = (toolId: string) => {
    const nextSettings = installTool(toolId);
    setToolSettings(nextSettings.searchEnabled ? nextSettings : updateToolFeatureSettings({ searchEnabled: true }));
    toast.success('Search provider selected');
  };

  const updateToolFeatures = (patch: Partial<Pick<ToolSettings, 'searchEnabled' | 'codeExecutionEnabled' | 'urlContextEnabled'>>) => {
    setToolSettings(updateToolFeatureSettings(patch));
  };

  const openSearchManager = () => {
    loadToolSettingsState(true);
    setIsSearchManagerOpen(true);
  };

  const openToolConfig = (tool: InstalledTool) => {
    setConfiguringTool(tool);
    setToolConfigDraft(tool.config || {});
  };

  const handleConfigureCatalogTool = (toolId: string) => {
    let nextSettings = loadToolSettings();
    let installedTool = nextSettings.installed.find(tool => tool.toolId === toolId) || null;
    if (!installedTool) {
      nextSettings = installTool(toolId);
      if (!nextSettings.searchEnabled) nextSettings = updateToolFeatureSettings({ searchEnabled: true });
      installedTool = nextSettings.installed.find(tool => tool.toolId === toolId) || null;
      setToolSettings(nextSettings);
    }
    if (installedTool) openToolConfig(installedTool);
  };

  const handleSaveToolConfig = () => {
    if (!configuringTool) return;
    const nextSettings = updateToolConfig(configuringTool.id, toolConfigDraft);
    setToolSettings(nextSettings);
    const updatedTool = nextSettings.installed.find(tool => tool.id === configuringTool.id) || null;
    setConfiguringTool(updatedTool);
    toast.success('Tool configuration saved');
    closeToolConfigModal();
  };

  const handleUninstallTool = (installedId: string) => {
    setToolSettings(uninstallTool(installedId));
    toast.success('Tool removed');
  };

  const handleToggleTool = (installedId: string, enabled: boolean) => {
    setToolSettings(toggleTool(installedId, enabled));
  };

  const handleSaveLLMSettings = async () => {
    setIsSavingLLMSettings(true);
    try {
      const settings = await saveLLMSettings({
        streamingResponse: llmStreamingResponse,
        reasoning: llmReasoning,
        reasoningLevel: llmReasoningLevel
      });
      setLlmStreamingResponse(settings.streamingResponse);
      setLlmReasoning(settings.reasoning);
      setLlmReasoningLevel(settings.reasoningLevel);
      toast.success('LLM settings saved');
    } catch {
      toast.error('Failed to save LLM settings');
    }
    setIsSavingLLMSettings(false);
  };

  const updateNotificationSettings = (patch: Partial<NotificationSettings>) => {
    setNotificationSettings(prev => saveNotificationSettings({ ...prev, ...patch }));
  };

  const updateQuietHours = (patch: Partial<NotificationSettings['quietHours']>) => {
    setNotificationSettings(prev => saveNotificationSettings({
      ...prev,
      quietHours: { ...prev.quietHours, ...patch }
    }));
  };

  const updateNotificationEvent = (key: NotificationEventKey, patch: Partial<NotificationSettings['events'][NotificationEventKey]>) => {
    setNotificationSettings(prev => saveNotificationSettings({
      ...prev,
      events: {
        ...prev.events,
        [key]: { ...prev.events[key], ...patch }
      }
    }));
  };

  const handleEnablePushNotifications = async () => {
    const permission = await requestPushPermission();
    setPushPermission(permission);
    if (permission === 'granted') {
      updateNotificationSettings({ pushEnabled: true });
      toast.success('Push notifications enabled');
    } else if (permission === 'denied') {
      updateNotificationSettings({ pushEnabled: false });
      toast.error('Push notifications are blocked by the browser');
    } else if (permission === 'unsupported') {
      updateNotificationSettings({ pushEnabled: false });
      toast.error('Push notifications are not supported here');
    }
  };

  const sendTestNotification = () => {
    window.dispatchEvent(new CustomEvent('deepchat:notification', {
      detail: {
        id: `test-notification-${Date.now()}`,
        type: 'agent',
        title: 'Test notification',
        description: 'Agent notifications are ready for decisions and approvals.',
        severity: 'success',
        time: 'Now',
        unread: true,
        createdAt: new Date().toISOString(),
        delivery: {
          inApp: notificationSettings.inAppEnabled,
          push: false,
          sound: notificationSettings.soundEnabled
        }
      }
    }));
  };

  const handleSavePersona = async () => {
    setIsSavingPersona(true);
    try {
      await savePersona({
        instructions: personaInstructions,
        styleTone: personaStyleTone,
        charWarm: personaCharWarm,
        charEnthusiastic: personaCharEnthusiastic,
        charHeaders: personaCharHeaders,
        charEmoji: personaCharEmoji,
        aboutName: personaAboutName,
        aboutOccupation: personaAboutOccupation,
        aboutMore: personaAboutMore,
        memoryReferenceSaved,
        memoryReferenceHistory
      });
      toast.success('Personalization saved successfully!');
    } catch {
      toast.error('Failed to save personalization');
    }
    setIsSavingPersona(false);
  };

  const loadSavedMemories = async () => {
    setIsSavedMemoriesLoading(true);
    try {
      setSavedMemories(await getSavedMemories());
    } catch {
      toast.error('Failed to load saved memories');
    }
    setIsSavedMemoriesLoading(false);
  };

  const openSavedMemoriesModal = () => {
    setIsSavedMemoriesOpen(true);
    loadSavedMemories();
  };

  const handleDeleteSavedMemory = async (id: string) => {
    setDeletingMemoryId(id);
    try {
      const ok = await deleteSavedMemory(id);
      if (ok) {
        setSavedMemories(prev => prev.filter(memory => memory.id !== id));
        toast.success('Memory removed');
      } else {
        toast.error('Failed to remove memory');
      }
    } catch {
      toast.error('Failed to remove memory');
    }
    setDeletingMemoryId(null);
  };

  const handleClearSavedMemories = async () => {
    setIsClearingMemories(true);
    try {
      const ok = await clearSavedMemories();
      if (ok) {
        setSavedMemories([]);
        toast.success('Saved memories cleared');
      } else {
        toast.error('Failed to clear memories');
      }
    } catch {
      toast.error('Failed to clear memories');
    }
    setIsClearingMemories(false);
  };

  const loadSharedLinks = async () => {
    setIsSharedLinksLoading(true);
    try {
      setSharedLinks(await getSharedLinks());
    } catch {
      toast.error('Failed to load shared links');
    }
    setIsSharedLinksLoading(false);
  };

  const openSharedLinksModal = () => {
    setIsSharedLinksOpen(true);
    loadSharedLinks();
  };

  const loadArchivedChats = async () => {
    setIsArchivedChatsLoading(true);
    try {
      setArchivedChats(await getArchivedChats());
    } catch {
      toast.error('Failed to load archived chats');
    }
    setIsArchivedChatsLoading(false);
  };

  const openArchivedChatsModal = () => {
    setArchivedChatSearch('');
    setIsArchivedChatsOpen(true);
    loadArchivedChats();
  };

  const handleArchiveAllChats = async () => {
    setIsArchivingAllChats(true);
    try {
      const result = await archiveAllChats();
      if (result.success) {
        window.dispatchEvent(new Event('chatUpdated'));
        toast.success(result.count > 0 ? `Archived ${result.count} chats` : 'No active chats to archive');
        if (pathname.startsWith('/chat/')) router.push('/');
      } else {
        toast.error('Failed to archive chats');
      }
    } catch {
      toast.error('Failed to archive chats');
    }
    setIsArchivingAllChats(false);
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deepchat-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Failed to export data');
    }
    setIsExportingData(false);
  };

  const copySharedLink = async (shareId: string) => {
    const url = `${window.location.origin}/chat/s/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Shared link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleDeleteArchivedChat = async (id: string) => {
    setDeletingArchivedChatId(id);
    try {
      const ok = await deleteChat(id);
      if (ok) {
        setArchivedChats(prev => prev.filter(chat => chat.id !== id));
        window.dispatchEvent(new Event('chatUpdated'));
        toast.success('Archived chat deleted');
      } else {
        toast.error('Failed to delete archived chat');
      }
    } catch {
      toast.error('Failed to delete archived chat');
    }
    setDeletingArchivedChatId(null);
  };

  const requestDeleteAllChats = () => {
    setConfirmDialog({
      action: 'deleteChats',
      title: 'Delete all chats?',
      description: 'This will permanently remove every conversation from this device. This action cannot be undone.',
      confirmLabel: 'Delete All Chats'
    });
  };

  const requestDeleteAllConnections = () => {
    setConfirmDialog({
      action: 'deleteConnections',
      title: 'Remove all connections?',
      description: 'This will delete every API key and provider configuration. You will need to enter them again before chatting.',
      confirmLabel: 'Remove Connections'
    });
  };

  const handleDeleteAllChats = async () => {
    setIsDeletingAllChats(true);
    try {
      await deleteAllChats();
      window.dispatchEvent(new Event('chatUpdated'));
      toast.success('All chats deleted successfully');
      if (pathname.startsWith('/chat/')) {
        router.push('/');
      }
    } catch {
      toast.error('Failed to delete chats');
    }
    setIsDeletingAllChats(false);
  };

  const handleDeleteAllConnections = async () => {
    setIsDeletingAllConnections(true);
    try {
      await deleteAllConnections();
      await loadConnections(true);
      toast.success('All connections deleted successfully');
    } catch {
      toast.error('Failed to delete connections');
    }
    setIsDeletingAllConnections(false);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog) return;
    if (confirmDialog.action === 'deleteChats') {
      await handleDeleteAllChats();
    } else {
      await handleDeleteAllConnections();
    }
    closeConfirmDialog();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setCropImage(reader.result?.toString() || null));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onCropComplete = useCallback((_croppedArea: CropArea, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getCroppedImg = async (imageSrc: string, pixelCrop: CropArea) => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(resolve => image.onload = resolve);
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
    return canvas.toDataURL('image/jpeg');
  };

  const showCroppedImage = async () => {
    try {
      if (cropImage && croppedAreaPixels) {
        const croppedImage = await getCroppedImg(cropImage, croppedAreaPixels);
        if (croppedImage) {
          setProfile({ ...profile, avatar: croppedImage });
          toast.success('Avatar cropped!');
        }
        closeCropModal();
      }
    } catch {
      toast.error('Failed to crop avatar');
    }
  };

  const startVerification = async (data: Connection) => {
    if (!data.model) {
      toast.error('Please configure a Default Model in Edit Connection before verifying.');
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    setVerifySteps({ nonStream: 'loading', stream: 'pending' });

    try {
      const nonStreamRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, type: 'non-streaming' })
      });
      const nonStreamData = await nonStreamRes.json();
      if (!nonStreamRes.ok) throw new Error(nonStreamData.error || 'Non-streaming test failed');
      setVerifySteps(p => ({ ...p, nonStream: 'success', stream: 'loading' }));

      const streamRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, type: 'streaming' })
      });
      const streamData = await streamRes.json();
      if (!streamRes.ok) throw new Error(streamData.error || 'Streaming test failed');
      setVerifySteps(p => ({ ...p, stream: 'success' }));

      toast.success('Connection verified successfully!');
      setTimeout(() => closeVerifyModal(), 1500);

    } catch (err) {
      setVerifyError(getErrorMessage(err, 'Connection verification failed'));
      setVerifySteps(p => {
        const next = { ...p };
        if (p.nonStream === 'loading') next.nonStream = 'error';
        else if (p.stream === 'loading') next.stream = 'error';
        return next;
      });
    }
  };

  const closeVerification = () => {
    closeVerifyModal(true);
  };

  const isConfirmingDelete = isDeletingAllChats || isDeletingAllConnections;

  const closeSettingsModal = () => {
    if (isSettingsClosing) return;
    setIsSettingsClosing(true);
    runAfterExit(onClose);
  };

  const closeCropModal = () => {
    if (isCropClosing) return;
    setIsCropClosing(true);
    runAfterExit(() => {
      setCropImage(null);
      setIsCropClosing(false);
    });
  };

  const closeConnectionModal = () => {
    if (isAddConnectionClosing) return;
    setIsAddConnectionClosing(true);
    runAfterExit(() => {
      setIsAddConnectionOpen(false);
      setIsAddConnectionClosing(false);
    });
  };

  const closeVerifyModal = (openConnectionAfter = false) => {
    if (isVerifyClosing) return;
    setIsVerifyClosing(true);
    runAfterExit(() => {
      setIsVerifying(false);
      setIsVerifyClosing(false);
      if (openConnectionAfter) setIsAddConnectionOpen(true);
    });
  };

  const closeConfirmDialog = () => {
    if (isConfirmClosing || isConfirmingDelete) return;
    setIsConfirmClosing(true);
    runAfterExit(() => {
      setConfirmDialog(null);
      setIsConfirmClosing(false);
    });
  };

  const closeSavedMemoriesModal = () => {
    if (isSavedMemoriesClosing) return;
    setIsSavedMemoriesClosing(true);
    runAfterExit(() => {
      setIsSavedMemoriesOpen(false);
      setIsSavedMemoriesClosing(false);
    });
  };

  const closeSharedLinksModal = () => {
    if (isSharedLinksClosing) return;
    setIsSharedLinksClosing(true);
    runAfterExit(() => {
      setIsSharedLinksOpen(false);
      setIsSharedLinksClosing(false);
    });
  };

  const closeArchivedChatsModal = () => {
    if (isArchivedChatsClosing) return;
    setIsArchivedChatsClosing(true);
    runAfterExit(() => {
      setIsArchivedChatsOpen(false);
      setIsArchivedChatsClosing(false);
    });
  };

  const closeMCPManagerModal = () => {
    if (isMCPManagerClosing) return;
    setIsMCPManagerClosing(true);
    runAfterExit(() => {
      setIsMCPManagerOpen(false);
      setIsMCPManagerClosing(false);
    });
  };

  const closeSearchManagerModal = () => {
    if (isSearchManagerClosing) return;
    setIsSearchManagerClosing(true);
    runAfterExit(() => {
      setIsSearchManagerOpen(false);
      setIsSearchManagerClosing(false);
    });
  };

  const closeMCPConfigModal = () => {
    if (isMCPConfigClosing) return;
    setIsMCPConfigClosing(true);
    runAfterExit(() => {
      setConfiguringMCP(null);
      setMcpConfigDraft({});
      setIsMCPConfigClosing(false);
    });
  };

  const closeToolConfigModal = () => {
    if (isToolConfigClosing) return;
    setIsToolConfigClosing(true);
    runAfterExit(() => {
      setConfiguringTool(null);
      setToolConfigDraft({});
      setIsToolConfigClosing(false);
    });
  };

  const openMemoryDocs = () => {
    router.push('/docs/memory');
  };

  const filteredArchivedChats = archivedChats.filter(chat => {
    const query = archivedChatSearch.trim().toLowerCase();
    if (!query) return true;
    return `${chat.title || ''} ${chat.id}`.toLowerCase().includes(query);
  });
  const visibleConnectionProfiles = connections.slice(0, 4);
  const installedMCPIds = new Set(mcpSettings.installed.map(server => server.serverId));
  const mcpSearchQuery = mcpSearch.trim().toLowerCase();
  const filteredMCPCatalog = MCP_CATALOG.filter(server => {
    const matchesCategory = mcpCategory === 'All' || server.category === mcpCategory;
    const matchesAvailability = mcpAvailability === 'All' || server.availability === mcpAvailability;
    const matchesSearch = !mcpSearchQuery || `${server.name} ${server.description} ${server.category} ${server.tags.join(' ')}`.toLowerCase().includes(mcpSearchQuery);
    return matchesCategory && matchesAvailability && matchesSearch;
  });
  const installedToolIds = new Set(toolSettings.installed.map(tool => tool.toolId));
  const toolSearchQuery = toolSearch.trim().toLowerCase();
  const filteredToolCatalog = TOOL_CATALOG.filter(tool => {
    const matchesCategory = toolCategory === 'All' || tool.category === toolCategory;
    const matchesSearch = !toolSearchQuery || `${tool.name} ${tool.description} ${tool.category} ${tool.tags.join(' ')}`.toLowerCase().includes(toolSearchQuery);
    return matchesCategory && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4 dark:bg-slate-950/70" style={{ animation: `${isSettingsClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }} onClick={closeSettingsModal}>
      <style>{`
        @keyframes settingsBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes settingsBackdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes settingsPanelIn {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes settingsPanelOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(12px) scale(0.97); }
        }
      `}</style>
      <div className="flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-white shadow-xl sm:h-[min(92dvh,800px)] sm:max-w-5xl sm:flex-row sm:rounded-3xl dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-2xl dark:shadow-black/50" style={{ animation: `${isSettingsClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }} onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 flex-col border-b border-slate-100 bg-slate-50 p-4 sm:w-64 sm:border-b-0 sm:border-r sm:p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="mb-3 flex items-center gap-2 px-1 text-lg font-extrabold text-slate-800 sm:mb-6 sm:px-2 sm:text-xl dark:text-slate-100">
            <SettingsIcon className="w-5 h-5 text-indigo-600" /> Settings
          </h2>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar sm:block sm:space-y-1.5 sm:overflow-visible">
            <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<SettingsIcon className="w-4 h-4" />} label="General" />
            <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User className="w-4 h-4" />} label="Profile Settings" />
            <TabButton active={activeTab === 'personality'} onClick={() => setActiveTab('personality')} icon={<Brain className="w-4 h-4" />} label="Personalization" />
            <TabButton active={activeTab === 'connection'} onClick={() => setActiveTab('connection')} icon={<LinkIcon className="w-4 h-4" />} label="Connection" />
            <TabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell className="w-4 h-4" />} label="Notifications" />
            <TabButton active={activeTab === 'mcp'} onClick={() => setActiveTab('mcp')} icon={<Cpu className="w-4 h-4" />} label="MCP Settings" />
            <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} icon={<Search className="w-4 h-4" />} label="Tools Settings" />
            <TabButton active={activeTab === 'agent'} onClick={() => setActiveTab('agent')} icon={<SettingsIcon className="w-4 h-4" />} label="Agent Settings" />
            <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')} icon={<Database className="w-4 h-4" />} label="Data Control" />
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col bg-white dark:bg-slate-900">
          <button onClick={closeSettingsModal} className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 sm:right-5 sm:top-5 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 overflow-y-auto p-4 pt-14 custom-scrollbar sm:p-6">
            {activeTab === 'general' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">General</h3>
                  <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Manage app display, language, and dictation preferences.</p>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="mb-3 min-w-0 sm:mb-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Apperance</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">Choose how DeepChat follows your device or uses a fixed theme.</p>
                    </div>
                    <div className="sm:w-80">
                      <CustomDropdown
                        value={generalSettings.appearance}
                        onChange={value => updateGeneralSettings({ appearance: value as GeneralSettings['appearance'] })}
                        options={APPEARANCE_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="mb-3 min-w-0 sm:mb-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Contrast</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">Tune readability for softer or stronger separation between surfaces.</p>
                    </div>
                    <div className="sm:w-80">
                      <CustomDropdown
                        value={generalSettings.contrast}
                        onChange={value => updateGeneralSettings({ contrast: value as GeneralSettings['contrast'] })}
                        options={CONTRAST_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="mb-3 min-w-0 sm:mb-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Accent Color</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">Set the primary highlight used by controls, active states, and actions.</p>
                    </div>
                    <div className="sm:w-80">
                      <CustomDropdown
                        value={generalSettings.accentColor}
                        onChange={value => updateGeneralSettings({ accentColor: value as GeneralSettings['accentColor'] })}
                        options={ACCENT_COLOR_OPTIONS}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="mb-3 min-w-0 sm:mb-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Language</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">Use auto-detect or pick one of 141 language presets.</p>
                    </div>
                    <div className="sm:w-80">
                      <CustomDropdown
                        value={generalSettings.language}
                        onChange={value => updateGeneralSettings({ language: value })}
                        options={LANGUAGE_OPTIONS}
                      />
                    </div>
                  </div>

                  <GeneralSettingToggle
                    title="Enable Dictation"
                    description="Turn on voice input in the chat composer and use the selected language when supported by your browser."
                    checked={generalSettings.dictationEnabled}
                    onChange={checked => updateGeneralSettings({ dictationEnabled: checked })}
                  />
                </div>

                <div className="hidden" aria-hidden="true">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">App Version 1.0.0</p>
                    <p className="text-sm text-slate-500 font-medium mt-0.5">Production Ready • Local Run</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Credits by</p>
                    <p className="font-extrabold text-indigo-600">Mizae</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Profile Settings</h3>
                  <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Customize your profile name, avatar, and plan display.</p>
                </div>

                <div className="space-y-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="mb-2 flex items-center gap-4">
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <NextImage src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'} width={64} height={64} unoptimized className="w-16 h-16 rounded-full border-4 border-white shadow-sm object-cover bg-slate-100" alt="Avatar" />
                      <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-800">{isProfileLoading ? 'Loading profile...' : profile.name || 'Guest'}</p>
                      <p className="text-sm text-slate-500 font-medium">{profile.plan || 'No Plan'}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Profile Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => setProfile({ ...profile, name: e.target.value })}
                      disabled={isProfileLoading}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium shadow-sm"
                      placeholder="e.g. Alex Morgan"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Plan</label>
                    <input
                      type="text"
                      value={profile.plan}
                      onChange={e => setProfile({ ...profile, plan: e.target.value })}
                      disabled={isProfileLoading}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium shadow-sm"
                      placeholder="e.g. Free, Pro, Team"
                    />
                  </div>

                  <button onClick={handleSaveProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2">
                    Save Profile
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'personality' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">Personalization</h3>
                  <p className="text-sm text-slate-500 mt-1">Set custom instructions to tailor how the AI responds to you across all chats.</p>
                </div>

                <div className={`space-y-5 bg-slate-50 p-5 rounded-2xl border border-slate-100 ${isPersonaLoading ? 'opacity-70 pointer-events-none' : ''}`} aria-busy={isPersonaLoading}>
                  {isPersonaLoading && (
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading personalization...
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Base Style & Tone</label>
                    <p className="text-xs text-slate-500 mb-3">
                      Select the primary way you want the AI to communicate with you.
                    </p>
                    <CustomDropdown
                      value={personaStyleTone}
                      onChange={val => setPersonaStyleTone(val)}
                      options={STYLE_TONE_OPTIONS}
                    />
                  </div>

                  <hr className="border-slate-200" />

                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <SettingsIcon className="w-4 h-4 text-indigo-500" /> Characteristics
                    </h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Warmth</label>
                          <CustomDropdown
                            value={personaCharWarm}
                            onChange={val => setPersonaCharWarm(val)}
                            options={WARMTH_OPTIONS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Enthusiastic</label>
                          <CustomDropdown
                            value={personaCharEnthusiastic}
                            onChange={val => setPersonaCharEnthusiastic(val)}
                            options={ENTHUSIASTIC_OPTIONS}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Headers & Lists</label>
                          <CustomDropdown
                            value={personaCharHeaders}
                            onChange={val => setPersonaCharHeaders(val)}
                            options={HEADERS_OPTIONS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Emoji</label>
                          <CustomDropdown
                            value={personaCharEmoji}
                            onChange={val => setPersonaCharEmoji(val)}
                            options={EMOJI_OPTIONS}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-200" />

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-indigo-500" /> System Instructions
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                      How would you like the AI to respond? (e.g., format preferences, strict rules, languages).
                    </p>
                    <textarea
                      value={personaInstructions}
                      onChange={e => setPersonaInstructions(e.target.value)}
                      placeholder="e.g. Always provide code in TypeScript. Keep explanations brief."
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium shadow-sm resize-none custom-scrollbar"
                      rows={5}
                    />
                  </div>

                  <hr className="border-slate-200" />

                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-500" /> About You
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Name</label>
                        <input
                          type="text"
                          value={personaAboutName}
                          onChange={e => setPersonaAboutName(e.target.value)}
                          placeholder="What should the AI call you?"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 text-sm font-medium shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Occupation / Role</label>
                        <input
                          type="text"
                          value={personaAboutOccupation}
                          onChange={e => setPersonaAboutOccupation(e.target.value)}
                          placeholder="e.g. Software Engineer, Student, Designer"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 text-sm font-medium shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">More about you</label>
                        <textarea
                          value={personaAboutMore}
                          onChange={e => setPersonaAboutMore(e.target.value)}
                          placeholder="What else should the AI know about you? (Hobbies, goals, preferences)"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 text-sm font-medium shadow-sm resize-none custom-scrollbar"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-200" />

                  <div>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">Memory</h4>
                        <button
                          type="button"
                          onClick={openMemoryDocs}
                          className="group relative flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-indigo-600"
                          aria-label="Learn more about Memory"
                        >
                          <HelpCircle className="h-4 w-4" />
                          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            Learn more
                          </span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={openSavedMemoriesModal}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        Manage
                      </button>
                    </div>
                    <div className="space-y-4">
                      <MemoryToggle
                        title="Reference saved memories"
                        description="Allow DeepChat to use saved information it remembers about you when creating more personal responses."
                        checked={memoryReferenceSaved}
                        onChange={setMemoryReferenceSaved}
                      />
                      <MemoryToggle
                        title="Reference chat history"
                        description="Allow DeepChat to reference previous chats to keep answers consistent with your recent context."
                        checked={memoryReferenceHistory}
                        onChange={setMemoryReferenceHistory}
                      />
                    </div>
                    <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                      <p className="text-xs font-medium leading-relaxed text-slate-600">
                        DeepChat may use Memory to personalize queries to search providers, such as Bing.{' '}
                        <button type="button" onClick={openMemoryDocs} className="font-bold text-indigo-600 hover:text-indigo-700">
                          Learn more
                        </button>
                      </p>
                    </div>
                  </div>
                   
                  <button 
                    onClick={handleSavePersona} 
                    disabled={isSavingPersona}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingPersona ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Save Personalization
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'connection' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">Connection</h3>
                  <p className="text-sm text-slate-500 mt-1">Manage provider profiles and default LLM behavior.</p>
                </div>

                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-800">Connection Profile</h4>
                      <p className="text-xs font-medium text-slate-500">Your active provider profiles, limited to four for quick scanning.</p>
                    </div>
                    {connections.length > 4 && (
                      <button
                        onClick={() => setIsConnectionProfilesOpen(true)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        Show more
                      </button>
                    )}
                  </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {isConnectionsLoading ? (
                    <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 py-8 text-slate-500 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading connections...
                    </div>
                  ) : connections.length === 0 ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-500 font-medium">
                      No connections configured yet.
                    </div>
                  ) : (
                    visibleConnectionProfiles.map((conn) => (
                      <div key={conn.id} className="group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:shadow-md">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-extrabold text-indigo-600 shadow-inner">
                            {conn.provider.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-slate-800">{conn.name}</p>
                            <p className="text-xs text-indigo-600 font-bold bg-indigo-50 inline-block px-2 py-0.5 rounded-full mt-1">{conn.provider} {conn.model ? `• ${conn.model}` : ''}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                          <button onClick={() => startVerification(conn)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-600" title="Verify Connection"><Zap className="w-4 h-4" />Verify</button>
                          <button onClick={() => { setEditingConnection(conn); setIsAddConnectionOpen(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600" title="Edit Connection"><SettingsIcon className="w-4 h-4" />Edit</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                  <button onClick={() => { setEditingConnection(null); setIsAddConnectionOpen(true); }} className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-2xl px-5 py-5 flex items-center justify-center gap-3 text-slate-500 hover:text-indigo-600 transition-all font-bold group">
                    <div className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-indigo-100 flex shrink-0 items-center justify-center transition-colors">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-extrabold">Add Connection</p>
                      <p className="text-xs font-medium text-slate-400 group-hover:text-indigo-500">Create another provider profile</p>
                    </div>
                  </button>
                </section>

                <section className="space-y-4">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-800">LLM Settings</h4>
                    <p className="text-xs font-medium text-slate-500">Set default response behavior for every provider connection.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <LLMSettingToggle
                      title="Streaming response"
                      description="Show tokens as they arrive from the provider. Turn this off to wait for a complete response before DeepChat displays it."
                      checked={llmStreamingResponse}
                      onChange={setLlmStreamingResponse}
                      disabled={isLLMSettingsLoading}
                    />
                    <LLMSettingToggle
                      title="Reasoning"
                      description="Enable a thinking preference for supported reasoning models. Providers that do not support reasoning will continue with normal chat behavior."
                      checked={llmReasoning}
                      onChange={setLlmReasoning}
                      disabled={isLLMSettingsLoading}
                    />
                    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${!llmReasoning ? 'opacity-70' : ''}`}>
                      <div className="mb-3">
                        <p className="text-sm font-bold text-slate-800">Reasoning level</p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">Choose how much thinking budget supported models should prefer, similar to OpenAI reasoning effort.</p>
                      </div>
                      <CustomDropdown
                        value={llmReasoningLevel}
                        onChange={value => setLlmReasoningLevel(value as LLMSettings['reasoningLevel'])}
                        options={REASONING_LEVEL_OPTIONS}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveLLMSettings}
                    disabled={isSavingLLMSettings || isLLMSettingsLoading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSavingLLMSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save LLM Settings
                  </button>
                </section>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">Notification Settings</h3>
                  <p className="text-sm text-slate-500 mt-1">Control inbox, push, and sound alerts for background events.</p>
                </div>

                <section className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <NotificationSettingToggle
                      icon={<BellRing className="h-5 w-5" />}
                      title="Notifications"
                      description="Master switch for every alert channel."
                      checked={notificationSettings.enabled}
                      onChange={checked => updateNotificationSettings({ enabled: checked })}
                    />
                    <NotificationSettingToggle
                      icon={<Monitor className="h-5 w-5" />}
                      title="In-app inbox"
                      description="Save alerts in the bell menu."
                      checked={notificationSettings.inAppEnabled}
                      onChange={checked => updateNotificationSettings({ inAppEnabled: checked })}
                    />
                    <NotificationSettingToggle
                      icon={<Volume2 className="h-5 w-5" />}
                      title="Sound"
                      description="Play a subtle tone for selected notification types."
                      checked={notificationSettings.soundEnabled}
                      onChange={checked => updateNotificationSettings({ soundEnabled: checked })}
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800">Push notifications</p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                          Browser notifications for background responses. Current permission: {pushPermission}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleEnablePushNotifications}
                        className="shrink-0 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-600"
                      >
                        {pushPermission === 'granted' ? 'Enabled' : 'Enable'}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <NotificationSettingToggle
                        title="Use push"
                        description="Allow event rules to send browser notifications."
                        checked={notificationSettings.pushEnabled}
                        onChange={checked => updateNotificationSettings({ pushEnabled: checked })}
                      />
                      <NotificationSettingToggle
                        title="Only when away"
                        description="Avoid push alerts while this tab is visible."
                        checked={notificationSettings.onlyPushWhenAway}
                        onChange={checked => updateNotificationSettings({ onlyPushWhenAway: checked })}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-800">Delivery rules</h4>
                      <p className="text-xs font-medium text-slate-500">Choose inbox, push, and sound behavior for each event type.</p>
                    </div>
                    <button
                      type="button"
                      onClick={sendTestNotification}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      Send test
                    </button>
                  </div>

                  <div className="space-y-3">
                    {NOTIFICATION_EVENT_KEYS.map(key => (
                      <NotificationEventRow
                        key={key}
                        label={notificationEventLabels[key].title}
                        description={notificationEventLabels[key].description}
                        setting={notificationSettings.events[key]}
                        onChange={patch => updateNotificationEvent(key, patch)}
                      />
                    ))}
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="text-base font-extrabold text-slate-800">Inbox and quiet hours</h4>
                    <p className="text-xs font-medium text-slate-500">Tune storage and silence non-urgent alerts during focus time.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <NotificationSettingToggle
                      title="Group by chat"
                      description="Use one push thread per chat when supported."
                      checked={notificationSettings.groupByChat}
                      onChange={checked => updateNotificationSettings({ groupByChat: checked })}
                    />
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <label className="block text-sm font-bold text-slate-800">Max inbox items</label>
                      <input
                        type="number"
                        min={10}
                        max={200}
                        value={notificationSettings.maxInboxItems}
                        onChange={event => updateNotificationSettings({ maxInboxItems: Number(event.target.value) })}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <NotificationSettingToggle
                      title="Quiet hours"
                      description="Mute push and sound during a time range."
                      checked={notificationSettings.quietHours.enabled}
                      onChange={checked => updateQuietHours({ enabled: checked })}
                    />
                    <NotificationSettingToggle
                      title="Allow errors"
                      description="Let failed responses bypass quiet hours."
                      checked={notificationSettings.quietHours.allowErrors}
                      onChange={checked => updateQuietHours({ allowErrors: checked })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-600">Start</label>
                      <input
                        type="time"
                        value={notificationSettings.quietHours.start}
                        onChange={event => updateQuietHours({ start: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600">End</label>
                      <input
                        type="time"
                        value={notificationSettings.quietHours.end}
                        onChange={event => updateQuietHours({ end: event.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'mcp' && (
              <div className="space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">MCP Settings</h3>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Model Context Protocol server configurations.</p>
                  </div>
                  {mcpSettings.installed.length > 0 && (
                    <button
                      onClick={() => openMCPManager('browse')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 sm:w-auto dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      <Plus className="w-4 h-4" /> Add MCP
                    </button>
                  )}
                </div>

                {mcpSettings.installed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center sm:p-10 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-indigo-500 shadow-sm dark:border-indigo-500/20 dark:bg-slate-900 dark:text-indigo-300">
                      <Cpu className="w-7 h-7" />
                    </div>
                    <p className="font-bold text-slate-700 mb-1 dark:text-slate-100">No MCP Servers Configured</p>
                    <p className="text-sm text-slate-500 mb-6 max-w-sm dark:text-slate-400">Open MCP Manager to browse ready-to-install servers for files, databases, developer tools, productivity apps, and automation.</p>
                    <button
                      onClick={() => openMCPManager('browse')}
                      className="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 shadow-sm rounded-xl px-5 py-2.5 font-bold text-slate-700 flex items-center gap-2 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
                    >
                      <Plus className="w-4 h-4" /> Add MCP Server
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{mcpSettings.installed.length} Installed MCP</p>
                          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{mcpSettings.installed.filter(server => server.enabled).length} enabled servers ready for assistant context.</p>
                        </div>
                        <button
                          onClick={() => openMCPManager('installed')}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                        >
                          Manage MCP
                        </button>
                      </div>
                    </div>
                    {mcpSettings.installed.map(server => (
                      <MCPInstalledRow key={server.id} server={server} onToggle={handleToggleMCP} onRemove={handleUninstallMCP} onConfigure={openMCPConfig} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Tools Settings</h3>
                  <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Control Search, Code execution, and URL Context for chat workflows.</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <ToolFeatureRow
                    icon={<Search className="h-5 w-5" />}
                    title="Search"
                    description="Enable web search providers for relevant questions. Manage API and no-API search options in one place."
                    checked={toolSettings.searchEnabled}
                    onChange={checked => updateToolFeatures({ searchEnabled: checked })}
                    actionLabel="Manage"
                    meta={toolSettings.installed.find(tool => tool.enabled)?.name || 'DuckDuckGo default'}
                    onAction={openSearchManager}
                  />
                  <ToolFeatureRow
                    icon={<Cpu className="h-5 w-5" />}
                    title="Code execution"
                    description="Allow Data Analysis to run code in a controlled environment when the execution runtime is available."
                    checked={toolSettings.codeExecutionEnabled}
                    onChange={checked => updateToolFeatures({ codeExecutionEnabled: checked })}
                  />
                  <ToolFeatureRow
                    icon={<ExternalLink className="h-5 w-5" />}
                    title="URL Context"
                    description="Automatically reads links you include so the assistant can use the provided page content as context."
                    checked={toolSettings.urlContextEnabled}
                    onChange={checked => updateToolFeatures({ urlContextEnabled: checked })}
                  />
                </div>
              </div>
            )}

            {activeTab === 'agent' && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="relative mb-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 shadow-xl rounded-full flex items-center justify-center relative">
                    <Bot className="w-10 h-10 text-indigo-500" />
                  </div>
                </div>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Agent Settings</h3>
                <p className="text-slate-500 font-medium text-center max-w-sm mb-6 leading-relaxed">
                  Configure autonomous agent behaviors, custom instructions, and skill assignments.
                </p>
                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold text-sm px-5 py-1.5 rounded-full shadow-lg shadow-indigo-500/30">
                  Coming Soon
                </span>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">Data Control</h3>
                  <p className="text-sm text-slate-500 mt-1">Manage your personal data and application storage.</p>
                </div>

                <div className="space-y-4">
                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-indigo-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-colors shadow-sm">
                        <LinkIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Shared Links</p>
                        <p className="text-sm text-slate-500 font-medium">Review chats that are available through public share links.</p>
                      </div>
                    </div>
                    <button
                      onClick={openSharedLinksModal}
                      className="bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                      Manage
                    </button>
                  </div>

                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-indigo-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-colors shadow-sm">
                        <Archive className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Archived Chats</p>
                        <p className="text-sm text-slate-500 font-medium">Find and review conversations hidden from your main chat list.</p>
                      </div>
                    </div>
                    <button
                      onClick={openArchivedChatsModal}
                      className="bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                      Manage
                    </button>
                  </div>

                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-amber-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors shadow-sm">
                        <Archive className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Archive All Chats</p>
                        <p className="text-sm text-slate-500 font-medium">Move every active conversation out of the main chat list.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleArchiveAllChats}
                      disabled={isArchivingAllChats}
                      className="bg-white hover:bg-amber-50 text-slate-500 hover:text-amber-600 border border-slate-200 hover:border-amber-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isArchivingAllChats ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                      Archive All
                    </button>
                  </div>

                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-emerald-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                        <Download className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Export Data</p>
                        <p className="text-sm text-slate-500 font-medium">Download your chats, settings, memories, and connection data.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleExportData}
                      disabled={isExportingData}
                      className="bg-white hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200 hover:border-emerald-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isExportingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Export
                    </button>
                  </div>

                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-red-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-red-500 transition-colors shadow-sm">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Delete All Chats</p>
                        <p className="text-sm text-slate-500 font-medium">Permanently remove all conversation history.</p>
                      </div>
                    </div>
                    <button
                      onClick={requestDeleteAllChats}
                      disabled={isDeletingAllChats}
                      className="bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                      {isDeletingAllChats ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Clear All
                    </button>
                  </div>

                  <div className="group flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-red-100 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-red-500 transition-colors shadow-sm">
                        <LinkIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">Remove All Connections</p>
                        <p className="text-sm text-slate-500 font-medium">Delete all API keys and provider configurations.</p>
                      </div>
                    </div>
                    <button
                      onClick={requestDeleteAllConnections}
                      disabled={isDeletingAllConnections}
                      className="bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
                    >
                      {isDeletingAllConnections ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Remove All
                    </button>
                  </div>

                  <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 sm:p-6">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">Dangerous Actions</p>
                        <p className="text-xs text-red-600/80 font-medium leading-relaxed mt-1">
                          These actions are irreversible. Once deleted, your data cannot be recovered. Please make sure you have backups of any important information before proceeding.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMCPManagerOpen && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isMCPManagerClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeMCPManagerModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
            style={{ animation: `${isMCPManagerClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">MCP Manager</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Install, enable, and manage Model Context Protocol servers.</p>
                </div>
                <button onClick={closeMCPManagerModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
                <button
                  onClick={() => setMcpManagerTab('installed')}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${mcpManagerTab === 'installed' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  Installed MCP
                </button>
                <button
                  onClick={() => setMcpManagerTab('browse')}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all ${mcpManagerTab === 'browse' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  Browse
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {mcpManagerTab === 'installed' ? (
                mcpSettings.installed.length === 0 ? (
                  <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
                    <Cpu className="mb-4 h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-100">No installed MCP yet</p>
                    <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">Browse the catalog and install MCP servers that match your workflow.</p>
                    <button
                      onClick={() => setMcpManagerTab('browse')}
                      className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      Browse MCP
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mcpSettings.installed.map(server => (
                      <MCPInstalledRow key={server.id} server={server} onToggle={handleToggleMCP} onRemove={handleUninstallMCP} onConfigure={openMCPConfig} />
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        value={mcpSearch}
                        onChange={event => setMcpSearch(event.target.value)}
                        placeholder="Search MCP servers..."
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-900"
                      />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {MCP_CATEGORY_OPTIONS.map(category => (
                        <button
                          key={category}
                          onClick={() => setMcpCategory(category)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${mcpCategory === category ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'}`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      {MCP_AVAILABILITY_OPTIONS.map(option => (
                        <button
                          key={option}
                          onClick={() => setMcpAvailability(option)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold capitalize transition-colors ${mcpAvailability === option ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {filteredMCPCatalog.map(server => (
                      <MCPBrowseCard
                        key={server.id}
                        server={server}
                        installed={installedMCPIds.has(server.id)}
                        onInstall={handleInstallMCP}
                        onConfigure={handleConfigureCatalogMCP}
                      />
                    ))}
                  </div>
                  {filteredMCPCatalog.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-100">No MCP found</p>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Try another keyword or category.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSearchManagerOpen && (
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isSearchManagerClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeSearchManagerModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
            style={{ animation: `${isSearchManagerClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Search API</h3>
                  <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Manage API-based and no-API search providers.</p>
                </div>
                <button onClick={closeSearchManagerModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    value={toolSearch}
                    onChange={event => setToolSearch(event.target.value)}
                    placeholder="Search providers..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {TOOL_CATEGORY_OPTIONS.map(category => (
                    <button
                      key={category}
                      onClick={() => setToolCategory(category)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${toolCategory === category ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {toolSettings.installed.length > 0 && (
                <div className="mb-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Installed providers</p>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Only one Search provider can be active at a time. DuckDuckGo is used by default when none is selected.</p>
                    </div>
                  </div>
                  {toolSettings.installed.map(tool => (
                    <ToolInstalledRow key={tool.id} tool={tool} onToggle={handleToggleTool} onRemove={handleUninstallTool} onConfigure={openToolConfig} />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredToolCatalog.map(tool => (
                  <ToolBrowseCard
                    key={tool.id}
                    tool={tool}
                    installed={installedToolIds.has(tool.id)}
                    onInstall={handleInstallTool}
                    onConfigure={handleConfigureCatalogTool}
                  />
                ))}
              </div>
              {filteredToolCatalog.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-100">No provider found</p>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Try another keyword or category.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {configuringMCP && (
        <div
          className="fixed inset-0 z-[360] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isMCPConfigClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeMCPConfigModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[84dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
            style={{ animation: `${isMCPConfigClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <SettingsIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-extrabold text-slate-900 dark:text-slate-100">Configure {configuringMCP.name}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{configuringMCP.category}</p>
                  </div>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{configuringMCP.description}</p>
              </div>
              <button onClick={closeMCPConfigModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="mb-1 text-xs font-extrabold text-slate-500 dark:text-slate-400">Command</p>
                <p className="break-all font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{configuringMCP.command} {configuringMCP.args.join(' ')}</p>
              </div>
              {configuringMCP.env.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/70">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">No configuration needed</p>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">This MCP can run without environment keys.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {configuringMCP.env.map(envKey => (
                    <div key={envKey}>
                      <label className="mb-2 block text-xs font-extrabold text-slate-600 dark:text-slate-300">{envKey}</label>
                      <input
                        value={mcpConfigDraft[envKey] || ''}
                        onChange={event => setMcpConfigDraft(prev => ({ ...prev, [envKey]: event.target.value }))}
                        type={envKey.includes('TOKEN') || envKey.includes('SECRET') || envKey.includes('PASSWORD') || envKey.includes('KEY') ? 'password' : 'text'}
                        placeholder={`Enter ${envKey}`}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <button
                onClick={closeMCPConfigModal}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMCPConfig}
                className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {configuringTool && (
        <div
          className="fixed inset-0 z-[360] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isToolConfigClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeToolConfigModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[84dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
            style={{ animation: `${isToolConfigClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <Search className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-extrabold text-slate-900 dark:text-slate-100">Configure {configuringTool.name}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{configuringTool.category}</p>
                  </div>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{configuringTool.description}</p>
              </div>
              <button onClick={closeToolConfigModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              <div className="space-y-4">
                {configuringTool.env.map(envKey => (
                  <div key={envKey}>
                    <label className="mb-2 block text-xs font-extrabold text-slate-600 dark:text-slate-300">{envKey}</label>
                    <input
                      value={toolConfigDraft[envKey] || ''}
                      onChange={event => setToolConfigDraft(prev => ({ ...prev, [envKey]: event.target.value }))}
                      type={envKey.includes('TOKEN') || envKey.includes('SECRET') || envKey.includes('PASSWORD') || envKey.includes('KEY') ? 'password' : 'text'}
                      placeholder={`Enter ${envKey}`}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-4 sm:p-6 dark:border-slate-800">
              <button
                onClick={closeToolConfigModal}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToolConfig}
                className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {cropImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isCropClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeCropModal(); }}
        >
          <div
            className="flex h-[min(90dvh,520px)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ animation: `${isCropClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Crop Avatar</h3>
              <button onClick={closeCropModal} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 relative bg-slate-900">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                rotation={0}
                aspect={1}
                minZoom={1}
                maxZoom={3}
                cropShape="round"
                showGrid={false}
                zoomSpeed={1}
                style={{}}
                classes={{}}
                mediaProps={{}}
                cropperProps={{}}
                restrictPosition={true}
                keyboardStep={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="p-4 border-t border-slate-100 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block">Zoom</label>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
              <button onClick={showCroppedImage} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-colors">
                Apply Avatar
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddConnectionOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isAddConnectionClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => { e.stopPropagation(); closeConnectionModal(); }}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ animation: `${isAddConnectionClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-lg">{editingConnection ? 'Edit Connection' : 'Add Connection'}</h3>
              <button onClick={closeConnectionModal} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              <AddConnectionForm
                initialData={editingConnection}
                onSave={async (data) => {
                  await saveConnection(data);
                  toast.success('Connection saved successfully!');
                  await loadConnections(true);
                  closeConnectionModal();
                }}
                onDelete={async (id) => {
                  await deleteConnection(id);
                  toast.success('Connection deleted!');
                  await loadConnections(true);
                  closeConnectionModal();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {isConnectionProfilesOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/80 p-4"
          onClick={(e) => { e.stopPropagation(); setIsConnectionProfilesOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Connection Profile</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Review, verify, and edit every configured provider profile.</p>
              </div>
              <button onClick={() => setIsConnectionProfilesOpen(false)} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {connections.map(conn => (
                  <div key={conn.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-extrabold text-indigo-600 shadow-inner">
                        {conn.provider.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-800">{conn.name || conn.provider}</p>
                        <p className="mt-1 truncate text-xs font-bold text-indigo-600">{conn.provider}</p>
                        {conn.model && <p className="mt-1 truncate text-xs font-medium text-slate-500">{conn.model}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startVerification(conn)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600">
                        <Zap className="h-4 w-4" />
                        Verify
                      </button>
                      <button onClick={() => { setEditingConnection(conn); setIsConnectionProfilesOpen(false); setIsAddConnectionOpen(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600">
                        <SettingsIcon className="h-4 w-4" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isVerifying && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isVerifyClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-6 flex flex-col items-center text-center" style={{ animation: `${isVerifyClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }} onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <Cpu className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-xl mb-1">Verifying Connection</h3>
            <p className="text-sm text-slate-500 mb-6">Please wait while we test your configuration.</p>

            <div className="w-full space-y-3 mb-6">
              <VerifyStepItem label="Non-Streaming Test" status={verifySteps.nonStream} />
              <VerifyStepItem label="Streaming Test" status={verifySteps.stream} />
            </div>

            {verifyError && (
              <div className="w-full p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl mb-6 text-left flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {verifyError ? (
              <div className="w-full flex gap-3">
                <button onClick={closeVerification} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-colors">
                  Close
                </button>
              </div>
            ) : verifySteps.stream === 'success' ? (
              <button disabled className="w-full bg-green-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Verified Successfully
              </button>
            ) : null}
          </div>
        </div>
      )}

      {isSharedLinksOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isSharedLinksClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => {
            e.stopPropagation();
            closeSharedLinksModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ animation: `${isSharedLinksClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Shared Links</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Manage chats that can be opened through shared URLs.</p>
              </div>
              <button onClick={closeSharedLinksModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {isSharedLinksLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading shared links...
                </div>
              ) : sharedLinks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <LinkIcon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No shared links yet</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Shared chats will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sharedLinks.map(link => {
                    const url = `${window.location.origin}/chat/s/${link.shareId}`;
                    return (
                      <div key={link.shareId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-slate-800">{link.title}</p>
                            <p className="mt-1 truncate text-xs font-semibold text-indigo-600">{url}</p>
                            <p className="mt-2 text-[11px] font-bold text-slate-400">
                              {link.messageCount} messages / {new Date(link.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button onClick={() => copySharedLink(link.shareId)} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600" title="Copy link">
                              <Copy className="h-4 w-4" />
                            </button>
                            <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600" title="Open link">
                              <ExternalLink className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isArchivedChatsOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isArchivedChatsClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => {
            e.stopPropagation();
            closeArchivedChatsModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ animation: `${isArchivedChatsClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-4 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">Archived Chats</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Search conversations that are hidden from the main chat list.</p>
                </div>
                <button onClick={closeArchivedChatsModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={archivedChatSearch}
                  onChange={e => setArchivedChatSearch(e.target.value)}
                  placeholder="Search archived chats..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {isArchivedChatsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading archived chats...
                </div>
              ) : filteredArchivedChats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <Archive className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No archived chats found</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Archived conversations matching your search will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredArchivedChats.map(chat => (
                    <div key={chat.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-800">{chat.title || 'Untitled Chat'}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{chat.messages?.length || 0} messages / {new Date(chat.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => handleDeleteArchivedChat(chat.id)}
                            disabled={deletingArchivedChatId === chat.id}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingArchivedChatId === chat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                          </button>
                          <button
                            onClick={() => {
                              closeArchivedChatsModal();
                              closeSettingsModal();
                              router.push(`/chat/${chat.id}`);
                            }}
                            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSavedMemoriesOpen && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isSavedMemoriesClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => {
            e.stopPropagation();
            closeSavedMemoriesModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
            style={{ animation: `${isSavedMemoriesClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">Saved Memories</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  DeepChat remembers and automatically manages useful information from chat, making response more relevant and personal
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {savedMemories.length > 0 && (
                  <button
                    onClick={handleClearSavedMemories}
                    disabled={isClearingMemories}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isClearingMemories ? 'Clearing...' : 'Clear all'}
                  </button>
                )}
                <button onClick={closeSavedMemoriesModal} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {isSavedMemoriesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading memories...
                </div>
              ) : savedMemories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <Brain className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No saved memories yet</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Useful details from future chats will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedMemories.map(memory => (
                    <div key={memory.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-extrabold text-indigo-600">{memory.category}</span>
                            {memory.sourceProvider && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                {memory.sourceProvider}{memory.sourceModel ? ` / ${memory.sourceModel}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold leading-relaxed text-slate-800">{memory.content}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteSavedMemory(memory.id)}
                          disabled={deletingMemoryId === memory.id}
                          className="rounded-full p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingMemoryId === memory.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div
          className="fixed inset-0 z-[350] flex items-center justify-center bg-slate-900/80 p-4"
          style={{ animation: `${isConfirmClosing ? 'settingsBackdropOut' : 'settingsBackdropIn'} 150ms ease-out both` }}
          onClick={(e) => {
            e.stopPropagation();
            closeConfirmDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
            style={{ animation: `${isConfirmClosing ? 'settingsPanelOut' : 'settingsPanelIn'} 180ms ease-out both` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-extrabold text-slate-900">{confirmDialog.title}</h3>
                <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{confirmDialog.description}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeConfirmDialog}
                disabled={isConfirmingDelete}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isConfirmingDelete}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isConfirmingDelete && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MCPInstalledRow({ server, onToggle, onRemove, onConfigure }: { server: InstalledMCPServer, onToggle: (installedId: string, enabled: boolean) => void, onRemove: (installedId: string) => void, onConfigure: (server: InstalledMCPServer) => void }) {
  const configuredCount = server.env.filter(envKey => Boolean(server.config?.[envKey])).length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{server.name}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{server.category}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold capitalize ${server.availability === 'offline' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'}`}>{server.availability}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${server.enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
              {server.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{server.description}</p>
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            {server.command} {server.args.join(' ')}
          </div>
          {server.env.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {server.env.map(env => (
                <span key={env} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{env}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {server.env.length > 0 && (
            <button
              onClick={() => onConfigure(server)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              title="Configure MCP"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={server.enabled}
            onClick={() => onToggle(server.id, !server.enabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${server.enabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${server.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
          <button
            onClick={() => onRemove(server.id)}
            className="rounded-full p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            title="Remove MCP"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {server.env.length > 0 && (
        <div className="mt-3 text-[11px] font-bold text-slate-400 dark:text-slate-500">
          {configuredCount}/{server.env.length} configuration values set
        </div>
      )}
    </div>
  );
}

function MCPBrowseCard({ server, installed, onInstall, onConfigure }: { server: MCPCatalogServer, installed: boolean, onInstall: (serverId: string) => void, onConfigure: (serverId: string) => void }) {
  return (
    <div className="flex min-h-52 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{server.name}</p>
          <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-indigo-500 dark:text-indigo-300">{server.category}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold capitalize ${server.availability === 'offline' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'}`}>{server.availability}</span>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Cpu className="h-5 w-5" />
          </div>
        </div>
      </div>
      <p className="flex-1 text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{server.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {server.tags.slice(0, 3).map(tag => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tag}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">{server.command} {server.args[0]}</span>
        <div className="flex shrink-0 items-center gap-2">
          {server.env.length > 0 && (
            <button
              onClick={() => onConfigure(server.id)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              title="Configure MCP"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onInstall(server.id)}
            disabled={installed}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${installed ? 'cursor-default bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400'}`}
          >
            {installed ? 'Installed' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolFeatureRow({ icon, title, description, checked, onChange, actionLabel, meta, onAction }: { icon: React.ReactNode, title: string, description: string, checked: boolean, onChange: (checked: boolean) => void, actionLabel?: string, meta?: string, onAction?: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</p>
              {meta && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{meta}</span>}
            </div>
            <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
            >
              {actionLabel}
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${checked ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolInstalledRow({ tool, onToggle, onRemove, onConfigure }: { tool: InstalledTool, onToggle: (installedId: string, enabled: boolean) => void, onRemove: (installedId: string) => void, onConfigure: (tool: InstalledTool) => void }) {
  const configuredCount = tool.env.filter(envKey => Boolean(tool.config?.[envKey])).length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{tool.name}</p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{tool.category}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${tool.enabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
              {tool.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{tool.description}</p>
          <div className="mt-3 text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {tool.env.length > 0 ? `${configuredCount}/${tool.env.length} configuration values set` : 'No API key required'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          {tool.env.length > 0 && (
            <button
              onClick={() => onConfigure(tool)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              title="Configure Tool"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={tool.enabled}
            onClick={() => onToggle(tool.id, !tool.enabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${tool.enabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${tool.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
          <button
            onClick={() => onRemove(tool.id)}
            className="rounded-full p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            title="Remove Tool"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolBrowseCard({ tool, installed, onInstall, onConfigure }: { tool: typeof TOOL_CATALOG[number], installed: boolean, onInstall: (toolId: string) => void, onConfigure: (toolId: string) => void }) {
  return (
    <div className="flex min-h-48 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{tool.name}</p>
          <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-indigo-500 dark:text-indigo-300">{tool.category}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Search className="h-5 w-5" />
        </div>
      </div>
      <p className="flex-1 text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">{tool.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tool.tags.slice(0, 3).map(tag => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tag}</span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {tool.env.length > 0 && (
          <button
            onClick={() => onConfigure(tool.id)}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
            title="Configure Tool"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => onInstall(tool.id)}
          disabled={installed}
          className={`rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${installed ? 'cursor-default bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400'}`}
        >
          {installed ? 'Installed' : 'Install'}
        </button>
      </div>
    </div>
  );
}

function VerifyStepItem({ label, status }: { label: string, status: VerifyStepStatus }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
      <span className="font-bold text-slate-700 text-sm">{label}</span>
      {status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-200" />}
      {status === 'loading' && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
      {status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      {status === 'error' && <X className="w-5 h-5 text-red-500" />}
    </div>
  )
}

function MemoryToggle({ title, description, checked, onChange }: { title: string, description: string, checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}

function GeneralSettingToggle({ title, description, checked, onChange }: { title: string, description: string, checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}

function LLMSettingToggle({ title, description, checked, onChange, disabled = false }: { title: string, description: string, checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}

function NotificationSettingToggle({ title, description, checked, onChange, icon, disabled = false }: { title: string, description: string, checked: boolean, onChange: (checked: boolean) => void, icon?: React.ReactNode, disabled?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">{title}</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}

function ChannelToggle({ label, checked, onChange }: { label: string, checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-colors ${checked ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'}`}
    >
      {label}
    </button>
  );
}

function NotificationEventRow({ label, description, setting, onChange }: { label: string, description: string, setting: NotificationEventSetting, onChange: (patch: Partial<NotificationEventSetting>) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={setting.enabled}
          onClick={() => onChange({ enabled: !setting.enabled })}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors ${setting.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${setting.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      <div className={`mt-4 flex flex-wrap gap-2 ${setting.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <ChannelToggle label="Inbox" checked={setting.inApp} onChange={checked => onChange({ inApp: checked })} />
        <ChannelToggle label="Push" checked={setting.push} onChange={checked => onChange({ push: checked })} />
        <ChannelToggle label="Sound" checked={setting.sound} onChange={checked => onChange({ sound: checked })} />
      </div>
    </div>
  );
}

function AddConnectionForm({ initialData, onSave, onDelete }: { initialData: Connection | null, onSave: (data: Connection) => void, onDelete: (id: string) => void }) {
  const [formData, setFormData] = useState<Connection>({
    id: initialData?.id || '',
    provider: initialData?.provider || 'OpenAI Compatible',
    name: initialData?.name || '',
    apiKey: initialData?.apiKey || '',
    baseUrl: initialData?.baseUrl || '',
    projectId: initialData?.projectId || '',
    location: initialData?.location || 'us-central1',
    model: initialData?.model || '',
  });

  const [models, setModels] = useState<ModelCollection>(initialData?.provider === 'Gemini' ? geminiModels as ModelCollection : []);
  const [loadingModels, setLoadingModels] = useState(false);
  const initialProvider = initialData?.provider;
  const effectiveFormData = formData.provider === 'VertexAI'
    ? { ...formData, baseUrl: getVertexBaseUrl(formData.location) }
    : { ...formData, baseUrl: formData.baseUrl || getDefaultBaseUrl(formData.provider) };

  const updateFormData = (patch: Partial<Connection>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  };

  const handleProviderChange = (provider: string) => {
    updateFormData({
      provider,
      baseUrl: getDefaultBaseUrl(provider)
    });
    if (provider === 'Gemini') {
      setModels(geminiModels as ModelCollection);
    } else if (provider !== initialProvider) {
      setModels([]);
    }
  };

  const fetchModels = async () => {
    if (!formData.apiKey) {
      toast.error('API Key is required to fetch models');
      return;
    }
    setLoadingModels(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(effectiveFormData)
      });
      const data = await res.json() as { models?: ModelCollection; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to fetch models');

      const newModels = dedupeModelCollection(data.models || []);
      setModels(newModels);

      if (newModels.length > 0 && !formData.model) {
        if (isModelCategory(newModels[0])) {
          const firstModel = newModels.filter(isModelCategory).flatMap(c => c.models)[0];
          if (firstModel) setFormData(p => ({ ...p, model: firstModel.id }));
        } else {
          setFormData(p => ({ ...p, model: (newModels[0] as ModelItem).id }));
        }
      }
      toast.success('Models fetched successfully');
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to fetch models'));
    }
    setLoadingModels(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Provider</label>
        <CustomDropdown
          value={formData.provider}
          onChange={handleProviderChange}
          options={PROVIDER_OPTIONS}
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">Connection Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => updateFormData({ name: e.target.value })}
          placeholder="e.g. My Primary AI"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">API Key</label>
        <input
          type="password"
          value={formData.apiKey}
          onChange={e => updateFormData({ apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
        />
      </div>

      {formData.provider === 'OpenAI Compatible' && (
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Base URL</label>
          <input
            type="text"
            value={formData.baseUrl}
            onChange={e => updateFormData({ baseUrl: e.target.value })}
            placeholder={getDefaultBaseUrl(formData.provider) || 'https://api...'}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
          />
        </div>
      )}

      {formData.provider === 'VertexAI' && (
        <>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Project ID</label>
            <input
              type="text"
              value={formData.projectId}
              onChange={e => updateFormData({ projectId: e.target.value })}
              placeholder="e.g. my-gcp-project-123"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Location</label>
            <CustomDropdown
              value={formData.location}
              onChange={val => updateFormData({ location: val })}
              options={VERTEX_LOCATION_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Generated Base URL</label>
            <input
              type="text"
              value={effectiveFormData.baseUrl}
              readOnly
              className="w-full bg-slate-100 text-slate-500 border border-slate-200 rounded-xl px-4 py-3 outline-none font-medium cursor-not-allowed"
            />
          </div>
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-bold text-slate-700">Default Model</label>
          <button onClick={fetchModels} disabled={loadingModels} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-bold transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
            Fetch Models
          </button>
        </div>
        {models.length > 0 ? (
          isModelCategory(models[0]) ? (
            <CustomModelDropdown
              value={formData.model}
              onChange={val => updateFormData({ model: val })}
              models={models}
            />
          ) : (
            <select
              value={formData.model}
              onChange={e => updateFormData({ model: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium appearance-none"
            >
              <option value="">Select a model</option>
              {models.filter((model): model is ModelItem => !isModelCategory(model)).map((m, index) => (
                <option key={`${m.id}-${index}`} value={m.id}>{m.name}</option>
              ))}
            </select>
          )
        ) : (
          <input
            type="text"
            value={formData.model}
            onChange={e => updateFormData({ model: e.target.value })}
            placeholder="e.g. gpt-4, claude-3-opus, etc."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 font-medium"
          />
        )}
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button onClick={() => onSave(effectiveFormData)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-colors">
          Save Connection
        </button>
        {initialData && (
          <button onClick={() => onDelete(initialData.id)} className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 font-bold transition-all sm:w-full ${active
        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300 dark:shadow-black/20'
        : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 border border-transparent dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-100'
        }`}
    >
      {icon} {label}
    </button>
  );
}
