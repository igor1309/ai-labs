# Log

## 2026-10-26

- `/learn` wraps long lines in the material reader, so a long material no longer pushes the student navigation past the page edge. LAB-530.

## 2026-07-01

- **Implemented the public-skills projection (spec R1–R12).** Built the deterministic
  projector `scripts/project-public-skills.mjs` + `scripts/skill-contract.mjs`
  (shared route/parity logic, now the single source for the in-repo contract test)
  + `scripts/publish-guard.mjs` (R8 ancestry) + `.github/workflows/agonara-skills-publish.yml`,
  driven by `skills-publish-manifest.json` (single `ship` allowlist + `scrub`) and
  `publish-assets/`. Strict TDD, 18 tests: role-bucketed projection, clean rebuild,
  validation (missing-skill, both-buckets), section scrub of the personal
  `## References` block, personal-marker scan, canonical `provenance.json`, route +
  item-quality + link checks over the staged trees, CLI report/exit-code contract,
  and workflow trigger + ancestry guard. Verified end-to-end against the real skills
  tree: `ok:true`, correct student/curator shape, personal files and section
  excluded, source untouched. Full agonara node suite + `tsc` green.

- **Accepted ADR-025 after review.** Reviewed the twice-revised ADR against the
  arch-doc-review checklist and the ADR review standard's five dimensions. Fixed two
  findings before accepting: P1 still carried the stale "upstream minus the explicit
  exclusion set" wording (contradicting the single-allowlist P6) — reworded to the
  allowlist projection; and the three Open Questions (trigger, provenance format,
  dedup) were marked resolved with pointers to the spec. Status `proposed → accepted`.

- **Specced the public-skills projection — `docs/specs/agonara-skills-public-projection.md`.**
  Turned ADR-025 into an implementable, testable producer contract: a deterministic
  `project-public-skills.mjs` + source-owned `skills-publish-manifest.json` that
  renders `agonara/skills/` into role-scoped `student/`/`curator/` subfolders,
  privacy-scrubbed and provenance-stamped, failing the publish on any invariant
  breach. Pinned the three open questions — provenance as a top-level
  `provenance.json` (sha256 per-tree hashes), trigger as CI-on-`trunk` + manual
  dispatch, and shared-foundation dedup as byte-identical real-file copies — and
  mapped the ADR invariants to enumerated tests. Hardened over two review passes
  (Codex, then a design challenge): the privacy model landed as a **publish
  boundary**, not source relocation — personal files stay in `agonara/skills/` for
  the private deploy and are kept out of the public repo by a single default-deny
  allowlist (`ship`) — the personal files are simply unshipped, no second list —
  plus a publish-time section `scrub` of the personal `## References` block, with an
  output scan as backstop. Also canonicalized the provenance
  tree-hash, gave the CLI an exit-code + `--report` failure-kind contract, fixed the
  Pn↔Rn numbering, and reclassified the repo-ruleset check from "unverifiable" to a
  `gh api` inspection.

- **Planned the projection implementation —
  `docs/plans/agonara-skills-public-projection.md`.** A deferred, TDD-sequenced,
  single-task plan: manifest/assets first (single `ship` allowlist + `scrub`, no
  source relocation), then projector core (structure/partition/foundations/scope),
  the privacy publish boundary, provenance, output contract checks, CLI + report,
  and the publish workflow — each step RED→GREEN→commit and traced to a spec rule,
  with the mandatory six-part phase anatomy and an ADR traceability matrix.
  Out-of-band prerequisites (public repo, PAT secret, branch/tag rulesets) are a
  human-owned dependency gate.

- **Decided the public distribution model for the operator skills — ADR-025
  (proposed).** Resolved the distribution question left open in
  `skills/operator-skill-packaging_pre_adr.md`: publish the skills as a
  privacy-scrubbed, provenance-stamped **projection** of `agonara/skills/` into a
  public `agonara-skills` repo, split into two source-owned role subfolders
  (`student/`, `curator/`) so the role partition is structural — which closes the
  curator-into-student drift path at its source. Producer-side only; the consumer
  counterpart is inventory ADR-001. Captured the intake brief and hardened both
  docs against a Codex review. **2026-07-01 revision:** the initial relocation
  prerequisite (P12) was withdrawn — the allowlist already makes publication exact,
  so the four user-specific reference files stay in `agonara/skills/` and the
  projection scrubs the personal `SKILL.md` section at publish instead.

## 2026-06-30

