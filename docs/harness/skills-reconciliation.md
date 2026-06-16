# Skills 重叠取舍决策（superpowers × mattpocock）

> 日期：2026-06-16 ·状态：已定稿（待落地）·作者：harness 维护者 + AI

## 1. 背景与本轮范围

`my_harness` 产出一份**可移植的项目级 `.claude/` 套件**：从 `third-party/` 的子模块里挑好东西，整理成一份能拷贝/同步进任意项目的 `.claude/`（`skills/` + `commands/` + `hooks/` + `settings.json` + 项目 `CLAUDE.md`）。多个项目复用同一套。

> **形态说明**：这是**项目级**配置（落在 `<project>/.claude/`），不是 user 全局 `~/.claude`。my_harness 是这份套件的版本化源头与组装车间。

当前可借鉴的三套现成方案，各有安装通道（仅作参考，项目级套件需自带等价物）：

- **mattpocock/skills** —— 现通过 `~/.cc-switch/skills/*` 符号链接全局安装（本仓即用其 `setup-matt-pocock-skills` 初始化）
- **obra/superpowers** —— 现通过官方 plugins cache 全局安装
- **rtk** —— 现通过全局 `hooks/rtk-rewrite.ps1` + `RTK.md`

**本轮只做一件事**：把 superpowers 与 mattpocock 之间**重叠的 skills** 理顺，决定每个重叠点留谁、怎么组合，产出进入套件的精选清单。不实际组装 `.claude/`，不引入 ECC/OpenHarness/deer-flow（留待后续轮次）。

本轮产物 = 本决策文档（含裁决表与理由） + 第 4 节的**精选清单（manifest）**。

## 2. 组织原则

两套 skills 不是同质竞争，而是各占一层；真重叠的挑更好的那个，其余多为互补、应组合而非二选一。

- **superpowers = 流程纪律 + 子 agent 编排层**
  差异化在于"把工作拆给隔离上下文的子 agent + 强制验证"。描述极简、触发导向。代表：brainstorming 门禁、writing/executing-plans、subagent/parallel 编排、worktrees、verification、finishing-branch。

- **mattpocock = 领域感知的工程/内容技能层**
  tdd/diagnose/review 都消费 `CONTEXT.md` + `docs/adr/` 词汇表；自带 issue-tracker/triage 流水线；外加写作/teach/caveman 等。
  **硬约束**：本仓已经采用了它的 issue-tracker / triage / domain-docs 基建（见 `CLAUDE.md`、`docs/agents/`）。凡与该基建耦合的 skill，倾向保留 mattpocock 版。

## 3. 重叠裁决表

| 关注点 | 裁决 | 理由 |
|--------|------|------|
| **TDD** | 留 matt `tdd`，吸收 SP 独有点（见 §5-T1） | matt 版更厚：反"水平切片"、behavior-not-implementation 哲学、`tests.md`/`mocking.md` 附件 |
| **调试** | 留 matt `diagnose`，吸收 SP 独有点（见 §5-T2） | "先建反馈回路"作为核心更可执行，且消费领域词汇表 |
| **写 skill** | 留 SP `writing-skills`；弃 matt `write-a-skill` | 更成熟、自带 skill 验证/测试（superpowers 自身即靠它构建）；my_harness 本身要高质量造 skill |
| **代码评审** | 留 matt `review` + SP `receiving-code-review`；SP `requesting-code-review` 保留但标记可选 | 三者实为不同活：matt `review`=你审某 diff（Standards+Spec 双轴并行子 agent）；SP `receiving`=如何不谄媚地接受反馈（**独有**）；SP `requesting`=工作中途自动派审，与 matt `review` 部分重叠 |
| **规划流水线** | 留 matt `to-prd`/`to-issues`/`triage` 为主线；SP `writing-plans` 串联作详细计划文档喂给 `to-issues`；SP `executing-plans` 保留 | matt 流水线契合本仓已采用的 issue-tracker 基建；SP `writing-plans` 计划质量高，可作中间产物 |
| **设计探索** | 留 SP `brainstorming` + matt `grill-with-docs` + matt `prototype`；`grill-me` 并入 `grill-with-docs` | 三者互补：开放探索 → 对抗式拷问（消费领域文档）→ throwaway 实证。`grill-me` 是 `grill-with-docs` 的无文档子集，后者已能优雅降级 |
| **架构** | 留 matt `improve-codebase-architecture` + `zoom-out` | SP 无对应物 |
| **完成验证** | 留 SP `verification-before-completion` | matt 无独立对应（仅隐含在 tdd/review 中） |

**净"选边"只有 5 处**：tdd→matt、diagnose→matt、write-a-skill→SP、grill-me 并入 grill-with-docs、requesting-code-review 降为可选。其余皆组合。

## 4. 精选清单（Manifest）

进入 `my_harness` 的 skill 集合，按层分组。

### 4.1 superpowers —— 编排 + 流程门禁层（整组保留）

