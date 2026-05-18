import { NextResponse } from 'next/server';
import { getConnections } from '@/app/actions';
import { getInjectedSystemPrompt, getPersona } from '@/app/persona';
import {
  extractGeminiText,
  getAnthropicMessagesUrl,
  getChatCompletionsUrl,
  getCleanBaseUrl,
  getGeminiModelPath,
  getVertexModelPath,
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
import { logAiExchange, streamWithAiLog } from '@/lib/ai-logs';
import {
  buildIntegrationSystemPrompt,
  collectMCPRuntimeContextWithUsage,
  collectToolRuntimeContextWithSources,
  getMCPRuntimeCandidateServers,
  normalizeChatMCPServers,
  normalizeChatTools,
  type SearchSource,
  type MCPRuntimeUsageItem
} from '@/lib/mcp-runtime';
import { buildClarificationInstruction, parseAgentClarification } from '@/lib/agent-clarification';
import { isGeminiImageModel, isImagenModel, isOpenAIImageModel } from '@/lib/image-generation';
import { saveGeneratedImage } from '@/lib/generated-images';
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

const prependSseEvents = (body: ReadableStream<Uint8Array> | null, events: unknown[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for (const event of events) {
          controller.enqueue(encoder.encode(sse(event)));
        }
        if (!body) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(sse({ error: getErrorMessage(error) })));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }
  });
};

const getMCPStreamEvents = (usage: MCPRuntimeUsageItem[]) => {
  if (usage.length === 0) return [];
  return usage.map(item => ({
    type: 'deepchat_mcp',
    id: item.id,
    name: item.name,
    status: item.status,
    details: item.details
  }));
};

type GeneratedImageOutput = {
  mimeType: string;
  base64?: string;
  url?: string;
  prompt?: string;
};

const getSearchSourceEvents = (sources: SearchSource[]) => {
  if (sources.length === 0) return [];
  return [{
    type: 'deepchat_sources',
    sources
  }];
};

const getMCPWorkingEvents = (servers: { serverId: string; name: string }[]) => {
  return servers.map(server => ({
    type: 'deepchat_mcp',
    id: server.serverId,
    name: server.name,
    status: 'running',
    details: 'Working...'
  }));
};

const singleSseResponse = (provider: string, data: unknown, events: unknown[] = []) => {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(sse(event)));
      }
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

const getImageGenerationPrompt = (messages: ChatMessage[]) => {
  const latest = [...messages].reverse().find((m: unknown) => isChatMessageLike(m) && m.role === 'user');
  const latestText = getRuntimeMessageText(latest);
  if (latestText.trim()) return latestText.trim();
  return messages
    .filter(message => message.role === 'user' && typeof message.content === 'string')
    .map(message => message.content)
    .filter(Boolean)
    .join('\n\n')
    .trim();
};

const imageOutputToMarkdown = (images: GeneratedImageOutput[], text = '') => [
  text.trim(),
  ...images.map((image, index) => {
    const src = image.base64 ? `data:${image.mimeType};base64,${image.base64}` : image.url || '';
    return src ? `![image_${index + 1}](${src})` : '';
  })
].filter(Boolean).join('\n\n');

const materializeGeneratedImages = async (images: GeneratedImageOutput[]) => {
  const materialized: GeneratedImageOutput[] = [];
  for (const image of images) {
    if (!image.base64) {
      materialized.push(image);
      continue;
    }
    materialized.push({
      ...image,
      base64: undefined,
      url: await saveGeneratedImage(image.base64, image.mimeType)
    });
  }
  return materialized;
};

