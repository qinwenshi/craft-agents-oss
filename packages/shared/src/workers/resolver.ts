/**
 * Worker Resolver
 *
 * Pure utilities for resolving slash commands to workers and building
 * injected worker context messages.
 */

import type { LoadedWorker, ResolvedWorkerInvocation, WorkerCommand, WorkerSource } from './types.ts';

/**
 * Normalize slash command token.
 * - Lowercase
 * - Ensure leading slash
 * - Remove whitespace
 */
export function normalizeWorkerCommand(command: string): string {
  const trimmed = command.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Parse a message that may start with a slash command.
 *
 * Returns null unless the entire message begins with `/command`.
 */
export function parseLeadingSlashCommand(message: string): {
  command: string;
  prompt: string;
  rawCommandText: string;
  commandStart: number;
  commandEnd: number;
} | null {
  const match = message.match(/^\s*(\/[a-z0-9][\w-]*)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const rawCommandText = match[1] ?? '';
  if (!rawCommandText) return null;
  const prompt = (match[2] ?? '').trim();
  const commandStart = message.search(/[^\s]/);
  const safeStart = commandStart < 0 ? 0 : commandStart;
  const commandEnd = safeStart + rawCommandText.length;

  return {
    command: normalizeWorkerCommand(rawCommandText),
    prompt,
    rawCommandText,
    commandStart: safeStart,
    commandEnd,
  };
}

function getSourcePriority(source: WorkerSource): number {
  if (source === 'project') return 3;
  if (source === 'workspace') return 2;
  return 1;
}

/**
 * Resolve a slash command message to a worker invocation.
 */
export function resolveWorkerInvocation(
  message: string,
  workers: LoadedWorker[],
  options?: { reservedCommands?: string[] }
): ResolvedWorkerInvocation | null {
  const parsed = parseLeadingSlashCommand(message);
  if (!parsed) return null;

  const reserved = new Set(
    (options?.reservedCommands ?? []).map((command) => normalizeWorkerCommand(command))
  );
  if (reserved.has(parsed.command)) {
    return null;
  }

  const sortedWorkers = [...workers].sort((a, b) => {
    const bySource = getSourcePriority(b.source) - getSourcePriority(a.source);
    if (bySource !== 0) return bySource;
    return a.slug.localeCompare(b.slug);
  });

  for (const worker of sortedWorkers) {
    const matchedCommand = worker.commands.find((cmd) => {
      return normalizeWorkerCommand(cmd.command) === parsed.command;
    });
    if (!matchedCommand) continue;

    return {
      worker,
      command: matchedCommand,
      prompt: parsed.prompt,
      rawCommandText: parsed.rawCommandText,
      commandStart: parsed.commandStart,
      commandEnd: parsed.commandEnd,
    };
  }

  return null;
}

/**
 * Build a compact command badge label for worker command invocations.
 */
export function formatWorkerCommandBadgeLabel(invocation: ResolvedWorkerInvocation): string {
  return `${invocation.worker.metadata.name}: ${invocation.command.command}`;
}

/**
 * Build the transformed message sent to the model for a worker command.
 *
 * The original user message remains unchanged in UI/history; this wrapper is
 * used only for agent execution so the worker role can steer behavior.
 */
export function buildWorkerInvocationMessage(
  invocation: ResolvedWorkerInvocation,
  options?: { workspaceSlug?: string }
): string {
  const workspaceSlug = options?.workspaceSlug;
  const skillMentions = invocation.worker.skills.map((skillSlug) => {
    if (workspaceSlug) {
      return `[skill:${workspaceSlug}:${skillSlug}]`;
    }
    return `[skill:${skillSlug}]`;
  });

  const commandWithDescription = invocation.command.description
    ? `${invocation.command.command} - ${invocation.command.description}`
    : invocation.command.command;

  const request = invocation.prompt || `Execute ${invocation.command.command} and ask follow-up questions if required.`;

  const lines = [
    '<worker_context>',
    `worker_slug: ${invocation.worker.slug}`,
    `worker_name: ${invocation.worker.metadata.name}`,
    `worker_description: ${invocation.worker.metadata.description}`,
    `command: ${commandWithDescription}`,
  ];

  if (skillMentions.length > 0) {
    lines.push(`recommended_skills: ${skillMentions.join(' ')}`);
  }

  lines.push('worker_instructions:');
  lines.push(invocation.worker.content.trim());
  lines.push('</worker_context>');
  lines.push('<worker_request>');
  lines.push(request);
  lines.push('</worker_request>');

  return lines.join('\n');
}

/**
 * Build a transformed message for explicit worker mentions ([worker:slug]).
 */
export function buildWorkerMentionMessage(
  worker: LoadedWorker,
  prompt: string,
  options?: { workspaceSlug?: string }
): string {
  const workspaceSlug = options?.workspaceSlug;
  const skillMentions = worker.skills.map((skillSlug) => {
    if (workspaceSlug) {
      return `[skill:${workspaceSlug}:${skillSlug}]`;
    }
    return `[skill:${skillSlug}]`;
  });

  const request = prompt.trim() || `Use the ${worker.metadata.name} workflow and ask follow-up questions if required.`;

  const lines = [
    '<worker_context>',
    `worker_slug: ${worker.slug}`,
    `worker_name: ${worker.metadata.name}`,
    `worker_description: ${worker.metadata.description}`,
    'activation: explicit_worker_mention',
  ];

  if (skillMentions.length > 0) {
    lines.push(`recommended_skills: ${skillMentions.join(' ')}`);
  }

  lines.push('worker_instructions:');
  lines.push(worker.content.trim());
  lines.push('</worker_context>');
  lines.push('<worker_request>');
  lines.push(request);
  lines.push('</worker_request>');

  return lines.join('\n');
}

/**
 * Normalize and deduplicate worker command definitions.
 */
export function normalizeWorkerCommands(commands: WorkerCommand[]): WorkerCommand[] {
  const seen = new Set<string>();
  const normalized: WorkerCommand[] = [];

  for (const command of commands) {
    const normalizedCommand = normalizeWorkerCommand(command.command);
    if (!normalizedCommand || seen.has(normalizedCommand)) {
      continue;
    }
    seen.add(normalizedCommand);
    normalized.push({
      command: normalizedCommand,
      description: command.description?.trim() || undefined,
    });
  }

  return normalized;
}
