import type { CompressResult } from '../types';
import { loadAndCompress } from './lazyLoadPipeline';

export interface BothResults {
  resume: CompressResult;
  full: CompressResult;
}

export async function summarizeBoth(raw: unknown, conversationId: string): Promise<BothResults> {
  await tick();
  const resume = await loadAndCompress(raw, 'resume', conversationId);
  await tick();
  const full = await loadAndCompress(raw, 'full', conversationId);
  return { resume, full };
}

function tick(): Promise<void> {
  if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
