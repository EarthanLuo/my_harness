# Sync Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `harness/sync.js` — a Node.js CLI that distributes the assembled `.claude/` bundle into target projects via buffer-compare copy, with merge/prune/dry-run support.

**Architecture:** `harness/lib/sync.js` (pure functions: parse, sync, prune, merge) + `harness/sync.js` (CLI: build, args, output). Zero deps beyond Node stdlib. ESM. Tested via `node --test` with temp directories. `--source` flag allows test-friendly source override.

**Tech Stack:** Node.js 22+, ES modules, `node:fs/path/child_process/os`, `node:test`, `node:assert/strict`

---

## File Map

| File | Responsibility | ~Lines |
|------|---------------|--------|
| `harness/lib/sync.js` | parseTargetsFile, resolveTargets, resolveFlags, syncDirectory, pruneDirectory, mergeSettings, syncTarget | 210 |
| `harness/sync.js` | CLI: build step, arg parsing, target loop, output formatting | 130 |
| `harness/sync.test.js` | All tests (unit + integration) using temp dirs | 430 |

---

### Task 1: `harness/lib/sync.js` — parseTargets

**Files:** Create `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

```js
// harness/sync.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTargetsFile, resolveTargets } from './lib/sync.js';

function writeConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'));
  const p = join(dir, 'targets.json');
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}

test('parseTargetsFile: string entries get default flags', () => {
  const p = writeConfig(['/a', '/b']);
  const r = parseTargetsFile(p);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { path: '/a', prune: false, overwriteSettings: false });
  assert.deepEqual(r[1], { path: '/b', prune: false, overwriteSettings: false });
});

test('parseTargetsFile: object entries preserve per-target flags', () => {
  const p = writeConfig([
    { path: '/c', prune: true, overwriteSettings: false },
    { path: '/d', prune: false, overwriteSettings: true },
  ]);
  const r = parseTargetsFile(p);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { path: '/c', prune: true, overwriteSettings: false });
  assert.deepEqual(r[1], { path: '/d', prune: false, overwriteSettings: true });
});

test('parseTargetsFile: mixed string and object entries', () => {
  const p = writeConfig(['/a', { path: '/b', prune: true }]);
  const r = parseTargetsFile(p);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { path: '/a', prune: false, overwriteSettings: false });
  assert.deepEqual(r[1], { path: '/b', prune: true, overwriteSettings: false });
});

test('parseTargetsFile: throws on non-array', () => {
  assert.throws(() => parseTargetsFile(writeConfig('"x"')), /must be a JSON array/);
});

test('parseTargetsFile: throws on object without path', () => {
  assert.throws(() => parseTargetsFile(writeConfig([{ prune: true }])), /invalid target entry/);
});

test('resolveTargets: CLI targets override config', () => {
  const r = resolveTargets(['/cli'], writeConfig(['/cfg']), '/nonexistent');
  assert.equal(r.length, 1);
  assert.equal(r[0].path, '/cli');
});

test('resolveTargets: falls back to --config path', () => {
  const r = resolveTargets([], writeConfig(['/cfg']), '/nonexistent');
  assert.equal(r.length, 1);
  assert.ok(r[0].path.endsWith('cfg'));
});

test('resolveTargets: falls back to default config', () => {
  const r = resolveTargets([], null, writeConfig(['/def']));
  assert.equal(r.length, 1);
  assert.ok(r[0].path.endsWith('def'));
});

