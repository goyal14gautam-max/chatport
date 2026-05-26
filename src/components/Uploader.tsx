'use client';

import { useDropzone } from 'react-dropzone';

interface UploaderProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function Uploader({ onFile, disabled }: UploaderProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/json': ['.json'] },
    multiple: false,
    disabled,
    onDrop: (accepted) => {
      const file = accepted[0];
      if (file) onFile(file);
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`
        rounded-xl border-2 border-dashed transition-colors cursor-pointer
        px-8 py-16 text-center select-none
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl">📎</div>
        <div className="text-lg font-medium text-gray-900">
          {isDragActive ? 'Drop the file' : 'Drop conversations.json here'}
        </div>
        <div className="text-sm text-gray-600">or click to browse</div>
        <div className="text-xs text-gray-500 mt-2">ChatGPT or Claude exports · up to 25 MB</div>
      </div>
    </div>
  );
}
