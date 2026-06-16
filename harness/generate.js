import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, resolveSkillDir } from './lib/resolve.js';
import { ensureManualOnly } from './lib/frontmatter.js';

export function generate({ repoRoot, manifestPath, outDir, overlayDir }) {
  const manifest = loadManifest(manifestPath);
  const skillsOut = join(outDir, 'skills');
  rmSync(skillsOut, { recursive: true, force: true });
  mkdirSync(skillsOut, { recursive: true });

  const built = [];
  for (const entry of manifest.skills) {
    const src = resolveSkillDir(manifest, entry, repoRoot);
    if (!existsSync(src)) {
      throw new Error(`source missing for ${entry.name}: ${src}`);
    }
    const dest = join(skillsOut, entry.name);
    cpSync(src, dest, { recursive: true });

    if (overlayDir) {
      const ov = join(overlayDir, entry.name);
      if (existsSync(ov)) cpSync(ov, dest, { recursive: true, force: true });
    }

    if (entry.manualOnly) {
      const skillFile = join(dest, 'SKILL.md');
      writeFileSync(skillFile, ensureManualOnly(readFileSync(skillFile, 'utf8')));
    }
    built.push(entry.name);
  }
  return built;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const count = generate({
    repoRoot,
    manifestPath: resolve(import.meta.dirname, 'manifest.json'),
    outDir: resolve(repoRoot, '.claude'),
    overlayDir: resolve(import.meta.dirname, 'overlays'),
  }).length;
  console.log(`Generated .claude/skills with ${count} skills`);
}
