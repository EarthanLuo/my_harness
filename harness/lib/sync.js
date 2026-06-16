import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

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

export function resolveFlags(argv) {
  const flags = { noBuild: false, prune: false, overwriteSettings: false, dryRun: false, verbose: false, targets: [], config: null, source: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-build') flags.noBuild = true;
    else if (a === '--prune') flags.prune = true;
    else if (a === '--overwrite-settings') flags.overwriteSettings = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--source' && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.source = argv[++i];
    else if (a === '--config' && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.config = argv[++i];
    else if (a === '--targets') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.targets.push(argv[++i]);
    }
  }
  return flags;
}

export function syncDirectory(srcDir, dstDir, { dryRun = false } = {}) {
  if (!existsSync(srcDir)) return { updated: 0, unchanged: 0 };
  mkdirSync(dstDir, { recursive: true });
  let updated = 0, unchanged = 0;
  for (const name of readdirSync(srcDir)) {
    const sp = join(srcDir, name), dp = join(dstDir, name);
    const st = statSync(sp);
    if (st.isDirectory()) {
      if (existsSync(dp) && statSync(dp).isFile()) rmSync(dp);
      const sub = syncDirectory(sp, dp, { dryRun });
      updated += sub.updated; unchanged += sub.unchanged;
    } else {
      let needs = true;
      if (existsSync(dp)) {
        if (statSync(dp).isFile()) {
          const sb = readFileSync(sp), db = readFileSync(dp);
          if (sb.equals(db)) { needs = false; unchanged++; }
        } else if (statSync(dp).isDirectory()) {
          if (!dryRun) rmSync(dp, { recursive: true, force: true });
        }
      }
      if (needs) { if (!dryRun) writeFileSync(dp, readFileSync(sp)); updated++; }
    }
  }
  return { updated, unchanged };
}

export function pruneDirectory(srcDir, dstDir, { dryRun = false } = {}) {
  if (!existsSync(dstDir)) return { deleted: 0 };
  let deleted = 0;
  for (const name of readdirSync(dstDir)) {
    const sp = join(srcDir, name), dp = join(dstDir, name);
    if (!existsSync(sp)) {
      if (!dryRun) rmSync(dp, { recursive: true, force: true });
      deleted++;
    } else {
      const ss = statSync(sp), ds = statSync(dp);
      if (ss.isDirectory() && ds.isDirectory()) deleted += pruneDirectory(sp, dp, { dryRun }).deleted;
    }
  }
  return { deleted };
}

export function mergeSettings(srcSettings, dstSettings) {
  const S = srcSettings || {}, D = dstSettings || {};
  const merged = { ...D };

  const sa = S.permissions?.allow || [], da = D.permissions?.allow || [];
  if (sa.length + da.length > 0) {
    merged.permissions = { ...(merged.permissions || {}) };
    merged.permissions.allow = [...new Set([...da, ...sa])];
  }
  const sd = S.permissions?.deny || [], dd = D.permissions?.deny || [];
  if (sd.length + dd.length > 0) {
    merged.permissions = { ...(merged.permissions || {}) };
    merged.permissions.deny = [...new Set([...dd, ...sd])];
  }

  const events = new Set([...Object.keys(S.hooks || {}), ...Object.keys(D.hooks || {})]);
  if (events.size > 0) {
    merged.hooks = { ...(merged.hooks || {}) };
    for (const ev of events) {
      const sh = S.hooks?.[ev] || [], dh = D.hooks?.[ev] || [];
      const seen = new Set(), mh = [...dh];
      for (const h of dh) seen.add(JSON.stringify({ type: h.type, command: h.command }));
      for (const h of sh) {
        const k = JSON.stringify({ type: h.type, command: h.command });
        if (!seen.has(k)) { mh.push(h); seen.add(k); }
      }
      merged.hooks[ev] = mh;
    }
  }

  for (const k of Object.keys(S)) {
    if (k === 'permissions' || k === 'hooks') continue;
    if (!(k in merged)) merged[k] = S[k];
  }
  return merged;
}
