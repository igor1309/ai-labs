---
date: 2026-04-21
model: opus-4.7-adaptive
version: 0.0.1
---

# Orchestrating a Multi-CLI, Multi-Model Autonomous Review Loop

## Research Context

**Target workflow.** Autonomous loop: implementer agent (one CLI/model tier) → adversarial reviewer (a different CLI/model tier, severity-graded verdict) → fixer (a third CLI/model tier, produces fix plan) → back to implementer. Artifacts (plan, result, review, fix) are files on disk, each stage committed to git. Human kicks it off and walks away; loop terminates on pass, iteration cap, or explicit failure.

**Hard constraints that shaped the search.**
1. CLIs stay as the execution agents (Claude Code CLI, Codex CLI) — their harnesses (skills, MCP wiring, file access, commands) matter.
2. Subscription auth only. No API keys. This is important for ToS reasons too (see note below).
3. Git-native file-based state. Each stage commits; orchestration artifacts are files.
4. Fully autonomous between kickoff and completion.
5. Termination via reviewer verdict (severity-graded — F1/F2 blocks pass, lower severities may pass) plus turn/budget caps. Implementation detail, not a search axis.

**Critical derived requirement.** The orchestrator must drive **different CLIs for different stages** — not just route to different models through one CLI — because each CLI brings its own harness. This disqualifies otherwise-strong Claude-Code-native tools (Superpowers, Forge, Quantum-Loop) as *full* fits, though they remain useful as prior art and for the Claude-side work.

---

## Important Safety Note: Subscription Auth and ToS

From GSD-2's documentation:

> Using OAuth tokens from subscription plans outside their native applications may violate the provider's Terms of Service. **Google Gemini** — using Gemini CLI/Antigravity OAuth tokens in third-party tools has resulted in Google account suspensions (whole-account, not just Gemini). **Claude Max** — Anthropic's ToS may not explicitly permit OAuth use outside Claude's own applications. **GitHub Copilot** — similarly restricted.

**What this means for the research.** Your approach — shelling out to the native CLIs as subprocesses so each handles its own auth — is the safe path. Any tool that tries to extract the OAuth token and reuse it with its own runtime is a risk. Every tool listed below that I recommend uses the subprocess-the-CLI approach.

---

## Top Tier: Closest Fits

### 1. `claude-codex-gemini` by Z-M-Huang

**https://github.com/Z-M-Huang/claude-codex-gemini** — MIT-adjacent (GPL-3.0), TypeScript/Bun, ~14 stars, active Feb 2026.

This is shockingly close to your exact description, including the specific role assignment of "strong model implements, different vendor's strong model reviews as adversarial gate, best model refines." The project literally advertises itself as *"Gemini as orchestrator, Claude to code, Codex as reviewer."*

**Fit dimensions:**

| Dimension | Status |
|---|---|
| Multi-CLI execution | ✅ Claude CLI + Codex CLI + Gemini CLI as separate subprocess calls |
| Subscription auth | ✅ Each CLI handles its own auth (`claude auth`, `codex auth`, `gemini auth`) |
| File-based state | ✅ All state in `.task/` as JSON artifacts |
| Git-native | ⚠️ Not automatic — you'd need to add post-stage commits. Easy to layer. |
| Autonomous loop | ✅ |
| Severity-graded verdicts | ✅ `approved` / `needs_changes` / `needs_clarification` / `rejected` |
| Turn caps | ✅ Max 10 iterations per reviewer, then escalate to user |
| Phase resumability | ✅ Phase detection by file existence — restart-safe |

**Pipeline.** Requirements (Opus) → Planning (Opus) → Plan Review chain (Sonnet → Opus → Codex, sequential not parallel) → Implementation (Sonnet) → Code Review chain (Sonnet → Opus → Codex). If any review says `needs_changes`, the orchestrator fixes and re-reviews. Each reviewer must approve before proceeding.

**How it's structured.** Three TypeScript helper scripts do all the work:
- `json-tool.ts` — cross-platform JSON state manipulation
- `run-claude-code.ts` — spawns Claude CLI with agent context and a specific model
- `run-codex.ts` — wraps Codex CLI with type-scoped session management (`.codex-session-plan` vs `.codex-session-code`)

Gemini's role is purely orchestration — reading `GEMINI.md` and driving the pipeline. That role could in principle be swapped for a bash/Swift script with the same logic; Gemini isn't doing anything a deterministic runner couldn't.

**Gaps vs your constraints:**
- Gemini as orchestrator — you don't use Gemini. Swappable. The repo has an earlier bash-only V0 branch (`archive-v0`) that makes this easier to see.
- Locked model/role assignment. You'd fork and change the role map.
- No native git commit per stage. Trivial to add.
- Small project. One maintainer. Risk: maintenance.

