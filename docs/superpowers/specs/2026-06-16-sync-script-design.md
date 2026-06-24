# Sync Script Design

> 把 `.claude/` 从 `my_harness` 拷贝/同步进目标项目并保持更新。

## Approach

**A. 简单文件同步** — `generate.js` 负责组装 `.claude/` 产物，`sync.js` 只负责把产物安全分发到目标项目。以源 `.claude/` 为唯一真相源，逐文件 buffer 比较后拷贝。

## Scope boundary

- `generate.js`: assembly (manifest → submodule + overlay → `.claude/`)
- `sync.js`: distribution (source `.claude/` → target projects)
- No manifest awareness in sync — `--build` (default) guarantees source is fresh
- Managed scope only: `skills/`, `hooks/`, `commands/`, `settings.json`; everything else preserved

## CLI Interface

```
node sync.js                              # build + sync
node sync.js --targets <path1> <path2>    # explicit targets
node sync.js --config <file>              # custom config file
node sync.js --no-build                   # skip generate.js
node sync.js --prune                      # delete source-missing managed files
node sync.js --overwrite-settings         # replace settings.json (skip merge)
node sync.js --dry-run                    # preview only, no writes
node sync.js --verbose                    # detailed output
```

Priority: `--targets` > `--config` > `harness/sync-targets.json`

## Target Configuration

File: `harness/sync-targets.json`

```json
[
  "D:/01_Projects/Active/project-a",
  {
    "path": "D:/01_Projects/Active/project-b",
    "prune": true,
    "overwriteSettings": false
  }
]
```

- String entries: default behavior (no prune, merge settings)
- Object entries: optional `prune` and `overwriteSettings` per target
- CLI flags `--prune` / `--overwrite-settings` force all targets
- Without CLI flags: per-target config wins; absent = false

## Core Flow

```
1. Unless --no-build: run generate.js
   - On failure: abort entire sync, exit non-zero
2. Resolve target list (CLI > --config > default config)
3. For each target:
   a. Validate: path exists, is directory; skip + error if not
   b. Ensure target .claude/ exists (create if missing = init)
   c. Sync managed directories (skills/ hooks/ commands/)
      - For each file in source: compare buffer with target
      - Different → copy (overwrite)
      - Same → skip
   d. If --prune:
      - For each file in target managed dirs not in source → delete
      - Remove empty directories after pruning
   e. settings.json:
      - Target missing → write source
      - Target present + --overwrite-settings → replace
      - Target present (default) → deep merge (see rules)
      - JSON parse error → mark target failed, skip
4. Print summary
```

## Managed Scope

| Path | Strategy |
|------|----------|
| `.claude/skills/**/*` | Buffer-compare, overwrite if different; `--prune` deletes extra |
| `.claude/hooks/*` | Same |
| `.claude/commands/*` | Same |
| `.claude/settings.json` | Deep merge or overwrite (see below) |
| Everything else in `.claude/` | Never touched |

## settings.json Merge Rules

Merged only when target already has `settings.json` and `--overwrite-settings` is NOT set.

1. `permissions.allow`: union (source ∪ target)
2. `permissions.deny`: union (source ∪ target)
3. `hooks.<Event>`: merge arrays, deduplicate by `type + command` key
4. Other top-level fields: target priority; source keys missing in target are added
5. JSON parse failure on target: error, mark target failed, do NOT overwrite

## Comparison

- Buffer comparison (no mtime, no size shortcut)
- Read source file buffer, read target file buffer, `Buffer.equals()`
- Only write when different

## Error Handling

| Failure | Behavior |
|---------|----------|
| `generate.js` fails | Abort entire sync, exit non-zero |
| Target path missing / not a directory | Skip target, mark `failed`, continue |
| File copy fails (permission, disk) | Skip file, mark target `failed`, continue |
| `settings.json` parse error | Mark target `failed`, skip settings for that target |

A target is `failed` if any error occurred during its sync; it is `OK` only if all operations succeeded without error.

## Output Format

```
=== sync ===
source:  D:/01_Projects/Active/my_harness/.claude
targets: 2 project(s)

[1/2] D:/01_Projects/Active/project-a
  skills:     34 up-to-date, 0 updated
  hooks:      3 up-to-date, 0 updated
  commands:   5 up-to-date, 0 updated
  settings:   merged (3 hooks, 12 permissions)
  OK

[2/2] D:/01_Projects/Active/project-b
  skills:     30 up-to-date, 4 updated
  hooks:      2 up-to-date, 1 updated
  commands:   4 up-to-date, 1 updated
  settings:   merged (5 hooks, 12 permissions)
  OK

Done: 2 succeeded, 0 failed
```

Dry-run mode replaces counts with "would update" / "would delete" / "would merge".

Verbose mode adds per-file lines.

## File Structure

```
harness/
├── sync.js              # CLI entry + orchestration (~150 lines)
├── sync.test.js         # Tests: CLI, integration, unit (~350 lines)
├── sync-targets.json    # Default target list (user-maintained)
├── generate.js          # Existing, unchanged
├── manifest.json        # Existing, unchanged
└── lib/
    ├── resolve.js       # Existing (loadManifest reusable)
    └── sync.js          # Core sync logic (~200 lines)
```

## Test Strategy

Single test file `harness/sync.test.js` covering:

1. Target list parsing (string entries, object entries, mixed)
2. CLI flag parse (--targets, --config, --prune, etc.)
3. File copy (new file, changed file, unchanged file)
4. Prune (delete managed-extra, preserve unmanaged)
5. settings.json merge (union, deduplication, target priority, parse error)
6. settings.json overwrite
7. Dry-run (no file writes)
8. Error handling (missing target, file write failure)
9. Build integration (--no-build skips, failure aborts)
10. Output format verification (OK vs failed counting)

Use temp directories for all file I/O tests (zero side effects).

## Non-Goals

- Auto-scan parent directory for projects
- Symlink / junction mode
- Git submodule mode
- Network / remote sync
- Daemon / watch mode
- `.gitignore` management in target projects
- `--no-prune` flag (prune is off by default)