- **Disambiguated the explanation/tutoring route between `agonara-student` and
  `agonara-coach`.** A live probe of the deployed Hermes student agent (coach not yet
  installed) confirmed it routes on front-matter alone and, with `agonara-student`'s
  description claiming the explaining craft ("the agent coaches learning", "study …
  materials"), attributed *all* tutoring to `agonara-student` — so a freshly deployed
  `agonara-coach` would have been under-triggered. Fixed at the routing layer, not the
  bodies: `agonara-student` **v1.6.0** re-scopes its `description`/`trigger` to own the
  API, the assessment-integrity boundary, and the item-quality bar, and explicitly cedes
  explanation/diagnosis craft to `agonara-coach`; `agonara-coach`'s `description`/`trigger`
  now lead with **tutor** and name themselves the explanation/tutoring front (adds the
  "tutor" keyword humans actually search by). Added a one-line pointer in the student
  skill's assessment-boundary body bullet, and `skills/agonara-coach/references/routing-calibration.md`
  recording the baseline probe and the pre/post route-expectation table to re-run after
  the (manual) deploy. No route citations added; `operator-skill-contract` still green.

## 2026-06-29

- **Fixed two pre-existing operator-skill-contract failures.** Both predated the coach
  work (reproduced at the merge base) and were surfaced while verifying the new skill.
  (1) Route citation: `agonara-curator-corpus` cited `PUT
  /navigation-relationships/{relationshipId}/status`, but the contract path parameter is
  `{entityId}` (consistent with `/corpus/{entityId}/status`) — aligned the skill to the
  contract. (2) Item-quality byte-parity: the cross-bucket duplicate-and-guard block had
  drifted — the four shared item-writing subsections (stem / distractors / leak-cues /
  structure) are still byte-identical across `agonara-curator-assessment` and
  `agonara-student`, but their *closings* legitimately diverged (the curator's concise
  cold-read reminder vs the student's authored-quiz `Definition of Done`). The guard's end
  marker pointed into that diverged tail, so it broke. Moved the guarded region's end to the
  last line of `#### Structure`, so the test guards exactly the genuinely-shared bar and
  each skill keeps its own closing. `agonara/tests/operator-skill-contract.test.js` now green.
- **`agonara-coach` skill — the explaining half (D1, ship-and-learn).** Authored
  `skills/agonara-coach/SKILL.md` v1.0.0 realizing the ephemeral skill-only fork direction
  for COACH-01..04: explanation depth ladder (precision, not padding), diagnose-the-cause
  before re-teaching (named failure type from learner-state evidence, with the
  factual/nomenclature gap called out as its own target), prerequisites-first traversal of
  accepted relationships, and confusable concepts taught by their discriminating feature.
  Co-installs with the student cluster, so it points to `agonara-student` (API reads,
  assessment-integrity boundary, item-quality) and the drill skills (practice + two-contour
  balance) without restating them — no route citations, no duplicated item-quality block.
  Holds a `Definition of Done` gate in the `agonara-student` "evidence, not a verdict" idiom.
  This also answers the intent's sub-question A: the rule list is substantive, not a thin
  wrapper, so a separate skill is justified. Registered in `skills/README.md` (student
  cluster + concern-ownership table); intent traceability updated. Not yet deployed to the
  Hermes student profile — separate deploy step.
- **Coach realization research.** Added `docs/research/coach-realization-fork.md` (My Way
  research) framing the skill-vs-persisted-state fork left open by the coach intent. Core
  finding: most of the coach (COACH-01..06) needs no persistence and is realizable in-session;
  the only capability that *forces* persisted state is spaced repetition, and the crux tension
  is that the richest factual-contour signal (practice-drill performance) is exactly what the
  system deliberately does not persist. Three candidate directions (D1 ephemeral / D2 persisted
  coaching learner-state / D3 minimal student-owned watchlist), with the assessment-integrity
  boundary (ADR-011/016) as the central risk for any persisted option. Developed the two coupled
  sub-questions: a clean four-skill teaching decomposition with a provisional lean toward a
  separate `agonara-coach` (gated on a real rule list), and nomenclature-priority grounding where
  the cheap path is reading accepted exam-requirement sources (option c) rather than a new corpus
  metadata field (option b). Open questions handed to pre-ADR; intent traceability updated.
- **Coach persona intent + two-contour drill recalibration.** Drafted
  `docs/intent/coach-persona-intent.md` (My Way product-intent structure): a coaching
  capability that *teaches* (explanation depth, cause diagnosis from evidence,
  prerequisite-first, confusable distinctions) and *trains test-resistance two-contour*
  (understanding **and** course-specific factual nomenclature), grounded in a real
  episode — a learner strong on meaning scored 71/100, losing the nomenclature layer
  (named classifications / author typologies). Stories COACH-01..08 proposed; the
  skill-vs-persisted-state realization left to research/pre-ADR; assessment-integrity and
  visibility boundaries restated, not weakened. Realized the skill-only slice now:
  `assistant-authored-study-drills` **v1.2.0** gains a "Two-contour balance" section (a
  second coverage axis across the cognitive layer, not just topic) — required item-type
  mix, no drift to the comfortable analytical side, weak-fixture-zone priority, fixture
  distractors via the `agonara-student` bar, and error-type-named verdicts. Episode
  recorded in the skill's `references/user-calibration-notes.md`.

- **Codex-reviewed the consolidation; fixed 8 findings.** Ran an adversarial Codex
  review (read-only) over the four skills, judged each against the files, and fixed all
  eight: a contradiction where `button-flow-failures.md` told the agent to distrust an
  immediate `clarify` `user_response` while `button-quiz-loop` says treat it as real
  (reconciled the reference); a stale `button-quiz-loop` pointer sending item-quality to
  the wrong skill (→ `agonara-student`); residual item-quality restatement and a
  duplicated assess-then-advance loop in the orchestration skill (→ pointers to
  `agonara-student`, which stays the owner — Codex wanted the loop *moved out*, rejected
  as it would gut the portable canonical skill); a feedback-depth contradiction (compact
  vs required full verdict → defer to `agonara-student`); an internal `button-quiz-loop`
  contradiction where timeout recovery mandated plain text the rest of the skill forbade
  (declared the sole sanctioned exception); a lost end-of-set wrap-up rule (re-added to
  the orchestration skill); and three skills with non-canonical `author` (→ Igor Malyarov).
  Versions: `button-quiz-loop` 1.2.1, `assistant-authored-study-drills` 1.1.1,
  `oral-exam-drills` 1.1.1.
- **Harvested and consolidated the host-only student-drill skills.** Three skills lived
  only in the Hermes student profile tree, unbacked (`assistant-authored-study-drills`,
  `oral-exam-drills`, `student-practice-question-design`) — pulled them into the ai-labs
  source (the only backup) and fixed them rather than archiving as-is. They were
  session-transcript accretions with the same rules restated across all three and against
  `agonara-student` (item quality) and `button-quiz-loop` (delivery). Consolidated to
  **one owner per concern**: item quality → `agonara-student`; button delivery →
  `button-quiz-loop` (**v1.2.0**, absorbed transport/timeout recovery); authored-MCQ
  *orchestration* → `assistant-authored-study-drills` (**v1.1.0**, rewritten 281→113 lines
  as tight rules + pointers, no restated item-quality/delivery); oral/free-response →
  `oral-exam-drills` (**v1.1.0**, deduped header, pointer to the boundary). **Retired**
  `student-practice-question-design` (most redundant + internally duplicated); its
  reference notes moved under `assistant-authored-study-drills/references/`. Distilled the
  prose hard (per the "skills are read on-demand" principle); user-specific calibration
  narrative kept in `references/`, not in rule bodies.
- Fixed an MCQ **option-labelling ergonomics regression**: a live student saw lettered
  options (`A/B/C/D`) in the prompt but numbered answer buttons (`1 2 3 4`), forced to
  map button → letter → option to answer. Root cause: the assistant passed bare ordinals
  as the `clarify` choices and carried the readable options under a *second* (lettered)
  scheme plus a `1.A/2.B` bridge key. Rule: **the `clarify` button label is the option's
  own text** — stem in the prompt, options on the buttons once, no second scheme and no
  bridging key. **Placed in `button-quiz-loop` (v1.1.0)**, which owns button *delivery
  discipline* and is the skill `SOUL.md` already points to — sharpened its checklist,
  added an "ordinal-proxy buttons" pitfall, and a verification item. An earlier pass put
  the rule in `agonara-student` (v1.5.1) and restated it in the Hermes `SOUL.md`; both
  were **reverted** to avoid a double source of truth — `agonara-student` returns to
  v1.5.0, `SOUL.md` stays a pointer (per gotcha #11: a skill is a discoverable pointer,
  the always-on rule lives where SOUL points). Verified the button mechanism against
  inventory `vps/Hermes/agonara-student-quiz-presentation.md` (Hermes `clarify` inline
  buttons, label = choice text). A behavioral dry-run (single item + 2-item authored
  series) confirmed option text renders on the buttons with a stem-only prompt, no
  bridging key, and an unbroken assess-then-advance chain.
- Hardened **`agonara-student` (v1.5.0)** authored-MCQ practice-quiz quality after a
  live student reported easy answer-picking, missing correctness feedback, incoherent
  items, and the key clustering in early slots. Added a **Definition-of-Done gate** the
  assistant must clear before presenting any item (coherence/relevance, every distractor
  a nameable mistake, cold-read resistance, deliberate key-position spread), a **required
  immediate assess-then-advance step** with a private per-item rationale record revealed
  only after the answer, and a **"running an authored MCQ practice quiz"** loop. Two Codex
  passes (intake review, then changes-vs-intent review) drove wording fixes.
- Ran a **dry-run experiment** before deploy: a sub-agent authored 3 Russian MCQs from a
  psychodiagnostics-ethics source under the v1.5.0 skill, exposing its private rationale
  for audit. Result: nameable-distractor, application-not-recall, coherence, and
  position-spread gates held; three leaks got through — absolutes parked in distractors
  («только», «не передаются»), a parallel-structure tell (key the only option without a
  conditional clause), and a self-check that rationalised a leak away. Fixed all three:
  the cold-read focus now mandates a per-option **absolute scan** and **parallel-structure
  check**, and the self-check must **show evidence (longest option, absolutes found, key
  positions), not assert a verdict**.
- Validated the **assess-then-advance loop end-to-end** — the one behavioral branch the
  earlier generation-only dry-runs never exercised. Drove a 2-question interactive drill
  where the reviewer supplied the student's answers: a wrong answer produced the required
  verdict (right/wrong, why the key is correct, why the chosen option is wrong, the
  misconception in each distractor) *before* advancing; a correct answer produced its
  verdict and closed with a wrap-up (score, strength, weakness, study pointer) rather than
  another question. The never-first key-position fix and the absolute scan both fired live.
  No defect found; no skill change needed.

## 2026-06-28

- Logged a forward-task backlog item for **Module → topic navigation hierarchy**
  after a curator (program 1840) hit `validation_failed` accepting a
  `topic_includes_topic` `relationship_update`. Confirmed this is working as
  designed: navigation is intentionally two-level — `topic_includes_topic` is not in
  `supportedNavigationRelationshipKinds` (`src/corpus.js`), `storage.js` has no
  topic→topic endpoint pair, and there is no `module` corpus kind (a "module" is
  just a top-level `topic`). Recorded the gap and the three candidate directions
  (self-referential `topic_includes_topic`; a distinct `module` kind; or promoting
  period-readiness scopes to navigation grouping) as needing a pre-ADR/ADR decision
  before any build, since it extends the ADR-010 boundary and the navigation contract.

- Released **agonara v0.4.0** (`agonara_v0.3.0..` delta). Minor, backward-compatible feature
  release completing the ADR-022 entity-withdrawal lifecycle: an `active ↔ withdrawn` status
  across the six accepted-entity families and `program_sources`, curator-authorized
  withdraw/reactivate, withdrawal blocked while active dependents exist (navigation dependents,
  readiness requirements, criterion dependents, and learner-evidence-bearing open-answer/quick
  checks — no cascade), read-path filtering that hides withdrawn entities and learner-state
  targets/relationships from delivery and navigation, two-tier program-source deletion
  (hard-delete unreferenced, withdraw-only referenced) plus material-content deletion tiers, the
  per-family status HTTP routes (accepted corpus, quick check, open answer, criterion, readiness,
  navigation relationship) and source-lifecycle routes, and the learn-UI lifecycle controls
  (withdraw/reactivate, source-deletion control, withdrawn-item view). Withdrawn status is carried
  through backup/restore.

- Close ADR-022 with explicit lifecycle acceptance for every entity family, same-status writes,
  inactive dependents, withdrawn backup graphs, and domain/HTTP/browser workflows; align Product
  Intent, the implemented spec, runtime evidence, README, dashboard, and forward-task backlogs.

- Reworked the curator acceptance gate to a **numbered-handle confirmation** tuned
  for mobile curators. Across `agonara-curator-corpus` (v1.7.0),
  `agonara-curator-assessment` (v1.6.0), and `agonara-curator-research` (v1.3.0),
  the assistant now halts with a **short numbered list** (`1.`, `2.`, `3.` …) — each
  line carrying the facts the curator must verify plus the read endpoint to inspect
  the item in full — and the curator approves by **explicit item numbers or ranges**
  (`accept 1,3,4`, `accept 1-8`) instead of typing ids, which are awful to copy on a
  phone. Bare "all"/"yes"/"looks good" is rejected as non-specific; the assistant
  never synthesizes a selection. Before accepting it **re-fetches the candidate list**
  to confirm it still matches what was presented, resolves each number strictly
  against that list (refusing any number not on it), and **echoes each item's title
  and id** before mutating. Per-kind rules carry over to the numbered model: hosted
  material content stays a **separate exchange** from the material's acceptance; a
  `relationship_update` is accepted **whole**, so partial approval forces a
  re-proposed candidate of only the approved drafts; an entity revision echoes both
  `candidateId` and `targetEntityId` on selection.

- Added a **zero-trust acceptance gate and contamination doctrine** to the curator
  skills. `agonara-curator-corpus` (v1.6.0) now defines the gate as the source of
  truth: proposal and acceptance are separate phases, the assistant may propose
  freely but must not accept in the same run, the acceptance phase begins only from
  a fresh curator instruction naming the candidate ids, the curator's own inspection
  of trusted state — not a pasted read-back — is the authority, acceptance is per
  entity (never a batch blessing), and any accepted/linked/hosted entity lacking a
  curator named-id verification record is contaminated by default. It also spells out
  the extra trusted-state facts to surface per acceptance kind (immutable hosted
  material content, multi-draft `relationship_update`s, `targetEntityId` revisions).
  `agonara-curator-assessment` (v1.5.0) and `agonara-curator-research` (v1.2.0) defer
  to that gate and add their path-specific rules (verify the draft candidate and its
  answer key before accepting, gate learner-state target-link mutations, report
  sources/gaps/suggestions only from live API reads). `concept-extraction.md` now
  stops at the gate instead of "confirm before acceptance."

- ADR-022 implementation Phase 5 now exposes the plan-declared source lifecycle controls and
  withdrawn-items action in `/learn`, handles source lifecycle response envelopes correctly,
  and gives curators actionable guidance for every blocked-dependent class.

- ADR-022 implementation Phase 5 sub-slice: added browser workflow coverage for `/learn` source
  hard-delete. Curators can delete unreferenced sources and see a withdraw-instead block message
  for referenced sources.

- ADR-022 implementation Phase 5 sub-slice: added browser workflow coverage for withdrawing an
  accepted Quick Check from `/learn`, listing it in the withdrawn-items view, and reactivating it
  back to active from that view.

- ADR-022 implementation Phase 5 sub-slice: extended browser layout coverage for the `/learn`
  lifecycle and source-delete controls across desktop and mobile widths, including named controls,
  live status regions, and overlap checks.

- ADR-022 implementation Phase 5 sub-slice: added a `/learn` withdrawn-items session view.
  Successful lifecycle withdrawals are listed with per-item reactivation controls that call the
  active status route and remove reactivated items from the view.

- ADR-022 implementation Phase 5 sub-slice: added the `/learn` curator source hard-delete
  control. Unreferenced source deletion calls `DELETE /sources/{sourceId}`, while referenced
  source blocks display a withdraw-instead message.

- ADR-022 implementation Phase 5 sub-slice: added the `/learn` curator lifecycle panel with
  stable `#entity-lifecycle-panel`, withdraw/reactivate actions, redacted status messaging, and
  route wiring for accepted entities and source withdrawal/reactivation.

- ADR-022 implementation Phase 4 review fix: added HTTP lifecycle edge-case coverage for
  missing accepted entities, same-status accepted no-ops, `entity_withdrawal_blocked` conflict
  surfacing, lifecycle response redaction, and dependent graph preservation.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted navigation-relationship lifecycle
  status over HTTP at `PUT /navigation-relationships/{entityId}/status`. Withdrawn
  relationships leave active student navigation grouping/detail reads, and OpenAPI includes the
  lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted readiness-check lifecycle status
  over HTTP at `PUT /readiness-checks/{entityId}/status`. Withdrawn readiness checks leave
  active curation listings while addressed historical curation revisions remain readable, and
  OpenAPI includes the lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted assessment-criterion lifecycle
  status over HTTP at `PUT /assessment-criteria/{entityId}/status`. Withdrawn criteria leave
  active accepted-criteria listings while addressed historical revisions remain readable, and
  OpenAPI includes the lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted open-answer-check lifecycle
  status over HTTP at `PUT /open-answer-checks/{entityId}/status`. Withdrawn open-answer
  checks leave active curation listings while addressed historical revisions remain readable,
  and OpenAPI includes the lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted Quick Check lifecycle status over
  HTTP at `PUT /quick-checks/{entityId}/status`. Withdrawn quick checks leave student delivery
  lists while addressed historical delivery revisions remain readable, and OpenAPI includes the
  lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed accepted Corpus entity lifecycle status
  over HTTP at `PUT /corpus/{entityId}/status`. Withdrawal now leaves active accepted-corpus
  listings while addressed historical revisions continue to resolve, and OpenAPI includes the
  lifecycle route.

- ADR-022 implementation Phase 4 sub-slice: exposed source lifecycle status and source-record
  hard-delete over HTTP with session+CSRF gates. The OpenAPI contract now declares
  `PUT /sources/{sourceId}/status` and `DELETE /sources/{sourceId}`, including
  `source_hard_delete_blocked`.

- ADR-022 implementation Phase 3 sub-slice: completed accepted material-content deletion
  tiers in the corpus domain. Unevidenced material content hard-deletes; evidenced material
  content preserves historical bytes and retires through entity withdrawal, while active
  dependents still block the withdrawal path.

- ADR-022 implementation Phase 3 sub-slice: added domain coverage proving unreferenced
  source-record hard deletion does not mutate accepted material content, accepted corpus
  revisions, learner-evidence target links, or historical material reads.

- ADR-022 implementation Phase 3 sub-slice: added curator-authorized program-source hard
  deletion for unreferenced sources. Sources referenced by any accepted corpus revision,
  including withdrawn corpus entities, now reject hard deletion with
  `source_hard_delete_blocked` while preserving accepted corpus provenance.

- ADR-022 implementation Phase 3 sub-slice: added curator-authorized program-source
  withdrawal/reactivation. Withdrawn sources leave active curator source listings while accepted
  corpus revisions keep their provenance `sourceIds`, and reactivation restores the source.

- ADR-022 implementation Phase 2 sub-slice: student learner-state evidence rollups now use
  only active navigation relationships, so withdrawn relationships no longer roll concept
  evidence into topic summaries.

- ADR-022 implementation Phase 2 sub-slice: student learner-state target definitions now filter
  accepted corpus targets, quick checks, open-answer checks, and assessment criteria on
  `status = active`, so withdrawn entities leave forward learner-state summary/detail reads.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized navigation-relationship
  lifecycle withdrawal/reactivation. Withdrawn relationships leave forward navigation grouping,
  reactivation restores grouping, and stored relationship revisions remain addressable.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized readiness-check
  lifecycle withdrawal/reactivation. Withdrawn readiness checks leave active curation listings,
  reactivation restores them, and addressed historical readiness revisions continue to resolve.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized open-answer-check
  lifecycle withdrawal. Active learner-evidence target links owned by the open-answer check now
  block withdrawal with `entity_withdrawal_blocked`, while deleted links no longer block and no
  cascade mutation is introduced.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized assessment-criterion
  lifecycle withdrawal. Active open-answer checks that pin any revision of the criterion entity,
  and active learner-evidence target links owned by the criterion, now block withdrawal without
  cascade mutation; deleted learner-evidence links no longer block withdrawal.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized quick-check lifecycle
  withdrawal with active learner-evidence target links as `entity_withdrawal_blocked`
  dependents. Deleted learner-evidence links no longer block withdrawal, and no cascade mutation
  is introduced.

- ADR-022 implementation Phase 2 sub-slice: withdrawal of an accepted corpus entity is now
  blocked with `entity_withdrawal_blocked` when an active readiness check's current revision
  has a requirement targeting that entity, preserving both the corpus entity and readiness
  dependent without cascade mutation.

- ADR-022 implementation Phase 2 review fix: navigation forward reads now apply lifecycle
  filtering consistently. Withdrawn corpus entities leave the student navigation listing and
  current navigation detail reads, active navigation relationships are limited to active
  endpoints, and addressed historical navigation revision reads continue to resolve.

- ADR-022 implementation Phase 1: added the lifecycle status substrate to the six
  accepted-entity tables and `program_sources`. Fresh schemas and existing SQLite databases
  now converge on `status` (`active`/`withdrawn`, default `active`) plus nullable attribution
  columns; backup export/restore preserves lifecycle status and rejects invalid lifecycle
  values before mutation.

- ADR-022 implementation Phase 2 sub-slice: added curator-authorized corpus entity
  withdraw/reactivate with attribution, active-only accepted-corpus listings, coverage-gap
  derivation that treats withdrawn corpus entities and their relationships as absent, and
  active-only readiness delivery listings while historical revision reads keep resolving.

- ADR-022 implementation Phase 2 sub-slice: withdrawal of an accepted corpus entity is now
  blocked with `entity_withdrawal_blocked` when an active navigation relationship references
  it, preserving the dependent relationship and avoiding cascade mutation.

- Drafted the **accepted-entity withdrawal and source deletion** spec
  (`docs/specs/accepted-entity-withdrawal-and-source-deletion.md`) operationalizing
  [ADR-022](adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md): an
  entity-level `active ↔ withdrawn` lifecycle status across the six accepted-entity
  families and `program_sources`, curator-authorized withdraw/reactivate, the
  active-dependent block (no cascade), read-path filtering for delivery/listings/coverage-gap
  derivation, two-tier source deletion (hard-delete unreferenced, withdraw-only referenced),
  completion of ADR-021's material-content deletion tiers, and backup/restore of status. Adds
  `entity_withdrawal_blocked` and `source_hard_delete_blocked` to the rejection vocabulary.
  Status `draft`; implementation tracked in `backlog/material-content.md`. Ran an adversarial
  spec review (`docs/reviews/accepted-entity-withdrawal-and-source-deletion-spec-adversarial-review.md`):
  fixed one fail (active-dependent block understated readiness targets and mis-described the
  open-answer→criterion reference as entity-direct when it pins criterion revisions) and two
  warns (a non-existent `quick_check_not_found` reason example; murky no-op `updatedAt`
  semantics); remaining findings pass.

- Authored the **accepted-entity withdrawal and source deletion** implementation plan
  (`docs/plans/accepted-entity-withdrawal-and-source-deletion.md`) for the ADR-022 spec,
  following the My Way plan structure: single task, six phases (status substrate + migration;
  withdraw/reactivate + active-dependent block + read filtering; source two-tier deletion;
  HTTP lifecycle API + OpenAPI; product UI; docs/closeout), with execution declarations
  (`auto-continue`, `Worktree mode: none`, branch `claude/agonara-adr-22-spec-2zp737`,
  `push at closeout`, preflight unchecked), scope guardrails, an exact file/route inventory,
  and ADR/product-intent traceability matrices. Status `planned`. Ran an adversarial plan
  review (`docs/reviews/accepted-entity-withdrawal-and-source-deletion-plan-adversarial-review.md`):
  fixed one fail (the plan referenced a non-existent migration framework — Agonara's schema is
  `create table if not exists` only, so adding a `status` column to existing tables now uses an
  idempotent `pragma table_info` + `alter table add column ... default 'active'` startup step
  that backfills) and one warn (parallel-phase ambiguity in Phase 3 dependencies); declaration
  block, scope, traceability, and closeout pass.

- Add a `concept-extraction.md` reference doc to `agonara-curator-corpus` (v1.4.0)
  and link it from `SKILL.md`'s topics-and-concepts section. It captures a reusable
  draft-concept-extraction procedure: read and segment the whole topic into semantic
  blocks, extract teachable units per block, balance coverage against granularity with
  a merge/trim pass, and run a mandatory `semantic blocks → teachable units → concepts`
  gap check (a reasoning pass over source material vs. the draft concepts)
  before proposing concept candidates. Targets the failure mode of stopping at a few
  obvious "core" concepts by holding an explicit Definition of Done. The doc ships
  inside the skill folder so it resolves on the deployed curator bot.

- Accepted **ADR-023 — Navigation-Relationship Acceptance Uniqueness**
  (`docs/adr/adr-023-navigation-relationship-acceptance-uniqueness.md`), the *prevention* half of
  the duplicate-navigation problem a curator reported. Accepted navigation relationships become
  unique per directed `(program_id, relationship_kind, from_entity_id, to_entity_id)` among
  **active** edges; a duplicate acceptance is rejected with a new
  `navigation_relationship_already_accepted` reason, enforced at the storage layer (partial-unique
  index + a pre-insert check) so it covers first-time acceptance, the `relationship_update`
  candidate kind, and restore. Scoped to `status = active` (depends on ADR-022's lifecycle;
  sequenced after it so existing duplicate rows are withdrawn first); directed tuple only,
  symmetric-kind reverse collapse deferred. The *cleanup* of already-accepted duplicates remains
  the ADR-022 withdrawal path. Hardened after an adversarial review: closed a cross-ADR collision
  (ADR-022 `withdrawn → active` reactivation is now held to the same uniqueness guard) and cited
  the existing `one_active_learner_evidence_target_link` partial-unique index as the proven
  precedent.

- Drafted the ADR-023 **navigation-relationship acceptance uniqueness** spec
  (`docs/specs/navigation-relationship-acceptance-uniqueness.md`, `draft`) and implementation plan
  (`docs/plans/navigation-relationship-acceptance-uniqueness.md`, `planned`) on top of the ADR-022
  withdrawal spec/plan. Both make the two ADR-022 integration points durable, recorded
  **downstream only** (the cascade flows ADR → spec → plan → implementation; the ADR-022 spec is
  not edited from here): the reactivation carve-out (a navigation-relationship-only precondition
  that narrows ADR-022 spec rule 10, which otherwise makes reactivation unconditional — stated in
  the ADR-023 spec rule 5) and the no-migration-framework reality. On the latter, corrected the
  approach after spotting that auto-withdrawing pre-existing duplicate rows at startup would be an
  **un-attributed status change violating ADR-022 spec rule 4**: prevention of *new* duplicates is
  now the unconditional, index-independent application guards (create-path check, reactivation,
  restore validation), and the partial-unique index is a **backstop** added by a guarded startup
  step that skips-with-diagnostic — never auto-withdrawing or deleting — until a curator has cleaned
  the existing duplicates through the ADR-022 API. Updated ADR-023, its spec, and its plan to match.
  Implementation is gated on the ADR-022 plan landing. A follow-up adversarial review (arch-doc +
  adr-governance 5-dimension) then fixed three findings verified against `src/storage.js`: the
  existing partial indexes live in a static schema DDL block that cannot be guarded in place, so the
  navigation index must be a conditional JS step *outside* it; `storage.js` has no logging seam, so
  "emit a diagnostic" became a stated work item with the mechanism left to implementation; and two
  consistency slips (a leftover "migration"; an over-broad "single guard covers every write" that
  ignored the separate restore writer).

- Reframed the curator and student role skills so the agent is the human role-holder's
  **assistant**, not the role itself: `agonara-curator-corpus` (v1.3.0),
  `agonara-curator-assessment`, `agonara-curator-participation`, `agonara-curator-research`,
  and `agonara-student` (v1.4.0) now state the agent holds the session and does the API work
  on a human Program Curator's / Student's behalf while the human owns the program, decisions,
  learning, and answers. Dropped the curator-corpus skill line that told the *agent* it bore
  content-licensing responsibility — licensing is the human curator's; the curator agent/bot and
  Agonara do not adjudicate or assume it (consistent with ADR-021). Updated `skills/README.md`
  to describe the curator bucket and student skill in the assistant framing.

## 2026-06-27

- Released **agonara v0.3.0** (`agonara_v0.2.0..` delta). Minor, backward-compatible feature
  release: in-product material content storage with role-gated reading (ADR-021), entity
  withdrawal and source deletion (ADR-022), the content HTTP API
  (`PUT`/`GET`/`DELETE /sources/{sourceId}/content`,
  `PUT`/`GET /materials/revisions/{revisionId}/content`,
  `GET /materials/{entityId}/content`), the curator content form and student reader UI, the
  `hasContent`/`contentBytes`/`contentFormat` navigation signals, landing-page surfacing, and the
  operator-skill updates teaching the capability. No breaking API changes.
- Taught the operator skills the material-content capability (closing the backlog skills task):
  `agonara-student` (v1.3.0) now documents reading hosted accepted material content via the
  `hasContent` signal and `GET /materials/{entityId}/content` /
  `GET /materials/revisions/{revisionId}/content` with character pagination; `agonara-curator-corpus`
  (v1.1.0) gains a "Material content" section covering curator-only source raw content
  (`PUT`/`GET`/`DELETE /sources/{sourceId}/content`) and the student-readable accepted material copy
  (`PUT`/`GET /materials/revisions/{revisionId}/content`, set-once per revision, curator-owned
  licensing). All cited routes verified against the OpenAPI contract by the operator-skill-contract
  test.
- Surfaced material content on the public landing page (`agonara/index.html`): added a "Material
  Content" card to the "What is implemented today" grid, mirroring the README implementation
  snapshot. Refreshed the repo LOC dashboard (`docs/loc-dashboard.html`) to current counts.
- Integrated the two overlapping material-content closeout PRs (they conflicted with each other
  on `learn-ui.js`, the navigation Playwright suite, and the log): merged
  `material-content-phase5-test-gaps` as the base (curator content read-back button, hierarchy/
  back-link browser coverage, Product Intent traceability closeout test, LOC dashboard refresh,
  and the spec correction `participation_required` → `admin_or_curator_required` for source
  content reads), then folded in `phase4-content-ui-test-gaps`'s polish on top: the friendlier
  `content_not_found` → "Source content unavailable." copy in the curator read affordance, a
  back-link click→detail navigation assertion in the student reader test, and a post-delete
  "unavailable" idempotency assertion in the curator test. `phase4-content-ui-test-gaps` is
  superseded. Full Agonara suite, build, and the five Playwright tests pass.
- Closed the material-content Phase 5 review gaps: content read HTTP responses are now
  allowlisted to the spec fields, the `/learn` curator content panel can read source content
  back after save, browser coverage proves hosted-content back-links and content controls, and
  closeout tests now pin Product Intent traceability plus the refreshed LOC dashboard.
- Addressed material-content review-gap PRs (#645/#647) against the branch: `hasContent`/
  `contentBytes`/`contentFormat` now also ride the navigation **coverage lists**
  (`listProgramNavigation` topics/ungrouped concepts/ungrouped materials), not just the
  detail projections; and the HTTP content **read** handlers now **whitelist** the response to
  `{content, contentFormat, byteSize, nextCursor}` via `mapContentPageResult` instead of
  passing the raw command value through. Kept the owner's dedicated `setAcceptedMaterialContent`
  design (content is not threaded into acceptance). Full Agonara suite and build pass.
- Strengthened Phase 1 material-content tests after review: storage tests now assert exact
  rejection reasons and unchanged rows for invalid format, oversized writes, and accepted
  revision overwrite attempts; backup/restore rejection tests now prove malformed content
  backups leave an existing target untouched.
- Closed out **Phase 5** of material content storage: amended navigation spec #28/#29 (content
  served off a dedicated route with a `hasContent` signal, not navigation traversal; content
  storage/serving and curator-owned licensing owned by the material-content spec/ADR-021);
  added Product Intent stories STU-24 (read hosted material content) and CUR-19 (host readable
  material content) plus the STU-09/CUR-03 "linked or hosted" amendment; marked the
  material-content spec `implemented` with implementation/verification links; added a README
  implementation-snapshot bullet; narrowed `backlog/material-content.md` to the remaining
  withdrawal/source-deletion (ADR-022) spec+impl and the skills update; and archived the plan
  to `docs/plans/implemented/material-content-storage.md`. **Material content storage (ADR-021)
  is complete** — all five plan phases done; full Agonara suite, build, and the five Playwright
  tests pass.
- Implemented the **Phase 4** `/learn` content reader for material content storage: the
  student navigation material detail now shows a "Read full material" affordance when a
  material has stored content, and a `#material-content-view` (`#material-content-status` +
  `#material-content-body`) renders the accepted content fetched from
  `GET /materials/{entityId}/content`, with character-cursor "Load more" pagination —
  serving both students and curators with no provenance leak. Verified by a new student
  Playwright test (material → "Read full material" → content renders) plus the existing
  navigation browser tests (unchanged). Added the curator source-content load/delete form UI
  (`#material-content-curator-panel` / `#source-content-form`) wired to the
  `PUT`/`DELETE /sources/{sourceId}/content` routes, with a curator browser test
  (save → status, delete → status). **Phase 4 complete.** Five Playwright tests pass; full
  Agonara suite and build pass.
- Implemented **Phase 3** (HTTP) of material content storage: declared the content routes
  in `http-contract.js` (`PUT`/`GET`/`DELETE /sources/{sourceId}/content`,
  `PUT`/`GET /materials/revisions/{revisionId}/content`, `GET /materials/{entityId}/content`)
  with `content_not_found` / `content_too_large` / `material_content_already_set` /
  `accepted_revision_not_found` added to the `ApiRejectionReason` enum and `httpStatusFor`
  mapping (404/400/409/404); wired the handlers in `server.js` (session/CSRF, `limit`/`cursor`
  query parsing, redacted passthrough); and taught the OpenAPI generator and contract test the
  `put` method so the routes generate and validate. Reconciled the spec to the dedicated
  `PUT …/content` set-content design (replacing acceptance-carried content) and the
  `admin_or_curator_required` source-read reason. Added stub-based HTTP route tests (pagination
  parsing, read status mapping, curator-gate + CSRF-required on writes). Full Agonara suite
  (incl. `openapi:check` + `openapi:lint`) and build pass. Deferred: a real-session HTTP
  executable-acceptance scenario (the command-level executable acceptance already covers the
  full content flow; Phase 4 UI exercises real sessions).
- Implemented the **Phase 2** domain content commands for material content storage:
  `setSourceContent` / `deleteSourceContent` / `readSourceContent` (curator-only),
  `setAcceptedMaterialContent` (curator; material-only, immutable per revision via a
  `material_content_already_set` guard), and `readMaterialContent` /
  `readMaterialRevisionContent` (effective Student or Program Curator, **not** Admin).
  Reads are character-paginated (`limit`/opaque `cursor`), summaries are redacted (no
  content bytes), oversized writes return `content_too_large`, and licensing is not gated.
  Per owner decision, accepted content is written by the dedicated `setAcceptedMaterialContent`
  command rather than threaded into the acceptance transaction; the spec's route/shape
  wording will be aligned when HTTP lands (Phase 3). Closed the phase with the `hasContent`/
  `contentBytes`/`contentFormat` signal on material navigation projections (material-only;
  traversal stays content-free), a material-content executable-acceptance scenario, and a
  no-Student-state boundary test. **Phase 2 complete.** Domain + executable-acceptance tests
  green; full Agonara suite and build pass.
- Implemented **Phase 1** of the material content storage plan: `source_contents`
  (keyed by `source_id`) and `accepted_material_contents` (keyed by `revision_id`) tables
  with a `content_format` `check`, derived `byte_size`, and optional provenance; storage
  accessors (source content overwritable, accepted content immutable per revision and
  material-only); a `MAX_MATERIAL_CONTENT_BYTES` (1 MiB) guard; backup export of both
  tables; and restore delete/reinsert plus before-mutation validation (missing
  source/revision, non-`material_reference` revision, invalid format, byte-size mismatch,
  oversized). Storage and backup/restore tests green; full Agonara suite and build pass.
- Ran the **material content storage implementation plan adversarial review**
  (`docs/reviews/material-content-storage-plan-adversarial-review.md`) and fixed the
  plan's final-closeout declaration so it follows the mandatory implementation-plan structure.
- Drafted the **material content storage implementation plan**
  (`docs/plans/material-content-storage.md`) for the spec under ADR-021: five TDD phases
  (storage, domain, HTTP, `/learn` UI, docs/intent/closeout), declaration block, ADR
  traceability matrix, and scope guardrails excluding ADR-022 withdrawal/source-record
  deletion (separate spec).
- **ADR-021 — Material Content Storage and Role-Gated Reading** (accepted) and its draft
  spec `docs/specs/material-content-storage.md`: Agonara stores material text and serves it
  role-gated (curator read/write/delete over everything loaded, student read over accepted);
  licensing is the curator's responsibility; source raw content and accepted-revision content
  (a self-contained immutable copy) on the existing provenance chain. Promoted from
  `docs/pre-adr/material-content-access_pre_adr.md`.
- **ADR-022 — Accepted Entity Withdrawal and Source Deletion** (accepted), promoting the
  accepted-entity withdrawal pre-ADR: entity-level `active → withdrawn` status generalized to
  source records, two-tier source deletion (hard-delete unreferenced, withdraw referenced),
  evidenced accepted content retired by withdrawal. The source-deletion backlog item's source
  half is resolved; program archival/ownership transfer remains open.
- Promoted the material-content backlog to its own `backlog/material-content.md` topic file.
- Addressed the branch adversarial review (kept in git history): defined the spec's
  `SourceContentSummary`, scoped material-content reads to Student/Curator participation
  (Admin is not effective participation per ADR-002/007), marked the withdrawal pre-ADR's
  questions resolved, aligned ADR section headings to the governance template, and collapsed
  these log entries to outcomes.

## 2026-06-22

- Release `agonara_v0.2.0` (minor; `0.1.0 → 0.2.0`). First release since the
  initial production cut at `agonara_v0.1.0`; ships the assessment surfaces
  accumulated on trunk — quick-check assessment boundary (ADR-016) with in-place
  re-acceptance, the curator-only accepted quick-check read surface (ADR-019,
  `GET /programs/{programId}/quick-checks/curation` +
  `GET /quick-checks/revisions/{revisionId}/curation`) and the readiness analogue
  (ADR-020), assessment-criteria/open-answer-check curation reads, LLM-assisted
  curation suggestions, and the real-provider open-answer evaluator runtime
  (ADR-018). Schema unchanged from the deployed `0.1.0` (`src/storage.js`
  identical), so existing data on the prod volume carries forward; deploy is
  code-only via the CI release-unit pipeline (staging → prod, health + smoke
  gated, auto-rollback).

- Clarify the assessment persona boundary in the operator skills and capture two
  follow-up architecture questions as pre-ADR notes. `agonara-curator-assessment`
  (v1.2.0 → v1.2.1) now states curators author/revise checks but never grade
  attempts (grading is deterministic-at-submission or student-side evaluator;
  a curator session reading attempts gets `participation_required`).
  `agonara-student` (v1.1.0 → v1.1.1) now states assessment happens at submission
  — no deferred-grading queue, submit each answer in-exchange, never promise
  "assessed later" or route to a curator, and only an accepted check
  (`checkRevisionId`) is assessable. Added `docs/pre-adr/accepted-entity-withdrawal_pre_adr.md`
  (entity-level lifecycle/withdrawal vs. append-only, modeled on the
  `learner_evidence_target_links` soft-delete precedent) and
  `docs/pre-adr/curator-facing-assessment-results_pre_adr.md` (separating
  aggregate/anonymized reporting from privacy-crossing per-student attempt
  visibility). Skill-content + docs only; deployed to the live Hermes bots.

- Add ADR-020 (`adr-020-curator-accepted-readiness-check-read-surface.md`,
  status: accepted), amending ADR-011 to add a curator-only read surface over
  accepted readiness checks — the readiness analogue of ADR-019. Readiness was
  the last accepted assessment artifact whose entity id a curator could not
  rediscover after acceptance (its only accepted list is the student-gated
  delivery view), so in-place `targetEntityId` re-acceptance was unreachable.
- Implement ADR-020 (strict TDD, RED→GREEN): new corpus command
  `listAcceptedReadinessChecksForCuration` (mirrors the quick-check curation list;
  `resolveAssessmentCuratorAuthorization`, curator-only — student and
  admin-without-curator rejected) returning `summarizeAcceptedReadinessCheck` per
  accepted readiness check. Wired `GET /programs/{programId}/readiness-checks/curation`
  in `src/http-contract.js` + `src/server.js`, regenerated `docs/api/openapi.yml`.
  Domain + HTTP tests in `tests/corpus.test.js` and `tests/http-api.test.js`.
  Documented `targetEntityId` re-acceptance and the new list in the readiness
  section of `skills/agonara-curator-assessment` (v1.1.2 → v1.2.0). This
  completes `targetEntityId` discovery documentation across all curator
  acceptance surfaces (open-answer, quick check, assessment criteria, corpus,
  readiness).
- Implement ADR-019 (strict TDD): add curator-only accepted quick-check read
  surface `GET /programs/{programId}/quick-checks/curation`. New corpus command
  `listAcceptedQuickChecksForCuration` reuses `resolveAssessmentCuratorAuthorization`
  (curator-only; admin-without-curator and student-alone rejected, mirroring the
  curation detail) and returns the full `summarizeAcceptedQuickCheck` projection
  (entity id, current revision id, answer key) per accepted quick check. Wired
  the HTTP route in `src/http-contract.js` + `src/server.js`, regenerated
  `docs/api/openapi.yml`. Domain + HTTP tests in `tests/corpus.test.js` and
  `tests/http-api.test.js`. Updated `skills/agonara-curator-assessment` (v1.0.0
  → v1.1.0) to cite the new list and remove the circular instruction that told
  curators to find an entity id via the curation detail (which itself needs a
  revision id they had no way to obtain). Completes the in-place re-acceptance
  (`targetEntityId`) workflow for already-accepted quick checks.
  - Also fix a pre-existing failure in `tests/operator-skill-contract.test.js`
    (red on trunk, unrelated to ADR-019): a prose example `` `GET /programs/...` ``
    in `agonara-api-access` (v1.0.0 → v1.0.1) was parsed as a route citation;
    reworded so it no longer looks like a real route. Full suite now green.
  - ADR-019 consistency pass on the curator skills: the in-place re-acceptance
    (`targetEntityId`) instructions for open-answer checks
    (`agonara-curator-assessment` v1.1.0 → v1.1.1) and corpus
    (`agonara-curator-corpus` v1.0.0 → v1.0.1) said to pass `targetEntityId`
    without naming a discovery surface — the same circularity ADR-019 closed for
    quick checks. Both accepted-read lists already expose `entityId` (verified in
    `summarizeAcceptedOpenAnswerCheck`/`summarizeAcceptedCorpus`), so no new
    endpoint was needed; the skills now point curators at those lists to find the
    entity id. `assessment-criteria` and readiness also support `targetEntityId`
    in the contract but their skills do not mention re-acceptance, so they were
    left unchanged (documenting it there is feature work, not a consistency fix).
  - Follow-up: document `targetEntityId` re-acceptance for assessment criteria
    (`agonara-curator-assessment` v1.1.1 → v1.1.2). The accepted-criteria list
    `GET /programs/{programId}/assessment-criteria` is curator-accessible
    (`resolveAssessmentAcceptedReadAuthorization` allows `program_curator`) and
    exposes `entityId`, so the discovery surface already exists. Readiness checks
    were NOT documented: their only accepted list
    (`GET /programs/{programId}/readiness-checks`) is the student-safe delivery
    view gated on `participationKind: "student"`, so a pure curator cannot reach
    it — documenting `targetEntityId` there would recreate the circularity
    ADR-019 fixed for quick checks. Closing that needs a curator-facing accepted
    readiness list (code, ADR-019-style), tracked separately.
- Add `docs/adr/adr-019-curator-accepted-quick-check-read-surface.md` (status:
  accepted): amends ADR-016 to decide a curator-only read surface over accepted
  quick checks. ADR-016 sanctions re-accepting a corrected quick check onto an
  existing accepted entity but decided only the student delivery projection, so
  a curator has no route to discover the stable entity id that in-place
  re-acceptance requires — the candidate list exposes only candidate ids, and
  the only enumeration of accepted quick checks (the delivery list) is gated to
  Student participation and omits the answer key. The ADR makes Corpus Storage
  expose a curator-authorized enumeration carrying the accepted entity id and
  current revision id (the missing sibling of the criteria/open-answer accepted
  lists), keeping answer keys curator-only. Passed five-dimension ADR review
  including code-cited feasibility (`listAcceptedQuickCheckEntityRecords`,
  `summarizeAcceptedQuickCheck`, `resolveAssessmentCuratorAuthorization`).
  Indexed in `architecture.html`.

## 2026-06-20

- Add `research/telegram-bot-native-polls.md`: grounded research verifying a
  Telegram agent's ("Hermes") claim that it cannot create native Telegram polls.
  Confirms `sendPoll` is a real, separate Bot API method bots can call (so the
  gap is tooling, not the platform), and surfaces the caveat the agent omitted —
  bots cannot send polls in private 1-on-1 chats. Cross-linked to the
  Telegram-bot runtime in `backlog/agent-connectivity.md` as a capability
  reference.
- Rewrite `docs/brand/visual-identity-brief.md` down to its purpose: describe
  the product and quote the name origin, nothing else. Removed all visual
  guidance (palette, type, mark concepts, applications, deliverables, must/avoid
  lists) — those decisions belong to the visual identity designer, not the
  brief. Also removed the source-link references and the visual-noun enumeration
  in the intro, leaving plain product description plus name origin.
- Add `docs/brand/visual-identity-brief.md`: a designer-facing handoff brief
  that carries the brand brief's naming rationale (agon root, brand-meaning
  layers, serious/formative tone) into a visual direction, with audience, what
  the identity must/must not express, mark/type/color starting points,
  applications, deliverables, and open questions. Establishes there is **no**
  visual reference yet — the shipped HTML/web surfaces are placeholder
  scaffolding, not a baseline — while preserving the one functional carry-over:
  five mutually distinct, accessible domain colors (student, curator, admin,
  corpus, membership). Ran adversarial review and fixed the defects found:
  stray closing tags at EOF, broken deliverables numbering, a self-contradiction
  about product surfaces being a "source of record," and a roles-vs-modules
  mislabel of the five domain colors.
- Add `docs/byoa-student-agent-connect.md`: a host-agnostic procedure for
  connecting an external BYOA agent to a deployed instance as a student
  (provision identity → place creds → install the api-access/membership/student
  skills → verify). Captures the first realized agent-connectivity path
  (cookie + CSRF, no bearer token yet); host-specific wiring stays in inventory
  per deployment-discipline.

## 2026-06-18

- Capture the nobilix Twenty CRM "CLI wrapper + thin SKILL.md over an
  OpenAPI/Swagger REST API" write-up verbatim under
  `research/cli/twenty-crm-cli-skill.md` (new `research/cli/` folder), with the
  source link in its frontmatter. It is third-party validation of the
  CLI-or-contract + SKILL.md pattern already analysed in
  `backlog/agenticops-affordances.md`: Agonara made the same bet with the
  OpenAPI contract substituting for a generated CLI as the flat command surface.
- Fold the analysis into `backlog/agenticops-affordances.md` as a "Second
  corroboration" subsection and a cross-link from the CLI "does not adopt"
  bullet. Finding: the CLI argument is stronger for Agonara's
  CSRF/idempotency handshake than for the post's bearer-token case, yet a
  *mandatory* CLI binary still loses against the runtime-free BYOA assumption;
  the post reinforces two existing items — bearer-token auth
  (`agent-connectivity.md`) and runtime command discovery (Idea 1) — not a new
  direction. No change to backlog direction or priority.

## 2026-06-15

- Capture AgenticOps part №4 (agents and scenarios) verbatim in
  `research/agenticops.md`, extending the captured series to parts 1–4. The post
  covers role-scoped agents (app-developer, platform-operator,
  platform-developer, deployer, monitor) and a break-glass path.
- Fold the design-relevant material into `backlog/agenticops-affordances.md`:
  part №4 sharpens Idea 1 into a two-layer rule (role as external param filters
  the discovery surface *and* gates execution from one source of truth) and
  reframes Idea 2 to lead with a diagnostic *bundle* (reusing
  `/operations/health` + correlated faults, no Loki/Tempo needed). Records the
  multi-role taxonomy, scheduled monitor agent, and break-glass path as
  deliberately deferred (ops-side, not BYOA substrate). No change to forward-task
  priority.

## 2026-06-11

- Capture a Habr write-up of a Telegram deep-link one-time-token login flow
  verbatim under `research/telegram-deep-link-token-auth.md`, with an analysis
  against the bearer-token item in `backlog/agent-connectivity.md`. Finding: it
  validates the item's framing (Telegram-shaped clients reject the cookie+CSRF
  flow for runtime fit, not security) and the handshake pattern (a homemade
  device-code flow, compatible with ADR-008's later credential providers), while
  its durable `aa_uid` raw-id cookie is the anti-pattern that ADR-008's
  invariants and the backlog's token-lifecycle cost paragraph exist to forbid.
  No change to backlog direction or priority.

## 2026-06-09

- Review the AgenticOps homelab platform write-up against Agonara and capture the
  net-new ideas worth adopting. Finding: Agonara already implements most of the
  AgenticOps platform pattern (CLI + SKILL.md → skill over OpenAPI; adapters →
  `agonara-api-access`; stable statuses/trajectories → the envelope +
  `ApiRejectionReason`; per-agent scoping → per-role skills; determinism →
  generated contract), and its front-door proposals (bearer token, MCP wrapper)
  are already in `backlog/agent-connectivity.md`.
- Capture the source verbatim under a new `research/agenticops.md` (new
  `research/` folder for external reference material, with a provenance banner
  stating it is not an Agonara artifact).
- Add `backlog/agenticops-affordances.md` (future-thinking design notes): the two
  net-new affordances — a self-describing API (runtime discovery + follow-up hints
  on the `accepted` envelope) and an agent-facing `diagnose` keyed on the existing
  `requestId` (sink: the on-hold `loki` stack) — what Agonara deliberately does
  not adopt (CLI surface, app descriptor, base infra), and the "platform owns
  repeatable processes" principle. It is the reasoning behind the `backlog/skills.md`
  forward tasks.
- Add two forward tasks to `backlog/skills.md`: the self-describing-API discovery
  affordance, and formalizing "platform owns repeatable processes" as an explicit
  design principle in the BYOA brief.

## 2026-06-08

- Lock the *shape* of operator-skill packaging as a pre-ADR
  (`skills/operator-skill-packaging_pre_adr.md`): role-scoped plugins
  (`agonara-curator`/`-student`/`-admin`) over a shared `agonara-core`, with the
  `agonara-` prefix carried by the plugin name so skill folders drop it. The
  decisive reason is that plugin frontmatter is static and audience-blind — one
  plugin ships the same `SKILL.md` flags to every installer, so it cannot project
  per-role surface; which plugin an operator installs is the only per-role
  projection (and `skillOverrides` cannot rescue a single plugin — it does not
  apply to plugin skills). Explicitly **verified for Claude Code only**;
  Codex/Cursor portability, role naming, membership placement, intra-role
  granularity, and the distribution model are carried as open questions.
- Adversarial review pass (verified against live `code.claude.com` docs)
  corrected an overstated claim — a single plugin *can* keep other-role skills
  out of model context via `disable-model-invocation: true`, so the real
  limitation is the audience-blind frontmatter above, not an impossible context
  state — and added the same-marketplace co-location constraint for the
  `agonara-core` transitive dependency, plus dependency version floors.
- Record the supporting Claude Code plugin/skill mechanics as a findings note
  (`skills/claude-code-plugin-system.md`) with doc URLs: plugin-to-plugin
  dependencies, `/<plugin>:<skill>` namespacing, the model/user visibility
  matrix, and marketplace symlink dedup. Banner states the Claude-Code-only
  verification scope.
- Both docs live under `agonara/skills/` (beside the skills) rather than the My
  Way `docs/pre-adr/` and research dirs — deliberate owner choice to keep the
  packaging design next to the packaged artifacts.
- Replace the parked "Packaging/home of operator skills" open question in
  `docs/plans/implemented/byoa-operator-skills.md` with a pointer to the
  pre-ADR; the distribution-model fork stays open there.

## 2026-06-07

- Add a backlog task (`backlog/skills.md`) to guard skill-stated request bodies
  against contract drift: the operator skills hand-restate field rules for bodies
  the OpenAPI deliberately leaves as `additionalProperties: true`, with no
  automated tie-back to the domain-spec source of truth. Sequenced before the
  discovery/packaging item.
- Sharpen the MCP-connector item in `backlog/agent-connectivity.md` from a peer
  task to a *conditional* one, gated on a concrete target runtime that can mount
  MCP but cannot execute arbitrary HTTP. Rationale: for code-capable agents the
  operator skills over the OpenAPI contract already are the one-step mount, so an
  MCP server is duplicated client surface; it only closes a gap a skill can't for
  constrained chat-hosted agents. Recorded the dependency on the bearer-token
  item (an MCP server wants a clean bearer credential, not cookie + CSRF).
- Add two BYOA-instance follow-ups to the top of the deployment handoff Active
  Follow-Up index: a host-agnostic operator self-host paved path (routing to a
  new gap-closing plan) and an optional public demo-instance exception to
  ADR-017's private-not-multitenant boundary (routing to a sketch).
- Fix stale landing copy in `index.html`: the dockerized private self-hosted
  shape is no longer "provisional until an ADR accepts the operational
  boundary" — ADR-017 accepted it (2026-06-06). Reworded to the committed
  operational boundary with a direct ADR-017 link.
- Draft `docs/plans/byoa-self-host-paved-path.md`: a gap-closing plan to turn the
  author-only `agonara-vps` CI deployment into a host-agnostic, operator-facing,
  non-author-verified self-host paved path, so the BYOA "point your agent at your
  instance" claim is backed by a real route to *having* an instance — without
  changing ADR-017's boundary. Phases cover a self-host runbook, a backup/restore
  drill runbook (ADR-017 G3), positioning links, and a non-author verification
  acceptance gate.
- Adversarially review the self-host paved-path plan
  (`docs/reviews/byoa-self-host-paved-path-plan-adversarial-review.md`): fixed
  two warnings — an "hardcodes /opt/agonara" overclaim (it is an env-overridable
  default) and an unacknowledged overlap with the existing demos.md Docker Demo
  (Phase 2 now extends and cross-links it). Declaration block and ADR-017
  fidelity passed.
- Sketch `docs/demo-instance-exception.md`: a public, ephemeral demo instance as
  a deliberate, scoped exception to ADR-017's private-not-multitenant boundary,
  to give an evaluator's agent a target before they self-host. Framed as a
  not-accepted proposal pending its own ADR, with proposed shape (single seeded
  auto-reset instance, sandboxed identities, bounded LLM exposure, full
  isolation), explicit non-goals (not SaaS, not a self-host replacement), and the
  guardrails the exception ADR must pin.
- Adversarially review the demo-instance sketch
  (`docs/reviews/demo-instance-exception-adversarial-review.md`): fixed one
  warning — the sketch listed `/admin` as a demo surface, conflicting with the
  standing public `/admin` block in the deployment handoff; the sketch now
  conditions `/admin` exposure on the admin-access decision and adds a guardrail
  requiring the exception ADR to revisit the block rather than override it
  silently. ADR-017 fidelity and framing passed.
- Capture the second half of the BYOA claim — how agents people actually use
  reach an instance — as forward tasks in a discovery-prefixed
  `docs/backlog-agent-connectivity.md`: token (bearer) auth as an alternative to
  the cookie+CSRF flow (ADR-008 decision), an optional MCP connector over the
  OpenAPI contract, the remote-admin access decision (the `/admin`-blocked
  follow-up viewed from connectivity), and operator guidance that sandboxed
  agents (Claude Code on web/app) must allowlist the instance domain. Linked it
  from the central `backlog.md` for discovery.
- Restructure the backlog into an `agonara/backlog/` folder for discovery:
  `docs/backlog.md` → `backlog/README.md` (now a topic index), extract the
  `Agent Process and Skill Improvements` section into `backlog/dev-skills.md`,
  and move `docs/backlog-agent-connectivity.md` → `backlog/agent-connectivity.md`
  (dropping the now-redundant prefix). Update the live landing links in
  `index.html`; historical `docs/backlog.md` references in implemented plans,
  archives, and the OpenAPI spec are left as closeout records.
- Make the bearer-token item in `backlog/agent-connectivity.md` explicit as an
  *addition, not a replacement* — one authorization core with two authentication
  adapters (cookie + CSRF for browsers, bearer for agents) — and record the
  rationale (client-kind fit, CSRF applicability, front-door-not-behavior change,
  non-breaking) plus the token-lifecycle cost that warrants its own ADR-008 spec.
- Clarify the Agonara landing hero by separating the structured-progress outcome
  from one concise product-value summary and reserving bring-your-own-agent
  explanation for the dedicated BYOA section.
- Add a forward backlog item to resolve the OpenAPI automation traceability
  review's remaining BYOA source-file absence question, including the expected
  test-title or audit paths.
- Record OpenAPI automation process follow-ups in the Agonara backlog so future
  agents can improve implementation review, process gates, traceability of
  negative guarantees, OpenAPI migration workflow, and Node toolchain preflight;
  add the active Agonara Node 22 command rule to project instructions.
- Implement Agonara OpenAPI automation: route contracts now generate
  `docs/api/openapi.yml`, `npm test --workspace agonara` checks generated
  output before Redocly lint, and server dispatch uses registry route matches
  while preserving existing HTTP behavior.
- Plan the Agonara OpenAPI automation implementation path, including registry
  validation, generated-contract checks, registry-backed routing, and closeout
  documentation gates.
- Specify OpenAPI automation for Agonara: add a route contract registry and
  generation-check spec that keeps server routing, route contract tests, and
  `docs/api/openapi.yml` aligned while preserving the published BYOA skill
  substrate.
- Convert the Agonara deployment handoff from a stale-prone release narrative
  into a short deployment index with explicit front-matter rules prohibiting use
  as a log, runbook, release note, live-state inventory, or implementation
  checklist. Keep only source-of-truth links and the future Admin access-layer
  follow-up.
- Decide the Agonara bootstrap-secret lifecycle: staging and production use
  distinct high-entropy host-side secrets, stored only in tier env files and the
  operator secret store, with rotation and verification rules documented. Clarify
  the deployment handoff so only Admin access-layer choice and release-smoke
  maintenance remain as operational follow-ups.
- Clean up the Agonara deployment handoff after release closeout by removing
  completed checklist items, stale pre-tag gates, and outdated plan links while
  keeping only the remaining bootstrap-secret and future Admin access decisions
  visible.
- Harden the OpenAPI Redocly lint guard by disabling Redocly telemetry in the
  project config and lint script environment, keeping the contract gate
  deterministic and CI-safe.
- Expose Agonara production publicly at `https://agonara.enoa.ai` with a Cloudflare DNS-only A record and Caddy auto-TLS route to the loopback prod container, keep `/admin` operator-gated with a public `403`, add release smoke for public `/learn`, `/admin` gate, and health/version, and update the deployment handoff with verification evidence.
- Move the OpenAPI automation follow-up out of `docs/api/TODO.md` and into the
  project backlog, preserving the forward tasks while removing the TODO file
  that GitHub issue #514 flagged. Update the landing page to link to the
  backlog instead of the deleted API TODO.
- Harden the `/learn` presentation-state closeout by preserving the README's
  broader Student/Curator product-UI deferral and updating the release-readiness
  audit to point at the current implementation-notes record instead of removed
  backlog questions.
- Resolve the `/learn` presentation-state product-state question: no additional
  persisted learner-facing presentation state is planned; current selections
  reload from backend contracts, theme persistence remains UI chrome, and
  broader Student/Curator UI needs separate specs if it introduces persisted
  product state.
- Resolve the membership-policy variants product-state question: no additional
  variants are planned beyond Student self-join and invitation-only access;
  cohort, organization, payment, approval, or invitation-expiry policy requires
  an ADR-backed spec when it amends policy or role vocabulary and must preserve
  the Admin-vs-Program-role boundary.
- Resolve the learner-state cache product-state question: no invalidated
  learner-state cache records are planned beyond implemented read-time
  derivation; future caches must keep source evidence authoritative and specify
  invalidation by source evidence or target-link changes.
- Resolve the learning-path sequencing product-state question: the accepted
  topic/concept/material navigation graph remains the shared sequencing state,
  recommendation ranking stays a future downstream artifact, and any personal
  recommendation state must be specified through Student Workspace ownership.
- Close the stale standalone Storage ownership backlog framing: Agonara storage
  now follows implemented module responsibilities and canonical runtime-state
  docs, while unresolved recommendation, learner-state cache, membership-policy,
  and `/learn` presentation persistence questions remain tracked as future
  product-state decisions.
- Establish the Agonara positioning baseline around turning scattered study into
  structured progress: add `docs/positioning.md`, update the README opening,
  and revise the landing hero/how-it-works/BYOA/private-instance copy to lead
  with serious self-directed learners, program curators, human acceptance, and
  learner-owned evidence.
- Add an explicit route inventory guard for the hand-edited OpenAPI contract:
  `openapi-contract.test.js` now fails when `docs/api/openapi.yml` gains or
  loses a method+path route without updating the reviewed inventory.
- Add Redocly lint to the Agonara test gate for the hand-edited OpenAPI
  contract: `npm test --workspace agonara` now runs `redocly lint
  docs/api/openapi.yml` after the node test suite.
- Add an OpenAPI rejection-reason drift guard while the API contract remains
  hand-edited: `openapi-contract.test.js` now compares every
  `httpStatusFor(...)` case with `components.schemas.ApiRejectionReason`, and
  the public `not_found` API rejection is explicitly mapped to HTTP 404.
- Add an OpenAPI contract guard for the hand-edited API spec: Agonara tests now
  parse `docs/api/openapi.yml` and fail on external or unresolved local `$ref`
  entries before drift can reach operator skills or clients.
- Surface the implemented BYOA operator-skill set on the Agonara landing page:
  tighten the product-surface wording, add a grouped Operator Skills section
  for foundations / curator work / role operations, update the getting-started
  path to include skill-driven operation, and link the skill index plus design
  brief from the docs section.
- Archive the remaining BYOA planning handoffs after the downstream work landed:
  move the operator-skills design brief and repositioning handoff into
  `docs/plans/implemented/`, update skill/discoverability references to the
  implemented design brief, and correct the project-local AGENTS note now that
  `agonara-admin` is implemented.
- Implement the BYOA **admin** operator skill at `skills/agonara-admin/SKILL.md`
  (third role of the build sequence): bootstrap the first Admin; create,
  inspect, disable, and credential-bind identities; grant/revoke Admin authority
  while preserving the last-admin invariant; inspect operational access and
  audit events; and perform exceptional membership recovery/revocation with
  attribution. The skill builds on `agonara-api-access` and
  `agonara-membership`, stays contract-grounded in `docs/api/openapi.yml`,
  remains portable and role-scoped, and explicitly excludes curation, learning,
  normal participant management, and host-side backup/restore execution. Align
  the Admin membership recovery/revocation OpenAPI request bodies with the
  implemented runtime fields (`targetIdentityId`,
  `recoveryReason`/`revocationReason`). Update `skills/README.md` and archive
  the plan to `docs/plans/implemented/byoa-skills-admin.md`, with verification
  evidence in `docs/reviews/byoa-skills-admin-verification.md`.
- Close the Agonara deployment wiring plan after verifying the first release
  already completed: `agonara_v0.1.0` exists, release-unit run `27073521933`
  succeeded through `verify`, `core`, `deploy-agonara-staging`,
  `deploy-agonara-prod`, and `github-release`, and the GitHub Release is
  published. Capture closeout evidence in
  `docs/reviews/agonara-deployment-wiring-closeout.md` and archive the plan to
  `docs/plans/implemented/agonara-deployment-wiring.md`.
- Close the post-merge verification gaps for the BYOA curator bucket: pass the isolated Agonara suite plus the full root test/build gates after a clean lockfile install, execute all four curator job loops against a real local HTTP instance, and record the redacted transcript plus formal section-by-section skill review. Correct material guidance to use `material_reference` navigation candidates, align invitation guidance and OpenAPI with the runtime-required `{ participationKind: "student", targetIdentityId }` body, add the concrete assessment and LLM-generation request shapes that the permissive contract schemas did not teach, and harden the reviewed guidance with the runtime's `draft_suggestion` status and finite relationship, readiness-target, and LLM-suggestion enums.
- Satisfy BYOA Student skill **G5 live-instance verification** against public staging with disposable Student data: preview accepted corpus/navigation without creating membership state, join, navigate topic/concept/material, submit quick/open/readiness attempts with idempotency replay, run the open-answer evaluator, read feedback and learner-state evidence, prove ownership denials for another Student, leave/rejoin with prior attempts and learner state preserved, and accept/decline invitation-only program invitations. Capture sanitized evidence in `docs/reviews/byoa-skills-student-live-verification.md`, update the Student skill/OpenAPI open-answer body field to `submittedAnswer`, allow signed-in state-free preview for accepted corpus and navigation, and archive the follow-up plan.
- Simplify the landing hero copy around the product promise and move the name note directly under the title, make both hero CTAs use the same neutral treatment, replace external-facing mastery-proof phrasing with progress/evidence-of-learning language, remove filler from the product-loop lede, remove duplicated hero runtime/product metadata and the interrupting sticky navigation block, fold the product-surface access paths into the product-loop section, cap the product-loop grid at two columns, make role skills explicit as their own surface card, cap the surface grid at three columns, and combine private-instance runtime details directly into the run section with spacing before the setup steps; remove the stale project TODO for a redundant Markdown documentation index.
- Implement the BYOA **student** operator skill at `skills/agonara-student/SKILL.md` (the second role of the build sequence), a single skill covering all four phases: discover & join (`GET /programs`, `GET /programs/{id}`, state-free preview via `accepted-corpus` + student-safe `navigation`, self-join/leave/rejoin via `student-membership`, own membership via `/program-memberships/me`, accept/decline leaning on `agonara-membership`), learn & navigate (`learner-state` resume/next-step, `navigation`/`navigation/entities/{id}` concept & material study, `learner-state/targets/concept|material/{id}` personal state), check & assess (student-safe `quick-checks`/`open-answer-checks`/`readiness-checks` deliveries + their revision reads, then `quick-check-attempts`/`open-answer-attempts`/`readiness-check-attempts` submissions with CSRF + idempotency key and feedback reads), and results & progress (`learner-state` summary/weak areas, `learner-state/targets/{targetKind}/{id}` evidence drill-down). Covers STU-01…23. Contract-grounded in `docs/api/openapi.yml` (every cited path/param/body verified), portable (instance URL + credentials + contract only), role-scoped (student ops + the two foundations), and ownership-safe — the load-bearing student boundary (only accepted corpus + own state; preview creates no state; never curator drafts/candidates, answer keys, correctness metadata, acceptance rationale, evaluator/provider internals, or other students' data) is stated up front and enforced via student-safe delivery reads instead of curator candidate routes. Update `skills/README.md` (per-role section), archive the plan to `docs/plans/implemented/byoa-skills-student.md`. **G5 (live-instance verification) is deferred** — the authoring environment had no running instance or Student credentials — and tracked as the unimplemented follow-up `docs/plans/byoa-skills-student-live-verification.md`; a closeout-status note in the archived plan records the outstanding gate so a reader is not misled that every gate passed. Also fixed the archived plan's relative links (`../api`→`../../api`, `byoa-operator-skills.md`→`../…`) broken by the move into `implemented/`. Record a `docs/backlog.md` open question (v0.0.5) for a **skill–contract drift guard**: skills cite concrete `openapi.yml` paths but nothing in CI fails when a contract change orphans a cited route — capture the options (path-existence test vs scheduled `doc-drift-audit` vs manual review) rather than decide now.
- Implement the BYOA operator-skill **curator bucket** under `skills/` (first role of the build sequence, proving the bucket pattern), built on the api-access + membership foundations: `agonara-curator-corpus` (create a program; propose topics/concepts/materials and navigation as candidates; control the draft↔accepted boundary with explicit accept/reject; read accepted corpus, revisions, and corpus events — CUR-01…03,06,08,10), `agonara-curator-assessment` (open-answer/quick/readiness checks and assessment criteria via candidate→acceptance→revision; learner-state target links; answer keys read only through the `/curation` views and never student-facing — CUR-04,05), `agonara-curator-research` (record external sources, read coverage-gap diagnostics, generate/trace/accept/reject LLM curation suggestions as drafts — accepting a suggestion only *materializes a draft candidate*, not accepted corpus — CUR-07,09,11,12,13), and `agonara-curator-participation` (admission policy, invitations, participants, stop-curating, membership events; leans on `agonara-membership` — CUR-14…18). Each is contract-grounded in `docs/api/openapi.yml` (all 50 cited paths verified present), portable (instance URL + credentials + contract only — no `src/`/tests/tooling/runtime), role-scoped (curator-only ops; no student attempt/progress or admin identity flows), and ownership-safe (drafts/keys curator-only; no reads of private student learning state; accepted changes preserve student state per CUR-10). Update `skills/README.md`, refresh `docs/loc-dashboard.html`, fix the stale "none implemented yet" note in `AGENTS.md`, and archive the plan to `docs/plans/implemented/byoa-skills-curator.md`.
- Implement the BYOA operator-skill **foundations** under `skills/`: `agonara-api-access` (connect/health, password login + `agonara_session` cookie, whoami/CSRF token, `X-Agonara-CSRF` and `X-Agonara-Idempotency-Key` mutation contract, and the `accepted`/`rejected`/`fault` envelope with retry-vs-stop reasoning) and `agonara-membership` (role-neutral participation model: own memberships/invitations, accept/decline, effective participation, membership history — with explicit carve-outs for curator/student/admin ops). Both are portable (instance URL + credentials + contract only), contract-grounded in `docs/api/openapi.yml`, role-scoped, and ownership-safe. Verified live against a local instance (health bare-doc vs envelope, login→whoami→CSRF-less mutation rejected `csrf_required`→CSRF+idempotent mutation accepted, membership/invitation reads). Update `skills/README.md`, archive the plan to `docs/plans/implemented/byoa-skills-foundations.md`.
- Reposition Agonara as **bring-your-own-agent (BYOA)** across the product docs — a Product Intent *refinement* (the product is unchanged; the operating model is made explicit). Added a BYOA operating-model section to `docs/intent/intent_learning_program_app.md` (the product is the API + per-role operator skills driven by the operator's own agent, with `/learn`/`/admin` retained as first-class clients), bumped intent to v0.4.0, and ran a backward-traceability check over the 13 intent/story-citing ADRs — all clean (every ADR places UI outside its decision scope; module ownership and ADR-004…018 unaffected). Verified the user-story catalogs are already access-path agnostic (no edits, no new stories). Led with BYOA in `README.md` (project) and the repo-root Components row, repositioned the `index.html` hero + `#surfaces` section and the `architecture.html` deployment narrative to BYOA-primary with UIs/CLI first-class, and added a BYOA positioning touch to the EN/RU brand briefs (v0.2.0, parity preserved). Docs-only; no Node/config/CI/generated artifact touched. Plan archived under `docs/plans/implemented/agonara-byoa-repositioning.md`.
- Record the Phase 0 positioning decision for the BYOA repositioning: **no ADR — refinement only**. The repositioning introduces no new architectural boundary or invariant (module ownership and ADR-004…018 unchanged); the BYOA-primary/UIs-retained positioning is already recorded in `docs/plans/byoa-operator-skills.md` and is stated directly in Product Intent, so a separate ADR would be over-recording per the `adr-governance` criteria.
- Expand the BYOA operator-skills build sequence into four My-Way implementation plans under `docs/plans/`, one per bucket/role: `byoa-skills-foundations.md` (shared api-access + membership), `byoa-skills-curator.md` (corpus/assessment/research/participation bucket), `byoa-skills-student.md`, and `byoa-skills-admin.md`. Each is contract-grounded in `docs/api/openapi.yml` and intent-grounded in the role user stories, declares its execution contract (auto-continue, own worktree/branch, push at closeout), and gates every phase on contract-grounding, portability, role-scoping, ownership/invariant-safety, live-instance verification, skill review, and docs. Foundations is the hard dependency for all three role plans. Cross-link the plans from `byoa-operator-skills.md`.
- Author the implementation plan for the BYOA repositioning (`docs/plans/agonara-byoa-repositioning.md`) from the handoff: a docs-only Product Intent refinement propagated across intent, user stories, README (project + repo-root row), landing, architecture, and brand briefs, with a Phase 0 ADR decision gate, a backward-traceability check against the ADRs that cite intent/stories, and a closing `traceability-review` pass. Follows the My Way mandatory plan structure; module ownership and the `/learn`/`/admin` UIs are explicit guardrails (UIs stay first-class, BYOA primary not exclusive).

- Animate the cards on both `index.html` and `architecture.html`: an IntersectionObserver-driven scroll-reveal (staggered fade/slide-up) plus a consistent hover lift with shadow, gated behind a `js` class so no-JS users see static cards and short-circuited under `prefers-reduced-motion`. Exclude the architecture evaluation-flow `.step` cards from the reveal (hover only): they live in a horizontally-scrollable container that can clip them out of the viewport, where the observer would otherwise leave them permanently hidden on narrow screens. Drop a dead `.cap` transition declaration superseded by the shared rule.
- Refocus the project landing (`index.html`) on production and how to use it: a product-loop "How it works" section, a "Run your own private instance" getting-started walkthrough with real Docker/CLI commands, and a hero CTA — moving the duplicated ownership and module-boundary detail entirely to `architecture.html`, and flattening the "What is implemented today" cards to vertical titles without the redundant category tags.
- Remove the developer-facing `agonara-api` skill (built for the wrong consumer — an agent editing the codebase rather than an operator using the product) and clean its references in `AGENTS.md` and `docs/api/TODO.md`. Retain `agonara/skills/` as the parent for future bring-your-own-agent (BYOA) operator skills (seeded README). Capture the operator-skill design in `docs/plans/byoa-operator-skills.md` and a handoff for the separate product/docs repositioning job in `docs/plans/agonara-byoa-repositioning-handoff.md`.
- Record the BYOA positioning decision in both plan docs: `/learn` and `/admin` UIs stay first-class, BYOA is primary but not exclusive. Add a build sequence and per-skill definition of done to `byoa-operator-skills.md` so it serves as the handoff for the skill-building job.
- Frame the BYOA work explicitly as a Product Intent **refinement, not a rewrite or pivot** (product purpose unchanged; operating model made explicit), and add a guiding principle for the repositioning edits — lead with intent, keep intent docs about intent rather than loading implementation detail. Fix stale claims surfaced by adversarial review (the landing skill reference was dropped by trunk's redesign, not this branch).
- Add an API TODO for OpenAPI automation and Agonara API skill alignment, and surface both the OpenAPI contract and implemented API skill on the project landing.
- Harden the OpenAPI contract after adversarial review by documenting bootstrap `401` rejections, tightening the evaluator tick request body, completing private license metadata, and making public no-auth route `not_found` responses explicit.
- Add the canonical route-level OpenAPI 3.1 contract at `docs/api/openapi.yml`, covering implemented Agonara HTTP surfaces, shared envelopes, session-cookie auth, CSRF, idempotency, and common rejection reasons.
- Make Agonara Learn dark by default with a top-right persisted dark/light switcher and focused UI contract coverage.
- Add a project-local `agonara-api` skill under `agonara/skills/` so agents working on Agonara API routes can ground themselves in the current specs, ownership boundaries, session/CSRF/idempotency rules, response envelopes, redaction constraints, and verification commands without publishing the skill through Dev Skills.

## 2026-06-06

- Provision Agonara GitHub deploy secrets from the inventory-backed RackNerd VPS target: `AGONARA_VPS_HOST=172.245.246.108`, `AGONARA_VPS_USER=root`, and the verified local agent SSH key, leaving trunk-only readiness as the remaining preflight blocker on this branch.
- Run the Agonara first-release preflight from the current branch, confirming the trunk guard blocks readiness execution, the first release tag is still absent, and the required Agonara GitHub deploy SSH secret names are missing.
- Audit Agonara release readiness against Product Intent closeout, deployment handoff gates, first-release prerequisites, public-prod open questions, and the readiness script before release execution.
- Refresh the Identity implementation notes so HTTP audit-event redaction and pagination are no longer described as deferred.
- Mark the Operational Cross-Cutting first-slice spec implemented with evidence links to request correlation, operational logs, health, diagnostics, redaction, backup/restore logging, and executable acceptance.
- Align Identity backup/restore operational log components with the operational component-name contract.
- Implement Identity audit-event HTTP pagination and invalid cursor/limit rejection after adversarial review of the API/CLI spec closeout.
- Mark the Identity & Role Management API/CLI spec implemented with evidence links to HTTP adapters, CLI commands, focused route/CLI tests, and executable acceptance.
- Mark the Identity & Role Management first-slice spec implemented with evidence links to the identity command boundary, persistence, backup/restore coverage, HTTP/CLI acceptance, and the Admin UI board.
- Clarify the Program Shell and Membership API status note so the base slice boundary does not overclaim absence of later invitation and recovery routes.
- Mark the Program Shell and Membership API spec implemented with evidence links to route adapters, delegated Program commands, focused HTTP coverage, and executable acceptance.
- Mark the Program Shell and Membership first-slice spec implemented with evidence links to the domain boundary, persistence, backup/restore coverage, effective participation, and membership events.
- Mark the Corpus Storage and Curator Acceptance API spec implemented with evidence links to route adapters, delegated Corpus commands, focused HTTP coverage, and executable acceptance.
- Mark the Corpus Storage and Curator Acceptance first-slice spec implemented with evidence links to the domain boundary, persistence, backup/restore coverage, Corpus events, and executable acceptance.
- Mark the accepted checks and assessment criteria API spec implemented with evidence links to route adapters, delegated Corpus commands, focused HTTP coverage, and executable acceptance.
- Clarify the accepted checks and assessment criteria first-slice status note so the no-HTTP boundary applies to the domain slice, with the later HTTP surface linked separately.
- Mark the accepted checks and assessment criteria first-slice spec implemented with evidence links to Corpus command/query behavior, persistence, backup/restore coverage, and executable acceptance.
- Link the implemented Quick-Check Assessment first-slice status note to the later Quick Check API and Learner-State Interpretation specs so the domain-slice scope boundary is concrete.
- Mark the Quick-Check Assessment first-slice spec implemented with evidence links to Corpus command/query behavior, Student Workspace attempts, persistence, backup/restore coverage, and executable acceptance.
- Mark the Student Workspace open-answer attempt first-slice spec implemented with evidence links to the archived plan, Student Workspace domain commands, persistence, backup/restore coverage, and executable acceptance.
- Align the implemented open-answer attempt API spec with shipped response envelopes: submission returns an attempt summary, and detail reads return the full attempt detail.
- Mark the Student Workspace open-answer attempt API spec implemented with evidence links to the archived plan, HTTP adapters, domain commands, HTTP route coverage, and executable acceptance.
- Mark the Student Workspace open-answer evaluation status/evidence spec implemented with evidence links to the archived plan, evaluator-run commands, owner-only reads, persistence, backup/restore coverage, and executable acceptance.
- Align the implemented evaluator orchestration spec with timeout behavior by documenting `evaluator_job_lease_active` for unexpired leases.
- Mark the Student Workspace open-answer evaluator orchestration spec implemented with evidence links to the archived plan, command/query surface, persistence, backup/restore coverage, and executable acceptance.
- Mark the Student Workspace open-answer evaluator worker spec implemented with evidence links to the archived plan, worker command, backup/restore coverage, executable acceptance, and ADR-018 runtime extension.
- Harden container-boundary readiness against later-stage privilege reset, healthcheck disablement, and entrypoint override by requiring one stage, one healthcheck, and the server command last.
- Enforce the release container runtime boundary before tagging: pinned slim base, locked install, runtime-owned app/data files, final non-root user, `/data` database path, and Node-native healthcheck.
- Harden deployment-tier isolation readiness against commented requirements and alternate public port syntax, and require SQLite state to remain on the isolated `/data` volume.
- Enforce ADR-017 deployment-tier isolation in first-release readiness: distinct Compose project/container identities, loopback ports, env files, data volumes, and required host-side runtime configuration.
- Tighten deploy image lifecycle readiness to require the staging and production health gates after no-build container replacement, with focused coverage for staging git-SHA tags and production rollback retention.
- Extend first-release readiness to enforce build-before-downtime deploy ordering, version and git-SHA image tags, no-rebuild startup, and prior-production rollback retention.
- Bring staging backup/restore rehearsal to production integrity parity by requiring `agonara.sqlite` before transfer or destructive restore, and enforce the staging lifecycle in first-release readiness.
- Require production backup archives to contain `agonara.sqlite` before service restart, off-host transfer, retention pruning, or reported success, with first-release readiness coverage.
- Preflight production restore archives for non-empty, readable tar content before shutting down or replacing data, and enforce the destructive ordering, no-rebuild restart, and health gate in first-release readiness.
- Extend the Agonara first-release readiness check to verify production backup requires off-host storage, recovers service on archive failure, rejects empty archives, transfers successfully, and prunes local retention.
- Extend the Agonara first-release readiness check to verify production rollback restores the retained image without rebuilding and health-gates service availability independently of the failed target version.
- Extend the Agonara first-release readiness check to verify deploy jobs are scoped to Agonara tags and production depends on staging.
- Extend the Agonara first-release readiness check to verify GitHub Release creation depends on successful staging/prod deploy jobs for Agonara tags.
- Extend the Agonara first-release readiness check to verify release failure notifications trigger on staging/prod deploy failures and report both deploy results.
- Extend the Agonara first-release readiness check to verify staging failure cleanup and production rollback run before final upload cleanup.
- Extend the Agonara first-release readiness check to verify release workflow real evaluator smokes clean `/tmp/agonara-smoke.json` and assert the expected health version.
- Extend the Agonara first-release readiness check to verify release workflow version checks reject non-2xx `/operations/health` responses before parsing JSON.
- Harden release workflow staging and production version checks to reject non-2xx `/operations/health` responses before parsing JSON.
- Extend the Agonara first-release readiness check to verify staging and production deploy scripts require HTTP success, structured health JSON, `status: ok`, and the expected version.
- Harden staging and production deploy health gates to require HTTP success, parse `/operations/health` JSON, and require both `status: ok` and the expected version.
- Extend the Agonara first-release readiness check to verify the release workflow cleans `/tmp/agonara-deploy` before copying source.
- Clean `/tmp/agonara-deploy` before copying Agonara release source so stale upload files cannot satisfy current deploy-script preflight.
- Extend the Agonara first-release readiness check to verify staging/prod deploy scripts preflight required uploaded files before mutating the deploy root.
- Extend the Agonara first-release readiness check to verify the locked release install wiring: package lock, Dockerfile `npm ci`, release upload, and CI dispatcher path.
- Include `agonara/package-lock.json` in the root CI dispatcher allowlist so lockfile-only changes run the Agonara core workflow.
- Add a package-local Agonara lockfile and switch the release Docker build to `npm ci --omit=dev`, with the lockfile uploaded and required by staging/prod deploy scripts.
- Harden Agonara staging/prod deploy scripts to fail on incomplete uploaded source payloads before mutating the deploy root.
- Extend the Agonara first-release readiness check to optionally verify the required GitHub deploy secret names with `gh` before the explicit release tag is pushed, without reading secret values.
- Clean Agonara release source uploads on staging failure and after every prod deploy outcome, while preserving rollback ordering before final cleanup.
- Harden Agonara release smoke cleanup so staging/prod evaluator-smoke JSON files are removed inside the container even when smoke execution or validation fails.
- Add an Agonara first-release readiness script that verifies the `agonara_v0.1.0` tag, trunk branch, tag absence, package/manifest sync, Docker-unit status, and release workflow deploy/failure fan-in before the first tag is pushed.
- Add a fail-fast Agonara release deploy secret preflight in `release-unit.yml` so a missing `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`, or `AGONARA_VPS_SSH_KEY` stops before source upload and reports the missing secret name without printing secret values.
- Register Agonara as a `0.1.0` Node + Docker release unit, add tag-driven staging and internal-prod deploy jobs to `release-unit.yml`, run real evaluator smokes inside the containers, require both Agonara deploys before GitHub Release, and keep the first release gated on explicit tag push plus GitHub deploy SSH secrets.
- Deploy the Agonara prod tier internally on the RackNerd VPS as loopback-only `agonara` on `127.0.0.1:18080`, with distinct prod env secrets, a dedicated `agonara-prod` Nomos project/key on `https://nomos.enoa.ai`, a real open-answer evaluator smoke, daily prod off-host backups to the Qwins host, and a prod restore drill from the downloaded off-host artifact.
- Fix Agonara backup/restore scripts to target the actual Compose-created volume names, add staging backup/restore rehearsal scripts, support a dedicated backup SSH key, reject empty archives, prune local old archives, provision daily staging off-host backups to the Qwins host, and verify a restore drill from the downloaded off-host artifact preserves staging data and health.
- Provision Agonara staging with a dedicated Nomos staging project/key and smoke-admin credentials, harden the real-provider adapter to request strict JSON-schema output, add an operator smoke script that schedules an exact open-answer evaluator job through the database and triggers it through `/operations/open-answer-evaluator/tick`, copy scripts into the runtime image, and verify a real staging smoke persisted an evaluation through `https://staging.agonara.enoa.ai`.
- Bring Agonara staging onto public HTTPS: create the DNS-only Cloudflare A record `staging.agonara.enoa.ai -> 172.245.246.108`, install Caddy on the RackNerd Agonara VPS, terminate TLS at Caddy, keep `agonara-staging` bound to loopback `127.0.0.1:18081`, and verify `https://staging.agonara.enoa.ai/operations/health` returns `status: ok` with version `0.0.0`.
- Complete the first staging dry run on the RackNerd Agonara VPS: deploy `agonara-staging` through the build-on-VPS script, health-gate `/operations/health` on `127.0.0.1:18081`, confirm local image tags for version and git sha, keep staging env secrets host-side at `0600`, and harden the image/scripts for Docker-only hosts (runtime-readable package metadata, Node-native health probes, no host-Node dependency, normalized non-secret source file modes).
- Add ADR-017 VPS-side deployment scaffolding for Agonara: staging/prod compose files with isolated loopback ports and data volumes, build-on-VPS deploy scripts with version/git-sha tags and rollback image retention, off-host backup and restore scripts, CI path coverage for deploy assets, and contract tests for the deployment invariants.
- Harden the ADR-018 runtime after adversarial review by sending accepted check prompt and criterion body snapshots to the Nomos adapter, covering missing adapter configuration, failed/malformed provider responses, and operations-session trigger authorization.
- Implement ADR-018 real-provider runtime for the open-answer evaluator: add the Nomos HTTP provider adapter with output validation and secret-free usage summaries, an LLM evaluator policy helper, async-compatible Student Workspace worker execution, a single-flight operational tick, and `startServer` composition wiring gated on complete `AGONARA_NOMOS_*` runtime config plus an authenticated operations trigger. Mark the real-provider runtime spec implemented, update the deployment handoff, and keep release/deployment wiring pending.
- Clarify the API-first Agonara stance across the README, landing, architecture, deployment-target note, and workspace products landing: backend contracts own program, corpus, membership, assessment, and learner-state behavior, while `/learn`, `/admin`, the operator CLI, and future Agonara agent skills use or target those contracts rather than becoming separate owners of workflows or state.
- Add project-local agent instructions declaring that Agonara aims to follow the My Way approach, with `CLAUDE.md` symlinked to `AGENTS.md` for tool compatibility.
- Adversarial review of the deployment-handoff artifacts (ADR review standard + My Way spec/plan review): back-link ADR-015 to its ADR-018 amendment (cross-ADR consistency); cite the concrete nomos deploy/rollback scripts, loopback compose, and `/operations/health` HEALTHCHECK as build-on-VPS feasibility evidence in ADR-017 (Dimension V); ground the real-provider spec on Nomos's verified `POST /v1/chat/completions` + `Authorization: Bearer` API and make the worker-trigger authorization concrete (operations-access session or configured token); and fix a plan sequencing risk (no `agonara_v*` tag until the deploy jobs land), a machine-specific worktree path, and a doc cross-reference.
- Close the deployment-handoff gaps with the missing My Way artifacts: accept `docs/adr/adr-017-private-instance-deployment-operational-boundary.md` (G1 + G3 — dockerized staging/prod on agonara-vps, build-on-VPS, loopback + reverse-proxy TLS, ≥ daily off-host `/data` backup with a rehearsed restore drill before prod is real) and promote `docs/deployment-target.md` to point at it; accept `docs/adr/adr-018-open-answer-evaluator-real-provider-runtime.md` (G2 — amends ADR-015 to decide in-process single-flight worker topology, mandatory real-output validation, non-persistent raw artifacts, and env-only Nomos credentials) with the implementable contract in `docs/specs/open-answer-evaluator-real-provider-runtime.md`; add the `docs/plans/agonara-deployment-wiring.md` implementation plan sequencing release-unit registration, VPS scaffolding, CI deploy jobs, and the gated real-LLM smoke; record the resolution in `docs/deployment-handoff.md`; and add ADR-017/018 to the `architecture.html` ADR index.
- Implement §6a deployed-version surfacing: `GET /operations/health` now returns a `version` field sourced from `package.json` at runtime through the composition root (`startServer` → `createServer`), with unit coverage and a container-smoke version assertion in `agonara-core.yml`, specified by `docs/specs/operations-health-version.md`.
- Restructure `docs/deployment-handoff.md` after adversarial review to separate the pure deployment-wiring work (release-unit registration, staging/prod compose, deploy scripts, CI deploy job, VPS data + keys) from the net-new Agonara application code it presumed: a new §6 "Application development required" (health version surfacing; a real Nomos provider adapter + evaluator policy + output validation + worker runtime wiring, none of which exist in `src/` today) and a new §5 "Blocking prerequisites (ADR/spec gates)" (deployment ADR, an ADR-015 evaluator-execution/output-schema/artifact-policy spec, backup/restore) promoted ahead of the first-release runbook, which is now marked non-executable until those gates close.
- Harden the new landing/architecture pages after adversarial review: hedge the landing's deployment language to mark the dockerized self-hosted shape as a provisional target (matching `deployment-target.md`), give each of the five modules a distinct accent so colour uniquely identifies a module, and scope the Identity module block to `identity.js` so `cli.js` is attributed once as the Operator CLI surface.
- Add `index.html` project landing reflecting the current implementation snapshot (five-module split, shipped slices, product surfaces, stack) in the established Agonara brand style, with a progressive-disclosure link to a new `architecture.html` covering the module responsibility map, ownership rules, open-answer evaluation flow, source layout, runtime/storage, cross-cutting concerns, deployment, and the ADR index; surface both from the workspace landing index and the project README. Point landing/architecture/README/workspace-index links at the consolidated `docs/intent/user-stories.html` path.
- Consolidate loose `docs/` files into purpose-named subfolders: move the Product Intent set (`intent_learning_program_app.md`, curator/student/admin user stories, `user-stories.html`) under `docs/intent/` and the Program Membership Pre-ADR under `docs/pre-adr/`, then repoint every cross-referencing link in the intent doc, Pre-ADR, ADRs, specs, the identity first-slice note, and archived implementation plans.

## 2026-06-04

- Close LLM-assisted curation suggestion traceability with implemented spec status, Product Intent evidence links, README/backlog/runtime status updates, parent-plan closeout/archive placement, implemented child-plan references, and LOC dashboard refresh.
- Implement Phase 5 of the LLM-assisted curation suggestions plan with `/learn` Program Curator generation, filtered review, redacted origin inspection, draft materialization, rejection, role isolation, and browser regression coverage.
- Implement Phase 4 of the LLM-assisted curation suggestions plan with session-backed HTTP generation, listing, detail, acceptance, rejection, provider-fake production composition, redaction, and executable acceptance coverage.
- Implement Phase 3 of the LLM-assisted curation suggestions plan with Program Curator review listing/detail, terminal rejection, and draft candidate materialization without accepted-corpus mutation.
- Implement Phase 2 of the LLM-assisted curation suggestions plan with Curator Workspace provider-fake generation, redacted prompt context, policy/output/budget validation, idempotent replay, and no adjacent-domain mutation.
- Implement Phase 1 of the LLM-assisted curation suggestions plan with durable suggestion/generation storage, terminal review state, materialized draft-candidate references, backup export, and restore validation.
- Harden the LLM-assisted curation suggestions child plan after adversarial review by making provider file ownership explicit and carrying browser regression gates into final closeout.
- Add the LLM-assisted curation suggestions child implementation plan with exact storage, Curator Workspace, HTTP, UI, test, review, dashboard, and archive gates for Phase 7 of the product gap closure.
- Harden the LLM-assisted curation suggestions spec after adversarial review by clarifying answer-key redaction, terminal suggestion transitions, and composition-owned provider adapters.
- Add the LLM-assisted curation suggestions spec with Curator Workspace-owned provider boundaries, draft suggestion records, explicit materialization into draft candidates, provenance, redaction, and backup/restore rules.
- Close Curator Coverage Gaps traceability with implemented spec status, Product Intent evidence links, README/backlog/runtime status updates, parent-plan closeout, archive placement, and LOC dashboard refresh.
- Harden Phase 3 coverage UI after adversarial review by removing source-derived gap ids from DOM attributes and proving Admin-only denial with a real Admin identity.
- Implement Phase 3 of the Curator Coverage Gaps plan with `/learn` Program Curator filtering, report refresh, list and drill-down surfaces, browser redaction checks, unauthorized-session coverage, and existing workflow preservation.
- Harden Phase 2 coverage HTTP after adversarial review by hiding cross-Program scope mismatches behind `coverage_gap_scope_not_found`.
- Implement Phase 2 of the Curator Coverage Gaps plan with a session-backed Program Curator HTTP route, query filtering, private status mapping, redacted report responses, and production composition coverage.
- Harden Phase 1 coverage diagnostics after adversarial review by explicitly testing unlinked Quick Check, open-answer check, and assessment-criterion coverage gaps.
- Implement Phase 1 of the Curator Coverage Gaps plan with a read-only Curator Workspace diagnostic query, deterministic accepted-corpus coverage gaps, Program Curator authorization, filtering, redaction, and no-mutation coverage.
- Harden the Curator Coverage Gaps child plan after adversarial review by adding conditional storage verification, precise Product Intent traceability wording, and explicit tracker-update commit rules.
- Add the Curator Coverage Gaps child implementation plan with exact Curator Workspace, HTTP, UI, test, review, dashboard, and archive gates for Phase 6 of the product gap closure.
- Harden the Curator Coverage Gaps spec after adversarial review by adding INT-01 traceability, deterministic gap identity rules, and an explicit domain-state boundary for operational logging.
- Add the Curator Coverage Gaps spec for read-only draft guidance over accepted corpus, separating curator diagnostics from Student weak-area state and accepted-corpus mutation.
- Close Program Membership invitations and recovery traceability with implemented spec status, Product Intent evidence links, README/backlog/runtime status updates, parent-plan closeout, archive placement, and LOC dashboard refresh.
- Harden Phase 4 membership product UI after adversarial review with stale-response guards across Program, identity, and session changes; cleared membership form inputs; accessible Admin feedback; edited-Program event context; and explicit Admin redaction coverage.
- Implement Phase 4 of the Program Membership invitations and recovery plan with role-isolated `/learn` invitation, participant, admission-policy, self-join, and curator-leave workflows plus Admin-only exceptional recovery, revocation, and membership-event inspection.
- Harden Phase 3 membership HTTP after adversarial review with session-before-CSRF ordering for existing Program mutations, Admin-vs-Curator invitation separation, exceptional last-curator protection, attributable Admin recovery, diagnostic-read redaction, and invitation-only self-join coverage.
- Implement Phase 3 of the Program Membership invitations and recovery plan with session-backed invitation, participant-management, curator-leave, and exceptional Admin membership routes, strict body validation, private errors, and executable HTTP acceptance coverage.
- Harden Phase 2 membership commands after adversarial review with attributable rejected events, atomic state/event transitions, effective last-curator protection, and distinct exceptional validation reasons.
- Implement Phase 2 of the Program Membership invitations and recovery plan with controlled Student invitation lifecycle, participant management, curator leave, admission-policy enforcement, and reasoned exceptional Admin recovery/revocation.
- Harden Phase 1 membership invitation storage after adversarial review by mapping pending-scope status conflicts and rejecting malformed membership event metadata during restore validation.
- Implement Phase 1 of the Program Membership invitations and recovery plan with invitation-only admission policy storage, Program invitation records, membership event metadata, backup preservation, and malformed restore rejection.
- Harden the Program Membership invitations and recovery plan after adversarial review by expanding curator-leave targeted test matching and requiring Admin-board preservation coverage.
- Add the Program Membership invitations and recovery child implementation plan with exact storage, domain, HTTP, UI, test, review, commit, dashboard, and archive gates for Phase 5 of the product gap closure.
- Start parent Phase 5 of the Agonara product gap closure plan with a Program Membership invitations and recovery spec that keeps ordinary curator/student participation flows separate from exceptional Admin recovery.
- Close the topic and period readiness checks plan with implemented spec status, Product Intent traceability, README/backlog/runtime status updates, parent-plan closeout, archive placement, and LOC dashboard refresh.
- Implement Phase 5 of the topic and period readiness checks plan with `/learn` readiness curation controls, Student delivery and explicit readiness attempt workflows, idempotent retry, owner-only attempt detail, evidence drill-down, redaction checks, and Quick Check/navigation/learner-state browser regression coverage.

## 2026-06-03

- Implement Phase 4 of the topic and period readiness checks plan with session-backed HTTP curation routes, Student delivery and attempt routes, CSRF/idempotency gates, owner-only attempt reads, status mapping, and student-safe redaction coverage.
- Implement Phase 3 of the topic and period readiness checks plan with explicit Student readiness attempt submission, learner-state snapshot derivation, stable historical reads, idempotency replay/conflict handling, owner-only attempt reads, and raw-assessment non-promotion coverage.
- Implement Phase 2 of the topic and period readiness checks plan with Program Curator readiness candidate curation, accepted scope and requirement validation, replacement revisions, curation reads, and no Student Workspace mutation coverage.
- Harden Phase 1 readiness storage after adversarial review by validating requirement result labels from observed learner-state levels and giving `not_ready` precedence over `in_progress`.
- Implement Phase 1 of the topic and period readiness checks plan with storage support for readiness candidates, accepted revisions, explicit Student attempts, idempotency replay, backup round-trip, and malformed restore rejection.
- Add the topic and period readiness checks spec and child implementation plan, separating explicit readiness attempts from raw Quick Check/open-answer attempts and sequencing storage, Corpus curation, Student Workspace derivation, HTTP, UI, traceability, dashboard, and archive gates.
- Close the learner-state interpretation plan with implemented spec status, Product Intent traceability, README/backlog/runtime status updates, parent-plan closeout, archive placement, and LOC dashboard refresh.
- Harden Phase 5 learner-state UI after adversarial review with Program-context clearing for private learner-state surfaces and negative-evidence weak-area browser coverage.
- Implement Phase 5 of the learner-state interpretation plan with `/learn` target-link curation controls, owner-only learner-state summaries, supporting-evidence detail views, redaction checks, and Quick Check/navigation UI regression coverage.
- Harden Phase 4 learner-state HTTP routes after adversarial review with explicit unsupported and missing evidence-owner status mapping coverage.
- Implement Phase 4 of the learner-state interpretation plan with HTTP target-link curation routes, owner-only learner-state summary/detail routes, CSRF mutation gates, status mapping, redaction coverage, and executable acceptance coverage.
- Harden Phase 3 learner-state derivation after adversarial review with deleted-link, no-implicit-inference, pending-status, evaluator-evidence, and partial-outcome coverage.
- Implement Phase 3 of the learner-state interpretation plan with owner-only read-time Student Workspace summaries, weak-area sorting, target detail evidence, explicit target-link contribution, latest-evidence levels, and read-only boundary coverage.
- Harden Phase 2 learner-state target-link curation after adversarial review by marking the phase tracker complete and adding explicit concept and material-reference target coverage.
- Implement Phase 2 of the learner-state interpretation plan with Corpus-owned learner evidence target-link curation commands, Program Curator authorization, accepted target/evidence-owner validation, soft deletion, and executable acceptance coverage.
- Harden Phase 1 learner-state target-link storage after adversarial review with cross-Program target/evidence-owner restore rejection coverage and explicit duplicate target-link id validation.
- Implement Phase 1 of the learner-state interpretation plan with learner evidence target-link storage, active-link idempotency, soft deletion, backup/restore preservation, and malformed restore rejection.
- Harden the learner-state interpretation plan after adversarial review by making per-phase worktree and branch preflight an explicit implementation gate.
- Add the learner-state interpretation child implementation plan with exact target-link, derivation, HTTP, UI, test, review, commit, dashboard, and archive gates for Phase 3 of the product gap closure.
- Harden the learner-state interpretation spec after adversarial review by adding explicit target-link curation, deletion status, active-link derivation rules, and target-link validation tests so weak topic/concept summaries do not rely on implicit source or text inference.
- Start Phase 3 of the Agonara product gap closure plan with a learner-state interpretation spec that keeps progress and weak-area labels owner-only, evidence-backed, read-time derived, and separate from Program corpus mutation.
- Complete Phase 2 of the Agonara product gap closure plan by implementing topic, concept, and material navigation across storage, Corpus domain commands, HTTP routes, `/learn` UI traversal, backup/restore validation, Product Intent traceability, and dashboard closeout.
- Implement Phase 4 of the topic, concept, and material navigation plan with `/learn` Curator navigation candidate management, Student topic/concept/material traversal, historical revision opening, material back links, protected-data redaction checks, Student Workspace non-mutation coverage, and desktop/mobile browser layout checks.
- Implement Phase 3 of the topic, concept, and material navigation plan with session-backed navigation candidate HTTP routes, curator acceptance/rejection routes, student-safe graph reads, historical revision reads, pagination, CSRF gates, and executable HTTP acceptance coverage.
- Implement Phase 2 of the topic, concept, and material navigation plan with navigation candidate commands, atomic acceptance of accepted corpus and relationship drafts, student-safe graph reads, authorization checks, and no-Student-state read boundaries.
- Switch the topic, concept, and material navigation plan to auto-continue mode after explicit user direction while keeping per-phase review and commit gates.
- Implement Phase 1 of the topic, concept, and material navigation plan with storage support for navigation corpus kinds, material-reference metadata, accepted relationships, prerequisite cycle rejection, and backup/restore graph validation.
- Add the topic, concept, and material navigation child implementation plan with exact storage/domain/HTTP/UI/test inventories, per-phase reviews, commit gates, dashboard closeout, and archive closure.
- Start Phase 2 of the Agonara product gap closure plan with a topic, concept, material, and relationship navigation spec that keeps accepted Program corpus separate from Student Workspace state.
- Complete and archive the Quick Check product UI plan with implemented spec traceability, INT-04 links, README/implementation-note status updates, browser layout/accessibility checks, and dashboard LOC closeout.
- Implement Phase 4 of the Quick Check product UI plan with Playwright-covered Student delivery reads, option-index submission, idempotent retry, owned attempt detail, and non-owner unavailable handling.
- Implement Phase 3 of the Quick Check product UI plan with Playwright-covered Curator candidate creation, draft/rejected listing, acceptance, rejection, and answer-key curation inspection confined to the Curator panel.
- Implement Phase 2 of the Quick Check product UI plan with Playwright-covered sign-in, session refresh/logout, Program context, role tabs, and signed-out action guards.
- Implement Phase 1 of the Quick Check product UI plan with a secret-free `/learn` shell route, stable product UI anchors, and absent out-of-scope learner expansion routes.
- Add the Quick Check product UI child implementation plan with exact files, routes, screens, Playwright tests, phase gates, DoD, dashboard LOC closeout, and archive closure.
- Start Phase 1 of the Agonara product gap closure plan with a Quick Check product UI spec and implemented-status traceability for the Quick Check HTTP API spec.
- Improve the Agonara product gap closure plan by requiring child implementation plans per phase, exact files/routes/screens/tests inventories, and Playwright-pinned UI validation before implementation starts.
- Tighten the Agonara product gap closure plan by requiring post-implementation self/adversarial review for every phase and adding the LOC dashboard refresh to final closeout.
- Harden the Agonara product gap closure plan after adversarial review by making it human-review-gated, adding a phase tracker, and requiring clean spec/ADR review before implementation code begins.
- Add the Agonara product gap closure plan, archiving the completed gap-closure plan and sequencing Quick Check UI, corpus navigation, learner-state interpretation, aggregate checks, membership flows, and LLM-assisted curation from review findings.
- Harden the Quick Check HTTP API after adversarial review by resolving sessions before CSRF on candidate acceptance/rejection and hiding non-owner attempt-detail access behind `attempt_not_found`.
- Implement the Quick Check HTTP API across curator candidate/acceptance routes, student-safe delivery, idempotent Student Workspace attempts, production composition coverage, out-of-scope route absence checks, and INT-04 traceability.
- Add the Quick Check HTTP API handoff with session-backed route contracts, answer-key redaction rules, strict TDD implementation phases, and INT-04 traceability.
- Refresh Agonara current-state docs so README, backlog, implementation notes, and Product Intent distinguish implemented backend/domain slices from deferred transport and product surfaces.
- Implement Agonara operational completion tracing across Identity, Program, Corpus, and Student Workspace HTTP routes with documented diagnostics payloads and redacted fault logging.
- Harden the Agonara gap closure plan after adversarial review by adding build gates, separating Quick Check HTTP implementation from handoff docs, and making operational spec drift a stop condition.
- Add the Agonara gap closure implementation plan, grounding production composition, operational tracing, docs drift, Quick Check transport, and deferred product-slice handoffs in review findings.
- Harden Phase 9 Quick Check closeout after adversarial review by proving the executable acceptance flow keeps the internal answer-key resolver off command, HTTP, CLI, and UI surfaces.
- Complete the Quick Check first-slice implementation with executable domain acceptance coverage, Product Intent traceability, final gate closeout, and the implementation plan archived under implemented plans.
- Harden Phase 8 Quick Check backup and restore after adversarial review by proving historical attempt idempotency across replacement revisions and rejecting duplicate restored idempotency scopes before mutation.
- Implement Phase 8 of the Quick Check first-slice plan with protected backup and restore support for candidates, accepted revisions, answer keys, attempts, matched results, historical references, redacted restored reads, and malformed graph rejection.

## 2026-06-02

- Harden Phase 7 Quick Check boundary tests after adversarial review with positive controls for public quick-check transport surfaces, internal answer-key resolver leaks, candidate-id leakage, and provider, queue, and human-review expansions.
- Implement Phase 7 of the Quick Check first-slice plan with integrated boundary isolation coverage across curator candidate, acceptance, delivery, Student submission, and owner-read flows plus deferred learner-state and public-surface absence guards.
- Harden Phase 6 Quick Check attempt reads after adversarial review by adding positive redaction controls for answer keys, per-option correctness metadata, curator metadata, and idempotency keys.
- Implement Phase 6 of the Quick Check first-slice plan with owner-only quick-check attempt detail and list reads, Student participation checks, accepted revision filter validation, and student-safe redacted attempt summaries.
- Implement Phase 5 of the Quick Check first-slice plan with Student Workspace quick-check submission, internal answer-key resolution after Student authorization, deterministic matched results, scoped idempotency, corrective attempts, and historical revision stability.
- Harden Phase 4 Quick Check delivery after adversarial review by extending delivery-read non-mutation coverage to candidate and accepted revision option rows.
- Implement Phase 4 of the Quick Check first-slice plan with student-only delivery listing and historical revision reads that return answerable options while redacting answer keys, curator metadata, provenance, and operational details.
- Harden Phase 3 Quick Check acceptance after adversarial review by covering replacement curation reads across current and historical revisions and proving adjacent domain counts stay unchanged during acceptance.
- Implement Phase 3 of the Quick Check first-slice plan with accepted quick-check entity creation, replacement revisions, historical curation reads, answer-key-inclusive curator summaries, and invalid state/target rejection coverage.
- Harden Phase 2 Quick Check curator lifecycle after adversarial review by making duplicate option-text normalization deterministic.
- Implement Phase 2 of the Quick Check first-slice plan with Program Curator candidate creation, validation, listing, rejection, answer-key-inclusive curator summaries, and Student/Admin-without-curator rejection coverage.
- Harden Phase 1 Quick Check storage after adversarial review by scoping option identifiers to owning candidates and revisions, enforcing selected-option graph integrity in SQLite, and rejecting malformed matched results.
- Implement Phase 1 of the Quick Check first-slice plan with storage substrate for candidates, accepted entities, accepted revisions, options, immutable attempts, option graph validation, selected-option validation, and scoped idempotency.
- Harden the Quick Check first-slice implementation plan after adversarial review by making internal answer-key resolver coverage explicit, correcting Curator/Corpus validation ownership, and separating docs closeout checks from RED/GREEN test steps.
- Add the Quick Check first-slice implementation plan, sequencing storage, curator lifecycle, accepted revision delivery, Student Workspace attempts, boundary isolation, backup/restore, executable acceptance, and archive closeout through strict TDD commits.
- Harden the quick-check first-slice spec after adversarial review with an explicit internal answer-key resolution boundary, deterministic query rejections, fault/log/transport redaction, and restore-time graph and matched-result validation.
- Specify the deterministic single-select quick-check first slice: Corpus Storage owns accepted options and protected answer keys, Student Workspace owns immutable idempotent attempts and matched evidence, and student-safe delivery projections exclude curator-only metadata.
- Harden ADR-016 after adversarial review with protected answer-key backup semantics, opaque student-facing option identifiers, bounded matched-or-not-matched result reads, and a current assessment decision trail.
- Accept ADR-016 for deterministic single-select quick checks: Corpus Storage owns versioned accepted questions and answer keys, Student Workspace owns immutable idempotent attempts and evidence, and learner-state interpretation remains deferred.
- Harden evaluator worker closeout after adversarial review with explicit final-evaluation restore rejection and positive controls for backup artifact detection.
- Complete the Student Workspace evaluator worker plan with restore-time unsafe-summary rejection, executable worker acceptance, Product Intent traceability, and archived-plan closeout.
- Complete Phase 6 of the Student Workspace evaluator worker plan after adversarial review expanded the out-of-scope surface guard with positive controls for queue, provider, raw-artifact, UI, learner-model, and topology expansions.
- Prove evaluator worker ownership boundaries with a successful adapter execution test that snapshots adjacent domains, checks the bounded request-only adapter contract, and guards against out-of-scope worker surfaces.
- Complete Phase 5 of the Student Workspace evaluator worker plan after adversarial review added explicit LLM-assisted completion-signature replay coverage.
- Implement redacted evidence and successful completion for the Student Workspace evaluator worker, keeping writes behind leased Student Workspace commands with duplicate-safe terminal rerun rejection and concurrent lease-state coverage.
- Complete Phase 4 of the Student Workspace evaluator worker plan after adversarial review expanded explicit output-validation coverage across malformed validation, criterion mismatches, blank summaries, redacted evidence, and LLM-assisted output.
- Implement provider output and budget gates for the Student Workspace evaluator worker, routing malformed adapter output, exceeded usage, rejected validation, unsafe feedback, and exhausted retries through governed job recovery.
- Complete Phase 3 of the Student Workspace evaluator worker plan after adversarial review added explicit malformed provider adapter coverage.
- Implement provider request construction for the Student Workspace evaluator worker, passing a redacted snapshot DTO to provider adapters only after claim, policy, and adapter resolution.
- Complete Phase 2 of the Student Workspace evaluator worker plan after adversarial review widened policy/adapter failure coverage across protected adjacent domains.
- Implement evaluator policy and provider adapter resolution for the Student Workspace evaluator worker, making post-claim execution fail closed on missing or malformed policy/adapter dependencies without provider calls.
- Harden the first evaluator worker implementation slice after adversarial review by adding explicit not-yet-due retry rejection coverage and marking Phase 1 complete in the implementation plan.
- Implement the first Student Workspace evaluator worker slice, adding the in-process worker command boundary for validated `single_job` and `claim_next` job claiming without provider execution.
- Harden the evaluator worker implementation plan after adversarial review by making phase-status commits mandatory and adding explicit RED/GREEN sequences to every phase.
- Add the Student Workspace open-answer evaluator worker implementation plan, sequencing the in-process worker through strict TDD phases for claiming, policy resolution, provider request redaction, output and budget gates, completion, boundary isolation, backup/restore, executable acceptance, and closeout.
- Harden the evaluator worker spec after adversarial review by making post-claim provider failures flow through Student Workspace retry/failure behavior, pinning claim-next ordering to the existing claimable-job query, and requiring evaluator policy retry policy to match the claimed job.
- Add the Student Workspace open-answer evaluator worker spec, defining the in-process single-run worker contract, evaluator policy shape, provider adapter boundary, output validation, budget enforcement, retry/failure handling, redaction, and executable acceptance expectations.
- Harden ADR-015 after adversarial review by defining evaluator worker, provider adapter, evaluator policy, and raw evaluator artifact terms before the decision rules rely on them.
- Accept ADR-015 for the open-answer evaluator worker/provider boundary: workers and provider adapters execute behind Student Workspace jobs, while prompt construction, output validation, raw-artifact handling, provider credentials, budget policy, and final feedback acceptance stay governed by explicit Student Workspace rules.
- Complete the Student Workspace evaluator orchestration plan with backup/restore preservation, malformed restore rejection, executable job acceptance coverage, Product Intent traceability, and archived-plan closeout.
- Harden Phase 6 evaluator orchestration recovery after adversarial review by explicitly covering retry-waiting cancellation and rejecting impossible storage recovery state combinations.
- Implement Phase 6 evaluator orchestration recovery so worker failures, retries, cancellations, and expired leases clear active leases, preserve attempt snapshots, and keep stale workers from mutating terminal jobs.
- Harden Phase 5 evaluator orchestration completion after adversarial review by retaining an internal terminal completion signature so idempotent replays reject changed lease, worker, provider usage, or output validation.
- Implement Phase 5 evaluator orchestration completion so leased jobs atomically become final Student Workspace feedback with budget checks, LLM output validation, lease clearing, and duplicate-safe idempotency.
- Implement Phase 4 evaluator orchestration evidence so worker evidence writes require an active matching unexpired lease while reusing redaction and validation rules.
- Implement Phase 3 evaluator orchestration leases so Student Workspace can claim waiting or due retry jobs, renew active leases, read redacted job state, and list bounded claimable jobs.
- Implement Phase 2 evaluator orchestration scheduling so Student Workspace can turn submitted or failed open-answer attempts into waiting evaluator jobs with retry/budget policy validation and prior-failure preservation.
- Harden Phase 1 evaluator orchestration storage after adversarial review by rejecting leased jobs without leases and validating lease update/clear helper inputs before SQLite writes.
- Start the Student Workspace evaluator orchestration implementation with Phase 1 storage substrate: separate job status on evaluator runs, retry/budget policies, lease fields, claimable reads, and raw-artifact exclusion.
- Harden the Student Workspace evaluator orchestration plan after adversarial review by separating orchestration job status from the existing evaluator-run lifecycle and treating traceability/archive checks as docs gates.
- Add the Student Workspace open-answer evaluator orchestration implementation plan, sequencing job storage, scheduling, leases, leased evidence, idempotent completion, recovery paths, backup/restore, and executable closeout through strict TDD commits.
- Harden the Student Workspace evaluator orchestration spec after adversarial review by resolving exhausted-retry behavior and making LLM output validation an explicit completion gate.
- Add the Student Workspace open-answer evaluator orchestration spec, defining job scheduling, leases, retries, cancellation, timeout recovery, completion idempotency, budget gates, and redaction boundaries.
- Harden ADR-014 after adversarial review by clarifying how orchestration jobs relate to the implemented evaluator-run records and when leases become mandatory.
- Accept ADR-014 for Student Workspace evaluator orchestration: evaluator jobs own leases, retries, cancellation, timeout recovery, and provider/human handoff boundaries before worker implementation.
- Harden Student Workspace evaluator backup restore after adversarial review by validating restored reviewer attribution, attribution Identity references, evidence visibility, and unsafe redacted summaries before import.
- Complete the Student Workspace evaluation status/evidence plan with evaluator-run backup/restore preservation, restored-graph validation, executable domain acceptance, Product Intent traceability, and archived-plan closeout.
- Harden Student Workspace evaluation status/evidence reads after adversarial review by rejecting unsafe redacted evaluator summaries before they can be persisted and later exposed.
- Implement owner-only Student Workspace evaluation status and evaluator evidence reads with private non-owner errors, terminal-run omission, redacted evidence metadata, and final evaluation/failure detail coverage.
- Harden evaluator-run terminal transitions after adversarial review with transaction-boundary run-status regression coverage for completion, failure, and cancellation.
- Implement evaluator-run terminal transitions for completion, failure, and cancellation with final-evaluation compatibility, active-failure recording, prior-failure restoration, and terminal conflict coverage.
- Harden evaluator evidence recording after adversarial review by revalidating running-run state inside the evidence-write transaction.
- Implement redacted evaluator evidence recording for running open-answer evaluator runs with internal-only metadata, malformed-input rejection, terminal-run conflicts, and raw-artifact exclusion coverage.
- Harden evaluator-run starts after adversarial review by mapping persisted running-run conflicts to domain rejections and revalidating mutable attempt and Identity preconditions inside the transaction.
- Implement governed evaluator-run starts for submitted and retryable failed open-answer attempts with attribution validation, accepted-revision snapshots, and atomic prior-failure preservation.
- Harden the evaluator-run storage substrate after adversarial review with database-enforced scalar attempt snapshots and restore cleanup that removes evaluator evidence and runs before attempts.
- Start the Student Workspace evaluation status/evidence implementation with the Phase 1 persistence substrate: evaluator-run snapshots, lifecycle status updates, one-running-run enforcement, internal redacted evidence metadata, and structural storage guards.
- Harden the Student Workspace evaluation status/evidence implementation plan after adversarial review by making transitions atomic, snapshotting prior failures before run start, enforcing one running run per attempt, preserving legacy evaluating-backup compatibility, clarifying raw-artifact omission, and covering terminal-run query omission.
- Add the Student Workspace evaluation status/evidence implementation plan, sequencing evaluator-run persistence, domain transitions, redacted evidence, owner-only reads, backup/restore, and executable closeout through strict TDD commits.
- Harden the Student Workspace evaluation status/evidence spec after adversarial review by separating internal evaluator path kind from final evaluation summary kind and removing an undefined queued state.
- Add the Student Workspace open-answer evaluation status and evidence spec, defining internal evaluator runs, redacted evidence metadata, owner-only status reads, and no public evaluation mutation surface.
- Harden ADR-013 after adversarial review by making automated evaluator and human reviewer attribution explicit for future auditability.
- Accept ADR-013 for Student Workspace open-answer evaluation governance: evaluator paths remain governed Student Workspace behavior, LLM/human evidence is bounded, and long-running evaluation must be explicit.
- Archive the Student Workspace open-answer attempt HTTP API plan with executable STU-12/STU-13/INT-05 HTTP acceptance coverage and implemented Product Intent traceability.
- Harden Student Workspace open-answer attempt HTTP listing after adversarial review by making cursor route keys collision-resistant across owner, Program, status, and check filter components.
- Implement Student Workspace open-answer attempt HTTP listing with owner/program scoping, Student participation enforcement, status and check filters, bounded pagination, cursor-scope rejection, and cursor/fault redaction coverage.
- Harden Student Workspace open-answer attempt HTTP detail reads after adversarial review by extending redaction coverage across evaluated and evaluation-failed detail responses plus evaluator diagnostics and database URL fault probes.
- Implement Student Workspace open-answer attempt HTTP detail reads with owner-only access, evaluation/failure detail coverage, private non-owner `404` behavior, and redaction coverage.
- Harden Student Workspace open-answer attempt HTTP submission after adversarial review by proving accepted responses hide idempotency keys and non-mutation coverage only passes after a real accepted attempt.
- Implement Student Workspace open-answer attempt HTTP submission with strict body validation, effective Student authorization, accepted revision snapshots, idempotent retries, conflict handling, and adjacent-state non-mutation coverage.
- Harden the Student Workspace open-answer attempt HTTP API route substrate after adversarial review with JSON body classification and complete first-slice rejection status mapping.
- Start the Student Workspace open-answer attempt HTTP API implementation with the Phase 1 route substrate: guarded attempt route recognition, session/CSRF checks, idempotency-header validation, rejection status mapping, and fault redaction coverage.
- Harden the Student Workspace open-answer attempt HTTP API implementation plan after adversarial review by requiring archive-relative link repair and implemented-plan traceability during closeout.
- Add the Student Workspace open-answer attempt HTTP API implementation plan, sequencing route substrate, submission, owner-only detail, owner-only listing, executable acceptance, and archive closeout through strict TDD phase commits.
- Harden the Student Workspace open-answer attempt HTTP API spec after adversarial review by correcting feedback traceability so only the detail route promises evaluation or failure detail.
- Add the Student Workspace open-answer attempt HTTP API spec, carrying the implemented domain contract into session-backed Student submission and owner-only read routes with CSRF, idempotency, pagination, redaction, and no UI or evaluation mutation surface.
- Harden the Student Workspace plan archive after adversarial review by completing INT-05 code and test traceability for the delivered domain and backup/restore slice.
- Archive the completed Student Workspace open-answer attempt implementation plan and update INT-05 traceability to include the delivered plan.
- Complete Student Workspace open-answer attempt backup/restore and executable acceptance coverage with restored idempotency keys, evaluation/failure state, and orphan accepted-revision graph rejection.
- Implement Student Workspace owner-only open-answer attempt reads with detail/list queries, scoped filters, response redaction, and first-slice surface absence coverage.
- Harden Student Workspace open-answer evaluation lifecycle after adversarial review by clearing stale failure state on evaluation retry transitions and expanding validation/redaction coverage.
- Implement Student Workspace open-answer evaluation lifecycle commands with internal evaluating, evaluated, and failure transitions plus criterion-snapshot feedback validation.
- Harden Student Workspace open-answer submission after adversarial review with explicit curator-denial, per-student idempotency scope, and idempotency-key redaction coverage.
- Implement Student Workspace open-answer attempt submission with effective Student authorization, accepted revision snapshots, immutable trimmed answers, and scoped idempotency handling.

## 2026-06-01

- Harden the Student Workspace open-answer attempt storage substrate after adversarial review with database-enforced scoped idempotency and restore cleanup for attempt child records.
- Start the Student Workspace open-answer attempt implementation with the Phase 1 persistence substrate: attempt, evaluation, failure, status, idempotency, and accepted-revision graph storage helpers.
- Harden the Student Workspace open-answer attempt implementation plan after adversarial review by adding explicit phase status gates and clarifying docs-only closeout behavior.
- Add the Student Workspace open-answer attempt implementation plan, sequencing storage, idempotent submission, evaluation lifecycle, owner-only reads, backup/restore, and executable acceptance through strict TDD phase commits.
- Harden the Student Workspace open-answer attempt spec after adversarial review by narrowing first-slice evaluator kinds, using `attempt_already_evaluating`, and avoiding private attempt existence leaks for non-owners.
- Add the Student Workspace open-answer attempt first-slice spec, defining submitted answer attempts, evaluation outcomes, idempotent submission, accepted revision references, owner-only reads, backup/restore rules, and out-of-scope boundaries.
- Harden ADR-012 after adversarial review by making submission idempotency consistently client-keyed and rejecting conflicting idempotency-key reuse.
- Accept ADR-012 for the Student Workspace open-answer attempt lifecycle: attempts, submitted answers, evaluation outcomes, and feedback stay personal student state while referencing accepted check and criterion revisions.
- Harden the accepted checks and assessment criteria HTTP API after adversarial review with explicit mutation CSRF, malformed-body, pagination, cursor-scope, authorization, and fault-redaction adapter coverage.
- Complete the accepted checks and assessment criteria HTTP API with session-backed criterion and open-answer check curation, accepted revision reads, strict transport validation, snapshot preservation, executable HTTP acceptance, and archived-plan closeout.
- Add the accepted checks and assessment criteria HTTP API implementation plan, sequencing strict-TDD route delivery over the existing Corpus adapter through criterion and open-answer check curation, accepted revision reads, redaction, boundary guards, and executable closeout.

## 2026-05-30

- Add the accepted checks and assessment criteria HTTP API spec, carrying the implemented domain contract into session-backed routes with CSRF, pagination, redaction, authorization, and Student Workspace exclusion requirements.

## 2026-05-28

- Complete the accepted checks and assessment criteria first slice with assessment backup/restore preservation, restore graph validation, an executable criterion-to-check lifecycle, and archived plan closeout.
- Add executable boundary hardening for accepted assessment criteria and open-answer checks, proving draft/rejected candidates stay out of accepted reads while Student Workspace, scoring, feedback, LLM, and review surfaces remain absent.
- Harden the accepted open-answer check lifecycle after adversarial review by rejecting malformed source/criterion reference arrays and proving Admin-without-curator cannot accept or reject check candidates.
- Implement the accepted open-answer check lifecycle over Corpus Storage: curator-owned check candidates, required criterion references, acceptance into current/historical check revisions, criterion revision snapshotting, rejection, accepted check reads, and redacted response coverage.
- Harden the accepted assessment criterion lifecycle after adversarial review by authorizing acceptance before candidate state disclosure and rejecting malformed `sourceIds` input.
- Implement the accepted assessment criterion lifecycle over Corpus Storage: curator-owned draft candidates, acceptance into stable current/historical revisions, rejection, accepted criterion reads for Student/Curator/Admin callers, and redacted response coverage.
- Harden the accepted checks storage substrate after adversarial review by clearing assessment tables during pre-Phase-5 restores and adding criterion/check candidate status update helpers.
- Start the accepted checks and assessment criteria implementation with the Phase 1 storage substrate: criterion/check candidate records, accepted entity/revision records, current-revision updates, criterion revision references, and structural Program scoping checks.
- Harden the accepted checks and assessment criteria implementation plan after adversarial review by clarifying Corpus Storage ownership and marking student feedback traceability as prerequisite-only.
- Add the accepted checks and assessment criteria implementation plan, sequencing storage, criterion lifecycle, open-answer check lifecycle, Student Workspace exclusion, backup/restore, and executable acceptance through strict TDD phases.
- Harden the accepted checks and assessment criteria spec after adversarial review by requiring criterion references on open-answer checks, tightening read-surface wording, and adding explicit status-filter rejection coverage.
- Add the accepted checks and assessment criteria first-slice spec, choosing open-answer checks as the narrow first check shape while preserving accepted criterion revisions and excluding Student Workspace attempts and feedback.
- Harden ADR-011 after adversarial review by clarifying future Assessment module evolution and requiring traceability plus verification for checks, criteria, attempts, feedback, and progress evidence.
- Accept ADR-011 for the accepted checks and Student assessment boundary: accepted checks and criteria belong to versioned Program corpus, while attempts, answers, feedback, mastery, weak areas, and progress evidence belong to Student Workspace.
- Harden the Corpus HTTP API closeout after adversarial review by asserting transport status codes across the executable Corpus flow and CSRF rejection checks.
- Complete the Corpus HTTP API implementation closeout with an executable HTTP acceptance flow, Product Intent traceability to the implemented route adapter/tests, and the implementation plan archived under implemented plans.
- Harden the Corpus event HTTP API after adversarial review by adding fault-response redaction coverage for session, credential, SQL, filesystem path, and database URL leak sentinels.
- Complete the Corpus HTTP API event route phase with curator-only Program-scoped event reads, route-specific Corpus event response shape, bounded pagination, cursor redaction coverage, domain-only reasons, and out-of-scope surface guards.
- Harden the accepted corpus HTTP API after adversarial review by covering disabled sessions, unknown Programs, filter-scoped cursors, and Student/Curator/Admin historical revision reads.
- Complete the Corpus HTTP API accepted corpus read phase with Student/Curator/Admin authorization, accepted-kind filtering, bounded pagination, current-revision listing, historical revision lookup, and draft/rejected candidate exclusion coverage.
- Harden the Corpus acceptance/rejection HTTP API after adversarial review by rejecting unknown acceptance body fields and covering rejected Corpus events for resolved acceptance/rejection failures.
- Complete the Corpus HTTP API acceptance/rejection route phase with explicit curator-only state transitions, CSRF-before-mutation checks, target validation, current-revision replacement, historical revision preservation, and Corpus event coverage.
- Harden the Corpus candidate HTTP API after adversarial review by adding route-specific default pagination coverage and rejecting non-string source identifiers as malformed request input.
- Complete the Corpus HTTP API candidate route phase with curator-only candidate listing/creation, status-filtered pagination, CSRF-before-mutation coverage, source ownership rejection mapping, and draft isolation from accepted corpus.
- Complete the Corpus HTTP API Program source route phase with HTTP coverage for Program-scoped source listing, curator-only access, unknown Program rejection, CSRF-before-mutation behavior, accepted source creation events, and source validation failures.
- Start the Corpus Storage and Curator Acceptance HTTP API implementation with the Phase 1 transport substrate: dedicated worktree preflight, Corpus command composition, session-backed source route dispatch, Corpus status mapping, shared list pagination, and strict Corpus JSON body classification.
- Add the Corpus Storage and Curator Acceptance HTTP API implementation plan, sequencing the route adapter work through strict TDD phases for shared transport helpers, source routes, candidate routes, acceptance/rejection, accepted corpus reads, Corpus events, and executable closeout.
- Harden the Corpus Storage and Curator Acceptance HTTP API spec after adversarial review by removing backup-only rejection reasons from the HTTP contract, making rejection request-body handling explicit, and bounding all Corpus list routes with opaque cursors.
- Add the Corpus Storage and Curator Acceptance HTTP API spec, carrying the implemented domain contract into session-backed routes, CSRF enforcement, response envelopes, redaction, scoped event and candidate pagination, and executable acceptance scenarios.
- Harden the Corpus acceptance implementation after adversarial review by adding rejected Corpus events for resolved state/target failures and rejecting restore graphs where accepted revisions point to missing entities or unaccepted candidates.
- Complete the Corpus Storage and Curator Acceptance first slice with executable domain acceptance coverage, draft/rejected isolation and out-of-scope surface guards, and archived implementation-plan closeout.
- Harden Corpus event queries and response redaction: Program Curator access is required, events remain Program-scoped read-only records, rejected acceptance/rejection commands are recorded when actor and Program resolve, and Corpus responses stay free of secret/session/infra details.
- Extend Agonara backup/restore to preserve Program sources, Corpus candidates, accepted corpus entities/revisions, and Corpus events, while rejecting invalid accepted-corpus graphs before restore.
- Implement explicit Corpus candidate acceptance into stable accepted entities and revisions, including current-revision replacement, historical revision reads, and accepted-corpus read authorization.
- Implement Curator Workspace candidate creation, listing, and rejection over the Corpus boundary, preserving draft/rejected candidate separation and candidate Corpus events.
- Implement the first Corpus command/query boundary for Program source recording and listing, including effective curator authorization, validation, source persistence, and Corpus source events.
- Implement the Corpus Storage persistence substrate for Program sources, Corpus candidates, accepted corpus entities/revisions, and Corpus events, with storage-level Program scoping and current-revision integrity checks.
- Add the Corpus Storage and Curator Acceptance first-slice implementation plan, sequencing storage, source, candidate, acceptance, backup/restore, event, and executable acceptance work through strict TDD phases with per-phase green-gate commits.
- Add the Corpus Storage and Curator Acceptance first-slice spec, defining source records, curator topic/concept candidates, explicit acceptance into stable accepted revisions, accepted corpus reads, and required tests.
- Accept ADR-010 for the Corpus Storage / Curator Workspace boundary: accepted Program corpus and stable accepted revisions belong to Corpus Storage, while drafts, candidates, LLM suggestions, and review state remain in Curator Workspace until explicit curator acceptance.
- Implement the Program Shell and Membership HTTP API, covering session-backed Program shell routes, Student membership join/leave/rejoin, effective participation checks, scoped event pagination, and executable acceptance coverage.
- Harden the Program Shell and Membership HTTP API implementation plan after adversarial review by fixing mandatory heading order and making early status/session coverage explicit.
- Add the Program Shell and Membership HTTP API implementation plan, sequencing the route adapter work through strict TDD phases with per-phase green-gate commits and explicit done criteria.

## 2026-05-27

- Harden the Program Shell and Membership HTTP API spec by separating domain event rejection reasons from transport rejections, restoring effective-participation denial coverage, and tightening malformed JSON and traceability expectations.
- Add the Program Shell and Membership HTTP API spec, carrying the implemented domain contract into session-backed routes, CSRF enforcement, response envelopes, redaction, event pagination, and executable acceptance scenarios.
- Implement the Program Shell and Membership first slice: `createProgramShell` with atomic initial curator membership, `joinSelfJoinProgram` / `leaveStudentProgram` with active/left/removed transitions and idempotent active-join + rejoin reuse, read-only `getEffectiveParticipation`, Program and Program Membership event queries with Admin-or-curator authorization, and backup/restore coverage that refuses orphan Program shells without active curator participation.
- Restyle the Admin operations UI board to match the `docs/my-way/landing.html` dark, mono-accented look (palette, typography, hero pill, surface cards) while preserving every structural marker the admin-board HTTP tests assert on.
- Implement the private Admin operations UI board on `/admin`, covering first-Admin bootstrap, sign in/out, identity creation, local credential binding, disablement, Admin grant/revoke, operational access inspection, and audit event inspection through the existing Identity API.
- Add the Program Shell and Membership first-slice spec, translating ADR-009 and membership ADRs into command/query contracts, behavior rules, and required tests.
- Accept ADR-009 for Program shell ownership and initial curator participation: active identities can create self-join Program shells, Corpus Storage owns the shell, and Program Membership establishes initial curator participation.
- Update Agonara traceability links to point at the implemented Identity and Operations plan after closeout.
- Add the Admin operations UI board implementation plan, scoping the next Agonara slice to a thin private-instance board over the existing Identity HTTP API.
- Add packaged-bin CLI acceptance coverage and extend the Docker CI smoke to bootstrap the first Admin through the containerized HTTP API, fixing the CLI symlink entrypoint guard uncovered by that test.
- Update the Agonara README so the implemented Identity and Operations slice is directly runnable through CLI, HTTP, and Docker demo paths instead of still reading as design-only.
- Fix the Agonara CI Docker smoke so the runtime receives the required bootstrap secret while keeping local runtime fail-fast behavior intact.
- Complete the Identity and Operations first-slice implementation with executable acceptance coverage across CLI bootstrap, HTTP sessions, Admin flows, CSRF, rate limiting, request correlation, audit listing, and redaction.
- Add the minimum Identity backup/restore path for identities, local password credentials, Admin authorities, and audit history, while excluding active sessions and rejecting no-Admin restores.
- Add the first `agonara identity` operator CLI for bootstrap status and first-Admin bootstrap, with JSON stdin for secrets, JSON stdout envelopes, and defined exit codes.
- Add the first Identity HTTP API routes for bootstrap status, bootstrap, login, session resolution/logout, Admin identity creation, audit listing, CSRF, rate limiting, secure session cookies, and Admin diagnostics.
- Add Admin-protected Identity commands for identity creation, local password binding, disablement, Admin grant/revoke, operational access inspection, identity listing, and audit listing.
- Implement the Identity core commands for first-Admin bootstrap, local-password login, session resolution, and logout, including scrypt password hashes, seven-day server-side sessions, and bootstrap audit events.
- Add the Identity storage boundary with SQLite-backed schema initialization, credential uniqueness checks, session revocation state, audit event append/list behavior, and last-effective-Admin protection.
- Add the operational walking skeleton: request ID propagation, unauthenticated health, unauthenticated diagnostics rejection, structured completion logs, and redacted fault responses.
- Start implementation with the Agonara backend workspace skeleton, per-project CI handoff, and Docker container-start smoke path.
- Close docs handoff gaps by making Dockerized private self-hosting an explicit implementation gate and registering Agonara in the repo dashboard surfaces.
- Harden the Identity and Operations implementation plan with explicit substrate assumptions, dependency API verification, direct ADR links, and executable diagnostics sequencing.
- Add the Identity and Operations first-slice implementation plan, sequencing Agonara identity, API/CLI, operational, backup/restore, and executable acceptance work behind explicit process gates.
- Harden the operational cross-cutting spec with concrete request ID validation, diagnostics rejection mapping, coarse diagnostic reasons, required log correlation, and bounded component names.
- Add the v0.0.1 operational cross-cutting spec so request IDs, diagnostic logs, health, diagnostics, redaction, and audit/log boundaries have an implementation handoff.
- Harden the Identity & Role Management API/CLI spec with audit-event shape, JSON stdin bootstrap, login disclosure protection, and auth rate-limit contracts.
- Add the Identity & Role Management API/CLI spec so first-slice implementation has explicit HTTP, operator CLI, and executable acceptance contracts.
- Add the Identity & Role Management v0.0.1 implementation spec, translating accepted identity/Admin/auth ADRs into command, query, state, test, and done-criteria handoff.
- Remove version suffixes from active and archived Agonara Markdown filenames while preserving front-matter versions, reducing reference churn from routine document updates.
- Accept ADR-008 for first-slice authentication, session, credential binding, and first-Admin bootstrap boundaries so Identity & Role Management can move toward implementation planning.
- Move accepted Agonara ADRs into `agonara/docs/adr/` so project architecture decisions live with the rest of the Agonara documentation tree.
- Accept ADR-007 for the effective participation authorization contract: Student, Curator, Admin, and future application services must ask Program Membership for allowed/denied participation instead of reading membership policy internals.
- Contain the ADR-006 follow-up: Program Membership Manager remains in the membership decision trail, while student, curator, and admin story catalogs stay at their existing versioned ownership boundaries.
- Accept ADR-006 for Program Membership policy actor: Program Membership Manager is narrative only, v0.0.1 Student self-join is allowed for active identities, and no new grantable role is added.
- Park the Program Membership Manager rationale in `under-consideration/` and add a peer review identifying the role-vs-narrative ambiguity as the blocking decision before the module map, Pre-ADR, story catalogs, and ADR-002 (or a new ADR) are revised. Track parked docs and their gating decisions in `backlog.md` so the folder does not go stale.
- Accept ADR-005 for Program Membership state and first admission policy: Students can join self-join Programs, rejoining after leave reuses membership history, and Program Curator self-join stays closed for the first implementation.
- Align admin and identity docs with ADR-004: product participation is now described as Program Membership-owned, while Identity & Role Management keeps identity, credentials, Admin authority, audit, and recovery primitives.
- Accept ADR-004 for Program Membership ownership: participation lifecycle and policy now belong to a separate module, with effective Student and Program Curator authority backed by membership grants.
- Add Program Membership Pre-ADR to pressure-test the separate module, opaque membership policy boundary, and unresolved role/membership authority contract.
- Add Program Membership to the module responsibility map as a peer module owning participation lifecycle, policy, invitations, visibility, and exceptional recovery hooks.
- Add Program Membership stories across student, curator, and admin catalogs so participation lifecycle, invitation, recovery, and audit gaps are explicit.
- Accept ADR-003 for Agonara admin recovery: private instances must retain effective Admin control and audit sensitive identity-management operations.
- Accept ADR-002 for Agonara role scope: product roles are Program-scoped, Admin is instance-scoped operational authority, and credentials grant no roles.
- Accept ADR-001 for Agonara identity ownership: internal Identity is now the stable subject for ownership, action, attribution, and authorization context.
- Tighten admin story traceability: Product Intent now points at module map v0.3.1, and the module map names ADM-01 through ADM-11 as Identity & Role Management drivers.
- Add admin user stories (v0.1.0) and link them from Product Intent (v0.3.0) and the identity first-slice Pre-ADR (v0.2.1), closing the admin traceability gap.
- Align Agonara docs with My Way audit: Product Intent (v0.2.0), story catalogs (v0.2.0), deployment target (v0.2.0), Pre-ADR framing, research notes (v0.2.0), and supporting metadata now expose required structure and traceability.
- Improve module responsibility map (v0.3.0): refine module boundaries, ownership rules, embedded behaviors, and cross-cutting responsibilities.
- Develop identity & role management first slice (v0.2.0): authorization principles, identity lifecycle, capabilities table, consistency rules, deferred decisions.

## 2026-05-26

- Seed agonara project: product intent (learning program app with curator/student separation), curator and student user stories, module responsibility map (four modules: Corpus Storage, Curator Workspace, Student Workspace, Identity & Role Management), identity & role management first slice, deployment decision (dockerized private self-hosted), implementation notes (identity/auth mapping sketch), brand briefs (EN + RU).
