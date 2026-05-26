import type { RenderContext } from './universal';
import { buildFooter } from './universal';
import { extractIdentity, type ProjectIdentity } from '../pipeline/identity';
import { extractDecisions } from '../pipeline/decisions';
import {
  extractNextSteps,
  extractOpenQuestions,
  extractStructuredPlan,
  recentMessageSnippets,
  type MessageSnippet,
  type PlanItem,
} from '../pipeline/recency';
import {
  decideArtifactInlining,
  partitionArtifacts,
  summarizeAnonymousArtifacts,
  summarizeArtifacts,
  type ArtifactSummary,
} from '../pipeline/artifacts';
import { hasUsableFilename } from '../utils/attachments';

const CURRENT_STATE_BUDGET = 3500;
const ARTIFACTS_SECTION_BUDGET = 1500;

export function renderCoding(ctx: RenderContext, stats: { input: number; output: number }): string {
  const identity = extractIdentity(ctx.conv);
  const identityTermsLower = identity.terms.map((t) => t.term.toLowerCase());

  const decisions = extractDecisions(ctx.conv, identity.terms);
  const snippets = recentMessageSnippets(ctx.conv, 15, CURRENT_STATE_BUDGET, identityTermsLower);
  const structuredPlan = extractStructuredPlan(ctx.conv);
  const nextSteps = structuredPlan.length > 0 ? [] : extractNextSteps(ctx.conv);
  const openQuestions = extractOpenQuestions(ctx.conv);
  const artifacts = summarizeArtifacts(ctx.conv);
  const artifactDecision = decideArtifactInlining(artifacts);

  const sections: string[] = [];

  sections.push(buildTitle(ctx, identity));
  sections.push(buildMetaLine(ctx, stats));

  const aboutHeader = buildAboutHeader(identity);
  if (aboutHeader) sections.push(aboutHeader);

  const currentState = buildCurrentState(snippets);
  if (currentState) sections.push(currentState);

  sections.push(buildDecisionsSection(decisions.map((d) => d.text)));

  if (artifacts.length > 0) {
    sections.push(buildArtifactsSection(artifactDecision.artifacts, artifactDecision.inlineAll));
  }

  sections.push(buildOpenAndNextSection(openQuestions, nextSteps, structuredPlan));

  sections.push(buildConversationMetadata(ctx, stats));

  sections.push(buildFooter());

  return sections.filter(Boolean).join('\n\n') + '\n';
}

function buildAboutHeader(identity: ProjectIdentity): string {
  const lines: string[] = [];
  if (identity.projectLine && identity.confidence !== 'low') {
    lines.push(`**Project:** ${identity.projectLine}`);
  }
  if (identity.recentFocusLine && identity.recentMessageBlockCount >= 30) {
    lines.push(`**Recent focus:** ${identity.recentFocusLine}`);
  }
  return lines.join('\n');
}

function buildTitle(ctx: RenderContext, identity: ProjectIdentity): string {
  const titleFromConv = ctx.conv.title?.trim();
  if (titleFromConv) return `# ${titleFromConv}`;
  if (identity.projectName && identity.confidence !== 'low') {
    return `# ${identity.projectName}`;
  }
  return `# Conversation Handoff`;
}

function buildMetaLine(ctx: RenderContext, stats: { input: number; output: number }): string {
  const verb = stats.output <= stats.input ? 'Compressed' : 'Restructured';
  return `**Source:** ${ctx.conv.source} | **Type:** ${ctx.type} | **${verb} ${stats.input.toLocaleString()} -> ${stats.output.toLocaleString()} chars**`;
}

function buildCurrentState(snippets: MessageSnippet[]): string {
  const parts: string[] = ['## Current state'];
  let any = false;
  for (const s of snippets) {
    if (!s.text) continue;
    any = true;
    const label = s.role === 'user' ? '**You:**' : '**Assistant:**';
    parts.push(`${label} ${s.text}`);
  }
  if (!any) return '';
  return parts.join('\n\n');
}

function buildDecisionsSection(decisions: string[]): string {
  if (decisions.length === 0) {
    return `## Key decisions made\n\n*No decisions explicitly stated in this conversation.*`;
  }
  const lines = decisions.map((d) => `- ${trimDecision(d)}`);
  return `## Key decisions made\n${lines.join('\n')}`;
}

function trimDecision(s: string): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 200) return cleaned;
  return cleaned.slice(0, 197).replace(/\s\S*$/, '') + '...';
}

