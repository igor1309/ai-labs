# Dev Skills

Custom skills for Claude Code, focusing on interactive development workflows and career advancement tools for software engineers.

## Skills

### ADR Governance

ADR structure, review standards, and implementation plan requirements for Architecture Decision Records.

**Key features:**
- 6-section progressive disclosure template (Executive Summary, Context, Decision, Rules/Invariants, Consequences, Non-Goals)
- 4-dimension review standard (Intent Integrity, Boundary Clarity, Cross-ADR Consistency, Decision Stability)
- Implementation plan planner requirements with ADR traceability matrix
- Self-contained — all reference documents bundled in `references/`

**Use when:** Creating, reviewing, or implementing Architecture Decision Records.

**Documentation:** See [adr-governance/SKILL.md](adr-governance/SKILL.md)

### Architecture Doc Review

Checklist for reviewing architecture and design docs in PRs.

**Key features:**
- 6 criteria: ambiguity, clarity, consistency, readability, best practices, drift resistance
- Each criterion graded as pass/warn/fail
- Requires exact `file:line` references and concrete fix text
- Scoped to changed/added docs only

**Use when:** Reviewing architecture docs, design docs, or ADRs in pull requests.

**Documentation:** See [arch-doc-review/SKILL.md](arch-doc-review/SKILL.md)

### Architecture Reviewer

Structured, detached evaluation of component or system architecture clarity and intent.

**Key features:**
- Objective distance — evaluates what's there, not what it could have been
- Assesses clarity, coherence, boundaries, cohesion, and rationale
- Five-dimension output: Overall Impression, Strengths, Concerns, Blind Spots, Next Steps
- No rewrites or alternative proposals — directions for clarification only

**Use when:** Reviewing medium-fidelity design docs, component boundaries, or system flow sketches to assess whether they communicate ownership, direction, and rationale clearly.

**Documentation:** See [arch-reviewer/SKILL.md](arch-reviewer/SKILL.md)

### Architecture Specification Review

Review architecture specifications for completeness, appropriate abstraction level, and separation of concerns.

**Key features:**
- Evaluates boundaries, flows, constraints, and extension points
- Ensures specs stay at the right abstraction level
- Built-in self-evaluation checkpoint to prevent over-specification demands
- Distinguishes between architectural concerns and implementation details
- Respects explicitly deferred decisions

**Use when:** Reviewing top-level, implementation-agnostic architecture documents that define system boundaries, responsibilities, flows, and constraints without prescribing implementation details.

**Documentation:** See [arch-spec-review/SKILL.md](arch-spec-review/SKILL.md)

### Bug Analysis

Analyze a reported bug by tracing the likely execution path, forming evidence-based root-cause hypotheses, and producing a structured debugging report.

**Key features:**
- Structured debugging report with findings, evidence, and verification steps
- Root-cause hypotheses before coding
- Execution-path tracing from the bug report
- Read-only exploration — no implementation

**Use when:** Investigating or explaining a bug before implementing a fix.

**Documentation:** See [bug-analysis/SKILL.md](bug-analysis/SKILL.md)

### Check Domain

Check domain name availability and find alternatives. Runs on a fast, cheap model (Haiku) via a dedicated subagent — no Opus turns spent on straightforward lookups.

**Key features:**
- Bulk availability check across common TLDs
- Semantic domain name variations when first choice is taken
- Definitive verification against authoritative registries
- Bundled: skill + subagent (Haiku) + Instant Domain Search MCP

**Note:** The Instant Domain Search MCP server is plugin-level (always-on when plugin is installed). If context cost becomes a concern, the skill can be moved to a separate plugin or switched to direct API calls.

**Use when:** You want to check if a domain name is available. Type `/check-domain example.com`.

**Documentation:** See [check-domain/SKILL.md](check-domain/SKILL.md)

### Cold Start Checkpoint

Session-start checkpoint that pauses the agent on the first message of every new session to replay its understanding before executing. Prevents misinterpretation of vague or ambiguous prompts.

**Key features:**
- No-tools summary of the user's request before any file reads or commands
- Structured checkpoint: understanding, assumptions, Go/Clarify/Restate options
- Minimal overhead for clear prompts — one-sentence summary, fast path to Go
- Companion hook (`~/.claude/hooks/cold-start-checkpoint.sh`) fires every prompt; agent decides if it's the first message

**Use when:** Automatically triggered on the first message of a new session via the companion hook.

