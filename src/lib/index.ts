import type { CompressResult, Level } from './types';
import { parse } from './parsers';
import { compress, type CompressOptions } from './pipeline';

export * from './types';
export { parse, detectFormat, parseChatGPT, parseClaude } from './parsers';
export { compress, classifyConversation, extractCandidates, scoreCandidates, selectCandidates, render } from './pipeline';

export interface ChatPortInput {
  raw: unknown;
  conversationId?: string;
  options: CompressOptions;
}

export function chatport(input: ChatPortInput): CompressResult;
export function chatport(raw: unknown, level: Level, conversationId?: string): CompressResult;
export function chatport(
  rawOrInput: unknown | ChatPortInput,
  level?: Level,
  conversationId?: string
): CompressResult {
  if (level !== undefined) {
    const conv = parse(rawOrInput, conversationId);
    return compress(conv, { level });
  }
  const input = rawOrInput as ChatPortInput;
  const conv = parse(input.raw, input.conversationId);
  return compress(conv, input.options);
}
