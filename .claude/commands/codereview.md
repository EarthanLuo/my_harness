---
model: sonnet
description: Local pre-PR code review with tiered severity and optional auto-fix
argument-hint: "[--fix] [--verbose] [base-branch]"
---

# /codereview

Local review of the current branch before creating a PR. Applies quality criteria appropriate to the detected tech stack.

**Principle**: Preview local -> fix -> then create clean PR.

## Usage

```
/codereview                  # red + yellow only (compact)
/codereview --verbose        # + positive points + green details
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

### Red: MUST FIX (blocking)

- Secrets or credentials hardcoded
- Error handling missing (silent failures, swallowed exceptions)
- Tests missing for new code
- Breaking API changes without migration path
- Security issues (shell injection, XSS, SQL injection, unsafe eval)
- Obvious bugs (null pointer, undefined access, off-by-one with visible impact)
- Infinite loops or unbounded recursion

### Yellow: SHOULD FIX (important)

- Function too long (>50 lines) — suggest split
- Deep nesting (>3 levels) — suggest early returns
- Missing input validation at API boundaries
- `console.log` / `println!` left in production code
- Duplicate code (copy-paste detected)
- Test with mock data instead of realistic fixtures
- Error messages too vague ("failed", "error")
- Missing logging at decision points

### Green: CAN SKIP (suggestions)

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
## Code Review

| Red  | Yellow  |
| :-: | :-: |
|  2  |  3  |

**[REQUEST CHANGES]** — secrets exposed + missing error handling

---

### Blocking

- `src/auth.ts:45` — Hardcoded API key

\```typescript
// Before
const API_KEY = "sk-abc123...";
// After
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY not set");
\```

- `src/handler.ts:120` — Silent error swallow

\```typescript
// Before
try { await process(data); } catch (e) {}
// After
try { await process(data); } catch (e) {
  logger.error("process failed", { error: e, dataId: data.id });
  throw new ProcessingError("Failed to process data", { cause: e });
}
\```

### Important

- `src/utils.ts:78` — Function 67 lines, suggest splitting into 2-3 helpers
- `src/api.ts:34` — Missing input validation on user-provided email field
- `src/new-feature.test.ts` — Tests use mock data instead of realistic fixtures

| Prio | File            | L   | Action                     |
| ---- | --------------- | --- | -------------------------- |
| Red  | src/auth.ts     | 45  | Remove hardcoded secret    |
| Red  | src/handler.ts  | 120 | Add error handling         |
| Yel  | src/utils.ts    | 78  | Split function             |
| Yel  | src/api.ts      | 34  | Add input validation       |
| Yel  | src/new-feature | -   | Replace mocks with fixtures |
```

## Mode Auto (--auto)

```
/codereview --auto
    |
    v
+-----------------+
|  1. Review      |  red/yellow/green report
+--------+--------+
         |
    red or yellow?
    +----+----+
    | NO     | YES
    v         v
 Done    +-----------------+
         |  2. Fix         |
         +--------+--------+
                  |
                  v
     +-----------------------------+
     |  3. Quality gate            |
     |  Run project linter         |
     |  Run project type checker   |
     |  Run project tests          |
     +-------------+---------------+
                   |
             Loop +-+ (max N iterations)
```

**Safeguards:**
- Never modify: config files with secrets, `.env*`, `*secret*`, lock files
- If >5 files modified -> ask confirmation
- If quality gate fails -> `git reset --hard HEAD` + report errors
- Atomic commits per pass: `fix(codereview): <issue summary>`

## Recommended workflow

```
1. Develop on feature branch
2. /codereview -> preview issues (compact)
3a. Fix red and yellow manually
   OR
3b. /codereview --auto -> automatic fix
4. /codereview -> verify READY
5. gh pr create
```
