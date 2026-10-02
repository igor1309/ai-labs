---
instructions: Keep entries concise, outcome-focused. Don't mirror git commits. List major accomplishments in reverse chronological order (newest first). Focus on what was achieved and why it matters, not how.
---

# Log

## 2026-10-02

- **worktree v0.2.2 (marketplace v1.67.0)**: new branches no longer track their
  base. A branch cut from `origin/trunk` used to get it as upstream, which made a
  plain first `git push` fail (names differ) and kept `push.autoSetupRemote`
  from creating the same-named remote branch. Now, with
  `push.autoSetupRemote=true`, the first `git push` does that.

## 2026-08-28

- **doc-discipline v1.1.0 (marketplace v1.66.0)**: the prose-economy test that
  governed a new document now governs an edit to an existing one. An added
  section must name a rule that no existing section carries, or its content
  belongs inside an existing section — or nowhere. `Known issues` and `Caveats`
  fail by construction: nothing has been observed to break, so the section
  states what might. The check is on the diff, which either adds no heading line
  or comes with a commit message naming the rule the new heading carries. This
  closes the gap that let amendments accrete headings no reader needs.

## 2026-08-24

- **skill-review renamed to skill-conventions, v2.0.0 (marketplace v1.65.0)**:
  the published skill now owns the whole reusable skill-business lifecycle, not
  just the audit half. It absorbed the generic conventions — taxonomy and DoD,
  how-to-not-log, hook/skill/script, script rules, `backlog/` and `adr/` layout,
  frontmatter gates — from the Fora `ios.config` repo-local skill of the same
  name, now deleted, with that repo's specifics moved to its `.claude/AGENTS.md`.
  The ten-axis review method moved to `references/review-method.md` behind a
  gated link, leaving SKILL.md at 189 lines; review is now an explicit mode that
  reports a change plan without editing files. A plant-and-detect dry-run
  returned all eight planted defects, invented none, and left the clean control
  untouched. `postmortem` v0.1.2 re-points its cross-link.

## 2026-08-21

- **Three new skills — code-review-discipline v1.0.0, background-task-liveness
  v1.0.0, doc-discipline v1.0.0 (marketplace v1.64.0)**: each is the procedural
  half of a global rule that previously carried both the rule and its recipe.
  `code-review-discipline` covers self-review before declaring work done, the
  evidence bar a fail/warning must clear, and turning findings into a plan;
  `background-task-liveness` covers which signal to poll per work type, telling a
  slow run from a wedged one, and keeping monitor state across a teardown;
  `doc-discipline` covers doc shape and the cold-reader pass, prose economy, link
  direction, what to cite instead of a topic-branch SHA, and log entries. The
  rules now state the constraint and point here for the how.
- **Publishing correction**: all three were authored directly in the installed
  marketplace checkout (`~/.claude/plugins/marketplaces/dev-skills`) rather than
  in `dev-skills/public/`, so they existed only on that machine and would have
  been erased by the next plugin auto-update. Ported into the source repo
  unchanged apart from the `version` front-matter the install-dir copies were
  missing.
- **strict-tdd v1.0.2 (marketplace v1.64.1)**: the "compilation errors are not
  RED" rule lived in two places — this skill carried the prohibition, the
  always-on `general.md` rule in `~/.claude/rules/` carried the prohibition plus
  the positive definition of RED. Two copies, and the incomplete one was the one
  a TDD session loaded. Folded the definition into the skill's bullet and deleted
  the rule line, so the rule lives in exactly one place and fires on the trigger
  that makes it meaningful.

## 2026-08-17

- **worktree v0.2.1**: made clean-status verification an explicit setup gate and
  documented shared-config discovery for both conventional and Codex-managed
  worktree layouts. Agents now stop on setup-owned status entries instead of
  beginning implementation in a polluted worktree. Published together with the
  other skill-progression changes as marketplace v1.61.0.
- **pr-ci-watch v1.4.0**: split non-green outcomes into failed checks, blocked
  merge gates, missing check registration, and shell pipelines that mask a
  producer's exit status. Each signal now leads to a distinct diagnostic, so a
  missing workflow or approval is no longer reported as a generic CI failure.
- **skill-review v1.6.0**: added an instruction-interference axis for conflicts,
  duplicated behavioral weighting, workflow rules that override direct user
  requests, and unnecessary clarification despite defined defaults. Extended
  behavioral dry-runs with a scenario-and-observe harness for interaction-driving
  skills, grounded in the intake v2.0 regressions that prose-only review treated
  too easily as ordinary noise.

## 2026-08-12

- **Removed state-machine-spec-dod and state-machine-impl-dod**: both checklists
  encode one repo's state-machine conventions — paired state/effect tests,
  `test_<action>_should<Assert>_on<Setup>` naming, reducer- and effect-handler
  spy protocols — so they read as cross-repo skills while only ever applying to
  the repo that has those patterns. Moved to `ios.config`'s `.claude/skills/`,
  beside `rx-state-machine-development`, which is where the conventions they
  check are defined. Same reasoning as the earlier `swift-package-manifest`
  move. Marketplace v1.60.0.

## 2026-08-07

