export const IMAGE_ASPECT_RATIOS = ['auto', '1:1', '3:4', '9:16', '4:3', '16:9'] as const;

export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number];

export const normalizeImageAspectRatio = (value: unknown): ImageAspectRatio => (
  IMAGE_ASPECT_RATIOS.includes(value as ImageAspectRatio) ? value as ImageAspectRatio : 'auto'
);

export const getProviderImageAspectRatio = (value: unknown) => {
  const ratio = normalizeImageAspectRatio(value);
  return ratio === 'auto' ? undefined : ratio;
};
