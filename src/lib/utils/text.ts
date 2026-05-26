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

export function asciiize(s: string): string {
  if (!s) return '';
  return s
    .replace(/[—–―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/·/g, '|')
    .replace(/•/g, '-')
    .replace(/[─-╿]/g, '-');
}

export function stripMarkdown(s: string): string {
  if (!s) return '';
  let out = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(\s|^)\*+/g, '$1')
    .replace(/\*+(?=\s|$)/g, '')
    .replace(/(\s|^)_+/g, '$1')
    .replace(/_+(?=\s|$)/g, '');
  out = asciiize(out);
  out = out.replace(/[ \t]+/g, ' ').trim();
  return out;
}

export function looksLikeSectionHeader(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.length > 80) return false;
  const lastChar = t[t.length - 1];
  if (lastChar === '.' || lastChar === '!' || lastChar === '?') return false;
  const first = t[0];
  if (first !== first.toUpperCase()) return false;
  return true;
}

export function stripUrls(s: string): string {
  return s.replace(/https?:\/\/\S+/g, ' ').replace(/[ \t]+/g, ' ');
}

export function urlRatio(s: string): number {
  if (!s) return 0;
  const urls = s.match(/https?:\/\/\S+/g) ?? [];
  const urlChars = urls.reduce((a, u) => a + u.length, 0);
  return urlChars / s.length;
}
