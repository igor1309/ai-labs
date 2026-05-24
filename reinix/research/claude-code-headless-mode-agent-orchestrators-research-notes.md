---
date: 2026-04-22
model: opus-4.7-adaptive
---

# Claude Code Headless Mode & Agent Orchestrators — Research Notes

## 1. Running Claude Code headlessly

The flag is `-p` (or `--print`). Previously called "headless mode" — same thing, same flags.

```bash
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
```

Piping works naturally:

```bash
cat logs.txt | claude -p "Explain this error"
git diff origin/main...HEAD | claude -p "Review this diff"
```

### Key flags for scripting

| Flag | Purpose |
|---|---|
| `-p` / `--print` | Non-interactive mode; write to stdout and exit. |
| `--output-format text\|json\|stream-json` | Structured output. `json` gives a single envelope with `result` and session metadata; `stream-json` emits newline-delimited events. |
| `--include-partial-messages` | Combined with `stream-json` + `--verbose`, emits token-level deltas. |
| `--allowedTools "Read,Edit,Bash"` | Pre-approve tools so no permission prompt blocks the run. Supports permission rule syntax like `Bash(git diff *)`. |
| `--permission-mode dontAsk\|acceptEdits` | Session-wide baseline. `dontAsk` denies anything not in the allow list; `acceptEdits` auto-approves writes and common FS commands. |
| `--dangerously-skip-permissions` | Bypass all permission checks. Sandboxed environments only. |
| `--max-turns N` | Cap agentic steps. Runaway safety. |
| `--append-system-prompt` / `--append-system-prompt-file` | Layer instructions onto the default system prompt (preferred over `--system-prompt` which replaces). |
| `--continue` / `--resume <session_id>` | Continue most recent / specific conversation. Capture `session_id` from `--output-format json`. |
| `--settings <file-or-json>` | Load explicit settings (incl. `apiKeyHelper`). |
| `--mcp-config <file-or-json>` | Load MCP servers explicitly. |
| `--agents '<json>'` | Inline custom agents. |
| `--plugin-dir <path>` | Pin a specific plugin directory (works even with `--bare`). |

### Skills, plugins, and MCP in headless mode

Plain `claude -p` loads the **same context an interactive session would**: hooks, skills, plugins, MCP servers, auto memory, and `CLAUDE.md` from the working directory and `~/.claude`. So the four-tier hierarchy (plugin-installed → project marketplace → project-native → user-level drafts) resolves identically.

Caveats:

- **Slash commands are interactive-only.** User-invoked skills like `/commit` and built-in commands don't work in `-p` — describe the task instead. Auto-triggered skills (matched by description) fire normally.
- **`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`** — forces marketplace plugins to install **before** the first turn instead of asynchronously. Emits `system/plugin_install` events. Useful for CI and for guaranteed-ready plugins in scripted runs.
- With `--output-format stream-json`, the `system/init` event reports loaded `plugins` and any `plugin_errors` — usable to fail CI when a plugin didn't load.

### `--bare` mode

Skips auto-discovery of hooks, skills, plugins, MCP servers, auto memory, and `CLAUDE.md`. Reproducible, fast, recommended for CI. Will become the default for `-p` in a future release.

Trade-offs:
- **Bare skips OAuth/keychain.** Auth must come from `ANTHROPIC_API_KEY` or `apiKeyHelper` in `--settings`.
- **You opt in to everything explicitly:** `--append-system-prompt-file`, `--settings`, `--mcp-config`, `--agents`, `--plugin-dir`.
- Bash, file read, and file edit tools are still available by default.

Two canonical modes:

```bash
# Interactive-equivalent: discover everything
claude -p "…"

# Reproducible scripted: nothing discovered, everything explicit
claude --bare -p "…" \
  --settings ./ci-settings.json \
  --plugin-dir ./vendored-plugins \
  --mcp-config ./mcp.json \
  --allowedTools "Read,Edit,Bash"
```

### Useful patterns

```bash
# Extract structured field
claude -p "Summarize this project" --output-format json | jq -r '.result'

# JSON Schema-constrained output
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'

# Token-level streaming
claude -p "Write a poem" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'

# Continue a session
sid=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$sid"

# Scoped bash allowlist for a commit workflow
claude -p "Review staged changes and commit" \
  --allowedTools "Bash(git diff *),Bash(git log *),Bash(git status *),Bash(git commit *)"
```

### Official docs

- Headless / programmatic usage: https://code.claude.com/docs/en/headless
- CLI reference: https://code.claude.com/docs/en/cli-reference
- Agent SDK (Python/TypeScript): https://code.claude.com/docs/en/agent-sdk/overview

---

## 2. Agent orchestrators built on Claude Code (GitHub)

Ecosystem taxonomy, roughly by complexity.

### Single-task loops — the "Ralph" pattern

Give it a plan, walk away, come back to commits. Each task runs in a **fresh Claude Code session** to keep context sharp.

