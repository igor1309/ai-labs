---
date: 2026-06-08
model: claude
description: "Verified mechanics of the Claude Code plugin and skill system relevant to packaging Agonara's operator skills: plugin dependencies, skill namespacing, the model/user visibility matrix, and marketplace symlink dedup."
---

# Claude Code Plugin & Skill System — Packaging Mechanics

> **Scope of verification.** Every claim below was checked against the official
> Claude Code documentation at `code.claude.com` (June 2026) and is **specific
> to Claude Code**. Equivalent support in **Codex, Cursor, and other BYOA
> runtimes is NOT verified** — see Open questions. Do not assume any of this
> transfers to another agent runtime without re-checking that runtime's docs.

## Purpose

Agonara is bring-your-own-agent: operator skills are the product's operating
surface and must be packaged for distribution. Before deciding *how* to package
them (see
[`operator-skill-packaging_pre_adr.md`](./operator-skill-packaging_pre_adr.md)),
we needed to know what the plugin system actually supports — specifically
whether shared foundations can be reused across role-scoped packages without
duplication, and whether a single package can hide non-relevant surface from an
operator. This note records the verified mechanics.

## Plugin-to-plugin dependencies

Plugins **can** declare dependencies on other plugins. `plugin.json` (or the
marketplace entry) takes a `dependencies` array with optional semver
constraints:

```json
{ "dependencies": ["agonara-core", { "name": "agonara-core", "version": "~1.0.0" }] }
```

Behavior:

- Installing a plugin **auto-resolves and installs** its declared dependencies.
- Enabling a plugin **enables its dependencies transitively** at the same scope.
- Disabling a dependency is **refused** while another enabled plugin still
  depends on it.

There is no general "shared library" primitive; reuse is expressed as a
dependency on a separately-published plugin. Source:
<https://code.claude.com/docs/en/plugin-dependencies.md>,
<https://code.claude.com/docs/en/plugins-reference.md>.

## Marketplace symlink dedup

Within a single marketplace, a plugin's `skills/` directory may contain
**symlinks** to skills owned by another plugin in the same marketplace. At
install the symlink is dereferenced and the target's content is copied into the
cache. This lets a meta-plugin reuse another plugin's skills without a second
source of truth. Source:
<https://code.claude.com/docs/en/plugins-reference.md>.

## Skill namespacing inside a plugin

A skill that ships in a plugin is invoked as `/<plugin-name>:<skill-name>`:

- the plugin's `name` field is the **namespace**;
- the skill **folder name** is the local part.

So a plugin named `agonara-curator` with a `corpus/` skill folder yields
`/agonara-curator:corpus`. The `agonara-` prefix that currently lives in the
folder name (`agonara-curator-corpus/`) is carried by the plugin name instead,
so the folder drops to `corpus/`. The frontmatter `name` sets the display label
in listings but does not change what you type (except for a plugin-root
`SKILL.md`, where frontmatter `name` is the invocation name). Source:
<https://code.claude.com/docs/en/plugins.md>,
<https://code.claude.com/docs/en/skills.md>.

## Skill visibility matrix

Two frontmatter fields control exposure. There is **no** "private skill callable
only by another skill" — skills cannot invoke one another at all (see below).

| frontmatter | you invoke | model invokes | loaded into context |
|---|---|---|---|
| (default) | yes | yes | description always in context; full skill on invoke |
| `disable-model-invocation: true` | yes | no | **description NOT in context**; full skill loads only when you invoke |
| `user-invocable: false` | **no** | yes | description always in context; full skill loads when invoked |

Consequence for packaging: `user-invocable: false` keeps a foundation skill out
of the `/` menu while the model still auto-applies it — but it does **not**
remove the skill's description from context, and the model can still invoke it.
`disable-model-invocation: true` is the only flag that removes a skill from
context, but it also stops the model from auto-applying the skill. Therefore **no
single-plugin frontmatter combination** gives an operator a context free of
other-role surface while keeping foundations auto-loading. Source:
<https://code.claude.com/docs/en/skills.md>.

## Skills cannot invoke skills

There is **no** documented mechanism for one skill to call, invoke, or auto-load
another skill. Skills are independent prompts the model orchestrates. They can
reference *supporting files* in their own directory via markdown links
(progressive disclosure), and can inject dynamic context via `` !`command` ``,
but neither is skill-to-skill invocation. (Subagents are a separate mechanism:
an agent's frontmatter `skills` field can preload skills into that subagent.)
Source: <https://code.claude.com/docs/en/skills.md>.

## Open questions

- Does **Codex** support plugin-to-plugin dependencies, namespacing, and a
  visibility matrix equivalent to the above? Its plugin manifest
  (`.codex-plugin/plugin.json`) is flatter (`"skills": "./"`).
- Does **Cursor** (and any other targeted BYOA runtime) support an equivalent
  packaging model, or only flat skill installation?
- If a runtime lacks plugin dependencies, what is the fallback for shared
  foundations there (separate install, vendored copy, or symlink dedup at build
  time)?