**Documentation:** See [cold-start-checkpoint/SKILL.md](cold-start-checkpoint/SKILL.md)

### Component Architecture Review

Principle-driven critique of an implemented component focused on root causes, strategic impact, and verifiable improvement paths.

**Key features:**
- First-principles reasoning, not smell labels
- Strategic impact over trivial correctness
- Deep, well-supported findings over many shallow ones
- Explains why issues matter in practice: change cost, coupling, testability
- Willing to say evidence is insufficient

**Use when:** Reviewing an implemented component and you need strategic architectural feedback rather than line-by-line code review.

**Documentation:** See [component-arch-review/SKILL.md](component-arch-review/SKILL.md)

### Composition Root

Composition root wiring rules — interface-only boundaries, layered assembly, naming discipline, and wiring tests.

**Key features:**
- Core rule: wiring connects interfaces, must not implement business decisions
- Naming discipline: name adapters by protocol, not by vendor/service
- Layered assembly: wiring composer → adapter layer → final assembler
- Stub/fake prohibitions for production paths
- Wiring test patterns: payload/response flow assertions, dependency validation
- Review checklist

**Use when:** Creating or modifying composition root code, assemblers, wiring, or adapters.

**Documentation:** See [composition-root/SKILL.md](composition-root/SKILL.md)

### Debug Print

Isolate bugs by adding `debugPrint` logging only — no behavior changes, no refactoring.

**Key features:**
- Targeted `debugPrint` statements with unique filterable prefixes (e.g., `[DBG1]`)
- Branch-point logging to disambiguate control flow
- Mandatory build verification after adding prints
- Wait-for-console-output workflow: add prints → user runs app → analyze output

**Use when:** Tracing a bug through runtime behavior. Invoke with the bug description as argument.

**Documentation:** See [debug-print/SKILL.md](debug-print/SKILL.md)

### Discuss

Collaborative discussion mode for exploring ideas, designs, and implementation approaches before taking action. Prevents premature implementation and ensures alignment before any code is written.

**Key features:**
- Agent takes positions — shares opinions, recommendations, and preferences instead of hiding behind neutral questions
- Read-only exploration — codebase and web research without any file changes
- Questions carry a lean — default to recommending, not just presenting menus
- One-question-at-a-time approach to clarify high-impact unknowns
- Structured options with contextual labels when discrete choices exist
- Clear guardrails: only the user can exit discuss mode
- Named anti-patterns to avoid common discussion failures

**Use when:** You want to explore, reason about, or align on a problem before building. Say "let's discuss", "let's think about", "before we build", or similar.

**Documentation:** See [discuss/SKILL.md](discuss/SKILL.md)

### Docker Discipline

Docker compose, deploy fix, local verification, and cross-platform gotchas for Docker-producing units.

**Key features:**
- Bind-mount path awareness for worktrees and compose files
- End-to-end deploy fix discipline — trace full deploy path before committing
- Local Docker verification gates (build, run, health check)
- Cross-platform gotchas (Swift on Linux: ByteBuffer ≠ Data)
- Completion verification checklist

**Use when:** Working with Dockerfiles, docker compose, deploy scripts, or Docker-producing units.

**Documentation:** See [docker-discipline/SKILL.md](docker-discipline/SKILL.md)

### Executable Specification Scaffolding

Draft executable specifications for service, orchestrator, or collaborator-heavy components where responsibility boundaries and collaborator contracts must be explicit before implementation.

**Key features:**
- Stateless service surfaces with explicit collaborator contracts
- Shared policy extraction for reusable coordinators
- Async-capable contracts when future async boundaries are likely
- Responsibility boundaries and sequencing guarantees

**Use when:** Drafting executable specs for components built around services, orchestrators, pipelines, guards, or repositories.

**Documentation:** See [executable-spec-scaffolding/SKILL.md](executable-spec-scaffolding/SKILL.md)

### Feature Spec Protocol

Create feature specifications through a structured Q&A protocol that asks one question at a time and fills the spec incrementally.

**Key features:**
- Ask, don't assume — each section populated only after explicit clarification
- One-question-at-a-time approach
- Deterministic — no hidden defaults
- Final artifact as a Markdown document
- Structured steps: Scope, Behavior, Edge Cases, Persistence, Testing, Done Criteria

**Use when:** Creating a feature specification through an ordered clarification protocol.

