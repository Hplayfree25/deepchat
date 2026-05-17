import { NextResponse } from 'next/server';
import {
  getAnthropicModelsUrl,
  getCleanBaseUrl,
  getModelListUrl,
  getVertexPublisherModelsUrl,
  normalizeProvider
} from '@/lib/llm';
import { GEMINI_MODELS } from '@/lib/gemini-models';

type ModelItem = {
  id: string;
  name: string;
  badge?: string;
};

type ModelCategory = {
  category: string;
  models: ModelItem[];
};

type GeminiApiModel = {
  id?: string;
  name?: string;
  displayName?: string;
};

type ApiModel = {
  id?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  capabilities?: {
    completion_chat?: boolean;
  };
  archived?: boolean;
};

type GeminiClientOptions = {
  apiKey: string;
  httpOptions?: {
    baseUrl: string;
  };
};

const NVIDIA_NIM_FALLBACK_MODELS: ModelItem[] = [
  { id: 'meta/llama-3.1-70b-instruct', name: 'meta/llama-3.1-70b-instruct' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'mistralai/mixtral-8x22b-instruct-v0.1' },
  { id: 'microsoft/phi-3-medium-4k-instruct', name: 'microsoft/phi-3-medium-4k-instruct' },
  { id: 'google/codegemma-7b', name: 'google/codegemma-7b' },
  { id: 'nvidia/usdcode-llama-3.1-70b-instruct', name: 'nvidia/usdcode-llama-3.1-70b-instruct' }
];

const normalizeModelId = (model: GeminiApiModel) => (model.name || model.id || '').replace(/^models\//, '');

const getApiModelLabel = (model: ApiModel) => model.display_name || model.displayName || model.name || model.id || '';

const mapApiModels = (models?: ApiModel[]) => {
  const seen = new Set<string>();
  const mapped: ModelItem[] = [];

  for (const model of models || []) {
    if (!model.id || model.archived === true || model.capabilities?.completion_chat === false || seen.has(model.id)) continue;
    seen.add(model.id);
    mapped.push({ id: model.id, name: getApiModelLabel(model) || model.id });
  }

  return mapped;
};

const getProviderCategory = (modelId: string) => {
  const provider = modelId.split('/')[0]?.trim();
  return provider || 'other';
};

const groupModelsByProvider = (models: ModelItem[]) => {
  const grouped = new Map<string, ModelItem[]>();

  for (const model of models) {
    const category = getProviderCategory(model.id);
    if (!grouped.has(category)) grouped.set(category, []);
    (grouped.get(category) as ModelItem[]).push(model);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, models: items }));
};

const getGeminiCategory = (id: string) => {
  if (id.includes('embedding')) return 'Embeddings';
  if (id.startsWith('veo-')) return 'Video Generation';
  if (id.startsWith('lyria-')) return 'Music Generation';
  if (id.startsWith('imagen-') || id.includes('image')) return 'Image Generation & Editing';
  if (id.includes('live') || id.includes('native-audio')) return 'Live Audio';
  if (id.includes('tts')) return 'Text-to-Speech';
  if (id.includes('computer-use') || id.includes('deep-research')) return 'Tool & Agent Models';
  if (id.startsWith('gemini-3')) return 'Gemini 3 Text & Multimodal';
  if (id.startsWith('gemini-2.5')) return 'Gemini 2.5 Text & Multimodal';
  return '';
};

const isCurrentGeminiModel = (id: string) => Boolean(getGeminiCategory(id)) &&
  !id.includes('deprecated') &&
  !id.includes('shutdown') &&
  !id.startsWith('gemini-2.0') &&
  !id.startsWith('gemini-1.');

const getModelBadge = (id: string) => {
  if (id.includes('preview')) return 'preview';
  if (id.includes('exp')) return 'experimental';
  if (id.includes('latest')) return 'latest';
  return 'stable';
};

