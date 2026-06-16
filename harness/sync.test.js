import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import { parseTargetsFile, resolveTargets, resolveFlags, syncDirectory, pruneDirectory, mergeSettings } from './lib/sync.js';

function writeConfig(content) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'));
  const p = join(dir, 'targets.json');
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}

function setupDirs() {
  const root = mkdtempSync(join(tmpdir(), 'd-'));
  const src = join(root, 'src'); mkdirSync(src, { recursive: true });
  const dst = join(root, 'dst'); mkdirSync(dst, { recursive: true });
  return { root, src, dst };
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
  assert.equal(r[0].path, pathResolve('/cli'));
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

test('resolveTargets: preserves per-target flags from config', () => {
  const p = writeConfig([{ path: '/a', prune: true, overwriteSettings: true }]);
  const r = resolveTargets([], p, '/nope');
  assert.equal(r.length, 1);
  assert.equal(r[0].prune, true);
  assert.equal(r[0].overwriteSettings, true);
});

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

test('resolveFlags: --source followed by flag does not consume it', () => {
  const f = resolveFlags(['--source', '--verbose']);
  assert.equal(f.source, null);
  assert.equal(f.verbose, true);
});

test('resolveFlags: --config followed by flag does not consume it', () => {
  const f = resolveFlags(['--config', '--dry-run']);
  assert.equal(f.config, null);
  assert.equal(f.dryRun, true);
});

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

test('syncDirectory: handles dst-directory where src-has-file (type conflict)', () => {
  const { src, dst } = setupDirs();
  writeFileSync(join(src, 'entry'), 'file-content');
  mkdirSync(join(dst, 'entry'), { recursive: true });
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.ok(existsSync(join(dst, 'entry')));
  assert.equal(statSync(join(dst, 'entry')).isFile(), true);
  assert.equal(readFileSync(join(dst, 'entry'), 'utf8'), 'file-content');
});

test('syncDirectory: handles dst-file where src-has-directory (type conflict)', () => {
  const { src, dst } = setupDirs();
  mkdirSync(join(src, 'entry'));
  writeFileSync(join(src, 'entry', 'inner.txt'), 'nested');
  writeFileSync(join(dst, 'entry'), 'old-file');
  const r = syncDirectory(src, dst);
  assert.equal(r.updated, 1);
  assert.ok(existsSync(join(dst, 'entry', 'inner.txt')));
  assert.equal(readFileSync(join(dst, 'entry', 'inner.txt'), 'utf8'), 'nested');
});

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