| Tool | Stack | Notes |
|---|---|---|
| [umputun/ralphex](https://github.com/umputun/ralphex) | Go binary | Extended Ralph loop. Fresh session per task, parallel review agents launched via Claude Code's Task tool, stalemate detection, mid-run steering via `SIGQUIT`. Supports custom providers (Codex, Copilot) via wrapper scripts. |
| `chief` | Homebrew CLI | Wraps Claude Code in a loop; define a PRD, walk away. Commits after each task, picks up where it left off. 380+ stars. Linked from rohitg00/awesome-claude-code-toolkit. |
| ralph-claude-code / ralph-orchestrator / ralph-tui | Various | The family that popularized the "keep running until done" pattern. |

### Task-queue orchestrators — typed state machines, retries, multi-backend

| Tool | Notes |
|---|---|
| [ORCH](https://github.com/andyrewlee/awesome-agent-orchestrators) | CLI orchestrator: typed task queue with state machine (`todo → in_progress → review → done`), auto-retry, inter-agent messaging, TUI dashboard. Supports Claude Code, Codex, Cursor. ⭐ 9 |
| [awslabs/cli-agent-orchestrator (CAO)](https://github.com/awslabs/cli-agent-orchestrator) | Supervisor delegates to workers (developer, reviewer). All sessions run in tmux. Provider-agnostic: Claude Code, Kiro, Codex, Q CLI, Gemini, Kimi, Copilot. Headless CLI for CI. Web UI included. Skills as portable `SKILL.md` files that work across all providers. |
| [ComposioHQ/agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator) | Fleet management. Each agent gets its own git worktree, branch, and PR. Auto-handles CI fixes, merge conflicts, reviewer comments. Agent-agnostic (Claude Code, Codex, Aider), runtime-agnostic (tmux, Docker), tracker-agnostic (GitHub, Linear). Node.js + pnpm. |

### Spec-driven / planning-first

| Tool | Notes |
|---|---|
| [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) | TypeScript app built on the **Pi SDK** — direct access to the agent harness. Clears context between tasks, injects the right files at dispatch time, manages git branches, tracks cost/tokens, detects stuck loops, recovers from crashes, auto-advances through milestones. Has explicit `gsd headless` mode. |
| Forge | Three-command pipeline: brainstorm specs → plan task DAGs → execute autonomously. Context survival, backpropagation traces bugs to spec gaps, Claude-on-Claude code review. MIT, ⭐ 4. |
| sage | Pure bash (zero frameworks), runtime-agnostic. Wave-based plan execution, git worktree isolation, MCP, skills, headless CI mode, 295 bats tests. MIT. |

### Swarms / fleets (heavier)

| Tool | Notes |
|---|---|
| [ruvnet/claude-flow](https://github.com/andyrewlee/awesome-agent-orchestrators) | Multi-agent swarms with coordinated workflows. ⭐ 21.6k |
| [nwiizo/ccswarm](https://github.com/nwiizo/ccswarm) | Rust-native multi-agent orchestration. Git worktree isolation, specialized agents (Frontend, Backend, DevOps, QA), template system, TUI. |
| [nyldn/claude-octopus](https://github.com/nyldn/claude-octopus) | Up to 8 models in parallel with consensus gates (Codex, Gemini, Copilot, Qwen, Ollama, Perplexity, OpenRouter + Claude). 75% consensus quality gate. 32 personas, 48 commands, 52 skills. |
| [barkain/claude-code-workflow-orchestration](https://github.com/barkain/claude-code-workflow-orchestration) | Claude Code plugin. Automatic task decomposition, parallel agent execution via native `TeamCreate`/`Agent` when experimental Agent Teams is enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Soft-enforcement nudges instead of hard blocks. |
| gastown / loom / AgentsMesh | Persistent work tracking, autonomous loops, or PTY sandbox + worktree pods. |

### Curated lists worth bookmarking

- [bradAGI/awesome-cli-coding-agents](https://github.com/bradAGI/awesome-cli-coding-agents) — organized by pattern (loops, parallel runners, routers, sandboxes).
- [andyrewlee/awesome-agent-orchestrators](https://github.com/andyrewlee/awesome-agent-orchestrators) — broader; includes `swarm-protocol` MCP coordination layer and `wit` (function-level locking via Tree-sitter AST).
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — 135 agents, 35 skills, 42 commands, 176+ plugins, 26 companion apps.
- [wshobson/agents](https://github.com/wshobson/agents) — 184 specialized agents, 150 skills, 98 commands in 78 single-purpose plugins.

---

## 3. Takeaways

- Plain `claude -p` on macOS = headless session with full skills/plugins/MCP/CLAUDE.md context. Nothing extra needed for Igor's four-tier hierarchy.
- `--bare` + explicit `--settings`/`--plugin-dir`/`--mcp-config` for reproducible scripted runs where nothing should leak from local config.
- `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` is the right knob when a private marketplace is in play and plugins must be ready before turn 1.
- For reference designs that match an architecture-first style and strict boundary discipline: **ralphex** (fresh-session-per-task, maps onto the cold-start checkpoint philosophy) and **CAO** (provider-agnostic dispatch, clean study for swappable agent backends).