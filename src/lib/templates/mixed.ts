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
} from './universal';

export function renderMixed(ctx: RenderContext, stats: { input: number; output: number }): string {
  const sections = [
    buildHeader(ctx, stats),
    buildContext(ctx),
    buildGoal(ctx),
    buildDecisions(ctx),
    buildLatestState(ctx),
    buildOpenQuestions(ctx),
    buildNextSteps(ctx),
    buildAttachmentsSummary(ctx),
    buildFooter(),
  ].filter(Boolean);
  return sections.join('\n\n') + '\n';
}
