# ChatPort

**[Live demo →](https://chatport.vercel.app)** · [Examples →](https://chatport.vercel.app/examples)

Compress ChatGPT and Claude conversations into compact, portable markdown handoff documents. Paste them into any other AI tool to continue your work with full context — without re-explaining everything.

Built entirely with classical NLP (TF-IDF, TextRank, regex). **No LLM API calls.** No accounts. No data stored.

## The problem

You hit a usage limit mid-conversation. You want to continue on a different model, in a different tool, or just on a fresh chat. Existing tools dump the entire conversation as markdown — 200 messages of noise that the next AI has to re-parse. ChatPort instead produces a structured handoff doc: goal, key decisions, latest state, open questions, next steps.

## How it works

Two input paths, one pipeline:

- **Paste link** — paste a ChatGPT share URL, the server fetches the share page, decodes the React Router stream, and runs the same processing pipeline as the upload path. Claude share pages render the conversation client-side, so they can't be auto-fetched server-side — for Claude, use Upload JSON.
- **Upload JSON** — drop the `conversations.json` from ChatGPT's data export or Claude's data export. Everything runs in your browser; nothing leaves the page.

The compression pipeline:

```
ChatGPT/Claude JSON
       │
       ▼
  ┌──────────┐
  │  Parse   │  → unified message schema
  └────┬─────┘
       ▼
  ┌──────────┐
  │ Classify │  → coding | writing | research | planning | mixed
  └────┬─────┘
       ▼
  ┌──────────┐
  │ Extract  │  → sentences · code blocks · artifacts
  └────┬─────┘
       ▼
  ┌──────────┐
  │  Score   │  → TF-IDF + position + role + type overlay
  └────┬─────┘
       ▼
  ┌──────────┐
  │  Select  │  → greedy fill, ~9k char budget, 25% always-keep
  └────┬─────┘
       ▼
  ┌──────────┐
  │  Render  │  → type-specific markdown template
  └────┬─────┘
       ▼
  Portable .md
```

1. **Parse** — both ChatGPT and Claude exports are normalized into one common schema (messages, content blocks, attachments).
2. **Classify** — heuristic detection of conversation type using regex-driven signals (code ratio, error words, citations, decision markers, etc.).
3. **Extract candidates** — every sentence, code block, and artifact becomes a scoring candidate.
4. **Score** — TF-IDF for informational density, plus position recency, role weights, question/decision markers, and a type-specific overlay.
5. **Select** — always-keep rules (last user message, artifacts, strong decisions) plus a greedy knapsack to fit the budget, with a diversity penalty so one long message can't monopolize the output.
6. **Render** — type-aware markdown template with sections like Project identity, Current state, Key decisions, Open questions, Next steps.

Output is offered at two compression levels in the UI:

- **Resume** — ~9k chars. The headline use case: fits in a fresh AI prompt, contains the substance.
- **Full** — verbatim conversation with attachments stripped to placeholders, for when you want everything.

## Privacy

- **JSON upload path:** runs entirely in your browser. The conversation never touches a server.
- **Link path:** the server fetches the public ChatGPT share page (the only way to bypass CORS). The fetch is not logged or stored beyond ephemeral function logs.
- No analytics. No accounts. No persistence.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- `react-dropzone`, `react-markdown`, `remark-gfm`
- Inline TF-IDF and TextRank (~100 LOC total — `natural` was dropped after webpack tried to bundle MongoDB drivers)
- Vitest for tests
- Deployed on Vercel

## Local development

```bash
git clone https://github.com/goyal14gautam-max/chatport.git
cd chatport
npm install
npm run dev          # http://localhost:3000
npm test             # vitest, 78 tests
npm run lint         # eslint via next lint
npm run build        # production build
npm run cli -- tests/fixtures/chatgpt-coding.json resume   # eyeball CLI
```

## Project structure

```
src/
  lib/
    types.ts                  # normalized schema
    parsers/                  # ChatGPT + Claude export → normalized JSON
    pipeline/                 # classify → extract → score → select → summarize → render
    templates/                # type-specific markdown templates
    utils/                    # text splitting, TF-IDF, TextRank, attachment classifier
    scrapers/                 # ChatGPT share-page fetch + React Router stream decoder
    browser/                  # client-side helpers (ingest, scrape, summarizeBoth)
  app/
    page.tsx                  # main UI (state machine)
    api/scrape/route.ts       # POST endpoint for ChatGPT share URLs
  components/                 # 9 presentational React components
scripts/cli.ts                # CLI for eyeball-testing the pipeline
tests/                        # vitest unit tests + fixtures
```

## Known limitations

- **Link path is ChatGPT-only.** Claude's share page is a pure SPA shell with no server-rendered conversation data. For Claude, use the JSON upload path.
- **The ChatGPT scraper will eventually break** when ChatGPT updates its React Router stream format. When that happens, the UI shows a specific error and offers a one-click switch to JSON upload.
- **Output quality is extractive, not abstractive.** The pipeline picks the most informative existing sentences; it does not rewrite or synthesize. For technical conversations where reasoning flows across paragraphs, expect to lose some nuance. This is the deliberate cost of staying LLM-free.
- **Voice-transcription artifacts pass through.** If the original conversation contains transcription errors ("lems" instead of "LLMs"), so will the output.
- **Cloudflare may rate-limit or block the server-side fetch** from Vercel egress IPs. If that happens, the UI falls back to the JSON upload path.

## Roadmap

- Browser extension (works on private chats, runs in your authenticated session, no scraping required)
- Compression-level selector beyond the current Resume/Full toggle (TL;DR, Resume Work, Full Handoff)
- Better sentence-splitter for markdown-heavy assistant messages
- Optional opt-in LLM polish pass (bring-your-own-key) for abstractive summarization

## Contributing

PRs welcome. Please open an issue first for anything beyond a small fix — happy to talk through approach before you sink time into a change.

For local development setup, see the [Local development](#local-development) section above.

## License

MIT — see [LICENSE](LICENSE).
