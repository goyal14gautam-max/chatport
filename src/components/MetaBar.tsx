'use client';

import type { CompressionMeta } from '@/lib/types';

interface MetaBarProps {
  meta: CompressionMeta;
}

export function MetaBar({ meta }: MetaBarProps) {
  const verb = meta.outputChars <= meta.inputChars ? 'Compressed' : 'Restructured';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
      <span>
        Type: <strong className="text-gray-900 font-medium">{meta.type}</strong>
      </span>
      <span className="text-gray-300">·</span>
      <span>
        {verb}{' '}
        <strong className="text-gray-900 font-medium">
          {meta.inputChars.toLocaleString()} → {meta.outputChars.toLocaleString()}
        </strong>{' '}
        chars
      </span>
      {meta.droppedMessages > 0 && (
        <>
          <span className="text-gray-300">·</span>
          <span>
            {meta.droppedMessages} message{meta.droppedMessages === 1 ? '' : 's'} dropped
          </span>
        </>
      )}
      {meta.droppedAttachments > 0 && (
        <>
          <span className="text-gray-300">·</span>
          <span>
            {meta.droppedAttachments} attachment{meta.droppedAttachments === 1 ? '' : 's'} as placeholder
          </span>
        </>
      )}
    </div>
  );
}
