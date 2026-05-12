import { NextResponse } from 'next/server';
import { getConnections } from '@/app/actions';
import { getPersona } from '@/app/persona';
import { recordChatHistoryMemory, saveExtractedMemories, type SavedMemory } from '@/app/memory';
import {
  extractGeminiText,
  getAnthropicMessagesUrl,
  getChatCompletionsUrl,
  getCleanBaseUrl,
  getGeminiModelPath,
  getVertexGenerateContentUrl,
  normalizeProvider,
  selectLlmConnection,
  type LlmConnection
} from '@/lib/llm';

export const runtime = 'nodejs';

const systemPrompt = `You extract durable user memories for DeepChat. Return a compact JSON array only. Each item must be {"content":"...","category":"...","importance":"low|medium|high"}. Save only explicit or strongly implied stable facts about the user: identity, preferred name, language preference stated by the user, role, durable preferences, long-term goals, recurring projects, constraints, and standing instructions. Do not infer preferences from a single greeting, language used once, assistant style, repeated regenerate outputs, short chit-chat, temporary requests, secrets, API keys, passwords, payment data, medical/legal/financial details, sensitive traits, facts about the assistant, insults, jokes, or anything uncertain. If there is nothing useful to remember, return [].`;

interface ExtractedMemoryCandidate {
  content?: unknown;
  category?: unknown;
  importance?: unknown;
}

interface NormalizedExtractedMemory {
  content: string;
  category: string;
  importance: 'low' | 'medium' | 'high';
}

