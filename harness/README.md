# harness — bundle generator

This directory contains the generator that assembles a curated set of skills
from the `third-party/` submodules into this repo's dogfooded Claude Code and
Codex bundles.

## Purpose

`.claude/`, `.agents/skills/`, and `.codex/hooks*` are not hand-maintained.
They are generated output: portable, self-contained bundles pulled from the
various third-party skill collections vendored under `third-party/`.
Regenerating them lets us pick up upstream changes to those submodules while
keeping full control over exactly which skills ship and how they behave in this
repo.

The Claude bundle includes skills, hooks, commands, and `settings.json`. The
Codex bundle emits repo-discoverable skills under `.agents/skills` and Codex
lifecycle hooks under `.codex/hooks.json` + `.codex/hooks/`. Claude Code
markdown commands are not emitted for Codex because Codex does not use
`.claude/commands/*.md` as repo-local slash commands.

## Selection rationale

Why each skill was included, dropped, or modified is documented in
`docs/harness/skills-reconciliation.md`. Consult that doc before changing the
manifest — it explains the reasoning, not just the result.

## Manifest

`harness/manifest.json` is the source of truth for what gets generated. Each
entry specifies:

- `source` — which third-party submodule the skill comes from
- `path` — the path to the skill within that submodule
- `manualOnly` — whether the skill should be flagged
  `disable-model-invocation: true` in its frontmatter (i.e. invokable only
  when a user explicitly asks for it, not auto-triggered by the model)

The `manualOnly` frontmatter injection preserves the source file's existing
line-ending style (CRLF vs LF) — important because several vendored skills are
checked out CRLF on Windows (`core.autocrlf=true`). Don't "simplify"
`harness/lib/frontmatter.js` to hard-code `\n`; that reintroduces mixed line
endings (see its CRLF tests).

## Local patches (overlays)

`harness/overlays/<skill>/` holds local modifications layered on top of a
skill's files after they're copied from the source submodule. Use overlays to
carry repo-specific edits (e.g. content folds, fixes) that would otherwise be
silently lost the next time the generator runs and re-copies from upstream.

## Usage

```
cd harness && node generate.js
```

Rebuilds `../.claude/`, `../.agents/skills`, and `../.codex/hooks*` from
scratch (removing generated entries no longer in the manifest, copying current
ones, and applying overlays and `manualOnly` frontmatter flags).

```
cd harness && node --test
```

Runs the generator's test suite.

```
cd harness && node sync.js --suite codex --targets ../some-project
cd harness && node sync.js --suite both --targets ../some-project
```

Syncs the generated bundle into target projects. The default suite is
`claude`; use `codex` for `.agents/` + `.codex/`, or `both` when a project
should carry both agent bundles.

## Important: do not hand-edit generated bundles

`.claude/`, `.agents/skills/`, and `.codex/hooks*` are committed, portable
artifacts — copy the matching generated directories into any project to use
this bundle there.

Because it is regenerated from scratch on every run, any changes made
directly inside those generated directories will be silently overwritten the
next time `node generate.js` runs. If you need a local modification to a skill,
put it in `harness/overlays/<skill>/` instead, so it survives regeneration.

## Skills workflow

```mermaid
flowchart TD
    Start([用户请求 / 新任务]) --> Route{先判断任务状态}

    Route -->|想法还不清楚| Brainstorm[brainstorming<br/>澄清意图、需求、设计]
    Brainstorm --> Spec[产出 spec / design doc]

    Route -->|已有 spec 或需求| Plan[writing-plans<br/>写实施计划]
    Spec --> NeedGrill{术语/边界/架构<br/>是否不稳?}

    NeedGrill -->|是| Grill[grill-with-docs<br/>拷问方案、更新 CONTEXT/ADR]
    Grill --> Plan
    NeedGrill -->|否| Plan

    Plan --> NeedIssues{需要进入 issue tracker?}
    NeedIssues -->|是| Issues[to-issues<br/>拆成可独立领取的 issues]
    NeedIssues -->|否| ExecChoice{怎么执行?}
    Issues --> Triage{issue 是否需要整理状态?}
    Triage -->|是| TriageSkill[triage<br/>流转 needs-info / ready-for-agent 等]
    Triage -->|否| ExecChoice
    TriageSkill --> ExecChoice

    ExecChoice -->|单个小任务| Direct[直接实现]
    ExecChoice -->|已有完整 plan| Exec[executing-plans<br/>按计划执行]
    ExecChoice -->|多个独立任务| SDD[subagent-driven-development<br/>子 agent 分工 + 两段评审]
    ExecChoice -->|任务可并行| Parallel[dispatching-parallel-agents<br/>并行派发]

    Direct --> During{实现中遇到什么?}
    Exec --> During
    SDD --> During
    Parallel --> During

    During -->|bug / failing / 性能退化| Diagnose[diagnose<br/>复现、缩小、假设、验证、修复]
    During -->|需要测试先行| TDD[tdd<br/>红绿重构]
    During -->|需要原型验证| Proto[prototype<br/>throwaway demo]
    During -->|继续正常实现| Verify

    Diagnose --> Verify[verification-before-completion<br/>跑测试/检查，拿证据]
    TDD --> Verify
    Proto --> Plan
    Verify --> MidReview{是否只是中途检查?}

    MidReview -->|是| RequestReview[requesting-code-review<br/>轻量开发中评审]
    RequestReview --> During

    MidReview -->|否，准备交付| FinalReview[review<br/>Spec + Standards 终局审查]
    FinalReview --> ReviewFeedback{评审有反馈?}

    ReviewFeedback -->|有，且需要判断是否采纳| ReceiveReview[receiving-code-review<br/>评估反馈，避免盲从]
    ReceiveReview --> During

    ReviewFeedback -->|无重大问题| Finish[finishing-a-development-branch<br/>PR / merge / cleanup / 后续]
    Finish --> Done([完成])
```
