import { describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadWorkspaceWorkers } from '../storage.ts';

describe('loadWorkspaceWorkers', () => {
  it('loads commands and skills from worker README.md', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-worker-test-'));
    const workerDir = join(workspaceRoot, 'workers', 'data-analyst');
    mkdirSync(workerDir, { recursive: true });

    writeFileSync(
      join(workerDir, 'README.md'),
      `---
name: Data Analyst
description: SQL and analytics collaborator
---

## Commands
| Command | Description |
|---------|-------------|
| /analyze | Answer data questions |
| /write-query | Write optimized SQL |

## Skills
| Skill | Description |
|-------|-------------|
| sql-queries | SQL best practices |
| data-visualization | Visualization patterns |
`,
      'utf-8'
    );

    const workers = loadWorkspaceWorkers(workspaceRoot);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.slug).toBe('data-analyst');
    expect(workers[0]?.commands.map((c) => c.command)).toEqual(['/analyze', '/write-query']);
    expect(workers[0]?.skills).toEqual(['sql-queries', 'data-visualization']);
  });
});

