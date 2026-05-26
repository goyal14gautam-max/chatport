import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('includes the latest artifact inline for the artifacts fixture', () => {
    const conv = parse(loadFixture('claude-artifacts.json'));
    const { markdown } = compress(conv, { level: 'resume' });
    expect(markdown).toContain('import { readFileSync');
    expect(markdown).not.toContain('const fs = require(');
  });

  it('detects coding type and renders coding sections', () => {
    const conv = parse(loadFixture('chatgpt-coding.json'));
    const { markdown, meta } = compress(conv, { level: 'resume' });
    expect(meta.type).toBe('coding');
    expect(markdown).toMatch(/##\s+(Goal|Latest state|Next steps)/);
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