**Verdict.** The single closest off-the-shelf fit. If you fork it, the work is: rewrite the orchestrator side (swap out Gemini as the driver), add git commits between phases, adjust the role/model map. The hard part — driving three different CLIs with their own sessions, phase detection, iteration caps, severity verdicts — is already done.

---

### 2. `ralphex` by umputun

**https://github.com/umputun/ralphex** — MIT, Go, ~13 stars, last release Jan 2026.

Standalone Go binary, runs from a git repo. Autonomous plan executor specifically designed around Claude Code as primary driver with Codex as external adversarial review gate.

**Fit dimensions:**

| Dimension | Status |
|---|---|
| Multi-CLI execution | ⚠️ Claude Code drives everything; Codex is invoked as external review only |
| Subscription auth | ✅ Shells out to `claude` and `codex` CLIs |
| File-based state | ✅ Plan files in `docs/plans/`, completed plans moved to `completed/` |
| Git-native | ✅ Creates branch per plan, auto-commits after each task and review fix |
| Autonomous loop | ✅ Walk away, come back to reviewed-and-committed code |
| Severity-graded verdicts | ⚠️ Critical/major issues only in second review — partial match |
| Turn caps | ✅ `--max-iterations`, `--review-patience` (stalemate detection) |
| Phase resumability | ✅ Tasks are checkbox-tracked in the plan markdown |

**Four-phase flow.** (1) Task execution with validation commands (tests, linters) — fresh Claude Code session per task, minimal context, commit on each. (2) First code review — 5 agents launched in parallel via Claude Code's Task tool: `quality`, `implementation`, `testing`, `simplification`, `documentation`. (3) **External Codex review** — invokes Codex CLI independently, Claude evaluates findings, fixes, iterates until Codex finds nothing. (4) Second review pass — 2 agents (`quality` + `implementation`) for final gate.

**Review-only mode** (`ralphex --review`) runs Phases 2-4 on existing branch changes. Useful for post-hoc review of changes made by other tools.

**Stalemate detection.** If Codex and Claude can't agree, `--review-patience=N` terminates after N rounds with no commits. Exactly the kind of termination heuristic you'd need.

**Gaps vs your constraints:**
- Claude Code is the primary driver; Codex is the *external* reviewer only. The role pattern is baked in. You can't easily invert (e.g., "Codex implements, Claude reviews").
- The 5 review agents in Phase 2 are Claude-Code-native subagents — not Codex CLI. So "different CLIs, different LLMs" is only partially realized (Claude Code + Codex, not three-way).
- Fully customizable prompts and agents via `~/.config/ralphex/`, but the CLI structure is fixed.

**Verdict.** The most production-ready of the close fits — Go binary, coverage badge, clear docs, proper config surface. If your pattern is exactly "Claude Code does work, Codex adversarially reviews, iterate" — this is it out of the box. If you need a third CLI in the loop or role inversion, you'd be forking.

---

### 3. ORCH by @oxgeneral

**https://github.com/openai/codex/discussions/14940** (announcement) — npm install, ~9 stars, MIT. Install: `npm i -g @oxgeneral/orch`.

CLI orchestrator with a **typed adapter architecture** that explicitly addresses multi-CLI orchestration. Five adapters ship: Claude, OpenCode, Codex, Cursor, and a universal Shell adapter (so any CLI that accepts a prompt and returns output can be driven).

**Fit dimensions:**

| Dimension | Status |
|---|---|
| Multi-CLI execution | ✅ Purpose-built for this. Shell adapter extends to anything. |
| Subscription auth | ✅ Adapters shell out to native CLIs |
| File-based state | ✅ `.orchestry/` with YAML/JSON/JSONL artifacts, atomic writes, file locking |
| Git-native | ✅ Each agent runs in an isolated git worktree; changes merge back via review |
| Autonomous loop | ✅ Daemon-capable, runs 24/7 |
| Severity-graded verdicts | ⚠️ Has review stage in state machine but severity semantics are prompt-level |
| Turn caps | ✅ Auto-retry, max concurrent, timeouts |
| State machine | ✅ Explicit: todo → in_progress → review → done (+ retrying, failed) |

**Architecture.** CLI/TUI interface over an application layer (Orchestrator + EventBus + Services) over a domain layer (state machine + 31 event types) over an infrastructure layer (adapters + storage + process manager). Every task transitions through the state machine with validated transitions rejected at the domain layer. `.orchestry/` directory holds config, state, tasks, agents, runs (JSONL streams), goals, teams, messages.

