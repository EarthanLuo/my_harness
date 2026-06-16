# 可移植 `.claude/` 套件生成器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个 manifest 驱动的 Node 生成器，把 `docs/harness/skills-reconciliation.md` 裁定的精选 skill 从 `third-party/` 子模块组装成本仓自用（dogfood）的可移植 `.claude/skills/`。

**Architecture:** 声明式 `harness/manifest.json` 列出每个 skill 的来源、子路径、是否手动触发。生成器 `harness/generate.js` 读清单 → 清空重建 `.claude/skills/` → 递归拷贝每个 skill 目录 → 叠加 `harness/overlays/<name>/` 本地补丁 → 对 `manualOnly` 项幂等写入 `disable-model-invocation: true`。纯函数拆成 `lib/frontmatter.js` 与 `lib/resolve.js`，各自单测。

**Tech Stack:** Node.js v24（ESM，`node:test`、`node:fs` 的 `cpSync`/`rmSync`，零外部依赖）。

**本计划覆盖的决策文档条目：** T5（manualOnly）由 manifest 标志实现；overlay 机制为 T1/T2/T4 的内容折叠铺路（实际折叠留作后续计划，因需逐字比对两版正文）。settings.json / hooks / commands 的填充不在本计划范围。

---

## File Structure

- `harness/package.json` — `{"type":"module"}` + `generate`/`test` 脚本，把工具链限定在 `harness/`。
- `harness/manifest.json` — 精选清单（sources 映射 + skills 数组）。
- `harness/lib/frontmatter.js` — `ensureManualOnly(md)`：幂等地往 YAML frontmatter 注入 `disable-model-invocation: true`。
- `harness/lib/frontmatter.test.js`
- `harness/lib/resolve.js` — `loadManifest(path)` 校验 + 去重；`resolveSkillDir(manifest, entry, repoRoot)` 解析来源目录。
- `harness/lib/resolve.test.js`
- `harness/generate.js` — `generate({repoRoot, manifestPath, outDir, overlayDir})` 编排，外加 CLI 入口。
- `harness/generate.test.js`
- `harness/overlays/` — 本地补丁目录（本计划仅建占位 `.gitkeep`）。
- 产物：`.claude/skills/<name>/...`（提交进仓，作为可移植 artifact）。

---

## Task 1: harness 脚手架与 manifest

**Files:**
- Create: `harness/package.json`
- Create: `harness/manifest.json`
- Create: `harness/overlays/.gitkeep`

- [ ] **Step 1: 写 `harness/package.json`**

```json
{
  "name": "harness-bundle",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "node generate.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 写 `harness/manifest.json`**

来源根据决策文档 §4：`matt` = `third-party/skills/skills`，`sp` = `third-party/superpowers/skills`。`manualOnly` 对应 §4.2 备注的写作/个人类 skill。

```json
{
  "sources": {
    "matt": "third-party/skills/skills",
    "sp": "third-party/superpowers/skills"
  },
  "skills": [
    { "name": "using-superpowers", "source": "sp", "path": "using-superpowers" },
    { "name": "brainstorming", "source": "sp", "path": "brainstorming" },
    { "name": "writing-plans", "source": "sp", "path": "writing-plans" },
    { "name": "executing-plans", "source": "sp", "path": "executing-plans" },
    { "name": "subagent-driven-development", "source": "sp", "path": "subagent-driven-development" },
    { "name": "dispatching-parallel-agents", "source": "sp", "path": "dispatching-parallel-agents" },
    { "name": "using-git-worktrees", "source": "sp", "path": "using-git-worktrees" },
    { "name": "finishing-a-development-branch", "source": "sp", "path": "finishing-a-development-branch" },
    { "name": "verification-before-completion", "source": "sp", "path": "verification-before-completion" },
    { "name": "writing-skills", "source": "sp", "path": "writing-skills" },
    { "name": "receiving-code-review", "source": "sp", "path": "receiving-code-review" },
    { "name": "requesting-code-review", "source": "sp", "path": "requesting-code-review" },
    { "name": "tdd", "source": "matt", "path": "engineering/tdd" },
    { "name": "diagnose", "source": "matt", "path": "engineering/diagnose" },
    { "name": "to-prd", "source": "matt", "path": "engineering/to-prd" },
    { "name": "to-issues", "source": "matt", "path": "engineering/to-issues" },
    { "name": "triage", "source": "matt", "path": "engineering/triage" },
    { "name": "prototype", "source": "matt", "path": "engineering/prototype" },
    { "name": "grill-with-docs", "source": "matt", "path": "engineering/grill-with-docs" },
    { "name": "improve-codebase-architecture", "source": "matt", "path": "engineering/improve-codebase-architecture" },
    { "name": "zoom-out", "source": "matt", "path": "engineering/zoom-out" },
    { "name": "setup-matt-pocock-skills", "source": "matt", "path": "engineering/setup-matt-pocock-skills" },
    { "name": "review", "source": "matt", "path": "in-progress/review" },
    { "name": "caveman", "source": "matt", "path": "productivity/caveman" },
    { "name": "handoff", "source": "matt", "path": "productivity/handoff" },
    { "name": "setup-pre-commit", "source": "matt", "path": "misc/setup-pre-commit" },
    { "name": "git-guardrails-claude-code", "source": "matt", "path": "misc/git-guardrails-claude-code" },
    { "name": "scaffold-exercises", "source": "matt", "path": "misc/scaffold-exercises" },
    { "name": "teach", "source": "matt", "path": "productivity/teach", "manualOnly": true },
    { "name": "edit-article", "source": "matt", "path": "personal/edit-article", "manualOnly": true },
    { "name": "obsidian-vault", "source": "matt", "path": "personal/obsidian-vault", "manualOnly": true },
    { "name": "writing-beats", "source": "matt", "path": "in-progress/writing-beats", "manualOnly": true },
    { "name": "writing-fragments", "source": "matt", "path": "in-progress/writing-fragments", "manualOnly": true },
    { "name": "writing-shape", "source": "matt", "path": "in-progress/writing-shape", "manualOnly": true }
  ]
}
```

- [ ] **Step 3: 建 overlay 占位**

```bash
mkdir -p harness/overlays && : > harness/overlays/.gitkeep
```

- [ ] **Step 4: 提交**

```bash
git add harness/package.json harness/manifest.json harness/overlays/.gitkeep
git commit -m "feat(harness): scaffold bundle generator manifest"
```

---

## Task 2: frontmatter 助手 `ensureManualOnly`

**Files:**
- Create: `harness/lib/frontmatter.js`
- Test: `harness/lib/frontmatter.test.js`

- [ ] **Step 1: 写失败测试**

`harness/lib/frontmatter.test.js`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd harness && node --test lib/frontmatter.test.js`
Expected: FAIL —— `Cannot find module './frontmatter.js'`。

