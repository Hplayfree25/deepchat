import { NextResponse } from 'next/server';
import { getConnections } from '@/app/actions';
import {
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

const buildFallbackTitle = (prompt: string) => {
  const clean = prompt
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(' ').filter(word => word.length > 1).slice(0, 6);
  const title = words.join(' ');
  return title || 'Untitled Conversation';
};

const isGenericTitle = (title: string) => {
  const normalized = title.replace(/["'*.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return !normalized ||
    normalized === 'new chat' ||
    normalized === 'untitled chat' ||
    normalized === 'untitled conversation' ||
    normalized === 'chat title' ||
    normalized === 'conversation title' ||
    normalized.length < 4;
};

const cleanTitle = (raw: string) => raw
  .replace(/```[\s\S]*?```/g, '')
  .replace(/^title\s*:\s*/i, '')
  .replace(/^["'*\s]+|["'*\s]+$/g, '')
  .replace(/[.!?]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .slice(0, 7)
  .join(' ');

type TitleModelResponse = {
  content?: { text?: string }[];
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  choices?: { message?: { content?: string } }[];
};

const extractTitle = (provider: string, data: TitleModelResponse) => {
  if (provider === 'anthropic') return data.content?.[0]?.text || '';
  if (provider === 'gemini' || provider === 'vertexai') return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return data.choices?.[0]?.message?.content || '';
};

export async function POST(req: Request) {
  let promptForFallback = '';
  try {
    const { prompt, modelId, connectionId } = await req.json() as {
      prompt?: string;
      modelId?: string;
      connectionId?: string;
    };
    promptForFallback = prompt || '';

    if (!prompt || (!modelId && !connectionId)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const connections = await getConnections() as LlmConnection[];
    const conn = selectLlmConnection(connections, connectionId, modelId);

    if (!conn) {
      return NextResponse.json({ error: 'No API connection found.' }, { status: 400 });
    }

    const p = normalizeProvider(conn.provider);
    const finalBase = getCleanBaseUrl(p, conn.baseUrl);

    const sysMsg = "Create a specific chat title from the user's message. Output only a concise 3-6 word title. Never output New Chat, Untitled Chat, Chat Title, quotes, markdown, or explanations.";
    const prompts = [
      prompt,
      `Generate a better specific title for this chat. Avoid generic words like New Chat.\n\n${prompt}`,
      `Summarize the user's intent as a short title with concrete nouns and verbs.\n\n${prompt}`
    ];

    const callTitleModel = async (titlePrompt: string) => {
      let url = '';
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      let body: unknown = {};

      if (p === 'anthropic') {
        url = getAnthropicMessagesUrl(finalBase);
        headers['x-api-key'] = conn.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: modelId || conn.model,
          max_tokens: 30,
          system: sysMsg,
          messages: [{ role: 'user', content: titlePrompt }],
          stream: false
        };
      } else if (p === 'gemini') {
        const { GoogleGenAI } = await import('@google/genai');
        const aiOptions: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey: conn.apiKey };
        if (finalBase) {
          aiOptions.httpOptions = { baseUrl: finalBase };
        }
        const ai = new GoogleGenAI(aiOptions);
        const chosenModel = modelId || conn.model;
        const mPath = getGeminiModelPath(chosenModel);
        const response = await ai.models.generateContent({
          model: mPath,
          contents: [{ role: 'user', parts: [{ text: titlePrompt }] }],
          config: { systemInstruction: sysMsg }
        });
        return cleanTitle(response.text || '');
      } else if (p === 'vertexai') {
        const chosenModel = modelId || conn.model;
        url = getVertexGenerateContentUrl(conn.projectId, conn.location, chosenModel, 'generateContent');
        headers['Authorization'] = `Bearer ${conn.apiKey}`;
        body = { contents: [{ role: 'user', parts: [{ text: `${sysMsg}\n\n${titlePrompt}` }] }] };
      } else {
        url = getChatCompletionsUrl(p, finalBase);
        headers['Authorization'] = `Bearer ${conn.apiKey}`;
        body = {
          model: modelId || conn.model,
          messages: [
            { role: 'system', content: sysMsg },
            { role: 'user', content: titlePrompt }
          ],
          stream: false,
          max_tokens: 30,
          temperature: 0.2
        };
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json() as TitleModelResponse;
      return cleanTitle(extractTitle(p, data));
    };

    for (const titlePrompt of prompts) {
      try {
        const title = await callTitleModel(titlePrompt);
        if (!isGenericTitle(title)) return NextResponse.json({ title });
      } catch {
      }
    }

    return NextResponse.json({ title: buildFallbackTitle(promptForFallback) });
  } catch {
    return NextResponse.json({ title: buildFallbackTitle(promptForFallback) });
  }
}
