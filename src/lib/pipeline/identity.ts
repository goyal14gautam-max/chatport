import type { Message, NormalizedConversation } from '../types';
import { stripMarkdown, stripUrls } from '../utils/text';

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
  aboutLine: string;
  confidence: 'high' | 'medium' | 'low';
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

  const projectName = pickProjectName(properNouns);
  let confidence = computeConfidence(projectName, topTerms, properNounCounts);
  const about = synthesizeAbout(conv, projectName, topTerms);

  if (about.sourceQuality === 'readme' || about.sourceQuality === 'definition') {
    confidence = 'high';
  } else if (about.sourceQuality === 'referential' || about.sourceQuality === 'templated') {
    confidence = confidence === 'high' ? 'medium' : 'low';
  } else {
    confidence = 'low';
  }

  return { projectName, terms: topTerms, aboutLine: about.line, confidence };
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

function pickProjectName(properNouns: IdentityTerm[]): string | null {
  const sorted = [...properNouns].sort((a, b) => b.weight - a.weight);
  for (const t of sorted) {
    if (t.spread < 0.02) continue;
    return t.term;
  }
  return null;
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

function synthesizeAbout(
  conv: NormalizedConversation,
  projectName: string | null,
  topTerms: IdentityTerm[]
): { line: string; sourceQuality: 'readme' | 'definition' | 'referential' | 'templated' | 'none' } {
  const readmeAbout = aboutFromInlineReadme(conv);
  if (readmeAbout) return { line: readmeAbout, sourceQuality: 'readme' };

  if (projectName) {
    const defSentence = findDefinitionSentence(conv, projectName);
    if (defSentence) return { line: defSentence, sourceQuality: 'definition' };

    const refSentence = findReferentialSentence(conv, projectName, topTerms);
    if (refSentence) return { line: refSentence, sourceQuality: 'referential' };

    const otherTerms = topTerms
      .filter((t) => t.term !== projectName)
      .slice(0, 3)
      .map((t) => t.term);
    if (otherTerms.length > 0) {
      return {
        line: `${projectName} - project involving ${otherTerms.join(', ')}.`,
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

function aboutFromInlineReadme(conv: NormalizedConversation): string | null {
  for (const m of conv.messages) {
    for (const a of m.attachments) {
      const fn = (a.filename ?? '').toLowerCase();
      if (!fn.includes('readme')) continue;
      if (!a.inlineContent) continue;
      const para = firstNarrativeParagraph(a.inlineContent);
      if (para) return para;
    }
    for (const b of m.content) {
      if (b.type !== 'artifact') continue;
      const title = (b.title ?? '').toLowerCase();
      if (!title.includes('readme')) continue;
      const para = firstNarrativeParagraph(b.text);
      if (para) return para;
    }
  }
  return null;
}

function firstNarrativeParagraph(content: string): string | null {
  const lines = content.split('\n');
  let paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^```/.test(trimmed) || /^[-*+]\s/.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(trimmed);
    if (paragraph.join(' ').length > 200) break;
  }
  if (paragraph.length === 0) return null;
  const joined = paragraph.join(' ').slice(0, 240).trim();
  return joined.length >= 20 ? joined : null;
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
        const lower = s.toLowerCase();
        if (!lower.includes(projectName.toLowerCase())) continue;
        const matchCount = otherTerms.filter((t) => lower.includes(t)).length;
        if (matchCount >= 2 && s.length >= 30 && s.length <= 240) {
          return s.trim();
        }
      }
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
