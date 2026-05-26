import type { ConversationType, NormalizedConversation, Message } from '../types';

export interface ClassifyResult {
  type: ConversationType;
  confidence: number;
  signals: Record<string, number>;
  scores: Record<ConversationType, number>;
}

const MIXED_MARGIN = 0.15;

const IMPERATIVE_VERBS = /\b(write|build|create|make|fix|debug|refactor|implement|add|remove|update|change|generate|design)\b/gi;
const STYLE_WORDS = /\b(voice|tone|audience|style|narrative|prose|draft|essay|copy|brand|persona|story)\b/gi;
const CITATION_WORDS = /\b(according to|source:|cited|citation|paper|study|research(es|ed)?|reference|evidence|published)\b/gi;
const DECISION_WORDS = /\b(decide(d)?|decision|tradeoff|trade-off|pros and cons|deadline|stakeholder|milestone|roadmap|priorit(y|ies|ize)|risk)\b/gi;
const IDEATION_WORDS = /\b(thinking of (building|making|creating|doing)|what do you think|would (this|that) work|i was thinking|want me to (draft|write|build|design)|i'?d (build|make|create)|let me know what you think|sound (good|right))\b/gi;
const ERROR_WORDS = /\b(error|exception|traceback|stack trace|typeerror|valueerror|null pointer|undefined is not|cannot read|panic|segfault)\b/gi;
const FILENAME_RE = /(?:^|\s)([./\w-]+\.(?:py|js|mjs|cjs|ts|tsx|jsx|go|rs|java|kt|cpp|c|h|rb|php|sql|sh|html|css|json|yaml|yml|toml|md))\b/gi;
const QUESTION_RE = /\?/g;
const FUTURE_TENSE = /\b(will|going to|plan to|next week|tomorrow|by (mon|tue|wed|thu|fri|sat|sun)|q[1-4]|sprint|launch)\b/gi;

export function classifyConversation(conv: NormalizedConversation): ClassifyResult {
  const allText = collectText(conv.messages);
  const userText = collectText(conv.messages.filter((m) => m.role === 'user'));
  const userMsgs = conv.messages.filter((m) => m.role === 'user');

  const totalChars = allText.length || 1;
  const codeChars = sumCodeChars(conv.messages);
  const codeRatio = codeChars / totalChars;

  const avgUserLen =
    userMsgs.length === 0
      ? 0
      : userMsgs.reduce((a, m) => a + plainLength(m), 0) / userMsgs.length;
  const userQuestionCount = (userText.match(QUESTION_RE) ?? []).length;
  const questionDensity = userMsgs.length ? userQuestionCount / userMsgs.length : 0;

  const per1000 = (n: number) => (n * 1000) / totalChars;

  const signals = {
    code_ratio: codeRatio,
    avg_user_len: avgUserLen,
    question_density: questionDensity,
    imperative: per1000(matchCount(userText, IMPERATIVE_VERBS)),
    style: per1000(matchCount(allText, STYLE_WORDS)),
    citation: per1000(matchCount(allText, CITATION_WORDS)),
    decision: per1000(matchCount(allText, DECISION_WORDS)),
    ideation: per1000(matchCount(allText, IDEATION_WORDS)),
    error: per1000(matchCount(allText, ERROR_WORDS)),
    filename: per1000(matchCount(allText, FILENAME_RE)),
    future_tense: per1000(matchCount(allText, FUTURE_TENSE)),
  };

  const scores: Record<ConversationType, number> = {
    coding:
      clamp(signals.code_ratio * 4) * 1.0 +
      clamp(signals.error / 2) * 0.8 +
      clamp(signals.filename / 2) * 0.7 +
      clamp(signals.imperative / 5) * 0.5 -
      clamp(signals.avg_user_len / 800) * 0.2,
    writing:
      clamp(signals.avg_user_len / 800) * 0.6 +
      clamp(signals.style / 2) * 1.0 +
      clamp(signals.imperative / 5) * 0.3 -
      clamp(signals.code_ratio * 4) * 0.5,
    research:
      clamp(signals.question_density / 2) * 0.5 +
      clamp(signals.citation / 2) * 1.0 +
      clamp(signals.avg_user_len / 600) * 0.4,
    planning:
      clamp(signals.decision / 2) * 1.0 +
      clamp(signals.ideation / 2) * 0.9 +
      clamp(signals.future_tense / 3) * 0.5 +
      clamp(signals.imperative / 5) * 0.3,
    mixed: 0,
  };

  const ordered = (Object.entries(scores) as Array<[ConversationType, number]>)
    .filter(([t]) => t !== 'mixed')
    .sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ordered[0];
  const secondScore = ordered[1]?.[1] ?? 0;

  let type: ConversationType = topType;
  if (topScore < 0.2) type = 'mixed';
  else if (topScore - secondScore < MIXED_MARGIN) type = 'mixed';

  const confidence = topScore === 0 ? 0 : (topScore - secondScore) / topScore;

  return { type, confidence, signals, scores };
}

function collectText(messages: Message[]): string {
  return messages
    .flatMap((m) => m.content.map((b) => ('text' in b ? b.text : '')))
    .join('\n');
}

function sumCodeChars(messages: Message[]): number {
  let n = 0;
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === 'code' || b.type === 'artifact') n += b.text.length;
    }
  }
  return n;
}

function plainLength(m: Message): number {
  let n = 0;
  for (const b of m.content) {
    if ('text' in b && b.type === 'text') n += b.text.length;
  }
  return n;
}

function matchCount(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function clamp(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
