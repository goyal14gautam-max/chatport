import type {
  Candidate,
  ConversationType,
  Level,
  Message,
  NormalizedConversation,
} from '../types';
import {
  renderAttachmentPlaceholder,
  renderInlineCodeFile,
  shouldInlineCodeFile,
} from '../utils/attachments';
import { summarizeText } from '../pipeline/summarize';
import { splitSentences } from '../utils/text';

const RECOMMENDATION_RE = /\b(recommend|should\s+(?:use|go|drop|skip|stick|opt|pivot|consider|avoid|build|focus|start)|drop the|skip the|stick with|go with|opt for|pivot to|use\s+\w+\s+(?:for|to|because|instead)|win on)\b/i;
const IMPERATIVE_LEAD_RE = /^[*_\s]*(?:\d+[.)]\s+)?[*_]*(Drop|Use|Skip|Build|Output|Pivot|Focus|Win|Stick|Consider|Avoid|Replace|Adopt|Always|Never|Don'?t|Make sure|Prefer|Start)\b/i;

export interface RenderContext {
  conv: NormalizedConversation;
  type: ConversationType;
  level: Level;
  selected: Candidate[];
}

export function buildHeader(ctx: RenderContext, stats: { input: number; output: number }): string {
  const title = ctx.conv.title?.trim() || 'Conversation Handoff';
  const verb = stats.output <= stats.input ? 'Compressed' : 'Restructured';
  const meta = `**Source:** ${ctx.conv.source} · **Type:** ${ctx.type} · **${verb} ${stats.input.toLocaleString()} → ${stats.output.toLocaleString()} chars**`;
  return `# ${title}\n\n${meta}`;
}

export function buildContext(ctx: RenderContext): string {
  const { conv } = ctx;
  if (conv.systemPrompt && conv.systemPrompt.length >= 60) {
    return `## Context\n${summarizeText(conv.systemPrompt, 400)}`;
  }
  return '';
}

export function buildGoal(ctx: RenderContext): string {
  const firstUser = ctx.conv.messages.find((m) => m.role === 'user');
  if (!firstUser) return '';
  const firstText = firstUserText(firstUser);
  if (!firstText.trim()) return '';
  const sentences = splitSentences(firstText).slice(0, 2);
  if (sentences.length === 0) return '';
  if (sentences.length === 1) return `## Goal\n${sentences[0]}`;
  return `## Goal\n${sentences.map((s) => `- ${s}`).join('\n')}`;
}

function firstUserText(m: Message): string {
  return m.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? b.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDecisions(ctx: RenderContext): string {
  const seen = new Set<string>();
  const decisions: string[] = [];
  for (const c of ctx.selected) {
    if (c.kind === 'code' || c.kind === 'artifact') continue;
    const text = c.text.trim();
    if (text.length < 25) continue;
    const matchesKind = c.kind === 'decision';
    const matchesRec = RECOMMENDATION_RE.test(text);
    const matchesImp = c.role === 'assistant' && IMPERATIVE_LEAD_RE.test(text);
    if (!matchesKind && !matchesRec && !matchesImp) continue;
    const key = normalizeBullet(text).toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    decisions.push(`- ${normalizeBullet(text)}`);
    if (decisions.length >= 8) break;
  }
  if (decisions.length === 0) return '';
  return `## Key decisions\n${decisions.join('\n')}`;
}

export function buildOpenQuestions(ctx: RenderContext): string {
  const unansweredMessageIds = findUnansweredUserMessageIds(ctx.conv);
  const nextStepKey = computeNextStepKey(ctx);
  const seen = new Set<string>();
  if (nextStepKey) seen.add(nextStepKey);

  const lines: string[] = [];
  for (const c of ctx.selected) {
    if (c.kind !== 'question' || c.role !== 'user') continue;
    if (!unansweredMessageIds.has(c.messageId)) continue;
    const key = normalizeBullet(c.text).toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${normalizeBullet(c.text)}`);
    if (lines.length >= 5) break;
  }
  if (lines.length === 0) return '';
  return `## Open questions\n${lines.join('\n')}`;
}

function findUnansweredUserMessageIds(conv: RenderContext['conv']): Set<string> {
  const out = new Set<string>();
  const msgs = conv.messages;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== 'user') continue;
    const next = msgs[i + 1];
    if (!next || next.role !== 'assistant') out.add(msgs[i].id);
  }
  return out;
}

function computeNextStepKey(ctx: RenderContext): string | undefined {
  const lastUserMsg = [...ctx.conv.messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return undefined;
  const text = lastUserMsg.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? b.text : ''))
    .join(' ')
    .trim();
  if (!text) return undefined;
  return normalizeBullet(text).toLowerCase().slice(0, 80);
}

export function buildLatestState(ctx: RenderContext): string {
  const artifacts = ctx.selected.filter((c) => c.kind === 'artifact');
  if (artifacts.length > 0) {
    return [
      '## Latest state',
      ...artifacts.map((a) => renderArtifact(a)),
    ].join('\n\n');
  }
  const lastCode = [...ctx.selected].reverse().find((c) => c.kind === 'code');
  if (lastCode) {
    return `## Latest state\n\n${renderCodeCandidate(lastCode)}`;
  }
  return '';
}

export function buildNextSteps(ctx: RenderContext): string {
  const lastUserMsg = [...ctx.conv.messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) return '';
  const text = lastUserMsg.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? b.text : ''))
    .join(' ')
    .trim();
  if (!text) return '';
  const sentences = splitSentences(text).slice(0, 2);
  const lead = sentences.length > 0 ? sentences.join(' ') : text.slice(0, 300);
  return `## Next steps\n${lead}`;
}

export function buildAttachmentsSummary(ctx: RenderContext): string {
  const all = ctx.conv.messages.flatMap((m) => m.attachments);
  if (all.length === 0) return '';
  const inlined: string[] = [];
  const refs: string[] = [];
  for (const a of all) {
    if (shouldInlineCodeFile(a)) inlined.push(renderInlineCodeFile(a));
    else refs.push(renderAttachmentPlaceholder(a));
  }
  const parts: string[] = [];
  if (inlined.length > 0) parts.push(inlined.join('\n\n'));
  if (refs.length > 0) parts.push(`## Attachments\n${refs.map((r) => `- ${r}`).join('\n')}`);
  return parts.join('\n\n');
}

export function buildFooter(): string {
  return `---\n*Generated by ChatPort.*`;
}

export function renderArtifact(c: Candidate): string {
  const title = (c.metadata.title as string | undefined) ?? 'Artifact';
  const lang = c.language ?? '';
  return `### ${title}\n\n\`\`\`${lang}\n${c.text}\n\`\`\``;
}

export function renderCodeCandidate(c: Candidate): string {
  return `\`\`\`${c.language ?? ''}\n${c.text}\n\`\`\``;
}

export function normalizeBullet(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/^[-*]\s*/, '');
}
