import fs from 'fs/promises';
import path from 'path';
import { USER_DIR, ensureDataDirectories } from '@/lib/data-directories';

export type ReasoningLevel = 'minimal' | 'low' | 'medium' | 'high' | 'heavy';

export interface LLMSettings {
  streamingResponse: boolean;
  reasoning: boolean;
  reasoningLevel: ReasoningLevel;
}

type GeminiThinkingConfig = {
  thinkingBudget?: number;
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
};

const LLM_SETTINGS_FILE = path.join(USER_DIR, 'llm-settings.json');
const REASONING_LEVELS: ReasoningLevel[] = ['minimal', 'low', 'medium', 'high', 'heavy'];

export const defaultLLMSettings: LLMSettings = {
  streamingResponse: true,
  reasoning: false,
  reasoningLevel: 'medium'
};

const isReasoningLevel = (value: unknown): value is ReasoningLevel => (
  typeof value === 'string' && REASONING_LEVELS.includes(value as ReasoningLevel)
);

const normalizeLLMSettings = (settings: Partial<LLMSettings> = {}): LLMSettings => ({
  streamingResponse: typeof settings.streamingResponse === 'boolean' ? settings.streamingResponse : defaultLLMSettings.streamingResponse,
  reasoning: typeof settings.reasoning === 'boolean' ? settings.reasoning : defaultLLMSettings.reasoning,
  reasoningLevel: isReasoningLevel(settings.reasoningLevel) ? settings.reasoningLevel : defaultLLMSettings.reasoningLevel
});

export const ensureLLMSettingsDir = async () => {
  await ensureDataDirectories();
};

export const readLLMSettings = async (): Promise<LLMSettings> => {
  await ensureLLMSettingsDir();
  try {
    const content = await fs.readFile(LLM_SETTINGS_FILE, 'utf-8');
    return normalizeLLMSettings(JSON.parse(content));
  } catch {
    await fs.writeFile(LLM_SETTINGS_FILE, JSON.stringify(defaultLLMSettings, null, 2));
    return defaultLLMSettings;
  }
};

export const writeLLMSettings = async (settings: Partial<LLMSettings>) => {
  await ensureLLMSettingsDir();
  const current = await readLLMSettings();
  const next = normalizeLLMSettings({ ...current, ...settings });
  await fs.writeFile(LLM_SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
};

export const getOpenAIReasoningEffort = (settings: LLMSettings) => {
  if (!settings.reasoning) return null;
  if (settings.reasoningLevel === 'heavy') return 'high';
  return settings.reasoningLevel;
};

export const applyOpenAICompatibleReasoning = (body: Record<string, unknown>, settings: LLMSettings) => {
  const effort = getOpenAIReasoningEffort(settings);
  if (!effort) return body;
  return {
    ...body,
    reasoning_effort: effort
  };
};

export const stripOpenAICompatibleReasoning = (body: Record<string, unknown>) => {
  const next = { ...body };
  delete next.reasoning_effort;
  return next;
};

export const getGeminiThinkingConfig = (model: string, settings: LLMSettings): GeminiThinkingConfig | null => {
  const id = model.toLowerCase();
  const isGemini3 = id.includes('gemini-3');
  const isGemini25 = id.includes('gemini-2.5');
  const isPro = id.includes('pro');
  const isLite = id.includes('lite');

  if (!settings.reasoning) {
    if (isGemini25 && !isPro) return { thinkingBudget: 0 };
    return null;
  }

  if (isGemini3) {
    if (isPro) {
      return settings.reasoningLevel === 'high' || settings.reasoningLevel === 'heavy'
        ? { thinkingLevel: 'HIGH' }
        : { thinkingLevel: 'LOW' };
    }
    if (settings.reasoningLevel === 'minimal') return { thinkingLevel: 'MINIMAL' };
    if (settings.reasoningLevel === 'low') return { thinkingLevel: 'LOW' };
    if (settings.reasoningLevel === 'medium') return { thinkingLevel: 'MEDIUM' };
    return { thinkingLevel: 'HIGH' };
  }

  if (!isGemini25) return null;
  if (settings.reasoningLevel === 'minimal' || settings.reasoningLevel === 'low') return { thinkingBudget: isLite ? 512 : 1024 };
  if (settings.reasoningLevel === 'medium') return { thinkingBudget: 8192 };
  if (settings.reasoningLevel === 'heavy' && isPro) return { thinkingBudget: 32768 };
  return { thinkingBudget: 24576 };
};

export const applyGeminiThinkingConfig = <T extends Record<string, unknown>>(
  config: T,
  model: string,
  settings: LLMSettings
) => {
  const thinkingConfig = getGeminiThinkingConfig(model, settings);
  if (!thinkingConfig) return config;
  return {
    ...config,
    thinkingConfig
  };
};

export const applyVertexThinkingConfig = (body: Record<string, unknown>, model: string, settings: LLMSettings) => {
  const thinkingConfig = getGeminiThinkingConfig(model, settings);
  if (!thinkingConfig) return body;
  const currentGenerationConfig = body.generationConfig && typeof body.generationConfig === 'object'
    ? body.generationConfig as Record<string, unknown>
    : {};
  return {
    ...body,
    generationConfig: {
      ...currentGenerationConfig,
      thinkingConfig
    }
  };
};
