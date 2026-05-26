import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chatport } from '../src/lib';

const fixturePath = resolve(__dirname, '..', 'tests', 'fixtures', 'prajna.json');
const outDir = resolve(__dirname, '..', 'out');

if (!existsSync(fixturePath)) {
  process.stderr.write(
    `\nNo fixture found at tests/fixtures/prajna.json.\n` +
    `Drop the sanitized Prajna conversation JSON there, then re-run:\n` +
    `  npx tsx scripts/preview-prajna.ts\n\n`
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
mkdirSync(outDir, { recursive: true });

for (const level of ['tldr', 'resume', 'full'] as const) {
  const { markdown, meta } = chatport(raw, level);
  const outPath = resolve(outDir, `prajna-${level}-new.md`);
  writeFileSync(outPath, markdown, 'utf8');
  process.stdout.write(
    `${level.padEnd(6)} | type=${meta.type} | ${meta.inputChars.toLocaleString()} -> ${meta.outputChars.toLocaleString()} chars | dropped_msgs=${meta.droppedMessages} -> ${outPath}\n`
  );
}

process.stdout.write(
  `\nHuman-review checklist (open out/prajna-resume-new.md):\n` +
  `  [ ] H1 names the project ("Prajna")\n` +
  `  [ ] **Project:** line names Prajna and surfaces real terms (not a sub-component README)\n` +
  `  [ ] **Recent focus:** line lists concrete topics from the last 15 message pairs\n` +
  `  [ ] Current state reads as the actual recent work, not random sentences\n` +
  `  [ ] Key decisions are real decisions, no "A firm that..." fragments\n` +
  `  [ ] Code artifacts: named entries + single "Plus N inline code blocks" summary\n` +
  `  [ ] Next steps section has real action items (e.g. **PART 1:** ... **PART 2:** ...)\n` +
  `  [ ] No mojibake (no stray "â" or "Â" chars)\n`
);