| skill | 说明 |
|-------|------|
| `using-superpowers` | 入口路由（meta） |
| `brainstorming` | 设计探索门禁 |
| `writing-plans` | 详细计划文档（串联进 matt `to-issues`） |
| `executing-plans` | 带检查点的计划执行 |
| `subagent-driven-development` | 逐任务派子 agent + 两段评审 |
| `dispatching-parallel-agents` | 并行独立任务 |
| `using-git-worktrees` | 隔离工作区 |
| `finishing-a-development-branch` | 收尾/合并决策 |
| `verification-before-completion` | 完成前强制验证 |
| `writing-skills` | ✅ 胜出（替代 matt `write-a-skill`） |
| `receiving-code-review` | 接受评审反馈的纪律（独有） |
| `requesting-code-review` | ⚠️ 可选：与 matt `review` 部分重叠，作"中途自动派审"保留 |

### 4.2 mattpocock —— 领域感知工程/内容层（保留）

| skill | 说明 |
|-------|------|
| `tdd` | ✅ 胜出（替代 SP `test-driven-development`），待吸收 SP 独有点 |
| `diagnose` | ✅ 胜出（替代 SP `systematic-debugging`），待吸收 SP 独有点 |
| `review` | 双轴 diff 评审 |
| `to-prd` / `to-issues` / `triage` | 规划主线，契合本仓 issue-tracker 基建 |
| `prototype` | throwaway 实证 |
| `grill-with-docs` | 对抗式拷问（吸收 `grill-me`） |
| `improve-codebase-architecture` | 架构深化 |
| `zoom-out` | 抬升抽象层、给地图 |
| `setup-matt-pocock-skills` | 基建引导（本仓约定依赖） |
| `caveman` / `handoff` | 生产力（无重叠，适合项目级） |
| `setup-pre-commit` / `git-guardrails-claude-code` | 杂项工具（无重叠，适合项目级） |
| `scaffold-exercises` | 杂项（无重叠；偏教学场景，可选） |

> **项目级取舍（见 §5-T5）**：以下偏个人/写作、与"在代码项目里干活"关系不大的 skill **进套件但默认不自动触发**——通过 `disable-model-invocation: true` 设为手动调用（`/skill` 可启用），模型不会自动触发：`teach`、`edit-article`、`obsidian-vault`、`writing-beats`、`writing-fragments`、`writing-shape`。

### 4.3 弃用 / 被取代

| skill | 处置 | 原因 |
|-------|------|------|
| SP `test-driven-development` | 弃用 | 被 matt `tdd` 取代 |
| SP `systematic-debugging` | 弃用 | 被 matt `diagnose` 取代 |
| matt `write-a-skill` | 弃用 | 被 SP `writing-skills` 取代 |
| matt `grill-me` | 并入 | 折叠进 `grill-with-docs` |
| matt `deprecated/*`（design-an-interface、qa、request-refactor-plan、ubiquitous-language） | 排除 | 上游已 deprecated |
| matt `misc/migrate-to-shoehorn` | 排除（可选） | 过于专用 |

## 5. 后续合并任务（follow-up）

落地组装时需处理的"merge"动作，非本轮范围但在此登记：

- **T1**：通读 SP `test-driven-development` 正文，把其独有纪律折叠进 matt `tdd`。
- **T2**：通读 SP `systematic-debugging` 正文，把其独有点折叠进 matt `diagnose`（可选）。
- **T3**：确认 `grill-me` 的无文档路径已被 `grill-with-docs` 的优雅降级覆盖；若有独有措辞值得保留则折叠。
- **T4**：`requesting-code-review` 与 matt `review` 的边界写清楚（中途派审 vs 终局 diff 评审），避免触发竞争。
- **T5**：偏写作/个人类 skill 纳入套件但加 `disable-model-invocation: true`（手动可启用、默认不自动触发，见 §4.2 备注）。
  - **已落地**：manifest 用 `manualOnly: true` 标记 6 个（`teach`、`edit-article`、`obsidian-vault`、`writing-beats`、`writing-fragments`、`writing-shape`），生成器幂等注入标志。
  - **注意计数**：发布 bundle 中实际**手动触发的是 8 个**——除上述 6 个外，`zoom-out` 与 `setup-matt-pocock-skills` 上游 SKILL.md 已自带该标志。故 `manifest.json` 里 `manualOnly` 的数量不等于成品中手动触发 skill 的总数。

## 6. 本轮明确不做（后续轮次）

- **套件组装与同步机制**：怎么把精选 skill 拼成可移植 `.claude/`，以及如何把它拷贝/同步进目标项目并保持更新（拷贝 / 符号链接 / 子模块 / 生成脚本）。本仓既是源头也是组装车间。
- **开矿 ECC**：多工具/跨 IDE 配置、contexts/ 上下文工程。
- **开矿 OpenHarness**：autopilot/dashboard、多 agent 编排、自主循环。
- **开矿 deer-flow**：深度研究多 agent 流程（注意该子模块当前尚未拉取）。
- **rtk 扩展**：token 优化的进一步利用。
