import { summarizeWithinChars } from '../utils/textrank';
import { splitSentences } from '../utils/text';

export function summarizeText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const summary = summarizeWithinChars(text, maxChars);
  if (summary) return summary;
  const sentences = splitSentences(text);
  let out = '';
  for (const s of sentences) {
    if (out.length + s.length + 1 > maxChars) break;
    out += (out ? ' ' : '') + s;
  }
  return out || text.slice(0, maxChars);
}
