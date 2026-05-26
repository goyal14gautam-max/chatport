import { describe, it, expect } from 'vitest';
import {
  decodeReactRouterStream,
  detectPlatformFromUrl,
  extractStreamPayload,
  findChatGPTConversationData,
  parseChatGPTShareUrl,
} from '../src/lib/scrapers';

describe('parseChatGPTShareUrl', () => {
  it('parses the canonical chatgpt.com format', () => {
    const r = parseChatGPTShareUrl('https://chatgpt.com/share/6a1535b9-ccbc-8323-a465-9442327a7c72');
    expect(r).toMatchObject({
      shareId: '6a1535b9-ccbc-8323-a465-9442327a7c72',
      canonicalUrl: 'https://chatgpt.com/share/6a1535b9-ccbc-8323-a465-9442327a7c72',
    });
  });

  it('accepts the legacy chat.openai.com format and canonicalizes', () => {
    const r = parseChatGPTShareUrl('https://chat.openai.com/share/abc12345-def0-1234-5678-9abcdef01234');
    expect(r?.canonicalUrl).toBe('https://chatgpt.com/share/abc12345-def0-1234-5678-9abcdef01234');
  });

  it('rejects non-share URLs', () => {
    expect(parseChatGPTShareUrl('https://chatgpt.com/c/abc')).toBeNull();
    expect(parseChatGPTShareUrl('https://example.com/share/abc-def-ghi-jkl-mno')).toBeNull();
  });

  it('rejects garbage and empty input', () => {
    expect(parseChatGPTShareUrl('not a url')).toBeNull();
    expect(parseChatGPTShareUrl('')).toBeNull();
  });

  it('trims whitespace', () => {
    const r = parseChatGPTShareUrl('  https://chatgpt.com/share/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee  ');
    expect(r?.shareId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});

describe('detectPlatformFromUrl', () => {
  it('detects chatgpt share links', () => {
    expect(detectPlatformFromUrl('https://chatgpt.com/share/foo-bar-baz-qux-quux')).toBe('chatgpt');
    expect(detectPlatformFromUrl('https://chat.openai.com/share/foo-bar-baz-qux-quux')).toBe('chatgpt');
  });

  it('detects claude share links', () => {
    expect(detectPlatformFromUrl('https://claude.ai/share/foo-bar-baz-qux-quux')).toBe('claude');
  });

  it('returns unsupported for non-share URLs', () => {
    expect(detectPlatformFromUrl('https://chatgpt.com/c/abc')).toBe('unsupported');
    expect(detectPlatformFromUrl('https://claude.ai/chats/123')).toBe('unsupported');
    expect(detectPlatformFromUrl('https://example.com/share/anything')).toBe('unsupported');
    expect(detectPlatformFromUrl('not a url')).toBe('unsupported');
  });
});

describe('extractStreamPayload', () => {
  it('extracts and unescapes a single enqueue chunk', () => {
    const html = `<script>window.__reactRouterContext.streamController.enqueue("[\\"a\\",\\"b\\"]")</script>`;
    expect(extractStreamPayload(html)).toBe('["a","b"]');
  });

  it('concatenates multiple enqueue chunks in order', () => {
    const html = `
      <script>streamController.enqueue("[\\"a\\"]")</script>
      <script>streamController.enqueue("\\nP1:[{}]")</script>
    `;
    const payload = extractStreamPayload(html);
    expect(payload).toContain('["a"]');
    expect(payload).toContain('P1:[{}]');
  });

  it('returns empty string when no enqueue calls present', () => {
    expect(extractStreamPayload('<html><body>hi</body></html>')).toBe('');
  });
});

describe('decodeReactRouterStream', () => {
  it('resolves a flat array with index-keyed objects into a tree', () => {
    const payload = '[{"_1":2},"hello",{"_3":4},"nested","value"]';
    const decoded = decodeReactRouterStream(payload);
    expect(decoded).toEqual({ hello: { nested: 'value' } });
  });

  it('skips promise-resolution chunks like P5:[{}]', () => {
    const payload = '[{"_1":2},"k","v"]\nP5:[{}]';
    expect(decodeReactRouterStream(payload)).toEqual({ k: 'v' });
  });

  it('handles negative sentinel indices', () => {
    const payload = '[{"_1":2,"_3":-5},"key","val","missing"]';
    const decoded = decodeReactRouterStream(payload) as Record<string, unknown>;
    expect(decoded.key).toBe('val');
    expect(decoded.missing).toBeUndefined();
  });

  it('returns null on empty payload', () => {
    expect(decodeReactRouterStream('')).toBeNull();
  });
});

describe('findChatGPTConversationData', () => {
  it('finds an object with mapping + current_node anywhere in tree', () => {
    const tree = {
      loaderData: {
        'routes/share.$shareId.($action)': {
          serverResponse: {
            data: { mapping: { n1: { id: 'n1' } }, current_node: 'n1', title: 'test' },
          },
        },
      },
    };
    const found = findChatGPTConversationData(tree) as Record<string, unknown>;
    expect(found?.title).toBe('test');
    expect(found?.current_node).toBe('n1');
  });

  it('returns null when no conversation-shaped object exists', () => {
    expect(findChatGPTConversationData({ foo: 'bar' })).toBeNull();
  });
});
