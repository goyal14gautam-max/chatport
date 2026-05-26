'use client';

export type InputMode = 'link' | 'upload';

interface InputModeTabsProps {
  active: InputMode;
  onChange: (mode: InputMode) => void;
}

export function InputModeTabs({ active, onChange }: InputModeTabsProps) {
  return (
    <div className="flex border-b border-gray-200" role="tablist" aria-label="Input mode">
      <Tab active={active === 'link'} onClick={() => onChange('link')} label="Paste link" />
      <Tab active={active === 'upload'} onClick={() => onChange('upload')} label="Upload JSON" />
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
      {label}
    </button>
  );
}