test('resolveTargets: throws when no targets at all', () => {
  assert.throws(() => resolveTargets([], null, '/nope'), /no targets specified/);
});
```

Run: `node --test harness/sync.test.js` — Expected: 9 FAIL (parseTargetsFile not defined)

- [ ] **Step 2: Implement**

```js
// harness/lib/sync.js
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseTargetsFile(configPath) {
  const raw = readFileSync(configPath, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('target config must be a JSON array');
  return arr.map((entry, i) => {
    if (typeof entry === 'string') return { path: entry, prune: false, overwriteSettings: false };
    if (typeof entry === 'object' && entry !== null && typeof entry.path === 'string')
      return { path: entry.path, prune: !!entry.prune, overwriteSettings: !!entry.overwriteSettings };
    throw new Error(`invalid target entry at index ${i}: ${JSON.stringify(entry)}`);
  });
}

export function resolveTargets(cliTargets, configPath, defaultConfigPath) {
  let entries;
  if (cliTargets && cliTargets.length > 0)
    entries = cliTargets.map(p => ({ path: p, prune: false, overwriteSettings: false }));
  else if (configPath) entries = parseTargetsFile(configPath);
  else if (existsSync(defaultConfigPath)) entries = parseTargetsFile(defaultConfigPath);
  else throw new Error('no targets specified (use --targets, --config, or create harness/sync-targets.json)');
  return entries.map(e => ({ ...e, path: resolve(e.path) }));
}
```

Run: `node --test harness/sync.test.js` — Expected: 9 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add parseTargets and resolveTargets for sync script"
```

---

### Task 2: `harness/lib/sync.js` — resolveFlags

**Files:** Modify `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

Append to `harness/sync.test.js`:

```js
import { resolveFlags } from './lib/sync.js';

test('resolveFlags: all defaults false', () => {
  const f = resolveFlags([]);
  assert.equal(f.noBuild, false);
  assert.equal(f.prune, false);
  assert.equal(f.overwriteSettings, false);
  assert.equal(f.dryRun, false);
  assert.equal(f.verbose, false);
  assert.deepEqual(f.targets, []);
  assert.equal(f.config, null);
  assert.equal(f.source, null);
});

test('resolveFlags: --no-build, --prune, --overwrite-settings, --dry-run, --verbose', () => {
  const f = resolveFlags(['--no-build', '--prune', '--overwrite-settings', '--dry-run', '--verbose']);
  assert.equal(f.noBuild, true);
  assert.equal(f.prune, true);
  assert.equal(f.overwriteSettings, true);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
});

test('resolveFlags: --source captures next arg', () => {
  assert.equal(resolveFlags(['--source', '/tmp/claude']).source, '/tmp/claude');
});

test('resolveFlags: --targets collects following args', () => {
  const f = resolveFlags(['--targets', '/a', '/b', '--dry-run']);
  assert.deepEqual(f.targets, ['/a', '/b']);
  assert.equal(f.dryRun, true);
});

test('resolveFlags: --targets at end collects remaining', () => {
  const f = resolveFlags(['--no-build', '--targets', '/a']);
  assert.equal(f.noBuild, true);
  assert.deepEqual(f.targets, ['/a']);
});

test('resolveFlags: --config captures next arg', () => {
  assert.equal(resolveFlags(['--config', 'custom.json']).config, 'custom.json');
});
```

Run: `node --test harness/sync.test.js` — Expected: 9 PASS + 6 FAIL

- [ ] **Step 2: Implement**

Append to `harness/lib/sync.js`:

```js
export function resolveFlags(argv) {
  const flags = { noBuild: false, prune: false, overwriteSettings: false, dryRun: false, verbose: false, targets: [], config: null, source: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-build') flags.noBuild = true;
    else if (a === '--prune') flags.prune = true;
    else if (a === '--overwrite-settings') flags.overwriteSettings = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--source' && i + 1 < argv.length) flags.source = argv[++i];
    else if (a === '--config' && i + 1 < argv.length) flags.config = argv[++i];
    else if (a === '--targets') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.targets.push(argv[++i]);
    }
  }
  return flags;
}
```

Run: `node --test harness/sync.test.js` — Expected: 15 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add resolveFlags for sync CLI arg parsing"
```

---

### Task 3: `harness/lib/sync.js` — syncDirectory

**Files:** Modify `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

Append to `harness/sync.test.js`:

```js
import { syncDirectory } from './lib/sync.js';

function setupDirs() {
  const root = mkdtempSync(join(tmpdir(), 'd-'));
  const src = join(root, 'src'); mkdirSync(src, { recursive: true });
  const dst = join(root, 'dst'); mkdirSync(dst, { recursive: true });
  return { root, src, dst };
}

test('syncDirectory: copies new file', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'a.txt'), 'hello');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.equal(r.unchanged, 0);
  assert.equal(readFileSync(join(dst, 'a.txt'), 'utf8'), 'hello');
});