**Documentation:** See [feature-spec-protocol/SKILL.md](feature-spec-protocol/SKILL.md)

### Documentation Drift Audit

Verify that markdown documentation accurately describes the current codebase. Detects factual mismatches between docs and code — wrong names, signatures, paths, behaviors. Does not rewrite, reformat, or improve docs.

**Key features:**
- Strict protocol against over-editing — guardrails are the point
- Excludes `implemented/` and `archived/` directories — historical artifacts, not current code
- Parallel subagent audit for 3+ files, inline for 1–2
- Read-only subagents with structured prompt template
- Individual mismatch review before accepting findings
- Minimal fixes only after user approval

**Use when:** Auditing documentation accuracy, checking if docs match code after refactors, finding stale or drifted documentation.

**Documentation:** See [doc-drift-audit/SKILL.md](doc-drift-audit/SKILL.md)

### Intake

Task intake for implementation and bug-fix assignments. The agent reads all referenced documents and explores the codebase, then demonstrates understanding before auto-transitioning to plan mode.

**Key features:**
- Mandatory exploration — agent reads docs and codebase before asking questions
- Skill-aware — scans available skills for domain knowledge (wiring patterns, composition APIs, flow architecture, conventions) that may not exist anywhere else
- Structured playback: What I'm Building, What I'm Touching, Key Constraints, Reproduction (bug fixes), Open Questions
- Bug-fix reproduction — for bug tasks, proposes a failing test (name, assertion, rationale) proving the broken behavior
- Open questions carry a lean — agent states its take, not passive "A or B?"
- Smart depth — primary doc thoroughly, references as needed, not exhaustive
- Spec is authoritative — agent implements what the spec says, never silently deviates
- Auto-transitions to plan mode when understanding is confirmed
- Subagent exploration for large codebases

**Use when:** You have a task document (spec, plan, PR, bug report) and want the agent to understand it before planning. Say `/intake` followed by the task reference.

**Documentation:** See [intake/SKILL.md](intake/SKILL.md)

### iOS Simulator Install

Install and launch iOS apps on simulator from Xcode build output for manual testing or deep link validation.

**Key features:**
- Auto-detects DerivedData path from Xcode preferences
- Finds most recent matching .app by bundle identifier
- Boots simulator automatically if not running
- Optional deep link launch support
- Reads Bundle ID and Simulator UUID from `.claude/AGENTS.md`

**Use when:** Running or launching the app on simulator for manual testing (not for xcodebuild test).

**Documentation:** See [ios-simulator-install/SKILL.md](ios-simulator-install/SKILL.md)

### Job Search Strategy

Comprehensive job search strategy toolkit for analyzing job postings, discovering hidden insights, interviewing candidates to match skills, developing targeted skills, and executing creative outreach strategies.

**Key features:**
- Deep job posting analysis scripts
- Candidate skill discovery through targeted interviews
- Strategic research and outreach guides
- Creative application formats and strategies
- Skill gap identification and development plans

**Use when:** Strategizing job searches, preparing tailored applications, developing competitive advantages, or coaching candidates through the job hunt process.

**Documentation:** See [job-search-strategy/SKILL.md](job-search-strategy/SKILL.md)

### PR CI Watch

Monitor GitHub PR CI status, wait for checks to finish, merge on green, or investigate failed checks. Prevents wasteful polling.

**Key features:**
- Single `gh pr checks --watch --fail-fast` command — never poll
- Foreground by default, background on request
- Auto-merge on green with `--merge --auto --delete-branch`
- Failed check investigation via `gh run view --log-failed`
- Race condition handling for "no checks reported" after push

**Use when:** Waiting for CI checks, merging PRs on green, or investigating CI failures.

**Documentation:** See [pr-ci-watch/SKILL.md](pr-ci-watch/SKILL.md)

### Process Gates

Pre-commit, step closeout, pre-push, preflight, hard gates, and plan creation locks for implementation work.

**Key features:**
- Pre-commit scope check: verify every changed file ties to the current step
- Step closeout protocol: self-review, test, summarize, commit, push
- Pre-push/pre-PR blocking gate: log, plan, clean status, Docker, tests
- Implementation preflight gate with worktree/branch verification
- Hard gates: execution lock is mandatory, never advisory
- Plan creation lock with explicit preflight fields

**Use when:** Implementing, committing, pushing code, or creating implementation plans.

**Documentation:** See [process-gates/SKILL.md](process-gates/SKILL.md)

