import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest, resolveSourcePath } from './resolve.js';

function writeManifest(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  const p = join(dir, 'manifest.json');
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

test('loads a valid manifest', () => {
  const p = writeManifest({
    sources: { sp: 'third-party/superpowers/skills' },
    skills: [{ name: 'a', source: 'sp', path: 'a' }],
  });
  const m = loadManifest(p);
  assert.equal(m.skills.length, 1);
});

test('rejects an unknown source', () => {
  const p = writeManifest({
    sources: { sp: 'x' },
    skills: [{ name: 'a', source: 'nope', path: 'a' }],
  });
  assert.throws(() => loadManifest(p), /unknown source/);
});

test('rejects duplicate skill names', () => {
  const p = writeManifest({
    sources: { sp: 'x' },
    skills: [
      { name: 'a', source: 'sp', path: 'a' },
      { name: 'a', source: 'sp', path: 'b' },
    ],
  });
  assert.throws(() => loadManifest(p), /duplicate/);
});

test('resolveSourcePath joins repoRoot + source + path', () => {
  const m = { sources: { sp: 'third-party/superpowers/skills' }, skills: [] };
  const dir = resolveSourcePath(m, { source: 'sp', path: 'brainstorming' }, '/repo');
  assert.ok(dir.replaceAll('\\', '/').endsWith('third-party/superpowers/skills/brainstorming'));
});

test('resolveSourcePath returns null for overlay source', () => {
  const src = resolveSourcePath({ sources: {} }, { name: 'x', source: 'overlay' }, '/root');
  assert.equal(src, null);
});

test('rejects hooks with unknown source', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 'bad', path: 'x' }],
  });
  assert.throws(() => loadManifest(p), /unknown source.*hook/i);
});

test('rejects hooks with missing path on non-overlay source', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 's' }],
  });
  assert.throws(() => loadManifest(p), /missing path/i);
});

test('accepts hooks with overlay source (no path required)', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [{ name: 'h', source: 'overlay' }],
  });
  const m = loadManifest(p);
  assert.deepEqual(m.hooks, [{ name: 'h', source: 'overlay' }]);
});

test('rejects duplicate hook names', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    hooks: [
      { name: 'h', source: 'overlay' },
      { name: 'h', source: 'overlay' },
    ],
  });
  assert.throws(() => loadManifest(p), /duplicate hook/i);
});

test('rejects commands with unknown source', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 'bad', path: 'x' }],
  });
  assert.throws(() => loadManifest(p), /unknown source.*command/i);
});

test('rejects commands with missing path on non-overlay source', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 's' }],
  });
  assert.throws(() => loadManifest(p), /missing path/i);
});

test('accepts commands with overlay source (no path required)', () => {
  const p = writeManifest({
    sources: { s: '/base' },
    skills: [],
    commands: [{ name: 'c', source: 'overlay' }],
  });
  const m = loadManifest(p);
  assert.deepEqual(m.commands, [{ name: 'c', source: 'overlay' }]);
});