test('syncDirectory: skips unchanged file (buffer equal)', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'a.txt'), 'same');
  writeFileSync(join(dst, 'a.txt'), 'same');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 0);
  assert.equal(r.unchanged, 1);
});

test('syncDirectory: overwrites changed file', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'a.txt'), 'NEW');
  writeFileSync(join(dst, 'a.txt'), 'old');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.equal(readFileSync(join(dst, 'a.txt'), 'utf8'), 'NEW');
});

test('syncDirectory: recurses into subdirectories', () => {
  const { src, dst } = setupDirs();
  mkdirSync(join(src, 'sub'));
  writeFileSync(join(src, 'sub', 'b.txt'), 'nested');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.equal(readFileSync(join(dst, 'sub', 'b.txt'), 'utf8'), 'nested');
});

test('syncDirectory: binary buffer compare', () => {
  const { src, dst } = setupDirs();
  const buf = Buffer.from([0x00, 0xFF]);
  writeFileSync(join(src, 'b.dat'), buf);
  writeFileSync(join(dst, 'b.dat'), buf);
  assert.equal(syncDirectory(src, dst).unchanged, 1);
});

test('syncDirectory: empty source', () => {
  const { src, dst } = setupDirs();
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 0);
  assert.equal(r.unchanged, 0);
});

test('syncDirectory: mix of new and unchanged', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'new.txt'), 'new');
  writeFileSync(join(src, 'same.txt'), 'same');
  writeFileSync(join(dst, 'same.txt'), 'same');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.equal(r.unchanged, 1);
});

test('syncDirectory: dryRun does not write', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'a.txt'), 'x');
  const r = syncDirectory(src, dst, { dryRun: true });
  assert.equal(r.updated, 1);
  assert.ok(!existsSync(join(dst, 'a.txt')));
});
```

Run: `node --test harness/sync.test.js` — Expected: 15 PASS + 8 FAIL

- [ ] **Step 2: Implement**

Update imports in `harness/lib/sync.js`:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
```

Append:

```js
export function syncDirectory(srcDir, dstDir, { dryRun = false } = {}) {
  if (!existsSync(srcDir)) return { updated: 0, unchanged: 0 };
  mkdirSync(dstDir, { recursive: true });
  let updated = 0, unchanged = 0;
  for (const name of readdirSync(srcDir)) {
    const sp = join(srcDir, name), dp = join(dstDir, name);
    const st = statSync(sp);
    if (st.isDirectory()) {
      const sub = syncDirectory(sp, dp, { dryRun });
      updated += sub.updated; unchanged += sub.unchanged;
    } else {
      let needs = true;
      if (existsSync(dp) && statSync(dp).isFile()) {
        const sb = readFileSync(sp), db = readFileSync(dp);
        if (sb.equals(db)) { needs = false; unchanged++; }
      }
      if (needs) { if (!dryRun) writeFileSync(dp, readFileSync(sp)); updated++; }
    }
  }
  return { updated, unchanged };
}
```

Run: `node --test harness/sync.test.js` — Expected: 23 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add syncDirectory with buffer-compare file copy"
```

---

### Task 4: `harness/lib/sync.js` — pruneDirectory

**Files:** Modify `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

Append to `harness/sync.test.js`:

