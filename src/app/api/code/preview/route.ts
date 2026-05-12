import { NextResponse } from 'next/server';
import { buildPreviewDocument } from '@/lib/code-preview-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PreviewPayload = {
  language?: string;
  code?: string;
  previewId?: string;
};

export async function POST(req: Request) {
  try {
    const payload = await req.json() as PreviewPayload;
    const language = typeof payload.language === 'string' ? payload.language : 'text';
    const code = typeof payload.code === 'string' ? payload.code : '';
    const previewId = typeof payload.previewId === 'string' ? payload.previewId : 'preview';

    return NextResponse.json({ srcDoc: buildPreviewDocument(code, language, previewId) });
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Preview build failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
