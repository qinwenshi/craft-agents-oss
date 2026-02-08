# Workers

Workers are plugin-like role profiles. A worker maps slash commands (for example `/analyze`) to a reusable instruction profile and optional skill bundle.

## Directory Structure

Workers can be loaded from three locations:

```
~/.agents/workers/{worker-slug}/
~/.craft-agent/workspaces/{workspace}/workers/{worker-slug}/
{projectRoot}/.agents/workers/{worker-slug}/
```

Resolution order (highest priority wins for same slug):

1. Project (`{projectRoot}/.agents/workers`)
2. Workspace (`~/.craft-agent/workspaces/{workspace}/workers`)
3. Global (`~/.agents/workers`)

Supported markdown filenames (first match wins):

- `WORKER.md`
- `README.md`

## Frontmatter

Frontmatter is optional, but recommended:

```yaml
---
name: Data Analyst
description: SQL, data exploration, visualization, dashboarding, and QA.
skills:
  - sql-queries
  - data-exploration
  - data-visualization
commands:
  - command: /analyze
    description: Answer data questions end-to-end
  - command: /write-query
    description: Write optimized SQL for your dialect
---
```

## Commands And Skills Sections

Commands and skills can also be declared in markdown tables:

```md
## Commands
| Command | Description |
|---------|-------------|
| /analyze | Answer data questions |
| /write-query | Write optimized SQL |

## Skills
| Skill | Description |
|-------|-------------|
| sql-queries | SQL best practices |
| data-visualization | Chart design and code patterns |
```

## Runtime Behavior

When a user message starts with a worker command:

- Craft Agent resolves the matching worker.
- The worker profile is injected as structured context for that turn.
- Worker skills are added as recommended skill mentions.
- The original user message remains unchanged in chat history.

## Example

`{projectRoot}/.agents/workers/data-analyst/README.md` or `workers/data-analyst/README.md`

```md
---
name: Data Analyst
description: SQL queries, exploration, visualization, dashboards, and QA.
skills:
  - sql-queries
  - data-exploration
  - data-visualization
commands:
  - command: /analyze
    description: Answer data questions
  - command: /explore-data
    description: Profile and explore a dataset
  - command: /write-query
    description: Write optimized SQL
  - command: /create-viz
    description: Create publication-quality visualizations
  - command: /build-dashboard
    description: Build interactive dashboards
  - command: /validate
    description: QA an analysis before sharing
---

Use this worker for analytics requests.
Prioritize clear assumptions, verifiable calculations, and method validation.
```
