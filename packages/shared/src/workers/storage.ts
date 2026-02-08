/**
 * Workers Storage
 *
 * Load workers from global, workspace, and project directories.
 * Worker files are markdown docs (WORKER.md or README.md) with optional frontmatter.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import matter from 'gray-matter';
import type {
  LoadedWorker,
  WorkerCommand,
  WorkerMetadata,
  WorkerSource,
} from './types.ts';
import {
  normalizeWorkerCommand,
  normalizeWorkerCommands,
} from './resolver.ts';
import { getWorkspaceWorkersPath } from '../workspaces/storage.ts';
import { validateIconValue } from '../utils/icon.ts';

// ============================================================
// Worker Paths
// ============================================================

/** Global workers directory: ~/.agents/workers/ */
const GLOBAL_AGENT_WORKERS_DIR = join(homedir(), '.agents', 'workers');

/** Project-level workers directory name */
const PROJECT_AGENT_WORKERS_DIR = '.agents/workers';

/** Supported worker markdown filenames, in lookup order */
const WORKER_MARKDOWN_FILES = ['WORKER.md', 'README.md'];

// ============================================================
// Parsing Helpers
// ============================================================

function normalizeSkillSlug(value: string): string {
  return value.trim().replace(/^`|`$/g, '');
}

function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills) {
    const slug = normalizeSkillSlug(skill);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }

  return normalized;
}

function extractFirstHeading(body: string): string | null {
  const heading = body.match(/^#\s+(.+)$/m);
  if (!heading?.[1]) return null;
  return heading[1].trim();
}

function extractFirstParagraph(body: string): string | null {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('|')) continue;
    return trimmed;
  }
  return null;
}

function parseFrontmatterCommands(value: unknown): WorkerCommand[] {
  if (!value) return [];

  // commands:
  //   - /analyze
  //   - { command: /analyze, description: ... }
  if (Array.isArray(value)) {
    const commands: WorkerCommand[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        commands.push({ command: item });
        continue;
      }
      if (item && typeof item === 'object') {
        const commandValue = (item as Record<string, unknown>).command;
        const descriptionValue = (item as Record<string, unknown>).description;
        if (typeof commandValue === 'string') {
          commands.push({
            command: commandValue,
            description: typeof descriptionValue === 'string' ? descriptionValue : undefined,
          });
        }
      }
    }
    return normalizeWorkerCommands(commands);
  }

  // commands:
  //   /analyze: Description
  if (value && typeof value === 'object') {
    const commands: WorkerCommand[] = [];
    for (const [command, description] of Object.entries(value as Record<string, unknown>)) {
      commands.push({
        command,
        description: typeof description === 'string' ? description : undefined,
      });
    }
    return normalizeWorkerCommands(commands);
  }

  return [];
}

function parseFrontmatterSkills(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return dedupeSkills(
      value.filter((item): item is string => typeof item === 'string')
    );
  }
  return [];
}

function extractSection(content: string, names: string[]): string {
  const normalizedNames = new Set(names.map((name) => name.trim().toLowerCase()));
  const lines = content.split(/\r?\n/);

  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const headingMatch = line.match(/^#{1,6}\s*(.+?)\s*$/);
    if (!headingMatch) continue;
    const headingName = (headingMatch[1] ?? '').toLowerCase();
    if (normalizedNames.has(headingName)) {
      startIndex = i + 1;
      break;
    }
  }

  if (startIndex < 0) {
    return '';
  }

  let endIndex = lines.length;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^#{1,6}\s+/.test(line)) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function parseTableRows(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      continue;
    }

    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length === 0) continue;

    // Skip markdown table separators: | --- | --- |
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }

    rows.push(cells);
  }

  return rows;
}

function parseCommandsFromContent(content: string): WorkerCommand[] {
  const section = extractSection(content, ['Commands', 'Command']);
  if (!section) return [];

  const rows = parseTableRows(section);
  const commands: WorkerCommand[] = [];

  for (const row of rows) {
    const first = row[0];
    if (!first || /^command$/i.test(first)) {
      continue;
    }

    const normalizedCommand = normalizeWorkerCommand(first);
    if (!normalizedCommand.startsWith('/')) {
      continue;
    }

    commands.push({
      command: normalizedCommand,
      description: row[1]?.trim() || undefined,
    });
  }

  // Fallback: bullet list commands
  if (commands.length === 0) {
    const lines = section.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*[-*]\s*`?(\/[a-z0-9][\w-]*)`?(?:\s*[-:]\s*(.+))?$/i);
      if (!match) continue;
      const command = match[1];
      if (!command) continue;
      commands.push({
        command,
        description: match[2]?.trim() || undefined,
      });
    }
  }

  return normalizeWorkerCommands(commands);
}

