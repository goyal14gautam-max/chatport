'use client';

import { useState } from 'react';

interface ToolbarProps {
  markdown: string;
  filename: string;
  onReset: () => void;
}

export function Toolbar({ markdown, filename, onReset }: ToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Copy failed. Select the text manually or use Download.');
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Download .md
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-900 rounded-md hover:bg-gray-200 transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        Upload another
      </button>
      {copyError && (
        <span className="text-xs text-red-600 ml-2">{copyError}</span>
      )}
    </div>
  );
}
