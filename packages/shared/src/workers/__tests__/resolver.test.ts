import { describe, expect, it } from 'bun:test';
import {
  buildWorkerMentionMessage,
  buildWorkerInvocationMessage,
  formatWorkerCommandBadgeLabel,
  normalizeWorkerCommand,
  parseLeadingSlashCommand,
  resolveWorkerInvocation,
} from '../resolver.ts';
import type { LoadedWorker } from '../types.ts';

function createWorker(overrides: Partial<LoadedWorker>): LoadedWorker {
  return {
    slug: 'data-analyst',
    metadata: {
      name: 'Data Analyst',
      description: 'Analyze datasets and build dashboards',
      commands: [{ command: '/analyze', description: 'Run analysis workflow' }],
      skills: ['sql-queries', 'data-visualization'],
    },
    content: 'Use SQL, visualization, and validation best practices.',
    commands: [{ command: '/analyze', description: 'Run analysis workflow' }],
    skills: ['sql-queries', 'data-visualization'],
    path: '/tmp/workers/data-analyst',
    filePath: '/tmp/workers/data-analyst/README.md',
    source: 'workspace',
    ...overrides,
  };
}

describe('normalizeWorkerCommand', () => {
  it('normalizes command to lowercase with leading slash', () => {
    expect(normalizeWorkerCommand('Analyze')).toBe('/analyze');
    expect(normalizeWorkerCommand('/ANALYZE')).toBe('/analyze');
  });
});

describe('parseLeadingSlashCommand', () => {
  it('parses slash command and prompt', () => {
    const parsed = parseLeadingSlashCommand('/analyze monthly revenue');
    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('/analyze');
    expect(parsed?.prompt).toBe('monthly revenue');
    expect(parsed?.rawCommandText).toBe('/analyze');
  });

  it('returns null for non-slash messages', () => {
    expect(parseLeadingSlashCommand('analyze monthly revenue')).toBeNull();
  });
});

describe('resolveWorkerInvocation', () => {
  const workers = [createWorker({})];

  it('resolves worker command invocation', () => {
    const invocation = resolveWorkerInvocation('/analyze monthly revenue', workers);
    expect(invocation).not.toBeNull();
    expect(invocation?.worker.slug).toBe('data-analyst');
    expect(invocation?.command.command).toBe('/analyze');
    expect(invocation?.prompt).toBe('monthly revenue');
  });

  it('skips reserved slash commands', () => {
    const invocation = resolveWorkerInvocation('/compact now', workers, {
      reservedCommands: ['/compact'],
    });
    expect(invocation).toBeNull();
  });
});

describe('worker output helpers', () => {
  const invocation = resolveWorkerInvocation('/analyze cohort retention', [createWorker({})])!;

  it('formats worker command badge label', () => {
    expect(formatWorkerCommandBadgeLabel(invocation)).toBe('Data Analyst: /analyze');
  });

  it('builds worker invocation message with workspace-qualified skills', () => {
    const message = buildWorkerInvocationMessage(invocation, { workspaceSlug: 'demo-space' });
    expect(message).toContain('worker_slug: data-analyst');
    expect(message).toContain('recommended_skills: [skill:demo-space:sql-queries] [skill:demo-space:data-visualization]');
    expect(message).toContain('<worker_request>');
    expect(message).toContain('cohort retention');
  });

  it('builds worker mention message for explicit worker selection', () => {
    const worker = createWorker({});
    const message = buildWorkerMentionMessage(worker, 'Please analyze monthly retention', {
      workspaceSlug: 'demo-space',
    });
    expect(message).toContain('worker_slug: data-analyst');
    expect(message).toContain('activation: explicit_worker_mention');
    expect(message).toContain('recommended_skills: [skill:demo-space:sql-queries] [skill:demo-space:data-visualization]');
    expect(message).toContain('Please analyze monthly retention');
  });
});
