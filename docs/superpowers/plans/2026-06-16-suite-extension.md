# Suite Extension: hooks, commands, settings.json — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `.claude/` suite with `hooks/` (RTK rewrite + safety guard), `commands/` (5 selected from RTK), and `settings.json` via expanded manifest + multi-category generator.

**Architecture:** `harness/manifest.json` gains `hooks`/`commands` arrays + `sources.rtk`. `harness/generate.js` gains per-category `rmSync`+`cpSync`+overlay loops. `harness/lib/resolve.js` gains validation for new categories. New overlay dirs: `harness/overlays/hooks/` (3 ps1 files), `harness/overlays/commands/` (2 adapted md files). `harness/settings.json` as static template.

**Tech Stack:** Node.js (no deps), PowerShell 7+ (for hook scripts), JSON

**Skills overlay paths**: Existing `harness/overlays/<skill-name>/` structure is NOT changed. Hooks/commands overlays go in `harness/overlays/hooks/` and `harness/overlays/commands/`.

---

### Task 1: Extend manifest.json

**Files:**
- Modify: `harness/manifest.json`

- [ ] **Step 1: Add `sources.rtk` and `hooks`/`commands` arrays**

Edit `harness/manifest.json`:

```json
{
  "sources": {
    "matt": "third-party/skills/skills",
    "sp": "third-party/superpowers/skills",
    "rtk": "third-party/rtk/.claude"
  },
  "skills": [
    { "name": "using-superpowers", "source": "sp", "path": "using-superpowers" },
    { "name": "brainstorming", "source": "sp", "path": "brainstorming" },
    { "name": "writing-plans", "source": "sp", "path": "writing-plans" },
    { "name": "executing-plans", "source": "sp", "path": "executing-plans" },
    { "name": "subagent-driven-development", "source": "sp", "path": "subagent-driven-development" },
    { "name": "dispatching-parallel-agents", "source": "sp", "path": "dispatching-parallel-agents" },
    { "name": "using-git-worktrees", "source": "sp", "path": "using-git-worktrees" },
    { "name": "finishing-a-development-branch", "source": "sp", "path": "finishing-a-development-branch" },
    { "name": "verification-before-completion", "source": "sp", "path": "verification-before-completion" },
    { "name": "writing-skills", "source": "sp", "path": "writing-skills" },
    { "name": "receiving-code-review", "source": "sp", "path": "receiving-code-review" },
    { "name": "requesting-code-review", "source": "sp", "path": "requesting-code-review" },
    { "name": "tdd", "source": "matt", "path": "engineering/tdd" },
    { "name": "diagnose", "source": "matt", "path": "engineering/diagnose" },
    { "name": "to-prd", "source": "matt", "path": "engineering/to-prd" },
    { "name": "to-issues", "source": "matt", "path": "engineering/to-issues" },
    { "name": "triage", "source": "matt", "path": "engineering/triage" },
    { "name": "prototype", "source": "matt", "path": "engineering/prototype" },
    { "name": "grill-with-docs", "source": "matt", "path": "engineering/grill-with-docs" },
    { "name": "improve-codebase-architecture", "source": "matt", "path": "engineering/improve-codebase-architecture" },
    { "name": "zoom-out", "source": "matt", "path": "engineering/zoom-out" },
    { "name": "setup-matt-pocock-skills", "source": "matt", "path": "engineering/setup-matt-pocock-skills" },
    { "name": "review", "source": "matt", "path": "in-progress/review" },
    { "name": "caveman", "source": "matt", "path": "productivity/caveman" },
    { "name": "handoff", "source": "matt", "path": "productivity/handoff" },
    { "name": "setup-pre-commit", "source": "matt", "path": "misc/setup-pre-commit" },
    { "name": "git-guardrails-claude-code", "source": "matt", "path": "misc/git-guardrails-claude-code" },
    { "name": "scaffold-exercises", "source": "matt", "path": "misc/scaffold-exercises" },
    { "name": "teach", "source": "matt", "path": "productivity/teach", "manualOnly": true },
    { "name": "edit-article", "source": "matt", "path": "personal/edit-article", "manualOnly": true },
    { "name": "obsidian-vault", "source": "matt", "path": "personal/obsidian-vault", "manualOnly": true },
    { "name": "writing-beats", "source": "matt", "path": "in-progress/writing-beats", "manualOnly": true },
    { "name": "writing-fragments", "source": "matt", "path": "in-progress/writing-fragments", "manualOnly": true },
    { "name": "writing-shape", "source": "matt", "path": "in-progress/writing-shape", "manualOnly": true }
  ],
  "hooks": [
    { "name": "rtk-rewrite.ps1", "source": "overlay" },
    { "name": "safety-guard.ps1", "source": "overlay" },
    { "name": "rtk-suggest.ps1", "source": "overlay" }
  ],
  "commands": [
    { "name": "diagnose.md", "source": "rtk", "path": "commands/diagnose.md" },
    { "name": "worktree.md", "source": "rtk", "path": "commands/worktree.md" },
    { "name": "clean-worktree.md", "source": "rtk", "path": "commands/clean-worktree.md" },
    { "name": "codereview.md", "source": "overlay" },
    { "name": "audit-codebase.md", "source": "overlay" }
  ],
  "settings": {}
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('harness/manifest.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add harness/manifest.json
git commit -m "feat: extend manifest with hooks, commands, rtk source"
```

---

### Task 2: Extend lib/resolve.js

**Files:**
- Modify: `harness/lib/resolve.js`

- [ ] **Step 1: Read current resolve.js**

Current file at `harness/lib/resolve.js`:

```javascript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  const m = JSON.parse(raw);
  const names = new Set();
  for (const s of m.skills) {
    if (!s.name) throw new Error('skill entry missing name');
    if (names.has(s.name)) throw new Error(`duplicate skill name: ${s.name}`);
    names.add(s.name);
    if (!m.sources[s.source]) throw new Error(`unknown source: ${s.source}`);
  }
  return m;
}

export function resolveSkillDir(manifest, entry, repoRoot) {
  const base = manifest.sources[entry.source];
  return join(repoRoot, base, entry.path);
}
```

- [ ] **Step 2: Extend loadManifest to validate hooks and commands**