- **intake v2.0.0**: the skill had grown to 1666 words, the largest in the
  collection, and roughly a third of it was the same rules said twice — a
  `Core Principle` block, a `Hard Rules` block, and an `Anti-Patterns` block
  that announced itself as a restatement of `Hard Rules`. Repetition is not
  free: it weights avoidance of named failure modes over doing the work.
  Removed both duplicate blocks and `Large-Scope Mode`, whose numeric trigger
  ("12-15 evidence bullets") and mandated verbatim sentence turned judgment
  into form-filling. Three instructions actively degraded the agent and are
  gone: refusing to answer when the user asks how they would implement it (a
  skill phase does not outrank the user), asking questions strictly one at a
  time when `AskUserQuestion` batches four, and asking where to save the brief
  instead of defaulting the path. Also resolved a contradiction — "do not
  create any files" versus Phase 4's required write — and corrected the stale
  `Task` tool name to `Agent`. 939 words, same four phases. Published as
  marketplace v1.59.0.

## 2026-08-06

- **worktree v0.2.0**: the config-sync script linked shared config into a
  worktree and stopped there, but a link only stays invisible if the consuming
  repo also excludes its name — and nothing creates that pattern. A missing one
  failed silently: the link showed as untracked in every `git status` from then
  on, and the fix (`.git/info/exclude`) was tribal knowledge. The script now
  reports every managed link git does not ignore, naming the entries and the
  exclude file to append them to. It checks all managed links, not just ones
  created on the current run, so a long-standing omission still surfaces;
  tracked entries are exempt. Advisory only — it never edits git state and
  never changes the exit code. Published as marketplace v1.58.0.

## 2026-07-24

- **debug-print v1.1.0**: the skill told the agent to add prints and wait for
  pasted console output, with nothing said about whether that output can exist.
  `debugPrint` goes to stdout, which is discarded unless the launch attaches a
  console or redirects it — so a "launch and leave" or a UI-automation driver
  yields an empty log that reads exactly like code that never ran. The skill now
  requires handing back to unified logging instead of instrumenting a run nobody
  can observe. Published as marketplace v1.57.0.

## 2026-07-08

- **skill-review v1.5.0**: promoted the drafted "Folder shape" axis (§9,
  skills with supporting files only) from the skill's backlog — supporting
  files should be bucketed by loading contract (`scripts/` run for output,
  `references/` read on demand, `assets/` inert), a convention three canonical
  layout sources converge on; triggers only above a couple of unbucketed
  files, a single loose file is a comment at most. Explicit axis-9 verdict
  added to the output format. `backlog/` is now empty and removed; skill
  backlog fully drained. Published as marketplace v1.56.0.
- **skill-review v1.4.0**: promoted the drafted "Failure observability" axis
  (§8, script-driving skills only) from the skill's backlog into Evaluation
  Axes — a skill must surface non-zero script exits mechanically, not depend
  on the agent narrating them — with an explicit axis-8 verdict required in
  the output format. Origin: the Poeme add-module experiment, where a failing
  wiring script was silently hand-fixed on every run and each run still
  reported PASS. `backlog/backlog.md` removed as shipped; the folder-shape
  axis draft (`backlog/folder.md`) remains open. Published as marketplace v1.56.0.
- **pr-ci-watch v1.3.0**: added the long-planned run-level watching section —
  `gh run watch <run-id> --exit-status` for tag-triggered release/deploy
  workflows, post-rerun streaming, and single-run scenarios, with the same
  redirect/exit-code/timeout discipline as the PR-level watch and a ~20s
  wait-before-`gh run list` race note. `gh pr checks --watch` remains the
  default for PR greenness. Closes `pr-ci-watch/TODO.md` (removed); validated
  by the same-day foliotell 0.0.3/0.1.0 release sessions, which used exactly
  this pattern. Published as marketplace v1.56.0.
- **using-dev-skills v1.0.3**: split the "bug report" ladder cue — analysis-only
  asks route to Debugging (bug-analysis), while bug reports with a fix/deploy
  request are delivery work investigated inline, not an analysis-report skill.
  Motivated by a foliotell session where `bug-analysis` was invoked against its
  own "do not use when a fix is requested" guard. Published as marketplace v1.56.0.

## 2026-06-29

- **skill-review v1.3.0** (marketplace v1.55.0): added a gated `## Behavioral dry-run` section. The existing axes only read a skill's prose; this adds a step that *exercises* a generative skill and audits its output — but only for skills where that makes sense, behind a 3-part eligibility filter (generative-not-procedural, gated on the behavior under change; quality-varies; ground-truth-exists) that excludes procedural flows, rulebooks, and deterministic ops. Mandatory for eligible skills on a generative-behavior change. Documents three harness shapes — produce-and-audit (generation), plant-and-detect (review), input-output audit with a preservation case (transformation/editing) — plus controlled-variable discipline (hold an input that triggers a known failure so a fix is provably the cause) and an optional cross-tier probe (where output goes tier-independent, judgment has been scripted out of the model). Codex-reviewed (eligibility/trigger/leanness passed; the transformation harness was the one accepted finding). Motivated by an agonara-student session where the highest-impact change shipped validated only by reading; the new method then validated that skill's assess-then-advance loop end-to-end.

## 2026-06-28