### Protocol Owned by Client

Protocol/interface ownership rule — the client owns the dependency shape, the protocol lives with its client.

**Key features:**
- Client defines and owns the dependency shape (protocol/interface/data model)
- Protocol MUST live in the same module as its client
- Composition layer adapts concrete implementations to client-owned protocols
- Modules must not know about CLI or each other

**Use when:** Creating or modifying protocols, interfaces, or module boundaries.

**Documentation:** See [protocol-owned-by-client/SKILL.md](protocol-owned-by-client/SKILL.md)

### Release Process

Per-unit release discipline — model, invariants, and verification gates.

**Key features:**
- Per-unit release model with independent versioning and tagging (`<basename>_v<version>`)
- Release detection: both files changed and canonical version changed since last tag
- Trunk-only releases, no release branches
- Pre-push gate: build and test verification before tagging
- Post-push verification: CI and release-unit jobs must pass
- Docker unit support with `<version>` and `<git-sha>` image tags

**Use when:** Performing a release, tagging, bumping versions, or working with release-unit infrastructure.

**Documentation:** See [release-process/SKILL.md](release-process/SKILL.md)

### REST Contract Review

Systematic review of REST API contracts (OpenAPI/Swagger specs, JSON schemas) for quality and cross-endpoint consistency.

**Key features:**
- 5-category checklist: naming, types, response structure, documentation, versioning
- Cyrillic look-alike detection in key names
- Contract invariant verification
- Cross-endpoint consistency checks
- Structured output: Accept / Accept with changes / Needs rework

**Use when:** Reviewing API spec PRs, validating JSON schema changes, auditing contracts for breaking changes, or investigating decoding failures.

**Documentation:** See [rest-contract-review/SKILL.md](rest-contract-review/SKILL.md)

### RPI Research

Codebase investigation and findings report without solution proposals. No spec required, no auto-transition to planning.

**Key features:**
- Reads referenced documents before exploring the codebase
- Restates task understanding to catch misinterpretation early
- Explores relevant files, patterns, and conventions
- Reports findings, risks, and unknowns
- Asks clarifying questions when needed
- Large-scope mode for broad investigations (grouped pattern families, coverage summaries)
- Optional save-to-file for findings

**Use when:** Exploring a problem space before committing to an approach. Describe the task, then invoke `/rpi-research` to get research output before planning or implementing.

**Documentation:** See [rpi-research/SKILL.md](rpi-research/SKILL.md)

> **Intake vs RPI Research:** `/intake` assumes a prepared spec and auto-transitions to planning after proving understanding. `/rpi-research` is open-ended codebase reconnaissance — no spec required, no auto-transition, findings only.

### Simulator Settings

Tweak iOS simulator settings via xcrun simctl — permissions, UI appearance, location simulation, and status bar overrides.

**Key features:**
- Grant, revoke, or reset app privacy permissions
- Switch appearance (dark/light mode), adjust content size
- Simulate GPS locations with coordinates or predefined scenarios
- Override status bar for screenshot-ready displays
- Boot, shutdown, launch, terminate, and open deep links

**Use when:** Configuring iOS simulator settings — granting permissions, changing appearance, simulating location, or overriding the status bar.

**Documentation:** See [simulator-settings/SKILL.md](simulator-settings/SKILL.md)

### Skill Review

Review and improve existing Claude Code skills for signal quality, description effectiveness, and practical impact.

**Key features:**
- Signal-to-noise evaluation with section-by-section audit
- Description quality assessment (CSO — triggers on matching tasks)
- Degrees-of-freedom calibration (high for judgment, low for fragile operations)
- Preservation test — flags suspected domain knowledge as "ask user" instead of cutting
- Admits failure — scopes review to what it can evaluate when domain context is insufficient
- Per-skill verdicts: Keep as-is / Needs refinement / Needs rewrite / Consider retiring

**Use when:** Evaluating skill quality, auditing skill collections, or maintaining a skill library.

**Documentation:** See [skill-review/SKILL.md](skill-review/SKILL.md)

### Spec Writing

Spec structure, required sections, and constraints for defining component contracts before implementation.

**Key features:**
- Required sections: Goal, Public interface, Behavior rules, Tests, Done criteria
- No architecture preamble, future speculation, or implementation details
- Specs describe *what* and *when it fails*, not *how*
- Specs live at `<project>/docs/specs/` and move to `implemented/` after implementation

