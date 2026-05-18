import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { resolveGeneratedImage } from '@/lib/generated-images';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: RouteContext<'/api/chat/image/[id]'>) {
  const { id } = await ctx.params;
  const image = resolveGeneratedImage(id);
  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  try {
    const bytes = await fs.readFile(image.filePath);
    return new Response(bytes, {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
