---
date: 2026-06-08
model: claude
description: "Pre-ADR exploring how to package and distribute Agonara's operator-facing BYOA skills: role-scoped plugins versus a single product plugin, and how shared foundations are reused. Verified for Claude Code only."
---

# Packaging Agonara Operator Skills for Distribution

## Context

Agonara's operator skills (`agonara-api-access`, `agonara-membership`, the
`agonara-curator-*` bucket, `agonara-student`, `agonara-admin`) are implemented
under `agonara/skills/`, but discovery and publishing were deliberately deferred.
The archived design brief
[`byoa-operator-skills.md`](../docs/plans/implemented/byoa-operator-skills.md)
parked "Packaging/home of operator skills" as an explicit open question. This
pre-ADR resolves the *shape* of that packaging.

> **Doc home.** This pre-ADR and its
> [findings note](./claude-code-plugin-system.md) live under `agonara/skills/`
> (beside the skills they describe) rather than the My Way `docs/pre-adr/` and
> research dirs — a deliberate owner choice to keep the packaging design next to
> the packaged artifacts.

Two facts frame the decision:

- **The product already has a settled role ontology** — curator, student, admin
  — cut by actor, not by implementation module. Skills are organized for the
  operator's role, not the builder's module map.
- **The Claude Code plugin system supports the mechanics this needs.** Plugins
  can declare dependencies on other plugins (auto-installed, transitively
  enabled); skills inside a plugin are namespaced `/<plugin>:<skill>`; and a
  visibility matrix governs what the model and the operator each see. These are
  recorded and sourced in
  [`claude-code-plugin-system.md`](./claude-code-plugin-system.md).

> **Verification scope.** This pre-ADR is grounded in **Claude Code**
> documentation only. Codex, Cursor, and other BYOA runtimes are **not**
> verified to support plugin dependencies or the same namespacing/visibility
> model. The emerging direction below is correct for Claude Code; cross-runtime
> portability is an open question, not a settled assumption.

The earlier instinct to look at the repo's flat `dev-skills` collection as a
precedent was rejected: `dev-skills` is a personal, in-flux toolkit whose
flatness reflects *its* immaturity, not a packaging pattern. It is neither
reference nor precedent for a product with established roles.

## Options considered

### Option A — Role-scoped plugins over a shared core

- **Description**: One plugin per role — `agonara-curator` (a bucket of
  `corpus`, `assessment`, `research`, `participation`), `agonara-student`,
  `agonara-admin` — each declaring a dependency on `agonara-core`
  (`api-access` + membership foundations). The `agonara-` prefix moves from the
  skill folder name to the plugin name, so folders drop to `corpus/`, `learn/`,
  etc., and invocation reads `/agonara-curator:corpus`.
- **Tradeoffs**: An operator installs only their role's plugin; the shared core
  is pulled in transitively, so there is one source of truth and no vendoring.
  Costs a `agonara-core` package and per-role `dependencies` declarations.
- **Product intent fit**: Strong. Mirrors the role ontology the product is
  already cut by; a student never installs curator or admin surface.
- **Risks**: The transitive-dependency convenience is Claude-Code-verified only.
  On a runtime without plugin dependencies, core must arrive another way
  (separate install or build-time symlink dedup).

### Option B — A single `agonara` plugin exposing every skill

- **Description**: One plugin namespaces all skills: `/agonara:curator-corpus`,
  `/agonara:student`, `/agonara:admin`, etc. Shared foundations are just more
  skills in the same plugin; non-relevant surface is suppressed with the
  visibility frontmatter.
- **Tradeoffs**: One install, no dependency wiring. But it cannot give an
  operator a clean context: per the verified visibility matrix,
  `user-invocable: false` still leaves a skill's description in context and
  model-invocable, and `disable-model-invocation: true` removes it from context
  but also stops the model auto-applying it. **No frontmatter combination** lets
  a student carry a context free of curator/admin surface while keeping
  foundations auto-loading.
- **Product intent fit**: Weak. Projects the whole product onto every operator's
  hand regardless of role.
- **Risks**: Cross-role surface leaks into every operator's model context;
  listings show every role's skills to everyone.

### Option C — Flat per-skill, no plugin packaging

- **Description**: Keep skills as standalone folders an operator copies in
  individually; no plugin manifest, no namespacing.
- **Tradeoffs**: Zero packaging work, but no install story, no namespacing
  (the `agonara-` prefix stays in every name), no shared-core reuse, and no
  role isolation.
- **Product intent fit**: Weak — this is the current in-repo state, which the
  brief already flagged as lacking a discovery/publishing surface.
- **Risks**: Drift between copies; no versioned distribution.

## Emerging direction

**Option A — role-scoped plugins over a shared `agonara-core` — is the current
best candidate, for Claude Code.**

The decisive reason is **install-scope isolation**: role plugins keep
other-role surface out of an operator's context because the other plugins are
simply not installed — an isolation Option B cannot achieve with any visibility
flag. Role-scoped packaging also matches the product's actual ontology and makes
the `agonara-` prefix drop out of skill names naturally via plugin namespacing.

"Shared" is resolved at the **packaging** layer, not by any single-plugin
compromise: `agonara-core` carries `api-access` + membership, and each role
plugin depends on it, so installing `agonara-student` transitively installs the
core. Whether membership is its own skill inside core or folded into a single
core skill is left open below.

This direction is provisional and is **not** a commitment to a final plugin
count, to the role names, or to the cross-runtime story.

## Provisional boundaries

- **Packages (provisional)**: `agonara-core` (foundations), `agonara-curator`
  (bucket), `agonara-student`, `agonara-admin`. Each role package depends on
  `agonara-core`.
- **Naming carrier**: the `agonara-` prefix lives in the *plugin* name; skill
  *folders* lose it (`corpus/`, not `agonara-curator-corpus/`).
- **Unstable**: the exact role-package names (e.g. `curator` vs `creator`),
  intra-role granularity, and whether membership is a distinct core skill.
- **Out of scope here**: the instance-shipped-vs-standalone-marketplace
  distribution model (where the packages are published and how an operator
  obtains them), and any implementation of the manifests themselves.

## Open questions

- **Cross-runtime portability.** Do Codex and Cursor support plugin
  dependencies, namespacing, and a visibility model equivalent to Claude Code's?
  If not, how does `agonara-core` reach a role package on those runtimes —
  separate install, vendored copy, or build-time symlink dedup?
- **Role naming.** Is `curator` the term operators reach for, or is `creator`
  (or another label) more ergonomic, given the plugin name is the most public
  string in the system?
- **Membership placement.** Is `membership` a distinct skill inside
  `agonara-core`, or folded into the core skill, given it is small and
  role-neutral?
- **Intra-role granularity.** Does curator stay a four-skill bucket, and do
  student/admin remain single-skill packages (and if so, what is the single
  skill's folder/invocation name)?
- **Distribution model.** Instance-shipped (versioned with the API) versus a
  standalone marketplace — which, and how does it interact with the role-scoped
  split? (The split is strongest in the standalone case.)
