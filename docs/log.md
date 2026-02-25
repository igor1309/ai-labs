---
instructions: Keep entries concise, outcome-focused. Don't mirror git commits. List major accomplishments in reverse chronological order (newest first). Focus on what was achieved and why it matters, not how.
---

# Log

## 2026-02-25

### Skills Repo Release Workflow
Designed automated release flow for `igor1309/skills`: a GitHub Actions workflow that triggers on push, reads marketplace.json version, and creates a git tag + GitHub Release if the version is new. Lives in the skills repo (synced via `dev-skills/public/.github/workflows/`), uses its own GITHUB_TOKEN — no extra PAT needed.

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
