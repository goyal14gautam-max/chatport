import type {
  CompressResult,
  CompressionMeta,
  ConversationType,
  Level,
  NormalizedConversation,
} from '../types';
import { BUDGET_CHARS } from '../types';
import { classifyConversation } from './classify';
import { extractCandidates } from './extract';
import { scoreCandidates } from './score';
import { selectCandidates } from './select';
import { render } from './render';

export interface CompressOptions {
  level: Level;
  forceType?: ConversationType;
}

export function compress(conv: NormalizedConversation, options: CompressOptions): CompressResult {
  const { level } = options;
  const budget = BUDGET_CHARS[level];

  const type = options.forceType ?? classifyConversation(conv).type;

  const candidates = extractCandidates(conv);
  const scored = scoreCandidates(candidates, conv, type);
  const selected = selectCandidates(scored, budget);

  const inputChars = totalChars(conv);
  const provisional = render(conv, type, selected, level, { input: inputChars, output: 0 });
  const output = render(conv, type, selected, level, { input: inputChars, output: provisional.length });

  const meta: CompressionMeta = {
    type,
    level,
    inputChars,
    outputChars: output.length,
    budgetChars: budget,
    droppedMessages: countDroppedMessages(conv, selected),
    droppedAttachments: countDroppedAttachments(conv, level),
  };

  return { markdown: output, meta };
}

export { classifyConversation } from './classify';
export { extractCandidates } from './extract';
export { scoreCandidates } from './score';
export { selectCandidates } from './select';
export { render } from './render';

function totalChars(conv: NormalizedConversation): number {
  let n = 0;
  for (const m of conv.messages) {
    for (const b of m.content) {
      if ('text' in b) n += b.text.length;
    }
  }
  return n;
}

function countDroppedMessages(conv: NormalizedConversation, selected: { messageId: string }[]): number {
  const kept = new Set(selected.map((c) => c.messageId));
  let dropped = 0;
  for (const m of conv.messages) {
    if (!kept.has(m.id) && m.content.length > 0) dropped++;
  }
  return dropped;
}

function countDroppedAttachments(conv: NormalizedConversation, level: Level): number {
  if (level === 'full') return 0;
  let n = 0;
  for (const m of conv.messages) {
    for (const a of m.attachments) {
      if (a.type !== 'code_file' || (a.size ?? 0) > 20_000) n++;
    }
  }
  return n;
}
