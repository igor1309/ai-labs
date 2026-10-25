# Log

## 2026-10-25

- ALI: land the new product (AI Learning Agent, concept stage; working
  name). Added `ali/README.md` and `ali/docs/` (concept, vision, application
  answers, activity log); registered it in `scripts/loc-dashboard.sh`,
  `docs/loc-dashboard.html`, the README Components table and an unlinked
  `docs/products.html` card. No landing page, release unit or CI yet.

## 2026-10-22

- Projects can export an allowlisted public snapshot with privacy scans and checks,
  then sync an existing GitHub repo. RexLab has showcase settings and an MIT licence (LAB-461).
- FolioTell has showcase settings, a public README with screenshots and an MIT
  licence, for a public repo of its iOS app (LAB-462).

## 2026-10-21

- Audelin: land the new product (local macOS companion for calls, design and
  architecture stage). Added `audelin/README.md`, `audelin/docs/log.md` and
  `audelin/index.html`; registered it in `scripts/loc-dashboard.sh`,
  `docs/loc-dashboard.html`, the README Components table and the `index.html`
  and `docs/products.html` landing pages. No release unit or CI yet.

## 2026-10-18

- `scripts/watch-pr.sh` no longer waits forever: it stops on a check queued 15
  minutes with no runner, and on checks still pending after 90 minutes. Right
  after a push it no longer passes on the previous commit's checks (LAB-305).

## 2026-09-20

- Moved the AI-account tooling out of this repo into `inventory/tools/`: `cl`,
  `cx`, `codex-mgr`, `ccswitch-limits` and the shared `account-rotation`
  library, which form one dependency cluster and now sit next to the accounts
  they operate on. All five moved together as flat siblings, so their
  `$tool_dir/../<sibling>/` lookups still resolve; the `~/.local/bin` symlinks
  were repointed by re-running each `install.sh` (`ccswitch-limits` has none and
  was re-linked by hand). All five test suites pass from the new location.
  `tools/` keeps `mac-health` and `wt`; its README lost the moved rows plus a
  stale `claude-account-switch` row for a directory that no longer exists.

## 2026-09-15

- Noreta reads real Claude Code data: sessions, their runtime state and their
  transcripts, with a plain-text listing behind `npm start`. Refreshed the
  `## Components` row and the `loc-dashboard.html` entry.

- Implement all seven Noreta QA features against `noreta/docs/qa.md`, one at a
  time, each followed by a Codex adversarial review whose findings were judged
  and fixed. Every feature has a domain model and a test named after each Gherkin
  scenario; none has an agent adapter yet. Refreshed the `## Components` row and
  the `loc-dashboard.html` entry for the new code.

- Land Noreta's first code and register it in CI: `noreta-core.yml` (typecheck
  against `noreta/tsconfig.json` plus the test glob), a `noreta`/`noreta-ci`
  path filter and dispatch job in `ci.yml` wired into `report` and `notify`, and
  `test:noreta` chained into the root `npm test`. The `## Components` row and
  the `loc-dashboard.html` data row no longer claim the project has no code.

- Allow the `better-sqlite3` install script in `package.json` (`allowScripts`).
  npm 12 blocks dependency install scripts by default, so a fresh `npm ci` left
  the native binding unbuilt and 77 nomos tests failed locally on
  `Could not locate the bindings file`; CI, on the npm bundled with the pinned
  Node 22, was never affected. Only `better-sqlite3` is approved — the other six
  blocked packages are not needed by `npm test`.

- Correct the new-project checklist: `product reveal` cards live in
  `docs/products.html`, not `docs/loc-dashboard.html`, which only holds the
  `data` array behind the chart and table.

- Promote `noreta/` from `research/noreta/` to a top-level project: collect its
  docs under `noreta/docs/`, seed a README and project log, and register it in
  the `## Components` table, the products page (Applications), the
  `loc-dashboard.html` data array, and the `loc-dashboard.sh` `known`/row-loop
  entries. No release unit and no CI workflow — the project has no code yet.

- Move `niora/` from the top level to `research/niora/`: the name is excluded
  because of the niora.ai conflict, and the directory holds only early-stage
  design notes. Dropped its `## Components` row, its products-page card (and
  the now-empty Concepts group), its `loc-dashboard.html` data entry, and its
  `loc-dashboard.sh` `known`/row-loop entries.

## 2026-09-05

- Refresh the LOC dashboard rows, summary totals, ratio, and timestamp from the current counting script.

## 2026-09-03

- Dashboard: link the Cairana product card to its existing landing page so
  the generated local dashboard validates every product destination.
- CI: narrow the shared path filter to shared infrastructure so dashboard
  script edits do not trigger unrelated provider-smoke jobs.

## 2026-07-13

- FolioTell: extend `.agents/foliotell.md` with an Android section (build
  commands, sandbox constraints, no-root-build-script rule) and widen the
  CLAUDE.md FolioTell trigger to all of `foliotell/`, so agents picking up
  Android work are routed to the operational knowledge instead of
  re-deriving it.

## 2026-07-12

- FolioTell: scaffold the Android sibling at `foliotell/android/` (two-module
  Gradle skeleton per ADR-003) and add the dedicated
  `foliotell-android-core.yml` Linux CI workflow to the `ci.yml` dispatcher,
  per the per-project CI isolation rule.

- FolioTell: restructure `foliotell/` into a platform-family directory on the
  `notio/` model — the iOS app (sources, Xcode project, scripts,
  `release.toml`, iOS-specific docs) moves to `foliotell/ios/`, ahead of the
  planned `foliotell/android/` sibling. Release unit path, CI path filters,
  release workflow jobs, release scripts and their tests, and agent docs
  updated; family-level README, landing page, backlog, research, and product
  docs stay in place, so published URLs and the `foliotell_v*` tag namespace
  are unchanged. Full root suite, manifest checks, and the release-notes
  validator pass from the new paths.

## 2026-07-10

- FolioTell: prepare `foliotell_v0.6.3` — device feedback fixes Stop reset,
  Resume icon clarity, concise voice labels, and Russian-to-English document
  voice resolution; composed regression tests and iOS archive pass.

- FolioTell: prepare `foliotell_v0.6.2` — replace the queued playback graph
  that regressed device responsiveness with a single main-actor coordinator;
  composed Swift tests cover same-turn Play, startup Pause, stale callbacks,
  and bounded word updates. The candidate is ready for TestFlight device
  timing validation.

- FolioTell: prepare `foliotell_v0.6.1` — restore responsive playback controls,
  reliable early Pause behavior, and reader-session cleanup; TestFlight user
  feedback will provide the final physical-device validation.

- Release governance: scope the Agonara readiness and `/operations/health`
  gates to Agonara; FolioTell uses its own TestFlight release evidence.

- Release process: a complete feature branch may transition in place to a
  frozen release candidate; version metadata and full notes are added before
  the candidate PR merges to `trunk`, while tagging remains trunk-only.

- FolioTell: prepare `foliotell_v0.6.0` — dedicated Reader Settings, separate
  Voice and Playback controls, and a one-time acknowledgement of installed
  Enhanced/Premium voices.

## 2026-07-09
- FolioTell: enforce prepared release notes — a versioned note is now required
  in release-preparation CI, revalidated from the tag, and published verbatim
  as the GitHub Release body after its YAML metadata is removed.

- FolioTell: release `foliotell_v0.5.0` — language-aware voice-quality
  onboarding, Enhanced/Premium voice acknowledgement, and quality-labelled
  voice choices; automatic selection now prefers the best installed
  audio-capable voice.

