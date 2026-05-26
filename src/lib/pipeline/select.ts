import type { Candidate, ScoredCandidate } from '../types';

const ALWAYS_KEEP_BUDGET_FRACTION = 0.25;
const DIVERSITY_PENALTY = 0.15;

export function selectCandidates(scored: ScoredCandidate[], budgetChars: number): Candidate[] {
  if (!isFinite(budgetChars)) {
    return [...scored].sort(compareByOrder);
  }
  if (scored.length === 0 || budgetChars <= 0) return [];

  const alwaysKeeps = scored.filter((c) => c.alwaysKeep).sort((a, b) => b.score - a.score);
  const rest = scored.filter((c) => !c.alwaysKeep);

  const alwaysBudget = budgetChars * ALWAYS_KEEP_BUDGET_FRACTION;
  const picked: ScoredCandidate[] = [];
  const messagePicks = new Map<string, number>();
  let used = 0;

  for (const c of alwaysKeeps) {
    if (used + c.charLen > alwaysBudget && picked.length > 0) break;
    picked.push(c);
    used += c.charLen;
    bump(messagePicks, c.messageId);
  }
  for (const c of alwaysKeeps.slice(picked.length)) {
    rest.push(c);
  }

  const ranked = [...rest].sort((a, b) => {
    const efficiencyA = a.score / Math.max(1, Math.log10(a.charLen + 10));
    const efficiencyB = b.score / Math.max(1, Math.log10(b.charLen + 10));
    return efficiencyB - efficiencyA;
  });

  for (const c of ranked) {
    if (used + c.charLen > budgetChars) continue;
    const localPicks = messagePicks.get(c.messageId) ?? 0;
    const effectiveScore = c.score - localPicks * DIVERSITY_PENALTY;
    if (effectiveScore <= 0 && !c.alwaysKeep) continue;
    picked.push(c);
    used += c.charLen;
    bump(messagePicks, c.messageId);
  }

  return picked.sort(compareByOrder);
}

function bump(m: Map<string, number>, key: string): void {
  m.set(key, (m.get(key) ?? 0) + 1);
}

function compareByOrder(a: Candidate, b: Candidate): number {
  const aMsg = (a.metadata.messageIndex as number) ?? 0;
  const bMsg = (b.metadata.messageIndex as number) ?? 0;
  if (aMsg !== bMsg) return aMsg - bMsg;
  const aBlock = (a.metadata.blockIndex as number) ?? 0;
  const bBlock = (b.metadata.blockIndex as number) ?? 0;
  if (aBlock !== bBlock) return aBlock - bBlock;
  const aSent = (a.metadata.sentenceIndex as number) ?? 0;
  const bSent = (b.metadata.sentenceIndex as number) ?? 0;
  return aSent - bSent;
}
