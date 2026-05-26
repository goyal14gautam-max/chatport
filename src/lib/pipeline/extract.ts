import type {
  Candidate,
  ContentBlock,
  Message,
  NormalizedConversation,
} from '../types';
import { hash, splitSentences } from '../utils/text';

const DECISION_RE = /\b(let's|we'?ll|going to use|decided to|going with|chose|chosen|will use|plan to|i'?ll go with)\b/i;
const QUESTION_END_RE = /\?\s*$/;

export function extractCandidates(conv: NormalizedConversation): Candidate[] {
  const out: Candidate[] = [];
  const total = conv.messages.length;
  if (total === 0) return out;

  conv.messages.forEach((message, mIdx) => {
    const position = total === 1 ? 1 : mIdx / (total - 1);

    message.content.forEach((block, bIdx) => {
      out.push(...candidatesFromBlock(block, message, mIdx, bIdx, position));
    });
  });

  return out;
}

function candidatesFromBlock(
  block: ContentBlock,
  message: Message,
  mIdx: number,
  bIdx: number,
  position: number
): Candidate[] {
  if (block.type === 'text') {
    return splitSentences(block.text).map((sentence, sIdx) =>
      makeSentenceCandidate(sentence, message, mIdx, bIdx, sIdx, position)
    );
  }
  if (block.type === 'code') {
    return [
      {
        id: `${message.id}-c${bIdx}-${hash(block.text.slice(0, 200))}`,
        messageId: message.id,
        role: message.role,
        kind: 'code',
        text: block.text,
        language: block.language,
        charLen: block.text.length,
        position,
        metadata: { messageIndex: mIdx, blockIndex: bIdx },
      },
    ];
  }
  if (block.type === 'artifact') {
    return [
      {
        id: `${message.id}-a${block.id}`,
        messageId: message.id,
        role: message.role,
        kind: 'artifact',
        text: block.text,
        language: block.language,
        charLen: block.text.length,
        position,
        metadata: {
          messageIndex: mIdx,
          blockIndex: bIdx,
          artifactId: block.id,
          title: block.title,
          version: block.version,
        },
      },
    ];
  }
  return [];
}

function makeSentenceCandidate(
  sentence: string,
  message: Message,
  mIdx: number,
  bIdx: number,
  sIdx: number,
  position: number
): Candidate {
  const isUser = message.role === 'user';
  let kind: Candidate['kind'] = 'sentence';

  if (QUESTION_END_RE.test(sentence)) {
    kind = 'question';
  } else if (!isUser && DECISION_RE.test(sentence)) {
    kind = 'decision';
  } else if (isUser && DECISION_RE.test(sentence)) {
    kind = 'decision';
  }

  return {
    id: `${message.id}-s${bIdx}-${sIdx}`,
    messageId: message.id,
    role: message.role,
    kind,
    text: sentence,
    charLen: sentence.length,
    position,
    metadata: {
      messageIndex: mIdx,
      blockIndex: bIdx,
      sentenceIndex: sIdx,
    },
  };
}
