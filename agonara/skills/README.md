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

Per-role skills build on the foundations above.

The **curator bucket** — per-role skills for the program curator:

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

The **student** skill:

- [`agonara-student/`](agonara-student/SKILL.md) — operate as a learner:
  discover and preview programs without creating state, self-join/leave/rejoin
  and act on invitations, resume learning and follow the next step, study
  accepted concepts and materials, take quick/open/readiness checks, and read
  feedback, results, and the evidence behind progress — seeing only accepted
  corpus and the student's own state.

The **admin** skill:

- [`agonara-admin/`](agonara-admin/SKILL.md) — operate a private instance:
  bootstrap the first Admin, administer identities and local-password
  credentials, grant/revoke Admin authority while preserving the last-admin
  invariant, inspect access and audit events, and perform exceptional membership
  recovery/revocation without becoming the normal participation operator.

The previous developer-facing `agonara-api` skill was removed — it served an
agent *building* Agonara's codebase, not an operator *using* the product, which
is the wrong consumer for this directory.

Skill discovery and publishing are deliberately out of scope for now and will be
addressed later.