**Caveat — oriented toward parallel.** ORCH's primary use case is multiple agents working in parallel with inter-agent messaging, not a linear iterative review pipeline. The state machine supports review-before-done, but the mental model is "teams of specialists" not "assembly-line of model tiers." You could configure a single-agent-at-a-time linear flow using task dependencies (`--depends-on`), and the review state is built in, but you'd be using ORCH at an angle to its design intent.

**Gaps vs your constraints:**
- Parallel-first. Linear iterative review is achievable but not the primary pattern.
- Review stage is in the state machine but severity-graded verdicts aren't first-class.
- Maintainer momentum unclear; 9 stars.

**Verdict.** Interesting precisely because of the typed adapter architecture and state machine. The Shell adapter is the escape hatch that makes this future-proof for CLIs ORCH doesn't officially support. But it's pointing at parallel teams, not iterative pipelines — and for your workflow, that's a fit mismatch on the primary axis.

---

## Second Tier: Partial Matches (Useful as Prior Art)

### `kodo` — multi-CLI architect/tester verification

Autonomous multi-agent coding orchestrator that directs Claude Code, Codex, and Gemini CLI through work cycles with independent architect and tester verification. SWE-bench-verified. ~37 stars. I didn't dig deep — couldn't get a good documentation surface in the time budget — but the one-line summary is the right shape: multi-CLI, autonomous cycles, independent verification. Worth investigating directly.

### `Bernstein` — deterministic Python orchestrator

Deterministic Python orchestrator that spawns parallel AI coding agents (Claude Code, Codex CLI, Gemini CLI), verifies with tests, auto-commits. Notable for advertising "zero LLM tokens on coordination" — orchestration logic is pure Python, not prompt-driven. Also parallel-first, but the "verify with tests + auto-commit" discipline matches your pattern. Good reference for the deterministic-orchestrator-over-prompted-orchestrator architectural choice.

### `OpenCastle`

Multi-agent orchestration framework that turns AI coding assistants (Copilot, Cursor, Claude Code, OpenCode, Windsurf, Codex CLI) into 19 coordinated specialist agents. CLI-driven (`npx opencastle init`). Task decomposition + parallel work + quality gates. Wider CLI support than most. MIT. Parallel-first, same caveat as ORCH.

### `myclaude` (stellarlinkco) — SPARV workflow

https://github.com/cexll/myclaude — multi-backend execution via `codeagent-wrapper` (Codex/Claude/Gemini/OpenCode). Ships several workflow modules, notably **SPARV** (Specify → Plan → Act → Review → Vault) — a linear spec-driven flow with review as a named stage. Also has `do` (5-phase feature development with codeagent orchestration) and `bmad` (agile with 6 specialized agents). The `codeagent-wrapper` is interesting in isolation: a unified wrapper that presents the same interface to Codex (`codex e --json -C`), Claude (`--output-format stream-json -r`), Gemini (`-o stream-json -y -r`), and OpenCode (stdin mode). If you build your own orchestrator, study this wrapper first.

### `AI-Agents-Orchestrator` by hoangsonww

Step-based workflow manager with adapter model + fallback manager. Example sequence diagram from the README: `Codex implements → Gemini reviews → Claude refines`. Linear pipeline, CLI adapters, fallback routing on adapter failure. TypeScript. Also has a separate "Agentic Team" runtime for free-form role-to-role communication, but the step-based workflow engine is the interesting piece. Larger surface area than the target problem — includes web UI, dashboards, graph-based context memory. You'd use only the workflow engine.

### `catlog22/Claude-Code-Workflow` (ccw)

JSON-driven multi-agent framework with intelligent CLI orchestration. Supports iterative and pipeline patterns directly via prompts: *"Use Gemini to diagnose, then Codex to fix, iterate until resolved"* and *"Gemini designs, Codex implements, Claude reviews."* Semantic auto-invoke of CLIs. Claude Code is the orchestrator — which means it drives, rather than running as a peer. Useful as evidence that the pattern is understood and implemented, even though Claude Code is on both sides of the loop.

### `claude-octopus` (nyldn)

Claude Code plugin that orchestrates up to 8 providers (Codex, Gemini, Copilot, Qwen, Ollama, Perplexity, OpenRouter, OpenCode) with consensus gates. Dark Factory mode runs full autonomous pipelines. Two-stage review built in. Codex and Gemini use OAuth (subscription). Again, Claude-Code-as-orchestrator pattern. "Four-way AI debates" and 75% consensus gates are an interesting variation on severity-graded verdicts — multi-reviewer consensus rather than single-reviewer severity scoring.

---

## Third Tier: Worth Knowing About

