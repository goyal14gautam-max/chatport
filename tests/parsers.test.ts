import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFormat, parse, parseChatGPT, parseClaude } from '../src/lib/parsers';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
}

describe('detectFormat', () => {
  it('identifies a single ChatGPT conversation', () => {
    expect(detectFormat(loadFixture('chatgpt-coding.json'))).toBe('chatgpt');
  });

  it('identifies a ChatGPT export array', () => {
    expect(detectFormat(loadFixture('chatgpt-multi.json'))).toBe('chatgpt');
  });

  it('identifies a Claude conversation', () => {
    expect(detectFormat(loadFixture('claude-research.json'))).toBe('claude');
  });

  it('returns unknown for garbage', () => {
    expect(detectFormat({ foo: 'bar' })).toBe('unknown');
    expect(detectFormat(null)).toBe('unknown');
    expect(detectFormat([])).toBe('unknown');
  });
});

describe('parseChatGPT', () => {
  it('parses a single conversation into normalized form', () => {
    const conv = parseChatGPT(loadFixture('chatgpt-coding.json'));
    expect(conv.source).toBe('chatgpt');
    expect(conv.title).toBe('TypeScript build error in auth module');
    expect(conv.systemPrompt).toContain('helpful coding assistant');
    expect(conv.messages.length).toBeGreaterThan(5);
    expect(conv.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('picks newest conversation from a multi-conversation export', () => {
    const conv = parseChatGPT(loadFixture('chatgpt-multi.json'));
    expect(conv.title).toBe('Newer conversation');
  });

  it('selects a specific conversation by id', () => {
    const conv = parseChatGPT(loadFixture('chatgpt-multi.json'), 'conv-old');
    expect(conv.title).toBe('Old conversation');
  });

  it('walks the active branch from current_node', () => {
    const conv = parseChatGPT(loadFixture('chatgpt-coding.json'));
    const roles = conv.messages.map((m) => m.role);
    expect(roles[0]).toBe('user');
    expect(roles[roles.length - 1]).toBe('user');
  });

  it('extracts fenced code blocks from text into typed code blocks', () => {
    const conv = parseChatGPT(loadFixture('chatgpt-coding.json'));
    const codeBlocks = conv.messages.flatMap((m) =>
      m.content.filter((b) => b.type === 'code')
    );
    expect(codeBlocks.length).toBeGreaterThan(0);
    expect(codeBlocks.some((b) => b.type === 'code' && /function|import|class/.test(b.text))).toBe(true);
    const noFencesLeftInText = conv.messages.every((m) =>
      m.content.every((b) => !(b.type === 'text' && /```/.test(b.text)))
    );
    expect(noFencesLeftInText).toBe(true);
  });
});

describe('parseClaude', () => {
  it('parses a research conversation', () => {
    const conv = parseClaude(loadFixture('claude-research.json'));
    expect(conv.source).toBe('claude');
    expect(conv.title).toBe('Caffeine half-life research');
    expect(conv.messages.length).toBe(7);
    expect(conv.messages[0].role).toBe('user');
  });

  it('collapses artifacts to latest version only', () => {
    const conv = parseClaude(loadFixture('claude-artifacts.json'));
    const artifacts = conv.messages.flatMap((m) =>
      m.content.filter((b) => b.type === 'artifact')
    );
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]).toMatchObject({ id: 'md-export' });
    expect((artifacts[0] as { text: string }).text).toContain('import { readFileSync');
  });

  it('handles user role being "human"', () => {
    const conv = parseClaude(loadFixture('claude-research.json'));
    expect(conv.messages.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});

describe('parse dispatcher', () => {
  it('routes to chatgpt parser', () => {
    expect(parse(loadFixture('chatgpt-coding.json')).source).toBe('chatgpt');
  });

  it('routes to claude parser', () => {
    expect(parse(loadFixture('claude-research.json')).source).toBe('claude');
  });

  it('throws on unrecognized', () => {
    expect(() => parse({ random: 'object' })).toThrow(/Unrecognized/);
  });
});
