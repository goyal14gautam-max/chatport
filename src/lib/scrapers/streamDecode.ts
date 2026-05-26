const SENTINELS = new Map<number, unknown>([
  [-1, undefined],
  [-2, null],
  [-3, NaN],
  [-4, Infinity],
  [-5, undefined],
  [-6, -Infinity],
]);

export function extractStreamPayload(html: string): string {
  const calls = [...html.matchAll(/streamController\.enqueue\("((?:\\.|[^"\\])*)"\)/g)];
  if (calls.length === 0) return '';
  return calls
    .map((m) => {
      try {
        return JSON.parse('"' + m[1] + '"') as string;
      } catch {
        return '';
      }
    })
    .join('');
}

export function decodeReactRouterStream(payload: string): unknown {
  const flat = parseStreamLines(payload);
  if (flat.length === 0) return null;
  return resolveIndex(0, flat, new Set());
}

function parseStreamLines(payload: string): unknown[] {
  const lines = payload.split('\n').map((l) => l.trim()).filter(Boolean);
  const flat: unknown[] = [];
  for (const line of lines) {
    if (/^[A-Z]\d+:/.test(line)) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) {
        flat.push(...parsed);
      }
    } catch {
      continue;
    }
  }
  return flat;
}

function resolveIndex(idx: unknown, flat: unknown[], seen: Set<number>): unknown {
  if (typeof idx !== 'number' || !Number.isFinite(idx)) return idx;
  if (idx < 0) return SENTINELS.has(idx) ? SENTINELS.get(idx) : null;
  if (seen.has(idx)) return null;
  const v = flat[idx];
  if (v === null || typeof v !== 'object') return v;

  const nextSeen = new Set(seen).add(idx);
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === 'number' ? resolveIndex(x, flat, nextSeen) : x));
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k.startsWith('_') && typeof val === 'number') {
      const keyIdx = Number(k.slice(1));
      const keyName = resolveIndex(keyIdx, flat, nextSeen);
      if (typeof keyName === 'string') {
        out[keyName] = resolveIndex(val, flat, nextSeen);
      }
    } else {
      out[k] = val;
    }
  }
  return out;
}

export function findChatGPTConversationData(decoded: unknown): unknown {
  if (decoded === null || typeof decoded !== 'object') return null;

  const search = (node: unknown, depth = 0): unknown => {
    if (depth > 10 || node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = search(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    if (obj.mapping && typeof obj.mapping === 'object' && obj.current_node) {
      return obj;
    }
    if (obj.serverResponse && typeof obj.serverResponse === 'object') {
      const data = (obj.serverResponse as Record<string, unknown>).data;
      if (data) {
        const found = search(data, depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(obj)) {
      const found = search(v, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return search(decoded);
}
