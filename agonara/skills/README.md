# Agonara Skills

Parent directory for Agonara's **operator-facing BYOA skills** — one subfolder
per skill.

Agonara is operated "bring your own agent" (BYOA): instead of a bundled UI or
chat, an operator points the agent they already use at an Agonara instance and
loads the skill for the job they are doing. The skill is the portable operating
surface; the [OpenAPI contract](../docs/api/openapi.yml) is the substrate.

Planned shape (per-role skills over shared foundations) and rationale:
[`../docs/plans/byoa-operator-skills.md`](../docs/plans/byoa-operator-skills.md).

No skills are implemented here yet. The previous developer-facing `agonara-api`
skill was removed — it served an agent *building* Agonara's codebase, not an
operator *using* the product, which is the wrong consumer for this directory.

Skill discovery and publishing are deliberately out of scope for now and will be
addressed later.