```js
import { pruneDirectory } from './lib/sync.js';
import { rmSync } from 'node:fs';

test('pruneDirectory: deletes file in dst not in src', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(dst, 'extra.txt'), 'x');
  writeFileSync(join(src, 'keep.txt'), 'k');
  writeFileSync(join(dst, 'keep.txt'), 'k');
  const r = pruneDirectory(src, dst);
  assert.equal(r.deleted, 1);
  assert.ok(!existsSync(join(dst, 'extra.txt')));
  assert.ok(existsSync(join(dst, 'keep.txt')));
});

test('pruneDirectory: deletes directory tree only in dst', () => {
  const { src, dst } = setupDirs();
  mkdirSync(join(dst, 'extra'), { recursive: true });
  writeFileSync(join(dst, 'extra', 'f.txt'), 'x');
  const r = pruneDirectory(src, dst);
  assert.equal(r.deleted, 1);
  assert.ok(!existsSync(join(dst, 'extra')));
});

test('pruneDirectory: recurses into shared subdirectories', () => {
  const { src, dst } = setupDirs();
  mkdirSync(join(src, 'shared'), { recursive: true });
  mkdirSync(join(dst, 'shared'), { recursive: true });
  writeFileSync(join(src, 'shared', 'ok.txt'), 'ok');
  writeFileSync(join(dst, 'shared', 'ok.txt'), 'ok');
  writeFileSync(join(dst, 'shared', 'stale.txt'), 'stale');
  const r = pruneDirectory(src, dst);
  assert.equal(r.deleted, 1);
  assert.ok(!existsSync(join(dst, 'shared', 'stale.txt')));
});

test('pruneDirectory: returns 0 when dst matches src', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'a.txt'), 'a');
  writeFileSync(join(dst, 'a.txt'), 'a');
  assert.equal(pruneDirectory(src, dst).deleted, 0);
});

test('pruneDirectory: returns 0 when dst empty', () => {
  const { src, dst } = setupDirs();
  assert.equal(pruneDirectory(src, dst).deleted, 0);
});

test('pruneDirectory: dryRun reports but does not delete', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(dst, 'extra.txt'), 'x');
  const r = pruneDirectory(src, dst, { dryRun: true });
  assert.equal(r.deleted, 1);
  assert.ok(existsSync(join(dst, 'extra.txt')));
});
```

Run: `node --test harness/sync.test.js` — Expected: 23 PASS + 6 FAIL

- [ ] **Step 2: Implement**

Add `rmSync` to imports in `harness/lib/sync.js`:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
```

Append:

```js
export function pruneDirectory(srcDir, dstDir, { dryRun = false } = {}) {
  if (!existsSync(dstDir)) return { deleted: 0 };
  let deleted = 0;
  for (const name of readdirSync(dstDir)) {
    const sp = join(srcDir, name), dp = join(dstDir, name);
    if (!existsSync(sp)) {
      if (!dryRun) rmSync(dp, { recursive: true, force: true });
      deleted++;
    } else {
      const ss = statSync(sp), ds = statSync(dp);
      if (ss.isDirectory() && ds.isDirectory()) deleted += pruneDirectory(sp, dp, { dryRun }).deleted;
    }
  }
  return { deleted };
}
```

Run: `node --test harness/sync.test.js` — Expected: 29 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add pruneDirectory for managed file cleanup"
```

---

### Task 5: `harness/lib/sync.js` — mergeSettings

**Files:** Modify `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

Append to `harness/sync.test.js`:

```js
import { mergeSettings } from './lib/sync.js';

test('mergeSettings: unions permissions.allow', () => {
  const r = mergeSettings(
    { permissions: { allow: ['a', 'b'] } },
    { permissions: { allow: ['b', 'c'] } },
  );
  assert.deepEqual(r.permissions.allow.sort(), ['a', 'b', 'c']);
});

test('mergeSettings: unions permissions.deny', () => {
  const r = mergeSettings(
    { permissions: { deny: ['x'] } },
    { permissions: { deny: ['y'] } },
  );
  assert.deepEqual(r.permissions.deny.sort(), ['x', 'y']);
});

test('mergeSettings: handles one-sided permissions', () => {
  assert.deepEqual(mergeSettings({}, { permissions: { allow: ['d'] } }).permissions.allow, ['d']);
  assert.deepEqual(mergeSettings({ permissions: { allow: ['s'] } }, {}).permissions.allow, ['s']);
});

test('mergeSettings: deduplicates hooks by type+command, target priority', () => {
  const src = { hooks: { PreToolUse: [
    { type: 'command', command: 'a.ps1', timeout: 5 },
    { type: 'command', command: 'new.ps1', timeout: 3 },
  ]}};
  const dst = { hooks: { PreToolUse: [
    { type: 'command', command: 'a.ps1', timeout: 30 },
    { type: 'command', command: 'b.ps1', timeout: 10 },
  ]}};
  const r = mergeSettings(src, dst);
  assert.equal(r.hooks.PreToolUse.length, 3);
  assert.equal(r.hooks.PreToolUse.find(h => h.command === 'a.ps1').timeout, 30);
  assert.ok(r.hooks.PreToolUse.find(h => h.command === 'new.ps1'));
  assert.ok(r.hooks.PreToolUse.find(h => h.command === 'b.ps1'));
});

