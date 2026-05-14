type AiLogPayload = {
  route: string;
  provider: string;
  model: string;
  input: string;
  output?: string;
};

const MAX_LOG_TEXT = 1600;

const cleanLogText = (value: string) => (
  value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LOG_TEXT)
);

export const isAiLogEnabled = () => process.env.DEEPCHAT_AI_LOG === '1';

export const logAiExchange = (payload: AiLogPayload) => {
  if (!isAiLogEnabled()) return;
  const parts = [
    `[AI] route=${payload.route}`,
    `provider=${payload.provider}`,
    `model=${payload.model}`,
    `input="${cleanLogText(payload.input)}"`
  ];
  if (payload.output !== undefined) {
    parts.push(`output="${cleanLogText(payload.output)}"`);
  }
  console.info(parts.join(' '));
};

export const extractSseText = (raw: string) => {
  const chunks: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const text = parsed.text
        || parsed.delta?.text
        || parsed.choices?.[0]?.delta?.content
        || parsed.choices?.[0]?.delta?.reasoning_content
        || parsed.candidates?.[0]?.content?.parts?.[0]?.text
        || '';
      if (typeof text === 'string' && text) chunks.push(text);
    } catch {
    }
  }
  return chunks.join('');
};

export const streamWithAiLog = (body: ReadableStream<Uint8Array> | null, payload: AiLogPayload) => {
  if (!body || !isAiLogEnabled()) return body;
  const decoder = new TextDecoder();
  let raw = '';
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      raw += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);
    },
    flush() {
      raw += decoder.decode();
      logAiExchange({ ...payload, output: extractSseText(raw) });
    }
  }));
};
