import { TfIdf } from '../utils/tfidf';
import type { Candidate, ConversationType, ScoredCandidate, NormalizedConversation } from '../types';

const IMPERATIVE_RE = /\b(write|build|create|make|fix|debug|refactor|implement|add|remove|update|change|generate|design|drop|skip|use|stick|consider|adopt|replace|pivot|focus|start)\b/i;
const DECISION_RE = /\b(let's|we'?ll|going to use|decided to|going with|chose|chosen|will use|i'?ll go with|use\s+\w+\s+for|we should use|i'?d recommend|i recommend|you should|consider using|drop the|skip the|stick with|opt for|pivot to|go with|win on)\b/i;
const STRONG_DECISION_RE = /\b(let's go with|decided to|we'?ll use|going with|i'?d recommend\b|i recommend\b)\b/i;
const ERROR_RE = /\b(error|exception|traceback|stack trace|typeerror|valueerror|null pointer|undefined is not|cannot read|panic|segfault|nullpointerexception)\b/i;
const FILENAME_RE = /\b[\w-]+\.(?:py|js|mjs|cjs|ts|tsx|jsx|go|rs|java|kt|cpp|c|h|rb|php|sql|sh|html|css|json|yaml|yml|toml|md)\b/i;
const CITATION_RE = /\b(according to|source:|cited|paper|study|research)\b/i;
const STYLE_RE = /\b(voice|tone|audience|style|narrative)\b/i;
const TRADEOFF_RE = /\b(tradeoff|trade-off|pros|cons|versus|vs\.|on the other hand|downside)\b/i;
const DEADLINE_RE = /\b(deadline|by (mon|tue|wed|thu|fri|sat|sun)|due (date|by)|launch|ship by)\b/i;

export function scoreCandidates(
  candidates: Candidate[],
  conv: NormalizedConversation,
  type: ConversationType
): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  const tfidfScores = computeTfidfScores(candidates);
  const lastUserMessageId = findLastMessageIdByRole(conv, 'user');
  const lastAssistantMessageId = findLastMessageIdByRole(conv, 'assistant');
  const unansweredMessageIds = findUnansweredUserMessageIds(conv);

  return candidates.map((c) => {
    let score = 0;

    score += 0.4 * Math.exp(-3 * (1 - c.position));
    score -= 0.0005 * c.charLen;

    const isUserTurn = c.role === 'user';
    const isQuestion = c.kind === 'question';
    if (isQuestion && isUserTurn) score += 0.3;
    if (isQuestion && unansweredMessageIds.has(c.messageId)) score += 0.6;

    if (IMPERATIVE_RE.test(c.text)) score += 0.2;
    if (DECISION_RE.test(c.text)) score += 0.5;
    if (ERROR_RE.test(c.text)) score += 0.4;
    if (FILENAME_RE.test(c.text)) score += 0.3;
    if (c.kind === 'code') score += 0.3;
    if (c.kind === 'artifact') score += 0.8;

    score += 0.2 * (tfidfScores.get(c.id) ?? 0);

    score *= typeOverlay(c, type);

    const alwaysKeep = computeAlwaysKeep(c, {
      lastUserMessageId,
      lastAssistantMessageId,
    });

    return { ...c, score, alwaysKeep };
  });
}

function computeAlwaysKeep(
  c: Candidate,
  ctx: { lastUserMessageId?: string; lastAssistantMessageId?: string }
): boolean {
  if (c.kind === 'artifact') return true;
  if (c.messageId === ctx.lastUserMessageId) return true;
  if (
    c.messageId === ctx.lastAssistantMessageId &&
    (c.kind === 'code' || c.kind === 'decision' || STRONG_DECISION_RE.test(c.text))
  ) {
    return true;
  }
  if (STRONG_DECISION_RE.test(c.text)) return true;
  return false;
}

function typeOverlay(c: Candidate, type: ConversationType): number {
  let mult = 1;
  if (type === 'coding') {
    if (c.kind === 'code') mult *= 1.5;
    if (ERROR_RE.test(c.text)) mult *= 1.5;
  } else if (type === 'writing') {
    if (c.kind === 'code') mult *= 0.7;
    if (STYLE_RE.test(c.text)) mult *= 1.4;
    if (c.charLen > 200) mult *= 1.2;
  } else if (type === 'research') {
    if (CITATION_RE.test(c.text)) mult *= 1.5;
    if (/\d/.test(c.text)) mult *= 1.1;
  } else if (type === 'planning') {
    if (TRADEOFF_RE.test(c.text)) mult *= 1.4;
    if (DEADLINE_RE.test(c.text)) mult *= 1.5;
  }
  return mult;
}

function findLastMessageIdByRole(
  conv: NormalizedConversation,
  role: 'user' | 'assistant'
): string | undefined {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].role === role) return conv.messages[i].id;
  }
  return undefined;
}

function findUnansweredUserMessageIds(conv: NormalizedConversation): Set<string> {
  const out = new Set<string>();
  const msgs = conv.messages;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== 'user') continue;
    const next = msgs[i + 1];
    if (!next || next.role !== 'assistant') {
      out.add(msgs[i].id);
    }
  }
  return out;
}

function computeTfidfScores(candidates: Candidate[]): Map<string, number> {
  const out = new Map<string, number>();
  if (candidates.length < 2) {
    candidates.forEach((c) => out.set(c.id, 0));
    return out;
  }

  const tfidf = new TfIdf();
  candidates.forEach((c) => tfidf.addDocument(c.text.toLowerCase()));

  let maxSum = 0;
  const sums: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const terms = tfidf.listTerms(i).slice(0, 5);
    const sum = terms.reduce((acc, t) => acc + t.tfidf, 0);
    sums.push(sum);
    if (sum > maxSum) maxSum = sum;
  }
  candidates.forEach((c, i) => {
    out.set(c.id, maxSum > 0 ? sums[i] / maxSum : 0);
  });
  return out;
}
