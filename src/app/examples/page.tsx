import Link from 'next/link';
import type { Metadata } from 'next';
import { EXAMPLES } from './_data/manifest';

export const metadata: Metadata = {
  title: 'Examples — ChatPort',
  description:
    "Three example handoff docs produced by ChatPort's classical-NLP pipeline: a coding chat, a research chat, and a long planning chat.",
};

export default function ExamplesIndex() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">ChatPort</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/examples" className="text-gray-900">Examples</Link>
            <a
              href="https://github.com/goyal14gautam-max/chatport"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
        <h1 className="text-3xl font-semibold text-gray-900">Examples</h1>
        <p className="mt-4 text-gray-700 leading-relaxed">
          Three example handoff docs produced by ChatPort&rsquo;s pipeline on real (sanitized)
          conversations. Each shows the <strong>Resume</strong> output — the ~9k-char compressed
          version you&rsquo;d paste into a fresh AI prompt.
        </p>

        <ul className="mt-10 space-y-6">
          {EXAMPLES.map((ex) => (
            <li key={ex.slug}>
              <Link
                href={`/examples/${ex.slug}`}
                className="block rounded-lg border border-gray-200 p-5 hover:border-gray-400 transition-colors"
              >
                <div className="text-xs font-mono uppercase text-gray-500">{ex.kind}</div>
                <div className="mt-1 text-lg font-medium text-gray-900">{ex.title}</div>
                <p className="mt-2 text-sm text-gray-700 leading-relaxed">{ex.description}</p>
                <div className="mt-3 text-xs text-gray-500 font-mono">
                  {ex.stats}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-12 pt-6 border-t border-gray-200">
          <Link href="/" className="text-sm text-gray-700 underline underline-offset-2 hover:no-underline">
            ← Back to ChatPort
          </Link>
        </div>
      </div>
    </main>
  );
}
