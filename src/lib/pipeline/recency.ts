import type { Message, NormalizedConversation } from '../types';
import { looksLikeSectionHeader, splitSentences, stripMarkdown, stripUrls } from '../utils/text';

export interface MessageSnippet {
  role: Message['role'];
  text: string;
  hadCode: boolean;
}

const NEXT_STEP_RE = /\b(now (let'?s|we'?ll|i'?ll|i need|we need)|next (we|i|step|up)|still (need|have to|to-do|todo)|todo:|to-do|let'?s (build|add|write|create|fix|test|deploy|ship|do|implement|refactor|move|switch)|i'?ll (build|add|write|create|fix|test|deploy|ship|do|implement)|we'?ll (build|add|write|create|fix|test|deploy|ship)|we need to (build|add|write|fix|test|deploy|ship|implement|create|switch|move)|need to (build|add|write|fix|test|deploy|ship|implement|refactor)|want to (build|add|write|fix|test|implement))\b/i;

const USER_FIRST_SENTS = 2;
const USER_TAIL_SENTS = 1;
const ASSISTANT_FIRST_SENTS = 2;
const ASSISTANT_MAX_SENTS = 4;

export function recentMessageSnippets(
  conv: NormalizedConversation,
  pairsTarget = 15,
  budgetChars = 3500,
  identityTermsLower: string[] = []
): MessageSnippet[] {
  const msgs = conv.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  if (msgs.length === 0) return [];

  const targetCount = pairsTarget * 2;
  const tail = msgs.slice(-targetCount);

  const snippets: MessageSnippet[] = tail.map((m) =>
    compressMessage(m, identityTermsLower)
  );

  return trimToBudget(snippets, budgetChars);
}

function compressMessage(msg: Message, identityTermsLower: string[]): MessageSnippet {
  let hadCode = false;
  const textParts: string[] = [];
  for (const block of msg.content) {
    if (block.type === 'text') {
      textParts.push(stripMarkdown(stripUrls(block.text)));
    } else if (block.type === 'code' || block.type === 'artifact') {
      hadCode = true;
    }
  }
  const combined = textParts.join(' ').replace(/\s+/g, ' ').trim();
  if (!combined) {
    return { role: msg.role, text: hadCode ? '[code only - see artifacts]' : '', hadCode };
  }

  const sentences = splitSentences(combined).filter(
    (s) => s.length > 0 && !looksLikeSectionHeader(s)
  );

  if (sentences.length === 0) {
    return { role: msg.role, text: truncate(combined, 240), hadCode };
  }

  const picked = msg.role === 'user'
    ? pickUser(sentences)
    : pickAssistant(sentences, identityTermsLower);

  let text = picked.join(' ');
  if (hadCode) text += ' [+ code, see artifacts]';
  text = truncate(text, 400);
  return { role: msg.role, text, hadCode };
}

function pickUser(sentences: string[]): string[] {
  if (sentences.length <= USER_FIRST_SENTS + USER_TAIL_SENTS) return sentences;
  const head = sentences.slice(0, USER_FIRST_SENTS);
  const tail = sentences.slice(-USER_TAIL_SENTS);
  if (tail[0] === head[head.length - 1]) return head;
  return [...head, ...tail];
}

function pickAssistant(sentences: string[], identityTermsLower: string[]): string[] {
  const head = sentences.slice(0, ASSISTANT_FIRST_SENTS);
  if (identityTermsLower.length === 0) return head;
  const rest = sentences.slice(ASSISTANT_FIRST_SENTS);
  const interesting = rest.filter((s) => {
    const lower = s.toLowerCase();
    return identityTermsLower.some((t) => lower.includes(t));
  });
  const out = [...head, ...interesting].slice(0, ASSISTANT_MAX_SENTS);
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s\S*$/, '') + '...';
}

function trimToBudget(snippets: MessageSnippet[], budget: number): MessageSnippet[] {
  let total = 0;
  for (const s of snippets) total += s.text.length + 20;
  if (total <= budget) return snippets;
  const out = [...snippets];
  while (out.length > 2) {
    const removed = out.shift();
    if (removed) total -= removed.text.length + 20;
    if (total <= budget) break;
  }
  return out;
}

export interface NextStep {
  text: string;
  messageId: string;
  position: number;
}

export function extractNextSteps(conv: NormalizedConversation, scanLastUserMsgs = 10, cap = 5): NextStep[] {
  const userMsgs = conv.messages.filter((m) => m.role === 'user');
  if (userMsgs.length === 0) return [];
  const recent = userMsgs.slice(-scanLastUserMsgs);
  const total = Math.max(1, conv.messages.length - 1);
  const out: NextStep[] = [];

  for (const m of recent) {
    const mIdx = conv.messages.indexOf(m);
    const position = mIdx / total;
    const textParts: string[] = [];
    for (const block of m.content) {
      if (block.type === 'text') textParts.push(stripMarkdown(stripUrls(block.text)));
    }
    const combined = textParts.join(' ');
    if (!combined.trim()) continue;
    const sentences = splitSentences(combined);
    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length < 12 || s.length > 240) continue;
      if (looksLikeSectionHeader(s)) continue;
      if (!NEXT_STEP_RE.test(s)) continue;
      out.push({ text: s, messageId: m.id, position });
    }
  }

  const seen = new Set<string>();
  const deduped: NextStep[] = [];
  for (const item of [...out].sort((a, b) => b.position - a.position)) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= cap) break;
  }
  return deduped.sort((a, b) => a.position - b.position);
}

export interface OpenQuestion {
  text: string;
  messageId: string;
}

export function extractOpenQuestions(conv: NormalizedConversation, lookbackMessages = 20, cap = 5): OpenQuestion[] {
  const tail = conv.messages.slice(-lookbackMessages);
  const unanswered = new Set<string>();
  for (let i = 0; i < tail.length; i++) {
    if (tail[i].role !== 'user') continue;
    const next = tail[i + 1];
    if (!next || next.role !== 'assistant') unanswered.add(tail[i].id);
  }

  const out: OpenQuestion[] = [];
  const seen = new Set<string>();
  for (const m of tail) {
    if (m.role !== 'user') continue;
    if (!unanswered.has(m.id)) continue;
    for (const block of m.content) {
      if (block.type !== 'text') continue;
      const cleaned = stripMarkdown(stripUrls(block.text));
      const sentences = splitSentences(cleaned);
      for (const raw of sentences) {
        const s = raw.trim();
        if (!s.endsWith('?')) continue;
        if (s.length < 12 || s.length > 240) continue;
        if (looksLikeSectionHeader(s)) continue;
        const key = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text: s, messageId: m.id });
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}
