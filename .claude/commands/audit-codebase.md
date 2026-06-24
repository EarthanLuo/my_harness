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
| 0-4   | Red Tier 1 | Critical           |
| 5-7   | Yel Tier 2 | Needs improvement  |
| 8-10  | Grn Tier 3 | Production ready   |

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

# Missing error handling
Grep "catch\s*\(\s*\)\s*\{\s*\}" --glob "*.{ts,js}"

# Unsafe deserialization
Grep "eval\(|new Function\(|loads\(" --glob "*.{ts,js,py}"
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
npm outdated 2>&1 | tail -20
pip list --outdated 2>&1 | tail -20
cargo outdated 2>&1 | tail -20

# Known vulnerabilities
npm audit 2>&1 | tail -20
pip-audit 2>&1 | tail -20
cargo audit 2>&1 | tail -20

# Unused dependencies
npx depcheck 2>&1
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
# God files (>500 lines)
find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rs" \
  | xargs wc -l | sort -rn | head -20

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
TEST_COUNT=$(find . -name "*.test.*" -o -name "*.spec.*" -not -path "*/node_modules/*" | wc -l)
echo "Source files: $SRC_COUNT, Test files: $TEST_COUNT"

# Flaky tests
Grep "\.only\|\.skip\|xit\|xdescribe" --glob "*.test.*"
```

| Coverage %        | Score | Tier |
| ----------------- | ----- | ---- |
| <30% files tested | 3/10  | Red 1 |
| 30-49%            | 5/10  | Yel 2 |
| 50-69%            | 7/10  | Yel 2 |
| 70-89%            | 8/10  | Grn 3 |
| 90%+              | 10/10 | Grn 3 |

Bonus: No `.only`/`.skip` left in tests = +0.5. Smoke tests present = +0.5.

## Phase 6: Audit Performance (Weight: 2x)

Goal: No obvious performance anti-patterns.

```bash
# N+1 query patterns
Grep "\.forEach.*\.find\|for.*\.filter\|for.*await.*query" --glob "*.{ts,js}"

# Sync operations in request path
Grep "readFileSync\|writeFileSync\|execSync" --glob "*.{ts,js}"
```

| Condition                      | Score         |
| ------------------------------ | ------------- |
| No N+1 patterns detected       | 10/10         |
| N+1 query patterns             | -3 per occ.   |
| sync FS in request path        | -2 per occ.   |

## Phase 7: Audit AI Patterns (Weight: 1x)

```bash
# CLAUDE.md / AGENTS.md presence
wc -l CLAUDE.md AGENTS.md 2>/dev/null || echo "Missing"

# Skills and commands
ls .claude/skills/ 2>/dev/null | wc -l
ls .claude/commands/ 2>/dev/null | wc -l

# ADR docs
ls docs/adr/ 2>/dev/null | wc -l
```

| Condition                      | Score  |
| ------------------------------ | ------ |
| CLAUDE.md present + structured | +2     |
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
Codebase Audit — {date}

+----------------+-------+--------+------------------------------+
| Category       | Score | Tier   | Top issue                    |
+----------------+-------+--------+------------------------------+
| Secrets        |  9.5  | Grn T3 | 0 issues                     |
| Security       |  7.0  | Yel T2 | 3 potential injection sites  |
| Structure      |  8.0  | Grn T3 | 2 files >500 lines           |
| Tests          |  6.5  | Yel T2 | 60% files tested             |
| Performance    |  9.0  | Grn T3 | No N+1 patterns              |
| Dependencies   |  8.0  | Grn T3 | 3 packages outdated          |
| AI Patterns    |  8.5  | Grn T3 | CONTEXT.md missing           |
+----------------+-------+--------+------------------------------+

Global score: 8.1 / 10  [Grn Tier 3]
```

## Action Plan (--fix)

```
Plan to reach Tier 3

Priority 1 — Security (7.0 -> 8+):
  1. Fix 3 shell injection sites with parameterized commands — ~1h
  2. Add input validation at 2 API boundaries — ~1h

Priority 2 — Tests (6.5 -> 8+):
  1. Add tests for 4 untested modules — ~4h
  2. Replace mock data with realistic fixtures — ~2h

Estimated: ~8h of work
```
