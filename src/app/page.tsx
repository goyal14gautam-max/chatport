'use client';

import { useState } from 'react';
import { ConversationPicker } from '@/components/ConversationPicker';
import { InputModeTabs, type InputMode } from '@/components/InputModeTabs';
import { Landing } from '@/components/Landing';
import { LinkInput } from '@/components/LinkInput';
import { MetaBar } from '@/components/MetaBar';
import { PreviewPane } from '@/components/PreviewPane';
import { PreviewTabs } from '@/components/PreviewTabs';
import { StatusBanner } from '@/components/StatusBanner';
import { Toolbar } from '@/components/Toolbar';
import { Uploader } from '@/components/Uploader';
import { IngestError, readAndIdentify } from '@/lib/browser/ingest';
import { scrapeUrl } from '@/lib/browser/scrape';
import { summarizeBoth } from '@/lib/browser/summarizeBoth';
import { listConversations } from '@/lib/parsers';
import type { CompressResult, ConvSummary, Source } from '@/lib/types';

type AppState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'fetching'; url: string }
  | { kind: 'picking'; source: Source; raw: unknown; summaries: ConvSummary[] }
  | {
      kind: 'processing';
      source: Source;
      raw: unknown;
      conversationId: string;
    }
  | {
      kind: 'ready';
      resume: CompressResult;
      full: CompressResult;
      activeTab: 'resume' | 'full';
      conversationTitle: string;
    }
  | { kind: 'error'; message: string; suggestUpload?: boolean };

export default function Home() {
  const [mode, setMode] = useState<InputMode>('link');
  const [state, setState] = useState<AppState>({ kind: 'idle' });

  const runPipeline = async (raw: unknown, source: Source, conversationId: string, title: string) => {
    setState({ kind: 'processing', source, raw, conversationId });
    try {
      const { resume, full } = await summarizeBoth(raw, conversationId);
      setState({
        kind: 'ready',
        resume,
        full,
        activeTab: 'resume',
        conversationTitle: title,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? `Couldn't process this conversation: ${err.message}`
          : "Couldn't process this conversation.";
      setState({ kind: 'error', message });
    }
  };

  const handleFile = async (file: File) => {
    setState({ kind: 'reading' });
    try {
      const { raw, source, summaries } = await readAndIdentify(file);
      setState({ kind: 'picking', source, raw, summaries });
    } catch (err) {
      const message =
        err instanceof IngestError
          ? err.userMessage
          : err instanceof Error
            ? `Unexpected error: ${err.message}`
            : 'Unexpected error reading file.';
      setState({ kind: 'error', message });
    }
  };

  const handleLink = async (url: string) => {
    setState({ kind: 'fetching', url });
    const result = await scrapeUrl(url);
    if (!result.ok) {
      const suggestUpload = result.code !== 'NETWORK';
      setState({ kind: 'error', message: result.message, suggestUpload });
      return;
    }
    const summaries = listConversations(result.data);
    if (summaries.length === 0) {
      setState({
        kind: 'error',
        message: "Couldn't read any conversations from that share link. Try uploading conversations.json instead.",
        suggestUpload: true,
      });
      return;
    }
    const first = summaries[0];
    await runPipeline(result.data, result.source, first.id, first.title);
  };

  const handlePick = async (conversationId: string) => {
    if (state.kind !== 'picking') return;
    const title = state.summaries.find((s) => s.id === conversationId)?.title ?? 'Conversation';
    await runPipeline(state.raw, state.source, conversationId, title);
  };

  const handleReset = () => setState({ kind: 'idle' });

  const handleTabChange = (tab: 'resume' | 'full') => {
    if (state.kind === 'ready') setState({ ...state, activeTab: tab });
  };

  const switchToUpload = () => {
    setMode('upload');
    setState({ kind: 'idle' });
  };

  const showInputUI = state.kind === 'idle';
  const showBackLink = state.kind !== 'idle' && state.kind !== 'reading' && state.kind !== 'fetching';

  const scrollToTool = () => {
    const el = document.getElementById('tool');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="min-h-screen bg-white">
      <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold text-gray-900">ChatPort</a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/examples" className="text-gray-600 hover:text-gray-900">Examples</a>
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
        {showInputUI && <Landing onGetStarted={scrollToTool} />}

        <section id="tool" className={showInputUI ? 'mt-20 sm:mt-24 scroll-mt-16' : 'scroll-mt-16'}>
          {showInputUI && (
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Try it</h2>
          )}

          {showBackLink && (
            <button
              type="button"
              onClick={handleReset}
              className="mb-4 text-sm text-gray-600 hover:text-gray-900"
            >
              ← Start over
            </button>
          )}

          {showInputUI && (
            <div className="space-y-4">
              <InputModeTabs active={mode} onChange={setMode} />
              {mode === 'link' ? <LinkInput onSubmit={handleLink} /> : <Uploader onFile={handleFile} />}
              <p className="text-sm text-gray-500">
                Not ready to upload your own?{' '}
                <a href="/examples" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                  See an example output →
                </a>
              </p>
            </div>
          )}

          {state.kind === 'reading' && (
            <StatusBanner kind="parsing" message="Reading and parsing your file…" />
          )}

          {state.kind === 'fetching' && (
            <StatusBanner kind="parsing" message="Fetching the conversation from ChatGPT…" />
          )}

          {state.kind === 'picking' && (
            <ConversationPicker summaries={state.summaries} onPick={handlePick} />
          )}

          {state.kind === 'processing' && (
            <StatusBanner
              kind="processing"
              message="Compressing the conversation (this may take a moment for large chats)…"
            />
          )}

          {state.kind === 'ready' && (
            <div className="space-y-3">
              <MetaBar meta={state[state.activeTab].meta} />
              <PreviewTabs
                active={state.activeTab}
                onChange={handleTabChange}
                resumeChars={state.resume.meta.outputChars}
                fullChars={state.full.meta.outputChars}
              />
              <PreviewPane markdown={state[state.activeTab].markdown} />
              <Toolbar
                markdown={state[state.activeTab].markdown}
                filename={`${slugify(state.conversationTitle)}-${state.activeTab}.md`}
                onReset={handleReset}
              />
            </div>
          )}

          {state.kind === 'error' && (
            <StatusBanner
              kind="error"
              message={state.message}
              action={
                state.suggestUpload
                  ? { label: 'Switch to JSON upload', onClick: switchToUpload }
                  : undefined
              }
            />
          )}
        </section>

        <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
          <span>Open source</span>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/goyal14gautam-max/chatport"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900"
          >
            GitHub
          </a>
          <span aria-hidden>·</span>
          <span>MIT licensed</span>
          <span aria-hidden>·</span>
          <span>No data leaves this browser</span>
        </footer>
      </div>
    </main>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'conversation'
  );
}
