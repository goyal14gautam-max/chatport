export interface ExampleMeta {
  slug: 'coding' | 'research' | 'planning';
  kind: string;
  title: string;
  description: string;
  stats: string;
  file: string;
}

export const EXAMPLES: ExampleMeta[] = [
  {
    slug: 'coding',
    kind: 'Coding',
    title: 'A short ChatGPT debugging session',
    description:
      'A typical "fix this error" thread with code snippets, a few decisions, and a working final solution. Shows how the coding template surfaces decisions and the latest code state.',
    stats: '1.8k → 1.6k chars · ChatGPT',
    file: 'coding.md',
  },
  {
    slug: 'research',
    kind: 'Research',
    title: 'A Claude research thread',
    description:
      'Information-gathering conversation with citations and tradeoffs. The research template emphasizes sourced claims and key questions.',
    stats: '1.7k → 0.8k chars · Claude',
    file: 'research.md',
  },
  {
    slug: 'planning',
    kind: 'Planning',
    title: 'A product-planning chat (sanitized)',
    description:
      'A planning conversation about a legal-tech product, slicing across multiple sub-features (auth, drafts, team management). The mixed-type template synthesizes the recurring project nouns and surfaces what was decided.',
    stats: '57 KB → 4 KB · 18 messages · Claude',
    file: 'planning.md',
  },
];
