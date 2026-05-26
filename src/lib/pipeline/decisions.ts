import type { Message, NormalizedConversation } from '../types';
import { looksLikeSectionHeader, stripMarkdown, stripUrls } from '../utils/text';
import type { IdentityTerm } from './identity';

const HARD_DECISION_RE = /\b(decided to|we decided|i decided|chose|chosen|going with|settling on|settled on|switched to|switching to|moved to|moving to|reverted to|adopted|keep (it|things|this) (the way|as is)|leaving (it|this|that) (as is|alone))\b/i;
const SOFT_COMMIT_RE = /\b(let'?s (use|go with|drop|skip|stick with|try|build|do|focus on|keep|remove)|we'?ll (use|go|drop|skip|stick|build|do|keep)|i'?ll (use|go with|drop|build|do|keep)|is fine for now|manual is fine|good enough for now|(two|three|four) (roles|options|tiers|levels) only|stick with .{1,30})\b/i;
const TRADEOFF_RE = /\b(chose .{1,40} over|picking .{1,40} over|going with .{1,40} instead|opted for .{1,40} over|instead of .{1,40})\b/i;
const RECOMMEND_RE = /\b(i('?d| would)? recommend|recommend (using|going|dropping|building)|my recommendation|the right call|the right model|the correct choice)\b/i;

export interface Decision {
  text: string;
  position: number;
  strength: number;
  messageId: string;
}

export function extractDecisions(
  conv: NormalizedConversation,
  identityTerms: IdentityTerm[] = [],
  cap = 8
): Decision[] {
  const collected: Decision[] = [];
  const total = Math.max(1, conv.messages.length - 1);
  const identityLower = identityTerms.slice(0, 5).map((t) => t.term.toLowerCase());

  conv.messages.forEach((msg, mIdx) => {
    for (const block of msg.content) {
      if (block.type !== 'text') continue;
      const cleaned = stripMarkdown(stripUrls(block.text));
      if (!cleaned) continue;
      const sentences = splitIntoSentences(cleaned);
      for (const raw of sentences) {
        const s = raw.trim();
        if (!isValidDecisionShape(s)) continue;
        const strength = scoreDecision(s, msg.role);
        if (strength === 0) continue;
        const bonus = identityLower.some((t) => s.toLowerCase().includes(t)) ? 0.3 : 0;
        const position = mIdx / total;
        collected.push({
          text: s,
          position,
          strength: strength + bonus + position * 0.5,
          messageId: msg.id,
        });
      }
    }
  });

  return dedupeAndCap(collected, cap);
}

function splitIntoSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function isValidDecisionShape(s: string): boolean {
  if (s.length < 25 || s.length > 300) return false;
  if (s[0] === '#') return false;
  if (/\?$/.test(s)) return false;
  if (looksLikeSectionHeader(s)) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  return true;
}

function scoreDecision(s: string, role: Message['role']): number {
  let strength = 0;
  if (HARD_DECISION_RE.test(s)) strength = Math.max(strength, 3);
  if (TRADEOFF_RE.test(s)) strength = Math.max(strength, 2.5);
  if (SOFT_COMMIT_RE.test(s)) strength = Math.max(strength, 2);
  if (role === 'assistant' && RECOMMEND_RE.test(s)) strength = Math.max(strength, 1.5);
  return strength;
}

function dedupeAndCap(items: Decision[], cap: number): Decision[] {
  const seenKeys = new Set<string>();
  const seenSignatures = new Set<string>();
  const sorted = [...items].sort((a, b) => b.strength - a.strength);
  const kept: Decision[] = [];
  for (const item of sorted) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (seenKeys.has(key)) continue;
    const signature = decisionSignature(item.text);
    if (signature && seenSignatures.has(signature)) continue;
    seenKeys.add(key);
    if (signature) seenSignatures.add(signature);
    kept.push(item);
    if (kept.length >= cap) break;
  }
  return kept.sort((a, b) => a.position - b.position);
}

function decisionSignature(text: string): string {
  const lower = text.toLowerCase();
  const phrases = [
    'the right call',
    'right model',
    'right approach',
    'is fine for now',
    'manual is fine',
    'keep things',
    'keep it the way',
    'two roles only',
    'going with',
    'switched to',
    'decided to',
  ];
  for (const p of phrases) {
    if (lower.includes(p)) return p;
  }
  return '';
}