const mergeModelCollections = (primary: ModelCategory[], fallback: ModelCategory[]) => {
  const categoryOrder = fallback.map(category => category.category);
  const byCategory = new Map<string, ModelItem[]>();
  const seen = new Set<string>();

  for (const category of [...primary, ...fallback]) {
    if (!category?.category || !Array.isArray(category.models)) continue;
    if (!byCategory.has(category.category)) byCategory.set(category.category, []);
    const items = byCategory.get(category.category) as ModelItem[];

    for (const model of category.models) {
      if (!model?.id || seen.has(model.id)) continue;
      seen.add(model.id);
      items.push(model);
    }
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    })
    .map(([category, models]) => ({ category, models }));
};

const groupGeminiModels = (models: GeminiApiModel[]) => {
  const grouped = new Map<string, ModelItem[]>();
  const seen = new Set<string>();

  for (const model of models) {
    const id = normalizeModelId(model);
    if (!id || seen.has(id) || !isCurrentGeminiModel(id)) continue;
    const category = getGeminiCategory(id);
    if (!category) continue;
    if (!grouped.has(category)) grouped.set(category, []);
    seen.add(id);
    (grouped.get(category) as ModelItem[]).push({
      id,
      name: model.displayName || model.name?.replace(/^models\//, '') || id,
      badge: getModelBadge(id)
    });
  }

  return [...grouped.entries()].map(([category, models]) => ({ category, models }));
};

export async function POST(req: Request) {
  try {
    const { provider, apiKey, baseUrl, projectId, location } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Please provide both Provider and API Key to continue.' },
        { status: 400 }
      );
    }

    const p = normalizeProvider(provider);
    const cleanBase = getCleanBaseUrl(p, baseUrl);

    if (p === 'anthropic') {
      const url = getAnthropicModelsUrl(cleanBase);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Failed to connect to Anthropic service.');
      const data = await res.json() as { data?: ApiModel[] };
      const models = mapApiModels(data.data);
      return NextResponse.json({ models });
    }

    if (p === 'gemini') {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const staticModels = GEMINI_MODELS;
        const aiOptions: GeminiClientOptions = { apiKey };
        if (cleanBase) {
          aiOptions.httpOptions = { baseUrl: cleanBase };
        }
        const ai = new GoogleGenAI(aiOptions);
        const pager = await ai.models.list({ config: { queryBase: true, pageSize: 100 } });
        const fetchedModels = [];

        for await (const model of pager) {
          fetchedModels.push(model);
        }

        const groupedModels = groupGeminiModels(fetchedModels);
        if (groupedModels.length > 0) {
          return NextResponse.json({ models: mergeModelCollections(groupedModels, staticModels) });
        }

        return NextResponse.json({ models: staticModels });
      } catch {
        return NextResponse.json({ models: GEMINI_MODELS });
      }
    }

    if (p === 'vertexai') {
      if (!projectId || !location) {
        return NextResponse.json(
          { error: 'Project ID and Location are required for Vertex AI.' },
          { status: 400 }
        );
      }
      
      const url = getVertexPublisherModelsUrl(projectId, location);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Failed to connect to Vertex AI service. Ensure your token, Project ID, and Location are correct.');
      const data = await res.json() as { models?: ApiModel[] };
      const models = data.models?.map(m => ({ id: m.name || '', name: m.displayName || m.name || '' })) || [];
      return NextResponse.json({ models });
    }

    const url = getModelListUrl(p, cleanBase);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json'
      }
    });

    if (!res.ok) {
      if (p === 'nvidia nim') {
        return NextResponse.json({ models: groupModelsByProvider(NVIDIA_NIM_FALLBACK_MODELS) });
      }
      throw new Error(`Failed to connect to ${provider} service.`);
    }
    
    const data = await res.json() as { data?: ApiModel[] };
    const models = mapApiModels(data.data);
    if (models.length === 0 && p === 'nvidia nim') {
      return NextResponse.json({ models: groupModelsByProvider(NVIDIA_NIM_FALLBACK_MODELS) });
    }
    if (p === 'nvidia nim') {
      return NextResponse.json({ models: groupModelsByProvider(models) });
    }
    return NextResponse.json({ models });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: message || 'A system error occurred while contacting the service. Please try again later.' },
      { status: 500 }
    );
  }
}