```javascript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function validateEntries(entries, sources, category) {
  const names = new Set();
  for (const e of entries) {
    if (!e.name) throw new Error(`${category} entry missing name`);
    if (names.has(e.name)) throw new Error(`duplicate ${category} name: ${e.name}`);
    names.add(e.name);

    if (e.source === 'overlay') continue;

    if (!sources[e.source]) throw new Error(`unknown source "${e.source}" on ${category} "${e.name}"`);

    if (!e.path) throw new Error(`${category} "${e.name}" with source "${e.source}" is missing path`);
  }
}

export function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  const m = JSON.parse(raw);

  validateEntries(m.skills, m.sources, 'skill');

  if (m.hooks) validateEntries(m.hooks, m.sources, 'hook');

  if (m.commands) validateEntries(m.commands, m.sources, 'command');

  return m;
}

export function resolveSourcePath(manifest, entry, repoRoot) {
  if (entry.source === 'overlay') return null;
  const base = manifest.sources[entry.source];
  return join(repoRoot, base, entry.path);
}
```

Key changes from old code:
- Renamed `resolveSkillDir` → `resolveSourcePath`
- Returns `null` for `source: "overlay"` (no source to copy)
- Unified `validateEntries` validates skills (unchanged rules), hooks, commands
- `hooks` and `commands` are optional in manifest (backward compatible)

- [ ] **Step 3: Commit**

```bash
git add harness/lib/resolve.js
git commit -m "feat: extend resolve.js with hooks/commands validation"
```

---

### Task 3: Create harness/settings.json template

**Files:**
- Create: `harness/settings.json`

- [ ] **Step 1: Write template file**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(node --test *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git status *)"
    ],
    "deny": []
  },
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/rtk-rewrite.ps1",
        "timeout": 5
      },
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/safety-guard.ps1",
        "timeout": 3
      }
    ]
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('harness/settings.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add harness/settings.json
git commit -m "feat: add settings.json template for .claude/ suite"
```

---

### Task 4: Create harness/overlays/hooks/rtk-rewrite.ps1

**Files:**
- Create: `harness/overlays/hooks/rtk-rewrite.ps1`

- [ ] **Step 1: Create directory**

```bash
New-Item -ItemType Directory -Path "harness/overlays/hooks" -Force
```

- [ ] **Step 2: Write rtk-rewrite.ps1**

```powershell
# rtk-rewrite.ps1 — RTK command rewrite hook (PreToolUse:Bash)
# PowerShell port of rtk-rewrite.sh semantics.
#
# Exit code protocol (matching RTK's `rtk rewrite`):
#   0 + stdout  Rewrite found → auto-allow
#   1           No RTK equivalent → pass through (no rewrite)
#   2           Deny rule → pass through
#   3 + stdout  Ask rule → rewrite but prompt user
#
# Graceful degradation: if `rtk` is not found, exits 1 silently.
# If `rtk` IS found but the command has no rewrite, exits 1 silently.
# Only emits stderr warnings when RTK is detected as available but
# the rewrite call genuinely fails for unexpected reasons.

param()

$ErrorActionPreference = 'Stop'

$inputJson = $input | Out-String
if (-not $inputJson) { exit 1 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 1
}

$cmd = $data.tool_input.command
if (-not $cmd) { exit 1 }

# Skip heredocs
if ($cmd -match '<<') { exit 1 }

# Check if rtk is available
$rtkPath = (Get-Command rtk -ErrorAction SilentlyContinue).Source
if (-not $rtkPath) {
    # RTK not installed — silent pass-through
    exit 1
}

# Call rtk rewrite
try {
    $rewritten = & rtk rewrite $cmd 2>$null
    $exitCode = $LASTEXITCODE
} catch {
    exit 1
}

switch ($exitCode) {
    0 {
        if ($cmd -eq $rewritten) { exit 1 }
    }
    1 { exit 1 }
    2 { exit 1 }
    3 { }
    default { exit 1 }
}

# Build updated tool_input
$updatedInput = $data.tool_input | ConvertTo-Json -Compress
$updated = ($updatedInput | ConvertFrom-Json)
$updated.command = $rewritten

if ($exitCode -eq 3) {
    # Ask: rewrite, let Claude Code prompt user
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            updatedInput = $updated
        }
    } | ConvertTo-Json -Compress
} else {
    # Allow: auto-allow the rewrite
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            permissionDecision = 'allow'
            permissionDecisionReason = 'RTK auto-rewrite'
            updatedInput = $updated
        }
    } | ConvertTo-Json -Compress
}

Write-Output $output
exit 0
```

- [ ] **Step 3: Commit**

```bash
git add harness/overlays/hooks/rtk-rewrite.ps1
git commit -m "feat: add rtk-rewrite.ps1 hook (PowerShell port)"
```

---

### Task 5: Create harness/overlays/hooks/safety-guard.ps1

**Files:**
- Create: `harness/overlays/hooks/safety-guard.ps1`

- [ ] **Step 1: Write safety-guard.ps1**

```powershell
# safety-guard.ps1 — Independent safety hook (PreToolUse:Bash)
# No external dependencies. Intercepts dangerous commands before execution.
#
# Exit code protocol:
#   0 + stdout  "deny"  → blocks command, shows warning
#   0 + stdout  "ask"   → rewrites command with confirmation prompt prepended
#   1           pass through (safe or unrecognized)
#
# Guarded operations:
#   - git push --force / --force-with-lease to main/master (deny)
#   - git push --force / --force-with-lease to other branches (ask)
#   - Remove-Item -Recurse -Force on non-temp paths (ask)
#   - rm -rf outside /tmp (ask)
#   - Writing to system directories: C:\Windows, /etc, /usr, /boot (deny)

param()

$ErrorActionPreference = 'Stop'

$inputJson = $input | Out-String
if (-not $inputJson) { exit 1 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 1
}

$cmd = $data.tool_input.command
if (-not $cmd) { exit 1 }

$normalized = $cmd.Trim()

# --- git push --force detection ---
if ($normalized -match 'git\s+push\s+.*(--force|--force-with-lease|-[^-]*f\b)') {
    # Extract branch if present (after remote, or positionally)
    $branch = ''
    if ($normalized -match 'git\s+push\s+.*?\s+(\S+)\s*$') {
        $branch = $matches[1]
    }

    if ($branch -eq 'main' -or $branch -eq 'master' -or $branch -eq 'origin/main' -or $branch -eq 'origin/master') {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'deny'
                permissionDecisionReason = "Force push to $branch is blocked by safety guard. Use a feature branch or manually confirm via git CLI outside Claude Code."
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }

    # Other branches: ask for confirmation via systemMessage
    $output = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            permissionDecision = 'ask'
            permissionDecisionReason = "Force push to '$branch' requires confirmation. Are you sure?"
        }
    } | ConvertTo-Json -Compress
    Write-Output $output
    exit 0
}

