import { decodeReactRouterStream, extractStreamPayload, findChatGPTConversationData } from './streamDecode';

export class ScrapeError extends Error {
  constructor(public code: ScrapeErrorCode, public userMessage: string) {
    super(userMessage);
    this.name = 'ScrapeError';
  }
}

export type ScrapeErrorCode =
  | 'INVALID_URL'
  | 'NOT_FOUND_OR_PRIVATE'
  | 'UPSTREAM_BLOCKED'
  | 'FETCH_FAILED'
  | 'TIMED_OUT'
  | 'FORMAT_CHANGED'
  | 'INTERNAL';

const CHATGPT_HOSTS = new Set(['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com']);
const SHARE_ID_RE = /^[a-f0-9-]{20,80}$/i;

export interface ChatGPTShareInfo {
  shareId: string;
  canonicalUrl: string;
}

export function parseChatGPTShareUrl(input: string): ChatGPTShareInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (!CHATGPT_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'share') return null;
  const shareId = segments[1];
  if (!SHARE_ID_RE.test(shareId)) return null;
  return {
    shareId,
    canonicalUrl: `https://chatgpt.com/share/${shareId}`,
  };
}

const FETCH_TIMEOUT_MS = 9_000;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function scrapeChatGPTShare(url: string): Promise<unknown> {
  const info = parseChatGPTShareUrl(url);
  if (!info) {
    throw new ScrapeError(
      'INVALID_URL',
      "That doesn't look like a ChatGPT share URL. Expected format: https://chatgpt.com/share/<id>"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(info.canonicalUrl, {
      method: 'GET',
      headers: HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ScrapeError('TIMED_OUT', "ChatGPT didn't respond in time. Try again, or upload conversations.json instead.");
    }
    throw new ScrapeError(
      'FETCH_FAILED',
      "Couldn't reach ChatGPT. Check your connection, or upload conversations.json instead."
    );
  }
  clearTimeout(timeout);

  if (response.status === 404) {
    throw new ScrapeError(
      'NOT_FOUND_OR_PRIVATE',
      "This share link doesn't exist or has been deleted. If it's still active on your end, the share may be private — try uploading conversations.json instead."
    );
  }
  if (response.status === 403 || response.status === 429) {
    throw new ScrapeError(
      'UPSTREAM_BLOCKED',
      "ChatGPT blocked the request (likely Cloudflare). Try again in a minute, or upload conversations.json instead."
    );
  }
  if (!response.ok) {
    throw new ScrapeError(
      'FETCH_FAILED',
      `ChatGPT returned HTTP ${response.status}. Try uploading conversations.json instead.`
    );
  }

  const html = await response.text();
  const payload = extractStreamPayload(html);
  if (!payload) {
    throw new ScrapeError(
      'FORMAT_CHANGED',
      "ChatGPT's share page format has changed and the auto-fetch is no longer working. Please upload conversations.json instead."
    );
  }

  let decoded: unknown;
  try {
    decoded = decodeReactRouterStream(payload);
  } catch {
    throw new ScrapeError(
      'FORMAT_CHANGED',
      "Couldn't decode the ChatGPT share page. Please upload conversations.json instead."
    );
  }

  const data = findChatGPTConversationData(decoded);
  if (!data) {
    throw new ScrapeError(
      'FORMAT_CHANGED',
      "ChatGPT's share page didn't contain a recognizable conversation. Please upload conversations.json instead."
    );
  }

  return data;
}
