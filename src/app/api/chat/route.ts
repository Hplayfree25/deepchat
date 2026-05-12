import { NextResponse } from 'next/server';
import { getConnections } from '@/app/actions';
import { getInjectedSystemPrompt, getPersona } from '@/app/persona';
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
import {
  applyGeminiThinkingConfig,
  applyOpenAICompatibleReasoning,
  applyVertexThinkingConfig,
  readLLMSettings,
  stripOpenAICompatibleReasoning
} from '@/lib/llm-settings';
import {
  buildIntegrationSystemPrompt,
  collectMCPRuntimeContext,
  normalizeChatMCPServers,
  normalizeChatTools
} from '@/lib/mcp-runtime';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const TEMP_FILE_ROOT = path.join(process.cwd(), 'data', 'temp', 'file');
const MAX_INLINE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OPENAI_COMPATIBLE_IMAGE_BYTES = 8 * 1024 * 1024;

type AttachedFileInput = {
  name?: unknown;
  ext?: unknown;
};

type ChatMessage = {
  role: string;
  content?: string;
  attachedFiles?: AttachedFileInput[];
  [key: string]: unknown;
};

type OpenAICompatibleContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string | { url: string } };

type OpenAICompatibleMessage = {
  role: string;
  content: string | OpenAICompatibleContentPart[];
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

type GeminiContent = {
  role: 'model' | 'user';
  parts: GeminiPart[];
};

type GeminiUploadedFile = {
  name?: string;
  state?: string;
  error?: { message?: string };
  displayName?: string;
  uri?: string;
  mimeType?: string;
};

type GeminiFileClient = {
  files: {
    upload(input: { file: string; config: { mimeType: string; displayName: string } }): Promise<GeminiUploadedFile>;
    get(input: { name: string }): Promise<GeminiUploadedFile>;
  };
};

type AttachmentPayload =
  | {
      kind: 'text';
      name: string;
      ext: string;
      filePath: string;
      mimeType: string;
      size: number;
      text: string;
    }
  | {
      kind: 'binary';
      name: string;
      ext: string;
      filePath: string;
      mimeType: string;
      size: number;
      geminiNative: boolean;
      base64?: string;
    }
  | {
      kind: 'missing';
      name: string;
      ext: string;
      mimeType: string;
      size: number;
      error: string;
    };

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  html: 'text/html',
  css: 'text/css',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska'
};

const TEXT_EXTS = new Set([
  'txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'xml',
  'yml', 'yaml', 'log', 'env', 'ini', 'toml', 'sql', 'py', 'java', 'c', 'cpp',
  'cs', 'go', 'rs', 'php', 'rb', 'sh', 'bat', 'ps1'
]);

const OPENAI_COMPATIBLE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

const streamHeaders = (provider: string) => ({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
  'x-provider': provider
});

const sse = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

const singleSseResponse = (provider: string, data: unknown) => {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse(data)));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });
  return new Response(readableStream, { headers: streamHeaders(provider) });
};

const readTextParts = (parts: unknown) => (
  Array.isArray(parts)
    ? parts.map(part => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').join('')
    : ''
);

const getOpenAiCompatibleMessage = (data: unknown) => {
  const choices = data && typeof data === 'object' && 'choices' in data && Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === 'object' && 'message' in choices[0] ? choices[0].message : undefined;
  if (!message || typeof message !== 'object') return { content: '', reasoning_content: '' };
  return {
    content: 'content' in message && typeof message.content === 'string' ? message.content : '',
    reasoning_content: 'reasoning_content' in message && typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
  };
};

const getAnthropicMessageText = (data: unknown) => {
  const content = data && typeof data === 'object' && 'content' in data && Array.isArray(data.content) ? data.content : [];
  return content.map(part => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').join('');
};

const getVertexMessageText = (data: unknown) => {
  if (!data || typeof data !== 'object' || !('candidates' in data) || !Array.isArray(data.candidates)) return '';
  const content = data.candidates[0] && typeof data.candidates[0] === 'object' && 'content' in data.candidates[0] ? data.candidates[0].content : undefined;
  const parts = content && typeof content === 'object' && 'parts' in content ? content.parts : undefined;
  return readTextParts(parts);
};

const isReasoningParameterError = (message: string) => {
  const text = message.toLowerCase();
  return text.includes('reasoning_effort') ||
    text.includes('reasoning effort') ||
    text.includes('unsupported parameter') ||
    text.includes('unknown parameter') ||
    text.includes('unrecognized request argument');
};

const parseProviderError = (message: string): string | null => {
  try {
    const parsed = JSON.parse(message);
    const providerMessage = parsed?.error?.message || parsed?.message;
    if (typeof providerMessage === 'string' && providerMessage !== message) {
      return parseProviderError(providerMessage) || providerMessage;
    }
  } catch {
  }
  return null;
};

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return parseProviderError(error.message) || error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return parseProviderError(error) || error;
  }
  return 'Unknown API error.';
};

