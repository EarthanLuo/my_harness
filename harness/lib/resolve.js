import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadManifest(manifestPath) {
  const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!data.sources || typeof data.sources !== 'object') {
    throw new Error('manifest: missing sources map');
  }
  if (!Array.isArray(data.skills)) {
    throw new Error('manifest: skills must be an array');
  }
  const seen = new Set();
  for (const s of data.skills) {
    if (!s.name) throw new Error('manifest: a skill is missing name');
    if (!s.path) throw new Error(`manifest: skill ${s.name} is missing path`);
    if (!data.sources[s.source]) {
      throw new Error(`manifest: skill ${s.name} has unknown source ${s.source}`);
    }
    if (seen.has(s.name)) throw new Error(`manifest: duplicate skill name ${s.name}`);
    seen.add(s.name);
  }
  return data;
}

export function resolveSkillDir(manifest, entry, repoRoot) {
  return resolve(repoRoot, manifest.sources[entry.source], entry.path);
}