test('mergeSettings: merges hooks across events', () => {
  const src = { hooks: {
    PreToolUse: [{ type: 'command', command: 's.ps1' }],
    PostToolUse: [{ type: 'command', command: 'ps.ps1' }],
  }};
  const dst = { hooks: { PreToolUse: [{ type: 'command', command: 'd.ps1' }] } };
  const r = mergeSettings(src, dst);
  assert.equal(r.hooks.PreToolUse.length, 2);
  assert.equal(r.hooks.PostToolUse.length, 1);
});

test('mergeSettings: target-priority for other fields, source-only added', () => {
  const r = mergeSettings({ cf: 'sv', extra: 'se' }, { cf: 'dv' });
  assert.equal(r.cf, 'dv');
  assert.equal(r.extra, 'se');
});

test('mergeSettings: preserves target-only hooks', () => {
  const r = mergeSettings({}, { hooks: { N: [{ type: 'command', command: 'n.ps1' }] } });
  assert.equal(r.hooks.N.length, 1);
});
```

Run: `node --test harness/sync.test.js` — Expected: 29 PASS + 7 FAIL

- [ ] **Step 2: Implement**

Append to `harness/lib/sync.js`:

```js
export function mergeSettings(srcSettings, dstSettings) {
  const S = srcSettings || {}, D = dstSettings || {};
  const merged = { ...D };

  const sa = S.permissions?.allow || [], da = D.permissions?.allow || [];
  if (sa.length + da.length > 0) {
    merged.permissions = { ...(merged.permissions || {}) };
    merged.permissions.allow = [...new Set([...da, ...sa])];
  }
  const sd = S.permissions?.deny || [], dd = D.permissions?.deny || [];
  if (sd.length + dd.length > 0) {
    merged.permissions = { ...(merged.permissions || {}) };
    merged.permissions.deny = [...new Set([...dd, ...sd])];
  }

  const events = new Set([...Object.keys(S.hooks || {}), ...Object.keys(D.hooks || {})]);
  if (events.size > 0) {
    merged.hooks = { ...(merged.hooks || {}) };
    for (const ev of events) {
      const sh = S.hooks?.[ev] || [], dh = D.hooks?.[ev] || [];
      const seen = new Set(), mh = [...dh];
      for (const h of dh) seen.add(JSON.stringify({ type: h.type, command: h.command }));
      for (const h of sh) {
        const k = JSON.stringify({ type: h.type, command: h.command });
        if (!seen.has(k)) { mh.push(h); seen.add(k); }
      }
      merged.hooks[ev] = mh;
    }
  }

  for (const k of Object.keys(S)) {
    if (k === 'permissions' || k === 'hooks') continue;
    if (!(k in merged)) merged[k] = S[k];
  }
  return merged;
}
```

Run: `node --test harness/sync.test.js` — Expected: 36 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add mergeSettings for deep settings.json merge"
```

---

### Task 6: `harness/lib/sync.js` — syncTarget orchestration

**Files:** Modify `harness/sync.test.js`, `harness/lib/sync.js`

- [ ] **Step 1: Write failing tests**

Append to `harness/sync.test.js`:

