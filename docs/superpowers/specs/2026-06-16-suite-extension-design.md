# Suite Extension: hooks, commands, settings.json

> 日期：2026-06-16 · 状态：设计已确认 · 作者：harness 维护者 + AI

## 概述

当前 `.claude/` 套件只有 `skills/`（34 个）。本次扩展增加 `hooks/`、`commands/`、`settings.json`，使套件成为完整的项目级 Claude Code 配置。

素材来源：RTK 子模块（`third-party/rtk/.claude/`），适配走 `harness/overlays/`。

不纳入本轮：`agents/`、`rules/`（留待第二阶段）。

## §1 — 整体架构

```
third-party/rtk/.claude/          ← 只读素材源（不修改子模块）
  hooks/    (rtk-rewrite.sh, rtk-suggest.sh)
  commands/ (13 个 md)

harness/
  manifest.json                   ← 扩：新增 hooks/commands/settings 段
  generate.js                     ← 扩：按类别分治
  settings.json                   ← 静态模板（单文件写入，不塞进 manifest）
  overlays/
    hooks/                        ← 项目原创钩子（含 safety-guard.ps1）
    commands/                     ← 改写后的 RTK 通用命令

.claude/                          ← 生成产物（可移植，已提交）
  skills/        (已有, 34)
  hooks/         (新增)
  commands/      (新增)
  settings.json  (新增)
```

约束：
- `third-party/rtk` 只读，所有适配在 `harness/overlays/` 或 `harness/settings.json` 完成
- `.claude/settings.json` 单文件写入，不整体清目录，避免误删其他可能存在的本地文件

## §2 — hooks/

### 产物

| 文件 | 类型 | 依赖 | 说明 |
|------|------|------|------|
| `hooks/rtk-rewrite.ps1` | PreToolUse:Bash | RTK CLI（可选） | PowerShell 版命令改写。RTK 未安装时低噪声降级（仅在检测到可改写命令时输出短提示），exit 1 放行 |
| `hooks/safety-guard.ps1` | PreToolUse:Bash | 无 | 独立安全钩子。拦截确认：`git push --force`、危险删除/递归、写系统目录等 |
| `hooks/rtk-suggest.ps1` | PreToolUse:Bash | RTK CLI（可选） | 检测可 RTK 改写的命令，注入 systemMessage 提示。**生成但不默认注册** |

### exit 语义约定

- `exit 0` + stdout：已改写，自动允许
- `exit 1`：放行（不改写），可选 stderr 提示
- `exit 2`：阻断/需用户确认

此约定写入每个脚本文件注释。

