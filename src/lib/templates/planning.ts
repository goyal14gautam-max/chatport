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

const TRADEOFF_RE = /\b(tradeoff|trade-off|pros|cons|versus|vs\.|on the other hand|downside|upside)\b/i;

export function renderPlanning(ctx: RenderContext, stats: { input: number; output: number }): string {
  const sections = [
    buildHeader(ctx, stats),
    buildContext(ctx),
    buildGoal(ctx),
    buildDecisions(ctx),
    buildTradeoffs(ctx),
    buildOpenQuestions(ctx),
    buildNextSteps(ctx),
    buildAttachmentsSummary(ctx),
    buildFooter(),
  ].filter(Boolean);
  return sections.join('\n\n') + '\n';
}

function buildTradeoffs(ctx: RenderContext): string {
  const lines = ctx.selected
    .filter((c) => c.kind === 'sentence' && TRADEOFF_RE.test(c.text))
    .slice(0, 6)
    .map((c) => `- ${normalizeBullet(c.text)}`);
  if (lines.length === 0) return '';
  return `## Tradeoffs\n${lines.join('\n')}`;
}
