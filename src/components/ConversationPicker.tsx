'use client';

import { useMemo, useState } from 'react';
import type { ConvSummary } from '@/lib/types';

interface ConversationPickerProps {
  summaries: ConvSummary[];
  onPick: (id: string) => void;
}

export function ConversationPicker({ summaries, onPick }: ConversationPickerProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(summaries[0]?.id ?? '');

  const filtered = useMemo(() => {
    if (!query.trim()) return summaries;
    const q = query.toLowerCase();
    return summaries.filter((s) => s.title.toLowerCase().includes(q));
  }, [summaries, query]);

  const singleConv = summaries.length === 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          {singleConv
            ? '1 conversation in this file'
            : `Found ${summaries.length} conversations. Pick one:`}
        </h2>
      </div>

      {!singleConv && (
        <input
          type="text"
          placeholder="Search by title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No conversations match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                selectedId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-900 truncate">{s.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {formatDate(s.createdAt)} · {s.messageCount} message{s.messageCount === 1 ? '' : 's'}
              </div>
            </button>
          ))
        )}
      </div>

      <button
        type="button"
        disabled={!selectedId}
        onClick={() => selectedId && onPick(selectedId)}
        className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Process this conversation
      </button>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return 'unknown date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
