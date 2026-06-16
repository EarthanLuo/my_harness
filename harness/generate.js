import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { loadManifest, resolveSourcePath } from './lib/resolve.js';
import { ensureManualOnly } from './lib/frontmatter.js';

function generateCategory({ manifest, category, repoRoot, overlayDir, skillsOut, onBuilt }) {
  const entries = manifest[category];
  if (!entries || entries.length === 0) return;

  for (const entry of entries) {
    const destDir = join(skillsOut, entry.name);

    const src = resolveSourcePath(manifest, entry, repoRoot);
    if (src) {
      if (!existsSync(src)) {
        throw new Error(`source missing for ${category} "${entry.name}": ${src}`);
      }
      mkdirSync(dirname(destDir), { recursive: true });
      if (statSync(src).isDirectory()) {
        cpSync(src, destDir, { recursive: true });
      } else {
        mkdirSync(dirname(destDir), { recursive: true });
        copyFileSync(src, destDir);
      }
    } else {
      mkdirSync(dirname(destDir), { recursive: true });
    }

    if (overlayDir) {
      const ov = category === 'skills'
        ? join(overlayDir, entry.name)
        : join(overlayDir, category, entry.name);
      if (existsSync(ov)) {
        if (statSync(ov).isDirectory()) {
          cpSync(ov, destDir, { recursive: true, force: true });
        } else {
          copyFileSync(ov, destDir);
        }
      }
    }

    if (category === 'skills' && entry.manualOnly) {
      const skillFile = join(destDir, 'SKILL.md');
      writeFileSync(skillFile, ensureManualOnly(readFileSync(skillFile, 'utf8')));
    }

    if (onBuilt) onBuilt(entry.name);
  }
}

export function generate({ repoRoot, manifestPath, outDir, overlayDir, categories = ['skills', 'hooks', 'commands'] }) {
  const manifest = loadManifest(manifestPath);
  const selectedCategories = categories.filter(category => ['skills', 'hooks', 'commands'].includes(category));

  const cleanDirs = {
    skills: join(outDir, 'skills'),
    hooks: join(outDir, 'hooks'),
    commands: join(outDir, 'commands'),
  };

  for (const category of selectedCategories) {
    const dir = cleanDirs[category];
    if (manifest[category] && manifest[category].length > 0) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
  }

  const built = { skills: [], hooks: [], commands: [] };

  for (const category of selectedCategories) {
    generateCategory({
      manifest,
      category,
      repoRoot,
      overlayDir,
      skillsOut: cleanDirs[category],
      onBuilt: (name) => built[category].push(name),
    });
  }

  return built;
}

export function generateSettings({ outDir, settingsPath }) {
  const settingsFile = join(outDir, 'settings.json');
  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, settingsFile);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(import.meta.dirname, '..');
  const claudeBuilt = generate({
    repoRoot,
    manifestPath: resolve(import.meta.dirname, 'manifest.json'),
    outDir: resolve(repoRoot, '.claude'),
    overlayDir: resolve(import.meta.dirname, 'overlays'),
  });
  generateSettings({
    outDir: resolve(repoRoot, '.claude'),
    settingsPath: resolve(import.meta.dirname, 'settings.json'),
  });

  const codexBuilt = generate({
    repoRoot,
    manifestPath: resolve(import.meta.dirname, 'manifest.json'),
    outDir: resolve(repoRoot, '.codex'),
    overlayDir: resolve(import.meta.dirname, 'overlays'),
    categories: ['skills'],
  });

  const claudeTotal = claudeBuilt.skills.length + claudeBuilt.hooks.length + claudeBuilt.commands.length;
  console.log(`Generated .claude/: ${claudeBuilt.skills.length} skills, ${claudeBuilt.hooks.length} hooks, ${claudeBuilt.commands.length} commands`);
  console.log(`Generated .codex/: ${codexBuilt.skills.length} skills`);
  console.log(`Total: ${claudeTotal + codexBuilt.skills.length} files`);
}