- [ ] **Step 3: 写最小实现**

`harness/lib/frontmatter.js`：

```js
const FLAG = 'disable-model-invocation: true';

export function ensureManualOnly(markdown) {
  if (!markdown.startsWith('---')) {
    throw new Error('SKILL.md has no leading frontmatter');
  }
  const close = markdown.indexOf('\n---', 3);
  if (close === -1) {
    throw new Error('SKILL.md has unterminated frontmatter');
  }
  const head = markdown.slice(0, close); // 起始 '---' 到闭合 '---' 之前，无尾换行
  if (/^disable-model-invocation:\s*true\s*$/m.test(head)) {
    return markdown;
  }
  return head + '\n' + FLAG + markdown.slice(close);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd harness && node --test lib/frontmatter.test.js`
Expected: PASS（3 passing）。

- [ ] **Step 5: 提交**

```bash
git add harness/lib/frontmatter.js harness/lib/frontmatter.test.js
git commit -m "feat(harness): add idempotent ensureManualOnly frontmatter helper"
```

---

## Task 3: manifest 解析与校验

**Files:**
- Create: `harness/lib/resolve.js`
- Test: `harness/lib/resolve.test.js`

- [ ] **Step 1: 写失败测试**

`harness/lib/resolve.test.js`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd harness && node --test lib/resolve.test.js`
Expected: FAIL —— `Cannot find module './resolve.js'`。

- [ ] **Step 3: 写最小实现**

`harness/lib/resolve.js`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd harness && node --test lib/resolve.test.js`
Expected: PASS（4 passing）。

- [ ] **Step 5: 提交**

```bash
git add harness/lib/resolve.js harness/lib/resolve.test.js
git commit -m "feat(harness): add manifest loader with validation"
```

---

## Task 4: 生成器核心（拷贝 + manualOnly）

**Files:**
- Create: `harness/generate.js`
- Test: `harness/generate.test.js`

- [ ] **Step 1: 写失败测试**

`harness/generate.test.js`（用临时 fixture 源树，不依赖真实子模块）：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from './generate.js';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gen-'));
  // 源 skill: src/normal 与 src/manual
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
  // 改清单只留 normal，再次生成
  writeFileSync(manifestPath, JSON.stringify({
    sources: { s: 'src' },
    skills: [{ name: 'normal', source: 's', path: 'normal' }],
  }));
  generate({ repoRoot: root, manifestPath, outDir });
  assert.ok(!existsSync(join(outDir, 'skills', 'manual')));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd harness && node --test generate.test.js`
Expected: FAIL —— `Cannot find module './generate.js'`。

- [ ] **Step 3: 写最小实现**

`harness/generate.js`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd harness && node --test generate.test.js`
Expected: PASS（3 passing）。

- [ ] **Step 5: 提交**

```bash
git add harness/generate.js harness/generate.test.js
git commit -m "feat(harness): add manifest-driven skill bundle generator"
```

