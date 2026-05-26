import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFormat, listConversations } from '../src/lib/parsers';

const path = process.argv[2];
if (!path) {
  process.stderr.write('usage: tsx scripts/list.ts <file.json>\n');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
const summaries = listConversations(raw);

process.stderr.write(`format=${detectFormat(raw)} total=${summaries.length}\n`);
console.table(summaries.slice(0, 50));
