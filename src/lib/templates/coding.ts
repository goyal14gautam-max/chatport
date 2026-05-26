import type { RenderContext } from './universal';
import {
  buildAttachmentsSummary,
  buildContext,
  buildDecisions,
  buildFooter,
  buildGoal,
  buildHeader,
  buildLatestState,
  buildNextSteps,
  buildOpenQuestions,
  normalizeBullet,
} from './universal';

const ERROR_RE = /\b(error|exception|traceback|stack trace|typeerror|valueerror|null pointer|panic|segfault)\b/i;

export function renderCoding(ctx: RenderContext, stats: { input: number; output: number }): string {
  const tried = buildWhatWasTried(ctx);
  const sections = [
    buildHeader(ctx, stats),
    buildContext(ctx),
    buildGoal(ctx),
    buildDecisions(ctx),
    tried,
    buildLatestState(ctx),
    buildOpenQuestions(ctx),
    buildNextSteps(ctx),
    buildAttachmentsSummary(ctx),
    buildFooter(),
  ].filter(Boolean);
  return sections.join('\n\n') + '\n';
}

function buildWhatWasTried(ctx: RenderContext): string {
  const errorSentences = ctx.selected
    .filter((c) => c.kind === 'sentence' && ERROR_RE.test(c.text))
    .slice(0, 5)
    .map((c) => `- ${normalizeBullet(c.text)}`);
  if (errorSentences.length === 0) return '';
  return `## What was tried\n${errorSentences.join('\n')}`;
}
