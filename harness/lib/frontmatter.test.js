import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureManualOnly } from './frontmatter.js';

test('inserts the flag before the closing fence when absent', () => {
  const md = '---\nname: foo\ndescription: bar\n---\nbody\n';
  const out = ensureManualOnly(md);
  assert.equal(out, '---\nname: foo\ndescription: bar\ndisable-model-invocation: true\n---\nbody\n');
});

test('is idempotent when the flag is already present', () => {
  const md = '---\nname: foo\ndisable-model-invocation: true\n---\nbody\n';
  assert.equal(ensureManualOnly(md), md);
});

test('throws when there is no frontmatter', () => {
  assert.throws(() => ensureManualOnly('# no frontmatter\n'), /frontmatter/);
});