function parseSkillsFromContent(content: string): string[] {
  const section = extractSection(content, ['Skills', 'Skill']);
  if (!section) return [];

  const rows = parseTableRows(section);
  const skills: string[] = [];

  for (const row of rows) {
    const first = row[0];
    if (!first || /^skills?$/i.test(first)) {
      continue;
    }

    // Accept plain slugs and inline-code slugs.
    const cleaned = normalizeSkillSlug(first);
    if (!cleaned) continue;
    if (!/^[\w.-]+$/.test(cleaned)) continue;
    if (cleaned.startsWith('/')) continue;
    skills.push(cleaned);
  }

  // Fallback: bullet list skills
  if (skills.length === 0) {
    const lines = section.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*[-*]\s*`?([\w.-]+)`?(?:\s*[-:]\s*(.+))?$/i);
      if (!match) continue;
      const rawSkill = match[1];
      if (!rawSkill) continue;
      const cleaned = normalizeSkillSlug(rawSkill);
      if (!cleaned || cleaned.startsWith('/')) continue;
      skills.push(cleaned);
    }
  }

  return dedupeSkills(skills);
}

function parseWorkerFile(
  content: string,
  slug: string
): { metadata: WorkerMetadata; body: string; commands: WorkerCommand[]; skills: string[] } {
  const parsed = matter(content);
  const body = parsed.content.trim();

  const frontmatterName = typeof parsed.data.name === 'string' ? parsed.data.name.trim() : '';
  const frontmatterDescription =
    typeof parsed.data.description === 'string' ? parsed.data.description.trim() : '';

  const name = frontmatterName || extractFirstHeading(body) || slug;
  const description = frontmatterDescription || extractFirstParagraph(body) || `${name} worker`;

  const icon = validateIconValue(parsed.data.icon, 'Workers');
  const frontmatterCommands = parseFrontmatterCommands(parsed.data.commands);
  const frontmatterSkills = parseFrontmatterSkills(parsed.data.skills);
  const contentCommands = parseCommandsFromContent(body);
  const contentSkills = parseSkillsFromContent(body);

  const commands = normalizeWorkerCommands([...frontmatterCommands, ...contentCommands]);
  const skills = dedupeSkills([...frontmatterSkills, ...contentSkills]);

  return {
    metadata: {
      name,
      description,
      icon,
      commands,
      skills,
    },
    body,
    commands,
    skills,
  };
}

function findWorkerMarkdownFile(workerDir: string): string | null {
  for (const fileName of WORKER_MARKDOWN_FILES) {
    const filePath = join(workerDir, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

// ============================================================
// Load Operations
// ============================================================

function loadWorkerFromDir(
  workersDir: string,
  slug: string,
  source: WorkerSource
): LoadedWorker | null {
  const workerDir = join(workersDir, slug);
  if (!existsSync(workerDir) || !statSync(workerDir).isDirectory()) {
    return null;
  }

  const markdownFile = findWorkerMarkdownFile(workerDir);
  if (!markdownFile) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(markdownFile, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseWorkerFile(content, slug);

  return {
    slug,
    metadata: parsed.metadata,
    content: parsed.body,
    commands: parsed.commands,
    skills: parsed.skills,
    path: workerDir,
    filePath: markdownFile,
    source,
  };
}

function loadWorkersFromDir(workersDir: string, source: WorkerSource): LoadedWorker[] {
  if (!existsSync(workersDir)) {
    return [];
  }

  const workers: LoadedWorker[] = [];

  try {
    const entries = readdirSync(workersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const worker = loadWorkerFromDir(workersDir, entry.name, source);
      if (worker) {
        workers.push(worker);
      }
    }
  } catch {
    // Ignore directory scan errors.
  }

  return workers;
}

/**
 * Load a single worker from a workspace.
 */
export function loadWorker(workspaceRoot: string, slug: string): LoadedWorker | null {
  const workersDir = getWorkspaceWorkersPath(workspaceRoot);
  return loadWorkerFromDir(workersDir, slug, 'workspace');
}

/**
 * Load all workspace-scoped workers.
 */
export function loadWorkspaceWorkers(workspaceRoot: string): LoadedWorker[] {
  const workersDir = getWorkspaceWorkersPath(workspaceRoot);
  return loadWorkersFromDir(workersDir, 'workspace');
}

/**
 * Load workers from all sources (global, workspace, project).
 * Priority: global < workspace < project.
 */
export function loadAllWorkers(workspaceRoot: string, projectRoot?: string): LoadedWorker[] {
  const workersBySlug = new Map<string, LoadedWorker>();

  for (const worker of loadWorkersFromDir(GLOBAL_AGENT_WORKERS_DIR, 'global')) {
    workersBySlug.set(worker.slug, worker);
  }

  for (const worker of loadWorkspaceWorkers(workspaceRoot)) {
    workersBySlug.set(worker.slug, worker);
  }

  if (projectRoot) {
    const projectWorkersDir = join(projectRoot, PROJECT_AGENT_WORKERS_DIR);
    for (const worker of loadWorkersFromDir(projectWorkersDir, 'project')) {
      workersBySlug.set(worker.slug, worker);
    }
  }

  return Array.from(workersBySlug.values());
}