---

## Task 5: overlay 机制（本地补丁叠加）

> 生成器已在 Task 4 写入 overlay 逻辑；本 Task 用一条专门测试锁定其行为，为 T1/T2/T4 的内容折叠提供可版本化、可重放的入口。

**Files:**
- Modify: `harness/generate.test.js`（追加一条测试）

- [ ] **Step 1: 追加失败测试**

在 `harness/generate.test.js` 末尾追加：

```js
test('overlay files override the copied skill', () => {
  const { root, manifestPath, outDir } = setup();
  const overlayDir = join(root, 'overlays');
  mkdirSync(join(overlayDir, 'normal'), { recursive: true });
  writeFileSync(join(overlayDir, 'normal', 'SKILL.md'), '---\nname: normal\n---\npatched\n');
  generate({ repoRoot: root, manifestPath, outDir, overlayDir });
  const patched = readFileSync(join(outDir, 'skills', 'normal', 'SKILL.md'), 'utf8');
  assert.match(patched, /patched/);
  // 未被 overlay 的附件仍在
  assert.ok(existsSync(join(outDir, 'skills', 'normal', 'extra.md')));
});
```

- [ ] **Step 2: 跑测试确认通过（逻辑已在 Task 4 实现）**

Run: `cd harness && node --test generate.test.js`
Expected: PASS（4 passing）。若失败，对照 Task 4 Step 3 的 overlay 分支修正。

- [ ] **Step 3: 提交**

```bash
git add harness/generate.test.js
git commit -m "test(harness): lock overlay override behavior"
```

---

## Task 6: 真实生成 + dogfood 接线

**Files:**
- Create: `.claude/skills/**`（生成物）
- Create: `harness/README.md`
- Modify: `CLAUDE.md`（加一行指向生成器）
- Modify: `.gitignore`（若需）

- [ ] **Step 1: 跑全部测试**

Run: `cd harness && node --test`
Expected: PASS（frontmatter 3 + resolve 4 + generate 4 = 11 passing）。

- [ ] **Step 2: 对真实子模块生成**

Run: `cd harness && node generate.js`
Expected: 输出 `Generated .claude/skills with 34 skills`（manifest 共 34 条）。

- [ ] **Step 3: 验证产物**

Run: `ls .claude/skills | wc -l` → 期望 `34`。
Run: `node -e "const fs=require('fs');for(const n of ['teach','edit-article','obsidian-vault','writing-beats','writing-fragments','writing-shape']){const m=fs.readFileSync('.claude/skills/'+n+'/SKILL.md','utf8');if(!/disable-model-invocation: true/.test(m))throw new Error('missing flag: '+n)}console.log('manualOnly flags OK')"`
Expected: `manualOnly flags OK`。
Run: `ls .claude/skills/tdd` → 期望含 `SKILL.md mocking.md tests.md` 等附件（确认递归拷贝）。

- [ ] **Step 4: 写 `harness/README.md`**

```markdown
# harness — bundle generator

把 `third-party/` 子模块里精选的 skill 组装成本仓 dogfood 的 `.claude/skills/`。

- 选取依据：`docs/harness/skills-reconciliation.md`
- 清单：`harness/manifest.json`（来源 + 子路径 + manualOnly）
- 本地补丁：`harness/overlays/<skill>/`（拷贝后叠加，承载 T1/T2/T4 的内容折叠）

## 用法

```bash
cd harness && node generate.js   # 重建 ../.claude/skills
cd harness && node --test        # 跑测试
```

`.claude/skills/` 是提交进仓的可移植产物：拷贝整个 `.claude/` 到任意项目即生效。
```

- [ ] **Step 5: 在根 `CLAUDE.md` 加指引**

在文件末尾追加：

```markdown

## Harness bundle

`.claude/skills/` 由 `harness/generate.js` 从 `third-party/` 子模块按 `harness/manifest.json` 生成（依据 `docs/harness/skills-reconciliation.md`）。改动 skill 选取请改 manifest 后重跑生成器，勿手改 `.claude/skills/`（会被覆盖；本地修改走 `harness/overlays/`）。
```

- [ ] **Step 6: 提交生成物与接线**

```bash
git add .claude harness/README.md CLAUDE.md
git commit -m "feat(harness): generate dogfooded .claude bundle and wire docs"
```

---

## 后续（不在本计划）

- **T1/T2 内容折叠**：通读 SP `test-driven-development` / `systematic-debugging` 正文，把独有纪律做成 `harness/overlays/tdd/`、`harness/overlays/diagnose/` 补丁。
- **T4**：在 `harness/overlays/review/` 或 `requesting-code-review` 里写清两者边界。
- **套件其余部分**：`.claude/settings.json`、hooks（含 rtk）、commands 的填充。
- **同步进目标项目**的脚本（拷贝/子模块化）。
- 开矿 ECC / OpenHarness / deer-flow。
