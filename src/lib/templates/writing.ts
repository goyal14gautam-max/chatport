import type { RenderContext } from './universal';
import {
  buildAttachmentsSummary,
  buildContext,
  buildDecisions,
  buildFooter,
  buildGoal,
  buildHeader,
  buildNextSteps,
  buildOpenQuestions,
  normalizeBullet,
} from './universal';

const STYLE_RE = /\b(voice|tone|audience|style|narrative|persona|brand)\b/i;

export function renderWriting(ctx: RenderContext, stats: { input: number; output: number }): string {
  const sections = [
    buildHeader(ctx, stats),
    buildContext(ctx),
    buildGoal(ctx),
    buildStyleNotes(ctx),
    buildDraft(ctx),
    buildDecisions(ctx),
    buildOpenQuestions(ctx),
    buildNextSteps(ctx),
    buildAttachmentsSummary(ctx),
    buildFooter(),
  ].filter(Boolean);
  return sections.join('\n\n') + '\n';
}

function buildStyleNotes(ctx: RenderContext): string {
  const notes = ctx.selected
    .filter((c) => c.kind === 'sentence' && STYLE_RE.test(c.text))
    .slice(0, 5)
    .map((c) => `- ${normalizeBullet(c.text)}`);
  if (notes.length === 0) return '';
  return `## Style notes\n${notes.join('\n')}`;
}

function buildDraft(ctx: RenderContext): string {
  const longAssistantParagraphs = ctx.selected
    .filter((c) => c.role === 'assistant' && c.kind === 'sentence')
    .sort((a, b) => (b.metadata.messageIndex as number) - (a.metadata.messageIndex as number));
  if (longAssistantParagraphs.length === 0) return '';
  const latestMessageId = longAssistantParagraphs[0].messageId;
  const latest = ctx.selected
    .filter((c) => c.messageId === latestMessageId && c.kind !== 'code')
    .sort((a, b) => (a.metadata.sentenceIndex as number) - (b.metadata.sentenceIndex as number))
    .map((c) => c.text)
    .join(' ');
  if (!latest.trim()) return '';
  return `## Current draft\n${latest}`;
}
