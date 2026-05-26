import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chatport } from '../src/lib';
import type { Level } from '../src/lib/types';

function usage(): never {
  process.stderr.write(
    'usage: tsx scripts/cli.ts <input.json> [tldr|resume|full] [--out file.md] [--id <conversationId>]\n'
  );
  process.exit(2);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const inputPath = args[0];
  let level: Level = 'resume';
  let outPath: string | undefined;
  let conversationId: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === 'tldr' || a === 'resume' || a === 'full') {
      level = a;
    } else if (a === '--out') {
      outPath = args[++i];
    } else if (a === '--id') {
      conversationId = args[++i];
    } else {
      process.stderr.write(`unknown arg: ${a}\n`);
      usage();
    }
  }

  const raw = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
  const { markdown, meta } = chatport(raw, level, conversationId);

  process.stderr.write(
    `type=${meta.type} level=${meta.level} ${meta.inputChars}→${meta.outputChars} chars (budget=${meta.budgetChars === Infinity ? '∞' : meta.budgetChars}) dropped_msgs=${meta.droppedMessages} dropped_attachments=${meta.droppedAttachments}\n`
  );

  if (outPath) {
    writeFileSync(resolve(outPath), markdown, 'utf8');
    process.stderr.write(`wrote ${outPath}\n`);
  } else {
    process.stdout.write(markdown);
  }
}

main();
