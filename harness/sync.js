import { resolve, join } from 'node:path';
import { existsSync, statSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruneDirectory, resolveTargets, resolveFlags, syncDirectory, syncTarget } from './lib/sync.js';

function resolveSuites(flags, repoRoot) {
  if (flags.source && flags.suite === 'both') {
    throw new Error('--source can only be used with a single --suite');
  }

  const claudeSource = flags.source && flags.suite === 'claude' ? resolve(flags.source) : join(repoRoot, '.claude');
  const codexRoot = flags.source && flags.suite === 'codex' ? resolve(flags.source) : repoRoot;

  const suites = {
    claude: [
      { name: 'claude', source: claudeSource, targetDir: '.claude', mode: 'managed' },
    ],
    codex: [
      { name: 'codex-skills', source: join(codexRoot, '.agents'), targetDir: '.agents', mode: 'managed' },
      { name: 'codex-hooks', source: join(codexRoot, '.codex'), targetDir: '.codex', mode: 'codex-hooks' },
    ],
  };

  return flags.suite === 'both'
    ? [...suites.claude, ...suites.codex]
    : suites[flags.suite];
}

function syncRootFile(srcFile, dstFile, { dryRun = false } = {}) {
  if (!existsSync(srcFile)) return 'absent';
  let needs = true;
  if (existsSync(dstFile) && statSync(dstFile).isFile()) {
    needs = !readFileSync(srcFile).equals(readFileSync(dstFile));
  }
  if (!needs) return 'unchanged';
  if (!dryRun) {
    mkdirSync(join(dstFile, '..'), { recursive: true });
    writeFileSync(dstFile, readFileSync(srcFile));
  }
  return 'updated';
}

function syncCodexHooks(srcCodex, dstCodex, { prune = false, dryRun = false } = {}) {
  const hooks = syncDirectory(join(srcCodex, 'hooks'), join(dstCodex, 'hooks'), { dryRun });
  if (prune) hooks.deleted = pruneDirectory(join(srcCodex, 'hooks'), join(dstCodex, 'hooks'), { dryRun }).deleted;
  return {
    hooks,
    hooksJson: syncRootFile(join(srcCodex, 'hooks.json'), join(dstCodex, 'hooks.json'), { dryRun }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const flags = resolveFlags(process.argv.slice(2));

  if (!flags.noBuild) {
    process.stdout.write('Building...\n');
    execSync('node generate.js', { cwd: import.meta.dirname, stdio: 'inherit' });
  }

  const suites = resolveSuites(flags, repoRoot);
  const targets = resolveTargets(
    flags.targets.length > 0 ? flags.targets : [],
    flags.config,
    join(import.meta.dirname, 'sync-targets.json'),
  );

  for (const t of targets) {
    if (flags.prune) t.prune = true;
    if (flags.overwriteSettings) t.overwriteSettings = true;
  }

  const prefix = flags.dryRun ? 'would update' : 'updated';

  process.stdout.write(`=== sync ===\n`);
  process.stdout.write(`suite:   ${flags.suite}\n`);
  process.stdout.write(`source:  ${suites.map(s => `${s.name}=${s.source}`).join(', ')}\n`);
  process.stdout.write(`targets: ${targets.length} project(s)\n\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const label = `[${i + 1}/${targets.length}] ${t.path}`;

    if (!existsSync(t.path) || !statSync(t.path).isDirectory()) {
      process.stdout.write(`${label}\n  ERROR: path not found or not a directory\n  FAILED\n\n`);
      fail++;
      continue;
    }

    process.stdout.write(`${label}\n`);
    let targetFailed = false;
    for (const suite of suites) {
      const dstSuite = join(t.path, suite.targetDir);
      let result;
      try {
        result = suite.mode === 'codex-hooks'
          ? syncCodexHooks(suite.source, dstSuite, { prune: t.prune, dryRun: flags.dryRun })
          : syncTarget(suite.source, dstSuite, {
            prune: t.prune, overwriteSettings: t.overwriteSettings, dryRun: flags.dryRun,
          });
      } catch (err) {
        process.stdout.write(`  ${suite.targetDir}: ERROR: ${err.message}\n`);
        targetFailed = true;
        break;
      }

      process.stdout.write(`  ${suite.targetDir}\n`);
      if (suite.mode === 'codex-hooks') {
        const r = result.hooks;
        const up = r.updated || 0, un = r.unchanged || 0;
        let line = `    ${'hooks'.padEnd(10)} ${un} up-to-date, ${up} ${prefix}`;
        if (r.deleted > 0) line += `, ${r.deleted} ${flags.dryRun ? 'would delete' : 'deleted'}`;
        process.stdout.write(`${line}\n`);
        process.stdout.write(`    hooks.json ${flags.dryRun && result.hooksJson === 'updated' ? 'would update' : result.hooksJson}\n`);
      } else {
        for (const dir of ['skills', 'hooks', 'commands']) {
          const r = result[dir];
          const up = r.updated || 0, un = r.unchanged || 0;
          let line = `    ${dir.padEnd(10)} ${un} up-to-date, ${up} ${prefix}`;
          if (r.deleted > 0) line += `, ${r.deleted} ${flags.dryRun ? 'would delete' : 'deleted'}`;
          process.stdout.write(`${line}\n`);
          if (flags.verbose && existsSync(join(suite.source, dir))) {
            for (const name of readdirSync(join(suite.source, dir))) process.stdout.write(`      ${name}\n`);
          }
        }
        const sl = flags.dryRun ? `would ${result.settings}` : result.settings;
        process.stdout.write(`    settings:   ${sl}\n`);
      }
    }
    if (targetFailed) {
      process.stdout.write(`  FAILED\n\n`);
      fail++;
    } else {
      process.stdout.write(`  OK\n\n`);
      ok++;
    }
  }

  process.stdout.write(`Done: ${ok} succeeded, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}
