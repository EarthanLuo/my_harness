# harness — bundle generator

This directory contains the generator that assembles a curated set of skills
from the `third-party/` submodules into this repo's dogfooded
`.claude/skills/` bundle.

## Purpose

`.claude/skills/` is not hand-maintained. It is generated output: a portable,
self-contained bundle of skills pulled from the various third-party skill
collections vendored under `third-party/`. Regenerating it lets us pick up
upstream changes to those submodules while keeping full control over exactly
which skills ship and how they behave in this repo.

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

## Local patches (overlays)

`harness/overlays/<skill>/` holds local modifications layered on top of a
skill's files after they're copied from the source submodule. Use overlays to
carry repo-specific edits (e.g. content folds, fixes) that would otherwise be
silently lost the next time the generator runs and re-copies from upstream.

## Usage

```
cd harness && node generate.js
```

Rebuilds `../.claude/skills` from scratch (removing any skills no longer in
the manifest, copying current ones, and applying overlays and
`manualOnly` frontmatter flags).

```
cd harness && node --test
```

Runs the generator's test suite.

## Important: do not hand-edit `.claude/skills/`

`.claude/skills/` is a committed, portable artifact — copy the whole
`.claude/` directory into any project to use this bundle there.

Because it is regenerated from scratch on every run, any changes made
directly inside `.claude/skills/` will be silently overwritten the next time
`node generate.js` runs. If you need a local modification to a skill, put it
in `harness/overlays/<skill>/` instead, so it survives regeneration.
