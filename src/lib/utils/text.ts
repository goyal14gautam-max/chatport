const ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'etc.', 'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'jr.', 'sr.',
  'vs.', 'fig.', 'al.', 'no.', 'inc.', 'ltd.', 'co.', 'p.', 'pp.', 'vol.',
  'ch.', 'sec.', 'art.', 'op.', 'cit.', 'ed.', 'eds.', 'rev.', 'trans.',
]);

export function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function splitSentences(text: string): string[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];

  const blocks = splitIntoBlocks(normalized);
  const out: string[] = [];
  for (const block of blocks) {
    out.push(...splitBlockOnPunctuation(block));
  }
  return out.filter((s) => s.length > 0);
}

function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current = '';
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) blocks.push(trimmed);
    current = '';
  };
  for (const line of text.split('\n')) {
    const trimLine = line.trim();
    if (!trimLine) {
      flush();
      continue;
    }
    const bulletMatch = trimLine.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      flush();
      current = bulletMatch[1];
      flush();
      continue;
    }
    current += (current ? ' ' : '') + trimLine;
  }
  flush();
  return blocks;
}

function splitBlockOnPunctuation(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    const next = text[i + 1];
    const after = text[i + 2];
    const atEnd = i === text.length - 1;
    const looksLikeBoundary =
      atEnd ||
      (next === ' ' && (!after || /[A-Z"'(\[]/.test(after)));
    if (!looksLikeBoundary) continue;

    const lastToken = (buf.split(/\s+/).pop() ?? '').toLowerCase();
    if (ABBREVIATIONS.has(lastToken)) continue;

    out.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function truncateLines(
  text: string,
  maxLines: number
): { text: string; truncated: boolean; originalLines: number } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { text, truncated: false, originalLines: lines.length };
  }
  return {
    text: lines.slice(0, maxLines).join('\n'),
    truncated: true,
    originalLines: lines.length,
  };
}

export function stripCodeFences(text: string): string {
  return text.replace(/^```[\w-]*\n?/, '').replace(/\n?```\s*$/, '');
}

export function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