const getGeminiGeneratedImages = (data: unknown): GeneratedImageOutput[] => {
  if (!data || typeof data !== 'object' || !('candidates' in data) || !Array.isArray(data.candidates)) return [];
  return data.candidates.flatMap((candidate: unknown): GeneratedImageOutput[] => {
    if (!candidate || typeof candidate !== 'object' || !('content' in candidate)) return [];
    const content = candidate.content;
    if (!content || typeof content !== 'object' || !('parts' in content) || !Array.isArray(content.parts)) return [];
    return content.parts.reduce<GeneratedImageOutput[]>((images, part: unknown) => {
      if (!part || typeof part !== 'object' || !('inlineData' in part)) return images;
      const inlineData = part.inlineData;
      if (!inlineData || typeof inlineData !== 'object') return images;
      const data = 'data' in inlineData && typeof inlineData.data === 'string' ? inlineData.data : '';
      const mimeType = 'mimeType' in inlineData && typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png';
      if (!data || !mimeType.startsWith('image/')) return images;
      images.push({ mimeType, base64: data });
      return images;
    }, []);
  });
};

const getImagenGeneratedImages = (data: unknown): GeneratedImageOutput[] => {
  if (!data || typeof data !== 'object' || !('generatedImages' in data) || !Array.isArray(data.generatedImages)) return [];
  return data.generatedImages.reduce<GeneratedImageOutput[]>((images, item: unknown) => {
    if (!item || typeof item !== 'object' || !('image' in item)) return images;
    const image = item.image;
    if (!image || typeof image !== 'object') return images;
    const base64 = 'imageBytes' in image && typeof image.imageBytes === 'string' ? image.imageBytes : '';
    const mimeType = 'mimeType' in image && typeof image.mimeType === 'string' ? image.mimeType : 'image/png';
    if (!base64) return images;
    images.push({ mimeType, base64 });
    return images;
  }, []);
};

const getOpenAIImagesUrl = (cleanBaseUrl: string) => (
  cleanBaseUrl ? `${cleanBaseUrl}/v1/images/generations` : 'https://api.openai.com/v1/images/generations'
);

const getOpenAIImageRequestBody = (model: string, prompt: string) => {
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: '1024x1024'
  };
  if (!/\bgpt-image\b/i.test(model)) {
    body.response_format = 'b64_json';
  }
  return body;
};

const getOpenAIGeneratedImages = (data: unknown): GeneratedImageOutput[] => {
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data)) return [];
  return data.data.map((item): GeneratedImageOutput | null => {
    if (!item || typeof item !== 'object') return null;
    const base64 = 'b64_json' in item && typeof item.b64_json === 'string' ? item.b64_json : '';
    const url = 'url' in item && typeof item.url === 'string' ? item.url : '';
    const prompt = 'revised_prompt' in item && typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined;
    if (!base64 && !url) return null;
    return { mimeType: 'image/png', base64, url, prompt };
  }).filter((item): item is GeneratedImageOutput => Boolean(item));
};

const getVertexImagenImages = (data: unknown): GeneratedImageOutput[] => {
  if (!data || typeof data !== 'object' || !('predictions' in data) || !Array.isArray(data.predictions)) return [];
  return data.predictions.map((item): GeneratedImageOutput | null => {
    if (!item || typeof item !== 'object') return null;
    const base64 = 'bytesBase64Encoded' in item && typeof item.bytesBase64Encoded === 'string' ? item.bytesBase64Encoded : '';
    const mimeType = 'mimeType' in item && typeof item.mimeType === 'string' ? item.mimeType : 'image/png';
    if (!base64) return null;
    return { mimeType, base64 };
  }).filter((item): item is GeneratedImageOutput => Boolean(item));
};

