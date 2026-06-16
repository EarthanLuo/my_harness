import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import { parseTargetsFile, resolveTargets, resolveFlags, syncDirectory } from './lib/sync.js';

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
