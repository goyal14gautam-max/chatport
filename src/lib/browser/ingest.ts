import type { ConvSummary, Source } from '../types';
import { detectFormat, listConversations } from '../parsers';

export const MAX_BYTES = 25 * 1024 * 1024;

export interface IngestResult {
  raw: unknown;
  source: Source;
  summaries: ConvSummary[];
}

export class IngestError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = 'IngestError';
  }
}

export async function readAndIdentify(file: File): Promise<IngestResult> {
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new IngestError(
      `This file is ${mb} MB. Maximum is 25 MB. Try filtering your ChatGPT export to fewer conversations, or split the file.`
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new IngestError("Couldn't read the file. Try selecting it again.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new IngestError(
      "This file isn't valid JSON. Make sure you uploaded conversations.json — not the .zip it came in."
    );
  }

  const source = detectFormat(raw);
  if (source === 'unknown') {
    throw new IngestError(
      "This doesn't look like a ChatGPT or Claude export. Expected fields like 'mapping' (ChatGPT) or 'chat_messages' (Claude) are missing."
    );
  }

  const summaries = listConversations(raw);
  if (summaries.length === 0) {
    throw new IngestError('No conversations found in this file. Is the export complete?');
  }

  summaries.sort((a, b) => {
    const ta = Date.parse(a.createdAt ?? '') || 0;
    const tb = Date.parse(b.createdAt ?? '') || 0;
    return tb - ta;
  });

  return { raw, source, summaries };
}