const inlineRemoteGeneratedImages = async (images: GeneratedImageOutput[]) => {
  const inlined: GeneratedImageOutput[] = [];
  for (const image of images) {
    if (image.base64 || !image.url) {
      inlined.push(image);
      continue;
    }
    try {
      const response = await fetch(image.url);
      if (!response.ok) {
        inlined.push(image);
        continue;
      }
      const mimeType = response.headers.get('content-type')?.split(';')[0] || image.mimeType || 'image/png';
      if (!mimeType.startsWith('image/')) {
        inlined.push(image);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer()).toString('base64');
      inlined.push({ ...image, mimeType, base64: bytes, url: undefined });
    } catch {
      inlined.push(image);
    }
  }
  return inlined;
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

const isChatMessageLike = (message: unknown): message is { role?: string; content?: string; runtimePromptContent?: string } => {
  return Boolean(message && typeof message === 'object' && 'role' in message);
};

const getMessageText = (message: { content?: string } | undefined) => typeof message?.content === 'string' ? message.content : '';
const getRuntimeMessageText = (message: { content?: string; runtimePromptContent?: string } | undefined) => typeof message?.runtimePromptContent === 'string' && message.runtimePromptContent.trim() ? message.runtimePromptContent : getMessageText(message);

const getRouteResponseError = async (response: Response) => {
  try {
    const data = await response.clone().json();
    if (data?.error) return String(data.error);
  } catch {
    try {
      const text = await response.text();
      if (text) return text;
    } catch {
    }
  }
  return `Request failed with status ${response.status}`;
};

const withSystemInstruction = (messages: ChatMessage[], instruction: string): ChatMessage[] => {
  const nextMessages = messages.map(message => ({ ...message }));
  const systemIndex = nextMessages.findIndex(message => message.role === 'system');
  if (systemIndex !== -1) {
    nextMessages[systemIndex] = {
      ...nextMessages[systemIndex],
      content: [nextMessages[systemIndex].content, instruction].filter(Boolean).join('\n\n')
    };
    return nextMessages;
  }
  return [{ role: 'system', content: instruction }, ...nextMessages];
};

const buildPlatformCapabilityPrompt = () => [
  'DeepChat platform capabilities:',
  '- Search can gather fresh web facts and source-aware context when enabled by the router or user.',
  '- Code Execution can run isolated Python for data analysis, calculations, forecasts, charts, downloadable Excel workbooks, spreadsheet previews, and generated artifacts.',
  '- If runtime context or tool orchestration is active, do not say the platform cannot create downloadable Excel files, charts, or artifacts.',
  '- Do not ask the user which internal tool to use. Continue naturally and let DeepChat route tools.',
  '- If a task needs an artifact and the relevant runtime tool is active, speak as if the platform will produce it, not as if the user must manually build it.'
].join('\n');

const pipeSseResponse = async (controller: ReadableStreamDefaultController<Uint8Array>, response: Response) => {
  const encoder = new TextEncoder();
  if (!response.ok || !response.body) {
    controller.enqueue(encoder.encode(sse({ error: await getRouteResponseError(response) })));
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    controller.enqueue(value);
  }
};

const createAgenticMCPResponse = (requestUrl: string, provider: string, payload: Record<string, unknown>, originalMessages: ChatMessage[], mcpServers: ReturnType<typeof normalizeChatMCPServers>, tools: ReturnType<typeof normalizeChatTools>, latestUserMessage: string) => {
  const encoder = new TextEncoder();
  const candidateServers = getMCPRuntimeCandidateServers(mcpServers, latestUserMessage);
  const preludeMessages = withSystemInstruction(originalMessages, [
    'Before using any MCP context, give a short natural first response to the user.',
    'State your initial approach or what you are about to verify.',
    'Keep it concise and do not provide the full final answer yet.',
    'Do not ask what tool to use, do not ask for confirmation, and do not say the platform cannot perform a runtime action when tools are available.',
    buildClarificationInstruction()
  ].join('\n'));
  const callDirect = (phaseMessages: ChatMessage[]) => fetch(requestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      messages: phaseMessages,
      mcpServers: [],
      tools: [],
      skipAgentLoop: true,
      skipRuntimeIntegrations: true
    })
  });
  const getStreamText = async (response: Response) => {
    if (!response.ok || !response.body) throw new Error(await getRouteResponseError(response));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        const data = line.replace(/^data:\s*/, '').trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (!parsed || typeof parsed !== 'object') continue;
          const json = parsed as Record<string, unknown>;
          if (json.error) throw new Error(typeof json.error === 'string' ? json.error : 'Provider returned an error.');
          if (provider === 'anthropic') {
            const delta = json.delta && typeof json.delta === 'object' ? json.delta as Record<string, unknown> : null;
            if (json.type === 'content_block_delta' && typeof delta?.text === 'string') text += delta.text;
          } else if (provider === 'gemini' || provider === 'vertexai') {
            text += getVertexMessageText(json) || (typeof json.text === 'string' ? json.text : '');
          } else {
            const choices = Array.isArray(json.choices) ? json.choices : [];
            const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : null;
            const delta = choice?.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : null;
            if (typeof delta?.content === 'string') text += delta.content;
          }
        } catch (error) {
          throw new Error(getErrorMessage(error));
        }
      }
    }
    return text;
  };
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        const preludeText = await getStreamText(await callDirect(preludeMessages));
        const clarificationResult = parseAgentClarification(preludeText);
        if (clarificationResult.visibleContent) {
          controller.enqueue(encoder.encode(sse({
            type: 'deepchat_content',
            text: clarificationResult.visibleContent
          })));
        }
        if (clarificationResult.clarification) {
          controller.enqueue(encoder.encode(sse({
            type: 'deepchat_clarification',
            clarification: clarificationResult.clarification
          })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        for (const event of getMCPWorkingEvents(candidateServers)) {
          controller.enqueue(encoder.encode(sse(event)));
        }
        const mcpRuntimeResult = await collectMCPRuntimeContextWithUsage(candidateServers, latestUserMessage);
        const toolRuntimeResult = await collectToolRuntimeContextWithSources(tools, latestUserMessage);
        const runtimeContext = [mcpRuntimeResult.context, toolRuntimeResult.context].filter(Boolean).join('\n\n');
        const finalMessages = withSystemInstruction(originalMessages, [
          'Continue after MCP usage.',
          'Use the MCP runtime context below as the authoritative external context for the final answer.',
          'Do not claim unavailable tool actions. If the MCP context is capability-only, use it to decide approach and say what must be verified.',
          runtimeContext
        ].filter(Boolean).join('\n\n'));
        for (const event of getMCPStreamEvents(mcpRuntimeResult.usage)) {
          controller.enqueue(encoder.encode(sse(event)));
        }
        for (const event of getSearchSourceEvents(toolRuntimeResult.sources)) {
          controller.enqueue(encoder.encode(sse(event)));
        }
        await pipeSseResponse(controller, await callDirect(finalMessages));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(sse({ error: getErrorMessage(error) })));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }
  }), { headers: streamHeaders(provider) });
};

