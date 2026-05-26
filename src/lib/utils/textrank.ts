import { TfIdf } from './tfidf';
import { splitSentences } from './text';

const DAMPING = 0.85;
const MAX_ITER = 30;
const CONVERGENCE = 1e-4;

export function rankSentences(text: string): Array<{ sentence: string; score: number; index: number }> {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  if (sentences.length === 1) return [{ sentence: sentences[0], score: 1, index: 0 }];

  const tfidf = new TfIdf();
  for (const s of sentences) tfidf.addDocument(s.toLowerCase());

  const n = sentences.length;
  const sim: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosineSim(tfidf, i, j);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  const outSum = sim.map((row) => row.reduce((a, b) => a + b, 0));
  let scores = Array(n).fill(1);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const next = Array(n).fill(1 - DAMPING);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || outSum[j] === 0 || sim[j][i] === 0) continue;
        next[i] += DAMPING * (scores[j] * sim[j][i]) / outSum[j];
      }
    }
    const delta = next.reduce((acc, v, i) => acc + Math.abs(v - scores[i]), 0);
    scores = next;
    if (delta < CONVERGENCE) break;
  }

  return sentences.map((sentence, index) => ({ sentence, score: scores[index], index }));
}

export function summarize(text: string, topK: number): string {
  const ranked = rankSentences(text);
  if (ranked.length <= topK) return ranked.map((r) => r.sentence).join(' ');
  const top = [...ranked].sort((a, b) => b.score - a.score).slice(0, topK);
  top.sort((a, b) => a.index - b.index);
  return top.map((r) => r.sentence).join(' ');
}

export function summarizeWithinChars(text: string, maxChars: number): string {
  const ranked = rankSentences(text);
  if (ranked.length === 0) return '';
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  const picked: typeof ranked = [];
  let used = 0;
  for (const r of sorted) {
    const cost = r.sentence.length + 1;
    if (used + cost > maxChars) continue;
    picked.push(r);
    used += cost;
  }
  picked.sort((a, b) => a.index - b.index);
  return picked.map((r) => r.sentence).join(' ');
}

function cosineSim(tfidf: TfIdf, i: number, j: number): number {
  const terms = new Set<string>();
  tfidf.listTerms(i).forEach((t) => terms.add(t.term));
  tfidf.listTerms(j).forEach((t) => terms.add(t.term));

  let dot = 0;
  let magI = 0;
  let magJ = 0;
  for (const term of terms) {
    const wi = tfidf.tfidf(term, i);
    const wj = tfidf.tfidf(term, j);
    dot += wi * wj;
    magI += wi * wi;
    magJ += wj * wj;
  }
  if (magI === 0 || magJ === 0) return 0;
  return dot / (Math.sqrt(magI) * Math.sqrt(magJ));
}