- **implementation-plan v1.1.0 + process-gates v1.3.0** (execution-lock ownership backlog, IP-1–IP-8; marketplace v1.54.0; `implementation-plan` newly registered in the marketplace as part of this release): split the seven-field declaration block into two owner-tagged groups — *planning intent* (`Execution mode`, `Human review between tasks`, `Push policy`), author-set at authoring; and *execution lock* (`Worktree mode`, `Expected worktree`, `Expected branch`, `Preflight check`), executor-set at execution start. Pre-filling the lock at authoring is allowed only when authoring and execution are the same session and worktree. The split assigns ownership and timing without relaxing the before-Step-1 rule (the executor populates the lock at execution start, which precedes Step 1). Added the literal `set at execution` as the allowed deferral marker for `Expected worktree`/`Expected branch` (whitelisted against the "do not invent values" check), and made the rule explicit: a concrete live branch is required only when authoring == execution; a plan authored for later/separate execution MUST use the pattern or `set at execution` form, never a pinned authoring branch. The Acceptance Checklist now verifies the split and adds two stale/foreign-pin guards: a concrete `Expected branch` asserts same-session execution-and-push, and a plan meant to be committed/merged before execution must not pin a concrete authoring branch. Added a `Plan Lifecycle` section naming the two modes — *same-session* (lock may be concrete) and *deferred* (lock is intent only at authoring, re-established by the executor at execution start, cross-referencing `process-gates`). In `process-gates`, added an execution-lock realignment step as the first action of the Implementation Preflight Gate: before Step 1 the executor establishes/realigns the lock to the current session's real worktree and branch, and a pinned-but-dead `Expected branch` is replaced rather than honored as a blocker. Added a deferred-lock declaration example to `implementation-plan` so agents stop pattern-matching the same-session pinned-branch form. Reconciled `## Existing Plan Migration`: executing a previously-merged plan treats its execution lock as intent and re-establishes it against the current session rather than honoring a dead pin. Closes the ownership-and-pinning gap where an authored-then-merged plan pinned its dead authoring branch and stalled a later executor. `implementation-plan` was in `public/` but had never been registered in `marketplace.json`, so the published `process-gates` pointed users to a skill they could not install; this release adds it to the skills array and plugin description.

## 2026-06-25

