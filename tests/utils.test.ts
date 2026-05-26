import { describe, it, expect } from 'vitest';
import { splitSentences, normalize, truncateLines, estimateTokens } from '../src/lib/utils/text';
import {
  classifyAttachment,
  shouldInlineCodeFile,
  renderAttachmentPlaceholder,
  renderInlineCodeFile,
  languageHintFromFilename,
} from '../src/lib/utils/attachments';
import { summarizeWithinChars } from '../src/lib/utils/textrank';

describe('splitSentences', () => {
  it('splits a basic two-sentence string', () => {
    expect(splitSentences('Hello world. Goodbye world.')).toEqual([
      'Hello world.',
      'Goodbye world.',
    ]);
  });

  it('handles question marks and exclamations', () => {
    expect(splitSentences('Really? Yes! That works.')).toEqual([
      'Really?',
      'Yes!',
      'That works.',
    ]);
  });

  it('does not split on common abbreviations', () => {
    const out = splitSentences('We use e.g. Python here. It is great.');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('Python');
  });

  it('returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('handles a single sentence without trailing punctuation', () => {
    expect(splitSentences('hello there')).toEqual(['hello there']);
  });

  it('treats bulleted list items as separate sentences', () => {
    const text = 'Sprint plan:\n- Build parser\n- Add tests\n- Deploy';
    const out = splitSentences(text);
    expect(out).toContain('Build parser');
    expect(out).toContain('Add tests');
    expect(out).toContain('Deploy');
    expect(out.length).toBeGreaterThanOrEqual(4);
  });

  it('treats numbered list items as separate sentences', () => {
    const text = 'Steps:\n1. Open file\n2. Read content\n3. Process';
    const out = splitSentences(text);
    expect(out).toContain('Open file');
    expect(out).toContain('Read content');
    expect(out).toContain('Process');
  });

  it('keeps non-bulleted paragraphs intact', () => {
    const text = 'Hello world. This is fine.';
    expect(splitSentences(text)).toEqual(['Hello world.', 'This is fine.']);
  });
});

describe('normalize & helpers', () => {
  it('collapses internal whitespace', () => {
    expect(normalize('hello   world\n\n  there')).toBe('hello world\n\n there');
  });

  it('truncateLines reports truncation correctly', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line${i}`).join('\n');
    const r = truncateLines(text, 10);
    expect(r.truncated).toBe(true);
    expect(r.originalLines).toBe(50);
    expect(r.text.split('\n')).toHaveLength(10);
  });

  it('truncateLines passes through when under limit', () => {
    const text = 'a\nb\nc';
    const r = truncateLines(text, 10);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(text);
  });

  it('estimateTokens roughly 4 chars per token', () => {
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('classifyAttachment', () => {
  it('classifies code by extension', () => {
    expect(classifyAttachment('auth.ts')).toBe('code_file');
    expect(classifyAttachment('script.py')).toBe('code_file');
    expect(classifyAttachment('config.yaml')).toBe('code_file');
  });

  it('classifies images', () => {
    expect(classifyAttachment('photo.png')).toBe('image');
    expect(classifyAttachment('icon.SVG')).toBe('image');
  });

  it('classifies pdfs and documents', () => {
    expect(classifyAttachment('paper.pdf')).toBe('pdf');
    expect(classifyAttachment('report.docx')).toBe('document');
  });

  it('falls back to other for unknown', () => {
    expect(classifyAttachment('weird.qqq')).toBe('other');
  });

  it('uses mime type when extension is missing', () => {
    expect(classifyAttachment('blob', 'image/png')).toBe('image');
    expect(classifyAttachment('blob', 'application/pdf')).toBe('pdf');
    expect(classifyAttachment('blob', 'text/plain')).toBe('code_file');
  });
});

describe('attachment rendering', () => {
  it('inlines a small code file', () => {
    const att = {
      type: 'code_file' as const,
      filename: 'main.py',
      size: 100,
      inlineContent: 'print("hello")',
    };
    expect(shouldInlineCodeFile(att)).toBe(true);
    const md = renderInlineCodeFile(att);
    expect(md).toContain('main.py');
    expect(md).toContain('```python');
    expect(md).toContain('print("hello")');
  });

  it('produces a placeholder for non-inlinable attachments', () => {
    const md = renderAttachmentPlaceholder({
      type: 'pdf',
      filename: 'spec.pdf',
      size: 2_400_000,
    });
    expect(md).toContain('spec.pdf');
    expect(md).toContain('PDF document');
    expect(md).toContain('2.3 MB');
  });

  it('languageHintFromFilename maps common extensions', () => {
    expect(languageHintFromFilename('main.py')).toBe('python');
    expect(languageHintFromFilename('App.tsx')).toBe('tsx');
    expect(languageHintFromFilename('whatever.unknown')).toBe('');
  });
});

describe('summarizeWithinChars', () => {
  it('returns sentences fitting in budget', () => {
    const text = Array.from({ length: 8 }, (_, i) =>
      `Sentence ${i} talks about TypeScript and bundling.`
    ).join(' ');
    const summary = summarizeWithinChars(text, 60);
    expect(summary.length).toBeLessThanOrEqual(60);
    expect(summary.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    expect(summarizeWithinChars('', 100)).toBe('');
  });
});
