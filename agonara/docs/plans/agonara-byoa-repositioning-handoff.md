---
date: 2026-06-07
model: claude
description: "Handoff: reposition Agonara as a bring-your-own-agent (BYOA) product and adapt its docs — Product Intent, README, landing, and downstream artifacts — to match. Significant job; do on a dedicated branch."
---

# Handoff — Agonara BYOA Repositioning

> Do this on a **dedicated branch**, separate from the skills-structure work.
> This job changes Agonara's positioning at the **Product Intent** level, so it
> ripples downstream through My Way artifacts. Treat it as an intent change, not
> a copy edit.

## 1. Why

Agonara's surfaces are currently presented as "API-first, with browser UIs and
an operator CLI as clients." The new positioning is sharper:

> **Agonara is bring-your-own-agent (BYOA).** Instead of building a UI and
> plugging an agent into it via some chat/UX, the product is the **API plus a
> set of role skills**. An operator brings whatever agent they already work in,
> points it at their Agonara instance, loads the skill for the job, and operates
> the product through the contract. The skill is the operating surface.

The skills-structure branch has already acted on the *skills* consequence
(removed the developer-facing `agonara-api` skill; established
`agonara/skills/` for per-role operator skills; see
`byoa-operator-skills.md`). This handoff covers the **product and docs**
consequence, which is larger and was deliberately deferred.

## 2. Positioning shift (from → to)

| Aspect | From (current) | To (BYOA) |
|---|---|---|
| Primary surface | Browser UIs (`/learn`, `/admin`) + API | Agent + role skill, over the API (primary, not exclusive) |
| Role of UI | The way you use the product | Stays first-class alongside BYOA (see §5 — resolved) |
| Role of skills | A dev aid for building routes | The product's operating surface for each role |
| Mental model | "An app with an API" | "An operable contract you drive with your own agent" |
| Substrate for users | UI screens | OpenAPI contract + per-role skills |

## 3. Scope — documents to adapt

Work through these. Each is listed with the change intent; do not mechanically
rewrite — reposition.

1. **Product Intent** — `docs/intent/intent_learning_program_app.md`
   - The keystone. Reframe the product definition and intended use around BYOA:
     curated programs + learner progression remain the *what*; BYOA becomes the
     *how it is operated*. Add the BYOA operating model explicitly.
   - This is a My Way Product Intent edit — follow `../docs/my-way/` for required
     structure and downstream traceability. Changing intent may require a
     **pre-ADR / ADR** for the positioning decision (see §4).

2. **User stories** — `docs/intent/{curator,student,admin}_user_stories.md`
   - The jobs themselves largely hold (they are role/job framed already). Check
     for stories that assume a UI as the only access path and generalize them to
     "via my agent / the API." Add stories if BYOA introduces new operator jobs
     (e.g., "as a curator I want to drive curation from my own agent").
   - Keep the existing "membership governed outside my workspace" framing — it is
     load-bearing for the shared-membership skill.

3. **README** — `README.md` (project) and repo-root `README.md` Components row
   - Lead with BYOA. Reframe the "Product surfaces" / "How humans and agents
     reach it" narrative. The repo-root Components table row for `agonara`
     should reflect the repositioned one-liner (see CLAUDE.md doc-maintenance).

4. **Landing** — `index.html`
   - The `#surfaces` section ("How humans and agents reach it") needs the BYOA
     story front and center. The dead `agonara-api` skill card was already
     removed and the prose de-referenced; the remaining repositioning is
     narrative, not just cleanup. Consider a "Bring your own agent" hero/section.

