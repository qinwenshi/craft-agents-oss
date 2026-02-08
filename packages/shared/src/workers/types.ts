/**
 * Workers Types
 *
 * Type definitions for workspace workers.
 * Workers are plugin-like profiles that define slash commands and skill bundles.
 */

/**
 * Worker command definition
 */
export interface WorkerCommand {
  /** Slash command trigger (must include leading "/") */
  command: string;
  /** Optional human-readable description */
  description?: string;
}

/**
 * Worker metadata from README.md/WORKER.md YAML frontmatter
 */
export interface WorkerMetadata {
  /** Display name for the worker */
  name: string;
  /** Brief description shown in UI */
  description: string;
  /** Optional icon (emoji or URL) */
  icon?: string;
  /** Optional skills this worker should prefer */
  skills?: string[];
  /** Optional command declarations */
  commands?: WorkerCommand[];
}

/** Source of a loaded worker */
export type WorkerSource = 'global' | 'workspace' | 'project';

/**
 * A loaded worker with parsed content
 */
export interface LoadedWorker {
  /** Directory name (slug) */
  slug: string;
  /** Parsed metadata from YAML frontmatter */
  metadata: WorkerMetadata;
  /** Full markdown content (without frontmatter) */
  content: string;
  /** Normalized command list */
  commands: WorkerCommand[];
  /** Normalized skill slug list */
  skills: string[];
  /** Absolute path to worker directory */
  path: string;
  /** Absolute path to worker markdown file */
  filePath: string;
  /** Where this worker was loaded from */
  source: WorkerSource;
}

/**
 * Resolved invocation when user input matches a worker command.
 */
export interface ResolvedWorkerInvocation {
  worker: LoadedWorker;
  command: WorkerCommand;
  /** Remaining user prompt after the slash command */
  prompt: string;
  /** Matched command text from user input (e.g. "/analyze") */
  rawCommandText: string;
  /** Start index of matched command in original message */
  commandStart: number;
  /** End index of matched command in original message */
  commandEnd: number;
}