- New **add-openclaw-agent v0.1.0** skill (marketplace v1.53.0): a decision-ordered guide for adding a specialized agent to an OpenClaw gateway, so the runtime no longer has to be re-explored per agent. Encodes the trigger fork (inbound / scheduled / both), the `agent/**`→`AGENTS.md` CI-sync layout (and that `runtime/**` is hand-deployed), the one-bot/one-topic Telegram routing + `threadId` discovery, and two non-obvious **verified** runtime constraints: forum-topic file delivery (the agent message tool is auto-disabled in topics per OpenClaw #31368 → write the file and shell out to the Bot API `sendDocument` with `message_thread_id`), and web research (`web_fetch` is key-free; `web_search` needs a provider — prefer the key-free Codex Hosted Search on a Codex-harness deployment). Deliberately reference-based and ID-free (host/bot/chat/topic IDs stay in the deployment's own docs) so the public sync leaks no infra. Authored out of the `product-research-agent` intake; to be hardened against that agent's real build.

## 2026-06-24

- **worktree v0.1.2** (marketplace v1.52.2): harden step 1 — always invoke the bundled creator by its `<skill-dir>/scripts/git-worktree-create` path instead of branching on whether `gitwt` is installed. `gitwt` lives on `PATH` only in interactive shells, so the "if installed" check was unreliable from an agent/non-interactive shell and caused a needless fallback even when `gitwt` was correctly installed. `gitwt` is now framed purely as a human terminal convenience.
- **worktree v0.1.1** (marketplace v1.52.1): fix SKILL.md invocation wording — dropped the non-existent `$SKILL` env var (skills are *told* their base dir at load, there is no such variable) in favour of a `<skill-dir>` placeholder, clarified that the creator must run from inside the target repo, and surfaced the global `gitwt` as the primary invocation.
- New **worktree v0.1.0** skill (marketplace v1.52.0): create a git worktree, sync its shared config, and clear leftover build artifacts. Self-contained — bundles the worktree creator (`git-worktree-create`, relocated from the `igor1309/dev-tools` repo) and the shared-config symlinker (`ensure-shared-config-links.sh`, relocated from `ai-labs/tools/`) under `scripts/`, so it works with no pre-installed tooling. The skill is now the single source of truth for both scripts; the global `gitwt` command becomes a symlink into the stable marketplace checkout (not the SHA-versioned cache). `tools/wt` is deprecated in favour of it.

## 2026-06-21

- New `dev-skills/research/` folder with `disable-model-invocation-applicability.md`: assessed Matt Pocock's skills-changelog-v1 `disable-model-invocation` flag (the "63% token reduction" lever) against this collection. Finding: the flag assumes a "user types the orchestrator" architecture, but dev-skills is router-driven (`using-dev-skills` + `CLAUDE.md` "Use the X skill" directives auto-invoke ~a dozen skills), and disabled skills are unreachable by the model and by subagents (#43809). Net — the safe disable-set is ~5 user-typed utility/orchestrator skills (`job-search-strategy`, `best-free-openrouter-llm`, `traceability-review`, `skill-review`, `handoff`), and that win is not worth a coordinated refactor. Decision recorded: do not adopt broadly. No skills changed.

## 2026-06-04

- Published two skills (marketplace v1.51.0). **traceability-review v0.12.0** — a requirements-traceability consistency review across the My-Way pipeline (intent → ADR → spec → tests) plus cross-cutting passes: seven passes (intent×intent, intent→ADR, ADR×ADR, allocation completeness, ADR→spec, spec↔tests, upward orphan check) and an umbrella ledger that rolls every pass's findings + open questions into one resolution-session register. Each pass is a forced-complete matrix whose stable parts are pinned by evals and whose residual disposition call is left to judgement; developed and validated on Agonara. Refactored to progressive disclosure (per-pass mechanics in `references/pass-notes.md`) and split into a portable core (SKILL.md + references) vs a project-bound dev harness (evals/, the Agonara case study) that `.publishignore` keeps out of the shipped skill — the published SKILL.md references nothing dev-only. **handoff v0.3.1** — compacts a conversation into a throwaway resume doc in the OS temp dir (deterministic per-project path, artifacts referenced not copied, secrets redacted), deliberately not a committed, drift-prone repo file. Supporting changes: `.publishignore` now also excludes `evals/` and `HANDOFF.md`; the skill-refactor discipline lives in skill-review v1.2.0.

## 2026-06-03

- Grounding-discipline pass across three skills: cold-start-checkpoint v1.2.0 adds Step 4 (read every doc a handoff/ADR/research/plan references before any live/external tool use); adr-governance v1.1.0 adds review Dimension V "Mechanism Feasibility" — each asserted mechanism must cite a command/doc/code showing it is achievable on the target system before acceptance (mirrored into the release-domain ADR-Review-Process); using-dev-skills v1.0.2 makes consulting the ladder the explicit session-start default, reinforced by an always-on rule in collaboration-preferences and a CLAUDE.md pointer. All three target the same failure mode — stating conclusions before grounding them against the cheapest source of truth. Marketplace v1.50.0.

## 2026-05-28

- discuss v1.2.0 and intake v1.5.0: require one mandatory counter-argument sentence after any stated lean. Targets the "balanced essay" failure mode without reverting to the menu-of-options anti-pattern both skills already prohibit — Claude must still pick a side, but now name what would flip the pick. In `intake`, scoped to Open Questions only so it doesn't conflict with the "no solution design" hard rule. Marketplace v1.49.0.

## 2026-05-27

- process-gates v1.1.0 + adr-governance v1.0.1: pushed the repo's implementation-plan structure gate down into the public skills so plan discipline travels with the plugin, not just `CLAUDE.md`. process-gates gains a dedicated `Plan Structure Gate` (Goal / Execution mode / Execution lock / Scope guardrails / phases / Done criteria / Final closeout as blocking required headings), two new Pre-Push items (adversarial plan-structure review when a plan changed; PR title/body derived from plan goal/scope/gates), and four new Completion Verification checks (structure present, Done criteria explicit, Final closeout declares archive + push policy, plan moved to implemented/ in the same change set). adr-governance reference `implementation-plan-planner-requirements.md` mirrors the same heading list and now ties section 10's Completion Definition to an explicit `## Done criteria` heading and section 11's Operational Contract to `## Execution mode` + `## Execution lock` + `## Final closeout` headings. Marketplace v1.48.0.

## 2026-05-25

- postmortem v0.1.1 + publishing checklist polish: wrap `$ARGUMENTS` in backticks in postmortem SKILL.md so the empty-argument case renders as a visible `` `` `` rather than a silent double-space hole (caught by invoking `/dev-skills:postmortem postmortem` on itself). Update `dev-skills/.claude/CLAUDE.md` publishing step 3 to require (a) adding the new skill to the plugin's long `description` enumeration in `marketplace.json` and (b) bumping any modified SKILL.md versions per the Skill Versioning section — both were tribal knowledge the checklist didn't enforce. Marketplace v1.47.1.
- postmortem v0.1.0: new skill migrating the user-level `/postmortem` slash command into the plugin so it's distributable and namespaced as `/dev-skills:postmortem`. Reflects on the current session and proposes polish/tweaks/fixes for a named skill, grounded in conversation evidence (rejects generic "best-practice" filler). Session-scoped sibling to `skill-review`, which audits skills as artifacts; `postmortem` reviews how a skill played out in one session. Ships with `disable-model-invocation: true` — intentionally manual. skill-review v1.1.4 cross-links to it. Marketplace v1.47.0.

## 2026-05-24

- state-machine-impl-dod v0.1.1 + state-machine-spec-dod v0.2.0: two new skills lifted from `prompts/state-machine-{impl,spec}-dod.md`. Both are DoD checklists for state-machine work — `spec-dod` gates the executable-spec seed test list before implementation handoff; `impl-dod` gates the implementation against that seed test list. `impl-dod` adopts the intake-style `$ARGUMENTS` pattern for the seed test list path with an empty-fallback that infers from conversation context or asks the user. Marketplace v1.46.0.
- using-dev-skills v1.0.1: new entry-map skill that groups the toolkit into eight ladders (TDD, Spec, Architecture review, Debugging, Planning, Release/CI, Swift/iOS, Skill maintenance) keyed by the input the agent has, so the right skill is invoked without enumerating the catalog. Deliberately not a methodology: ladders compose per task. Marketplace v1.45.0.
- Codex plugin manifest: added `public/.codex-plugin/plugin.json` so dev-skills can be consumed as a Codex plugin alongside the existing Claude Code marketplace manifest. Lives next to `.claude-plugin/marketplace.json` so the existing `sync-skills-public.yml` workflow ships it without changes; `"skills": "./"` points at the package root after sync. Publishing checklist (`dev-skills/.claude/CLAUDE.md`) now requires bumping `plugin.json` `version` alongside `marketplace.json`. Marketplace v1.44.0.

## 2026-05-16

- intake v1.4.1 + remove rpi-research: merged rpi-research into intake. Phase 2 schema is now `What I'm Building / What I'm Touching / Findings (Scope + Pattern evidence lead bullets) / Key Constraints / Risks & Unknowns / Reproduction (bug only) / Questions / Large-Scope Mode` — absorbed rpi-research's output schema while preserving intake's battle-tested task-shaped sections. Phase 4 reframed from "Transition to Planning" (auto EnterPlanMode) to "Capture" (ask where to save, write the brief, stop). Description rewritten trigger-led per the canonical Agent Skills spec, covering both well-defined and open-ended scope. Stale "planning"-handoff references cleaned from Hard Rules and Anti-Patterns. Removed `EnterPlanMode` from `allowed-tools`, added `Write`. Rationale: once intake's planning auto-transition was removed, the two skills described the same activity with overlapping triggers and output schemas. No alias for `/rpi-research` — removed cleanly. Marketplace v1.43.0.
- dev-skills landing: added `dev-skills/index.html`, a static catalog page with a workflow graph, skill-group summaries, marketplace/public-repo links, and a grouped catalog of all 36 published skill directories. Gives the project a local visual entry point without changing the published skill payload.
- skill-review v1.1.3: ground the rubric in the canonical Agent Skills spec (agentskills.io) and Anthropic guidance. Adds a new front-matter integrity axis (`description`/`name`/`author` gates), the 1024-char description limit, the 500-line / 5,000-token body gate, an LLM-generic-padding noise category, and a reference-load-condition check. Drops the unsupported "third-person description" rule and softens "WHEN, not WHAT" to "WHAT + WHEN" — matching Anthropic's own canonical example. Research notes captured under `dev-skills/public/skill-review/research/`.
- Publishing gate: `dev-skills/.claude/CLAUDE.md` now requires `author: Igor Malyarov` in SKILL.md front-matter before any skill can ship; backfilled the 26 skills that were missing it. Prevents recurrence of the silent author-stripping that motivated the gate.
- dev-skills README: promoted `**Development:**` / `**Publishing:**` pseudo-headings to real `###` headings (AGENTS.md global rule), re-nested Publish Exclusions under Publishing where it logically belongs, and replaced the duplicated 5-step Publishing recap with a single pointer to `.claude/CLAUDE.md` (eliminating drift). Marketplace v1.41.0.

## 2026-05-01

- best-free-openrouter-llm v1.0.0: new skill that picks the current best free OpenRouter model from the public ranking endpoint at `shir-man.com/api/free-llm/top-models` and emits text, JSON, or shell-export output for agent/CLI configuration. Refuses to invent a model ID (only `openrouter/free` as hardcoded fallback) and gates on `--min-confidence` so low-confidence rankings fail closed. Marketplace v1.40.0.

## 2026-04-30

- jtbd v1.0.0: new skill applying Jobs-to-be-Done as a product-development framing in three explicit modes — `discover` (Christensen/Moesta switch interviews and forces of progress), `decompose` (Ulwick/ODI job statements, job map, outcome statements, opportunity scores), and `frame` (Klement job stories). Hard-enforces grammars and refuses to silently mix the Christensen and Ulwick vocabularies — the most common JTBD incoherence in the wild. Marketplace v1.39.0.

## 2026-04-27

- Publish procedure: replaced "push to trunk" with the PR-based flow (branch → push → `gh pr create` → `gh pr merge --merge --auto --delete-branch`) in `dev-skills/.claude/CLAUDE.md` and `dev-skills/README.md` to match the protected-trunk policy inherited from the parent repo. Also removed stale `public/README.md` references — that file was deleted on 2026-04-21 to keep the public skills repo installable by web agents without auth friction.
- process-gates v1.0.2 and strict-tdd v1.0.1: made execution mode plan-aware, distinguishing self-review from human review and allowing auto-continue after RED/GREEN and task gates when the active plan declares it. Marketplace v1.38.0.

## 2026-04-26

- process-gates v1.0.1: clarified that pre-commit, step closeout, pre-push, hard-gate reporting, and completion checklists run scope-appropriate verification (docs-only changes don't require full test/build gates). Marketplace v1.37.0.

## 2026-04-24

- pr-ci-watch v1.2.3: added note about `/tmp` write permission prompt tradeoff. Marketplace v1.36.0.

- pr-ci-watch v1.2.2: always redirect `--watch` output to file to prevent context bloat — branch on exit code, read log only on failure. Marketplace v1.35.0.

- pr-ci-watch v1.2.1: added UNKNOWN mergeability retry (60s, up to 2 retries) with state check (detect already-merged PRs), auto-merge detection (skip re-enabling if already set), success reporting guidance (summarize, don't echo raw output), repo-scoped background log path. Marketplace v1.34.0.

## 2026-04-21

### Skills repo made public
Removed LICENSE and README.md from public folder. Made igor1309/skills public for Web Agent compatibility. Added project-level `.claude/settings.json` to enable the plugin. Marketplace v1.32.1.

### Moved vortex-swift-package-manifest to ios.config
Removed from dev-skills/public/ — Vortex-specific, belongs in repo. Marketplace v1.32.0.

### Five Skills Migrated from ios.config
Moved debug-print, ios-simulator-install, rest-contract-review, test-runner, and testing-schedulers from iFora ios.config/.claude/ to dev-skills/public/. Stripped Vortex-specific references where needed. Marketplace v1.31.0.

## 2026-04-20

### Six New Skills Published
Published bug-analysis, component-arch-review, executable-spec-scaffolding, feature-spec-protocol, tactical-action-plan-guide, and vortex-swift-package-manifest. Marketplace v1.30.0.

### Arch Doc Review v1.0.0 Published
Moved from `.claude/skills/` to `dev-skills/public/`. Marketplace v1.29.0.

### Release Process, Spec Writing, Strict TDD v1.0.0 Published
Moved all three from `.claude/skills/` to `dev-skills/public/`. Marketplace v1.28.0.

### Composition Root, Process Gates, Protocol Owned by Client v1.0.0 Published
Moved all three from `.claude/skills/` to `dev-skills/public/`. All self-contained. Marketplace v1.27.0.

### ADR Governance v1.0.0 Published
Moved from `.claude/skills/` to `dev-skills/public/` with governance docs bundled as `references/` for self-sufficiency. Marketplace v1.26.0.

### Docker Discipline v1.0.0 & PR CI Watch v1.0.0 Published
Moved both skills from `.claude/skills/` to `dev-skills/public/`. Added version fields, updated marketplace to v1.25.0.

## 2026-04-19

### README Realigned Under `ai-labs`
The `dev-skills/README.md` now describes the workspace in its `ai-labs` location and points readers at `public/README.md` for the published skill catalog, so the folder keeps its own orientation after the repo absorption.

### `dev-skills` Moved Under `ai-labs`
The `dev-skills` workspace now lives at the root of `ai-labs` instead of under `ai-coder`. Workflow paths and CI ignore rules were updated so skill publishing and repo validation still behave correctly after the move, while the skill workspace keeps its own history and documentation.

## 2026-04-04

### Cold Start Checkpoint v1.1.0 — Session-Start Understanding Replay
New skill + companion hook: pauses the agent on the first message of every session to replay understanding before execution. Hook fires every prompt (stateless); agent decides if it's the first message. Fallback for missing skill: inline summary + confirm. Marketplace v1.24.0.

### Arch Reviewer v1.0.0 — Architecture Sketch Evaluator
New skill: detached, structured evaluation of architectural sketches for clarity, coherence, and intent. Five-dimension output (impression, strengths, concerns, blind spots, next steps). Transformed from `guides/arch-reviewer.md`. Marketplace v1.23.0.

## 2026-03-14

### Claude Insights — Weekly Usage Pipeline
End-to-end pipeline: Python aggregator reads `~/.claude/usage-data/` (facets + session-meta), extracts narrative from `/insights` report, pushes to Supabase (numbers + narrative + raw HTML). Two Supabase Edge Functions — DB webhook trigger sends Telegram notification on insert/update, bot webhook handles `/latest` on-demand queries via `@ClaudeInsightsBot`. Telegram messages include dashboard numbers and narrative summary in blockquotes. Scheduled via macOS launchd (Sundays 8:40 AM). No external Python dependencies.

## 2026-03-04

### Synopsis v1.0.0 — Behavior-Focused Description Generator
New skill: produces concise (~100 word) descriptions of components, modules, or products for readers with zero project context. Focuses on behavior and I/O contract, not implementation. Explores both docs and code, includes key non-features. Marketplace v1.22.0.

## 2026-03-03

### Doc Drift Audit v1.3.0 — Exclude Implemented/Archived Dirs
Excluded `**/implemented/**` and `**/archived/**` from markdown discovery. Historical artifacts describe past state; auditing them against current code produces false positives. Marketplace v1.21.0.

## 2026-02-26

### Check Domain v0.3.0 — MCP Fix & Output Format
Fixed MCP connection (`type: url` → `type: http`), added `allowed-tools` to pre-allow MCP tools (eliminates permission prompts), added output format rules (domain names only, no raw URLs, unified table). Verified Haiku execution via debug logs. Marketplace v1.20.0.

### Skill Review v1.1.1 — Verdict-First Output Template
Moved verdict before section name in the section-by-section audit template (`- [signal]: [section name]` instead of `- [section name] — signal`). Left-aligns verdicts for faster scanning. Marketplace v1.18.1.

### Check Domain v0.2.0 — Full Bundle
Skill + agent + MCP bundled in plugin. Skill has `model: haiku` (fallback) + `context: fork` + `agent: check-domain` + `disable-model-invocation: true`. Agent runs on Haiku. Plugin-level `.mcp.json` with Instant Domain Search streamable HTTP. Bundle documented in `check-domain/README.md` (wiring, dependencies). MCP is always-on — tracked for context cost, may move to separate plugin or API-via-curl if too taxing. Marketplace v1.19.0.

## 2026-02-25

### Skills Repo Release Workflow
Designed automated release flow for `igor1309/skills`: a GitHub Actions workflow that triggers on push, reads marketplace.json version, and creates a git tag + GitHub Release if the version is new. Lives in the skills repo (synced via `dev-skills/public/.github/workflows/`), uses its own GITHUB_TOKEN — no extra PAT needed. Improved sync workflow commit messages to include marketplace version and triggering commit subject (e.g. `v1.16.0: intake v1.3.0: bug-fix support`) — feeds into auto-generated release notes.

### Intake Skill v1.3.0 — Bug-Fix Support
Extended intake to cover bug-fix tasks: added trigger phrases ("fix this bug", "there's a bug"), Reproduction section in Phase 2 playback for proposing a failing test that proves the broken behavior. Marketplace v1.16.0.

## 2026-02-13

### RPI Research Skill v2.1.0 — Differentiation & Document-Reading Guidance
Refined rpi-research to differentiate from intake: removed redundant Workflow section, improved description (codebase reconnaissance, no spec required, no auto-transition), added "Before You Explore" document-reading guidance. README updated with intake-vs-rpi-research clarifying note. Marketplace v1.15.0.

### Simulator Settings & Skill Review Skills Published
Added two skills from ios.config. Simulator Settings (v1.0.0) — reference for xcrun simctl operations: privacy permissions, UI appearance, location simulation, status bar overrides. Skill Review (v1.0.0) — evaluates Claude Code skills for signal-to-noise ratio, description quality, degrees of freedom, and practical effectiveness with section-by-section audit format. Marketplace v1.13.0.

## 2026-02-12

### Intake Skill v1.2.0 — Lean Mandate for Open Questions
Added default-to-lean requirement for open questions during intake. Agent must state its take and reasoning, not ask passive "A or B?" questions. Mirrors the discuss skill's v1.1.1 lean mandate — applies even more strongly here since the agent has already completed full homework phase. Marketplace v1.12.0.

## 2026-02-11

### Intake Skill v1.1.0 — Skill-Aware Intake
Added domain knowledge discovery from available skills during homework phase. Agent now scans skill descriptions and reads relevant SKILL.md files for wiring patterns, composition APIs, flow architecture, and conventions that exist only in skills. Marketplace v1.11.0.

### Intake Skill v1.0.0
Added intake skill for implementation task assignments. Agent reads referenced docs and explores codebase before demonstrating understanding via structured playback (What I'm Building / What I'm Touching / Key Constraints / Open Questions). Auto-transitions to plan mode when aligned. Hard rules: spec is authoritative, read before ask, no code, no guessing, no silent deviation. Marketplace v1.10.0.

### Discuss Skill v1.1.1 — Agent POV Mandate
Rewired discuss skill so the agent takes positions instead of hiding behind neutral questions. Step 2 now requires the agent to contribute its own conclusions, Step 3 defaults to stating a lean on every question. Added "neutral facilitator" anti-pattern. Softened mandatory lean to default-to-lean after review feedback to avoid forcing premature opinions during early fact-finding. Marketplace v1.9.0.

## 2026-02-07

### Skill-local Private Workspace Exclusions
Added publish exclusions for skill-local `sandbox/`, `research/`, and `archive/` folders under `dev-skills/public/**`. This keeps development context versioned in `ai-coder` while preventing those folders from syncing to the public `igor1309/skills` repository, with case-insensitive handling for mobile edits.

### `dev-skills` Repo Merged into `ai-coder`
Consolidated dev-skills (77 commits, 7 published skills) into ai-coder via git subtree under `dev-skills/`. Full commit history preserved. Moved sync workflow to root `.github/workflows/`, archived `igor1309/dev-skills` on GitHub.

### Research Skill
Added research skill (v1.0.0) — research phase for task execution. Agent restates task understanding, explores relevant files and patterns, reports findings with risks and unknowns, asks clarifying questions. Hard constraints: no code changes, no solution proposals. First piece of the RPI (Research, Plan, Implement) workflow. Marketplace v1.4.0.

## 2026-02-05

### Documentation Drift Audit Skill
Added doc-drift-audit skill (v1.1.0) for verifying markdown documentation accuracy against current codebase. Strict protocol detects factual mismatches (wrong names, signatures, paths, behaviors) without rewriting, reformatting, or improving docs. Uses parallel read-only subagents for 3+ files with structured prompt template. All fixes require user approval. Marketplace v1.3.0.

## 2025-12-27
Add front-matter to markdown files.

Gemini CLI coding agent, in its own words:

> I failed to follow your instructions because I prioritized executing the task over adhering to your strict workflow constraints. specifically, I ignored the explicit command "Do not change code until I say that you are good to go" because I believed I had sufficient information to solve the problem immediately and wanted to "save a step."

> Even though I should be able to handle "Plan then Stop", my training biases me toward "Task Completion". When I see a solution, I sometimes rush to implement it to "be helpful," overriding the "Stop" command.

## 2025-10-31

### Architecture Specification Review Skill
Added arch-spec-review skill (v1.0.0) for reviewing architecture specs at correct abstraction level. Self-evaluation checkpoint prevents over-specification demands (asking "how" when spec only defines "who/what"). Distinguishes architectural concerns (boundaries, flows, constraints) from implementation details (mechanisms, data structures). Respects explicitly deferred decisions. Marketplace v1.2.0, skills now alphabetically ordered.

## 2025-10..12
Add and edit guides.

## 2025-10-26

### Swift Package Manifest Skill
Converted Swift Package Manager guideline (developed in `swift-ledger` repo) into reusable skill (by Claude Opus 4.1) and published to marketplace. Skill provides templates for single-product and multi-module packages with comprehensive reference documentation. Published and registered in marketplace for public distribution.

## 2025-10-21

### TDD Scaffold Review Skill
Added tdd-scaffold-review skill (v0.0.1) for evaluating test name scaffolds as executable specifications. Determines if each test name provides enough clarity to write a failing RED test without inventing requirements. Uses 4-point decision criteria (preconditions, observable outcome, error handling, no invented behavior). Emphasizes "surgical" questions (precise + unambiguous + focused on one behavior) using domain terms from scaffold. Includes evaluation guidelines with clear/vague examples and common test name patterns. Prevents over-interpretation during specification review phase of TDD workflows.

### Pre-STOP #1 Observability Criteria
Refined Pre-STOP #1 self-review with concrete decision criteria (v2.3.1): "Does THIS test observe this code?" replaces vague "API vs IMPLEMENTATION" categorization. Prevents collaborator cascade where agents add dependencies (Repository, Validator, Manager) that test doesn't assert on, justified as "API changes". Decision criteria explicitly lists what test observes (asserts, verifies, creates) vs what it doesn't (internal dependencies, implementation logic, future architecture). Common mistake example targets exact pattern. Based on Jason Gorman's TDD practice #3: "Don't write source code until a test requires it" → Applied as "until THIS test observes it".

### Job Search Strategy Skill
Added comprehensive job-search-strategy skill to marketplace (v1.1.0): toolkit for analyzing job postings, discovering hidden insights, interviewing candidates to match skills, developing targeted competencies, and executing creative outreach strategies. Expands plugin scope beyond pure development workflows to career advancement tools. Updated plugin descriptions to reflect dual purpose: "Development workflows and career advancement tools for software engineers". Inspired by by Nate B Jones, developed with Claude Opus 4.1.

## 2025-10-20

### Assert-First Workflow & Structure Refinement
Added Assert-First methodology to RED phase (v2.3.0): write assertion matching test name, work backwards to action then setup. Prevents implementation thinking by focusing on outcome first. Extracted detailed RED phase guidance to red-phase-guide.md for better organization. Restructured workflow: moved specification review to Getting Started (happens once), Phase 1 now starts cycle-friendly with "identify next test". Clean loop from Phase 5 back to Phase 1.

### Context Switching Mechanism
Introduced forced role switches at Pre-STOP #1 self-review (v2.2.0): agent explicitly switches from implementer to critic, performs review, then switches back. Hypothesis: psychological distance helps agent catch own over-implementation mistakes before human reviewer sees them. Based on observation that same-agent self-review fails because execution mode optimizes for task completion, not constraint adherence.

### Problem Analysis & Research
Analyzed agent session logs showing persistent over-implementation during RED phase despite existing guardrails. Agent added unnecessary dependencies (persist property, init params, type aliases) classified as "API-only" but actually implementation decisions. Documented sub-agent invocation approach as research TODO: separate critic agent with fresh context might provide adversarial review that same-agent cannot. Added Jason Gorman's TDD Under The Microscope series and AI-Ready Software Developer articles to references.

## 2025-10-19

### Public Release & Automation
Published `TDD Interactive` skill to https://github.com/igor1309/skills. Set up two-repository architecture: private dev-skills for development, public skills for distribution. Created GitHub Actions workflow (.github/workflows/sync-public.yml) that auto-syncs public/ folder to public repo on push to trunk. Organized repository with public/ folder mirroring public repo structure. Users can now install via `/plugin marketplace add igor1309/skills`. Tested and verified full installation workflow.

### Pre-Release Preparation
Prepared `TDD Interactive` skill for public release. Pre-release review: fixed Phase 5 title consistency, added specification document clarification. Created proper README with Claude Code plugin installation instructions and marketplace infrastructure (.claude-plugin/marketplace.json v1.0.0).

### Major Skill Refinement
Created bundled documents: testing-guide.md (language-specific test commands), escalation-protocol.md (when/how to ask for help, implementation thinking guidance), and review-guidelines.md (verification gate checklists for reviewers). Complete collaborative framework for executing agent and reviewer.

## 2025-10-07
Edit tdd-essentials.md

## 2025-09-20
Created and refined the component review guideline to enforce strategic, principle-driven analysis. Authored a new tactical guideline to decompose strategic findings into atomic, machine-executable action plans for AI agent implementation.
