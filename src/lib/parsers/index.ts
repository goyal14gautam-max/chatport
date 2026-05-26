import type { ConvSummary, NormalizedConversation } from '../types';
import { detectFormat } from './detect';
import { listChatGPTConversations, parseChatGPT } from './chatgpt';
import { listClaudeConversations, parseClaude } from './claude';

export { detectFormat } from './detect';
export { listChatGPTConversations, parseChatGPT } from './chatgpt';
export { listClaudeConversations, parseClaude } from './claude';

export function parse(raw: unknown, conversationId?: string): NormalizedConversation {
  const fmt = detectFormat(raw);
  if (fmt === 'chatgpt') return parseChatGPT(raw, conversationId);
  if (fmt === 'claude') return parseClaude(raw, conversationId);
  throw new Error('Unrecognized export format. Expected ChatGPT or Claude conversation JSON.');
}

export function listConversations(raw: unknown): ConvSummary[] {
  const fmt = detectFormat(raw);
  if (fmt === 'chatgpt') return listChatGPTConversations(raw);
  if (fmt === 'claude') return listClaudeConversations(raw);
  return [];
}
