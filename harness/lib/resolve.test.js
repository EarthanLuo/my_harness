import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest, resolveSkillDir } from './resolve.js';

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

test('resolveSkillDir joins repoRoot + source + path', () => {
  const m = { sources: { sp: 'third-party/superpowers/skills' }, skills: [] };
  const dir = resolveSkillDir(m, { source: 'sp', path: 'brainstorming' }, '/repo');
  assert.ok(dir.replaceAll('\\', '/').endsWith('third-party/superpowers/skills/brainstorming'));
});