### settings.json 注册

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/rtk-rewrite.ps1",
        "timeout": 5
      },
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/safety-guard.ps1",
        "timeout": 3
      }
    ]
  }
}
```

`rtk-suggest.ps1` 暂不注册。

### 生成策略

三份 `.ps1` 均通过 `harness/overlays/hooks/` 产出（`source: "overlay"`），不从 RTK 子模块拷贝。

## §3 — commands/

### 纳入清单

| RTK 原命令 | 处理 | 理由 |
|-----------|------|------|
| `diagnose` | 直接纳入 | 环境诊断，通用 |
| `worktree` | 直接纳入 | Git worktree 管理 |
| `clean-worktree` | 直接纳入 | Worktree 清理 |
| `codereview` | 改写 | 去 Rust/cargo 假设，改为通用代码评审流程 |
| `audit-codebase` | 改写 | 去 Rust 专用审计项，保留代码库健康审计骨架 |

暂不纳入（仅在迁移说明记录）：`test-routing`、`worktree-status`、`clean-worktrees`、`tech/*`、其他 Rust/RTK 强绑定命令。

### 产物结构

```
.claude/commands/
  diagnose.md
  worktree.md
  clean-worktree.md
  codereview.md          ← 改写版
  audit-codebase.md      ← 改写版
```

### 文件格式

继承 RTK 模式：Markdown + YAML frontmatter：

```yaml
---
model: sonnet
description: 一行描述
---
```

### 生成策略

- 通用命令（`diagnose`、`worktree`、`clean-worktree`）：`manifest.json` 声明 `source: "rtk"` + `path`，直接从 RTK 子模块拷贝
- 改写命令（`codereview`、`audit-codebase`）：`harness/overlays/commands/` 提供完整改写版（`source: "overlay"`），直接生成目标文件
- 不纳入的命令不写进 manifest

## §4 — settings.json

### 模板

维护在 `harness/settings.json`，生成器读取后做变量替换（如需要），写入 `.claude/settings.json`。

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(node --test *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git status *)"
    ],
    "deny": []
  },
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/rtk-rewrite.ps1",
        "timeout": 5
      },
      {
        "type": "command",
        "command": "pwsh -NoProfile .claude/hooks/safety-guard.ps1",
        "timeout": 3
      }
    ]
  }
}
```

### 说明

- `permissions.allow`：白名单高频安全操作，减少交互摩擦但不放危险命令
- `permissions.deny`：留空，后续按需补充
- `hooks.PreToolUse`：只注册 `rtk-rewrite.ps1` + `safety-guard.ps1`
- `rtk-suggest.ps1` 生成但不启用
- 变量替换能力预留但第一版不强行使用
- 注意：`allow` 中的通配符格式需在实际运行中验证 Claude Code 匹配语义

## §5 — manifest.json + generate.js 扩展

### manifest.json 扩展示例

```json
{
  "sources": {
    "matt": "third-party/skills/skills",
    "sp": "third-party/superpowers/skills",
    "rtk": "third-party/rtk/.claude"
  },
  "skills": [ ... ],
  "hooks": [
    { "name": "rtk-rewrite.ps1", "source": "overlay" },
    { "name": "safety-guard.ps1", "source": "overlay" },
    { "name": "rtk-suggest.ps1", "source": "overlay" }
  ],
  "commands": [
    { "name": "diagnose", "source": "rtk", "path": "commands/diagnose.md" },
    { "name": "worktree", "source": "rtk", "path": "commands/worktree.md" },
    { "name": "clean-worktree", "source": "rtk", "path": "commands/clean-worktree.md" },
    { "name": "codereview", "source": "overlay" },
    { "name": "audit-codebase", "source": "overlay" }
  ]
}
```

语义：
- `source: "rtk"` + `path`：从 `sources.rtk/<path>` 拷贝单文件
- `source: "overlay"`：跳过基础拷贝，仅从 `harness/overlays/<类别>/<name>` 取文件
- `hooks` 的 `name` 保留完整文件名（如 `rtk-rewrite.ps1`），不推断扩展名
- `commands` 的 `name` 在 `source: "overlay"` 时默认输出为 `<name>.md`

### generate.js 分治逻辑

```
skills:    rmSync .claude/skills    → cpSync(src,sk) → overlay → manualOnly
hooks:     rmSync .claude/hooks     → cpSync(src,hk) → overlay
commands:  rmSync .claude/commands  → cpSync(src,cm) → overlay
settings:  读 harness/settings.json → 变量替换       → 写 .claude/settings.json
```

- `resolveSkillDir` 重命名为 `resolveSourcePath`
- 路径解析：用 `statSync().isFile()` / `isDirectory()` 决定复制方式，不依赖扩展名推断
- `source: "overlay"` 的条目跳过子模块拷贝，直接 overlay → 目标

## 测试计划

- 扩展现有 `generate.test.js` fixture：增加 hooks/commands 来源文件
- 测试：hooks 从 overlay 生成正确
- 测试：commands 从子模块单文件拷贝 + overlay 改写均正确
- 测试：settings.json 写入路径和内容正确
- 测试：各类别 `rmSync` 互不干扰
- 测试：`source: "overlay"` 跳过基础拷贝

## 迁移说明（随实现输出）

- RTK commands 全量清单 + 每个命令的处理决策（纳入/改写/暂不纳入）
- `rtk-suggest.ps1` 生成但不注册的原因
- `permissions.allow` 通配符格式待验证的标注
