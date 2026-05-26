import type { Message, NormalizedConversation } from '../types';
import { looksLikeSectionHeader, splitSentences, stripMarkdown, stripUrls } from '../utils/text';

export interface MessageSnippet {
  role: Message['role'];
  text: string;
  hadCode: boolean;
}

const NEXT_STEP_RE = /\b(now (let'?s|we'?ll|i'?ll|i need|we need)|next (we|i|step|up)|still (need|have to|to-do|todo)|todo:|to-do|let'?s (build|add|write|create|fix|test|deploy|ship|do|implement|refactor|move|switch|remove|reframe|rewrite)|i'?ll (build|add|write|create|fix|test|deploy|ship|do|implement)|we'?ll (build|add|write|create|fix|test|deploy|ship)|we need to (build|add|write|fix|test|deploy|ship|implement|create|switch|move)|need to (build|add|write|fix|test|deploy|ship|implement|refactor)|want to (build|add|write|fix|test|implement)|remove the (first|second|last|.{1,30}) (change|brief|section|step|item)|reframe the brief)\b/i;

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

export interface PlanItem {
  label?: string;
  text: string;
  messageId: string;
  messageIndex: number;
}

const PART_HEADER_RE = /\b(PART|Part|Phase|Step)\s+(\d+)\s*[-:]\s*([^\n]{3,140})/g;
const ANCHORED_HEADER_RE = /^(Next steps?|What to (?:build|do)|Remaining work|Action items?|TODO|To do|To-do|Tasks|Things to (?:build|do)|Confirm done by)\b[:\s]*$/im;
const N_THINGS_INTRO_RE = /\b(two|three|four|five|six|several|the following)\s+(things|items|steps|changes|tasks|fixes|parts|additions)\s+(?:to\s+)?(?:do|build|fix|add|change|implement|ship|complete|handle)?\b[:\s]/i;
const NUMBERED_ITEM_RE = /^\s*(\d+)\.\s+(\S.+)$/;

export function extractStructuredPlan(conv: NormalizedConversation, pairsTarget = 15): PlanItem[] {
  const recentMessages = conv.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-pairsTarget * 2);
  if (recentMessages.length === 0) return [];

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    const mIdx = conv.messages.indexOf(msg);
    const combined = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => stripMarkdown(stripUrls((b as { text: string }).text)))
      .join('\n\n');
    if (!combined) continue;
    const items = detectPlanInBlock(combined, msg.id, mIdx);
    if (items.length >= 2) return items.slice(0, 6);
  }
  return [];
}

function detectPlanInBlock(text: string, messageId: string, messageIndex: number): PlanItem[] {
  const partMatches = collectPartMatches(text, messageId, messageIndex);
  if (partMatches.length >= 2) return partMatches;

  const anchoredItems = collectAnchoredListItems(text, messageId, messageIndex);
  if (anchoredItems.length >= 2) return anchoredItems;

  const nThingsItems = collectNThingsList(text, messageId, messageIndex);
  if (nThingsItems.length >= 2) return nThingsItems;

  const numberedItems = collectNumberedItems(text, messageId, messageIndex);
  if (numberedItems.length >= 3) return numberedItems;

  return [];
}

function collectPartMatches(text: string, messageId: string, messageIndex: number): PlanItem[] {
  const out: PlanItem[] = [];
  const fresh = new RegExp(PART_HEADER_RE.source, PART_HEADER_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = fresh.exec(text)) !== null) {
    const label = `${match[1].toUpperCase() === 'PART' ? 'PART' : capitalizeWord(match[1])} ${match[2]}`;
    const itemText = truncateItem(match[3]);
    if (!itemText) continue;
    out.push({ label, text: itemText, messageId, messageIndex });
  }
  return out;
}

function collectAnchoredListItems(text: string, messageId: string, messageIndex: number): PlanItem[] {
  const lines = text.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ANCHORED_HEADER_RE.test(lines[i].trim())) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  return collectListItemsAfter(lines, headerIdx, messageId, messageIndex);
}

function collectNThingsList(text: string, messageId: string, messageIndex: number): PlanItem[] {
  const lines = text.split('\n');
  let introIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (N_THINGS_INTRO_RE.test(lines[i])) {
      introIdx = i;
      break;
    }
  }
  if (introIdx < 0) return [];
  return collectListItemsAfter(lines, introIdx, messageId, messageIndex);
}

function collectListItemsAfter(
  lines: string[],
  startIdx: number,
  messageId: string,
  messageIndex: number
): PlanItem[] {
  const out: PlanItem[] = [];
  let blanksInARow = 0;
  for (let i = startIdx + 1; i < lines.length && i < startIdx + 30; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      blanksInARow++;
      if (blanksInARow >= 2 && out.length > 0) break;
      continue;
    }
    blanksInARow = 0;
    const numbered = trimmed.match(NUMBERED_ITEM_RE);
    if (numbered) {
      const itemText = truncateItem(numbered[2]);
      if (itemText) out.push({ text: itemText, messageId, messageIndex });
      continue;
    }
    if (out.length > 0) break;
  }
  return out;
}

function collectNumberedItems(text: string, messageId: string, messageIndex: number): PlanItem[] {
  const lines = text.split('\n');
  const out: PlanItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(NUMBERED_ITEM_RE);
    if (!match) continue;
    const itemText = truncateItem(match[2]);
    if (itemText) out.push({ text: itemText, messageId, messageIndex });
  }
  if (out.length < 3) return [];
  return out;
}

function truncateItem(s: string): string {
  const cleaned = s.replace(/\s+/g, ' ').trim().replace(/[*_`]+$/, '').trim();
  if (cleaned.length < 4) return '';
  if (cleaned.length <= 140) return cleaned;
  return cleaned.slice(0, 137).replace(/\s\S*$/, '') + '...';
}

function capitalizeWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
