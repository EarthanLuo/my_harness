import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
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