**Use when:** Creating, reviewing, or working with specs.

**Documentation:** See [spec-writing/SKILL.md](spec-writing/SKILL.md)

### Synopsis

Produce a concise, behavior-focused description of any target — component, module, product, or entire codebase — for a reader with zero project context.

**Key features:**
- Explores both docs and code before synthesizing
- Behavior and I/O contract focus, not implementation
- States key non-features that set expectations
- ~100 word default budget (adjustable)
- Output to conversation only — no file writes

**Use when:** You need a concise description of something for outsiders — READMEs, marketplace listings, onboarding docs, or elevator pitches.

**Documentation:** See [synopsis/SKILL.md](synopsis/SKILL.md)

### Strict TDD

Strict TDD mode — RED/GREEN/REFACTOR discipline with no-junk scope lock.

**Key features:**
- One test at a time, RED first
- Compilation errors are not RED
- Stop after RED, wait for user approval before GREEN
- GREEN means minimum production code only for the current failing test
- No-junk scope lock: no extra modules, defaults, scaffolding, or refactors unless required by the failing test

**Use when:** The user explicitly asks for TDD, RED/GREEN, or equivalent.

**Documentation:** See [strict-tdd/SKILL.md](strict-tdd/SKILL.md)

### Tactical Action Plan Guide

Translate an approved review finding into a safe, dependency-aware implementation plan that keeps the codebase working after every step.

**Key features:**
- Machine-readable YAML/JSON action plans from approved findings
- Green-to-Green Rule: codebase valid after every step
- Closed set of operation types (CREATE_FILE, ADD_TYPE, RENAME_SYMBOL, etc.)
- Mandatory verification blocks per step
- Dependency-driven DAG ordering
- Characterization test harness when no adequate tests exist

**Use when:** An approved review finding needs a safe, step-by-step refactoring plan.

**Documentation:** See [tactical-action-plan-guide/SKILL.md](tactical-action-plan-guide/SKILL.md)

### Swift Package Manifest

Clean, maintainable Package.swift creation and editing using the static property pattern from Facebook iOS SDK.

**Key features:**
- Eliminates magic strings with static properties
- Type-safe manifest organization
- Clear extension-based structure
- Alphabetical ordering for maintainability
- Swift 6 compatibility

**Use when:** Creating new Package.swift files, refactoring existing ones, adding modules/targets to Swift packages, or organizing Swift Package Manager manifests.

**Documentation:** See [swift-package-manifest/SKILL.md](swift-package-manifest/SKILL.md)

### TDD Interactive

Interactive Test-Driven Development workflow with reviewer-in-the-loop. Implements the RED-GREEN-REFACTOR cycle with two mandatory verification gates where a reviewer (human or AI) approves work before progression.

**Key features:**
- Two verification gates: at RED (failing test) and REFACTOR (code quality)
- Immutable git history (no amending or force pushing)
- Systematic escalation protocol for when agents get stuck
- Language-specific test runner guidance
- Review guidelines for both executing agent and reviewer

**Use when:** Implementing features, bug fixes, or refactoring using test-first methodology with step-by-step verification.

**Documentation:** See [tdd-interactive/SKILL.md](tdd-interactive/SKILL.md)

### TDD Scaffold Review

Evaluates test name scaffolds for TDD readiness by determining if each test name provides enough specification clarity to write a failing test.

**Key features:**
- Assesses whether test names clearly define testable behavior
- Identifies ambiguous or underspecified tests
- Provides minimal clarifying questions for unclear tests
- Generates structured Markdown reports

**Use when:** Reviewing test scaffolds, evaluating executable specifications, or assessing whether test names are ready for TDD implementation.

**Documentation:** See [tdd-scaffold-review/SKILL.md](tdd-scaffold-review/SKILL.md)

### Test Runner

xcodebuild test execution worker that runs exactly one test command and returns structured results.

**Key features:**
- Single xcodebuild command execution — no retries, no debugging
- Structured output schema with test list, counts, and pass/fail status
- Reads project/scheme/destination defaults from `.claude/AGENTS.md`
- Supports full scheme, specific classes, or specific test methods
- Runs on Sonnet for fast, cheap execution

**Use when:** Running xcodebuild tests. Main agent should delegate test execution to this worker.

**Documentation:** See [test-runner/SKILL.md](test-runner/SKILL.md)

### Testing Schedulers

