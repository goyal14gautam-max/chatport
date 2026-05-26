'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PreviewPaneProps {
  markdown: string;
}

export function PreviewPane({ markdown }: PreviewPaneProps) {
  return (
    <div className="prose prose-sm max-w-none p-4 bg-white border border-gray-200 rounded-lg max-h-[600px] overflow-y-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={`block font-mono text-xs whitespace-pre overflow-x-auto ${className ?? ''}`} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return (
              <pre className="bg-gray-50 border border-gray-200 rounded-md p-3 my-3 overflow-x-auto">
                {children}
              </pre>
            );
          },
          h1: ({ children }) => <h1 className="text-xl font-semibold mt-0 mb-3 text-gray-900">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mt-4 mb-2 text-gray-900">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-2 text-gray-900">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm">{children}</ul>,
          p: ({ children }) => <p className="my-2 text-sm leading-relaxed text-gray-800">{children}</p>,
          hr: () => <hr className="my-4 border-gray-200" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
