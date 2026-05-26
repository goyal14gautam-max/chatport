import type {
  Attachment,
  ContentBlock,
  ConvSummary,
  Message,
  NormalizedConversation,
  Role,
} from '../types';
import { normalize } from '../utils/text';

interface RawNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: RawMessage | null;
}

interface RawMessage {
  id?: string;
  author?: { role?: string; name?: string | null };
  create_time?: number | null;
  update_time?: number | null;
  content?: RawContent;
  metadata?: Record<string, unknown>;
}

interface RawContent {
  content_type?: string;
  parts?: Array<unknown>;
  text?: string;
  language?: string;
}

interface RawConversation {
  title?: string;
  create_time?: number;
  update_time?: number;
  mapping: Record<string, RawNode>;
  current_node?: string;
  conversation_id?: string;
  id?: string;
  default_model_slug?: string;
}

export function listChatGPTConversations(raw: unknown): ConvSummary[] {
  if (raw === null || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) {
    return raw.filter(isRawConversation).map(toChatGPTSummary);
  }
  if (isRawConversation(raw)) return [toChatGPTSummary(raw as RawConversation)];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.conversations)) {
    return listChatGPTConversations(obj.conversations);
  }
  return [];
}

function toChatGPTSummary(c: RawConversation): ConvSummary {
  let messageCount = 0;
  for (const node of Object.values(c.mapping)) {
    if (node?.message && node.message.author?.role !== 'system') messageCount++;
  }
  return {
    id: c.conversation_id ?? c.id ?? `chatgpt-${(c.title ?? 'untitled').slice(0, 16)}`,
    title: c.title?.trim() || 'Untitled conversation',
    createdAt: tsToIso(c.update_time ?? c.create_time),
    messageCount,
  };
}

export function parseChatGPT(raw: unknown, conversationId?: string): NormalizedConversation {
  const conv = selectConversation(raw, conversationId);
  if (!conv) throw new Error('No ChatGPT conversation found in input');

  const messages = walkActiveBranch(conv);
  const { systemPrompt, rest } = liftSystemPrompt(messages);

  return {
    source: 'chatgpt',
    title: conv.title?.trim() || undefined,
    createdAt: tsToIso(conv.create_time),
    model: conv.default_model_slug,
    systemPrompt,
    messages: rest,
  };
}

function selectConversation(raw: unknown, conversationId?: string): RawConversation | null {
  if (raw === null || typeof raw !== 'object') return null;

  if (Array.isArray(raw)) {
    const convs = raw.filter(isRawConversation);
    if (convs.length === 0) return null;
    if (conversationId) {
      return (
        convs.find((c) => c.conversation_id === conversationId || c.id === conversationId) ?? null
      );
    }
    return [...convs].sort(
      (a, b) => (b.update_time ?? b.create_time ?? 0) - (a.update_time ?? a.create_time ?? 0)
    )[0];
  }

  if (isRawConversation(raw)) return raw as RawConversation;

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.conversations)) {
    return selectConversation(obj.conversations, conversationId);
  }
  return null;
}

function isRawConversation(x: unknown): x is RawConversation {
  if (x === null || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return typeof obj.mapping === 'object' && obj.mapping !== null;
}

function walkActiveBranch(conv: RawConversation): Message[] {
  const { mapping, current_node } = conv;
  const leaf = current_node ?? findLeaf(mapping);
  if (!leaf) return [];

  const chain: string[] = [];
  let cursor: string | undefined = leaf;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(cursor);
    cursor = mapping[cursor]?.parent ?? undefined;
  }
  chain.reverse();

  const out: Message[] = [];
  for (const id of chain) {
    const node = mapping[id];
    const msg = node?.message;
    if (!msg) continue;
    const normalized = normalizeMessage(msg, id);
    if (normalized) out.push(normalized);
  }
  return out;
}

function findLeaf(mapping: Record<string, RawNode>): string | undefined {
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.children || node.children.length === 0) {
      if (node.message) return id;
    }
  }
  return Object.keys(mapping).pop();
}

function normalizeMessage(msg: RawMessage, fallbackId: string): Message | null {
  const role = mapRole(msg.author?.role);
  if (!role) return null;

  const { content, attachments } = parseContent(msg.content);
  if (content.length === 0 && attachments.length === 0) return null;

  return {
    id: msg.id ?? fallbackId,
    role,
    createdAt: tsToIso(msg.create_time ?? undefined),
    content,
    attachments,
  };
}

function mapRole(r?: string): Role | null {
  if (r === 'user') return 'user';
  if (r === 'assistant') return 'assistant';
  if (r === 'system') return 'system';
  if (r === 'tool') return 'tool';
  return null;
}

function parseContent(raw?: RawContent): { content: ContentBlock[]; attachments: Attachment[] } {
  if (!raw) return { content: [], attachments: [] };

  const blocks: ContentBlock[] = [];
  const attachments: Attachment[] = [];

  const ct = raw.content_type;

  if (ct === 'text' || ct === undefined) {
    const text = collectTextParts(raw.parts);
    if (text.trim()) blocks.push(...splitTextAndCode(text));
    return { content: blocks, attachments };
  }

  if (ct === 'code') {
    const text = raw.text ?? collectTextParts(raw.parts);
    if (text.trim()) blocks.push({ type: 'code', language: raw.language, text });
    return { content: blocks, attachments };
  }

  if (ct === 'multimodal_text') {
    const parts = raw.parts ?? [];
    const textBuf: string[] = [];
    for (const p of parts) {
      if (typeof p === 'string') {
        textBuf.push(p);
        continue;
      }
      if (p && typeof p === 'object') {
        const obj = p as Record<string, unknown>;
        if (typeof obj.text === 'string') textBuf.push(obj.text);
        if (obj.content_type === 'image_asset_pointer' || obj.asset_pointer) {
          const filename =
            (typeof obj.metadata === 'object' && (obj.metadata as Record<string, unknown>)?.filename) as
              | string
              | undefined ?? `image_${attachments.length + 1}`;
          attachments.push({
            type: 'image',
            filename: String(filename),
            size: typeof obj.size_bytes === 'number' ? obj.size_bytes : undefined,
          });
        }
      }
    }
    const joined = normalize(textBuf.join('\n'));
    if (joined) blocks.push({ type: 'text', text: joined });
    return { content: blocks, attachments };
  }

  const fallbackText =
    raw.text ?? (typeof raw.parts !== 'undefined' ? collectTextParts(raw.parts) : '');
  if (fallbackText.trim()) blocks.push(...splitTextAndCode(fallbackText));
  return { content: blocks, attachments };
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

function collectTextParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string') {
        return (p as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function liftSystemPrompt(messages: Message[]): {
  systemPrompt?: string;
  rest: Message[];
} {
  if (messages.length === 0 || messages[0].role !== 'system') return { rest: messages };
  const first = messages[0];
  const text = first.content
    .map((b) => ('text' in b ? b.text : ''))
    .join('\n')
    .trim();
  if (!text || text.length < 20) return { rest: messages.slice(1) };
  return { systemPrompt: text, rest: messages.slice(1) };
}

function tsToIso(ts?: number): string | undefined {
  if (typeof ts !== 'number' || !isFinite(ts)) return undefined;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toISOString();
}