- Release CI: pin `test-foliotell` to the newest runner Xcode (same "Select
  newest Xcode" step as the deploy job and `foliotell-core.yml`) — a
  `macos-latest` image with default Xcode 16.x/Swift 6.1 rejected the
  swift-tools-6.2 package and failed the `foliotell_v0.4.3` release run.
- FolioTell: release `foliotell_v0.4.3` — playback rebuilt on two IMRX-style
  state machines (transport + position, ADR-002) with behavior parity, plus
  the Maestro iOS 26 simulator runbook and re-baselined playback-controls
  flow.
- Release CI: fail the `release-unit.yml` verify step when `verify-tag.js`
  rejects a tag — the pipe through `tee` swallowed the non-zero exit, so a
  tag/manifest version mismatch produced a green run with empty outputs,
  skipped the unit's deploy jobs, and published a garbage GitHub release
  (observed on a premature `foliotell_v0.4.3` tag).

## 2026-07-08
- FolioTell: release `foliotell_v0.4.2` — fix the reader bottom bar not rendering; playback controls are back.

- FolioTell: make TestFlight release archives unsigned so App Store Connect
  distribution signing happens during export instead of conflicting with the
  target's automatic development signing settings.

- FolioTell: release `foliotell_v0.4.1` — reader controls rebuilt as a native Liquid Glass bottom-bar toolbar (centered transport, settings menu promoted to its own capsule, progress ribbon floating above the text).

- FolioTell: fix the TestFlight archive signing identity so release CI requests
  Apple Distribution provisioning assets instead of development signing assets.

- FolioTell: release `foliotell_v0.4.0` — reader bottom controls rendered with Liquid Glass (grouped interactive glass for the settings icon and playback buttons); deployment target raised to iOS 26.

- FolioTell: release `foliotell_v0.3.1` — reader settings control is now icon-only, fixing the truncated `1.5x · Skip ·…` summary label; menu content unchanged.

- FolioTell: release `foliotell_v0.3.0` — sentence navigation (back/forward one sentence per tap in every playback state) and word-granular live progress bar.

- FolioTell: release `foliotell_v0.2.0` — per-document playback position persistence and sentence-anchored resume (stop parks, relaunch resumes, Start Over, progress bar).

- FolioTell: release `foliotell_v0.1.1` — stop/pause-path instrumentation for
  the on-device stop-latency investigation (machine-side timeline in Console
  under subsystem `foliotell.FolioTell`); no behavior change.
- Retro hardening: delegation-preflight and tool-mechanics rules in
  collaboration preferences, a worktree-safety stop condition in the
  release-executor agent, a bug-report cue split in `using-dev-skills`
  (v1.0.3), and a global research-briefs rule (gather local facts before
  spawning researchers). Skill updates published as dev-skills marketplace
  v1.56.0 (using-dev-skills 1.0.3, pr-ci-watch 1.3.0, skill-review 1.5.0).
- FolioTell: release `foliotell_v0.1.0` — speech text normalization (documents are spoken as content, not raw Markdown markup), the iPhone settings-menu freeze fix, and the portable TestFlight upload path.
- FolioTell: fix the reader settings menu freezing the app on iPhone — query
  the voice catalog once off the main actor and cache it, instead of calling
  `AVSpeechSynthesisVoice.speechVoices()` several times per render (a call
  with documented multi-second device stalls), and detect document language
  without running the full speech normalization pass on the render path.
- FolioTell: add a self-contained release runbook (commands, gates,
  Xcode/altool caveats, tag recovery) and a device-speech doc (design
  rationale, falsified hypotheses, Console diagnostic procedure) so future
  releases and silent-reading investigations start from captured knowledge
  instead of re-derivation; fix the README's stale `FOLIOTELL_VERSION`
  default.
- FolioTell: make the TestFlight upload portable across runner Xcode
  generations — documented `altool --apiKey/--apiIssuer` flags with the key in
  `~/.appstoreconnect/private_keys`, and pin the deploy job to the newest
  Xcode on the runner image. The `foliotell_v0.0.3` release run failed on a
  runner defaulting to Xcode 16.4, whose altool rejects the previous flags.
- FolioTell: release `foliotell_v0.0.3` with the catalog-based automatic
  voice resolution fix for silent reading on device.
- FolioTell: resolve the automatic speech voice from the installed voice
  catalog (preferring voices with populated audio settings) instead of the
  `AVSpeechSynthesisVoice(language:)` initializer, which can return a voice
  that produces no audio on device; log the resolved voice for on-device
  diagnosis. Addresses reading still silent on device in TestFlight 0.0.2.

## 2026-07-07

- FolioTell: prepare patch release `foliotell_v0.0.2` for the TestFlight
  device-speech fix, keeping the release under the `VRVJ9YNRQU` team/provider
  path.
- FolioTell: configure the iOS audio session for spoken playback and declare
  background audio mode so TestFlight builds can read documents audibly on
  device instead of relying on the default app audio session.

## 2026-07-06

- FolioTell: prepare the first release tag as `foliotell_v0.0.1` by aligning the canonical release metadata and generated release-unit manifest with the implemented v0.0.1 app and binding the TestFlight deploy job to its GitHub environment secrets.
- FolioTell: register as a release unit (`foliotell_v<version>` tags) and route TestFlight uploads through the existing release-unit workflow instead of ordinary merge CI. The FolioTell release job runs Swift build/test/archive gates on macOS, writes the App Store Connect API key from secrets, then invokes the team-pinned TestFlight distribution script.
- FolioTell: lower the Swift package tools version to 6.1 so the GitHub
  macOS runner can build the package with its installed Swift toolchain.
- FolioTell: move the TestFlight backlog under the project and add a
  project-local product backlog covering playback resume, background playback
  validation, speech text normalization, real-device language/voice validation,
  compact navigation controls, a lightweight recent-documents library, reusable
  Maestro regressions, and Markdown rendering polish.
- FolioTell: close the TestFlight packaging gap by adding an archive-ready iOS Xcode project wrapper around the existing Swift sources, a checked export-options plist pinned to Apple team `VRVJ9YNRQU` and bundle id `foliotell.FolioTell`, and `foliotell/scripts/distribute-testflight.sh` for API-key based archive/export/upload automation that refuses any other team/provider. The FolioTell CI gate now also verifies the unsigned iOS archive wrapper.
- Foliotell research: added iPhone text-to-speech reader UI reference corpus under `foliotell/research/`, with per-app source inventories, downloaded screenshots, interaction inventory, and comparison table for document-reader design work.
- FolioTell: filter selectable voices to the detected document speech language, falling back to all installed voices only when no language-matched voices exist.
- FolioTell: add persisted voice selection to the reader settings menu, with Auto preserving language-based voice choice and installed voices overriding playback directly.
- FolioTell: render leading YAML front matter as caption-sized secondary text in the reader while preserving body styling and speech skip/read behavior.
- FolioTell: move reader controls into the bottom safe-area inset and replace the speed picker/front-matter toggle with a compact settings menu.
- FolioTell: select a Russian speech voice for Cyrillic utterances so the supplied Pushkin document is spoken as Russian instead of through the system default voice.
- FolioTell: compact the reader controls by replacing the front-matter segmented control with a switch and fixing the primary Play/Pause/Resume button width. Skip mode now handles UTF-8 BOM-prefixed Markdown, so the supplied Pushkin file skips its YAML front matter during speech.
- FolioTell: add a persisted front-matter playback setting so speech can skip leading YAML front matter by default or read it when selected.
- FolioTell: fix live speed changes restarting from the beginning by tracking the current spoken range and replacing the utterance from the remaining text boundary when the rate changes.
- FolioTell: replace the split Play and Pause/Resume controls with one primary Play/Pause/Resume button plus Stop, matching the playback state directly and simplifying the simulator flow.
- FolioTell: fix the Play button state during the playback cycle. Play is disabled while speech is speaking or paused, Pause/Resume and Stop remain active for active playback states, and the reusable Maestro flow now asserts that tapping Play while paused leaves playback paused. Added a forward TestFlight backlog item scoped explicitly to Apple team `VRVJ9YNRQU`.
- FolioTell: persist the simulator playback-control check as a reusable Maestro flow, add the provided app icon as a processed 1024x1024 asset catalog resource, and add a dedicated FolioTell CI workflow wired through path filters so Swift build/test gates run for FolioTell code, tests, resources, Maestro flow, or CI changes while docs-only edits stay out of that trigger.
- FolioTell: fix the playback controls bug found on simulator. Playback state now stays `speaking` across internal speech-cancel callbacks caused by restart/speed-change behavior, so Pause/Resume and Stop remain usable while audio plays. Added core state-machine tests and verified the installed simulator app with Maestro using the imported Pushkin Markdown file.
- FolioTell: implement v0.0.1 as a Swift package. The new SwiftUI app target launches through `DocumentGroup`, opens read-only Markdown/plain-text documents, shows a reader with persisted speed presets and play/pause-resume/stop controls, and speaks through `AVSpeechSynthesizer`; the core target has Swift Testing coverage for document validation/loading and speech speed mappings. Updated FolioTell and repo product metadata from spec-stage to implemented package, and refreshed the LOC dashboard.
- Land the `foliotell` project: a native document-to-speech iPhone app (SwiftUI +
  `AVSpeechSynthesizer`) that reads local Markdown and plain-text files aloud —
  working name, in naming-validation and specification stage. Add the naming brief,
  candidate evaluation, and technical specification (front matter normalized to repo
  convention), a project README, an internal orientation `index.html`, and a project
  log. Classify the directory across `scripts/loc-dashboard.sh`, the LOC dashboard
  data, the README Components table, the root landings page, and `docs/products.html`.

## 2026-07-05

- Courses: added July-2026 market + demand research under
  `research/courses/market-2026/` (global + RU, competitive + demand — four
  reports) extending the existing competitor survey; indexed as inputs to
  `decision-matrix.md` / `positioning-notes.md`, not commitments. Then drafted
  `research/courses/opening-lectures/` — opening-lecture structures for the three
  prospective programs (интернет-предприниматели с IT / программисты / служащие),
  each as Socratic top-level questions over a shared arc
  (provocation → mechanism → shift → judgment → honest limit). Discussion ground,
  no launch decision. Captured Khakhalev's July-2026 on-site workshop promo under
  `research/courses/khakhalev/` with a competitive note (his live "redo a solved
  task" format mirrors our Program 2 opener; his own reference flags "lacked more
  depth" — our Socratic wedge). Internal codename for the initiative: **Kiora**.
  Added a top-level `research/courses/README.md` orienting the initiative (reading
  order across base → market-2026 → opening-lectures). Docs/research only — no
  release unit or CI workflow.

## 2026-06-23

- Cairana: land the future product (AI assistant for psychologists, working name/research stage). Added `cairana/README.md`, `cairana/docs/log.md`, and a simple `cairana/index.html` landing page; classified the dir in `scripts/loc-dashboard.sh` (known list + row), the `docs/loc-dashboard.html` data array, the README Components table, and the `index.html` / `docs/products.html` landing pages. No release unit or CI workflow — docs/research only.

## 2026-06-15

- AST tooling research: added `docs/research/ast-code-search-tools.md` comparing
  `defendend/ast-index` (agent-native code index over SQLite/tree-sitter, MCP +
  plugin) against `ast-grep/ast-grep` (structural search/lint/rewrite, no index,
  no built-in Claude integration). Conclusion: not a head-to-head — ast-index for
  navigation, ast-grep for transformation; lead with ast-index for the Claude Code
  workflow. Captured forward tasks (time-boxed ast-index trial, adoption shape,
  ast-grep-for-codemods) in new `backlog/ast.md`.

## 2026-06-12

- Prompts: `define-dod.md` 0.2.0→0.3.0 — condense the payload (~30→~20 lines)
  with all six hard guarantees intact, confirmed by a third adversarial review
  round comparing revisions guarantee-by-guarantee. The round caught three
  compression regressions, fixed before commit: DoD must be stated "in your
  response" (not a silently rewritable file), "change it only by noted
  additions" (extend-only quantifies over all edits, blocking in-place
  weakening), and the vague-qualifier ban hoisted to cover criteria and
  checks, not just `Expect`. Also restored the verifier-access clause and
  made coverage span explicit *and implied* requirements.
- Prompts: add `define-dod.md` 0.2.0 — reusable closure snippet that makes an
  agent state a structured, verifiable, provable Definition of Done before
  starting the enclosing task and use it as the completion gate: numbered
  criteria covering every requirement (uncovered requirement = FAIL), binary
  PASS/FAIL checks (exact command or named-artifact inspection, observable
  expected result), evidence per criterion, validity-bounded non-goals, an
  in-principle-only `Unverifiable` list instead of silent drops, and separated
  terminal states (completion requires all-PASS; remaining FAILs mean
  incomplete/blocked). Hardened over two adversarial review rounds.
- My Way: clarify that downstream movement may carry a partial slice of the
  upstream scope, that accepted intent is never locked, and that the cascading
  rework a changed intent triggers is welcome, not prohibited.
  `pre-coding-phase.md` 0.0.6→0.0.7 extends §Iteration (preserve ≠ cover;
  the early slice exists to educate); `00-product-intent/note.md` sharpens
  "must preserve", notes that each downstream relationship may take a single
  slice, and reframes Change propagation as two-way with fixed directionality
  (changes land in the intent artifact first, then propagate down). Intake
  brief at `docs/my-way/plans/scope-creep-clarification-intake.md`.
- My Way: acknowledge Extreme Programming as the formative and ongoing
  influence behind the method. New lineage note
  `docs/my-way/prior-art/xp-roots.md` maps what carries over directly (user
  stories, test-first, commit on green, feedback loops, courage, spikes), what
  is transformed for agentic development (pairing, on-site customer, oral
  communication), and where the method deliberately diverges (weight of the
  pre-coding phase). Linked from `pre-coding-phase.md`, `coding-phase.md`, and
  `informal-brief.md`.
- Prompts: `google-sheets-tickets.md` 0.0.1→0.0.2 — identity-less rows now get
  a row-derived `Ticket` identity (`<sheet>!row N`, merged ranges
  `<sheet>!rows 17–19`) instead of `not specified`, per the ticket-control
  digest pre-ADR ruling (2026-06-12). `Source` provenance and the `inferred`
  marking for `Summary` are unchanged.

## 2026-06-10

- docker/langfuse: add `docker/langfuse/README.md` documenting the shared
  Langfuse v3 stack (services, ports, compose usage, configuration). Closes the
  README-coverage gap that PR #547 had proposed to "fix" by deleting the
  accurate Components row for a component that still exists in the repo.

## 2026-06-07

- LOC dashboard: refreshed `docs/loc-dashboard.html` from
  `scripts/loc-dashboard.sh --sort=name` so the summary cards, table totals,
  data array, and update date match the current repo snapshot (total
  233,162→243,664).
- Agonara: close GitHub issue #514 by moving the `agonara/docs/api/TODO.md`
  OpenAPI automation follow-up into `agonara/docs/backlog.md`, deleting the
  TODO file, and updating landing links to point at the project backlog.
- Split implementation-plan authoring guidance out of `process-gates`: add the
  `implementation-plan` skill for task/phase/step vocabulary, declaration
  fields, and acceptance checks; narrow `process-gates` to execution gates; and
  update repo discovery docs so plan files trigger the authoring skill first.
- Release units: close the Agonara deployment wiring plan after post-release
  verification. `agonara_v0.1.0` exists, release-unit run `27073521933`
  completed successfully through verify/core/staging/prod deploy/GitHub Release,
  and the published release is `agonara v0.1.0`. Archived the plan under
  `agonara/docs/plans/implemented/` with closeout evidence in
  `agonara/docs/reviews/agonara-deployment-wiring-closeout.md`.
- Agonara: update the repo-root `README.md` Components row for the BYOA repositioning — `agonara` is now described as a bring-your-own-agent (BYOA) structured learning program environment (API + per-role operator skills, `/learn`/`/admin` UIs as first-class clients). Aligned with the repositioned project README; the full refinement is logged in `agonara/docs/log.md`.
- LOC dashboard: refreshed `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh --sort=name` so the summary cards, table totals, data array, and update date match the current repo snapshot (total 230,345→230,740).
- Agonara: add `agonara/docs/api/TODO.md` for OpenAPI automation and API-skill alignment, and surface the OpenAPI contract plus implemented API skill on the project landing.
- Agonara: harden the new OpenAPI contract after adversarial review by fixing bootstrap, evaluator tick, metadata, and public no-auth route response warnings.
- Agonara: add the canonical route-level OpenAPI 3.1 contract under `agonara/docs/api/openapi.yml` and link it from the project README.

## 2026-06-06

- LOC dashboard: refreshed `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh --sort=name` so the summary cards, table totals, data array, and update date match the current repo snapshot (total 220,762→230,345).
- CI maintenance: upgraded all `actions/setup-node` workflow pins from v4 to v6 after verifying the current major ahead of GitHub's Node 24 runner default migration window.
- Release units: harden Agonara container readiness against stage, healthcheck, and entrypoint overrides.
- Release units: enforce Agonara's non-root, runtime-owned container boundary and Node-native healthcheck before the first release tag.
- Release units: harden Agonara Compose isolation readiness against comment and alternate-port bypasses, and require database state on the isolated data volume.
- Release units: enforce Agonara staging/production Compose isolation and required runtime configuration in first-release readiness.
- Release units: tighten Agonara deploy image lifecycle readiness to require post-replacement health gates, staging git-SHA tags, and production rollback retention.
- Release units: enforce Agonara deploy image lifecycle ordering, immutable version/SHA tags, and production rollback retention in first-release readiness.
- Release units: enforce Agonara staging backup/restore archive integrity and destructive ordering so the restore rehearsal exercises the same guarantees as production.
- Release units: require Agonara production backups to contain the restore-critical SQLite database before transfer or reported success, and enforce it in first-release readiness.
- Release units: harden Agonara production restore against corrupt archives before destructive mutation and enforce the validated restore lifecycle in first-release readiness.
- Release units: extend the Agonara first-release readiness check to enforce fail-closed production backup, off-host transfer, service recovery, and local retention pruning.
- Release units: extend the Agonara first-release readiness check to enforce deterministic, version-independent production rollback with a post-restore availability gate.
- Release units: extend the Agonara first-release readiness check to verify deploy jobs are scoped to Agonara tags and production depends on staging.
- Release units: extend the Agonara first-release readiness check to verify GitHub Release creation depends on successful staging/prod deploy jobs for Agonara tags.
- Release units: extend the Agonara first-release readiness check to verify failure notifications trigger on staging/prod deploy failures and report both deploy results.
- Release units: extend the Agonara first-release readiness check to verify staging failure cleanup and production rollback run before final upload cleanup.
- Release units: extend the Agonara first-release readiness check to verify workflow real evaluator smokes clean `/tmp/agonara-smoke.json` and assert the expected health version.
- Release units: extend the Agonara first-release readiness check to verify workflow version checks reject non-2xx `/operations/health` responses before parsing JSON.
- Release units: harden Agonara workflow staging and production version checks to reject non-2xx `/operations/health` responses before parsing JSON.
- Release units: extend the Agonara first-release readiness check to verify deploy scripts require HTTP success, structured health JSON, `status: ok`, and the expected version.
- Agonara: harden staging and production deploy health gates to require HTTP success, parse `/operations/health` JSON, and require both `status: ok` and the expected version.
- Release units: extend the Agonara first-release readiness check to verify the release workflow cleans `/tmp/agonara-deploy` before copying source.
- Release units: clean `/tmp/agonara-deploy` before copying Agonara release source so stale upload files cannot satisfy current deploy-script preflight.
- Release units: extend the Agonara first-release readiness check to verify staging/prod deploy scripts preflight required uploaded files before mutating the deploy root.
- Release units: extend the Agonara first-release readiness check to verify the locked release install wiring: package lock, Dockerfile `npm ci`, release upload, and CI dispatcher path.
- CI path filtering: include `agonara/package-lock.json` in the root dispatcher allowlist so lockfile-only changes run the Agonara core workflow.
- Release units: add a package-local Agonara lockfile and switch the release Docker build to `npm ci --omit=dev`, with the lockfile uploaded and required by staging/prod deploy scripts.
- Release units: harden Agonara staging/prod deploy scripts to fail on incomplete uploaded source payloads before mutating the deploy root.
- Release units: extend the Agonara first-release readiness check to optionally verify required GitHub deploy secret names with `gh` before the explicit release tag is pushed, without reading secret values.
- Release units: clean Agonara release source uploads on staging failure and after every prod deploy outcome, with rollback still running before final cleanup.
- Release units: harden Agonara release smoke cleanup so transient evaluator-smoke JSON files are removed inside the container on both success and failure.
- Release units: add `scripts/release/check-agonara-release-readiness.js` to verify Agonara first-release tag, trunk, manifest/package sync, Docker-unit status, and release workflow fan-in before pushing `agonara_v0.1.0`.
- Release units: add a fail-fast Agonara deploy secret preflight in `release-unit.yml`, validating the required GitHub secret names before source upload without printing secret values.
- Release units: register Agonara as the `agonara_v0.1.0` Docker-producing unit, wire tag-driven staging and internal-prod deploy jobs into `release-unit.yml`, require both Agonara deploys before GitHub Release, add Agonara to release-validation path filtering, and keep first release execution gated on explicit tag push plus GitHub deploy SSH secrets.
- Agonara/product landings: clarified the API-first stance as shared backend contracts for browser UIs, operator commands, and future Agonara agent skills, without making UI or agent surfaces separate owners of workflow or state.

- Products page: linked the `AI Labs` header back to the parent internal landing index.

- Claude Insights: added a local landing at `claude-insights/index.html`, linked the products-page card to it, and extended the static products-page link regression.

- Products page: linked the full Clipdeck card to the deployed `clipdeck.enoa.ai` app and covered it with the existing static products-page regression test suite.

- Internal landings: added `nomos/index.html` as the Nomos project landing and linked it from the root landing. Updated `docs/products.html` so product cards with existing local static pages open their landing surfaces (Agonara, Oracle, Dev Skills, Reinix, Nomos, Notio), with a regression test that verifies the links and targets.

- agents: narrowed the OpenClaw tasks/TaskFlow ledger TODO to the ai-labs consequence only. The live VPS diagnosis, storage-path migration, and recheck schedule are inventory-owned; this repo now records only that cron-based agent observability must keep using wrapper-level fail-closed signals until inventory confirms the ledger is usable.

- CI path filtering (`.github/workflows/ci.yml`): scoped the `changes`-job filters so **docs-only edits skip the expensive per-project core jobs** while the required `report` check still runs. Replaced the blanket `<project>/**` globs for the six broad-glob projects (`nomos`, `oracle`, `web-scout`, `corpus-scout`, `reinix`, `agonara`) with explicit allowlists of build/test inputs — source, tests, manifests/lockfiles, and build/deploy descriptors (`Dockerfile`/`compose`/`Caddyfile`) — excluding `docs/`, READMEs, `TODO.md`, landing `*.html`, and reinix `research/`. Verified against each core job's actual `tsc`/`node --test` inputs (e.g. kept `reinix/examples/**` because `local-demo.test.js` asserts the demo README/settings, and `oracle/prompts`+`copy` as runtime inputs). Adversarial pass also narrowed the `shared` filter from `.github/workflows/**` to `*.yml`/`*.yaml` so editing the workflow docs (`README.md`/`CLAUDE.md`/`AGENTS.md`) no longer triggers the entire CI matrix. Documented the allowlist convention in `.github/workflows/README.md`. (Out of scope, noted not fixed: the `release` filter still uses whole-unit globs, so docs changes still run the cheap 5-min `release-validation`.)

- Research: added `research/dokku-vs-current-deployment.md` — an evaluation note answering "is Dokku a better tool for the repo's dockerized deployments than the current pipeline?" Conclusion: no clear win for this repo. Caddy auto-TLS + the tag-driven GitHub-Actions→SSH→`docker compose up -d --build` pipeline already cover Dokku's headline features (TLS, zero-downtime, rollback snapshot); Dokku's `git push`-to-deploy model conflicts with the per-unit tag-driven semver release model; it touches only the minority VPS tier (Cloudflare/Supabase are untouched); Compose-multi-stack and the `notio` Cloudflare Tunnel blunt its value; and a new daemon contradicts the low-overhead goal in `nomos/docs/adr-0001`. Recommendation: keep the current model; for incremental gains, consolidate per-service `deploy-*.sh` into a shared tested helper. Filed as a research note (not an ADR) — it's an evaluation, not a standing decision.
- My Way research: added `docs/my-way/research/intent-debt-osmani.md` — a tight summary of Addy Osmani's *The Intent Debt* (June 5, 2026) and what it means for My Way. Osmani's "three independent debts" is the *unmanaged* failure state; My Way's traceability chain (`intent → ADR → spec → test names`) re-couples those domains and banks trust at construction time, so it is a stronger answer than the essay's loose remedies — not a target for bolt-on review gates. Honest borrow: vocabulary, not mechanism ("intent debt — the one debt an agent can't repay"). Open question: where a load-bearing-but-sub-ADR rationale (the 300ms-debounce case) lives in the chain.

## 2026-06-04

- My Way landing (`docs/my-way/landing.html`): added a **Traceability** section and a traceability annotation band under the loop diagram, importing ideas from the `traceability-review` skill — the invariant (no loss, no contradiction; siblings don't diverge), forward/downward allocation completeness, backward/upward orphan (scope-creep) check, and complete enumeration as the method, with suggest-only + umbrella-ledger noted as mechanics.
- My Way landing (`docs/my-way/landing.html`): added two Traceability cards on the `spec → tests` final link — trust is banked at implementation time (progressive disclosure, TDD, review-before-merge), so a later drift review never re-opens the code; and test names are honest compressed promises of the code, making them the implementation's only interface to the chain (`intent → ADR → spec → test names`) — cheap by design and a consequence of the method, not a universal rule.
- Agonara branch PR prep: merged `origin/trunk`, preserved trunk's doc-drift README-only reset log entries, kept the expanded Agonara README implementation snapshot plus demo pointer, and refreshed `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh --sort=name` (total 220,072→220,762).
- Agonara: prepared the full-branch PR handoff for the gap-closure branch with a title/body covering all post-merge branch work, verification matrix, merge-policy notes, and Agonara boundary scope notes.
- Agonara: refreshed `docs/loc-dashboard.html` after LLM-assisted curation suggestion closeout so summary cards, table totals, data array, and update date match `scripts/loc-dashboard.sh --sort=name` (total 214,596→220,072).

## 2026-06-03

- doc-drift-agent: **reverted the scoped-agent effort to README-only** (clean slate). The 2026-06 work that generalised doc-drift from READMEs to per-project documentation **scopes** — the tested `scope-select` selection layer (ADR-001 Phases 1–3), the `/etc/cron.d` orchestrator (Phases 5–6), the scope registry, ADR-001, and the scoped design docs/plans — was built, deployed, and **removed**. Why: per-scope audits run the OpenClaw worker via the codex CLI harness, which fails fatally on automatic compaction once a run's context exceeds the budget (`codex app-server owns automatic compaction`), and a whole project's docs proved both too large and structurally too varied (agonara is admin/curator/student; oracle is backend/frontend) to be one universal audit unit. Deleted: `agents/doc-drift-agent/{scope-select,tests/scope-*,agent/scope-registry.json,runtime/cron/doc-drift-orchestrator.*,docs/scoped-audit-*,docs/plans/implemented/scoped-worker.md}`, `docs/adr/agents/ADR-001-*`, `docs/plans/implemented/scoped-agent-orchestration-*`, the `doc-drift-agent-core` CI workflow (+ its `ci.yml` wiring and the root `package.json` test glob), and `agents/handoff.md`. Reverted to README-only (hand-edited forward, preserving the operational additions — PR-idempotence, manual-timestamp step, fail-closed notification): `agent.md`, `drift-methodology.md`, `readme-inventory.md`, `report-format.md`, `notification-spec.md`, `fix-pr-template.md`, the project + runtime READMEs, the cron entry (back to `doc-drift-cron.sh`), and the ADR (now v0.0.8, README-only). **History preserved:** `agents/research/{openclaw-lobster,openclaw-taskflow,phase4-substrate-spike-findings,scoped-agent-orchestration}.md` are kept, plus git history (PRs #455/#457/#463/#465/#472/#473) and the ADR v0.0.8 reversion note. A future per-project review approach is a separate, later decision.
- ADR-001 orchestrator: fixed a **session-continuation bug** found while exercising the live orchestrator. `openclaw agent` with no session key resumes the agent's persistent default session, so every run appended to one session until it bloated (~1.2 MB / 18 MB on disk) and tripped a fatal codex automatic-compaction failure (`codex app-server owns automatic compaction`) that poisoned *every* later run — including trivial ones. Amended **ADR-001 → §8 (v0.0.4)**: each run MUST start a fresh per-run session, never continue. `doc-drift-orchestrator.sh` now passes a fresh `--session-key` per run; the wiring test asserts it. (Separately confirmed a *single heavy* audit can still exceed the budget within one run — that's a doc-drift scope/methodology concern, tracked apart.)
- Agonara: refreshed `docs/loc-dashboard.html` after adding the topic/period readiness spec and implementation plan so summary cards, table totals, data array, and update date match `scripts/loc-dashboard.sh --sort=name` (total 201,256→201,982).
- Agonara: refreshed `docs/loc-dashboard.html` after learner-state interpretation closeout so summary cards, table totals, data array, and update date match `scripts/loc-dashboard.sh --sort=name` (total 196,260→201,256).
- Agonara: refreshed `docs/loc-dashboard.html` after the Quick Check product UI implementation so summary cards, table totals, data array, and update date match `scripts/loc-dashboard.sh --sort=name` (total 186,479→191,294).
- ADR-001 orchestrator: executed **Phase 6 — schedule & deploy** (the deferred cutover) and archived the plan to `docs/plans/implemented/`. Deployed `doc-drift-orchestrator.sh` to the VPS (`107.172.143.196`, mode 700, byte-identical to the repo source) and repointed `/etc/cron.d/openclaw-doc-drift` from the legacy `doc-drift-cron.sh` to the scoped orchestrator (schedule unchanged, 01:00 UTC; backup kept). Verified live before the cutover with a manual orchestrator run: the selector picked `readmes`, the worker exited clean, per-scope state advanced (`lastAuditedCommit fa197344`), the drift-found path opened fix PR #464 and posted the Telegram notification — the fail-closed select→worker→commit→notify wiring proven end-to-end. The deploy is recorded in the `inventory` repo (`vps/OpenClaw/{README,log,cron/README,cron/openclaw-doc-drift}`). Next unattended confirmation is the 01:00 UTC tick.
- CLAUDE.md: began the gradual AGENTS.md→progressive-disclosure split. Added a one-sentence progressive-disclosure note at the top and a new `.agents/` folder of on-demand topic docs (README + skill-conversion TODO), then moved six sections out of the root verbatim: Collaboration preferences (read-at-session-start pointer), New Project Checklist, the Process Gates plan/PR procedures (always-on verification commands kept inline), Release Process details, doc-maintenance (README Components table + Log), and Per-Project CI Isolation. Root CLAUDE.md shrank 172→124 lines. Taught `scripts/loc-dashboard.sh` to count `.agents/` (mirroring `.claude/`) and refreshed `docs/loc-dashboard.html` to match `loc-dashboard.sh --sort=name` (repo-text 5077→5161, repo-scripts code 1176→1179, doc-drift-agent docs 1480→1481 drift; total 161,893→161,981).

## 2026-06-02

- ADR-001 orchestrator: ran the Phase 4 substrate spike live (OpenClaw `2026.5.28`, VPS `107.172.143.196`) and **dropped Lobster from the production path**. Two independent blockers: a `.lobster` step that invokes a nested `openclaw agent` turn deadlocks under the embedded runner, and the tasks/TaskFlow ledger records nothing on this unit for any run type (foreground agent, lobster tool, or cron-dispatched isolated turn) — `runs.sqlite` ~9 h stale while a 10-min cron succeeded, `tasks maintenance` all-zeros, `doctor` clean, no config gate. Observability instead comes from the orchestrator wrapper's fail-closed Telegram + log + per-scope state. Captured the evidence in `agents/research/phase4-substrate-spike-findings.md`, amended ADR-001 to v0.0.3 §7 (substrate swap to an `/etc/cron.d` imperative-shell wrapper — exactly the §5 *Decision stability* fallback; native `openclaw cron` can't drive a multi-step wrapper), put the ledger gap on watch (`agents/TODO.md` §4, recheck 2026-06-16), and refreshed the handoff + research notes.
- doc-drift-agent: relocated the project under `agents/` (`agents/doc-drift-agent/`), joining `maestro-flow-review-agent` in the fleet home — agent id, VPS workspace, cron, and Telegram routing unchanged. Dropped its dedicated drift scope per the consolidation scope model (registry now scope 0 + 21 project scopes; its `readmes` entry removed), matching maestro. Updated the coverage test, root `package.json` glob, and CI (`ci.yml` path filter, `doc-drift-agent-core`/`-sync` globs), and folded its LOC into the `agents` row across `loc-dashboard.sh`/`.html`, `products.html`, and the README `## Components` table (the standalone row is gone; `## Structure` now names both nested agent definitions). Dashboard refreshed to match `scripts/loc-dashboard.sh --sort=name`.
- doc-drift-agent: landed the Shape-2 scope-select selection layer (ADR-001 Phases 1–3) — tested `select`/`commit` step CLIs plus a per-scope last-audited state store under `doc-drift-agent/scope-select/`, covered by the existing `doc-drift-agent-core` CI glob. Refreshed `docs/loc-dashboard.html` to match `scripts/loc-dashboard.sh --sort=name` (doc-drift-agent code 138→395, tests 67→404; total 161,299→161,893).
- Process: refreshed `docs/loc-dashboard.html` for the scoped-worker branch — `doc-drift-agent` (tests 0→67, docs 1108→1480) and `agents` (docs 603→1066, the orchestration research notes), so the cards, table footer, and `data` array match `scripts/loc-dashboard.sh --sort=name` (total 160,397→161,299).
- agents/research: recorded the `@openclaw/lobster` plugin install/activation on the VPS (`agents/research/openclaw-lobster.md`) — orchestration ADR-001 substrate evidence; the live recovery steps live in the inventory repo's `vps/OpenClaw/migration.md`.
- doc-drift-agent: landed the scoped-worker registry (Shape 1). Added `doc-drift-agent/agent/scope-registry.json` (scope 0 + 22 project scopes) with a coverage check in the test suite, and a dedicated `doc-drift-agent-core.yml` CI workflow (per-project isolation) wired into `ci.yml` path-filter dispatch so the registry coverage check runs on doc-drift changes only.
- doc-drift-agent: fixed the unreadable Telegram drift notification. The cron wrapper was dumping the agent's raw Markdown report plus `openclaw agent` stderr (plugin warning + tool-call traces) into the message; rewrote it to parse the report header + Fix PRs URLs into a compact plain-text message (mirroring the maestro-flow-review wrapper fixed 2026-06-01), added a fail-closed "run FAILED" alert, and corrected the stale routing (`docdrift`→`ai-labs` account, DM→`#doc-drift` topic thread 4). `notification-spec.md` gained a mandatory "Rendering" section; the project's README/runtime-README/agent.md were realigned.
- Process: refreshed the repo LOC dashboard before the Student Workspace open-answer attempt PR so the summary cards, table totals, data array, and update date match the current branch.

## 2026-06-01

- loc-dashboard: fixed `scripts/loc-dashboard.sh` `count_text` to exclude `.claude/.DS_Store` (a macOS binary `wc -l` was counting as 3 lines, inflating `repo-text` to 5080 on macOS vs 5077 on CI — the cause of dashboard-sync PR #451's flapping); local and CI counts now agree. Refreshed `docs/loc-dashboard.html` to current state (`repo-text` 5080→5077, `dashboard-sync-agent` 1155→1217 docs, total 137,512→137,571).
- README registry: closed the real drift dashboard-sync-agent had been surfacing — added `agents/` to `## Structure` (OpenClaw agent-fleet operational docs + the nested `maestro-flow-review-agent/` definition) and removed the stale top-level `maestro-flow-review-agent` row from `## Components` (it moved under `agents/` in PR #450, so it no longer maps to a top-level directory). The derived surfaces (`scripts/loc-dashboard.sh` loop, `docs/loc-dashboard.html` data, `docs/products.html`) already tracked `agents` and already lacked maestro, so the README was simply behind them; this fix makes the registry match and creates no new surface drift.

- agents: renamed the shared OpenClaw account `docdrift` → `ai-labs` (it's the `@igor1309_ai_labs_bot` account, no longer doc-drift-specific). Live: renamed the account key + binding in `openclaw.json`, repointed all three cron wrappers' token reads to `accounts["ai-labs"].botToken` (hyphen → jq bracket form), restarted — gateway hot-reloaded and `[telegram] [ai-labs] starting provider (@igor1309_ai_labs_bot)`; test ping confirmed. Verified `normalizeAccountId` lowercases but preserves hyphens, so `ai-labs` is a valid id. Updated current-state references in `agents/README.md`, the maestro runtime README + wrapper, and `agents/TODO.md` (historical log entries left as-is); inventory updated separately. (Dashboard refresh still deferred.)
- agents/maestro-flow-review-agent: refreshed the agent's own docs (README/runtime-README/agent.md status + wrapper comment) from "deploying… to chat 54589373" to the live topic-routing state (`#maestro-review`, thread 2, supergroup `-1003954520541`). Removed the deleted `dashboardsync` account + binding from `openclaw.json` (bot deleted via BotFather); recorded in `inventory`. (`docs/loc-dashboard.html` refresh deferred until the topics work is fully complete.)
- agents: **one bot + per-agent supergroup topics is LIVE.** All three agents now run on `@igor1309_ai_labs_bot` in one forum supergroup (chatId `-1003954520541`), a topic each: `#maestro-review`=thread 2, `#doc-drift`=4, `#dashboard-sync`=6, `#health`=8. Inbound per-topic `agentId` routing (`groupPolicy: allowlist`, `requireMention: true`); outbound wrappers post `message_thread_id={2,4,6}`. Verified with a test ping into each topic (all landed correctly). Synced the maestro wrapper repo source to match live; doc-drift/dashboard-sync wrappers are VPS-only and recorded in `inventory`. Flipped `agents/README.md` + `agents/TODO.md` #4 to done. Refreshed `docs/loc-dashboard.html` (`agents` → 137/0/591; total → 137,498).
- agents: adopted the one-bot + per-agent-topic routing as the convention for all three agents (`agents/README.md`); rollout tracked in `agents/TODO.md` #4. Bot-settings prerequisites confirmed from OpenClaw docs: `/setjoingroups` enabled, bot admin with Manage Topics in a Topics-enabled supergroup; privacy mode can stay on if triggering by mention (admin bots receive all group messages anyway). `has_topics_enabled` is DM-only, not needed for a supergroup.
- agents: investigated and documented (`agents/TODO.md` #4) consolidating to **one bot + per-agent Telegram topics**. Confirmed against the installed OpenClaw 2026.5.28 docs that per-topic agent routing is native: a topic-only `channels.telegram.groups.<chatId>.topics.<threadId>.agentId` (or a `bindings[]` peer entry `peer:{kind:"group", id:"<chatId>:topic:<threadId>"}`), isolated per-topic sessions, outbound via `messageThreadId`, and `createForumTopic` to make topics. Target: one `@igor1309_ai_labs_bot` supergroup with a topic per agent (+ a `#health` topic for the dead-man's-switch) — supersedes the per-agent-account pattern and makes maestro's "no account" the intended shape.
- agents/dashboard-sync-agent: migrated notifications to the shared `@igor1309_ai_labs_bot` (account `docdrift`) per the convention — the live `dashboard-sync-cron.sh` now reads `accounts.docdrift.botToken` (backup taken; `bash -n` clean; verified with a test ping). The wrapper has no repo source (VPS-only), so this was a live edit recorded in `inventory`. `agents/TODO.md` #3 reduced to teardown of the now-unused `@dashboard_sync_agent_bot` / `dashboardsync` account.
- agents: post-deploy follow-ups. Added `agents/README.md` as the home for cross-cutting conventions — **all ai-labs OpenClaw agents reuse the `@igor1309_ai_labs_bot` bot (account `docdrift`) for notifications** (maestro complies; `dashboard-sync-agent` predates it), and `runtime/` cron wrappers are manually deployed (CI syncs only `agent/**`). Added two `agents/TODO.md` items (runtime wrappers not CI-synced; migrate dashboard-sync to the shared bot) and a maestro watch item (git-step warning on the first real run, PR ios.config#10 still well-formed). Backfilled `dashboard-sync-agent` into the `inventory` OpenClaw docs (pushed separately). Refreshed `docs/loc-dashboard.html` (`agents` → 135/0/557; total → 137,462).
- agents/maestro-flow-review-agent: **deploying to the OpenClaw VPS.** Added the CI sync workflow (`.github/workflows/maestro-flow-review-agent-sync.yml`), repointed the cron wrapper to reuse the existing `docdrift` bot for notifications (no new account/binding — invoked by id from cron), and concretized the runtime deploy steps from the live `openclaw.json` shape. Refreshed `docs/loc-dashboard.html` (`agents` → 135/0/506; total → 137,411).
- agents: sketched a cross-cutting `agents/TODO.md` for a **unified run-observability (dead-man's-switch) system** covering all cron-based agents (`doc-drift-agent`, `dashboard-sync-agent`, `maestro-flow-review-agent`, future). Captures the confirmed gap — no monitor observes whether a scheduled agent run *completed*, independent of OpenClaw, the host, and Telegram-message presence; absence-detection is manual today. Proposed shape: each wrapper checks in to an external watcher on genuine success (and on suppressed ticks, so suppression isn't misread as a miss); the watcher alarms on a missing check-in over a channel independent of the agents' Telegram bot/host. Explicitly distinct from infra-monitor (which watches service-port liveness, not run completion). Refreshed `docs/loc-dashboard.html` (`agents` → 134/0/496; total → 137,400).
- agents/maestro-flow-review-agent: moved the scheduled cadence to **03:00 UTC daily** (clear of OpenClaw's 04:00 OAuth-refresh window) and made the heartbeat wrapper **fail-closed**. The agent inherits the gateway model (`agents.defaults.model.primary = codex/gpt-5.5` over OAuth, OpenRouter fallback; no per-agent override). A model/auth outage previously would have posted a false `✓ ran — 0 findings` heartbeat; the wrapper now checks exit code + run-summary presence and posts a `⚠ run FAILED` alert instead. Refreshed `docs/loc-dashboard.html` (`agents` → 134/0/444; total → 137,348).
- agents/maestro-flow-review-agent: added the run-observability layer on a **heartbeat** model — every scheduled tick emits exactly one Telegram message (findings / `✓ ran — 0 findings` / `⏸ suppressed`), so a missing message at the daily 06:00 UTC cadence means the cron/host failed rather than "nothing happened". New `agent/notification-spec.md` + `agent/suppression-policy.md` (12h gate) and a `runtime/` cron wrapper; `agent.md` gained a step-9 parseable run summary the wrapper reads. Diverges from `doc-drift-agent` (silent on clean scheduled runs) by design. Refreshed `docs/loc-dashboard.html` (`agents` row → 113/0/414; total → 137,297).

## 2026-05-30

- agents/maestro-flow-review-agent: drafted a new specialized OpenClaw agent (third sibling to `doc-drift-agent` and `dashboard-sync-agent`) under a new top-level `agents/` directory. It reviews Maestro flow YAML in the external `igor1309/ios.config` repo against that repo's own `maestro-flows` review rubric (read fresh each run, never vendored) and proposes fixes as PRs — Verified findings applied as code on a `maestro-review/<slug>` branch, Provisional findings carried as line-anchored comments or commented-out drafts; never merges or approves. Registered the new top-level dir across the dashboard surfaces: `scripts/loc-dashboard.sh` (loop, `known` list, header) now tracks `agents`, and the pre-existing synthetic repo-wide-docs row — confusingly named `agents` — was renamed to `repo-text` (parallel to `repo-scripts`) to free the name; `README.md` `## Components` and `docs/loc-dashboard.html` (summary cards, table footer, `data` array) refreshed from `loc-dashboard.sh --sort=name`. Follow-up tracked to consolidate the existing top-level agents into `agents/`.
- tools/codex-mgr: added a `limits` command (per-profile Codex usage — 5h + weekly windows) against a live-verified ChatGPT usage endpoint, and promoted the tool from `sandbox/codex_mgr` to `tools/codex-mgr` with `install.sh`/`uninstall.sh` and mocked tests.

## 2026-05-28

- research/courses: refreshed the cross-source `positioning-notes.md` and `decision-matrix.md` against the new `careerfactory/` source. The two-half audience map (developers vs non-developer operators) was an artifact of the two-source sample; with a third source the organizing axis (object of practice) gains a third value and the "non-developer" audience splits into *operator automating their own routine* (AI For Work) vs *builder shipping their own product* (CareerFactory). Several earlier "both courses do X" patterns drop to "some": "system, not tricks" and "verification as a first-class step" are now 2-of-3, seat-capped scarcity is not universal (CareerFactory uses time/price scarcity), and "vibe coding" is shown to be contested (rejected by Khakhalev, reclaimed by CareerFactory) rather than uniformly avoided. EN-market and manager/senior-judgment white space is reinforced now that two of three offers target non-developers.
- research/courses: added `careerfactory/` competitor extraction (page-content, course-curriculum, selling-points) for the CareerFactory "Вайб-кодинг на максималках. IT архитектура с AI" landing page, mirroring the `khakhalev/` and `aiforwork/` three-file pattern. The offer targets non-developers (8-week cohort building a deployed Telegram bot; tariffs 19.9k–154k ₽; instructor positioned as Ex-CPO Skyeng), a different audience slice than the two prior surveys. Content was recovered from the Vue SPA's bundled route/section chunks; source discrepancies (instructor name variant, third-party legal seller, stale promo dates) are noted in the extraction rather than silently corrected. `positioning-notes.md`/`decision-matrix.md` not yet refreshed against this third source.

## 2026-05-27

- Process: pinned the whole repo to Node 22 via a root `.nvmrc`, replacing the per-project pin in `agonara/.nvmrc`. Native modules (`better-sqlite3`) require a single Node ABI across projects; a root pin gives one source of truth for dev, CI, and contributors.
- agonara: implemented the Program Shell and Membership first slice. The new program module exposes the spec's command/query surface (Program shell creation with atomic initial curator membership, self-join/leave/rejoin Student membership, read-only effective participation, and Admin-or-curator-scoped event queries) and extends backup/restore with the new state and an orphan-shell guard.
- agonara: implemented the private Admin operations UI board over the existing Identity HTTP API, including bootstrap/login/logout, identity operations, operational access inspection, audit inspection, and container UI smoke coverage.
- agonara: added the Admin operations UI board implementation plan, keeping the next slice focused on private-instance identity operations over the existing API.
- Process: pushed the implementation-plan structure gate down into the public skills. `dev-skills/public/process-gates` v1.1.0 adds a dedicated Plan Structure Gate (mandatory `Goal` / `Execution mode` / `Execution lock` / `Scope guardrails` / phases / `Done criteria` / `Final closeout` headings) plus pre-push adversarial plan review and PR-narrative quality checks; `dev-skills/public/adr-governance` reference now mirrors the same heading list and binds section 10/11 to explicit headings. Marketplace v1.48.0.
- Process: made My Way implementation-plan structure a hard repo gate in `AGENTS.md`, including required Done criteria, Final closeout, adversarial plan review, and PR title/body quality checks.
- agonara: added packaged-bin CLI acceptance coverage and a containerized first-Admin bootstrap smoke, fixing the CLI symlink entrypoint guard that prevented the installed bin from running.
- agonara: updated the project README with concrete CLI, HTTP, and Docker demo commands for the implemented Identity and Operations slice.
- agonara: fixed the Agonara CI Docker smoke to provide the required bootstrap secret while preserving runtime fail-fast behavior for missing operator configuration.
- Process: added a pre-PR reminder to refresh `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh` after substantial implementation or docs movement, then refreshed the Agonara LOC/dashboard numbers for this branch.
- agonara: completed the Identity and Operations first slice with executable acceptance coverage for CLI bootstrap, HTTP sessions, Admin flows, CSRF, rate limiting, request correlation, audit listing, and redaction.
- agonara: added minimum Identity backup/restore behavior for identity, credential, Admin authority, and audit state, with active sessions excluded and no-Admin restores rejected.
- agonara: added the first operator CLI for identity bootstrap status and first-Admin bootstrap, using JSON stdin for secrets and JSON stdout envelopes with accepted/rejected exit-code behavior.
- agonara: added the first Identity HTTP API routes with session cookies, CSRF checks, login/bootstrap rate limiting, audit response redaction, and Admin-session diagnostics.
- agonara: added Admin-protected Identity operations and audit paths for identity creation, credential binding, disablement, Admin grant/revoke, operational access inspection, identity listing, and audit listing.
- agonara: implemented first-Admin bootstrap, local-password login, session resolution, and logout over the new Identity storage boundary, with scrypt password hashes and bootstrap audit records.
- agonara: added the Identity persistence boundary with SQLite-backed records for identities, credentials, sessions, Admin authority, and audit events, including storage-level uniqueness and last-Admin invariants.
- agonara: added the operational walking skeleton with request correlation, health, diagnostics rejection, structured logs, redacted faults, and container health verification.
- agonara: started the identity and operations implementation with a dedicated backend workspace, per-project CI workflow dispatch, and Docker container-start smoke path.
- agonara: registered the project in the repo dashboard surfaces and tightened the implementation handoff so Dockerized private self-hosting is an explicit build, health, and log-verification gate before implementation PRs.
- agonara: moved accepted project ADRs from the repo-level ADR tree into `agonara/docs/adr/`, keeping project decisions co-located with Agonara docs while preserving repo-level ADRs for cross-project concerns.
- my-way: documented the method as semi-authoritative rather than rigid doctrine, and clarified that Pre-ADRs may include provisional candidate capability notes when they sharpen architectural discussion.
- prompts: decoupled `naming-availability-standard.md` from domain-specific references (agent orchestration, AI coding agents, LLM tooling). Hard Blockers, Availability Risk Reading, and Naming Target sections now reference user-supplied context parameters (target field, adjacent categories, intended technical surface) instead of hardcoded domains. Prompt is now reusable for any product naming context.

## 2026-05-25

- loc-dashboard drift: extended `check_project_drift` in `scripts/loc-dashboard.sh` with reverse drift detection — flags entries in the `known` list that no longer have a directory on disk. Catches the same class of stale-entry bug a human reviewer found in PR #405. Dotfile entries and known-transient dirs (`node_modules`, `vendor`, `worktrees`, `_inbox`) are skipped. The synthetic `agents` aggregate row is now self-documenting via a one-line comment. Two new tests cover the clean-trunk and missing-dir cases.

## 2026-05-24

- dev-skills: added Codex plugin manifest at `dev-skills/public/.codex-plugin/plugin.json` so dev-skills publishes as a Codex plugin in addition to the Claude Code marketplace. CI now guards version parity between `marketplace.json` and `plugin.json` in the `dev-skills-validation` job to prevent silent drift.

## 2026-05-23

- mac-health: bug fix after first live install — `check-disk.sh` was querying `df /` and reporting `status=ok / free_pct=48` on a Catalina+ machine that was actually at 1.2% free. Root cause: APFS shares space across a read-only system snapshot and a writable data volume; `/` reports capacity per-snapshot, not against the shared container. Fix: query `/System/Volumes/Data` on Catalina+ with fallback to `/`. Spec updated.
- mac-health: new personal-tooling subdirectory under `tools/mac-health/` for scheduled launchd-driven macOS health checks (memory, disk, leftovers). Landed intent + ADR-001 + spec (v0.1), checks runtime (`lib/common.sh`, three check scripts + a disk-leftovers wrapper), two LaunchAgent plists, `newsyslog` rotation config (1 MB / 5 gzipped archives), `install.sh`/`uninstall.sh` (installer refuses if `terminal-notifier` is missing on `PATH`), and `README.md`. 27-case shell test suite covers all 15 spec behavior tests. By design not an ai-labs project: no CI workflow, no release unit, no Components row, no `loc-dashboard` entry.

## 2026-05-17

- my-way: added `docs/my-way/prd-vs-product-intent.md`, a short framing note contrasting Product Intent with a PRD — PRD as a god document optimizing for "one place to look", Product Intent as a deliberately narrow layer optimizing for "one thing per place" with the rest delegated down the artifact chain.

## 2026-05-16

- dev-skills: added a local landing at `dev-skills/index.html` with a workflow graph and full 36-skill catalog. Linked the Dev Skills product card to the landing so the marketplace surface is discoverable from `docs/products.html`.

## 2026-05-12

- research/courses: added `aiforwork/` competitor extraction (page-content, course-curriculum, selling-points) mirroring the `khakhalev/` three-file pattern, plus a top-level `positioning-notes.md` distilling both surveys into a market map and a list of unfilled positioning slots (engineering-manager audience, EN-language market, senior judgment / failure post-mortems, curated cross-role structured path, async durable-artifact format, B2B-led channel). Inputs to `decision-matrix.md`; no commitments. The two surveyed RU offers split by *object of practice* (shared codebase vs participant's own routine), not by level — informing how the decision matrix reads its `Who` axis.
- Reinix rename: completed the pre-public product rename from Regentara to Reinix across the workspace package, CLI/runtime identity, release unit config, CI workflow, dashboard registries, docs, examples, and tests. No compatibility aliases were retained for the old CLI/config/URI names.

## 2026-05-10

- dashboard-sync-agent: Phase B complete and live. New OpenClaw account `dashboardsync` bound to bot `@dashboard_sync_agent_bot` (allowlisted DMs from chat 54589373); agent `dashboard-sync-agent` with workspace `/home/openclaw/.openclaw/workspace-dashboard-sync`; daily cron at 18:00 UTC (wrapper enforces 6h post-manual-run suppression). End-to-end dry run on `gpt-5.5` produced PR #355 covering all three surfaces (script header/loop/known list, products.html cards, loc-dashboard.html data array); merged. Cosmetic imperfection: Oracle's curated subtitle `"Oracle — Am I Done?"` lands inside the `<strong>` lead instead of replacing the card name — mirrors the existing Dragoman style. Spec iteration on `gpt-5.2` had revealed two model-interpretation issues (inverted "no product-type chip" rule, sub-component misclassification); both resolved by switching the OpenClaw default to `gpt-5.5`, not by spec changes. Plan archived to `dashboard-sync-agent/docs/plans/implemented/`.
- dashboard-sync-agent: B1 — CI sync workflow at `.github/workflows/dashboard-sync-agent-sync.yml` watches `dashboard-sync-agent/agent/**` on `trunk` and rsyncs to the OpenClaw VPS workspace, renaming `agent.md` → `AGENTS.md` on copy. Reuses the existing `OPENCLAW_DEPLOY_SSH_KEY` repo secret. Mirrors `doc-drift-agent`'s sync workflow.
- Products page: removed redundant type chips from grouped product cards in `docs/products.html`; the group headers now carry the category, and a regression test covers the static page markup.
- dashboard-sync-agent: Phase A complete. In-repo agent definition under `dashboard-sync-agent/agent/` — project-registry rule, synthesis spec, agent.md system prompt, report-format + fix-PR-template, notification spec (silent on scheduled+no-drift), and suppression policy (6h gate). Single stable branch `dashboard-sync/daily`; PR title `[dashboard-sync] daily sync — YYYY-MM-DD`. Open Questions resolved during Phase A. Phase B (CI sync workflow, VPS workspace, cron, dry run) remains.
- dashboard-sync-agent: registered as a top-level project for a sibling OpenClaw agent that keeps `scripts/loc-dashboard.sh`, `docs/products.html`, and the `docs/loc-dashboard.html` `data` array in sync with repo state on a daily 18:00 UTC cron. The root `README.md` `## Components` and `## Structure` tables are the authoritative project registries. Initial artifact set: intent + ADR v0.0.1 (proposed) + project README. README drift remains owned by `doc-drift-agent`; the two agents have disjoint editable-file allowlists.
- Process: clarified the plan-archive rule in `CLAUDE.md` — the `git mv docs/plans/<name>.md docs/plans/implemented/<name>.md` ships in the **same PR as the implementation**, not as a follow-up. The current loc-dashboard split landed in two PRs (#339 implementation, #340 plan archive) before the rule was sharpened; the new rule prevents the brief incoherent window on trunk where the implementation is in but the plan still sits as "to do".
- LOC dashboard: split `docs/loc-dashboard.html` into a LOC-only page plus a new `docs/products.html` portfolio page, each linking to the other. Refreshed the data array (clipdeck and doc-drift-agent had drifted post-merge), added a `Last updated:` footer line on the LOC page, and grouped the 18 product cards by category. Drove from validated design research; the rejected recommendations (grouped bars, hiding zero-rows, hero-ratio promotion) are recorded in the implementation plan as out of scope.
- doc-drift-agent: added PR-idempotence to the agent prompt. The agent now lists open `[doc-drift]` PRs before opening new ones and marks already-covered findings as `existing` instead of duplicating. Report and Telegram notification surfaces extended to carry `new`/`existing` status. Without the check, daily scheduled runs against an unmerged backlog of fix PRs would have produced duplicates each cycle.
- doc-drift-agent: rotated the docdrift bot token after GitGuardian flagged inline-token commits on the PR branch. Wrapper now reads the token from `openclaw.json` via `jq`; branch history rewritten and force-pushed (sanitized commit `c6621d90`). Token rotated via BotFather and updated on VPS. Inventory log records the incident.

## 2026-05-09

- doc-drift-agent: closed the manual-run timestamp gap. Probed the agent's tools live (write, exec, others — confirmed unrestricted). Added step 9 to the agent prompt: on manual runs, the agent writes `last_manual_run_utc` to `state.json` itself. Verified by isolating step 9 in a one-shot invocation. The 12h suppression gate is now operational.
- doc-drift-agent: live on OpenClaw VPS. Phase B end-to-end: CI sync workflow ships `doc-drift-agent/agent/**` on trunk merge; new Telegram bot `@igor1309_ai_labs_bot` routes to a dedicated agent with allowlisted DMs from chat `54589373`; daily cron at 01:00 UTC fires the agent against a refreshed `/home/openclaw/ai-labs` clone, posting a Telegram ack on every run; fix PRs are opened against `igor1309/ai-labs` via the maintainer's `gh auth` PAT. Dry run produced PRs #337 and #338 with the `[doc-drift]` title prefix. The original Phase A architecture assumed the wrong OpenClaw layout (a per-agent prompt directory under `~/.openclaw/agents/<name>/agent/`); the live layout uses workspace + binding with `AGENTS.md` as the system prompt — corrected during Phase B Task B1 plan rewrite.

- doc-drift-agent: Phase A complete. Committed the agent's full in-repo definition set — README inventory, drift methodology, agent prompt (`agent/agent.md`), drift report format, fix-PR template, Telegram notification spec, and 12-hour UTC suppression policy — under `doc-drift-agent/`. Branch convention pinned to `doc-drift/<slug>`; agent prompt filename inside `~/.openclaw/agents/doc-drift-agent/agent/` left provisional with verification owed to Phase B Task B2 (recorded as new open question #7). Plan stays at `doc-drift-agent/docs/plans/doc-drift-agent.md` until Phase B closes.
- doc-drift-agent: registered as a top-level project for the specialized OpenClaw agent that reviews README drift across `ai-labs`. Added project README and seed log, root `README.md` Components row, `scripts/loc-dashboard.sh` (header comment, per-project loop, drift `known` list), and `docs/loc-dashboard.html` product card + data array entry. `release-units.config.toml` intentionally not updated — the runtime lives in OpenClaw, not in this repo. Implementation plan in `doc-drift-agent/docs/plans/doc-drift-agent.md`; integration wiring (Phase B) is blocked on six open questions.

## 2026-05-07

- Scheduled workflows hardened against GitHub-hosted runner contention: shifted both `scheduled-health.yml` (06:00 → 06:17 UTC) and `loc-dashboard.yml` (06:00 → 06:23 UTC) off the top-of-hour cron herd that caused both runs to fail on 2026-05-06 with "The job was not acquired by Runner of type hosted even after multiple attempts" (15-minute queue timeouts, no script ever ran). Also added a Telegram failure-notify job to `loc-dashboard.yml` (mirroring the existing pattern in `scheduled-health.yml`) so a future silent miss surfaces instead of just being a missing daily snapshot.

## 2026-05-05

- clipdeck: app version moved from footer to header (next to the `clipdeck` wordmark), keeping the original subtle styling. Bumped to v0.1.12 to ship together with the v0.1.11 prompt title/subtitle flip whose tag was never created.

## 2026-05-04

- my-way: added `docs/my-way/informal-brief.md`, a personal-voice companion to the formal pre-/coding-phase notes that names the intuitions the structured docs cannot carry — intent is the hard part, brainstorm with a harness when it is stuck, prune to ~7 stories with forced justification, downstream must bend to intent. Linked from the landing hero and footer.
- my-way: copy-edit pass across `landing.html`, `pre-coding-phase.md`, `coding-phase.md`, the Product Intent note, the bug-fix variant, and the research and product-intent-review skills. Mostly added missing relative `that` (notably `"the user promise that downstream artifacts must preserve"` on the landing) and fixed tense/aspect (`"the process broke"` → `"is broken"`, `"meaningfully changing"` → `"being meaningfully changed"`).

## 2026-05-02

- LOC dashboard: refreshed the static landing from `scripts/loc-dashboard.sh` after the Product Intent docs landed on `user-stories`; agents docs now report 4,941 lines and repo total is 104,263.
- LOC dashboard refresh: synced `docs/loc-dashboard.html` data array with current `scripts/loc-dashboard.sh` output (clipdeck 0/0/290 → 1114/1472/1782; reinix 952/1712/4585 → 2792/4906/7964; smaller drift in nomos, dev-skills, session-digest, agents, repo-scripts, claude-insights). Updated the Clipdeck product card from docs-only to a deployed Cloudflare Worker (clipdeck.enoa.ai) with refreshed stack tags.
- my-way: implemented the Product Intent layer above research/pre-ADR/ADR/spec/implementation planning, adding story-centered note/structure/example artifacts, drafting/review skills, downstream traceability guidance, and lightweight variant escalation rules.
- GitHub Actions Node 20 deprecation cleared — bumped `actions/checkout@v4 → v5` (Node 24 runtime) and `dorny/paths-filter@v3 → v4` across all workflows ahead of the June 2026 forced upgrade and the September 2026 Node 20 removal. Stayed on `checkout@v5` rather than `v6` to avoid the credential-handling change in v6.
- clipdeck v0.1.7: added a deployed-version footer (`/api/version` + bottom-of-page render) so we can confirm at a glance which Worker build a browser is actually loading. Backfilled a missing frontend test that asserts the rendered subtitle text matches `item.subtitle` to lock in the description-fetch behavior shipped in v0.1.5/v0.1.6.

## 2026-05-01

- LOC dashboard landing: refreshed product cards in `docs/loc-dashboard.html` — promoted reinix from `Concept`/Design to a `CLI` MVP workflow runner with current tags, and renamed dragoman to "The Dragoman" with description and tags reflecting a posts-and-imagery channel rather than docs-only. `scripts/loc-dashboard.sh` was reviewed and needs no changes (it counts LOC and does not classify project type).
- clipdeck: added release-unit and CI/CD wiring for tag-driven Cloudflare Worker deploys, plus the first-deploy operator runbook and README component update.
- clipdeck: implemented the static iPhone frontend and Worker Static Assets routing, including unlock, reload, copy feedback, and resource-backed skill styling tests.
- clipdeck: implemented the authenticated `GET /api/items` Worker endpoint with GitHub Contents API reads, sanitized section assembly, and spec-shaped upstream/source-missing errors.
- clipdeck: implemented Phase 1 pure units for front matter stripping, prompt/skill discovery, and response section assembly, covering malformed front matter tolerance and deterministic item ordering.
- clipdeck: scaffolded as a private TypeScript Cloudflare Worker workspace with Wrangler config, Workers-pool Vitest coverage, and root test-gate integration.
- clipdeck: registered as a docs-only top-level project — added to `README.md` Components table, `scripts/loc-dashboard.sh` (loop, header comment, drift `known` list), and the `docs/loc-dashboard.html` landing (product card + data row). Initial artifacts are an accepted ADR and a draft spec for an iPhone-friendly private webpage that copies prompts/skills with server-side front matter stripping.
- New Project Checklist: added `docs/loc-dashboard.html` (product card + data array) and `<project>/docs/log.md` (seed entry) as required surfaces in `CLAUDE.md`, closing the drift that left dragoman off the landing on 2026-04-29. Also backfilled the dragoman product card and data row to clear that gap.
- Supabase keep-alive: switched the scheduled workflow from a SELECT ping to a PATCH against a dedicated `public.keepalive` table (`claude-insights/migrations/002_keepalive_table.sql`). Read-only pings did not reliably reset the free-tier inactivity timer — Supabase still issued a pause warning despite three days of green keep-alive runs. A write is unambiguous DB activity. Migration must be applied before the workflow change merges.

## 2026-04-30

- Linear: added `course-exploration` project (id `f4aa9d0e-3646-411c-8763-8239a2979937`) as a sibling of `ai-labs` to hold a raw, unstructured course-development idea; updated `CLAUDE.md` Linear section to list both projects under the shared workspace/team. Materials remain under `research/courses/` in this repo.
- pr-ci-watch: added `scripts/watch-pr.sh` wrapper and the `Bash(./scripts/watch-pr.sh:*)` allow rule so PR CI watching no longer triggers a permission prompt for the `/tmp/<repo>-pr-<pr>.log` redirect. The wildcard `Bash(... > /tmp/*)` form does not match a redirect with a trailing `2>&1`, so encapsulating the redirect inside a script is the cleanest fix.
- Linear: linked the repo to Linear project `ai-labs` (workspace `igor1309`, team `IG`, id `e94949cf-0479-4539-bced-7a737e5d874b`) by recording the metadata in `CLAUDE.md` so agents skip the lookup. Considered also adding a `.linear.toml` at the repo root for `schpet/linear-cli` compatibility — deferred until that CLI is actually adopted.
- Research: added a structured extraction, derived curriculum, and selling-points brief for Timur Khakhalev's AI Coding course landing page under `research/courses/khakhalev/`.

## 2026-04-29

- dragoman: renamed the docs-only top-level project directory from `the-dragoman/` to `dragoman/` so the project slug is distinct from the "The Dragoman" Telegram channel name.
- dragoman: registered as a docs-only top-level project — added to `scripts/loc-dashboard.sh` and the README `## Components` table. No CI changes needed: the project is absent from every `ci.yml` path filter, so per-project core jobs stay skipped on doc/image-only changes.
- LOC dashboard: classified `img`/`images` as known top-level dirs and added them to `EXCLUDES` in `scripts/loc-dashboard.sh` so README banner asset folders are explicitly skipped and no longer trip drift detection.
- LOC dashboard workflow: added `curl --max-time 30` to the Telegram step so a hung Telegram connection fails fast instead of stalling the run (root cause of the 2026-04-29 exit-56 failure).

## 2026-04-28

- Refreshed `docs/loc-dashboard.html` data array to match current `scripts/loc-dashboard.sh` output; reinix now reflects post-MVP code (`952/1712/4585`), and drifted entries for nomos, dev-skills, agents, session-digest, and repo-scripts updated.

## 2026-04-27

- ADR: added `docs/adr/cli-settings-convention.md` — repo-level rule covering discovery precedence, first-run bootstrap, structural-vs-catalog split, and settings-error class for CLI tools. Lists known violations in `reinix` and `session-digest` to close via per-tool plans.
- Nomos: remove inert `nomos-shared` declaration from the repo prod compose (CI never copies it) and the orphan `docker build -t nomos:latest .` from staging deploy. Cleanup of dead promises after the rollback redesign. See `nomos/docs/log.md`.
- Nomos: rewrite rollback path to operate on the actually-used `nomos-nomos:latest` image so a failed prod deploy can restore the previous version. See `nomos/docs/log.md`.
- Nomos: force `--build` on prod compose so deploys rebuild the auto-named prod image instead of caching the previously built version. See `nomos/docs/log.md`.
- Nomos: declare `nomos-shared` external network in the prod compose so Caddy retains staging connectivity across `docker compose down/up`. See `nomos/docs/log.md`.
- reinix: scaffolded as a Node ESM workspace package and release unit; LOC dashboard tests now treat it as an implemented code component instead of docs-only.
- reinix: created MVP workflow runner implementation plan from accepted spec and ADRs; addressed architecture-doc review (test ownership, skill references, release-unit posture, provider-CLI module split, worktree creation step, Node version pin, commit staging scope). See `reinix/docs/log.md`.
- Reverted out-of-scope Nomos release/deploy changes from the session-digest branch and removed the mistaken Nomos release tags.
- session-digest: replaced the Deep Agents prototype role with a V2 local-ledger and bounded-synthesis CLI, including dependency cleanup and component documentation updates.
- Process docs: made implementation plans explicitly declare execution mode, review stops, worktree mode, push policy, and final archiving so future plan execution can auto-continue without ambiguity.

## 2026-04-26

- session-digest: exploration docs complete (ADR-001, CLI spec, Deep Agents/NVIDIA NIM use cases, and TypeScript implementation plan). See `session-digest/docs/log.md`.

## 2026-04-25

- reinix: MVP ADR set complete (agent settings, model routing, CLI execution boundary, failure policy, run artifact storage). All reviewed and accepted. See `reinix/docs/log.md`.

## 2026-04-24

- Notio frontend v0.1.0: dark theme UI, fixed Cloudflare Pages deploy project name.

- AI Labs landing page: product cards for all 14 projects with 2-column grid and scroll/hover animations.

- Release docs: aligned explicit configured basename invariants and README component entries with the Notio backend/frontend release split.

- Release ADRs: clarified explicit configured basenames for nested release units so symmetric component folders can still use globally unambiguous tags.

- LOC dashboard: consolidated oracle into single row, added missing code extensions (.svelte, .sql, .css, .html, .mjs), merged gen/scripts columns into code, renamed text to docs, added per-project .md counting, added nexum/niora/reinix as regular rows, added .wrangler to exclusions.

- CI: narrowed `notio` path filter to Swift-only paths (Sources, Tests, Package.swift, Package.resolved), removing infra paths (supabase, Dockerfile, docker-compose, scripts, release.toml) that don't need the 15-min Swift test suite.

## 2026-04-23

- LOC dashboard: added reinix to known dirs and docs-only list, clearing drift warning.
- reinix: new project — AI orchestrator (governance/routing layer over other agents). Initial docs: naming brief, name pool, orchestration design, and research notes.
- CI: switched `notio` path filter from catch-all `notio/**` to inclusion-only (Sources, Tests, Package.swift, Dockerfile, etc.) so doc-only changes skip the expensive `notio-core` Swift build. Negation patterns don't work — `dorny/paths-filter` OR's all lines.

## 2026-04-21

- dev-skills: made igor1309/skills public for Web Agent plugin access. Added project-level `.claude/settings.json`. Marketplace v1.32.1.
- Removed `paths-ignore` from `ci.yml` — the `report` required check was never created on doc-only PRs, blocking auto-merge. Path filtering now handled entirely by `dorny/paths-filter` inside the workflow.
- agent-retro architecture note: reinstated Open questions section with five architecture-level gaps surfaced during review — digest-engine behavior on uncovered sessions, canonical-session mapping ownership, digest artifact lifecycle, report-writer invocation boundary, and digest window shape vs session-based model. All are structural/contract questions deferred to the follow-up ADR/spec.
- agent-retro architecture note: added a Boundary summary bullet for deep inspection — "a bounded second-pass stage within the digest engine, applied only to promoted sessions and using retained evidence from the index/store" — consolidating the mechanism, scope, input-source, and cost-bound properties decided in prior patches.
- agent-retro architecture note: added "Stable canonical-session identity" key constraint — canonical-session collection, refresh, and coverage all require stable session identity; the exact derivation is deferred to the follow-up ADR/spec.
- agent-retro architecture note: clarified deep inspection as an internal second-pass stage of the digest engine that runs only on promoted sessions and reads from the index/store (never raw sources). Tightened retained-evidence wording to concrete categories (session trajectory, notable retries/failures, tool activity, supporting excerpts) with full raw retention not required. Added a bounded deep-inspection cost constraint (configurable limits on promoted sessions inspected per run and evidence per session). Removed the remaining open question, and with it the Open questions section.
- agent-retro architecture note: shifted coverage from timeframe-shaped to session-shaped. Coverage metadata is now tracked per canonical session (source id, canonical session identity, collection outcome, collected at, collection mode, collector/schema version); requested timeframes retained only as run/request metadata. Planner wording now explicitly separates timeframe (selection input) from coverage (per-canonical-session truth). Resolved the open question on coverage representation.

## 2026-04-20

- Added `.github/workflows/` README.md and CLAUDE.md (with AGENTS.md symlink) documenting CI architecture, agent rules, and paths-ignore policy.
- CI now skips `**/sandbox/**` and `**/research/**` at any nesting level (previously top-level `sandbox/` only, `research/` missing).
- Repo-root `AGENTS.md` is now a symlink to `CLAUDE.md` (was the reverse). Convention documented in README.

## 2026-04-19

- notio: two-phase capture feedback (`notio_v0.3.0`) — receipt acknowledgement and final outcome messages via Telegram. 144 tests, Docker verified.

- notio: deployed `notio_v0.2.0` — full capture pipeline (parse → enrich → persist to Supabase) live on VPS. Fixed deploy ssh timeout and added `paths-ignore` to CI `pull_request` trigger to skip builds on docs-only PRs.

- LOC dashboard: clarified that the report is implementation-footprint-only, surfaced omitted docs-only/pre-implementation dirs (`nexum`, `niora`) in output, and fixed repo-level test counting to include `scripts/tests`.

- absorb-ai-coder: absorbed the remaining reusable content from `ai-coder/README.md` into the root `README.md` and `dev-skills/README.md`, then removed the obsolete `ai-coder/README.md` file.

- absorb-ai-coder: absorbed the old `ai-coder/AGENTS.md` structure and publishing facts into the root `README.md`, then removed `ai-coder/AGENTS.md` and its paired `ai-coder/CLAUDE.md` symlink now that those repo-orientation notes live at the monorepo root.

- absorb-ai-coder: moved `ai-coder/docs/` into `dev-skills/docs/` by promoting the ai-coder log and archived dev-skills migration docs into the dev-skills documentation area. Updated the active absorption plan so it reflects the follow-up moves already completed on this branch.

- absorb-ai-coder: promoted `ai-coder/gemini/` to root `gemini/` and fixed the CI drift this created by adding `gemini/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/gemini` or root `gemini/`.

- absorb-ai-coder: promoted `ai-coder/tools/` to root `tools/` and fixed the CI drift this created by adding `tools/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/tools` or root `tools/`.

- absorb-ai-coder: promoted `ai-coder/sandbox/` to root `sandbox/` and fixed the CI drift this created by adding `sandbox/**` to `ci.yml` `paths-ignore`. The repo-wide `sandbox-todo-issues.yml` remains intentionally active for root `sandbox/` entries.

- absorb-ai-coder: promoted `ai-coder/dev-skills/` to root `dev-skills/` and fixed the workflow drift this created by switching `sync-skills-public.yml` from `ai-coder/dev-skills/public/**` to `dev-skills/public/**` and adding `dev-skills/**` back to `ci.yml` `paths-ignore`.

- absorb-ai-coder: promoted `ai-coder/guides/` to `migrate-to-skills/guides/` and fixed the workflow drift that surfaced from the new root destination by adding `migrate-to-skills/**` to `ci.yml` `paths-ignore`. No active workflows reference `ai-coder/guides` or `migrate-to-skills/guides`.

- absorb-ai-coder: promoted `ai-coder/prompts/` to root `prompts/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/prompts`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/debates/` to root `debates/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/debates`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/reading/` to root `reading/`. Workflow audit for this step found no path drift: no active workflows reference `ai-coder/reading`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: promoted `ai-coder/insights/` to root `insights/`. Workflow audit for this step found no path drift: no workflows reference `ai-coder/insights`, and the move does not change the existing CI behavior for these assets.

- absorb-ai-coder: moved the imported `_inbox/` from `ai-coder/_inbox/` to repo root and fixed the workflow drift that surfaced on this branch by adding `_inbox/**` to `ci.yml` `paths-ignore`; `sync-skills-public.yml` still correctly targets `ai-coder/dev-skills/public/**`, and `sandbox-todo-issues.yml` remains intentionally repo-wide.

- absorb-ai-coder: imported `~/dev/ai-coder` into ai-labs under `ai-coder/` with full tracked history preserved, keeping repo-level assets intact and separating any later restructuring into follow-up work.

- LOC dashboard: added neris (Swift), notio (Swift), claude-insights (TS/Python); extended counting to .swift/.py; fixed agents text count (removed dead .codex ref, added per-project AGENTS.md, skills, my-way docs); added drift detection for new top-level dirs; wired drift warning into CI workflow.

- my-way: clarify the pre-coding phase as judgment-driven and iterative; extract first-class skills for research, pre-ADR, ADR, spec, and implementation planning; add transition tracking, promotion checklist, and future-shape note so the approach can move toward skills without forcing a premature final information architecture.

## 2026-04-18

- Added `notio-core.yml` CI workflow and wired it into `ci.yml` path-filter dispatch — notio tests now run on PRs in a `swift:6.1` Linux container, catching platform-specific failures before merge.

- Split shared `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` CI secrets into per-project `NOMOS_VPS_*` and `NOTIO_VPS_*` in `release-unit.yml` — nomos deploys to 95.164.53.144, notio deploys to 107.172.143.196.

## 2026-04-06

nexum: reviewed and fixed

## 2026-04-05

nexum: complete architecture doc set — pre-ADR spec, frontend ADR (v0.2.0), backend ADR (v0.3.0), OpenAPI contract (v1.4.0), frontend auth ADR, backend auth ADR, architecture review amendments, supersession note, component architecture approach, and naming brief.

## 2026-03-29

claude-insights: add `claude-insights-deploy.yml` — trunk-only CI workflow that detects changed Supabase Edge Functions (`notify-insights`, `telegram-bot`) and deploys only those affected; `_shared/**` changes trigger both. Issue #110.

claude-insights: `/compare` now accepts an optional week count (`/compare 3`), defaults to 2 weeks; narrative trim scales inversely with snapshot count (more chars per row for fewer rows). Issue #109.

claude-insights: fixed a cluster of reliability issues — Supabase keep-alive now works end-to-end from the weekly LaunchAgent (wrong CLI flag, SSL crash, and non-fatal refresh); `/compare` no longer 413s (payload trimmed to LLM-relevant fields + capped narrative). PRs #103–108.

## 2026-03-14

claude-insights: add `/compare` bot command — LLM-powered week-over-week trend analysis via Nomos. New `_shared/llm.ts` helper, Nomos project registered, secrets set, function deployed. Add Nomos key isolation rule to AGENTS.md. PR #96.

## 2026-03-04

corpus-scout: improve test coverage per testing doc — add must_contain, no-extra-files, and ripgrep precondition assertions. Document ripgrep dependency in CI workflow.
corpus-scout: add determinism eval runner (ADR-0002) with adapter, eval engine (ESM/NCFB/MUST gates), reporter, synthetic Russian humanities corpus (12 files), and gold dataset (30 cases). Zero run-to-run drift across consecutive runs. PR #80 merged.

## 2026-03-03

Add `corpus-scout` — reusable MCP server for lexical search and section reading over any local text corpus via ripgrep. Two tools (`search`, `read_section`), configurable via env vars, dedicated CI workflow. Implements ADR-0001 file-first retrieval. PR #76 merged.

promote langfuse stack from `web-scout/docker/langfuse/` to shared `docker/langfuse/`; all projects can now share a single local instance
web-scout: add `mcp-search` child span to Langfuse smoke tracing (PR #73); complete Langfuse v3 observability for rules 5 and 11; rule 6 (LLM token/cost) documented as blocked by CrewAI OTel provider conflict. All 21 unit tests pass. See `web-scout/docs/log.md`.
web-scout: migrate smoke script to Python + CrewAI + nomos and get first passing run. Fixes: malformed MCP tool schema causing OpenRouter 502s, LiteLLM model routing through custom base_url, Python venv setup. See `web-scout/docs/log.md`.

## 2026-03-02

web-scout: add structured JSON logging to stderr (startup + per-call), `LOG_LEVEL` env var, and updated README. See `web-scout/docs/log.md`.
Add web-scout CI workflow (`web-scout-core.yml`) and path-filter dispatch in `ci.yml`.

## 2026-03-01
Replace inline Telegram curl in `release-unit.yml` deploy notification with shared `ci-shared/scripts/notify_telegram.sh` (fixes #62, #61). Transport script is copied to VPS via existing scp step.
Extract Telegram transport to `ci-shared` (PR #64 merged): shared `notify_telegram.sh` with ADR-001 curl flags, local adapter in `scripts/ci/`.

## 2026-02-28
Remove Loki from CI: delete `loki-core.yml`, remove from `ci.yml` dispatch and notify, remove from `npm test` glob. Loki code and tests stay in repo.
Relax ADR-003 basename reuse invariant from MUST NOT to SHOULD NOT (enforcement deferred).
Fix AGENTS.md: clarify `release-unit.yml` is post-tag pipeline; detection and tagging are operator scripts.
Amend ADR-006 and AGENTS.md: mark Docker registry publishing as deferred, VPS-local tagging is current behavior.
Remove non-functional historical basename reuse check from `validate-manifest.js`.
Add release script tests to CI `release-validation` job.
Fix `github-release` condition: block when Nomos staging deploy fails.
Extract inline deploy scripts to `nomos/scripts/` (staging, prod, rollback) and call from `release-unit.yml`.
Add automatic rollback to prod deploy: tag previous image as `nomos:rollback`, restore on failure.
Unify `release.yml` notification: replace inline Telegram logic with reusable `notify-telegram-failure.yml`.
Add daily scheduled health check (`scheduled-health.yml`): Nomos staging/prod health endpoints + LLM smoke test, Telegram notification on failure.
Close release ADR review (review-2): all findings resolved, ADR-003 Decision Stability upgraded to pass.
Oracle: wire LLM calls through Nomos proxy. See `oracle/docs/log.md`.

## 2026-02-27
Nomos: add Telegram deploy success notification. See `nomos/docs/log.md`.
Nomos: add deploy smoke checks (version in /health, real LLM call). See `nomos/docs/log.md`.
Nomos: add CI/CD deploy pipeline via SSH (ADR-0002). See `nomos/docs/log.md`.
Nomos: deploy to production VPS (<NOMOS_DOMAIN>), fix deployment guide with lessons learned. See `nomos/docs/log.md`.
Update AGENTS.md (Release Process section) and README.md to reflect new per-unit release model (ADR-000–006), add ADR Governance section to AGENTS.md.
Implement release architecture (ADR-000–006): config-driven unit discovery (`release-units.config.toml`), committed manifest (`release-units.toml`), tag-based detection, per-unit `<basename>_v<version>` tagging, Docker image tagging (version + SHA), trunk enforcement, CI manifest drift check, new `release-unit.yml` workflow, legacy `v*` workflow documented as coexistence boundary. 51 release tests passing.
Create release architecture implementation plan (ADR-000–006): 5-phase invariant-driven plan covering unit discovery, release detection, tag creation, Docker image tagging, and end-to-end lifecycle validation.
Review release ADRs (000–006): pass with 4 warns (nested basename derivation, underscore separator ambiguity, first-release edge case, Docker applicability scope).
Wire nomos as npm workspace; remove redundant `cd nomos && npm ci` from CI workflows.
Nomos: complete V0 implementation (Phases 2-6) — runner abstraction, auth & project identity, unified API proxy with SSE streaming, cost control & budget enforcement, prompt safeguards. 130 tests, all passing. See `nomos/docs/log.md`.

## 2026-02-26
Release `v0.2.0`.
Nomos: implement Phase 1 scaffold — Express + SQLite + Caddy skeleton with health endpoint, unit tests, e2e smoke test, Docker deployment files, and CI pipeline wiring. See `nomos/docs/log.md`.

## 2026-02-23
Fix `Release` workflow startup failures by simplifying tag resolution and reusable-workflow wiring.
Release `v0.1.5`.
Put Loki rollout on hold for Oracle observability and keep Oracle on Workers-native logging/telemetry for the current phase.
Extract Oracle core CI into `oracle-core`, dispatch by changed project paths, and gate `real-provider-smoke` on Oracle/shared changes.
Oracle: implement locale v2 (backend + frontend). See `oracle/docs/log.md`.
Add Loki logging stack decision + implementation plan docs (single-host Loki+Grafana, host Alloy journald-first ingestion, 14-day retention, Cloudflare Tunnel + Access).
Release `v0.1.4`.
Stop uploading custom GitHub Release assets (GitHub always includes source archives).
Release `v0.1.3`.
Create minimal GitHub Releases for successful `v*` tag-driven deployments.
Harden tag-driven release workflow (verify tag on trunk/checkout, centralize node version, and reuse Telegram notify wiring).
Switch CI real-provider smoke model to `openai/gpt-5-nano` via Actions variable `OPENROUTER_CI_MODEL`.

## 2026-02-22
Add Telegram notifications on CI failure to both CI and Web E2E workflows using `CI_BOT_TOKEN`/`CI_CHAT_ID` secrets.
Oracle: document local-dev automation and config defaults. See `oracle/docs/log.md`.
Add repo-wide `.env`/`.dev.vars` gitignore protection so local secret files stay untracked by default.

## 2026-02-21
Add Playwright-based web E2E test wiring to CI (browser install + `RUN_WEB_E2E=1` test execution) while keeping local suite runs deterministic.
Add `oracle` project with `seed.md` doc.
Create `ia-labs` repo (name by gpt-5.2).
