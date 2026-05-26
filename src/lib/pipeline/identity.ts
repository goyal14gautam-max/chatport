import type { NormalizedConversation } from '../types';
import { asciiize, stripMarkdown, stripUrls } from '../utils/text';

export interface IdentityTerm {
  term: string;
  count: number;
  spread: number;
  weight: number;
  isProperNoun: boolean;
}

export interface ProjectIdentity {
  projectName: string | null;
  terms: IdentityTerm[];
  projectLine: string;
  recentFocusLine: string;
  confidence: 'high' | 'medium' | 'low';
  recentMessageBlockCount: number;
}

const CAPITAL_STOPLIST = new Set([
  'I', 'A', 'An', 'The', 'This', 'That', 'These', 'Those',
  'You', 'We', 'They', 'He', 'She', 'It', 'My', 'Your', 'Our', 'Their',
  'OK', 'Okay', 'Yes', 'No', 'Maybe', 'Sure', 'Right', 'Wrong',
  'Let', 'Wait', 'Stop', 'Go', 'Try', 'See', 'Look', 'Note', 'Think',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'And', 'But', 'Or', 'So', 'If', 'Then', 'Else', 'When', 'Where', 'Why', 'How',
  'Here', 'There', 'Now', 'Today', 'Yesterday', 'Tomorrow',
  'Good', 'Bad', 'Great', 'Nice', 'Cool', 'Hi', 'Hello', 'Hey', 'Thanks',
]);

const COMMON_LOWER = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'will',
  'would', 'could', 'should', 'about', 'which', 'into', 'they', 'them',
  'their', 'there', 'where', 'when', 'what', 'your', 'just', 'like',
  'only', 'more', 'some', 'than', 'then', 'also', 'been', 'were', 'each',
  'must', 'make', 'made', 'over', 'still', 'such', 'very', 'want', 'need',
  'know', 'think', 'good', 'work', 'time', 'people', 'because', 'these',
  'those', 'while', 'after', 'before', 'between', 'through', 'against',
  'okay', 'yeah', 'thing', 'things', 'really', 'going', 'right', 'maybe',
  'something', 'anything', 'nothing', 'everything', 'someone', 'anyone',
]);

export function extractIdentity(conv: NormalizedConversation): ProjectIdentity {
  const properNounCounts = new Map<string, { count: number; messages: Set<string> }>();
  const lowerCounts = new Map<string, { count: number; messages: Set<string> }>();

  for (const msg of conv.messages) {
    const textParts: string[] = [];
    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(stripMarkdown(stripUrls(block.text)));
      } else if (block.type === 'code') {
        const head = block.text.split('\n').slice(0, 10).join('\n');
        textParts.push(head);
      } else if (block.type === 'artifact') {
        const head = block.text.split('\n').slice(0, 10).join('\n');
        textParts.push(`${block.title} ${head}`);
      }
    }
    const text = textParts.join(' ');
    if (!text.trim()) continue;
    countTermsInText(text, msg.id, properNounCounts, lowerCounts);
  }

  const totalMsgs = Math.max(1, conv.messages.length);
  const properNouns: IdentityTerm[] = [];
  for (const [term, stats] of properNounCounts) {
    if (stats.count < 2) continue;
    if (stats.messages.size < 2) continue;
    const spread = stats.messages.size / totalMsgs;
    properNouns.push({
      term,
      count: stats.count,
      spread,
      weight: stats.count * (0.4 + 0.6 * spread),
      isProperNoun: true,
    });
  }

  const domainTerms: IdentityTerm[] = [];
  for (const [term, stats] of lowerCounts) {
    if (stats.count < 5) continue;
    if (stats.messages.size < 3) continue;
    const spread = stats.messages.size / totalMsgs;
    domainTerms.push({
      term,
      count: stats.count,
      spread,
      weight: stats.count * (0.3 + 0.5 * spread),
      isProperNoun: false,
    });
  }

  const allTerms = [...properNouns, ...domainTerms].sort((a, b) => b.weight - a.weight);
  const topTerms = allTerms.slice(0, 10);

  const projectName = pickProjectName(properNouns, conv.title);
  let confidence = computeConfidence(projectName, topTerms, properNounCounts);
  const project = synthesizeProjectLine(conv, projectName, topTerms);

  if (project.sourceQuality === 'definition') {
    confidence = 'high';
  } else if (project.sourceQuality === 'none') {
    confidence = 'low';
  }
  // referential and templated keep the baseline confidence from computeConfidence

  const recent = synthesizeRecentFocus(conv, projectName, topTerms);

  return {
    projectName,
    terms: topTerms,
    projectLine: project.line,
    recentFocusLine: recent.line,
    confidence,
    recentMessageBlockCount: recent.blockCount,
  };
}