const normalizeExt = (file: AttachedFileInput) => {
  const fromExt = typeof file?.ext === 'string' ? file.ext.toLowerCase().replace(/^\./, '') : '';
  if (fromExt && fromExt !== 'other') return fromExt;
  const name = typeof file?.name === 'string' ? file.name : '';
  return path.extname(name).slice(1).toLowerCase() || 'other';
};

const getMimeType = (ext: string) => MIME_BY_EXT[ext] || 'application/octet-stream';

const isTextAttachment = (ext: string, mimeType: string) => {
  return TEXT_EXTS.has(ext) || mimeType.startsWith('text/');
};

const canGeminiInspectNatively = (mimeType: string) => {
  return mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/');
};

const canOpenAICompatibleInspectNatively = (mimeType: string) => {
  return OPENAI_COMPATIBLE_IMAGE_MIME_TYPES.has(mimeType);
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const resolveAttachedFilePath = (file: AttachedFileInput) => {
  const name = typeof file?.name === 'string' ? file.name : '';
  if (!name) {
    throw new Error('Attached file is missing a filename.');
  }

  const ext = normalizeExt(file);
  const root = path.normalize(TEMP_FILE_ROOT + path.sep);
  const filePath = path.normalize(path.join(TEMP_FILE_ROOT, ext, name));

  if (!filePath.toLowerCase().startsWith(root.toLowerCase())) {
    throw new Error(`Invalid attached file path: ${name}`);
  }

  return { name, ext, filePath };
};

const readAttachment = async (file: AttachedFileInput): Promise<AttachmentPayload> => {
  const { name, ext, filePath } = resolveAttachedFilePath(file);
  const mimeType = getMimeType(ext);
  const stat = await fs.stat(filePath);
  const isText = isTextAttachment(ext, mimeType);
  const geminiNative = canGeminiInspectNatively(mimeType);

  if (isText) {
    return {
      name,
      ext,
      filePath,
      mimeType,
      size: stat.size,
      kind: 'text',
      text: await fs.readFile(filePath, 'utf-8')
    };
  }

  return {
    name,
    ext,
    filePath,
    mimeType,
    size: stat.size,
    kind: 'binary',
    geminiNative,
    base64: geminiNative && stat.size <= MAX_INLINE_FILE_BYTES
      ? (await fs.readFile(filePath)).toString('base64')
      : undefined
  };
};

const getMessageAttachments = async (message: ChatMessage): Promise<AttachmentPayload[]> => {
  if (!Array.isArray(message.attachedFiles) || message.attachedFiles.length === 0) {
    return [];
  }

  const attachments: AttachmentPayload[] = [];
  for (const file of message.attachedFiles) {
    try {
      attachments.push(await readAttachment(file));
    } catch (e) {
      console.error(`Failed to read attached file: ${file?.name || 'unknown'}`, e);
      attachments.push({
        name: typeof file?.name === 'string' ? file.name : 'unknown',
        ext: typeof file?.ext === 'string' ? file.ext : 'other',
        mimeType: 'application/octet-stream',
        size: 0,
        kind: 'missing',
        error: getErrorMessage(e)
      });
    }
  }
  return attachments;
};

const appendTextOnlyAttachments = async (message: ChatMessage, providerName: string) => {
  const attachments = await getMessageAttachments(message);
  if (attachments.length === 0) return message.content;

  let content = message.content || '';
  const unreadableFiles = [];

  for (const attachment of attachments) {
    if (attachment.kind === 'text') {
      content += `\n\n--- Attached Text File (${attachment.name}) ---\n${attachment.text}\n--- End of attached file ---\n`;
    } else if (attachment.kind === 'missing') {
      content += `\n\n[Attachment notice: ${attachment.name} could not be read: ${attachment.error}.]\n`;
    } else {
      unreadableFiles.push(`${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)})`);
    }
  }

  if (unreadableFiles.length > 0) {
    content += `\n\n[Attachment notice: The user attached ${unreadableFiles.join(', ')}. This ${providerName} connection is being used through a text-only chat format in DeepChat, so the binary file contents were not sent to the model. Ask the user to switch to Gemini/VertexAI for native image, PDF, audio, or video understanding, or to paste/extract the file contents.]`;
  }

  return content;
};

const buildTextOnlyMessages = async (messages: ChatMessage[], providerName: string) => {
  const prepared: ChatMessage[] = [];
  for (const message of messages) {
    prepared.push({
      ...message,
      content: await appendTextOnlyAttachments(message, providerName)
    });
  }
  return prepared;
};

const isMistralChatCompletionsTarget = (conn: LlmConnection, cleanBase: string, provider: string) => {
  const text = `${conn.provider || ''} ${conn.baseUrl || ''} ${cleanBase || ''} ${provider || ''}`.toLowerCase();
  return text.includes('mistral');
};

const getOpenAICompatibleImageUrl = (dataUrl: string, mistralTarget: boolean) => {
  return mistralTarget ? dataUrl : { url: dataUrl };
};

const buildOpenAICompatibleMessages = async (messages: ChatMessage[], providerName: string, mistralTarget: boolean): Promise<OpenAICompatibleMessage[]> => {
  const prepared: OpenAICompatibleMessage[] = [];

  for (const message of messages) {
    const attachments = await getMessageAttachments(message);
    if (attachments.length === 0) {
      prepared.push({ role: message.role, content: message.content || '' });
      continue;
    }

    const parts: OpenAICompatibleContentPart[] = [];
    const textParts: string[] = [];
    if (message.content) textParts.push(message.content);

    const unsupportedFiles: string[] = [];

    for (const attachment of attachments) {
      if (attachment.kind === 'text') {
        textParts.push(`--- Attached Text File (${attachment.name}) ---\n${attachment.text}\n--- End of attached file ---`);
        continue;
      }

      if (attachment.kind === 'missing') {
        textParts.push(`[Attachment notice: ${attachment.name} could not be read: ${attachment.error}.]`);
        continue;
      }

      if (!canOpenAICompatibleInspectNatively(attachment.mimeType)) {
        unsupportedFiles.push(`${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)})`);
        continue;
      }

      if (attachment.size > MAX_OPENAI_COMPATIBLE_IMAGE_BYTES) {
        textParts.push(`[Attachment notice: ${attachment.name} is ${formatBytes(attachment.size)} and is too large to send inline to this ${providerName} chat-completions connection.]`);
        continue;
      }

      const base64 = await fs.readFile(attachment.filePath);
      const dataUrl = `data:${attachment.mimeType};base64,${base64.toString('base64')}`;
      parts.push({
        type: 'image_url',
        image_url: getOpenAICompatibleImageUrl(dataUrl, mistralTarget)
      });
    }

    if (unsupportedFiles.length > 0) {
      textParts.push(`[Attachment notice: The user attached ${unsupportedFiles.join(', ')}. This ${providerName} chat-completions connection can only receive text and supported image attachments from DeepChat.]`);
    }

    const text = textParts.join('\n\n');
    if (text || parts.length === 0) {
      parts.unshift({ type: 'text', text });
    }

    prepared.push({
      role: message.role,
      content: parts.length > 0 ? parts : text
    });
  }

  return prepared;
};

const waitForGeminiFile = async (ai: GeminiFileClient, uploadedFile: GeminiUploadedFile) => {
  if (!uploadedFile?.name || !uploadedFile.state || uploadedFile.state === 'ACTIVE') {
    return uploadedFile;
  }

  let currentFile = uploadedFile;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (currentFile.state === 'ACTIVE') return currentFile;
    if (currentFile.state === 'FAILED') {
      throw new Error(currentFile.error?.message || `Gemini failed to process ${currentFile.displayName || currentFile.name}.`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    currentFile = await ai.files.get({ name: uploadedFile.name });
  }

  throw new Error(`Gemini is still processing ${uploadedFile.displayName || uploadedFile.name}. Please try again in a moment.`);
};

const buildGeminiContents = async (messages: ChatMessage[], ai?: GeminiFileClient): Promise<GeminiContent[]> => {
  const contents: GeminiContent[] = [];

  for (const message of messages.filter(m => m.role !== 'system')) {
    const parts: GeminiPart[] = [];
    if (message.content) {
      parts.push({ text: message.content });
    }

    const attachments = await getMessageAttachments(message);
    for (const attachment of attachments) {
      if (attachment.kind === 'text') {
        parts.push({
          text: `\n\n--- Attached Text File (${attachment.name}) ---\n${attachment.text}\n--- End of attached file ---\n`
        });
        continue;
      }

      if (attachment.kind === 'missing') {
        parts.push({ text: `\n\n[Attachment notice: ${attachment.name} could not be read: ${attachment.error}.]` });
        continue;
      }

      if (!attachment.geminiNative) {
        parts.push({ text: `\n\n[Attachment notice: ${attachment.name} has MIME type ${attachment.mimeType}, which DeepChat cannot send as native Gemini media.]` });
        continue;
      }

      parts.push({ text: `\n\nAttached file: ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)}). Please inspect it directly when answering.` });

      if (attachment.base64) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.base64
          }
        });
      } else if (ai) {
        const uploadedFile = await ai.files.upload({
          file: attachment.filePath,
          config: {
            mimeType: attachment.mimeType,
            displayName: attachment.name
          }
        });
        const readyFile = await waitForGeminiFile(ai, uploadedFile);
        if (!readyFile?.uri) {
          throw new Error(`Gemini did not return a file URI for ${attachment.name}.`);
        }
        parts.push({
          fileData: {
            mimeType: readyFile.mimeType || attachment.mimeType,
            fileUri: readyFile.uri
          }
        });
      } else {
        parts.push({ text: `[Attachment notice: ${attachment.name} is too large for inline upload (${formatBytes(attachment.size)}). VertexAI requires a smaller inline file or a Google Cloud Storage URI.]` });
      }
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: parts.length > 0 ? parts : [{ text: '' }]
    });
  }

  return contents;
};

