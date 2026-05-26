import type { RenderContext } from './universal';
import { renderCoding } from './coding';

export function renderMixed(ctx: RenderContext, stats: { input: number; output: number }): string {
  return renderCoding(ctx, stats);
}
