import type { CompressResult, Level } from '../types';

export async function loadAndCompress(
  raw: unknown,
  level: Level,
  conversationId?: string
): Promise<CompressResult> {
  const lib = await import('../index');
  return lib.chatport(raw, level, conversationId);
}