Control virtual time for testing delays, debouncing, and background operations with RxSwift test schedulers.

**Key features:**
- Set `.immediate` for schedulers you don't care about
- Omit the parameter for the scheduler you want to control
- Manual time advancement with `advance(by:)`
- Assert before AND after time advancement
- Common mistake patterns documented

**Use when:** Testing time-dependent behavior — delays, debouncing, background operations, or any behavior requiring virtual time control.

**Documentation:** See [testing-schedulers/SKILL.md](testing-schedulers/SKILL.md)

## Installation

### Via Claude Code

Add this marketplace to Claude Code:

```
/plugin marketplace add igor1309/skills
```

Then install the skills you want:

```
/plugin install adr-governance
/plugin install arch-doc-review
/plugin install arch-reviewer
/plugin install arch-spec-review
/plugin install bug-analysis
/plugin install check-domain
/plugin install cold-start-checkpoint
/plugin install component-arch-review
/plugin install composition-root
/plugin install debug-print
/plugin install discuss
/plugin install docker-discipline
/plugin install doc-drift-audit
/plugin install executable-spec-scaffolding
/plugin install feature-spec-protocol
/plugin install intake
/plugin install ios-simulator-install
/plugin install job-search-strategy
/plugin install pr-ci-watch
/plugin install process-gates
/plugin install protocol-owned-by-client
/plugin install release-process
/plugin install rest-contract-review
/plugin install rpi-research
/plugin install simulator-settings
/plugin install skill-review
/plugin install spec-writing
/plugin install strict-tdd
/plugin install synopsis
/plugin install swift-package-manifest
/plugin install tactical-action-plan-guide
/plugin install tdd-interactive
/plugin install tdd-scaffold-review
/plugin install test-runner
/plugin install testing-schedulers
```

### Manual Installation

Alternatively, copy any skill folder to your Claude Code skills directory:

```bash
# Install individual skills
cp -r adr-governance ~/.claude/skills/
cp -r arch-doc-review ~/.claude/skills/
cp -r arch-reviewer ~/.claude/skills/
cp -r arch-spec-review ~/.claude/skills/
cp -r bug-analysis ~/.claude/skills/
cp -r check-domain ~/.claude/skills/
cp -r cold-start-checkpoint ~/.claude/skills/
cp -r component-arch-review ~/.claude/skills/
cp -r composition-root ~/.claude/skills/
cp -r debug-print ~/.claude/skills/
cp -r discuss ~/.claude/skills/
cp -r docker-discipline ~/.claude/skills/
cp -r doc-drift-audit ~/.claude/skills/
cp -r executable-spec-scaffolding ~/.claude/skills/
cp -r feature-spec-protocol ~/.claude/skills/
cp -r intake ~/.claude/skills/
cp -r ios-simulator-install ~/.claude/skills/
cp -r job-search-strategy ~/.claude/skills/
cp -r pr-ci-watch ~/.claude/skills/
cp -r process-gates ~/.claude/skills/
cp -r protocol-owned-by-client ~/.claude/skills/
cp -r release-process ~/.claude/skills/
cp -r rest-contract-review ~/.claude/skills/
cp -r rpi-research ~/.claude/skills/
cp -r simulator-settings ~/.claude/skills/
cp -r skill-review ~/.claude/skills/
cp -r spec-writing ~/.claude/skills/
cp -r strict-tdd ~/.claude/skills/
cp -r synopsis ~/.claude/skills/
cp -r swift-package-manifest ~/.claude/skills/
cp -r tactical-action-plan-guide ~/.claude/skills/
cp -r tdd-interactive ~/.claude/skills/
cp -r tdd-scaffold-review ~/.claude/skills/
cp -r test-runner ~/.claude/skills/
cp -r testing-schedulers ~/.claude/skills/

# Or install all skills at once
cp -r adr-governance arch-doc-review arch-reviewer arch-spec-review bug-analysis check-domain cold-start-checkpoint component-arch-review composition-root debug-print discuss docker-discipline doc-drift-audit executable-spec-scaffolding feature-spec-protocol intake ios-simulator-install job-search-strategy pr-ci-watch process-gates protocol-owned-by-client release-process rest-contract-review rpi-research simulator-settings skill-review spec-writing strict-tdd synopsis swift-package-manifest tactical-action-plan-guide tdd-interactive tdd-scaffold-review test-runner testing-schedulers ~/.claude/skills/
```

