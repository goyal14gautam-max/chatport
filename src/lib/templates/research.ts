import type { RenderContext } from './universal';
import {
  buildAttachmentsSummary,
  buildContext,
  buildFooter,
  buildGoal,
  buildHeader,
  buildNextSteps,
  buildOpenQuestions,
  normalizeBullet,
} from './universal';

const CITATION_RE = /\b(according to|source:|study|paper|research|cited|published|report)\b/i;

export function renderResearch(ctx: RenderContext, stats: { input: number; output: number }): string {
  const sections = [
    buildHeader(ctx, stats),
    buildContext(ctx),
    buildGoal(ctx),
    buildFindings(ctx),
    buildOpenQuestions(ctx),
    buildNextSteps(ctx),
    buildAttachmentsSummary(ctx),
    buildFooter(),
  ].filter(Boolean);
  return sections.join('\n\n') + '\n';
}

function buildFindings(ctx: RenderContext): string {
  const candidates = ctx.selected.filter(
    (c) => c.kind === 'sentence' && c.role === 'assistant' && (CITATION_RE.test(c.text) || /\d/.test(c.text))
  );
  const findings = candidates.slice(0, 10).map((c) => `- ${normalizeBullet(c.text)}`);
  if (findings.length === 0) return '';
  return `## Findings\n${findings.join('\n')}`;
}
