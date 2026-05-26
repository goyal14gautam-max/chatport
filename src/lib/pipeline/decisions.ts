import type { Message, NormalizedConversation } from '../types';
import { looksLikeSectionHeader, stripMarkdown, stripUrls } from '../utils/text';
import type { IdentityTerm } from './identity';

const SUBJECT = `(?:I|we|let'?s|i'?ll|we'?ll|i'?m|we'?re|i'?ve|we'?ve)`;
const NEGATION = `(?!\\s+(?:not|n't|never|don'?t|do\\s+not|will\\s+not|won'?t))`;
const HARD_DECISION_RE = new RegExp(
  `\\b${SUBJECT}\\s+(?:going\\s+to\\s+|gonna\\s+|just\\s+|already\\s+|now\\s+|finally\\s+)?(chose|chosen|choose|decided|deciding|decide|going\\s+with|gone\\s+with|settling\\s+on|settled\\s+on|switched\\s+to|switching\\s+to|moved\\s+to|moving\\s+to|reverted\\s+to|adopted|adopting|keeping|kept|dropping|dropped|skipping|skipped|removing|removed|sticking\\s+with|opted\\s+for|opting\\s+for|focused\\s+on|focusing\\s+on)${NEGATION}\\b`,
  'i'
);
const SOFT_COMMIT_RE = new RegExp(
  `\\b(?:${SUBJECT}\\s+(use|go\\s+with|drop|skip|stick\\s+with|try|build|do|focus\\s+on|keep|remove|switch|move|adopt|implement|ship|finalize)${NEGATION}|(?:${SUBJECT}\\s+(?:are\\s+|going\\s+to\\s+)?)?keep(?:ing)?\\s+(?:it|things|this)\\s+(?:the\\s+way|as\\s+is)|is\\s+fine\\s+for\\s+now|manual\\s+is\\s+fine|good\\s+enough\\s+for\\s+now|(?:two|three|four)\\s+(?:roles|options|tiers|levels)\\s+only)\\b`,
  'i'
);
const TRADEOFF_RE = new RegExp(
  `\\b${SUBJECT}\\s+(?:chose|picked|opted\\s+for|went\\s+with|going\\s+with)\\s+\\S.{1,60}?\\s+(?:over|instead\\s+of|rather\\s+than)\\b`,
  'i'
);
const RECOMMEND_RE = /\b(i('?d| would)? recommend|recommend (using|going|dropping|building|skipping|keeping)|my recommendation\b|my suggestion is)\b/i;

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
        if (!isValidDecisionShape(s, identityLower)) continue;
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

function isValidDecisionShape(s: string, identityTermsLower: string[] = []): boolean {
  if (s.length < 25 || s.length > 300) return false;
  if (s[0] === '#') return false;
  if (/\?$/.test(s)) return false;
  if (/:\s*$/.test(s)) return false;
  if (/\b(?:can|should|do)\s+we\b|\bwhat\s+about\b|\bhow\s+(?:do|about)\s+we\b|\bwhy\s+don'?t\s+we\b/i.test(s)) {
    return false;
  }
  if (/^(?:check|paste|run|see|read|look\s+at|try|click)\b/i.test(s)) return false;
  if (/^(?:let\s+me|i'?ll\s+explain|here'?s\s+how|here\s+is\s+how|now\s+i'?ll)\b/i.test(s)) return false;
  if (looksLikeSectionHeader(s)) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount < 8 && !hasSpecificNoun(s, identityTermsLower)) return false;
  if (looksLikeDescriptiveFragment(s)) return false;
  if (looksLikeFutureHypothetical(s)) return false;
  return true;
}

function hasSpecificNoun(s: string, identityTermsLower: string[]): boolean {
  const lower = s.toLowerCase();
  if (identityTermsLower.some((t) => t && lower.includes(t))) return true;
  const withoutLead = s.replace(/^[\s"'(\[]+/, '');
  const tokens = withoutLead.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (i === 0) continue;
    if (w.length < 3) continue;
    if (w[0] < 'A' || w[0] > 'Z') continue;
    if (/^(The|This|That|These|Those|We|You|Our|Their|My|Your|It|He|She|They|I)$/.test(w)) continue;
    return true;
  }
  return false;
}

function looksLikeDescriptiveFragment(s: string): boolean {
  if (!/^(A|An|The)\s+[a-z]/.test(s)) return false;
  const head = s.slice(0, 80);
  return !/\b(I|we|let'?s|i'?ll|we'?ll|i'?m|we'?re)\b/i.test(head);
}

function looksLikeFutureHypothetical(s: string): boolean {
  if (!/^(After|Once|When|If)\b/i.test(s)) return false;
  return /\b(will|would|could|might|shall)\b/i.test(s);
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