5. **Architecture deep-dive** — `architecture.html`
   - Ensure the surfaces/runtime narrative is consistent with BYOA. The module
     ownership map stays (it is the builder's view and is correct); what changes
     is how the *operator-facing* surface is described.

6. **Brand brief** — `docs/brand/brand_brief.md` (+ `_ru`)
   - Check the "Product Fit" framing still holds; add BYOA if it strengthens the
     "AI as assistant, not author" + "human-owned curriculum" story. Keep EN/RU
     parallel.

7. **AGENTS / discoverability** — `AGENTS.md` already points at the operator-skill
   plan; revisit once intent lands.

## 4. My Way / governance implications (do not skip)

- Product Intent is **upstream** of ADRs and specs. ADR-004…016 and the module
  responsibility map cite the intent and user stories. Before/while editing
  intent, check **backward traceability**: which ADRs and specs reference the
  text you are changing, and does the BYOA framing contradict any accepted
  decision? (It should not — module ownership is unaffected — but verify.)
- The positioning change itself ("the product is API + skills, not a bundled
  UI") is plausibly an **architecture-significant decision** deserving its own
  pre-ADR → ADR, especially because it bears on the status of the existing
  `/learn` and `/admin` UIs (§5). Decide early whether an ADR is warranted;
  consult `../docs/my-way/` and the `adr-governance` skill.
- After intent changes, run a **traceability pass** (the `traceability-review`
  skill) over intent → ADR → spec to catch divergence introduced by the reframe.

## 5. Decision — fate of `/learn` and `/admin` (resolved)

**The `/learn` and `/admin` UIs stay, as first-class surfaces.** BYOA is the
**primary** way to operate Agonara but **not the only** one. Reposition the
surfaces narrative as "BYOA-first, UIs alongside" — present the agent + skill
path as the lead, and keep the UIs as fully supported clients of the same
contract. Do **not** write any doc as if the UIs are deprecated or demoted to
mere examples.

## 6. Suggested sequence

1. Branch from trunk (dedicated repositioning branch).
2. §5 (UI fate) is settled — UIs stay, BYOA primary not exclusive. Decide only
   whether the positioning still warrants an ADR (§4).
3. Edit Product Intent first (keystone); then user stories.
4. Propagate to README (project + repo-root row), landing, architecture, brand.
5. Run `traceability-review`; reconcile any intent↔ADR↔spec drift.
6. Update `docs/log.md` (project) and repo-root `docs/log.md` if repo-wide.
7. Verify gates per repo CLAUDE.md (docs-mostly, but run the suite if any
   config/CI/generated artifact is touched). Landing/README are not Node/TS.
8. PR into trunk per repo conventions (merge commit; `--auto --delete-branch`).

## 7. Constraints & guardrails

- **Do not touch the module ownership story.** The five-module split and ADRs are
  the builder's view and remain correct; BYOA changes the *operator-facing*
  framing only.
- **Keep curation human-owned and AI-as-assistant** intact — BYOA must not read
  as "the agent owns the curriculum." It owns the *operating*, not the content
  decisions.
- **EN/RU parity** for brand docs.
- **Honest scope:** this is a positioning rewrite across the doc set; expect
  several artifacts and a traceability pass, not a one-file diff.

## 8. Acceptance

- Product Intent states the BYOA operating model explicitly and consistently.
- README (project + repo-root row), landing, and architecture present BYOA as the
  primary way to operate Agonara, with the UIs positioned per the §5 decision.
- User stories contain no "UI is the only access path" assumptions.
- intent ↔ ADR ↔ spec traceability is clean (review run, drift reconciled).
- An ADR exists for the positioning decision **iff** §4/§5 concluded one is
  warranted.
- `docs/log.md` updated.

## 9. References

- Skills design (sibling job, already done): `byoa-operator-skills.md`
- Product Intent: `docs/intent/intent_learning_program_app.md`
- User stories: `docs/intent/{curator,student,admin}_user_stories.md`
- Module responsibility map: `docs/module_responsibility_map.md`
- ADRs: `docs/adr/` (esp. ADR-004…016)
- OpenAPI contract: `docs/api/openapi.yml`
- Brand: `docs/brand/brand_brief.md` (+ `_ru`)
- My Way methodology: `../docs/my-way/`
