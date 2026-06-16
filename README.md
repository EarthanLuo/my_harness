# my_harness

从多个开源 agent harness「取长补短」，组装成一份**可移植的项目级 `.claude/` 套件**。

本仓既是这份套件的**版本化源头与组装车间**，也 dogfood 自用：把整个 `.claude/` 目录拷进任意项目即可在那里启用同一套 skills。

## 它解决什么

社区里几套 Claude Code / agent harness 各有所长，但分散在不同安装通道、彼此还有重叠。这个仓库把它们 vendored 进 `third-party/`，按一份显式清单挑选、去重、改造，生成一份自包含、可移植、可复现的 skill 套件。

## 仓库结构

```
my_harness/
├── .claude/skills/        ← 生成产物：精选 skill 套件（提交进仓，可移植）
├── harness/               ← 组装车间
│   ├── manifest.json      ← 精选清单（来源 + 路径 + 是否手动触发）
│   ├── generate.js        ← 生成器（manifest 驱动，Node 零依赖）
│   ├── lib/               ← resolve.js（清单解析）/ frontmatter.js（注入标志）
│   ├── overlays/          ← 本地补丁（拷贝后叠加，不被 regen 覆盖）
│   └── README.md          ← 生成器用法详解
├── docs/
│   ├── harness/           ← 取舍决策 + 实施计划
│   └── agents/            ← issue-tracker / triage / domain 约定
├── third-party/           ← vendored 子模块（取材来源）
└── CLAUDE.md              ← 项目说明（含 Harness bundle 指引）
```

## 用法

```bash
cd harness
node generate.js   # 从 third-party/ 子模块按 manifest 重建 ../.claude/skills
node --test        # 跑生成器测试
```

`.claude/skills/` 是**提交进仓的可移植产物**——不要手改它（regen 会覆盖）；本地修改请放进 `harness/overlays/<skill>/`。详见 [`harness/README.md`](harness/README.md)。

## 取材来源（`third-party/` 子模块）

| 子模块 | 定位 | 长处 |
|--------|------|------|
| [`superpowers`](https://github.com/obra/superpowers) | skills 系统 | 流程纪律 + 子 agent 编排（brainstorm/plans/TDD/review/verification） |
| [`skills`](https://github.com/mattpocock/skills) | mattpocock skills | 领域感知工程/内容技能 + issue-tracker/triage 约定 |
| [`ECC`](https://github.com/affaan-m/ECC) | 多工具 agent 配置 | 跨 cursor/gemini/codex/qwen 等的覆盖、上下文工程 |
| [`OpenHarness`](https://github.com/HKUDS/OpenHarness) | 完整 agentic 系统 | autopilot/dashboard、多 agent 编排 |
| [`deer-flow`](https://github.com/bytedance/deer-flow) | 深度研究框架 | 多 agent research（⚠️ 该子模块尚未拉取） |
| [`rtk`](https://github.com/rtk-ai/rtk) | Rust token 代理 | token 优化 |

## 当前状态

**已完成**：superpowers × mattpocock 的 skills 重叠取舍 + 生成器。

- 取舍依据：[`docs/harness/skills-reconciliation.md`](docs/harness/skills-reconciliation.md)
  组织原则——superpowers 占编排/流程层、mattpocock 占领域感知工程/内容层，真重叠挑更好的那个。
- 产物：套件含 **34 个 skill**，其中 **8 个**默认手动触发（`disable-model-invocation: true`，需用户显式调用）。

**后续轮次**：把 superpowers 的 tdd/diagnose 独有点折叠成 overlay；填充套件的 `settings.json` / hooks / commands；做「同步进目标项目」的脚本；开矿 ECC / OpenHarness / deer-flow。

## 取材许可

各子模块保留其各自的开源许可证，见 `third-party/<name>/LICENSE`。