## Usage

Claude Code will automatically load skills from the skills directory.

### ADR Governance

Invoke when creating, reviewing, or implementing Architecture Decision Records.

**Example prompt:**
```
Create an ADR for the new caching strategy.
```

Or:
```
Review ADR-007 for boundary clarity and cross-ADR consistency.
```

### Architecture Doc Review

Invoke when reviewing architecture or design docs in a PR.

**Example prompt:**
```
Review the architecture docs in this PR for ambiguity and drift resistance.
```

Or:
```
Check this design doc against the arch-doc-review checklist.
```

### Architecture Reviewer

Invoke when reviewing architectural sketches for clarity, coherence, and intent.

**Example prompt:**
```
Review this architectural sketch for clarity and coherence.
```

Or:
```
Evaluate whether this component design communicates its boundaries and rationale clearly.
```

### Architecture Specification Review

Invoke when reviewing architecture specifications to ensure they maintain appropriate abstraction levels.

**Example prompt:**
```
Review this architecture specification for completeness and appropriate abstraction level.
```

Or:
```
Evaluate this architecture document to ensure it defines system boundaries without prescribing implementation details.
```

### Bug Analysis

Invoke when investigating a bug before implementing a fix.

**Example prompt:**
```
Analyze this bug — trace the execution path and give me root-cause hypotheses.
```

Or:
```
/bug-analysis the session expires unexpectedly after 5 minutes
```

### Check Domain

Invoke to check domain availability. Runs on Haiku for fast, cheap lookups.

**Example prompt:**
```
/check-domain example.com
```

Or:
```
/check-domain coolstartup
```

### Cold Start Checkpoint

Triggered automatically by the companion hook on the first message of every session.

**Example prompt:**
```
fix that caching thing
```

The agent will pause, summarize its understanding, list assumptions, and ask you to confirm before proceeding.

### Component Architecture Review

Invoke when reviewing an implemented component for strategic architectural feedback.

**Example prompt:**
```
Review the OrderProcessor component for architectural health.
```

Or:
```
Give me a principle-driven critique of this module's changeability and testability.
```

### Composition Root

Invoke when creating or modifying composition root code, assemblers, or wiring.

**Example prompt:**
```
Wire the new service into the composition root.
```

Or:
```
Review this assembler for composition discipline violations.
```

### Debug Print

Invoke to trace a bug with debug logging only.

**Example prompt:**
```
/debug-print the payment confirmation screen shows stale data after retry
```

### Discuss

Invoke when you want to explore an idea or align on an approach before building.

**Example prompt:**
```
Let's discuss how to add caching to the API layer.
```

Or:
```
Before we build — I want to think through the authentication redesign.
```

### Docker Discipline

Invoke when working with Dockerfiles, docker compose, deploy scripts, or Docker-producing units.

**Example prompt:**
```
Review the Docker setup for this service before I push.
```

Or:
```
Fix the deploy failure — trace the full deploy path.
```

### Executable Specification Scaffolding

Invoke when drafting executable specs for orchestrator or collaborator-heavy components.

**Example prompt:**
```
Draft an executable spec for the payment orchestrator with explicit collaborator contracts.
```

Or:
```
Scaffold a spec for this pipeline showing responsibility boundaries and sequencing guarantees.
```

### Feature Spec Protocol

Invoke when creating a feature specification through structured Q&A.

**Example prompt:**
```
/feature-spec-protocol — I need a spec for the new notification system.
```

Or:
```
Let's build a feature spec one question at a time for the export feature.
```

### Documentation Drift Audit

Invoke after refactors or when you suspect docs have fallen out of sync with code.

**Example prompt:**
```
Audit the documentation in this repo for drift — find where docs don't match the code.
```

Or:
```
Check if the README still accurately describes the current API.
```

### Intake

Invoke when you have a task assignment with referenced documents and want the agent to understand before planning.

**Example prompt:**
```
/intake implement step 3 from docs/feature-spec.md, see also docs/api-contracts.md
```

Or:
```
Your task is to implement PR #42 from sandbox/feature-plan.md
/intake
```

### iOS Simulator Install

Invoke to install and launch an app on the iOS simulator.

**Example prompt:**
```
Run the app on the simulator.
```

Or:
```
Launch the app with deep link myapp://settings/profile
```

### Job Search Strategy

Invoke when analyzing job postings or developing application strategies.

