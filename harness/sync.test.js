import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import { execSync } from 'node:child_process';
import { parseTargetsFile, resolveTargets, resolveFlags, syncDirectory, pruneDirectory, mergeSettings, syncTarget } from './lib/sync.js';

const syncPath = join(import.meta.dirname, 'sync.js');

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

function setupClaude() {
  const root = mkdtempSync(join(tmpdir(), 'st-'));
  const src = join(root, 'src');
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

const fwd = (p) => p.replace(/\\/g, '/');
const sp = fwd(syncPath);

test('CLI: syncs to target, produces expected output', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${sp}" --targets "${fwd(dst)}" --source "${fwd(src)}" --no-build`, { encoding: 'utf8' });
  assert.match(out, /skills/);
  assert.match(out, /hooks/);
  assert.match(out, /OK/);
  assert.match(out, /1 succeeded/);
  assert.ok(existsSync(join(dst, '.claude', 'skills', 'alpha', 'SKILL.md')));
});

test('CLI: --prune forces prune', () => {
  const { src, dst } = setupClaude();
  mkdirSync(join(dst, '.claude', 'skills', 'stale'), { recursive: true });
  writeFileSync(join(dst, '.claude', 'skills', 'stale', 'SKILL.md'), 'old');
  execSync(`node "${sp}" --targets "${fwd(dst)}" --source "${fwd(src)}" --no-build --prune`, { encoding: 'utf8' });
  assert.ok(!existsSync(join(dst, '.claude', 'skills', 'stale')));
});

test('CLI: --dry-run writes nothing', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${sp}" --targets "${fwd(dst)}" --source "${fwd(src)}" --no-build --dry-run`, { encoding: 'utf8' });
  assert.match(out, /would/);
  assert.ok(!existsSync(join(dst, 'skills', 'alpha')));
});

test('CLI: missing target marked failed, good target still OK', () => {
  const { src, dst } = setupClaude();
  try {
    execSync(`node "${sp}" --targets "${fwd(dst)}" "${fwd(join(dst, '..', 'ghost'))}" --source "${fwd(src)}" --no-build`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    assert.match(e.stdout || '', /FAILED/);
    assert.match(e.stdout || '', /not found/);
    assert.match(e.stdout || '', /1 failed/);
    assert.ok(existsSync(join(dst, '.claude', 'skills', 'alpha')));
  }
});

test('CLI: verbose shows skill names', () => {
  const { src, dst } = setupClaude();
  const out = execSync(`node "${sp}" --targets "${fwd(dst)}" --source "${fwd(src)}" --no-build --verbose`, { encoding: 'utf8' });
  assert.match(out, /alpha/);
  assert.match(out, /beta/);
});

test('CLI: settings parse error marks target failed', () => {
  const { src, dst } = setupClaude();
  writeFileSync(join(dst, 'settings.json'), 'bad json');
  try {
    execSync(`node "${sp}" --targets "${fwd(dst)}" --source "${fwd(src)}" --no-build`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    assert.match(e.stdout || '', /FAILED/);
    assert.match(e.stdout || '', /0 succeeded.*1 failed/);
  }
});
