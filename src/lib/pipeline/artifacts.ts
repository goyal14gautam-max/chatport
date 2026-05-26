import type { ContentBlock, Message, NormalizedConversation } from '../types';
import {
  displayFilename,
  languageHintFromFilename,
} from '../utils/attachments';

export interface ArtifactSummary {
  displayName: string;
  description: string;
  language: string;
  loc: number;
  charLen: number;
  inlineContent?: string;
  source: 'attachment' | 'claude-artifact' | 'inline-code';
}

const ROLE_HINTS: Array<[RegExp, string]> = [
  [/(?:^|[_\-/])(spider|scraper|crawler)(?:[_\-/]|$)/i, 'scraper'],
  [/(?:^|[_\-/])(parser|lexer|tokenizer)(?:[_\-/]|$)/i, 'parser'],
  [/(?:^|[_\-/])(route|router|controller|handler|endpoint)(?:[_\-/s]|$)/i, 'HTTP handler'],
  [/(?:^|[_\-/])(model|schema|entity)(?:[_\-/s]|$)/i, 'data model'],
  [/(?:^|[_\-/])(migration|migrate)(?:[_\-/s]|$)/i, 'DB migration'],
  [/(?:^|[_\-/])(pipeline|pipelines)(?:[_\-/]|$)/i, 'data pipeline'],
  [/(?:^|[_\-/])(test|tests|spec|specs)(?:[_\-/.]|$)/i, 'test'],
  [/(?:^|[_\-/])(util|utils|helper|helpers)(?:[_\-/]|$)/i, 'utility'],
  [/(?:^|[_\-/])(config|settings|conf)(?:[_\-/.]|$)/i, 'config'],
  [/(?:^|[_\-/])(cli|main|index|app|server)\./i, 'entry point'],
  [/(?:^|[_\-/])(middleware)(?:[_\-/]|$)/i, 'middleware'],
  [/(?:^|[_\-/])(component|components)(?:[_\-/]|$)/i, 'component'],
  [/\.ya?ml$/i, 'config'],
  [/\.dockerfile$|^Dockerfile$/i, 'Docker config'],
  [/\.md$/i, 'documentation'],
  [/\.sql$/i, 'SQL'],
];

