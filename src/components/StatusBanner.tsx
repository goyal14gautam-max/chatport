'use client';

interface StatusBannerProps {
  kind: 'parsing' | 'processing' | 'error';
  message: string;
  action?: { label: string; onClick: () => void };
}

export function StatusBanner({ kind, message, action }: StatusBannerProps) {
  if (kind === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 text-red-900 px-4 py-3 text-sm space-y-2">
        <div>{message}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center px-3 py-1 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-100"
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
      <Spinner />
      <span>{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-blue-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
