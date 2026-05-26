import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PreviewPane } from '@/components/PreviewPane';
import { EXAMPLES, type ExampleMeta } from '../_data/manifest';

interface PageProps {
  params: { type: string };
}

function findExample(slug: string): ExampleMeta | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}

export function generateStaticParams() {
  return EXAMPLES.map((e) => ({ type: e.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const ex = findExample(params.type);
  if (!ex) return {};
  return {
    title: `${ex.title} — ChatPort example`,
    description: ex.description,
  };
}

export default function ExamplePage({ params }: PageProps) {
  const ex = findExample(params.type);
  if (!ex) notFound();

  const path = resolve(process.cwd(), 'src/app/examples/_data', ex.file);
  const markdown = readFileSync(path, 'utf8');

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
        <Link href="/examples" className="text-sm text-gray-600 hover:text-gray-900">
          ← All examples
        </Link>

        <div className="mt-6">
          <div className="text-xs font-mono uppercase text-gray-500">{ex.kind}</div>
          <h1 className="mt-1 text-3xl font-semibold text-gray-900">{ex.title}</h1>
          <p className="mt-3 text-gray-700 leading-relaxed">{ex.description}</p>
          <p className="mt-3 text-xs font-mono text-gray-500">{ex.stats}</p>
        </div>

        <div className="mt-8">
          <div className="mb-2 text-xs font-mono uppercase text-gray-500">Resume output</div>
          <PreviewPane markdown={markdown} />
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 p-5 bg-gray-50">
          <div className="text-sm text-gray-700">
            Want to try ChatPort on your own conversation?
          </div>
          <Link
            href="/"
            className="mt-3 inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
            Open the tool →
          </Link>
        </div>
      </div>
    </main>
  );
}