# --- Dangerous Remove-Item detection ---
if ($normalized -match 'Remove-Item\s+.*(-Recurse|-r)\s+.*(-Force)') {
    $isSafe = ($normalized -match '\$env:TEMP|/tmp|/var/tmp|\\AppData\\Local\\Temp')
    if (-not $isSafe) {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'ask'
                permissionDecisionReason = 'Dangerous recursive force delete detected. Confirm target path is correct.'
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# --- rm -rf outside safe dirs ---
if ($normalized -match 'rm\s+.*(-rf|-fr|--recursive.*--force|--force.*--recursive)') {
    $isSafe = ($normalized -match '/tmp|/var/tmp|\$TEMP|\$env:TEMP|node_modules|\.worktrees|\.git/')
    if (-not $isSafe) {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'ask'
                permissionDecisionReason = 'Dangerous recursive force remove detected. Confirm target path is correct.'
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# --- Write to system directories (deny) ---
$sysDirs = @(
    'C:\\Windows', '/etc', '/usr', '/boot', '/lib', '/bin', '/sbin',
    '/System', '/Library', 'C:\\Program Files', 'C:\\Program Files (x86)'
)
foreach ($dir in $sysDirs) {
    $escapedDir = [regex]::Escape($dir)
    if ($normalized -match "$escapedDir") {
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PreToolUse'
                permissionDecision = 'deny'
                permissionDecisionReason = "Writing to system directory '$dir' is blocked by safety guard."
            }
        } | ConvertTo-Json -Compress
        Write-Output $output
        exit 0
    }
}

# Pass through — command is safe
exit 1
```

- [ ] **Step 2: Commit**

```bash
git add harness/overlays/hooks/safety-guard.ps1
git commit -m "feat: add safety-guard.ps1 hook"
```

---

### Task 6: Create harness/overlays/hooks/rtk-suggest.ps1

**Files:**
- Create: `harness/overlays/hooks/rtk-suggest.ps1`

- [ ] **Step 1: Write rtk-suggest.ps1**

```powershell
# rtk-suggest.ps1 — RTK suggestion hook (PreToolUse:Bash)
# Emits systemMessage when RTK-compatible commands are detected.
# Does NOT modify command execution — pure suggestion.
# Generated but NOT registered in settings.json by default.
#
# Exit code protocol:
#   0 + stdout (with systemMessage) → Claude Code shows suggestion
#   1 → pass through (no suggestion)

param()

$ErrorActionPreference = 'Stop'

$inputJson = $input | Out-String
if (-not $inputJson) { exit 1 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 1
}

$cmd = $data.tool_input.command
if (-not $cmd) { exit 1 }

$firstCmd = ($cmd -split '\s*\|\s*|\s*&&\s*|\s*\|\|\s*')[0].Trim()

# Already using rtk? Skip
if ($firstCmd -match '^rtk\s') { exit 1 }

# Skip heredocs
if ($firstCmd -match '<<') { exit 1 }

$suggestion = ''

# Git commands
if ($firstCmd -match '^git\s+status(\s|$)')    { $suggestion = 'rtk git status' }
elseif ($firstCmd -match '^git\s+diff(\s|$)')   { $suggestion = 'rtk git diff' }
elseif ($firstCmd -match '^git\s+log(\s|$)')    { $suggestion = 'rtk git log' }
elseif ($firstCmd -match '^git\s+add(\s|$)')    { $suggestion = 'rtk git add' }
elseif ($firstCmd -match '^git\s+commit(\s|$)') { $suggestion = 'rtk git commit' }
elseif ($firstCmd -match '^git\s+push(\s|$)')   { $suggestion = 'rtk git push' }
elseif ($firstCmd -match '^git\s+pull(\s|$)')   { $suggestion = 'rtk git pull' }
elseif ($firstCmd -match '^git\s+branch(\s|$)') { $suggestion = 'rtk git branch' }
elseif ($firstCmd -match '^git\s+fetch(\s|$)')  { $suggestion = 'rtk git fetch' }
elseif ($firstCmd -match '^git\s+stash(\s|$)')  { $suggestion = 'rtk git stash' }

# Cargo commands
elseif ($firstCmd -match '^cargo\s+test(\s|$)')   { $suggestion = 'rtk cargo test' }
elseif ($firstCmd -match '^cargo\s+build(\s|$)')  { $suggestion = 'rtk cargo build' }
elseif ($firstCmd -match '^cargo\s+clippy(\s|$)') { $suggestion = 'rtk cargo clippy' }
elseif ($firstCmd -match '^cargo\s+check(\s|$)')  { $suggestion = 'rtk cargo check' }
elseif ($firstCmd -match '^cargo\s+fmt(\s|$)')    { $suggestion = 'rtk cargo fmt' }

# File ops
elseif ($firstCmd -match '^cat\s+')               { $suggestion = $cmd -replace '^cat\s+', 'rtk read ' }
elseif ($firstCmd -match '^(rg|grep)\s+')         { $suggestion = $cmd -replace '^(rg|grep)\s+', 'rtk grep ' }
elseif ($firstCmd -match '^ls(\s|$)')             { $suggestion = $cmd -replace '^ls(\s|$)', 'rtk ls$1' }

# GitHub CLI
elseif ($firstCmd -match '^gh\s+(pr|issue|run)(\s|$)') { $suggestion = $cmd -replace '^gh\s+', 'rtk gh ' }

# Docker
elseif ($firstCmd -match '^docker\s+(ps|images|logs)(\s|$)') { $suggestion = $cmd -replace '^docker\s+', 'rtk docker ' }

# Node.js
elseif ($firstCmd -match '^(npx\s+)?vitest(\s|$)')  { $suggestion = 'rtk vitest' }
elseif ($firstCmd -match '^(npx\s+)?tsc(\s|$)')     { $suggestion = 'rtk tsc' }
elseif ($firstCmd -match '^(npx\s+)?eslint(\s|$)')  { $suggestion = 'rtk lint' }

if (-not $suggestion) { exit 1 }

$output = @{
    hookSpecificOutput = @{
        hookEventName = 'PreToolUse'
        permissionDecision = 'allow'
        systemMessage = "`u{26A1} RTK available: ``$suggestion`` (60-90% token savings)"
    }
} | ConvertTo-Json -Compress

Write-Output $output
exit 0
```

- [ ] **Step 2: Commit**

```bash
git add harness/overlays/hooks/rtk-suggest.ps1
git commit -m "feat: add rtk-suggest.ps1 hook (unregistered)"
```

---

### Task 7: Create harness/overlays/commands/codereview.md (adapted from RTK)

**Files:**
- Create: `harness/overlays/commands/codereview.md`

- [ ] **Step 1: Create directory**

```bash
New-Item -ItemType Directory -Path "harness/overlays/commands" -Force
```

- [ ] **Step 2: Write codereview.md**

RTK's `/tech:codereview` is Rust-specific (cargo fmt, clippy, lazy_static patterns, `unwrap()` rules). Adapt to a language-agnostic code review command. Key changes:
- Remove: `cargo fmt/clippy/test`, `lazy_static!`, `unwrap()`, Rust-specific patterns
- Keep: review workflow (diff → analyze → report → fix loop), tiered severity (🔴🟡🟢), anti-hallucination rules
- Add: language-agnostic patterns (check lint commands, test commands, formatting)
- Command name: `/codereview`

File content:

```markdown
---
model: sonnet
description: Local pre-PR code review with tiered severity and optional auto-fix
argument-hint: "[--fix] [--verbose] [base-branch]"
---

# /codereview

Local review of the current branch before creating a PR. Applies quality criteria appropriate to the detected tech stack.

**Principle**: Preview local → fix → then create clean PR.

## Usage

```
/codereview                  # 🔴 + 🟡 only (compact)
/codereview --verbose        # + positive points + 🟢 details
/codereview main             # Review vs main (default: master)
/codereview --auto           # Review + fix loop (max 3 iterations)
/codereview --auto --max 5
```

Arguments: $ARGUMENTS

## Step 1: Gather context

```bash
# Parse arguments
VERBOSE=false
AUTO_MODE=false
MAX_ITERATIONS=3
BASE_BRANCH="master"

set -- "$ARGUMENTS"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=true; shift ;;
    --auto) AUTO_MODE=true; shift ;;
    --max) MAX_ITERATIONS="$2"; shift 2 ;;
    *) BASE_BRANCH="$1"; shift ;;
  esac
done

# Files changed
git diff "$BASE_BRANCH"...HEAD --name-only

# Full diff
git diff "$BASE_BRANCH"...HEAD

# Stats
git diff "$BASE_BRANCH"...HEAD --stat
```

## Step 2: Detect tech stack from changed files

| If diff contains...        | Check                    |
| -------------------------- | ------------------------ |
| `*.rs`                     | Rust conventions (no unwrap in prod, error context, lazy_static) |
| `*.ts` / `*.tsx`           | TypeScript strictness, no `any` abuse, proper error typing |
| `*.js` / `*.jsx`           | No implicit globals, proper error handling |
| `*.py`                     | Type hints, no bare except, docstrings |
| `Cargo.toml`               | Rust dependency audit |
| `package.json`             | NPM dependency changes, script integrity |
| `*.test.*` / `*.spec.*`    | Test quality (real vs mock, coverage intent) |
| `*.md` / `docs/`           | Documentation accuracy, broken links |
| `.github/workflows/`       | CI config correctness |

## Step 3: Analyze with tiered criteria

### 🔴 MUST FIX (blocking)

- Secrets or credentials hardcoded
- Error handling missing (silent failures, swallowed exceptions)
- Tests missing for new code
- Breaking API changes without migration path
- Security issues (shell injection, XSS, SQL injection, unsafe eval)
- Obvious bugs (null pointer, undefined access, off-by-one with visible impact)
- Infinite loops or unbounded recursion

### 🟡 SHOULD FIX (important)

- Function too long (>50 lines) — suggest split
- Deep nesting (>3 levels) — suggest early returns
- Missing input validation at API boundaries
- `console.log` / `println!` left in production code
- Duplicate code (copy-paste detected)
- Test with mock data instead of realistic fixtures
- Error messages too vague ("failed", "error")
- Missing logging at decision points

### 🟢 CAN SKIP (suggestions)

- Style preferences not enforced by linter
- Variable naming improvements (non-blocking)
- Minor refactoring opportunities
- Documentation improvements that don't affect correctness

## Step 4: Anti-hallucination rules (CRITICAL)

**BEFORE flagging any issue:**

1. **Verify existence** — read the file before claiming an issue exists there
2. **Read full context** — don't judge a diff hunk without reading its surrounding code
3. **Check existing patterns** — if the codebase already uses a pattern consistently (>10 occurrences), flag it as "Suggestion", not "Blocking"

**Do NOT flag:**
- Test files using patterns that are appropriate for tests (mocks, hardcoded values)
- `_unused` variables which may be intentional
- Patterns that match the project's established conventions

## Step 5: Generate report

### Compact format (default)

```markdown
## 🔍 Code Review

| 🔴  | 🟡  |
| :-: | :-: |
|  2  |  3  |

**[REQUEST CHANGES]** — secrets exposed + missing error handling

---

### 🔴 Blocking

• `src/auth.ts:45` — Hardcoded API key

\```typescript
// ❌ Before
const API_KEY = "sk-abc123...";
// ✅ After
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY not set");
\```

• `src/handler.ts:120` — Silent error swallow

\```typescript
// ❌ Before
try { await process(data); } catch (e) {}
// ✅ After
try { await process(data); } catch (e) {
  logger.error("process failed", { error: e, dataId: data.id });
  throw new ProcessingError("Failed to process data", { cause: e });
}
\```

### 🟡 Important

• `src/utils.ts:78` — Function 67 lines, suggest splitting into 2-3 helpers
• `src/api.ts:34` — Missing input validation on user-provided email field
• `src/new-feature.test.ts` — Tests use mock data instead of realistic fixtures

| Prio | File            | L   | Action                     |
| ---- | --------------- | --- | -------------------------- |
| 🔴   | src/auth.ts     | 45  | Remove hardcoded secret    |
| 🔴   | src/handler.ts  | 120 | Add error handling         |
| 🟡   | src/utils.ts    | 78  | Split function             |
| 🟡   | src/api.ts      | 34  | Add input validation       |
| 🟡   | src/new-feature | -   | Replace mocks with fixtures |
```

## Mode Auto (--auto)

```
/codereview --auto
    │
    ▼
┌─────────────────┐
│  1. Review      │  🔴🟡🟢 report
└────────┬────────┘
         │
    🔴 or 🟡?
    ┌────┴────┐
    │ NO     │ YES
    ▼         ▼
 ✅ DONE   ┌─────────────────┐
           │  2. Fix         │
           └────────┬────────┘
                    │
                    ▼
     ┌─────────────────────────────┐
     │  3. Quality gate            │
     │  Run project linter         │
     │  Run project type checker   │
     │  Run project tests          │
     └──────────────┬──────────────┘
                    │
              Loop ←┘ (max N iterations)
```

**Safeguards:**
- Never modify: config files with secrets, `.env*`, `*secret*`, lock files
- If >5 files modified → ask confirmation
- If quality gate fails → `git reset --hard HEAD` + report errors
- Atomic commits per pass: `fix(codereview): <issue summary>`

## Recommended workflow

```
1. Develop on feature branch
2. /codereview → preview issues (compact)
3a. Fix 🔴 and 🟡 manually
   OR
3b. /codereview --auto → automatic fix
4. /codereview → verify READY
5. gh pr create
```
```

- [ ] **Step 3: Commit**

```bash
git add harness/overlays/commands/codereview.md
git commit -m "feat: add codereview command (adapted from RTK, language-agnostic)"
```

---

### Task 8: Create harness/overlays/commands/audit-codebase.md (adapted from RTK)

**Files:**
- Create: `harness/overlays/commands/audit-codebase.md`

- [ ] **Step 1: Write audit-codebase.md**

RTK's `/tech:audit-codebase` is Rust-specific (cargo audit, cargo outdated, lazy_static, cargo fmt, etc.). Adapt to a language-agnostic codebase health audit. Key changes:
- Remove: `cargo audit`, `cargo outdated`, `lazy_static!` checks, `Cargo.toml` analysis
- Keep: 7-category structure + 0-10 scoring + 🟢🟡🔴 tiers + --fix mode
- Add: language-agnostic checks per category

File content:

```markdown
---
model: sonnet
description: Codebase Health Audit — 7 categories scored 0-10 with prioritized action plan
argument-hint: "[--category <cat>] [--fix]"
allowed-tools: [Read, Grep, Glob, Bash, Write]
---

# Audit Codebase — Project Health

Score global and per category (0-10) with prioritized action plan.

## Arguments

- `--category <cat>` — Audit a single category: `secrets`, `security`, `deps`, `structure`, `tests`, `perf`, `ai`
- `--fix` — After audit, propose prioritized fixes

## Usage

```
/audit-codebase
/audit-codebase --category security
/audit-codebase --fix
```

Arguments: $ARGUMENTS

## Scoring Thresholds

| Score | Tier      | Status             |
| ----- | --------- | ------------------ |
| 0-4   | 🔴 Tier 1 | Critical           |
| 5-7   | 🟡 Tier 2 | Needs improvement  |
| 8-10  | 🟢 Tier 3 | Production ready   |

## Phase 1: Audit Secrets (Weight: 2x)

```bash
# API keys hardcoded
Grep "sk-[a-zA-Z0-9]{20}" --glob "*.{ts,js,py,rs,go}"
Grep "Bearer [a-zA-Z0-9_-]{20,}" --glob "*.{ts,js,py,rs,go}"

# Passwords in code
Grep "password\s*=\s*\"" --glob "*.{ts,js,py,rs,go}"
Grep "secret\s*=\s*\"[^$]" --glob "*.{ts,js,py,rs,go}"

# .env accidentally committed
git ls-files | grep "\.env" | grep -v "\.env\.example\|\.env\.template"

# Hardcoded absolute paths
Grep "/home/[a-z]+/" --glob "*.{ts,js,py}"
Grep "C:\\\\Users\\\\" --glob "*.{ts,js,py}"
```

| Condition              | Score         |
| ---------------------- | ------------- |
| 0 secrets found        | 10/10         |
| Hardcoded absolute path| -1 per occ.   |
| Credential exposed     | 0/10 immediate|

## Phase 2: Audit Security (Weight: 2x)

Goal: No injection vectors, complete error handling, proper input validation.

```bash
# Shell injection potential
Grep "exec\(|eval\(|system\(" --glob "*.{ts,js,py}"

# Dangerous file operations
Grep "rm\s+-rf" --glob "*.{sh,ps1}"
Grep "Remove-Item.*-Recurse.*-Force" --glob "*.ps1"

# Missing error handling (bare try/catch in key modules)
Grep "catch\s*\(\s*\)\s*\{\s*\}" --glob "*.{ts,js}"

# Unsafe deserialization
Grep "eval\(|new Function\(|loads\(" --glob "*.{ts,js,py}"

# Insecure dependencies pattern
# Check package.json for known-vulnerable version patterns
# Check Cargo.toml / requirements.txt similarly
```

| Condition                      | Score         |
| ------------------------------ | ------------- |
| No vulnerabilities detected    | 10/10         |
| Shell injection potential      | -3 per occ.   |
| Missing error handling         | -1 per file   |
| Unsafe deserialization         | -2 per occ.   |

## Phase 3: Audit Dependencies (Weight: 1x)

```bash
# Outdated packages
npm outdated 2>&1 | tail -20          # Node.js
pip list --outdated 2>&1 | tail -20   # Python
cargo outdated 2>&1 | tail -20        # Rust

# Known vulnerabilities
npm audit 2>&1 | tail -20             # Node.js
pip-audit 2>&1 | tail -20             # Python
cargo audit 2>&1 | tail -20           # Rust

# Unused dependencies
npx depcheck 2>&1                     # Node.js
```

| Condition                      | Score         |
| ------------------------------ | ------------- |
| 0 high/critical vulns          | 10/10         |
| 1 moderate CVE                 | -1 per CVE    |
| 1+ high CVE                    | -2 per CVE    |
| 1+ critical CVE                | 0/10 immediate|
| Unused dependencies            | -1 per 5      |

## Phase 4: Audit Structure (Weight: 1.5x)

Goal: Codebase follows its own conventions, no orphaned code.

```bash
# Files without corresponding tests
# (compare src/ patterns against test/ patterns)

# God files (>500 lines)
find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rs" \
  | xargs wc -l | sort -rn | head -20

# Cyclic dependencies (check import patterns)
# Deepest directory nesting
find . -type d | awk -F'/' '{print NF-1}' | sort -rn | head -5
```

| Condition                      | Score         |
| ------------------------------ | ------------- |
| No files >500 lines            | 10/10         |
| Files >500 lines               | -1 per file   |
| Circular imports detected      | -2 per cycle  |
| Orphaned code (no references)  | -1 per file   |

## Phase 5: Audit Tests (Weight: 2x)

```bash
# Test file count vs source file count
SRC_COUNT=$(find . -name "*.ts" -not -name "*.test.*" -not -path "*/node_modules/*" | wc -l)
TEST_COUNT=$(find . -name "*.test.*" -name "*.spec.*" -not -path "*/node_modules/*" | wc -l)
echo "Source files: $SRC_COUNT, Test files: $TEST_COUNT"

# Test coverage (if available)
npx jest --coverage 2>&1 | tail -30   # Jest
pytest --cov 2>&1 | tail -30          # Python
cargo tarpaulin 2>&1 | tail -30       # Rust

# Flaky tests (check for .only, .skip patterns)
Grep "\.only\|\.skip\|xit\|xdescribe" --glob "*.test.*"
```

| Coverage %        | Score | Tier |
| ----------------- | ----- | ---- |
| <30% files tested | 3/10  | 🔴 1 |
| 30-49%            | 5/10  | 🟡 2 |
| 50-69%            | 7/10  | 🟡 2 |
| 70-89%            | 8/10  | 🟢 3 |
| 90%+              | 10/10 | 🟢 3 |

**Bonus**: No `.only`/`.skip` left in tests = +0.5. Smoke tests present = +0.5.

## Phase 6: Audit Performance (Weight: 2x)

Goal: No obvious performance anti-patterns.

```bash
# N+1 query patterns (ORM usage without eager loading)
Grep "\.forEach.*\.find\|for.*\.filter\|for.*await.*query" --glob "*.{ts,js}"

# Synchronous operations that should be async
Grep "readFileSync\|writeFileSync\|execSync" --glob "*.{ts,js}"

# Large bundles / assets
find . -name "*.js" -not -path "*/node_modules/*" -size +100k | head -10
find . -name "*.png" -not -path "*/node_modules/*" -size +500k | head -10
```

| Condition                      | Score         |
| ------------------------------ | ------------- |
| No N+1 patterns detected       | 10/10         |
| N+1 query patterns             | -3 per occ.   |
| sync FS in request path        | -2 per occ.   |
| Assets >500KB without lazy load| -1 per file   |

## Phase 7: Audit AI Patterns (Weight: 1x)

```bash
# CLAUDE.md / AGENTS.md presence and quality
wc -l CLAUDE.md AGENTS.md 2>/dev/null || echo "Missing"

# Skills defined
ls .claude/skills/ 2>/dev/null | wc -l

# Commands defined
ls .claude/commands/ 2>/dev/null | wc -l

# ADR / decision docs
ls docs/adr/ 2>/dev/null | wc -l

# CONTEXT.md
wc -l CONTEXT.md 2>/dev/null || echo "Missing"
```

| Condition                      | Score  |
| ------------------------------ | ------ |
| CLAUDE.md present + well-structured | +2 |
| >10 skills                     | +2     |
| >3 commands                    | +2     |
| ADR directory present          | +2     |
| CONTEXT.md present             | +2     |
| Score max                      | 10/10  |

## Phase 8: Global Score

```
Global score = (
  (secrets x 2) +
  (security x 2) +
  (structure x 1.5) +
  (tests x 2) +
  (perf x 2) +
  (deps x 1) +
  (ai x 1)
) / 11.5
```

## Output Format

```
🔍 Codebase Audit — {date}

┌──────────────┬───────┬────────┬──────────────────────────────┐
│ Category     │ Score │ Tier   │ Top issue                    │
├──────────────┼───────┼────────┼──────────────────────────────┤
│ Secrets      │  9.5  │ 🟢 T3  │ 0 issues                     │
│ Security     │  7.0  │ 🟡 T2  │ 3 potential injection sites  │
│ Structure    │  8.0  │ 🟢 T3  │ 2 files >500 lines           │
│ Tests        │  6.5  │ 🟡 T2  │ 60% files tested             │
│ Performance  │  9.0  │ 🟢 T3  │ No N+1 patterns              │
│ Dependencies │  8.0  │ 🟢 T3  │ 3 packages outdated          │
│ AI Patterns  │  8.5  │ 🟢 T3  │ CONTEXT.md missing           │
└──────────────┴───────┴────────┴──────────────────────────────┘

Global score: 8.1 / 10  [🟢 Tier 3]
```

## Action Plan (--fix)

```
📋 Plan to reach Tier 3

Priority 1 — Security (7.0 -> 8+):
  1. Fix 3 shell injection sites with parameterized commands — ~1h
  2. Add input validation at 2 API boundaries — ~1h

Priority 2 — Tests (6.5 -> 8+):
  1. Add tests for 4 untested modules — ~4h
  2. Replace mock data with realistic fixtures — ~2h

Estimated: ~8h of work
```
```

- [ ] **Step 2: Commit**

```bash
git add harness/overlays/commands/audit-codebase.md
git commit -m "feat: add audit-codebase command (adapted from RTK, language-agnostic)"
```

---

### Task 9: Extend generate.js for multi-category generation

**Files:**
- Modify: `harness/generate.js`

- [ ] **Step 1: Read current generate.js**

Current file at `harness/generate.js`:

```javascript
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, resolveSkillDir } from './lib/resolve.js';
import { ensureManualOnly } from './lib/frontmatter.js';

export function generate({ repoRoot, manifestPath, outDir, overlayDir }) {
  const manifest = loadManifest(manifestPath);
  const skillsOut = join(outDir, 'skills');
  rmSync(skillsOut, { recursive: true, force: true });
  mkdirSync(skillsOut, { recursive: true });

  const built = [];
  for (const entry of manifest.skills) {
    const src = resolveSkillDir(manifest, entry, repoRoot);
    if (!existsSync(src)) {
      throw new Error(`source missing for ${entry.name}: ${src}`);
    }
    const dest = join(skillsOut, entry.name);
    cpSync(src, dest, { recursive: true });

    if (overlayDir) {
      const ov = join(overlayDir, entry.name);
      if (existsSync(ov)) cpSync(ov, dest, { recursive: true, force: true });
    }

    if (entry.manualOnly) {
      const skillFile = join(dest, 'SKILL.md');
      writeFileSync(skillFile, ensureManualOnly(readFileSync(skillFile, 'utf8')));
    }
    built.push(entry.name);
  }
  return built;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const count = generate({
    repoRoot,
    manifestPath: resolve(import.meta.dirname, 'manifest.json'),
    outDir: resolve(repoRoot, '.claude'),
    overlayDir: resolve(import.meta.dirname, 'overlays'),
  }).length;
  console.log(`Generated .claude/skills with ${count} skills`);
}
```

- [ ] **Step 2: Rewrite generate.js with multi-category support**

```javascript
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { loadManifest, resolveSourcePath } from './lib/resolve.js';
import { ensureManualOnly } from './lib/frontmatter.js';

function generateCategory({ manifest, category, repoRoot, overlayDir, skillsOut, onBuilt }) {
  const entries = manifest[category];
  if (!entries || entries.length === 0) return;

  for (const entry of entries) {
    const destDir = join(skillsOut, entry.name);

    const src = resolveSourcePath(manifest, entry, repoRoot);
    if (src) {
      if (!existsSync(src)) {
        throw new Error(`source missing for ${category} "${entry.name}": ${src}`);
      }
      mkdirSync(dirname(destDir), { recursive: true });
      if (statSync(src).isDirectory()) {
        cpSync(src, destDir, { recursive: true });
      } else {
        mkdirSync(dirname(destDir), { recursive: true });
        copyFileSync(src, destDir);
      }
    } else {
      mkdirSync(dirname(destDir), { recursive: true });
    }

    if (overlayDir) {
      const ov = join(overlayDir, category, entry.name);
      if (existsSync(ov)) {
        if (statSync(ov).isDirectory()) {
          cpSync(ov, destDir, { recursive: true, force: true });
        } else {
          copyFileSync(ov, destDir);
        }
      }
    }

    if (category === 'skills' && entry.manualOnly) {
      const skillFile = join(destDir, 'SKILL.md');
      writeFileSync(skillFile, ensureManualOnly(readFileSync(skillFile, 'utf8')));
    }

    if (onBuilt) onBuilt(entry.name);
  }
}

export function generate({ repoRoot, manifestPath, outDir, overlayDir }) {
  const manifest = loadManifest(manifestPath);

  const cleanDirs = {
    skills: join(outDir, 'skills'),
    hooks: join(outDir, 'hooks'),
    commands: join(outDir, 'commands'),
  };

  for (const [category, dir] of Object.entries(cleanDirs)) {
    if (manifest[category] && manifest[category].length > 0) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
  }

  const built = { skills: [], hooks: [], commands: [] };

  for (const category of ['skills', 'hooks', 'commands']) {
    generateCategory({
      manifest,
      category,
      repoRoot,
      overlayDir,
      skillsOut: cleanDirs[category],
      onBuilt: (name) => built[category].push(name),
    });
  }

  return built;
}

export function generateSettings({ outDir, settingsPath }) {
  const settingsFile = join(outDir, 'settings.json');
  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, settingsFile);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const built = generate({
    repoRoot,
    manifestPath: resolve(import.meta.dirname, 'manifest.json'),
    outDir: resolve(repoRoot, '.claude'),
    overlayDir: resolve(import.meta.dirname, 'overlays'),
  });
  generateSettings({
    outDir: resolve(repoRoot, '.claude'),
    settingsPath: resolve(import.meta.dirname, 'settings.json'),
  });

  const total = built.skills.length + built.hooks.length + built.commands.length;
  console.log(`Generated .claude/: ${built.skills.length} skills, ${built.hooks.length} hooks, ${built.commands.length} commands`);
  console.log(`Total: ${total} files`);
}
```

Key design decisions:
- `generateCategory` handles skills, hooks, commands uniformly — each category just changes the directory layout and overlay path
- `statSync(src).isDirectory()` determines copy method (directory vs single file) — no extension-based guessing
- `source: "overlay"` entries: `resolveSourcePath` returns `null` → skip source copy, overlay handles the file
- `generateSettings` is separate: just copies `harness/settings.json` → `.claude/settings.json` (no rmSync)
- Manual-only logic stays scoped to `category === 'skills'`
- Each category only `rmSync`s its own directory and only if it has entries

- [ ] **Step 3: Commit**

```bash
git add harness/generate.js
git commit -m "feat: extend generate.js for hooks, commands, settings"
```

---

### Task 10: Extend generate.test.js

**Files:**
- Modify: `harness/generate.test.js`

- [ ] **Step 1: Read current test file (for context)**

Already read earlier. File has 14 tests across `generate.test.js`, `lib/frontmatter.test.js`, `lib/resolve.test.js`.

- [ ] **Step 2: Add test fixture for multi-category generation**

Add to `harness/generate.test.js`, after the overlay test at line 62:

```javascript
function setupMulti() {
  const root = mkdtempSync(join(tmpdir(), 'gen-'));
  mkdirSync(join(root, 'src', 'normal'), { recursive: true });
  writeFileSync(join(root, 'src', 'normal', 'SKILL.md'), '---\nname: normal\n---\nhi\n');
  mkdirSync(join(root, 'src', 'cmd-source'), { recursive: true });
  writeFileSync(join(root, 'src', 'cmd-source', 'mycmd.md'), '---\nmodel: haiku\n---\n# /mycmd\n');
  const manifestPath = join(root, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [
      { name: 'normal', source: 's', path: 'normal' },
    ],
    hooks: [
      { name: 'hook.ps1', source: 'overlay' },
    ],
    commands: [
      { name: 'mycmd.md', source: 's', path: 'cmd-source/mycmd.md' },
    ],
  }));
  const overlayDir = join(root, 'overlays');
  mkdirSync(join(overlayDir, 'hooks'), { recursive: true });
  writeFileSync(join(overlayDir, 'hooks', 'hook.ps1'), '# safety hook\n');
  return { root, manifestPath, outDir: join(root, '.claude'), overlayDir };
}
```

- [ ] **Step 3: Add test: multi-category generates hooks, commands, skills**

Add after the test added in T1/T2:

```javascript
test('generates hooks, commands, and skills in one run', () => {
  const { root, manifestPath, outDir, overlayDir } = setupMulti();
  const built = generate({ repoRoot: root, manifestPath, outDir, overlayDir });

  assert.deepEqual(built.skills, ['normal']);
  assert.deepEqual(built.hooks, ['hook.ps1']);
  assert.deepEqual(built.commands, ['mycmd.md']);

  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'SKILL.md')));
  assert.ok(existsSync(join(outDir, 'hooks', 'hook.ps1')));
  assert.ok(existsSync(join(outDir, 'commands', 'mycmd.md')));
});
```

- [ ] **Step 4: Add test: hooks overlay-only skips source copy**

```javascript
test('overlay-only hooks skip source copy', () => {
  const { root, manifestPath, outDir, overlayDir } = setupMulti();
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });

  const hook = readFileSync(join(outDir, 'hooks', 'hook.ps1'), 'utf8');
  assert.match(hook, /safety hook/);
});
```

- [ ] **Step 5: Add test: commands copy single file from source**

```javascript
test('commands copy single file from source path', () => {
  const { root, manifestPath, outDir, overlayDir } = setupMulti();
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });

  const cmd = readFileSync(join(outDir, 'commands', 'mycmd.md'), 'utf8');
  assert.match(cmd, /# \/mycmd/);
});
```

- [ ] **Step 6: Add test: settings.json is written to outDir**

```javascript
test('settings.json is written to outDir', () => {
  const { root, manifestPath, outDir } = setupMulti();
  const settingsPath = join(root, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: [] } }));
  generate({ repoRoot: root, manifestPath, outDir });
  generateSettings({ outDir, settingsPath });

  assert.ok(existsSync(join(outDir, 'settings.json')));
  const settings = JSON.parse(readFileSync(join(outDir, 'settings.json'), 'utf8'));
  assert.deepEqual(settings, { permissions: { allow: [] } });
});
```

- [ ] **Step 7: Add test: each category rmSync is scoped (skills removal doesn't affect hooks)**

```javascript
test('rmSync is scoped per category', () => {
  const { root, manifestPath, outDir, overlayDir } = setupMulti();
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });

  writeFileSync(join(outDir, 'commands', 'stale.md'), 'should be removed');
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [{ name: 'normal', source: 's', path: 'normal' }],
    hooks: [{ name: 'hook.ps1', source: 'overlay' }],
    commands: [
      { name: 'mycmd.md', source: 's', path: 'cmd-source/mycmd.md' },
    ],
  }));

  generate({ repoRoot: root, manifestPath, outDir, overlayDir });

  assert.ok(!existsSync(join(outDir, 'commands', 'stale.md')));
  assert.ok(existsSync(join(outDir, 'commands', 'mycmd.md')));
  assert.ok(existsSync(join(outDir, 'hooks', 'hook.ps1')));
  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'SKILL.md')));
});
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd harness && node --test`
Expected: all existing tests + 5 new tests pass

- [ ] **Step 9: Commit**

```bash
git add harness/generate.test.js
git commit -m "test: add multi-category generation tests"
```

---

### Task 11: Verify resolve.js tests still pass + add new validation tests

**Files:**
- Modify: `harness/lib/resolve.test.js`

- [ ] **Step 1: Read current resolve.test.js**

Current file content was already shown. It tests:
- `loads a valid manifest`
- `rejects an unknown source`
- `rejects duplicate skill names`
- `resolveSkillDir joins repoRoot + source + path`

- [ ] **Step 2: Update existing tests to use `resolveSourcePath`**

Replace `resolveSkillDir` → `resolveSourcePath` in import and test:

```javascript
test('resolveSourcePath joins repoRoot + source + path', () => {
  const manifest = {
    sources: { s: '/base' },
    skills: [{ name: 'a', source: 's', path: 'p' }],
  };
  const src = resolveSourcePath(manifest, manifest.skills[0], '/root');
  assert.equal(src, join('/root', '/base', 'p'));
});
```

- [ ] **Step 3: Add test: resolveSourcePath returns null for overlay source**

```javascript
test('resolveSourcePath returns null for overlay source', () => {
  const manifest = {
    sources: { s: '/base' },
  };
  const src = resolveSourcePath(manifest, { name: 'x', source: 'overlay' }, '/root');
  assert.equal(src, null);
});
```

- [ ] **Step 4: Add test: loadManifest validates hooks entries**

```javascript
test('rejects hooks with unknown source', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 'bad', path: 'x' }],
  });
  assert.throws(() => loadManifest(f), /unknown source.*hook/i);
});