function buildArtifactsSection(artifacts: ArtifactSummary[], inlineAll: boolean): string {
  if (artifacts.length === 0) return '';
  const lines: string[] = ['## Code artifacts in this conversation'];

  if (inlineAll) {
    for (const a of artifacts) {
      lines.push(`- \`${a.displayName}\` - ${a.description}`);
      if (a.inlineContent) {
        lines.push('');
        lines.push(`\`\`\`${a.language}`);
        lines.push(a.inlineContent);
        lines.push('```');
      }
    }
    return lines.join('\n');
  }

  const { named, anonymous } = partitionArtifacts(artifacts);
  let totalChars = 0;
  let renderedCount = 0;
  for (const a of named) {
    const line = `- \`${a.displayName}\` - ${a.description}`;
    if (totalChars + line.length > ARTIFACTS_SECTION_BUDGET) {
      const remaining = named.length - renderedCount;
      lines.push(`- *(${remaining} more named artifact${remaining === 1 ? '' : 's'} not listed)*`);
      break;
    }
    lines.push(line);
    totalChars += line.length;
    renderedCount++;
  }

  if (anonymous.length > 0) {
    lines.push(`- ${summarizeAnonymousArtifacts(anonymous)}`);
  }

  return lines.join('\n');
}

function buildOpenAndNextSection(
  openQuestions: { text: string }[],
  nextSteps: { text: string }[],
  structuredPlan: PlanItem[]
): string {
  const lines: string[] = ['## Open questions / Next steps'];
  const hasAnyContent = openQuestions.length > 0 || nextSteps.length > 0 || structuredPlan.length > 0;
  if (!hasAnyContent) {
    lines.push('');
    lines.push('*Not explicitly stated in recent messages.*');
    return lines.join('\n');
  }
  if (openQuestions.length > 0) {
    lines.push('');
    lines.push('**Open questions:**');
    for (const q of openQuestions) lines.push(`- ${q.text}`);
  }
  if (structuredPlan.length > 0) {
    lines.push('');
    lines.push('**Next steps:**');
    for (const item of structuredPlan) {
      if (item.label) {
        lines.push(`- **${item.label}:** ${item.text}`);
      } else {
        lines.push(`- ${item.text}`);
      }
    }
  } else if (nextSteps.length > 0) {
    lines.push('');
    lines.push('**Next steps:**');
    for (const n of nextSteps) lines.push(`- ${n.text}`);
  }
  return lines.join('\n');
}

function buildConversationMetadata(
  ctx: RenderContext,
  stats: { input: number; output: number }
): string {
  const conv = ctx.conv;
  const messageCount = conv.messages.length;
  const attachments = conv.messages.flatMap((m) => m.attachments).filter(hasUsableFilename);
  let imageCount = 0;
  let documentCount = 0;
  let codeFileCount = 0;
  for (const a of attachments) {
    if (a.type === 'image') imageCount++;
    else if (a.type === 'pdf' || a.type === 'document') documentCount++;
    else if (a.type === 'code_file') codeFileCount++;
  }

  const dates = conv.messages
    .map((m) => m.createdAt)
    .filter((s): s is string => !!s)
    .map((s) => Date.parse(s))
    .filter((n) => !Number.isNaN(n));
  const dateRange =
    dates.length > 0
      ? `${formatDate(Math.min(...dates))} -> ${formatDate(Math.max(...dates))}`
      : '';

  const inputDisplay = formatBytes(stats.input);
  const outputDisplay = formatBytes(stats.output);
  const ratio = stats.input > 0 ? ((stats.input - stats.output) / stats.input) * 100 : 0;
  let ratioStr = '';
  if (ratio > 90) {
    ratioStr = ` (${ratio.toFixed(1)}% compression - significant detail loss expected)`;
  } else if (ratio > 0) {
    ratioStr = ` (${ratio.toFixed(1)}% compression)`;
  }

  const lines = ['## Conversation metadata'];
  const summary: string[] = [`${messageCount} messages`];
  if (dateRange) summary.push(dateRange);
  summary.push(`${inputDisplay} -> ${outputDisplay}${ratioStr}`);
  lines.push(`- ${summary.join(' | ')}`);

  const droppedParts: string[] = [];
  if (imageCount > 0) droppedParts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
  if (documentCount > 0) droppedParts.push(`${documentCount} document${documentCount === 1 ? '' : 's'}`);
  if (codeFileCount > 0) droppedParts.push(`${codeFileCount} code file${codeFileCount === 1 ? '' : 's'}`);
  if (droppedParts.length > 0) {
    lines.push(`- Attachments: ${droppedParts.join(', ')} (not transferred verbatim)`);
  }
  lines.push(`- Source: ${conv.source === 'chatgpt' ? 'ChatGPT' : 'Claude'}`);

  return lines.join('\n');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} chars`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
