'use client';

interface PreviewTabsProps {
  active: 'resume' | 'full';
  onChange: (tab: 'resume' | 'full') => void;
  resumeChars: number;
  fullChars: number;
}

export function PreviewTabs({ active, onChange, resumeChars, fullChars }: PreviewTabsProps) {
  return (
    <div className="flex border-b border-gray-200" role="tablist">
      <Tab
        active={active === 'resume'}
        onClick={() => onChange('resume')}
        label="Resume"
        chars={resumeChars}
      />
      <Tab
        active={active === 'full'}
        onClick={() => onChange('full')}
        label="Full"
        chars={fullChars}
      />
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  chars,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  chars: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
      }`}
    >
      {label} <span className="text-gray-500 font-normal">({chars.toLocaleString()})</span>
    </button>
  );
}
