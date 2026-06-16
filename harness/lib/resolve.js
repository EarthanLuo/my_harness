import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function validateEntries(entries, sources, category) {
  const names = new Set();
  for (const e of entries) {
    if (!e.name) throw new Error(`${category} entry missing name`);
    if (names.has(e.name)) throw new Error(`duplicate ${category} name: ${e.name}`);
    names.add(e.name);

    if (e.source === 'overlay') continue;

    if (!sources[e.source]) throw new Error(`unknown source "${e.source}" on ${category} "${e.name}"`);

    if (!e.path) throw new Error(`${category} "${e.name}" with source "${e.source}" is missing path`);
  }
}

export function loadManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  const m = JSON.parse(raw);

  validateEntries(m.skills, m.sources, 'skill');

  if (m.hooks) validateEntries(m.hooks, m.sources, 'hook');

  if (m.commands) validateEntries(m.commands, m.sources, 'command');

  return m;
}

export function resolveSourcePath(manifest, entry, repoRoot) {
  if (entry.source === 'overlay') return null;
  const base = manifest.sources[entry.source];
  return join(repoRoot, base, entry.path);
}