export async function POST(req: Request) {
  try {
    const { messages, modelId, connectionId, mcpServers, tools, skipAgentLoop, skipRuntimeIntegrations } = await req.json() as {
      messages?: ChatMessage[];
      modelId?: string;
      connectionId?: string;
      mcpServers?: unknown;
      tools?: unknown;
      skipAgentLoop?: boolean;
      skipRuntimeIntegrations?: boolean;
    };

    if (!Array.isArray(messages) || (!modelId && !connectionId)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
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
    const selectedModel = modelId || conn.model;
    const persona = await getPersona();
    const latestUserMessage = getRuntimeMessageText([...messages].reverse().find((m: unknown) => isChatMessageLike(m) && m.role === 'user'));
    const runtimeMCPServers = skipRuntimeIntegrations ? [] : normalizeChatMCPServers(mcpServers);
    const runtimeTools = skipRuntimeIntegrations ? [] : normalizeChatTools(tools);

    if (!skipAgentLoop && runtimeMCPServers.length > 0 && getMCPRuntimeCandidateServers(runtimeMCPServers, latestUserMessage).length > 0) {
      return createAgenticMCPResponse(req.url, p, { modelId, connectionId }, messages, runtimeMCPServers, runtimeTools, latestUserMessage);
    }

    const mcpRuntimeResult = skipRuntimeIntegrations ? { context: '', usage: [] } : await collectMCPRuntimeContextWithUsage(runtimeMCPServers, latestUserMessage);
    const mcpRuntimeContext = mcpRuntimeResult.context;
    const toolRuntimeResult = skipRuntimeIntegrations ? { context: '', sources: [] as SearchSource[] } : await collectToolRuntimeContextWithSources(runtimeTools, latestUserMessage);
    const runtimeContext = [mcpRuntimeContext, toolRuntimeResult.context].filter(Boolean).join('\n\n');
    const integrationEvents = [...getMCPStreamEvents(mcpRuntimeResult.usage), ...getSearchSourceEvents(toolRuntimeResult.sources)];
    const usedMCPIds = new Set(mcpRuntimeResult.usage.map(item => item.id));
    const promptMCPServers = runtimeMCPServers.filter(server => usedMCPIds.has(server.serverId));

    const integrationPrompt = [buildPlatformCapabilityPrompt(), buildIntegrationSystemPrompt(promptMCPServers, runtimeTools, runtimeContext)].filter(Boolean).join('\n\n');
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

    const aiLogPayload = {
      route: 'chat',
      provider: conn.provider,
      model: selectedModel,
      input: latestUserMessage
    };

    if (p === 'gemini' && (isImagenModel(selectedModel) || isGeminiImageModel(selectedModel))) {
      const { GoogleGenAI } = await import('@google/genai');
      const aiOptions: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey: conn.apiKey };
      if (cleanBase) {
        aiOptions.httpOptions = { baseUrl: cleanBase };
      }
      const ai = new GoogleGenAI(aiOptions);
      const mPath = getGeminiModelPath(selectedModel);
      const prompt = getImageGenerationPrompt(messages);
      let images: GeneratedImageOutput[] = [];
      let text = '';

      if (isImagenModel(selectedModel)) {
        const response = await ai.models.generateImages({
          model: mPath,
          prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '1:1',
            includeRaiReason: true,
            enhancePrompt: true
          }
        });
        images = getImagenGeneratedImages(response);
      } else {
        const geminiMessages = await buildGeminiContents(messages, ai);
        const systemMessage = messages.find(m => m.role === 'system')?.content;
        const response = await ai.models.generateContent({
          model: mPath,
          contents: geminiMessages,
          config: {
            ...(systemMessage ? { systemInstruction: systemMessage } : {}),
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: '1:1'
            }
          }
        });
        text = response.text || '';
        images = getGeminiGeneratedImages(response);
      }

      if (images.length === 0) {
        throw new Error('Image generation did not return an image. The model may have blocked the request or returned an unsupported response.');
      }

      const output = imageOutputToMarkdown(await materializeGeneratedImages(images), text);
      logAiExchange({ ...aiLogPayload, output });
      return singleSseResponse(p, { text: output, candidates: [{ content: { parts: [{ text: output }] } }] }, integrationEvents);
    }

    if (p === 'vertexai' && (isImagenModel(selectedModel) || isGeminiImageModel(selectedModel))) {
      const prompt = getImageGenerationPrompt(messages);
      let images: GeneratedImageOutput[] = [];
      let text = '';

      if (isImagenModel(selectedModel)) {
        const res = await fetch(`https://${conn.location}-aiplatform.googleapis.com/v1/projects/${conn.projectId}/locations/${conn.location}/${getVertexModelPath(selectedModel)}:predict`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${conn.apiKey}`
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '1:1',
              includeRaiReason: true,
              outputOptions: {
                mimeType: 'image/png'
              }
            }
          })
        });
        if (!res.ok) throw new Error(await getRouteResponseError(res));
        images = getVertexImagenImages(await res.json());
      } else {
        const geminiMessages = await buildGeminiContents(messages);
        const systemMessage = messages.find(m => m.role === 'system')?.content;
        const res = await fetch(getVertexGenerateContentUrl(conn.projectId, conn.location, selectedModel, 'generateContent'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${conn.apiKey}`
          },
          body: JSON.stringify({
            contents: geminiMessages,
            ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage }] } } : {}),
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: {
                aspectRatio: '1:1'
              }
            }
          })
        });
        if (!res.ok) throw new Error(await getRouteResponseError(res));
        const data = await res.json();
        text = getVertexMessageText(data);
        images = getGeminiGeneratedImages(data);
      }

      if (images.length === 0) {
        throw new Error('Image generation did not return an image. The model may have blocked the request or returned an unsupported response.');
      }

      const output = imageOutputToMarkdown(await materializeGeneratedImages(images), text);
      logAiExchange({ ...aiLogPayload, output });
      return singleSseResponse(p, { text: output, candidates: [{ content: { parts: [{ text: output }] } }] }, integrationEvents);
    }

    if (isOpenAIImageModel(selectedModel) && p !== 'gemini' && p !== 'vertexai' && p !== 'anthropic') {
      const prompt = getImageGenerationPrompt(messages);
      let body = getOpenAIImageRequestBody(selectedModel, prompt);
      let res = await fetch(getOpenAIImagesUrl(cleanBase), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${conn.apiKey}`
        },
        body: JSON.stringify(body)
      });
      if (!res.ok && body.response_format) {
        const firstError = await res.text();
        if (/response_format|unsupported|unknown|unrecognized/i.test(firstError)) {
          body = { ...body };
          delete body.response_format;
          res = await fetch(getOpenAIImagesUrl(cleanBase), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              Authorization: `Bearer ${conn.apiKey}`
            },
            body: JSON.stringify(body)
          });
        } else {
          throw new Error(`API Error: ${res.status} ${firstError}`);
        }
      }
      if (!res.ok) throw new Error(await getRouteResponseError(res));
      const data = await res.json();
      const images = await inlineRemoteGeneratedImages(getOpenAIGeneratedImages(data));
      if (images.length === 0) {
        throw new Error('Image generation did not return an image. The model may have blocked the request or returned an unsupported response.');
      }
      const output = imageOutputToMarkdown(await materializeGeneratedImages(images));
      logAiExchange({ ...aiLogPayload, output });
      return singleSseResponse(p, { choices: [{ delta: { content: output } }] }, integrationEvents);
    }

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
        model: selectedModel,
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

      const chosenModel = selectedModel;
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
              for (const event of integrationEvents) {
                controller.enqueue(encoder.encode(sse(event)));
              }
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
              logAiExchange({ ...aiLogPayload, output: accumulatedText });
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
        logAiExchange({ ...aiLogPayload, output: response.text || '' });
        return singleSseResponse(p, {
          text: response.text || '',
          candidates: [{ content: { parts: [{ text: response.text }] } }]
        }, integrationEvents);
      }
    } else if (p === 'vertexai') {
      const endpoint = isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
      const chosenModel = selectedModel;
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
            logAiExchange({ ...aiLogPayload, output: [message.reasoning_content, message.content].filter(Boolean).join('\n') });
            return singleSseResponse(p, {
              choices: [{
                delta: {
                  content: message.content,
                  reasoning_content: message.reasoning_content
                }
              }]
            }, integrationEvents);
          }
          return new Response(prependSseEvents(streamWithAiLog(res.body, aiLogPayload), integrationEvents), {
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
        const output = getAnthropicMessageText(data);
        logAiExchange({ ...aiLogPayload, output });
        return singleSseResponse(p, {
          type: 'content_block_delta',
          delta: { text: output }
        }, integrationEvents);
      }
      if (p === 'vertexai') {
        const output = getVertexMessageText(data);
        logAiExchange({ ...aiLogPayload, output });
        return singleSseResponse(p, {
          text: output,
          candidates: data?.candidates
        }, integrationEvents);
      }
      const message = getOpenAiCompatibleMessage(data);
      logAiExchange({ ...aiLogPayload, output: [message.reasoning_content, message.content].filter(Boolean).join('\n') });
      return singleSseResponse(p, {
        choices: [{
          delta: {
            content: message.content,
            reasoning_content: message.reasoning_content
          }
        }]
      }, integrationEvents);
    }

    return new Response(prependSseEvents(streamWithAiLog(res.body, aiLogPayload), integrationEvents), {
      headers: streamHeaders(p)
    });

  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
