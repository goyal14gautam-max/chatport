import type { Source } from '../types';

export type DetectedFormat = Source | 'unknown';

export function detectFormat(raw: unknown): DetectedFormat {
  if (raw === null || typeof raw !== 'object') return 'unknown';

  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object') return detectFormat(first);
    return 'unknown';
  }

  const obj = raw as Record<string, unknown>;

  if ('mapping' in obj && typeof obj.mapping === 'object') return 'chatgpt';
  if ('current_node' in obj && 'mapping' in obj) return 'chatgpt';

  if ('chat_messages' in obj && Array.isArray(obj.chat_messages)) return 'claude';
  if ('uuid' in obj && 'name' in obj && 'chat_messages' in obj) return 'claude';

  if ('conversations' in obj && Array.isArray((obj as { conversations: unknown[] }).conversations)) {
    return detectFormat((obj as { conversations: unknown[] }).conversations);
  }

  return 'unknown';
}
