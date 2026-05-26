import type {
  Attachment,
  ContentBlock,
  ConvSummary,
  Message,
  NormalizedConversation,
  Role,
} from '../types';
import { classifyAttachment } from '../utils/attachments';

interface RawClaudeMessage {
  uuid?: string;
  text?: string;
  content?: Array<RawContentBlock> | string;
  sender?: string;
  created_at?: string;
  attachments?: RawClaudeAttachment[];
  files?: RawClaudeFile[];
}

interface RawContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
}

interface RawClaudeAttachment {
  file_name?: string;
  file_size?: number;
  file_type?: string;
  extracted_content?: string;
}

interface RawClaudeFile {
  file_name?: string;
  file_size?: number;
  file_kind?: string;
}

interface RawClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages: RawClaudeMessage[];
  account?: unknown;
  model?: string;
}

const ARTIFACT_TOOLS = new Set(['artifacts', 'create_artifact', 'update_artifact', 'rewrite_artifact']);

export function listClaudeConversations(raw: unknown): ConvSummary[] {
  if (raw === null || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) {
    return raw.filter(isRawClaudeConversation).map(toClaudeSummary);
  }
  if (isRawClaudeConversation(raw)) return [toClaudeSummary(raw as RawClaudeConversation)];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.conversations)) {
    return listClaudeConversations(obj.conversations);
  }
  return [];
}

function toClaudeSummary(c: RawClaudeConversation): ConvSummary {
  return {
    id: c.uuid ?? `claude-${(c.name ?? 'untitled').slice(0, 16)}`,
    title: c.name?.trim() || 'Untitled conversation',
    createdAt: c.updated_at ?? c.created_at,
    messageCount: c.chat_messages?.length ?? 0,
  };
}

export function parseClaude(raw: unknown, conversationId?: string): NormalizedConversation {
  const conv = selectConversation(raw, conversationId);
  if (!conv) throw new Error('No Claude conversation found in input');

  const artifactState = new Map<string, { title: string; language?: string; text: string; version: number }>();
  const messages: Message[] = [];

  for (const m of conv.chat_messages) {
    const norm = normalizeMessage(m, artifactState);
    if (norm) messages.push(norm);
  }

  collapseArtifactsToLatest(messages, artifactState);

  return {
    source: 'claude',
    title: conv.name?.trim() || undefined,
    createdAt: conv.created_at,
    model: conv.model,
    messages,
  };
}

function selectConversation(raw: unknown, conversationId?: string): RawClaudeConversation | null {
  if (raw === null || typeof raw !== 'object') return null;

  if (Array.isArray(raw)) {
    const convs = raw.filter(isRawClaudeConversation);
    if (convs.length === 0) return null;
    if (conversationId) {
      return convs.find((c) => c.uuid === conversationId) ?? null;
    }
    return [...convs].sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? a.created_at ?? '') || 0;
      const tb = Date.parse(b.updated_at ?? b.created_at ?? '') || 0;
      return tb - ta;
    })[0];
  }

  if (isRawClaudeConversation(raw)) return raw as RawClaudeConversation;

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.conversations)) {
    return selectConversation(obj.conversations, conversationId);
  }
  return null;
}

function isRawClaudeConversation(x: unknown): x is RawClaudeConversation {
  if (x === null || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return Array.isArray(obj.chat_messages);
}

function normalizeMessage(
  msg: RawClaudeMessage,
  artifactState: Map<string, { title: string; language?: string; text: string; version: number }>
): Message | null {
  const role = mapRole(msg.sender);
  if (!role) return null;

  const blocks: ContentBlock[] = [];
  const attachments: Attachment[] = [];

  if (typeof msg.content === 'string' && msg.content.trim()) {
    blocks.push({ type: 'text', text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      const converted = convertBlock(block, artifactState);
      if (converted) blocks.push(...converted);
    }
  } else if (typeof msg.text === 'string' && msg.text.trim()) {
    blocks.push({ type: 'text', text: msg.text });
  }

  for (const a of msg.attachments ?? []) {
    const filename = a.file_name ?? 'attachment';
    const type = classifyAttachment(filename, a.file_type);
    attachments.push({
      type,
      filename,
      size: a.file_size,
      mimeType: a.file_type,
      inlineContent: type === 'code_file' ? a.extracted_content : undefined,
    });
  }
  for (const f of msg.files ?? []) {
    const filename = f.file_name ?? 'file';
    attachments.push({
      type: classifyAttachment(filename),
      filename,
      size: f.file_size,
    });
  }

  if (blocks.length === 0 && attachments.length === 0) return null;

  return {
    id: msg.uuid ?? `msg_${Math.random().toString(36).slice(2)}`,
    role,
    createdAt: msg.created_at,
    content: blocks,
    attachments,
  };
}

function convertBlock(
  block: RawContentBlock,
  artifactState: Map<string, { title: string; language?: string; text: string; version: number }>
): ContentBlock[] | null {
  if (!block || typeof block !== 'object') return null;

  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text.trim() ? splitTextAndCode(block.text) : null;
  }

  if (block.type === 'tool_use' && block.name && ARTIFACT_TOOLS.has(block.name)) {
    const input = block.input ?? {};
    const id = String((input as Record<string, unknown>).id ?? 'artifact');
    const title = String((input as Record<string, unknown>).title ?? id);
    const language = (input as Record<string, unknown>).language as string | undefined;
    const text = String((input as Record<string, unknown>).content ?? '');
    const prev = artifactState.get(id);
    const version = (prev?.version ?? 0) + 1;
    artifactState.set(id, { title, language, text, version });
    return [{ type: 'artifact', id, title, language, text, version }];
  }

  if (block.type === 'tool_use' && block.name) {
    return [
      { type: 'tool_use', name: block.name, inputSummary: summarizeInput(block.input) },
    ];
  }

  if (block.type === 'tool_result') {
    const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
    return [{ type: 'tool_result', outputSummary: text.slice(0, 200) }];
  }

  return null;
}

function summarizeInput(input?: Record<string, unknown>): string {
  if (!input) return '';
  const keys = Object.keys(input).slice(0, 3);
  return keys.map((k) => `${k}=${String(input[k]).slice(0, 40)}`).join(', ');
}

function collapseArtifactsToLatest(
  messages: Message[],
  artifactState: Map<string, { title: string; language?: string; text: string; version: number }>
): void {
  const latestVersion = new Map<string, number>();
  for (const [id, state] of artifactState) latestVersion.set(id, state.version);

  for (const m of messages) {
    m.content = m.content.filter((b) => {
      if (b.type !== 'artifact') return true;
      return b.version === latestVersion.get(b.id);
    });
  }
}

function splitTextAndCode(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const re = /```([\w-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) blocks.push({ type: 'text', text: before });
    blocks.push({
      type: 'code',
      language: match[1] || undefined,
      text: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }
  const after = text.slice(lastIndex).trim();
  if (after) blocks.push({ type: 'text', text: after });
  return blocks.length === 0 ? [{ type: 'text', text }] : blocks;
}

function mapRole(s?: string): Role | null {
  if (s === 'human' || s === 'user') return 'user';
  if (s === 'assistant') return 'assistant';
  if (s === 'system') return 'system';
  if (s === 'tool') return 'tool';
  return null;
}
