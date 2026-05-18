import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '@/lib/data-directories';

const GENERATED_IMAGE_DIR = path.join(DATA_DIR, 'generated-images');
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};

export const saveGeneratedImage = async (base64: string, mimeType = 'image/png') => {
  const ext = IMAGE_EXT_BY_MIME[mimeType] || 'png';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
  await fs.writeFile(path.join(GENERATED_IMAGE_DIR, fileName), Buffer.from(base64, 'base64'));
  return `/api/chat/image/${fileName}`;
};

export const resolveGeneratedImage = (fileName: string) => {
  if (!/^[a-f0-9-]+\.(png|jpg|jpeg|webp|gif)$/i.test(fileName)) return null;
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const root = path.normalize(GENERATED_IMAGE_DIR + path.sep);
  const filePath = path.normalize(path.join(GENERATED_IMAGE_DIR, fileName));
  if (!filePath.toLowerCase().startsWith(root.toLowerCase())) return null;
  return {
    filePath,
    mimeType: MIME_BY_EXT[ext] || 'application/octet-stream'
  };
};
