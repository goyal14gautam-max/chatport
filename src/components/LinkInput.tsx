'use client';

import { useState } from 'react';
import { detectPlatformFromUrl } from '@/lib/scrapers';

interface LinkInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export function LinkInput({ onSubmit, disabled }: LinkInputProps) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const platform = trimmed ? detectPlatformFromUrl(trimmed) : null;

  const validity =
    platform === null
      ? 'idle'
      : platform === 'chatgpt'
        ? 'ok'
        : platform === 'claude'
          ? 'claude'
          : 'invalid';

  const helper =
    validity === 'claude'
      ? "Claude share links can't be auto-fetched yet — use the Upload JSON tab and export from Settings → Privacy."
      : validity === 'invalid'
        ? 'Paste a chatgpt.com/share/<id> URL.'
        : 'Paste a ChatGPT or Claude share URL. ChatGPT auto-fetches; Claude requires the JSON upload path.';

  const canSubmit = validity === 'ok' && !disabled;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="share-url" className="block text-sm font-medium text-gray-900">
        Share link
      </label>
      <div className="flex gap-2">
        <input
          id="share-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://chatgpt.com/share/…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          className={`flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 ${
            validity === 'invalid' || validity === 'claude'
              ? 'border-amber-300'
              : 'border-gray-300'
          }`}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Generate
        </button>
      </div>
      <p
        className={`text-xs ${
          validity === 'invalid' || validity === 'claude' ? 'text-amber-700' : 'text-gray-500'
        }`}
      >
        {helper}
      </p>
    </form>
  );
}
