import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from './generate.js';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gen-'));
  mkdirSync(join(root, 'src', 'normal'), { recursive: true });
  writeFileSync(join(root, 'src', 'normal', 'SKILL.md'), '---\nname: normal\n---\nhi\n');
  writeFileSync(join(root, 'src', 'normal', 'extra.md'), 'attachment\n');
  mkdirSync(join(root, 'src', 'manual'), { recursive: true });
  writeFileSync(join(root, 'src', 'manual', 'SKILL.md'), '---\nname: manual\n---\nhi\n');
  const manifestPath = join(root, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [
      { name: 'normal', source: 's', path: 'normal' },
      { name: 'manual', source: 's', path: 'manual', manualOnly: true },
    ],
  }));
  return { root, manifestPath, outDir: join(root, '.claude') };
}

test('copies every skill directory including attachments', () => {
  const { root, manifestPath, outDir } = setup();
  const built = generate({ repoRoot: root, manifestPath, outDir });
  assert.deepEqual(built.sort(), ['manual', 'normal']);
  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'SKILL.md')));
  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'extra.md')));
});

test('applies disable-model-invocation only to manualOnly skills', () => {
  const { root, manifestPath, outDir } = setup();
  generate({ repoRoot: root, manifestPath, outDir });
  const manual = readFileSync(join(outDir, 'skills', 'manual', 'SKILL.md'), 'utf8');
  const normal = readFileSync(join(outDir, 'skills', 'normal', 'SKILL.md'), 'utf8');
  assert.match(manual, /disable-model-invocation: true/);
  assert.doesNotMatch(normal, /disable-model-invocation/);
});

test('rebuilds cleanly: a removed skill does not linger', () => {
  const { root, manifestPath, outDir } = setup();
  generate({ repoRoot: root, manifestPath, outDir });
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [{ name: 'normal', source: 's', path: 'normal' }],
  }));
  generate({ repoRoot: root, manifestPath, outDir });
  assert.ok(!existsSync(join(outDir, 'skills', 'manual')));
});

test('overlay files override the copied skill', () => {
  const { root, manifestPath, outDir } = setup();
  const overlayDir = join(root, 'overlays');
  mkdirSync(join(overlayDir, 'normal'), { recursive: true });
  writeFileSync(join(overlayDir, 'normal', 'SKILL.md'), '---\nname: normal\n---\npatched\n');
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });
  const patched = readFileSync(join(outDir, 'skills', 'normal', 'SKILL.md'), 'utf8');
  assert.match(patched, /patched/);
  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'extra.md')));
});

test('overlay replaces SKILL.md content and non-overlay skills are unaffected', () => {
  const { root, manifestPath, outDir } = setup();
  mkdirSync(join(root, 'src', 'target'), { recursive: true });
  writeFileSync(join(root, 'src', 'target', 'SKILL.md'), '---\nname: target\n---\noriginal content\n');
  writeFileSync(join(root, 'src', 'target', 'helper.md'), 'helper data\n');
  mkdirSync(join(root, 'src', 'bystander'), { recursive: true });
  writeFileSync(join(root, 'src', 'bystander', 'SKILL.md'), '---\nname: bystander\n---\nbystander content\n');
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [
      { name: 'target', source: 's', path: 'target' },
      { name: 'bystander', source: 's', path: 'bystander' },
    ],
  }));
  const overlayDir = join(root, 'overlays');
  mkdirSync(join(overlayDir, 'target'), { recursive: true });
  writeFileSync(join(overlayDir, 'target', 'SKILL.md'), '---\nname: target\n---\n# Overlayed Title\n\nAdded section with unique marker: OVL-a1b2.\n');
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });
  const target = readFileSync(join(outDir, 'skills', 'target', 'SKILL.md'), 'utf8');
  assert.match(target, /Overlayed Title/);
  assert.match(target, /OVL-a1b2/);
  assert.doesNotMatch(target, /original content/);
  assert.ok(existsSync(join(outDir, 'skills', 'target', 'helper.md')));
  const bystander = readFileSync(join(outDir, 'skills', 'bystander', 'SKILL.md'), 'utf8');
  assert.match(bystander, /bystander content/);
});