Quick-list only — these aren't direct fits but illustrate specific patterns you'll want to steal from if you build your own:

- **`Forge` (LucasDuys)** — spec-driven autonomous loop for Claude Code: brainstorm → plan → execute, with hooks, token caps, crash recovery, squash-merge-on-complete. Single-CLI but the state-machine-in-Claude-Code pattern is well thought through.
- **`Quantum-Loop` (andyzengmath)** — Claude Code spec-driven loop with dependency DAG, two-stage review gates, Iron Law verification. Sequential or parallel execution modes. Fresh-context-per-iteration is their discipline.
- **`agentic-loop` / `Ralph` pattern** — Ralph (bash loop feeding markdown into Claude Code with stateless/fresh-context iteration) is the pattern everyone else extends. Geoffrey Huntley's original is still the cleanest reference; 100 lines.
- **`agx`** — checkpoint-based execution engine with durable Wake→Work→Sleep loops that resume instantly across sessions. Claude Code, Codex CLI, Gemini CLI, Ollama. CLI + web dashboard + macOS app. Durability story looks strong; didn't dig in.
- **`tutti`** — multi-agent orchestration CLI with config-driven workflows, git worktree isolation, and typed artifact flow between agents. "Typed artifact flow" matches your file-based artifact pattern.
- **`sage`** — pure bash agent orchestrator, runtime-agnostic (Claude Code, Cline, Codex, Gemini CLI, ACP), wave-based plan execution, headless CI mode. Zero-framework reference implementation.
- **`agent-orchestrator` (ComposioHQ)** — 5.8k stars. Runs agents on GitHub PRs, auto-reacts to CI failures and reviewer requests. YAML config, tmux or Docker runtime, Claude Code/Codex/Aider agents. Parallel-first, CI-centric. Big ecosystem.
- **`Superpowers` (obra)** — Claude Code plugin with brainstorm → plan → execute flow and two-stage review per task (spec compliance, then code quality). TDD-enforced (deletes code written before tests). Claude-only, so not a fit, but the **two-stage review-per-task with severity-graded blocking issues** is directly what you want. Studying this plugin's skill files is worth the half-hour.
- **`oh-my-claudecode` (OMC) Pipeline mode** — *"Pipeline mode allows defining custom processing chains where one agent's output feeds the next agent's input according to a configurable graph."* tmux-based, spawns real Codex/Gemini CLI processes in panes. If the multi-CLI coordination surface in the Top Tier doesn't fit, OMC is worth a look for its pipeline DSL.
- **`CCB` (claude_code_bridge)** — tmux split-pane runtime, project-scoped, real agents in real panes. Different architectural bet (multiple terminal panes as peers) but Unix-y.

---

## Feature Matrix (Top-Tier Candidates)

| Feature | claude-codex-gemini | ralphex | ORCH |
|---|---|---|---|
| Multi-CLI (different harnesses per stage) | ✅ 3-way | ⚠️ 2-way, fixed roles | ✅ adapter model, N-way |
| Linear iterative review loop | ✅ native | ✅ native | ⚠️ achievable |
| Parallel teams | ❌ | ⚠️ review agents parallel | ✅ primary pattern |
| Severity-graded verdicts | ✅ 4 levels | ⚠️ critical/major | ⚠️ prompt-level |
| Turn caps / budget | ✅ per-reviewer | ✅ `--max-iterations` + patience | ✅ retries, timeouts |
| Git commits per stage | ❌ add layer | ✅ native | ✅ worktree + merge |
| Subscription auth | ✅ | ✅ | ✅ |
| Resume on crash | ✅ file-presence phase detection | ⚠️ plan checkboxes | ✅ state machine + atomic writes |
| Single binary / easy install | ⚠️ Bun+Node | ✅ Go binary / Homebrew | ⚠️ npm global |
| Maintenance risk (stars/activity) | high (14★, 1 maintainer) | low-med (13★, active) | med (9★, part of OpenAI discussions) |

---

## Gap Analysis: What No Tool Gets Right

Even the closest fits leave gaps. Useful for your DIY reference:

1. **Role inversion is always implicit.** Every tool that mixes CLIs bakes in the role assignment: "Claude codes, Codex reviews" or "Gemini orchestrates, Claude codes, Codex gates." None I found lets you declare *"for this task, tier-A is <X CLI+model>, tier-B is <Y CLI+model>, tier-C is <Z CLI+model>"* as a first-class config that you can re-point per task. ralphex is explicit about its assignments; claude-codex-gemini hardcodes them in `GEMINI.md`. If you build your own, a clean role-map-to-CLI-invocation abstraction is the single most valuable primitive.

