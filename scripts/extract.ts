import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function usage(): never {
  process.stderr.write(
    'usage: tsx scripts/extract.ts <file.json> --id <conversationId> [--out file.json]\n'
  );
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const inputPath = args[0];
let wantedId: string | undefined;
let outPath: string | undefined;

for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--id') wantedId = args[++i];
  else if (a === '--out') outPath = args[++i];
  else {
    process.stderr.write(`unknown arg: ${a}\n`);
    usage();
  }
}
if (!wantedId) usage();

const raw: unknown = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));

function asArray(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') {
    const obj = x as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) return obj.conversations;
    return [x];
  }
  return [];
}

function idOf(c: unknown): string | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  return (o.conversation_id as string) ?? (o.id as string) ?? (o.uuid as string);
}

const convs = asArray(raw);
const match = convs.find((c) => idOf(c) === wantedId);

if (!match) {
  process.stderr.write(`no conversation with id=${wantedId} (searched ${convs.length})\n`);
  process.exit(1);
}

const json = JSON.stringify(match, null, 2);
if (outPath) {
  writeFileSync(resolve(outPath), json, 'utf8');
  process.stderr.write(`wrote ${json.length} chars to ${outPath}\n`);
} else {
  process.stdout.write(json + '\n');
}