const parseJsonArray = (text: string) => {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

const buildPrompt = (userMessage: string, assistantMessage: string) => `Latest user message:
${userMessage.slice(0, 5000)}

Assistant response:
${assistantMessage.slice(0, 3000)}

Extract only durable user memories from the user message and useful context confirmed by the assistant response.`;

const durableSignalPatterns = [
  /\b(?:ingat|remember|catat|save)\b/i,
  /\b(?:nama saya|nama aku|nama gue|nama gua|nama gw|namaku|my name is|call me|panggil saya|panggil aku|panggil gue|panggil gua|panggil gw)\b/i,
  /\b(?:saya|aku|gue|gua|gw|i)\s+(?:suka|prefer|preferensi|biasanya|selalu|sering|bekerja|kerja|membangun|punya|pakai|menggunakan)\b/i,
  /\b(?:jangan|don't|do not|always|selalu)\s+(?:panggil|gunakan|jawab|pakai|use|answer|call)\b/i,
  /\b(?:pekerjaan|profesi|role|project|proyek|goal|tujuan|constraint|batasan|preference|preferensi)\b/i
];

const isExplicitMemoryIntent = (text: string) => durableSignalPatterns.slice(0, 2).some(pattern => pattern.test(text));

const hasDurableSignal = (text: string) => durableSignalPatterns.some(pattern => pattern.test(text));

const getSignalWordCount = (text: string) => text
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(token => token.length > 2)
  .length;

const shouldRunSavedMemoryExtraction = (userMessage: string) => {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (isExplicitMemoryIntent(normalized)) return true;
  if (!hasDurableSignal(normalized)) return false;
  return normalized.length >= 24 && getSignalWordCount(normalized) >= 5;
};

const isUsefulMemoryCandidate = (item: NormalizedExtractedMemory, userMessage: string) => {
  const content = item.content.replace(/\s+/g, ' ').trim();
  if (content.length < 8 || content.length > 260) return false;
  const lower = content.toLowerCase();
  const userLower = userMessage.toLowerCase();
  if (/\b(?:assistant|deepchat|model|ai)\b/.test(lower)) return false;
  if (/\b(?:halo|hello|hi|hey)\b[!. ]*$/.test(userLower) && !isExplicitMemoryIntent(userMessage)) return false;
  if (lower.includes('prefers communicating in indonesian') && !/(indonesia|bahasa)/i.test(userMessage)) return false;
  if (!isExplicitMemoryIntent(userMessage) && !hasDurableSignal(userMessage) && item.importance !== 'high') return false;
  return true;
};

const extractExplicitMemoryFallback = (userMessage: string) => {
  const text = userMessage.replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(?:ingat|remember)\s+(?:bahwa|that)\s+(.+)/i,
    /\b(?:tolong\s+)?(?:ingat|remember)\s+(.+)/i,
    /\b(?:catat|save)\s+(?:bahwa|that)?\s*(.+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const raw = match?.[1]?.trim().replace(/[.!?]+$/, '');
    if (!raw || raw.length < 6 || raw.length > 220) continue;
    return [{
      content: raw,
      category: 'User Preference',
      importance: 'high' as const
    }];
  }

  return [];
};

const callMemoryModel = async (conn: LlmConnection, model: string, prompt: string) => {
  const provider = normalizeProvider(conn.provider);
  const cleanBase = getCleanBaseUrl(provider, conn.baseUrl);

  if (provider === 'anthropic') {
    const url = getAnthropicMessagesUrl(cleanBase);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': conn.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const content = data?.content as { text?: string }[] | undefined;
    return content?.map(part => part?.text || '').join('') || '';
  }

  if (provider === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const aiOptions: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey: conn.apiKey };
    if (cleanBase) aiOptions.httpOptions = { baseUrl: cleanBase };
    const ai = new GoogleGenAI(aiOptions);
    const mPath = getGeminiModelPath(model);
    const response = await ai.models.generateContent({
      model: mPath,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0
      }
    });
    return extractGeminiText(response);
  }

  if (provider === 'vertexai') {
    const url = getVertexGenerateContentUrl(conn.projectId, conn.location, model, 'generateContent');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${conn.apiKey}`
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0, maxOutputTokens: 800 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
    return parts?.map(part => part?.text || '').join('') || '';
  }

  const url = getChatCompletionsUrl(provider, cleanBase);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${conn.apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
};

export async function POST(req: Request) {
  try {
    const { userMessage, assistantMessage, modelId, connectionId, chatId, userMessageId } = await req.json();
    const persona = await getPersona();

    if (persona.memoryReferenceSaved === false && persona.memoryReferenceHistory === false) {
      return NextResponse.json({ savedCount: 0, memories: [] });
    }

    if (!userMessage || !assistantMessage) {
      return NextResponse.json({ savedCount: 0, memories: [] });
    }

    const connections = await getConnections() as LlmConnection[];
    const conn = selectLlmConnection(connections, connectionId, modelId);

    if (!conn) {
      return NextResponse.json({ savedCount: 0, memories: [] });
    }

    const model = modelId || conn.model;
    const provider = conn.provider;
    const metadata = {
      provider,
      model,
      connectionId: conn.id,
      chatId,
      userMessageId
    };

    let saved: SavedMemory[] = [];
    if (persona.memoryReferenceSaved !== false && shouldRunSavedMemoryExtraction(userMessage)) {
      let extracted: NormalizedExtractedMemory[] = [];
      try {
        const raw = await callMemoryModel(conn, model, buildPrompt(userMessage, assistantMessage));
        extracted = parseJsonArray(raw)
          .map((item: ExtractedMemoryCandidate) => {
            const importance: 'low' | 'medium' | 'high' =
              item?.importance === 'low' || item?.importance === 'medium' || item?.importance === 'high'
                ? item.importance
                : 'medium';
            return {
              content: typeof item?.content === 'string' ? item.content : '',
              category: typeof item?.category === 'string' ? item.category : 'General',
              importance
            };
          })
          .filter(item => isUsefulMemoryCandidate(item, userMessage));
      } catch {
        extracted = [];
      }

      if (extracted.length === 0) {
        extracted = extractExplicitMemoryFallback(userMessage);
      }

      extracted = extracted.filter(item => isUsefulMemoryCandidate(item, userMessage));
      saved = await saveExtractedMemories(extracted, metadata);
    }

    const historySaved = persona.memoryReferenceHistory === false
      ? null
      : await recordChatHistoryMemory(userMessage, assistantMessage, metadata);

    return NextResponse.json({
      savedCount: saved.length,
      savedMemoryCount: saved.length,
      memories: saved,
      historySaved: Boolean(historySaved),
      provider,
      model
    });
  } catch {
    return NextResponse.json({ savedCount: 0, memories: [] });
  }
}
