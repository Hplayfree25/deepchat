export interface LlmConnection {
  id: string;
  provider: string;
  name?: string;
  apiKey: string;
  baseUrl?: string;
  projectId?: string;
  location?: string;
  model: string;
}

export interface GeminiTextResponse {
  text?: unknown;
  candidates?: {
    content?: {
      parts?: { text?: unknown }[];
    };
  }[];
}

export const normalizeProvider = (provider: unknown) => String(provider || '').toLowerCase();

const isOpenAiCompatibleBaseProvider = (provider: string) => (
  provider.includes('openai') ||
  provider === 'deepseek' ||
  provider === 'anthropic' ||
  provider === 'mistral' ||
  provider === 'nvidia nim'
);

export const getCleanBaseUrl = (provider: unknown, baseUrl?: string) => {
  if (!baseUrl) return '';
  const p = normalizeProvider(provider);
  let cleanBase = baseUrl.replace(/\/$/, '');
  if (isOpenAiCompatibleBaseProvider(p) && cleanBase.endsWith('/v1')) {
    cleanBase = cleanBase.slice(0, -3);
  } else if (p === 'gemini' && cleanBase.endsWith('/v1beta')) {
    cleanBase = cleanBase.slice(0, -7);
  }
  return cleanBase;
};

export const selectLlmConnection = <T extends { id?: string; model?: string }>(
  connections: T[],
  connectionId?: string,
  modelId?: string
) => {
  if (connectionId) {
    const byId = connections.find(connection => connection.id === connectionId);
    if (byId) return byId;
  }
  if (modelId) {
    const byModel = connections.find(connection => connection.model === modelId);
    if (byModel) return byModel;
  }
  return connections[0];
};

export const getGeminiModelPath = (model: string) => (
  model.startsWith('models/') ? model.replace('models/', '') : model
);

export const getVertexModelPath = (model: string) => (
  model.startsWith('publishers/') ? model : `publishers/google/models/${model}`
);

export const getChatCompletionsUrl = (provider: unknown, cleanBaseUrl: string) => {
  const p = normalizeProvider(provider);
  if (cleanBaseUrl) return `${cleanBaseUrl}/v1/chat/completions`;
  if (p === 'deepseek') return 'https://api.deepseek.com/v1/chat/completions';
  if (p === 'mistral') return 'https://api.mistral.ai/v1/chat/completions';
  if (p === 'nvidia nim') return 'https://integrate.api.nvidia.com/v1/chat/completions';
  return 'https://api.openai.com/v1/chat/completions';
};

export const getModelListUrl = (provider: unknown, cleanBaseUrl: string) => {
  const p = normalizeProvider(provider);
  if (cleanBaseUrl) return `${cleanBaseUrl}/v1/models`;
  if (p === 'deepseek') return 'https://api.deepseek.com/v1/models';
  if (p === 'mistral') return 'https://api.mistral.ai/v1/models';
  if (p === 'nvidia nim') return 'https://integrate.api.nvidia.com/v1/models';
  return 'https://api.openai.com/v1/models';
};

export const getAnthropicMessagesUrl = (cleanBaseUrl: string) => (
  cleanBaseUrl ? `${cleanBaseUrl}/v1/messages` : 'https://api.anthropic.com/v1/messages'
);

export const getAnthropicModelsUrl = (cleanBaseUrl: string) => (
  cleanBaseUrl ? `${cleanBaseUrl}/v1/models` : 'https://api.anthropic.com/v1/models'
);

export const getVertexGenerateContentUrl = (
  projectId: string | undefined,
  location: string | undefined,
  model: string,
  endpoint: string
) => `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/${getVertexModelPath(model)}:${endpoint}`;

export const getVertexPublisherModelsUrl = (projectId: string, location: string) => (
  `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`
);

export const extractGeminiText = (response: GeminiTextResponse) => {
  if (typeof response?.text === 'string') return response.text;
  return response?.candidates?.[0]?.content?.parts
    ?.map(part => typeof part?.text === 'string' ? part.text : '')
    .join('') || '';
};
