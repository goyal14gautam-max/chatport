import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../src/lib/parsers';
import { classifyConversation } from '../src/lib/pipeline/classify';
import { compress } from '../src/lib/pipeline';
import { BUDGET_CHARS } from '../src/lib/types';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
}

describe('classifyConversation', () => {
  it('classifies the coding fixture as coding', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const r = classifyConversation(conv);
    expect(r.type).toBe('coding');
  });

  it('classifies the research fixture as research', () => {
    const conv = parse(loadFixture('claude-research.json'));
    const r = classifyConversation(conv);
    expect(['research', 'mixed']).toContain(r.type);
  });

  it('returns signals for inspection', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const r = classifyConversation(conv);
    expect(r.signals.code_ratio).toBeGreaterThan(0);
  });
});

describe('compress – tldr level', () => {
  it('produces a short markdown doc within budget+tolerance', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown, meta } = compress(conv, { level: 'tldr' });
    expect(markdown).toContain('#');
    expect(meta.level).toBe('tldr');
    expect(markdown.length).toBeLessThan(BUDGET_CHARS.tldr * 4);
    expect(markdown.length).toBeGreaterThan(50);
  });

  it('always includes a header line', () => {
    const conv = parse(loadFixture('claude-research.json'));
    const { markdown } = compress(conv, { level: 'tldr' });
    expect(markdown.split('\n')[0].startsWith('# ')).toBe(true);
  });
});

describe('compress – resume level', () => {
  it('produces a fuller markdown doc that fits in resume budget+tolerance', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown, meta } = compress(conv, { level: 'resume' });
    expect(markdown.length).toBeGreaterThan(200);
    expect(markdown.length).toBeLessThan(BUDGET_CHARS.resume * 1.5);
    expect(meta.outputChars).toBe(markdown.length);
  });


  it('detects coding type and renders project-narrative sections', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown, meta } = compress(conv, { level: 'resume' });
    expect(meta.type).toBe('coding');
    expect(markdown).toMatch(/##\s+Current state/);
    expect(markdown).toMatch(/##\s+Key decisions made/);
    expect(markdown).toMatch(/##\s+Open questions \/ Next steps/);
    expect(markdown).toMatch(/##\s+Conversation metadata/);
  });

  it('renders no header fragments or stray markdown emphasis in bullets', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown } = compress(conv, { level: 'resume' });
    expect(markdown).not.toMatch(/^- #/m);
    expect(markdown).not.toMatch(/^- \*\*[A-Z][^*]+\*\*$/m);
    expect(markdown).not.toMatch(/^-\s+\*[A-Z]/m);
  });

  it('inlines a small Claude artifact verbatim (1 artifact, <2KB)', () => {
    const conv = parse(loadFixture('claude-artifacts.json'));
    const { markdown } = compress(conv, { level: 'resume' });
    expect(markdown).toContain('## Code artifacts in this conversation');
    expect(markdown).toContain('import { readFileSync');
    expect(markdown).not.toContain('const fs = require(');
  });

  it('caps any inlined code block at a sane line count', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown } = compress(conv, { level: 'resume' });
    const fenceRe = /```[\s\S]*?```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(markdown)) !== null) {
      const lineCount = match[0].split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(120);
    }
  });

  it('emits a conversation metadata footer with message count and source', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown } = compress(conv, { level: 'resume' });
    expect(markdown).toMatch(/\d+ messages/);
    expect(markdown).toMatch(/Source:\s+(ChatGPT|Claude)/);
  });
});

describe('compress – full level', () => {
  it('includes every message in source order with no budget cap', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown, meta } = compress(conv, { level: 'full' });
    expect(meta.budgetChars).toBe(Number.POSITIVE_INFINITY);
    expect(markdown).toContain('### User');
    expect(markdown).toContain('### Assistant');
  });

  it('is strictly larger than resume for the same fixture', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const resume = compress(conv, { level: 'resume' }).markdown.length;
    const full = compress(conv, { level: 'full' }).markdown.length;
    expect(full).toBeGreaterThan(resume);
  });
});

describe('compress – ordering', () => {
  it('tldr is no larger than resume', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const tldr = compress(conv, { level: 'tldr' }).markdown.length;
    const resume = compress(conv, { level: 'resume' }).markdown.length;
    expect(tldr).toBeLessThanOrEqual(resume);
  });
});

describe('compress – meta', () => {
  it('reports input/output chars and counts', () => {
    const conv = parse(loadFixture('claude-research.json'));
    const { meta } = compress(conv, { level: 'resume' });
    expect(meta.inputChars).toBeGreaterThan(0);
    expect(meta.outputChars).toBeGreaterThan(0);
    expect(typeof meta.droppedMessages).toBe('number');
  });
});

const prajnaPath = resolve(__dirname, 'fixtures', 'prajna.json');
const prajnaDescribe = existsSync(prajnaPath) ? describe : describe.skip;

function loadPrajna() {
  return parse(JSON.parse(readFileSync(prajnaPath, 'utf8')));
}

prajnaDescribe('compress – Prajna project narrative (long conversation)', () => {
  it('writes a preview file for human review at out/prajna-resume-new.md', () => {
    const { markdown, meta } = compress(loadPrajna(), { level: 'resume' });
    mkdirSync(resolve(__dirname, '..', 'out'), { recursive: true });
    writeFileSync(resolve(__dirname, '..', 'out', 'prajna-resume-new.md'), markdown, 'utf8');
    expect(meta.outputChars).toBeGreaterThan(500);
  });

  it('classifies as coding or mixed', () => {
    const r = classifyConversation(loadPrajna());
    expect(['coding', 'mixed']).toContain(r.type);
  });

  it('puts Prajna in the title', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    const firstH1 = markdown.split('\n').find((l) => l.startsWith('# '));
    expect(firstH1).toMatch(/Prajna/i);
  });

  it('emits all required project-narrative sections', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    expect(markdown).toMatch(/##\s+Current state/);
    expect(markdown).toMatch(/##\s+Key decisions made/);
    expect(markdown).toMatch(/##\s+Open questions \/ Next steps/);
    expect(markdown).toMatch(/##\s+Conversation metadata/);
  });

  it('does not include markdown header fragments inside bullets', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    expect(markdown).not.toMatch(/^- #/m);
    expect(markdown).not.toMatch(/^- \*\*?[A-Z][^*\n]{0,50}\*\*?$/m);
  });

  it('does not contain code blocks longer than 100 lines', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    const fenceRe = /```[\s\S]*?```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(markdown)) !== null) {
      const lineCount = match[0].split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(100);
    }
  });

  it('does not put a raw URL as the About/Goal line', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    const aboutLine = markdown.split('\n').find((l) => l.startsWith('**About:**'));
    if (aboutLine) {
      expect(aboutLine).not.toMatch(/https?:\/\//);
    }
  });

  it('emits Code artifacts as one-liners, not 200-line code blocks', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    const artifactsIdx = markdown.indexOf('## Code artifacts');
    if (artifactsIdx === -1) return;
    const section = markdown.slice(artifactsIdx);
    const bulletLines = section.split('\n').filter((l) => l.startsWith('- `'));
    expect(bulletLines.length).toBeGreaterThan(0);
    for (const line of bulletLines) {
      expect(line.length).toBeLessThan(200);
    }
  });

  it('fits within the resume budget with reasonable tolerance', () => {
    const { markdown } = compress(loadPrajna(), { level: 'resume' });
    expect(markdown.length).toBeLessThan(BUDGET_CHARS.resume * 1.5);
  });
});
