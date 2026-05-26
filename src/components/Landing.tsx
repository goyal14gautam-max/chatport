'use client';

interface LandingProps {
  onGetStarted: () => void;
}

export function Landing({ onGetStarted }: LandingProps) {
  return (
    <div className="space-y-20 sm:space-y-24">
      <section className="pt-4">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900">
          Portable handoff docs for long AI conversations.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-700 leading-relaxed">
          ChatPort compresses a ChatGPT or Claude conversation into a structured markdown handoff &mdash; goal, key decisions, latest state, open questions, next steps. Paste it into any other AI tool and pick up where you left off, without re-explaining everything.
        </p>
        <p className="mt-4 text-base sm:text-lg text-gray-700 leading-relaxed">
          No LLMs in the loop. No accounts. No data leaves your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onGetStarted}
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Try it &rarr;
          </button>
          <a
            href="/examples"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            See an example
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-gray-900">The problem</h2>
        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          AI tools have usage limits and isolated memories. When you hit the cap on ChatGPT, switch to Claude, or open a fresh session for a new feature, the context of your last 50 messages doesn&rsquo;t come with you. Copy-pasting the whole transcript is noise; re-typing the gist is friction. ChatPort sits in between.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-gray-900">How it works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Step
            number="1"
            title="Paste link or upload JSON"
            body="Drop a ChatGPT share URL, or your conversations.json export from ChatGPT or Claude."
          />
          <Step
            number="2"
            title="Compress with classical NLP"
            body="TF-IDF, TextRank, and a type-specific scoring pass pick the highest-signal sentences, decisions, code blocks, and artifacts. No LLM API calls."
          />
          <Step
            number="3"
            title="Get portable .md"
            body="Download a structured handoff doc — typically 6–9k chars — that fits cleanly into a fresh prompt."
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-gray-900">Why no LLM</h2>
        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          Every other &ldquo;AI conversation summarizer&rdquo; sends your messages to OpenAI or Anthropic to do the work. That&rsquo;s a privacy tax: a conversation you started on one model gets shipped to a third one for processing. ChatPort doesn&rsquo;t.
        </p>
        <p className="mt-4 text-base text-gray-700 leading-relaxed">
          The compression runs entirely in your browser via deterministic NLP &mdash; sentence segmentation, TF-IDF ranking, regex pattern detection, greedy budget-fill. The output is <strong>extractive</strong> (original sentences, picked and reordered) rather than <strong>abstractive</strong> (rewritten). You lose some narrative polish in exchange for zero LLM costs, no data egress, no rate limits, and a pipeline whose decisions you can actually inspect.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-gray-900">What it doesn&rsquo;t do</h2>
        <ul className="mt-4 space-y-3 text-base text-gray-700 leading-relaxed">
          <li>
            <strong>Link path is ChatGPT-only.</strong> Claude&rsquo;s share pages render client-side, so they can&rsquo;t be auto-fetched. For Claude, use the JSON upload path.
          </li>
          <li>
            <strong>Output is extractive, not abstractive.</strong> Reasoning that flows across paragraphs may lose nuance. The structure survives; some prose doesn&rsquo;t.
          </li>
          <li>
            <strong>Very long conversations compress aggressively.</strong> A 300-message chat collapses to a few thousand characters &mdash; specifics drop, the through-line stays.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-5">
      <div className="text-xs font-mono text-gray-500">STEP {number}</div>
      <div className="mt-1 text-base font-medium text-gray-900">{title}</div>
      <p className="mt-2 text-sm text-gray-700 leading-relaxed">{body}</p>
    </div>
  );
}
