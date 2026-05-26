import type { Source } from '../types';

export { parseChatGPTShareUrl, scrapeChatGPTShare, ScrapeError } from './chatgpt';
export type { ScrapeErrorCode, ChatGPTShareInfo } from './chatgpt';
export { decodeReactRouterStream, extractStreamPayload, findChatGPTConversationData } from './streamDecode';

const CLAUDE_HOSTS = new Set(['claude.ai', 'www.claude.ai']);
const CHATGPT_HOSTS = new Set(['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com']);

export type DetectedPlatform = Source | 'unsupported';

export function detectPlatformFromUrl(input: string): DetectedPlatform {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return 'unsupported';
  }
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  const isShare = segments[0] === 'share' && Boolean(segments[1]);
  if (CHATGPT_HOSTS.has(host) && isShare) return 'chatgpt';
  if (CLAUDE_HOSTS.has(host) && isShare) return 'claude';
  return 'unsupported';
}