```js
import { syncTarget } from './lib/sync.js';

function setupClaude() {
  const root = mkdtempSync(join(tmpdir(), 'st-'));
  const src = join(root, 'src');  // acts as .claude/
  const dst = join(root, 'dst');
  mkdirSync(join(src, 'skills', 'alpha'), { recursive: true });
  mkdirSync(join(src, 'skills', 'beta'), { recursive: true });
  writeFileSync(join(src, 'skills', 'alpha', 'SKILL.md'), 'alpha md');
  writeFileSync(join(src, 'skills', 'beta', 'SKILL.md'), 'beta md');
  mkdirSync(join(src, 'hooks'), { recursive: true });
  writeFileSync(join(src, 'hooks', 'g.ps1'), '# guard');
  mkdirSync(join(src, 'commands'), { recursive: true });
  writeFileSync(join(src, 'commands', 'audit.md'), '# audit');
  writeFileSync(join(src, 'settings.json'), JSON.stringify({
    permissions: { allow: ['a'], deny: [] },
    hooks: { PreToolUse: [{ type: 'command', command: 'h.ps1' }] },
  }));
  mkdirSync(dst, { recursive: true });
  return { root, src, dst };
}

test('syncTarget: syncs skills/hooks/commands, writes settings on init', () => {
  const { src, dst } = setupClaude();
  const r = syncTarget(src, dst, { prune: false, overwriteSettings: false, dryRun: false });
  assert.equal(r.skills.updated, 2);
  assert.equal(r.hooks.updated, 1);
  assert.equal(r.commands.updated, 1);
  assert.equal(r.settings, 'written');
  assert.ok(existsSync(join(dst, 'skills', 'alpha', 'SKILL.md')));
  assert.ok(existsSync(join(dst, 'hooks', 'g.ps1')));
  assert.ok(existsSync(join(dst, 'settings.json')));
});

test('syncTarget: merges settings when target has existing', () => {
  const { src, dst } = setupClaude();
  writeFileSync(join(dst, 'settings.json'), JSON.stringify({
    permissions: { allow: ['da'] },
    extra: 'keep-me',
  }));
  const r = syncTarget(src, dst, { prune: false, overwriteSettings: false, dryRun: false });
  assert.equal(r.settings, 'merged');
  const m = JSON.parse(readFileSync(join(dst, 'settings.json'), 'utf8'));
  assert.ok(m.permissions.allow.includes('a') && m.permissions.allow.includes('da'));
  assert.equal(m.extra, 'keep-me');
});

test('syncTarget: overwrites settings with flag', () => {
  const { src, dst } = setupClaude();
  writeFileSync(join(dst, 'settings.json'), JSON.stringify({ x: 1 }));
  const r = syncTarget(src, dst, { prune: false, overwriteSettings: true, dryRun: false });
  assert.equal(r.settings, 'overwritten');
  assert.ok(!('x' in JSON.parse(readFileSync(join(dst, 'settings.json'), 'utf8'))));
});

test('syncTarget: prune removes stale managed entries', () => {
  const { src, dst } = setupClaude();
  mkdirSync(join(dst, 'skills', 'gamma'), { recursive: true });
  writeFileSync(join(dst, 'skills', 'gamma', 'SKILL.md'), 'stale');
  const r = syncTarget(src, dst, { prune: true, overwriteSettings: false, dryRun: false });
  assert.equal(r.skills.deleted, 1);
  assert.ok(!existsSync(join(dst, 'skills', 'gamma')));
  assert.ok(existsSync(join(dst, 'skills', 'alpha')));
});

test('syncTarget: preserves unmanaged files outside managed dirs', () => {
  const { src, dst } = setupClaude();
  mkdirSync(join(dst, 'custom'), { recursive: true });
  writeFileSync(join(dst, 'custom', 'n.md'), 'mine');
  syncTarget(src, dst, { prune: true, overwriteSettings: false, dryRun: false });
  assert.ok(existsSync(join(dst, 'custom', 'n.md')));
});

test('syncTarget: dryRun writes nothing', () => {
  const { src, dst } = setupClaude();
  const r = syncTarget(src, dst, { prune: false, overwriteSettings: false, dryRun: true });
  assert.ok(r.skills.updated > 0);
  assert.ok(!existsSync(join(dst, 'skills', 'alpha')));
  assert.ok(!existsSync(join(dst, 'settings.json')));
});

test('syncTarget: throws on invalid target settings.json', () => {
  const { src, dst } = setupClaude();
  writeFileSync(join(dst, 'settings.json'), 'bad json {{{');
  assert.throws(
    () => syncTarget(src, dst, { prune: false, overwriteSettings: false, dryRun: false }),
    /failed to parse settings.json/,
  );
});
```

Run: `node --test harness/sync.test.js` — Expected: 36 PASS + 7 FAIL

- [ ] **Step 2: Implement**

Append to `harness/lib/sync.js`:

```js
const MANAGED_DIRS = ['skills', 'hooks', 'commands'];

export function syncTarget(srcClaude, dstClaude, options = {}) {
  const { prune = false, overwriteSettings = false, dryRun = false } = options;
  const result = { skills: {}, hooks: {}, commands: {}, settings: null };

  for (const dir of MANAGED_DIRS) {
    const sd = join(srcClaude, dir), dd = join(dstClaude, dir);
    const synced = syncDirectory(sd, dd, { dryRun });
    if (prune) synced.deleted = pruneDirectory(sd, dd, { dryRun }).deleted;
    result[dir] = synced;
  }

  const ssp = join(srcClaude, 'settings.json'), dsp = join(dstClaude, 'settings.json');
  if (!existsSync(ssp)) return result;
  mkdirSync(dstClaude, { recursive: true });

  if (!existsSync(dsp)) {
    if (!dryRun) writeFileSync(dsp, readFileSync(ssp));
    result.settings = 'written';
  } else if (overwriteSettings) {
    if (!dryRun) writeFileSync(dsp, readFileSync(ssp));
    result.settings = 'overwritten';
  } else {
    try {
      const ss = JSON.parse(readFileSync(ssp, 'utf8'));
      const ds = JSON.parse(readFileSync(dsp, 'utf8'));
      const merged = mergeSettings(ss, ds);
      if (!dryRun) writeFileSync(dsp, JSON.stringify(merged, null, 2) + '\n');
      result.settings = 'merged';
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw Object.assign(new Error(`failed to parse settings.json in target: ${err.message}`), { code: 'SETTINGS_PARSE_ERROR' });
      }
      throw err;
    }
  }

  return result;
}
```

Run: `node --test harness/sync.test.js` — Expected: 43 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.test.js harness/lib/sync.js
git commit -m "feat: add syncTarget orchestration for single project sync"
```

---

### Task 7: `harness/sync.js` — CLI entry + integration tests

**Files:** Create `harness/sync.js`, modify `harness/sync.test.js`

- [ ] **Step 1: Write failing integration tests**

Append to `harness/sync.test.js`:

```js
import { execSync } from 'node:child_process';

const syncPath = join(import.meta.dirname, 'sync.js');

test('CLI: syncs to target, produces expected output', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${syncPath}" --targets "${dst}" --source "${src}" --no-build`, { encoding: 'utf8' });
  assert.match(out, /skills/);
  assert.match(out, /hooks/);
  assert.match(out, /OK/);
  assert.match(out, /1 succeeded/);
  assert.ok(existsSync(join(dst, 'skills', 'alpha', 'SKILL.md')));
});

test('CLI: --prune forces prune', () => {
  const { src, dst } = setupClaude();
  mkdirSync(join(dst, 'skills', 'stale'), { recursive: true });
  writeFileSync(join(dst, 'skills', 'stale', 'SKILL.md'), 'old');
  execSync(`node "${syncPath}" --targets "${dst}" --source "${src}" --no-build --prune`, { encoding: 'utf8' });
  assert.ok(!existsSync(join(dst, 'skills', 'stale')));
});

test('CLI: --dry-run writes nothing', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${syncPath}" --targets "${dst}" --source "${src}" --no-build --dry-run`, { encoding: 'utf8' });
  assert.match(out, /would/);
  assert.ok(!existsSync(join(dst, 'skills', 'alpha')));
});

test('CLI: missing target marked failed, good target still OK', () => {
  const { src, dst } = setupClaude();
  try {
    execSync(`node "${syncPath}" --targets "${dst}" "${join(dst, '..', 'ghost')}" --source "${src}" --no-build`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    assert.match(e.stdout || '', /FAILED/);
    assert.match(e.stdout || '', /not found/);
    assert.match(e.stdout || '', /1 failed/);
    assert.ok(existsSync(join(dst, 'skills', 'alpha')));
  }
});

test('CLI: verbose shows skill names', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${syncPath}" --targets "${dst}" --source "${src}" --no-build --verbose`, { encoding: 'utf8' });
  assert.match(out, /alpha/);
  assert.match(out, /beta/);
});

