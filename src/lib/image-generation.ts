export type GenerationMode = 'image';

const IMAGE_MODEL_PATTERNS = [
  /\bgpt-image\b/i,
  /\bdall-e\b/i,
  /\bimagen\b/i,
  /\bgemini\b[\w.-]*image/i,
  /\bimage\b[\w.-]*(preview|generate|generation)/i
];

export const IMAGE_GENERATION_STATUS_TEXTS = [
  'Composing the image...',
  'Shaping the visual tone...',
  'Refining soft details...',
  'Preparing the final frame...'
];

export const isImageGenerationModel = (model?: string | null) => {
  const value = String(model || '').trim();
  return value ? IMAGE_MODEL_PATTERNS.some(pattern => pattern.test(value)) : false;
};

export const isImagenModel = (model?: string | null) => /\bimagen\b/i.test(String(model || ''));

export const isGeminiImageModel = (model?: string | null) => {
  const value = String(model || '');
  return /\bgemini\b/i.test(value) && /\bimage\b/i.test(value);
};

export const isOpenAIImageModel = (model?: string | null) => {
  const value = String(model || '');
  return /\bgpt-image\b/i.test(value) || /\bdall-e\b/i.test(value);
};

export const getGenerationMode = (model?: string | null): GenerationMode | undefined => (
  isImageGenerationModel(model) ? 'image' : undefined
);

export const stripGeneratedImageMarkdown = (content?: string) => (
  String(content || '')
    .replace(/!\[[^\]\n]*\]\(\s*data:image\/[a-z0-9.+-]+;base64,[^)]+\)/gi, '[generated image omitted]')
    .replace(/!\[[^\]\n]*\]\(\s*\/api\/chat\/image\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif)\s*\)/gi, '[generated image omitted]')
);
