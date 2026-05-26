import { NextResponse } from 'next/server';
import { ScrapeError, scrapeChatGPTShare, detectPlatformFromUrl } from '@/lib/scrapers';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

interface ScrapeRequestBody {
  url?: unknown;
}

export async function POST(request: Request) {
  let body: ScrapeRequestBody;
  try {
    body = (await request.json()) as ScrapeRequestBody;
  } catch {
    return errorResponse(400, 'INVALID_REQUEST', 'Request body must be JSON.');
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return errorResponse(400, 'INVALID_URL', 'Please provide a share URL.');
  }

  const platform = detectPlatformFromUrl(url);

  if (platform === 'claude') {
    return errorResponse(
      400,
      'UNSUPPORTED_PLATFORM',
      "Claude share links can't be auto-fetched — their share page loads conversations client-side. Export your Claude data (Settings → Privacy → Export data) and upload conversations.json instead."
    );
  }

  if (platform === 'unsupported') {
    return errorResponse(
      400,
      'UNSUPPORTED_PLATFORM',
      'Only ChatGPT share URLs are supported for auto-fetch right now (chatgpt.com/share/<id>). For other platforms, please upload conversations.json.'
    );
  }

  try {
    const data = await scrapeChatGPTShare(url);
    return NextResponse.json({ ok: true, source: 'chatgpt', data }, { status: 200 });
  } catch (err) {
    if (err instanceof ScrapeError) {
      const status = err.code === 'NOT_FOUND_OR_PRIVATE' ? 404 : err.code === 'UPSTREAM_BLOCKED' ? 502 : 502;
      return errorResponse(status, err.code, err.userMessage);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, 'INTERNAL', `Unexpected error: ${message}`);
  }
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}