test('CLI: settings parse error marks target failed', () => {
  const { src, dst } = setupClaude();
  writeFileSync(join(dst, 'settings.json'), 'bad json');
  try {
    execSync(`node "${syncPath}" --targets "${dst}" --source "${src}" --no-build`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    assert.match(e.stdout || '', /FAILED/);
    assert.match(e.stdout || '', /0 succeeded.*1 failed/);
  }
});
```

Run: `node --test harness/sync.test.js` — Expected: 43 PASS + 6 FAIL (sync.js not found)

- [ ] **Step 2: Implement sync.js**

Create `harness/sync.js`:

```js
import { resolve, join } from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTargets, resolveFlags, syncTarget } from './lib/sync.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const flags = resolveFlags(process.argv.slice(2));

  if (!flags.noBuild) {
    process.stdout.write('Building...\n');
    execSync('node generate.js', { cwd: import.meta.dirname, stdio: 'inherit' });
  }

  const srcClaude = flags.source ? resolve(flags.source) : join(repoRoot, '.claude');
  const targets = resolveTargets(
    flags.targets.length > 0 ? flags.targets : [],
    flags.config,
    join(import.meta.dirname, 'sync-targets.json'),
  );

  for (const t of targets) {
    if (flags.prune) t.prune = true;
    if (flags.overwriteSettings) t.overwriteSettings = true;
  }

  const prefix = flags.dryRun ? 'would update' : 'updated';

  process.stdout.write(`=== sync ===\n`);
  process.stdout.write(`source:  ${srcClaude}\n`);
  process.stdout.write(`targets: ${targets.length} project(s)\n\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const label = `[${i + 1}/${targets.length}] ${t.path}`;
    const dstClaude = join(t.path, '.claude');

    if (!existsSync(t.path) || !statSync(t.path).isDirectory()) {
      process.stdout.write(`${label}\n  ERROR: path not found or not a directory\n  FAILED\n\n`);
      fail++;
      continue;
    }

    let result;
    try {
      result = syncTarget(srcClaude, dstClaude, {
        prune: t.prune, overwriteSettings: t.overwriteSettings, dryRun: flags.dryRun,
      });
    } catch (err) {
      process.stdout.write(`${label}\n  ERROR: ${err.message}\n  FAILED\n\n`);
      fail++;
      continue;
    }

    process.stdout.write(`${label}\n`);
    for (const dir of ['skills', 'hooks', 'commands']) {
      const r = result[dir];
      const up = r.updated || 0, un = r.unchanged || 0;
      let line = `  ${dir.padEnd(10)} ${un} up-to-date, ${up} ${prefix}`;
      if (r.deleted > 0) line += `, ${r.deleted} ${flags.dryRun ? 'would delete' : 'deleted'}`;
      process.stdout.write(`${line}\n`);
      if (flags.verbose && existsSync(join(srcClaude, dir))) {
        for (const name of readdirSync(join(srcClaude, dir))) process.stdout.write(`    ${name}\n`);
      }
    }
    const sl = flags.dryRun ? `would ${result.settings}` : result.settings;
    process.stdout.write(`  settings:   ${sl}\n  OK\n\n`);
    ok++;
  }

  process.stdout.write(`Done: ${ok} succeeded, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}
```

Run: `node --test harness/sync.test.js` — Expected: 49 PASS

- [ ] **Step 3: Commit**

```bash
git add harness/sync.js harness/sync.test.js
git commit -m "feat: add sync.js CLI entry with build, targets, output"
```

---

### Task 8: `harness/sync-targets.json` — default config template

**Files:** Create `harness/sync-targets.json`

- [ ] **Step 1: Create template file**

```json
[]
```

- [ ] **Step 2: Commit**

```bash
git add harness/sync-targets.json
git commit -m "chore: add empty sync-targets.json template"
```

---

## Final Verification

After all tasks:

```bash
cd harness && node --test
```

Expected: all existing tests (27 from generate.test.js + resolve.test.js + frontmatter.test.js) + 49 new sync tests = 76 PASS, 0 FAIL.

## Manual Smoke Test

```bash
# Create a temp project
mkdir D:/tmp/test-sync
# Run sync (dry-run first)
cd harness && node sync.js --targets D:/tmp/test-sync --no-build --dry-run
# Real sync
cd harness && node sync.js --targets D:/tmp/test-sync --no-build
# Verify
ls D:/tmp/test-sync/.claude/skills/
ls D:/tmp/test-sync/.claude/hooks/
ls D:/tmp/test-sync/.claude/commands/
cat D:/tmp/test-sync/.claude/settings.json
```