function countTermsInText(
  text: string,
  messageId: string,
  properNounCounts: Map<string, { count: number; messages: Set<string> }>,
  lowerCounts: Map<string, { count: number; messages: Set<string> }>
): void {
  const tokens = tokenizeWithPosition(text);
  for (let i = 0; i < tokens.length; i++) {
    const { word, isAtSentenceStart } = tokens[i];
    if (word.length < 3) continue;
    const first = word[0];

    if (first >= 'A' && first <= 'Z') {
      if (CAPITAL_STOPLIST.has(word)) continue;
      if (isAllCapsAcronym(word) || !isAtSentenceStart || appearsCapitalizedElsewhere(word, tokens)) {
        bumpCount(properNounCounts, word, messageId);
      }
      const lower = word.toLowerCase();
      if (!COMMON_LOWER.has(lower) && lower.length >= 4) {
        bumpCount(lowerCounts, lower, messageId);
      }
    } else {
      if (word.length < 4) continue;
      if (COMMON_LOWER.has(word)) continue;
      if (!/^[a-z0-9_-]+$/.test(word)) continue;
      bumpCount(lowerCounts, word, messageId);
    }
  }
}

function tokenizeWithPosition(text: string): Array<{ word: string; isAtSentenceStart: boolean }> {
  const out: Array<{ word: string; isAtSentenceStart: boolean }> = [];
  let prevTerminator = true;
  const wordRe = /[A-Za-z][A-Za-z0-9_-]*/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(text)) !== null) {
    const gap = text.slice(lastEnd, match.index);
    if (/[.!?]\s*$|\n/.test(gap) || lastEnd === 0) {
      prevTerminator = true;
    }
    out.push({ word: match[0], isAtSentenceStart: prevTerminator });
    prevTerminator = false;
    lastEnd = match.index + match[0].length;
  }
  return out;
}

function isAllCapsAcronym(word: string): boolean {
  return word.length >= 2 && word === word.toUpperCase() && /[A-Z]/.test(word);
}

function appearsCapitalizedElsewhere(
  word: string,
  tokens: Array<{ word: string; isAtSentenceStart: boolean }>
): boolean {
  for (const t of tokens) {
    if (t.word === word && !t.isAtSentenceStart) return true;
  }
  return false;
}

function bumpCount(
  map: Map<string, { count: number; messages: Set<string> }>,
  key: string,
  messageId: string
): void {
  const existing = map.get(key);
  if (existing) {
    existing.count++;
    existing.messages.add(messageId);
  } else {
    map.set(key, { count: 1, messages: new Set([messageId]) });
  }
}

function pickProjectName(properNouns: IdentityTerm[], conversationTitle?: string): string | null {
  const titleTerms = extractTitleProperNouns(conversationTitle);
  for (const titleTerm of titleTerms) {
    const found = properNouns.find((p) => p.term.toLowerCase() === titleTerm.toLowerCase());
    if (found) return found.term;
  }
  const sorted = [...properNouns].sort((a, b) => b.weight - a.weight);
  for (const t of sorted) {
    if (t.spread < 0.02) continue;
    return t.term;
  }
  return null;
}

function extractTitleProperNouns(title: string | undefined): string[] {
  if (!title) return [];
  const out: string[] = [];
  const wordRe = /[A-Z][A-Za-z0-9_-]*/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(title)) !== null) {
    const word = match[0];
    if (word.length < 3) continue;
    if (CAPITAL_STOPLIST.has(word)) continue;
    if (/^(Project|Chat|Conversation|Build|Plan|Notes|Discussion|Draft)$/i.test(word)) continue;
    out.push(word);
  }
  return out;
}