const FRAMEWORK_SIGS: Array<[RegExp, string]> = [
  [/^import\s+scrapy|^from\s+scrapy/m, 'Scrapy'],
  [/^from\s+flask\b/m, 'Flask'],
  [/^from\s+fastapi\b/m, 'FastAPI'],
  [/^from\s+django\b/m, 'Django'],
  [/import\s+\{[^}]*(useState|useEffect|useMemo)[^}]*\}\s+from\s+['"]react/m, 'React'],
  [/^import\s+express\b|require\(['"]express['"]\)/m, 'Express'],
  [/^from\s+supabase\b|createClient\(\s*['"]https?:\/\/[^'"]+\.supabase/m, 'Supabase'],
  [/^from\s+sqlalchemy\b/m, 'SQLAlchemy'],
  [/^from\s+pydantic\b/m, 'Pydantic'],
  [/^from\s+pandas\b|^import\s+pandas\b/m, 'pandas'],
  [/^from\s+numpy\b|^import\s+numpy\b/m, 'numpy'],
  [/^from\s+langchain\b/m, 'LangChain'],
  [/^from\s+openai\b|^import\s+openai\b/m, 'OpenAI SDK'],
  [/^from\s+anthropic\b|^import\s+anthropic\b/m, 'Anthropic SDK'],
  [/import\s+\{[^}]*\}\s+from\s+['"]next\//m, 'Next.js'],
  [/^use\s+actions\/checkout/m, 'GitHub Actions'],
  [/^name:\s+.+\non:\s+/m, 'GitHub Actions'],
];

export function summarizeArtifacts(conv: NormalizedConversation): ArtifactSummary[] {
  const summaries: ArtifactSummary[] = [];
  const seen = new Set<string>();

  for (const msg of conv.messages) {
    for (const att of msg.attachments) {
      if (att.type !== 'code_file') continue;
      if (!att.inlineContent && !att.filename) continue;
      const name = displayFilename(att.filename);
      if (!name) continue;
      const key = `att:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const content = att.inlineContent ?? '';
      summaries.push(buildSummary(name, content, 'attachment', att.size));
    }

    for (const block of msg.content) {
      if (block.type === 'artifact') {
        const name = block.title || 'artifact';
        const key = `art:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        summaries.push(buildSummary(name, block.text, 'claude-artifact'));
      }
    }
  }

  const largeInlineBlocks = findLargeInlineCodeBlocks(conv);
  for (const block of largeInlineBlocks) {
    const name = block.guessedName;
    const key = `inline:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summaries.push(buildSummary(name, block.text, 'inline-code'));
  }

  return summaries;
}

interface LargeInline {
  guessedName: string;
  text: string;
}

function findLargeInlineCodeBlocks(conv: NormalizedConversation): LargeInline[] {
  const out: LargeInline[] = [];
  conv.messages.forEach((msg, mIdx) => {
    if (mIdx === 0) return;
    msg.content.forEach((block, bIdx) => {
      if (block.type !== 'code') return;
      const lines = block.text.split('\n').length;
      if (lines < 40) return;
      const guessedName = guessNameForInlineCode(conv, msg, mIdx, bIdx, block);
      out.push({ guessedName, text: block.text });
    });
  });
  return out;
}

function guessNameForInlineCode(
  conv: NormalizedConversation,
  msg: Message,
  mIdx: number,
  bIdx: number,
  block: ContentBlock & { type: 'code' }
): string {
  if (mIdx > 0) {
    const prev = conv.messages[mIdx - 1];
    if (prev?.role === 'user') {
      for (const pb of prev.content) {
        if (pb.type !== 'text') continue;
        const nameMatch = pb.text.match(/\b([\w-]+\.(?:py|js|ts|tsx|jsx|go|rs|java|cpp|c|rb|php|sql|sh|html|css|json|yaml|yml|toml|md))\b/);
        if (nameMatch) return nameMatch[1];
      }
    }
  }

  const head = block.text.split('\n').slice(0, 5).join('\n');
  const declMatch =
    head.match(/^class\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^def\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^function\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z_][\w]*)/m);
  if (declMatch) return `${declMatch[1]}()`;

  const lang = block.language ?? 'code';
  return `inline ${lang} #${mIdx}`;
}

function buildSummary(
  name: string,
  content: string,
  source: ArtifactSummary['source'],
  declaredSize?: number
): ArtifactSummary {
  const language = languageHintFromFilename(name) || 'code';
  const loc = content ? content.split('\n').length : 0;
  const charLen = declaredSize ?? content.length;

  const description = describeArtifact(name, content, language, loc);

  return {
    displayName: name,
    description,
    language,
    loc,
    charLen,
    inlineContent: content || undefined,
    source,
  };
}

function describeArtifact(name: string, content: string, language: string, loc: number): string {
  const fromHeader = extractLeadingComment(content, language);
  if (fromHeader) {
    return truncateDescription(fromHeader);
  }

  const role = roleHintFromFilename(name);
  const framework = frameworkSignatureFromContent(content);
  const declaration = topDeclaration(content);

  const parts: string[] = [];
  if (framework) parts.push(framework);
  if (role) parts.push(role);
  if (declaration) parts.push(`defines ${declaration}`);

  if (parts.length > 0) {
    const body = parts.join(' ');
    if (loc > 0 && !framework && !role) return truncateDescription(`${capitalizeLanguage(language)} module, ${body}, ${loc} LOC`);
    return truncateDescription(body);
  }

  if (loc > 0) return `${capitalizeLanguage(language)} module, ${loc} LOC`;
  return capitalizeLanguage(language);
}

function capitalizeLanguage(language: string): string {
  if (!language || language === 'code') return 'Code';
  if (language === language.toLowerCase()) {
    return language.charAt(0).toUpperCase() + language.slice(1);
  }
  return language;
}

function extractLeadingComment(content: string, language: string): string | null {
  if (!content) return null;
  const trimmed = content.replace(/^#!.*\n/, '');
  if (language === 'python') {
    const docstring = trimmed.match(/^\s*"""([\s\S]+?)"""/);
    if (docstring) return firstSentence(docstring[1]);
    const hashBlock = trimmed.match(/^(?:#[^\n]*\n){1,5}/);
    if (hashBlock) {
      const cleaned = hashBlock[0].replace(/^#\s?/gm, '').trim();
      return firstSentence(cleaned);
    }
  } else if (language === 'markdown') {
    const lines = trimmed.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) continue;
      return firstSentence(t);
    }
  } else {
    const block = trimmed.match(/^\s*\/\*+([\s\S]+?)\*\//);
    if (block) {
      const cleaned = block[1].replace(/^[\s*]+/gm, '').trim();
      return firstSentence(cleaned);
    }
    const lineComments = trimmed.match(/^(?:\/\/[^\n]*\n){1,5}/);
    if (lineComments) {
      const cleaned = lineComments[0].replace(/^\/\/\s?/gm, '').trim();
      return firstSentence(cleaned);
    }
    const yamlComments = trimmed.match(/^(?:#[^\n]*\n){1,3}/);
    if (yamlComments && /\.ya?ml|Dockerfile|Makefile/.test(language) === false) {
      const cleaned = yamlComments[0].replace(/^#\s?/gm, '').trim();
      if (cleaned.length > 5) return firstSentence(cleaned);
    }
  }
  return null;
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^[^.!?\n]{8,180}[.!?]?/);
  if (match) return match[0].trim();
  return cleaned.slice(0, 120).trim();
}

function roleHintFromFilename(name: string): string {
  for (const [re, hint] of ROLE_HINTS) {
    if (re.test(name)) return hint;
  }
  return '';
}

function frameworkSignatureFromContent(content: string): string {
  if (!content) return '';
  const head = content.split('\n').slice(0, 50).join('\n');
  for (const [re, label] of FRAMEWORK_SIGS) {
    if (re.test(head)) return label;
  }
  return '';
}

function topDeclaration(content: string): string {
  if (!content) return '';
  const head = content.split('\n').slice(0, 30).join('\n');
  const match =
    head.match(/^class\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type)\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^def\s+([A-Za-z_][\w]*)/m) ??
    head.match(/^function\s+([A-Za-z_][\w]*)/m);
  return match ? `\`${match[1]}\`` : '';
}

function truncateDescription(s: string): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 110) return cleaned;
  return cleaned.slice(0, 107).replace(/\s\S*$/, '') + '...';
}

export interface ArtifactInlineDecision {
  inlineAll: boolean;
  artifacts: ArtifactSummary[];
}

export function decideArtifactInlining(
  artifacts: ArtifactSummary[],
  inlineThresholdChars = 2000
): ArtifactInlineDecision {
  if (artifacts.length === 0 || artifacts.length > 2) {
    return { inlineAll: false, artifacts };
  }
  const total = artifacts.reduce((a, s) => a + (s.inlineContent?.length ?? 0), 0);
  return { inlineAll: total < inlineThresholdChars, artifacts };
}