test('rejects hooks with missing path on non-overlay source', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 's' }],
  });
  assert.throws(() => loadManifest(f), /missing path/i);
});

test('accepts hooks with overlay source (no path required)', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 'overlay' }],
  });
  const m = loadManifest(f);
  assert.deepEqual(m.hooks, [{ name: 'h', source: 'overlay' }]);
});

test('rejects duplicate hook names', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [
      { name: 'h', source: 'overlay' },
      { name: 'h', source: 'overlay' },
    ],
  });
  assert.throws(() => loadManifest(f), /duplicate hook/i);
});
```

- [ ] **Step 5: Add test: loadManifest validates commands entries**

```javascript
test('rejects commands with unknown source', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 'bad', path: 'x' }],
  });
  assert.throws(() => loadManifest(f), /unknown source.*command/i);
});

test('rejects commands with missing path on non-overlay source', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 's' }],
  });
  assert.throws(() => loadManifest(f), /missing path/i);
});

test('accepts commands with overlay source (no path required)', () => {
  const f = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 'overlay' }],
  });
  const m = loadManifest(f);
  assert.deepEqual(m.commands, [{ name: 'c', source: 'overlay' }]);
});
```

- [ ] **Step 6: Run resolve tests**

Run: `cd harness && node --test lib/resolve.test.js`
Expected: all existing + new tests pass

- [ ] **Step 7: Commit**

```bash
git add harness/lib/resolve.test.js
git commit -m "test: extend resolve tests for overlay source and hooks/commands validation"
```

---

### Task 12: Regenerate .claude/ and verify

**Files:**
- Modify: `.claude/` (regenerated)

- [ ] **Step 1: Run the generator**

Run: `cd harness && node generate.js`
Expected: `Generated .claude/: 34 skills, 3 hooks, 5 commands`

- [ ] **Step 2: Verify output structure**

Run:
```bash
Get-ChildItem .claude/ -Name
Get-ChildItem .claude/hooks/ -Name
Get-ChildItem .claude/commands/ -Name
```

Expected:
```
.claude/
  skills/       (34 dirs)
  hooks/        (3 ps1 files)
  commands/     (5 md files)
  settings.json
```

- [ ] **Step 3: Verify settings.json content**

Run: `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')),null,2))"`
Expected: shows hooks.PreToolUse with rtk-rewrite.ps1 + safety-guard.ps1

- [ ] **Step 4: Verify hook files are valid PowerShell syntax**

Run:
```bash
Get-Command pwsh -ErrorAction SilentlyContinue | Out-Null; if ($?) { pwsh -NoProfile -Command "Get-Command .claude/hooks/rtk-rewrite.ps1 -ErrorAction Stop" }
```

- [ ] **Step 5: Verify command files have frontmatter**

Run:
```bash
Select-String -LiteralPath ".claude/commands/*.md" -Pattern "^---" | Select-Object Filename,LineNumber
```

Expected: each .md file has `---` at lines 1 and 3+

- [ ] **Step 6: Run full test suite**

Run: `cd harness && node --test`
Expected: all tests pass (approximately 19-20 tests total)

- [ ] **Step 7: Commit generated .claude/**

```bash
git add .claude/hooks/ .claude/commands/ .claude/settings.json .claude/skills/
git commit -m "chore: regenerate .claude/ suite with hooks, commands, settings.json"
```
```

---