function computeConfidence(
  projectName: string | null,
  topTerms: IdentityTerm[],
  properNounCounts: Map<string, { count: number; messages: Set<string> }>
): 'high' | 'medium' | 'low' {
  if (!projectName) return 'low';
  const stats = properNounCounts.get(projectName);
  if (!stats) return 'low';
  if (stats.count >= 10 && stats.messages.size >= 5) return 'high';
  if (stats.count >= 4 && stats.messages.size >= 3) return 'medium';
  return 'low';
}

function synthesizeProjectLine(
  conv: NormalizedConversation,
  projectName: string | null,
  topTerms: IdentityTerm[]
): { line: string; sourceQuality: 'definition' | 'referential' | 'templated' | 'none' } {
  if (projectName) {
    const defSentence = findDefinitionSentence(conv, projectName);
    if (defSentence) return { line: defSentence, sourceQuality: 'definition' };

    const refSentence = findReferentialSentence(conv, projectName, topTerms);
    if (refSentence) return { line: refSentence, sourceQuality: 'referential' };

    const otherTerms = topTerms
      .filter((t) => t.term.toLowerCase() !== projectName.toLowerCase())
      .slice(0, 3)
      .map((t) => t.term);
    if (otherTerms.length > 0) {
      return {
        line: `${projectName} - project around ${otherTerms.join(', ')}.`,
        sourceQuality: 'templated',
      };
    }
  }

  if (topTerms.length > 0) {
    const terms = topTerms.slice(0, 3).map((t) => t.term).join(', ');
    return { line: `Project topic: ${terms}.`, sourceQuality: 'templated' };
  }
  return { line: '', sourceQuality: 'none' };
}

const SECTION_HEADER_PATTERNS: RegExp[] = [
  /\bPART\s+\d+\s+[-:]\s+([^\n.]{3,60})/gi,
  /\bPhase\s+\d+\s+[-:]\s+([^\n.]{3,60})/gi,
  /\bStep\s+\d+\s+[-:]\s+([^\n.]{3,60})/gi,
  /\bIssue\s+\d+\s+[-:]\s+([^\n.?]{3,60})/gi,
  /\bQuestion\s+\d+\s+[-:]\s+([^\n.?]{3,60})/gi,
];

function synthesizeRecentFocus(
  conv: NormalizedConversation,
  projectName: string | null,
  conversationTopTerms: IdentityTerm[]
): { line: string; blockCount: number } {
  const recent = lastMessagePairs(conv, 15);
  let blockCount = 0;
  for (const m of recent) blockCount += m.content.length;
  if (recent.length === 0) return { line: '', blockCount };

  const sectionPhrases = extractSectionHeaderPhrases(recent);

  const recentTerms = countTermsAcross(recent);
  const conversationTopSet = new Set(
    conversationTopTerms.slice(0, 5).map((t) => t.term.toLowerCase())
  );
  const projectLower = projectName?.toLowerCase() ?? '';

  const emergent: Array<{ term: string; weight: number }> = [];
  for (const t of recentTerms) {
    if (t.term.toLowerCase() === projectLower) continue;
    const isInTop5 = conversationTopSet.has(t.term.toLowerCase());
    const emergentBonus = isInTop5 ? 0 : 0.5;
    emergent.push({ term: t.term, weight: t.weight + emergentBonus });
  }
  emergent.sort((a, b) => b.weight - a.weight);

  const picked: string[] = [];
  const seen = new Set<string>();

  for (const phrase of sectionPhrases) {
    const norm = phrase.toLowerCase().trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    picked.push(phrase);
    if (picked.length >= 4) break;
  }
  for (const e of emergent) {
    if (picked.length >= 4) break;
    const norm = e.term.toLowerCase();
    if (seen.has(norm)) continue;
    if ([...seen].some((existing) => existing.includes(norm) || norm.includes(existing))) continue;
    seen.add(norm);
    picked.push(e.term);
  }

  if (picked.length === 0) return { line: '', blockCount };
  return { line: `${picked.join(', ')}.`, blockCount };
}

