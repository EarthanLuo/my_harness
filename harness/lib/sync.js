import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseTargetsFile(configPath) {
  if (!existsSync(configPath)) throw new Error(`target config file not found: ${configPath}`);
  const raw = readFileSync(configPath, 'utf8');
  let arr;
  try { arr = JSON.parse(raw); }
  catch (e) { throw new Error(`invalid JSON in config file ${configPath}: ${e.message}`); }
  if (!Array.isArray(arr)) throw new Error('target config must be a JSON array');
  return arr.map((entry, i) => {
    if (typeof entry === 'string') return { path: entry, prune: false, overwriteSettings: false };
    if (typeof entry === 'object' && entry !== null && typeof entry.path === 'string')
      return { path: entry.path, prune: entry.prune === true, overwriteSettings: entry.overwriteSettings === true };
    throw new Error(`invalid target entry at index ${i}: ${JSON.stringify(entry)}`);
  });
}

export function resolveTargets(cliTargets, configPath, defaultConfigPath) {
  let entries;
  if (cliTargets && cliTargets.length > 0)
    entries = cliTargets.map(p => ({ path: p, prune: false, overwriteSettings: false }));
  else if (configPath) entries = parseTargetsFile(configPath);
  else if (existsSync(defaultConfigPath)) entries = parseTargetsFile(defaultConfigPath);
  else throw new Error('no targets specified (use --targets, --config, or create harness/sync-targets.json)');
  return entries.map(e => ({ ...e, path: resolve(e.path) }));
}
