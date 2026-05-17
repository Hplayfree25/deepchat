import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, join, normalize, sep } from 'path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANALYSIS_ROOT = join(tmpdir(), 'deepchat', 'analysis');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const streamFile = (filePath: string) => {
  const stream = createReadStream(filePath);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    }
  });
};

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('runId') || '';
  const name = basename(req.nextUrl.searchParams.get('name') || '');
  const download = req.nextUrl.searchParams.get('download') === '1';

  if (!runId || !name) {
    return Response.json({ error: 'Missing artifact parameters' }, { status: 400 });
  }

  const runDir = normalize(join(ANALYSIS_ROOT, runId));
  const root = normalize(ANALYSIS_ROOT + sep);
  const filePath = normalize(join(runDir, name));

  if (!runDir.toLowerCase().startsWith(root.toLowerCase()) || !filePath.toLowerCase().startsWith((runDir + sep).toLowerCase())) {
    return Response.json({ error: 'Invalid artifact path' }, { status: 400 });
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    return Response.json({ error: 'Artifact not found' }, { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': MIME_TYPES[extname(name).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600'
  });

  if (download) {
    headers.set('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  }

  return new Response(streamFile(filePath), { headers });
}
