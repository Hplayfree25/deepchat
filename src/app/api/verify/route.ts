import { NextResponse } from 'next/server';
import {
  getAnthropicMessagesUrl,
  getChatCompletionsUrl,
  getCleanBaseUrl,
  getGeminiModelPath,
  getVertexGenerateContentUrl,
  normalizeProvider
} from '@/lib/llm';

type VerifyPayload = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  projectId?: string;
  location?: string;
  model?: string;
  type?: string;
};

const getMessage = (error: unknown) => (
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Unknown verification error'
);

export async function POST(req: Request) {
  try {
    const { provider, apiKey, baseUrl, projectId, location, model, type } = await req.json() as VerifyPayload;

    if (!provider || !apiKey || !model || !type) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const p = normalizeProvider(provider);
    const isStream = type === 'streaming';
    const prompt = 'Reply with "ok"';
    const cleanBase = getCleanBaseUrl(p, baseUrl);

    if (p === 'anthropic') {
      const url = getAnthropicMessagesUrl(cleanBase);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: prompt }],
          stream: isStream
        })
      });

      if (!res.ok) throw new Error('Anthropic verification failed.');

      if (isStream && res.body) {
        const reader = res.body.getReader();
        await reader.read();
      } else {
        await res.json();
      }
      return NextResponse.json({ success: true });
    }

    if (p === 'gemini') {
      const { GoogleGenAI } = await import('@google/genai');
      const aiOptions: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey };
      if (cleanBase) {
        aiOptions.httpOptions = { baseUrl: cleanBase };
      }
      const ai = new GoogleGenAI(aiOptions);

      const mPath = getGeminiModelPath(model);

      try {
        if (isStream) {
          const responseStream = await ai.models.generateContentStream({
            model: mPath,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });
          const iterator = responseStream[Symbol.asyncIterator]();
          await iterator.next();
        } else {
          await ai.models.generateContent({
            model: mPath,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });
        }
        return NextResponse.json({ success: true });
      } catch (e: unknown) {
        throw new Error(`Gemini verification failed: ${getMessage(e)}`);
      }
    }

    if (p === 'vertexai') {
      const endpoint = isStream ? 'streamGenerateContent' : 'generateContent';
      const url = getVertexGenerateContentUrl(projectId, location, model, endpoint);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });

      if (!res.ok) throw new Error('Vertex AI verification failed.');

      if (isStream && res.body) {
        const reader = res.body.getReader();
        await reader.read();
      } else {
        await res.json();
      }
      return NextResponse.json({ success: true });
    }

    const url = getChatCompletionsUrl(p, cleanBase);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: isStream,
        max_tokens: 10
      })
    });

    if (!res.ok) {
      await res.text();
      throw new Error(`Failed to connect to ${provider} service.`);
    }

    if (isStream && res.body) {
      const reader = res.body.getReader();
      await reader.read();
    } else {
      await res.json();
    }
    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    return NextResponse.json({ error: getMessage(err) }, { status: 500 });
  }
}
