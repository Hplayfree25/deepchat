import { normalizeImageAspectRatio, type ImageAspectRatio } from '@/lib/image-aspect-ratio';

const COMPOSER_TOOL_STATE_KEY = 'deepchat-composer-tool-state';

export interface ComposerToolState {
  webSearchEnabled: boolean;
  imageGenerationEnabled: boolean;
  imageAspectRatio: ImageAspectRatio;
}

export const defaultComposerToolState: ComposerToolState = {
  webSearchEnabled: false,
  imageGenerationEnabled: false,
  imageAspectRatio: 'auto'
};

export const loadComposerToolState = (): ComposerToolState => {
  if (typeof window === 'undefined') return defaultComposerToolState;
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPOSER_TOOL_STATE_KEY) || '{}') as Partial<ComposerToolState>;
    return {
      webSearchEnabled: parsed.webSearchEnabled === true,
      imageGenerationEnabled: parsed.imageGenerationEnabled === true,
      imageAspectRatio: normalizeImageAspectRatio(parsed.imageAspectRatio)
    };
  } catch {
    return defaultComposerToolState;
  }
};

export const saveComposerToolState = (state: ComposerToolState) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COMPOSER_TOOL_STATE_KEY, JSON.stringify({
    webSearchEnabled: state.webSearchEnabled,
    imageGenerationEnabled: state.imageGenerationEnabled,
    imageAspectRatio: normalizeImageAspectRatio(state.imageAspectRatio)
  }));
};