2. **Severity-graded verdict contracts are weak.** Most tools have "approve/reject" or "critical/major/minor" but the machine-readability varies wildly. claude-codex-gemini's four-value enum is the most explicit. If you build your own, a structured reviewer verdict schema (e.g., `{verdict: "fail"|"pass-with-fixmes"|"pass", issues: [{severity: "F1"|"F2"|"F3", ...}]}`) that maps cleanly to exit codes / JSON files is worth nailing down early.

3. **Git-commit-per-stage as a primitive.** claude-codex-gemini stores state in `.task/` but doesn't commit automatically. ralphex commits after each task and review-fix. ORCH uses worktrees and merge-back. None of them treat the git log as *the* state machine — i.e., resume = `git log --grep='stage:'` + `git checkout <last>`, revert = `git revert`. For your constraints (git-native, restorable, revertable), that's the cleanest design — and it's prior art that doesn't quite exist.

4. **Cross-CLI context transfer.** When Codex reviews, does it see the full conversation Claude had with itself? The exchange of artifacts between CLIs is always file-based (markdown/JSON), never session-based (you can't resume a Claude Code session from a Codex session and vice versa). This isn't a gap per se — files as the handoff currency *is* the right pattern — but it means the artifact schema (how the implementer summarizes intent/context/open-questions for the reviewer) matters a lot. Most tools hand-wave this with "here's the diff and the plan, figure it out."

5. **Subscription rate-limit handling.** Under sustained autonomous use, both Claude Max and ChatGPT Plus subscriptions hit rate limits. `primeline-ai/claude-tmux-orchestration` had a specific watchdog for this with the exact retry message `"This was a TEMPORARY rate limit, not a bug. Run the exact same command again — no workaround."` to prevent the CLI from creatively working around it. Worth stealing that idea.

6. **Cost/budget visibility.** No subscription-auth tool I saw tracks actual usage effectively. Token-budget mechanisms in the literature (e.g., Forge's hooks) are designed for API usage. Subscription auth doesn't expose token counts cleanly, so most tools fall back to iteration counts. Fine for termination, weak for cost awareness.

---

## Recommendation

**For minimum effort to get 90% of your pattern running:** fork `claude-codex-gemini`. Replace the Gemini-as-orchestrator layer with a short script (bash or Swift matches your stack). Add post-stage git commits. Remap the role assignments to your preferred models. You get the phase detection, iteration capping, sequential review chain, and severity-graded verdicts for free.

**If you want a tool you can use today, unmodified:** `ralphex`. Accept its "Claude Code implements, Codex reviews" role baked-in. Go binary, clean config via `~/.config/ralphex/`, stalemate detection. Install with `brew install umputun/apps/ralphex` and you're in business.

**If you eventually build your own:** the things worth stealing are —
- `codeagent-wrapper` from `myclaude` for the uniform "invoke any CLI headless with structured output" primitive
- `ralphex`'s review-patience / stalemate detection for termination
- `claude-codex-gemini`'s file-presence-as-phase-detection for resumability
- `Superpowers`' two-stage review with severity-blocking contract
- `ORCH`'s state-machine-at-the-domain-layer architecture for keeping invalid transitions out of the adapter layer
- Ralph loop's fresh-context-per-iteration discipline
- And the primeline-ai watchdog pattern for subscription rate limits

None of these are the same tool. The DIY thesis holds up in the sense that nothing off-the-shelf is a full fit, but there's enough solid prior art that you wouldn't be starting from nothing.

---

## Sources

- https://github.com/Z-M-Huang/claude-codex-gemini
- https://github.com/umputun/ralphex
- https://github.com/openai/codex/discussions/14940 (ORCH)
- https://github.com/cexll/myclaude
- https://github.com/ComposioHQ/agent-orchestrator
- https://github.com/Yeachan-Heo/oh-my-claudecode
- https://github.com/obra/superpowers
- https://github.com/LucasDuys/forge
- https://github.com/andyzengmath/quantum-loop
- https://github.com/bradAGI/awesome-cli-coding-agents (comprehensive directory)
- https://github.com/andyrewlee/awesome-agent-orchestrators (comprehensive directory)
- https://github.com/gsd-build/gsd-2 (source of subscription-auth-ToS warning)
- https://github.com/primeline-ai/claude-tmux-orchestration (rate-limit watchdog pattern)
- https://github.com/nyldn/claude-octopus
- https://github.com/hoangsonww/AI-Agents-Orchestrator
- https://github.com/catlog22/Claude-Code-Workflow
- https://addyosmani.com/blog/code-agent-orchestra/ (landscape overview)
- https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol (file-based IPC between agents)