const isChatMessageLike = (message: unknown): message is { role?: string; content?: string } => {
  return Boolean(message && typeof message === 'object' && 'role' in message);
};

export async function POST(req: Request) {
  try {
    const { messages, modelId, connectionId, mcpServers, tools } = await req.json() as {
      messages?: ChatMessage[];
      modelId?: string;
      connectionId?: string;
      mcpServers?: unknown;
      tools?: unknown;
    };

    if (!Array.isArray(messages) || (!modelId && !connectionId)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const persona = await getPersona();
    const latestUserMessage = [...messages].reverse().find((m: unknown) => isChatMessageLike(m) && m.role === 'user')?.content || '';
    const runtimeMCPServers = normalizeChatMCPServers(mcpServers);
    const runtimeTools = normalizeChatTools(tools);
    const mcpRuntimeContext = await collectMCPRuntimeContext(runtimeMCPServers, latestUserMessage);
    const integrationPrompt = buildIntegrationSystemPrompt(runtimeMCPServers, runtimeTools, mcpRuntimeContext);
    const systemIndex = messages.findIndex((m: unknown) => isChatMessageLike(m) && m.role === 'system');
    if (systemIndex !== -1) {
      const baseSystemPrompt = [persona.memoryReferenceHistory === false ? '' : messages[systemIndex].content, integrationPrompt].filter(Boolean).join('\n\n');
      messages[systemIndex].content = await getInjectedSystemPrompt(baseSystemPrompt, latestUserMessage);
    } else {
      const injected = await getInjectedSystemPrompt(integrationPrompt, latestUserMessage);
      if (injected) {
        messages.unshift({ role: 'system', content: injected });
      }
    }

    const connections = await getConnections() as LlmConnection[];
    const conn = selectLlmConnection(connections, connectionId, modelId);

    if (!conn) {
      return NextResponse.json({ error: 'No API connection found. Please configure in Settings.' }, { status: 400 });
    }

    const p = normalizeProvider(conn.provider);
    const llmSettings = await readLLMSettings();
    const isStream = llmSettings.streamingResponse;
    const cleanBase = getCleanBaseUrl(p, conn.baseUrl);

    let url = '';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    let body: Record<string, unknown> = {};

    if (p === 'anthropic') {
      const textMessages = await buildTextOnlyMessages(messages, conn.provider);
      url = getAnthropicMessagesUrl(cleanBase);
      headers['x-api-key'] = conn.apiKey;
      headers['anthropic-version'] = '2023-06-01';

      const systemMessage = textMessages.find(m => m.role === 'system')?.content;
      const anthropicMessages = textMessages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.content
      }));

      body = {
        model: modelId || conn.model,
        max_tokens: 4096,
        messages: anthropicMessages,
        stream: isStream
      };
      if (systemMessage) body.system = systemMessage;
    } else if (p === 'gemini') {
      const { GoogleGenAI } = await import('@google/genai');
      const aiOptions: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey: conn.apiKey };
      if (cleanBase) {
        aiOptions.httpOptions = { baseUrl: cleanBase };
      }
      const ai = new GoogleGenAI(aiOptions);

      const chosenModel = modelId || conn.model;
      const mPath = getGeminiModelPath(chosenModel);
      const geminiMessages = await buildGeminiContents(messages, ai);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const baseConfig: { systemInstruction?: string } = {};
      if (systemMessage) {
        baseConfig.systemInstruction = systemMessage;
      }
      const config = applyGeminiThinkingConfig(baseConfig, chosenModel, llmSettings);

      if (isStream) {
        const responseStream = await ai.models.generateContentStream({
          model: mPath,
          contents: geminiMessages,
          config
        });

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            let accumulatedText = '';
            try {
              for await (const chunk of responseStream) {
                const text = extractGeminiText(chunk);
                accumulatedText += text;
                controller.enqueue(encoder.encode(sse({
                  text,
                  candidates: chunk.candidates,
                  promptFeedback: chunk.promptFeedback,
                  modelVersion: chunk.modelVersion
                })));
              }
              if (!accumulatedText) {
                controller.enqueue(encoder.encode(sse({
                  error: 'Gemini returned an empty response. The model may be unavailable, blocked by safety settings, or not compatible with text chat.'
                })));
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (e: unknown) {
              controller.enqueue(encoder.encode(sse({ error: `Gemini API Error: ${getErrorMessage(e)}` })));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }
        });

        return new Response(readableStream, {
          headers: streamHeaders(p)
        });
      } else {
        const response = await ai.models.generateContent({
          model: mPath,
          contents: geminiMessages,
          config
        });
        return singleSseResponse(p, {
          text: response.text || '',
          candidates: [{ content: { parts: [{ text: response.text }] } }]
        });
      }
    } else if (p === 'vertexai') {
      const endpoint = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
      const chosenModel = modelId || conn.model;
      url = getVertexGenerateContentUrl(conn.projectId, conn.location, chosenModel, endpoint);
      headers['Authorization'] = `Bearer ${conn.apiKey}`;

      const geminiMessages = await buildGeminiContents(messages);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      body = { contents: geminiMessages };
      if (systemMessage) {
        body.systemInstruction = { parts: [{ text: systemMessage }] };
      }
      body = applyVertexThinkingConfig(body, chosenModel, llmSettings);
    } else {
      url = getChatCompletionsUrl(p, cleanBase);
      const openAICompatibleMessages = await buildOpenAICompatibleMessages(messages, conn.provider, isMistralChatCompletionsTarget(conn, cleanBase, p));
      headers['Authorization'] = `Bearer ${conn.apiKey}`;
      body = applyOpenAICompatibleReasoning({
        model: modelId || conn.model,
        messages: openAICompatibleMessages,
        stream: isStream
      }, llmSettings);
    }

    let res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      if (body.reasoning_effort && isReasoningParameterError(errText)) {
        body = stripOpenAICompatibleReasoning(body);
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
        if (res.ok) {
          if (!isStream) {
            const data = await res.json();
            const message = getOpenAiCompatibleMessage(data);
            return singleSseResponse(p, {
              choices: [{
                delta: {
                  content: message.content,
                  reasoning_content: message.reasoning_content
                }
              }]
            });
          }
          return new Response(res.body, {
            headers: streamHeaders(p)
          });
        }
        const retryText = await res.text();
        return NextResponse.json({ error: `API Error: ${res.status} ${retryText}` }, { status: res.status });
      }
      return NextResponse.json({ error: `API Error: ${res.status} ${errText}` }, { status: res.status });
    }

    if (!isStream) {
      const data = await res.json();
      if (p === 'anthropic') {
        return singleSseResponse(p, {
          type: 'content_block_delta',
          delta: { text: getAnthropicMessageText(data) }
        });
      }
      if (p === 'vertexai') {
        return singleSseResponse(p, {
          text: getVertexMessageText(data),
          candidates: data?.candidates
        });
      }
      const message = getOpenAiCompatibleMessage(data);
      return singleSseResponse(p, {
        choices: [{
          delta: {
            content: message.content,
            reasoning_content: message.reasoning_content
          }
        }]
      });
    }

    return new Response(res.body, {
      headers: streamHeaders(p)
    });

  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
