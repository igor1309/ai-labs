# Agonara Skills

Parent directory for Agonara's **operator-facing BYOA skills** — one subfolder
per skill.

Agonara is operated "bring your own agent" (BYOA): instead of a bundled UI or
chat, an operator points the agent they already use at an Agonara instance and
loads the skill for the job they are doing. The skill is the portable operating
surface; the [OpenAPI contract](../docs/api/openapi.yml) is the substrate.

Planned shape (per-role skills over shared foundations) and rationale:
[`../docs/plans/byoa-operator-skills.md`](../docs/plans/byoa-operator-skills.md).

## Implemented skills

Shared foundations every role skill builds on:

- [`agonara-api-access/`](agonara-api-access/SKILL.md) — connect, authenticate
  (the `agonara_session` cookie), send CSRF-protected and idempotent mutations,
  and read the `accepted`/`rejected`/`fault` envelope.
- [`agonara-membership/`](agonara-membership/SKILL.md) — the role-neutral program
  participation model: read your memberships and invitations, act on invitations,
  inspect effective participation and membership history.

The **curator bucket** — per-role skills for the program curator, built on the
foundations above:

- [`agonara-curator-corpus/`](agonara-curator-corpus/SKILL.md) — create a program
  and control the draft↔accepted boundary for topics, concepts, materials, and
  navigation.
- [`agonara-curator-assessment/`](agonara-curator-assessment/SKILL.md) — author
  open-answer, quick, and readiness checks plus assessment criteria, keeping
  answer keys curator-only.
- [`agonara-curator-research/`](agonara-curator-research/SKILL.md) — record
  external sources, read coverage gaps, and review LLM-assisted curation
  suggestions as drafts.
- [`agonara-curator-participation/`](agonara-curator-participation/SKILL.md) —
  manage admission policy, invitations, and participants for a curated program.

The student and admin role skills build on the same foundations and are planned
next — see the [build sequence](../docs/plans/byoa-operator-skills.md).

The previous developer-facing `agonara-api` skill was removed — it served an
agent *building* Agonara's codebase, not an operator *using* the product, which
is the wrong consumer for this directory.

Skill discovery and publishing are deliberately out of scope for now and will be
addressed later.