function lastMessagePairs(conv: NormalizedConversation, pairsTarget: number) {
  const msgs = conv.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  return msgs.slice(-pairsTarget * 2);
}

function extractSectionHeaderPhrases(messages: NormalizedConversation['messages']): string[] {
  const phrases: Array<{ phrase: string; index: number }> = [];
  messages.forEach((m, mIdx) => {
    if (m.role !== 'assistant') return;
    const combined = m.content
      .filter((b) => b.type === 'text')
      .map((b) => asciiize((b as { text: string }).text))
      .join('\n\n');
    if (!combined) return;
    for (const re of SECTION_HEADER_PATTERNS) {
      const fresh = new RegExp(re.source, re.flags);
      let match: RegExpExecArray | null;
      while ((match = fresh.exec(combined)) !== null) {
        const phrase = match[1].trim().replace(/[*_`]+/g, '').replace(/\s+/g, ' ');
        if (phrase.length < 3 || phrase.length > 60) continue;
        phrases.push({ phrase, index: mIdx });
      }
    }
  });
  phrases.sort((a, b) => b.index - a.index);
  return phrases.map((p) => p.phrase);
}

function countTermsAcross(messages: NormalizedConversation['messages']): IdentityTerm[] {
  const properNounCounts = new Map<string, { count: number; messages: Set<string> }>();
  const lowerCounts = new Map<string, { count: number; messages: Set<string> }>();

  for (const msg of messages) {
    const textParts: string[] = [];
    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(stripMarkdown(stripUrls(block.text)));
      }
    }
    const text = textParts.join(' ');
    if (!text.trim()) continue;
    countTermsInText(text, msg.id, properNounCounts, lowerCounts);
  }

  const totalMsgs = Math.max(1, messages.length);
  const out: IdentityTerm[] = [];
  for (const [term, stats] of properNounCounts) {
    if (stats.count < 2) continue;
    const spread = stats.messages.size / totalMsgs;
    out.push({
      term,
      count: stats.count,
      spread,
      weight: stats.count * (0.4 + 0.6 * spread),
      isProperNoun: true,
    });
  }
  for (const [term, stats] of lowerCounts) {
    if (stats.count < 3) continue;
    if (stats.messages.size < 2) continue;
    const spread = stats.messages.size / totalMsgs;
    out.push({
      term,
      count: stats.count,
      spread,
      weight: stats.count * (0.3 + 0.5 * spread),
      isProperNoun: false,
    });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out;
}

function findDefinitionSentence(conv: NormalizedConversation, projectName: string): string | null {
  const re = new RegExp(
    `\\b${escapeRegex(projectName)}\\s+(is|are|will be|will become|stands for|means)\\b[^.!?]{10,180}[.!?]`,
    'i'
  );
  for (const m of conv.messages) {
    for (const b of m.content) {
      if (b.type !== 'text') continue;
      const stripped = stripMarkdown(stripUrls(b.text));
      const match = stripped.match(re);
      if (match) return match[0].trim();
    }
  }
  return null;
}

function findReferentialSentence(
  conv: NormalizedConversation,
  projectName: string,
  topTerms: IdentityTerm[]
): string | null {
  const otherTerms = topTerms
    .filter((t) => t.term.toLowerCase() !== projectName.toLowerCase())
    .slice(0, 6)
    .map((t) => t.term.toLowerCase());
  if (otherTerms.length < 2) return null;

  for (const m of conv.messages) {
    if (m.role !== 'assistant') continue;
    for (const b of m.content) {
      if (b.type !== 'text') continue;
      const stripped = stripMarkdown(stripUrls(b.text));
      const sentences = stripped.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        const trimmed = s.trim();
        if (trimmed.endsWith('?')) continue;
        const lower = trimmed.toLowerCase();
        if (!lower.includes(projectName.toLowerCase())) continue;
        const matchCount = otherTerms.filter((t) => lower.includes(t)).length;
        if (matchCount >= 2 && trimmed.length >= 30 && trimmed.length <= 240) {
          return trimmed;
        }
      }
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
