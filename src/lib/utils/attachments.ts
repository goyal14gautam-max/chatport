import type { Attachment, AttachmentKind } from '../types';
import { truncateLines } from './text';

export const CODE_EXTENSIONS = new Set([
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'go', 'rs', 'java', 'kt',
  'cpp', 'cc', 'cxx', 'c', 'h', 'hpp', 'hh', 'rb', 'php', 'sql', 'sh',
  'bash', 'zsh', 'fish', 'ps1', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'md', 'mdx', 'xml', 'svg', 'swift', 'lua', 'r', 'm', 'mm', 'pl', 'pm',
  'dart', 'scala', 'clj', 'cljs', 'ex', 'exs', 'erl', 'hs', 'elm', 'vue',
  'astro', 'tex', 'dockerfile', 'makefile', 'gradle', 'cmake', 'gemfile',
  'graphql', 'gql', 'proto', 'sol',
]);

export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'avif',
]);

export const PDF_EXTENSIONS = new Set(['pdf']);

export const DOC_EXTENSIONS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pages', 'numbers', 'keynote',
]);

const CODE_INLINE_BYTE_LIMIT = 20_000;
const CODE_TRUNCATE_LINES = 30;

export function classifyAttachment(filename: string, mimeType?: string): AttachmentKind {
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  const base = lower.split(/[\\/]/).pop() ?? lower;

  if (base === 'dockerfile' || base === 'makefile') return 'code_file';
  if (CODE_EXTENSIONS.has(ext)) return ext === 'svg' ? 'image' : 'code_file';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  if (DOC_EXTENSIONS.has(ext)) return 'document';

  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType.includes('javascript') ||
      mimeType.includes('typescript')
    ) {
      return 'code_file';
    }
    if (
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType.includes('powerpoint') ||
      mimeType.includes('opendocument')
    ) {
      return 'document';
    }
  }

  return 'other';
}

export function shouldInlineCodeFile(att: Attachment): boolean {
  if (att.type !== 'code_file') return false;
  if (!att.inlineContent) return false;
  if (att.size !== undefined && att.size > CODE_INLINE_BYTE_LIMIT) return false;
  return att.inlineContent.length <= CODE_INLINE_BYTE_LIMIT;
}

export function renderAttachmentPlaceholder(att: Attachment): string {
  const sizeStr = att.size ? `, ${formatBytes(att.size)}` : '';
  const label = describe(att.type);
  const name = displayFilename(att.filename) || `<unnamed ${label}>`;
  return `[Attachment: ${name} - ${label}${sizeStr}]`;
}

export function displayFilename(filename: string | undefined | null): string {
  if (!filename) return '';
  return filename.trim().replace(/^\d{10,16}_/, '');
}

export function hasUsableFilename(att: Attachment): boolean {
  return !!att.filename && att.filename.trim().length > 0;
}

export function renderInlineCodeFile(att: Attachment): string {
  if (!att.inlineContent) return renderAttachmentPlaceholder(att);
  const lang = languageHintFromFilename(att.filename);
  const { text, truncated, originalLines } = truncateLines(
    att.inlineContent,
    CODE_TRUNCATE_LINES
  );
  const tail = truncated ? `\n// ... [truncated, ${originalLines - CODE_TRUNCATE_LINES} more lines]` : '';
  const name = displayFilename(att.filename) || '<unnamed file>';
  return `**Attached file: \`${name}\`**\n\n\`\`\`${lang}\n${text}${tail}\n\`\`\``;
}

export function languageHintFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'tsx', jsx: 'jsx', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c', hpp: 'cpp', rb: 'ruby', php: 'php', sql: 'sql',
    sh: 'bash', bash: 'bash', zsh: 'bash', html: 'html', css: 'css',
    scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', mdx: 'markdown', xml: 'xml', swift: 'swift', lua: 'lua',
    r: 'r', dart: 'dart', scala: 'scala', clj: 'clojure', ex: 'elixir',
    exs: 'elixir', erl: 'erlang', hs: 'haskell', elm: 'elm', vue: 'vue',
    graphql: 'graphql', gql: 'graphql', proto: 'protobuf', sol: 'solidity',
  };
  return map[ext] ?? '';
}

function describe(kind: AttachmentKind): string {
  switch (kind) {
    case 'image': return 'image';
    case 'pdf': return 'PDF document';
    case 'document': return 'document';
    case 'code_file': return 'code file';
    case 'artifact': return 'artifact';
    case 'other': return 'file';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