**Example prompt:**
```
Analyze this job posting and help me develop a targeted application strategy.
```

Or:
```
Help me identify skill gaps and create a development plan for this role.
```

### PR CI Watch

Invoke when waiting for CI checks or merging on green.

**Example prompt:**
```
Watch the PR and merge when green.
```

Or:
```
Is CI done on PR #42?
```

### Process Gates

Invoke when implementing, committing, or pushing code — enforces pre-commit, pre-push, and preflight gates.

**Example prompt:**
```
Implement step 3 from the plan with full process gates.
```

Or:
```
Run the pre-push gate before I push this branch.
```

### Protocol Owned by Client

Invoke when creating or modifying protocols, interfaces, or module boundaries.

**Example prompt:**
```
Check if this protocol placement follows the client-ownership rule.
```

Or:
```
Move this protocol to live with its client module.
```

### Release Process

Invoke when performing a release, tagging, or bumping versions.

**Example prompt:**
```
Release nomos with a minor version bump.
```

Or:
```
Verify the release invariants before tagging.
```

### REST Contract Review

Invoke when reviewing REST API contracts for quality and consistency.

**Example prompt:**
```
Review this OpenAPI spec for naming consistency and breaking changes.
```

Or:
```
Check this JSON schema against our existing API conventions.
```

### RPI Research

Invoke after describing a task to get research output before planning or coding.

**Example prompt:**
```
Add caching to the API layer.
/rpi-research
```

Or:
```
The login flow has a bug where session tokens expire too early.
/rpi-research
```

### Simulator Settings

Invoke when configuring iOS simulator settings for development or screenshots.

**Example prompt:**
```
Grant location permission to the app in the simulator.
```

Or:
```
Set dark mode and override the status bar for screenshots.
```

### Skill Review

Invoke when evaluating skill quality or auditing a skill collection.

**Example prompt:**
```
Review my skill and tell me what's signal vs noise.
```

Or:
```
Is this skill effective? What should I change?
```

### Spec Writing

Invoke when creating or reviewing specs for component contracts.

**Example prompt:**
```
Write a spec for the new caching layer.
```

Or:
```
Review this spec for completeness and testability.
```

### Synopsis

Invoke when you need a concise description of a component, module, or product for outsiders.

**Example prompt:**
```
/synopsis corpus-scout
```

Or:
```
/synopsis this repo
```

### Strict TDD

Invoke when you want strict RED/GREEN/REFACTOR discipline.

**Example prompt:**
```
Implement this feature using strict TDD.
```

Or:
```
Let's do RED/GREEN for this test case.
```

### Swift Package Manifest

Invoke when creating or refactoring Package.swift files.

**Example prompt:**
```
Create a Package.swift using the static property pattern for [package description].
```

Or:
```
Refactor this Package.swift to use the clean static property pattern.
```

### Tactical Action Plan Guide

Invoke when an approved review finding needs a step-by-step refactoring plan.

**Example prompt:**
```
Create an action plan for finding #2 from the component review.
```

Or:
```
Turn this approved finding into an executable refactoring plan with verification gates.
```

### Vortex Swift Package Manifest

Invoke when adding a feature module to a Swift package using the static-extension pattern.

**Example prompt:**
```
Add a Profile feature module with Backend and Core targets.
```

Or:
```
Scaffold the Settings feature module under Sources/Feature/Settings.
```

### TDD Interactive

Invoke the skill by requesting interactive Test-Driven Development with verification gates.

**Example prompt:**
```
Implement [task/test] using Test-Driven Development with step-by-step verification gates.
I am the reviewer and will approve at each checkpoint.
```

**What to expect:**
- Claude will announce: "I'm using the TDD Interactive skill..."
- You'll approve work at two points: after RED (failing test) and after REFACTOR
- Just say "go" to approve and proceed

### TDD Scaffold Review

Invoke when you have test names and need to verify they're ready for TDD implementation.

### Test Runner

Delegate test execution to this worker agent.

**Example prompt:**
```
Run the tests for scheme MyAppTests, class LoginViewModelTests.
```

### Testing Schedulers

Invoke when testing time-dependent behavior with RxSwift schedulers.

**Example prompt:**
```
I need to test a 300ms debounce on the search input — use the testing-schedulers pattern.
```

**Example prompt:**
```
Review this test scaffold to determine if the test names are clear enough to write failing tests.
```

## License

MIT

## Author

Igor Malyarov
