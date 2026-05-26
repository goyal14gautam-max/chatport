import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const inputPath = resolve(__dirname, '..', 'tests', 'fixtures', 'prajna-raw.txt');
const outPath = resolve(__dirname, '..', 'tests', 'fixtures', 'prajna.json');

const raw = readFileSync(inputPath, 'utf8');

const firstUuidIdx = raw.indexOf('"uuid":');
if (firstUuidIdx < 0) {
  process.stderr.write('No "uuid": pattern found - file does not look like Claude messages.\n');
  process.exit(1);
}

let start = firstUuidIdx;
while (start > 0 && raw[start - 1] !== '{') start--;
const usable = raw.slice(start - 1);

const candidates = [
  `[${usable}`,
  `[${usable}]`,
  usable.endsWith(']') ? `[${usable}` : `[${usable}]`,
];

let messages: unknown[] | null = null;
let lastErr = '';
for (const candidate of candidates) {
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      messages = parsed;
      break;
    }
  } catch (e) {
    lastErr = (e as Error).message;
  }
}

if (!messages) {
  let trimmed = usable;
  while (trimmed.length > 100) {
    const lastBraceIdx = trimmed.lastIndexOf('}');
    if (lastBraceIdx < 0) break;
    trimmed = trimmed.slice(0, lastBraceIdx + 1);
    try {
      const wrapped = trimmed.endsWith(']') ? `[${trimmed}` : `[${trimmed}]`;
      const parsed = JSON.parse(wrapped);
      if (Array.isArray(parsed)) {
        messages = parsed;
        process.stderr.write(`Recovered after trimming to ${trimmed.length} chars (last error: ${lastErr})\n`);
        break;
      }
    } catch {
      trimmed = trimmed.slice(0, -1);
    }
  }
}

if (!messages) {
  process.stderr.write(`Could not parse as JSON. Last error: ${lastErr}\n`);
  process.exit(1);
}

const earliest = messages
  .map((m: any) => m.created_at)
  .filter(Boolean)
  .sort()[0];
const latest = messages
  .map((m: any) => m.created_at)
  .filter(Boolean)
  .sort()
  .pop();

const claudeExport = {
  uuid: 'prajna-reconstructed',
  name: 'Prajna Project',
  created_at: earliest ?? '2026-05-16T00:00:00Z',
  updated_at: latest ?? '2026-05-19T00:00:00Z',
  model: 'claude',
  chat_messages: messages,
};

mkdirSync(resolve(__dirname, '..', 'tests', 'fixtures'), { recursive: true });
writeFileSync(outPath, JSON.stringify(claudeExport, null, 2), 'utf8');

process.stdout.write(
  `Reconstructed ${messages.length} messages -> ${outPath}\n` +
  `  Date range: ${earliest} -> ${latest}\n`
);
