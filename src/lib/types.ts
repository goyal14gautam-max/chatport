export type Level = 'tldr' | 'resume' | 'full';

export type ConversationType = 'coding' | 'writing' | 'research' | 'planning' | 'mixed';

export type Source = 'chatgpt' | 'claude';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'document'
  | 'code_file'
  | 'artifact'
  | 'other';

export interface Attachment {
  type: AttachmentKind;
  filename: string;
  size?: number;
  mimeType?: string;
  inlineContent?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; language?: string; text: string }
  | {
      type: 'artifact';
      id: string;
      title: string;
      language?: string;
      text: string;
      version: number;
    }
  | { type: 'tool_use'; name: string; inputSummary: string }
  | { type: 'tool_result'; outputSummary: string };

export interface Message {
  id: string;
  role: Role;
  createdAt?: string;
  edited?: boolean;
  parentId?: string;
  content: ContentBlock[];
  attachments: Attachment[];
}

export interface NormalizedConversation {
  source: Source;
  title?: string;
  createdAt?: string;
  model?: string;
  systemPrompt?: string;
  messages: Message[];
}

export type CandidateKind =
  | 'sentence'
  | 'code'
  | 'artifact'
  | 'decision'
  | 'question'
  | 'fact';

export interface Candidate {
  id: string;
  messageId: string;
  role: Role;
  kind: CandidateKind;
  text: string;
  language?: string;
  charLen: number;
  position: number;
  metadata: Record<string, unknown>;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  alwaysKeep: boolean;
}

export interface CompressionMeta {
  type: ConversationType;
  level: Level;
  inputChars: number;
  outputChars: number;
  budgetChars: number;
  droppedMessages: number;
  droppedAttachments: number;
}

export interface CompressResult {
  markdown: string;
  meta: CompressionMeta;
}

export const BUDGET_CHARS: Record<Level, number> = {
  tldr: 1_000,
  resume: 9_000,
  full: Number.POSITIVE_INFINITY,
};

export interface ConvSummary {
  id: string;
  title: string;
  createdAt?: string;
  messageCount: number;
}
