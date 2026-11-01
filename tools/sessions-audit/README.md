---
date: 2026-10-03
model: claude-opus-5-5
description: "Audit local Claude Code and Codex session transcripts for context-expanding agent behavior"
---

# sessions-audit

A small Python tool that scans local agent transcripts and counts behaviors that bloat context: full-file reads, re-reads with no edit in between, unfiltered builds, polling, duplicate skill loads, subagent fan-out, and large tool results. It prints a summary per agent, ranks the sessions with the most of these behaviors, can group sessions by project, and emits a versioned JSON document for downstream tools.

Requires only the Python 3 standard library, tests included.

## Layout

| File | Role |
| --- | --- |
| `sessions-audit` | Entry point (executable) with subcommands `claude`, `codex`, `all` |
| `sessions_audit_core.py` | Shared core: regexes, session counters and score, behavior tracker, aggregation, time window, project grouping, text output, JSON emitter, CLI |
| `claude_parser.py` | Claude Code adapter: transcript discovery and record parsing |
| `codex_parser.py` | Codex adapter: rollout discovery and record parsing |
| `audit_claude_sessions.py` | Compatibility wrapper for `sessions-audit claude` (old flags) |
| `audit_codex_sessions.py` | Compatibility wrapper for `sessions-audit codex` (old flags) |
| `test_sessions_audit.py` | Tests on synthetic JSONL fixtures (stdlib `unittest`): `cd tools/sessions-audit && python3 -m unittest` |

| Agent | Reads | Default location |
| --- | --- | --- |
| `claude` | Claude Code JSONL transcripts; skips `*.orphaned-*` and `*.superseded-*` files. Subagent transcripts (`<session>/subagents/*.jsonl`) are counted inside their parent session (see below) | `$CLAUDE_CONFIG_DIR/projects/` or `~/.claude/projects/` |
| `codex` | Codex rollout JSONL in `sessions/` and `archived_sessions/` | `$CODEX_HOME` or `~/.codex` |

Neither transcript format is a stable interface. Both parsers rely only on the record shapes observed so far and skip records they don't recognize. The `parse errors` count in the output shows how many lines could not be parsed.

## What is measured

| Metric | Claude Code | Codex |
| --- | --- | --- |
| Full reads | `Read` calls without `offset`/`limit` | `read_file`-style calls, plus each file printed by a `cat` or `nl` segment of a shell command (segments split on `&&`, `\|\|`, `;`; a segment with a pipe, and any command with redirection or `$(...)`, is not a read; `sed -n` ranges are not full reads) |
| Repeated reads | Re-reading a file with no observed edit to it since the last read (`Edit`/`Write`/`MultiEdit`/`NotebookEdit`) | same; edits are `write`/`edit`-style calls and `apply_patch` file headers. Paths resolve against `workdir`, then a leading `cd dir`, then the session cwd |
| Builds / unfiltered | `xcodebuild` or `swift build/test`; "unfiltered" means the output reaches the context whole: not piped through `xcsift`/`xcbeautify`/`xcpretty` or `head`/`tail`/`grep`/`rg`, not `-quiet`, and stdout not redirected to a file (`2>&1` alone does not count) | same |
| Polling candidates | `sleep`, `watch`, `gh run watch`, `gh pr checks --watch` | same, plus calls to the dedicated `sleep` tool |
| Repeated checks | The same `gh run view` / `gh pr checks` / `curl` / `wget` command run twice in a row | same |
| Skill loads / duplicates | Skill invocations; the same skill loaded more than once in a session | same |
| Subagents | `Agent`/`Task` calls, with the requested model | `spawn_agent`/`create_agent`/`delegate_to_agent` calls, with the requested model (`wait_agent`, `send_message` do not count) |
| Large results | Tool results over `--large-result-chars` (default 20,000 chars); only results whose `tool_use_id` matches a call in the same file (or that have no id) | Function outputs over the threshold; each `response_item` output is counted once (even without a visible call), and `event_msg` copies are ignored |
| Usage | Summed `usage` fields: input, cache-create, cache-read, output | Per-session max of the cumulative `token_count` totals, plus the peak last-turn input tokens |

### Codex code mode

Current Codex sends most tool calls as one `exec` custom tool call whose input is a JavaScript program; the real calls happen inside it (`tools.exec_command({cmd: "..."})`, `tools.apply_patch("...")`, `tools.write_stdin(...)`). The parser finds each nested `tools.<name>(` call and analyzes it like a direct call, taking its `cmd`/`workdir`/`path` from string literals. `tool_calls` counts the `exec` wrapper and each nested call. A nested call whose arguments are not string literals (`{cmd: someVariable}`) is counted but contributes no command. Before this, every command-based metric read 0 for Codex.

Legacy `shell` calls with `["bash", "-lc", "<script>"]` are analyzed as the script.

### Claude subagent transcripts

A subagent's transcript is a separate file, `<session>/subagents/agent-*.jsonl`, next to its parent `<session>.jsonl`. It is attributed to the parent: each subagent file is analyzed on its own, since a subagent has its own context (a read in the parent does not make the same read in a subagent "repeated"), and its counters and usage are added to the parent session. So one user session is one row, and fan-out shows up where it was started. `extras.sidechain_files` counts the subagent files merged. A subagent file whose parent transcript no longer exists is reported as its own session. The time window uses the parent's mtime.

### Score

Each session gets a score, a weighted sum of its counters:

| Counter | Weight | Why |
| --- | --- | --- |
| `unfiltered_builds` | 5 | A raw build log is usually the largest single dump into the context, and a filter almost always works |
| `repeated_reads` | 4 | The whole file is already in context and unchanged; the second copy is pure waste |
| `duplicate_skill_loads` | 3 | The same instructions loaded again |
| `repeated_checks` | 3 | The same status output again, with nothing new |
| `large_results` | 2 | Big, but sometimes the point of the call |
| `full_reads` | 1 | The baseline: often necessary, so it counts lightly |

Counters not listed (tool calls, builds, polling, skill loads, subagents) do not add to the score: they describe a session but are not waste on their own. The weights are `SCORE_WEIGHTS` in `sessions_audit_core.py`, and the JSON output records them in `options.score_weights`. To rank by other weights, change the dict or recompute from the JSON counters.

The score is a rough way to rank sessions for a closer look. It is not a quality grade. Totals and per-project rows use the same formula on their summed counters.

Text output prints session paths relative to the agent's root (Claude projects directory or `CODEX_HOME`), so the output does not repeat your home directory. JSON keeps the full path.

## Usage

```bash
cd tools/sessions-audit

./sessions-audit all --days 7                  # both agents, last 7 days, top 15 sessions each
./sessions-audit codex --days 7 --top 5
./sessions-audit codex --active-only           # skip archived_sessions
./sessions-audit claude --since 2026-09-01 --until 2026-10-01
./sessions-audit all --by-project              # add a per-project table
./sessions-audit all --json > audit.json       # versioned JSON (schema v1)
./sessions-audit claude --claude-root /path/to/projects --large-result-chars 50000
```

Flags:

- `--claude-root PATH` (`claude`, `all`): Claude projects directory. Default `$CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects`.
- `--codex-home PATH` (`codex`, `all`): Codex home. Default `$CODEX_HOME` or `~/.codex`.
- `--active-only` (`codex`, `all`): skip Codex `archived_sessions/`.
- `--days N`: only transcripts modified in the last N days (since = now − N×24h). N must be ≥ 0; a negative or out-of-range N is a usage error (exit code 2).
- `--since WHEN`: only transcripts modified at or after WHEN. Mutually exclusive with `--days`.
- `--until WHEN`: only transcripts modified strictly before WHEN (exclusive upper bound).
- A `WHEN` that is malformed or too close to the limits of the calendar to convert is a usage error (exit code 2).
- `--top N`: how many of the highest-scoring sessions (and projects, with `--by-project`) to print (default 15). Does not limit JSON.
- `--large-result-chars N`: size threshold for a "large" result (default 20,000).
- `--by-project`: group sessions by project (see below).
- `--json`: print JSON (schema v1) instead of text.

For `all`, a missing root for one agent is a warning on stderr and that agent is skipped. For `claude` or `codex`, a missing root is an error (exit code 2).

### Time window

- `WHEN` is `YYYY-MM-DD` or an ISO 8601 datetime (`2026-10-01T09:30`, `2026-10-01T09:30:00+02:00`, `...Z`). A value without a timezone is local time.
- A date-only value means the start (local midnight) of that day, for both bounds. So `--since 2026-10-01` includes all of Oct 1, and `--until 2026-10-02` includes everything up to the end of Oct 1 and excludes Oct 2.
- Filtering is on the transcript file's modification time (mtime), the same basis as `--days` has always used. A long session that started before the window but was still being written inside it is included.
- Without any window flag the whole history is scanned.

### By project

`--by-project` groups sessions by project. The project key is the git repository root containing the session's working directory, resolved without running git:

- An existing cwd is canonicalized first (symlinks resolved), and the root found is canonicalized too, so a symlink alias of a repository, the repository itself, and its linked worktrees all group as one project.
- Walk up from the cwd looking for `.git`. A `.git` directory marks the repository root.
- A `.git` file (linked worktree, `gitdir: <main>/.git/worktrees/<name>`) resolves to the main repository root via the gitdir's `commondir` file (or the `worktrees/` parent if `commondir` is missing). Other `.git` files (submodules) keep their own checkout as the project.
- If no repository is found, the canonical cwd is the key. If the cwd does not exist on this machine, the key is the cwd with only `normpath` applied (no symlink resolution). A session with no recorded cwd is `(unknown)`.

Session cwd: Claude uses the first `cwd` seen in the transcript; Codex uses the `session_meta` cwd, falling back to the first `turn_context` cwd.

The text output prints a per-project table (score, sessions, tool calls, key counters, total tokens) sorted by score. JSON adds a `by_project` list to each agent block.

### Compatibility wrappers

`audit_claude_sessions.py` and `audit_codex_sessions.py` still work and delegate to the same core:

```bash
python3 audit_claude_sessions.py --root /path/to/projects --days 7
python3 audit_codex_sessions.py --home ~/.codex --active-only --top 5
```

`--root` is the old name for `--claude-root`; `--home` for `--codex-home`. They also accept all the common flags above (`--since`, `--until`, `--by-project`, ...).

**Breaking change:** their `--json` output now uses the schema v1 document below (one agent under `agents`). The old flat shape (`usage`/`token_totals` at the top level, `sessions_detail`) is gone. For example, the old `.sessions_detail` is now `.agents.codex.sessions`:

```bash
./sessions-audit codex --days 7 --json | jq '.agents.codex.sessions | sort_by(-.score) | .[:5]'
```

## JSON schema (v1)

`--json` prints one object. This is the contract for tools that read the output.

```
{
  "schema_version": 1,
  "generated_at": "2026-10-03T09:00:00+00:00",
  "window": {"since": "<ISO 8601 UTC>" | null, "until": "<ISO 8601 UTC>" | null, "basis": "file_mtime"},
  "options": {"large_result_chars": 20000, "top": 15, "score_weights": {"unfiltered_builds": 5, ...}},
  "agents": {
    "claude": { ...agent block... },
    "codex":  { ...agent block... }
  },
  "totals": { ...totals across agents present... }
}
```

Top level:

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | int | `1` for this document shape |
| `generated_at` | string | Run time, ISO 8601 in UTC |
| `window.since` / `window.until` | string or null | Effective bounds in UTC (`since` inclusive, `until` exclusive); null when unbounded |
| `window.basis` | string | Always `"file_mtime"`: filtering is on transcript mtime |
| `options.large_result_chars` | int | Large-result threshold used |
| `options.top` | int | `--top` value (affects text output only) |
| `options.score_weights` | object | Counter → weight used for `score` |
| `agents` | object | One block per agent actually run (`claude`, `codex`); a skipped agent is absent |
| `totals` | object | Counters and `tokens` summed across the agents present, same keys as an agent's `totals` |

Agent block:

| Field | Type | Meaning |
| --- | --- | --- |
| `source` | object | Claude: `{"root": path}`. Codex: `{"home": path, "active_only": bool}` |
| `totals` | object | `sessions` plus every counter below summed over sessions, `score`, and normalized `tokens` |
| `extras` | object | Agent-specific raw usage (see below) |
| `subagent_models` | object | Requested subagent model → count (`"unspecified"` when none) |
| `top_tools` | array | Up to 15 `[tool_name, count]` pairs, most used first |
| `by_project` | array | Only with `--by-project`: one row per project, sorted by score descending |
| `sessions` | array | Every scanned session (never limited by `--top`), in path order |

Counters (in `totals`, `by_project` rows, and each session): `tool_calls`, `full_reads`, `repeated_reads`, `builds`, `unfiltered_builds`, `polling_candidates`, `repeated_checks`, `skill_loads`, `duplicate_skill_loads`, `subagents`, `large_results`, `result_chars`, `parse_errors`. All ints.

`by_project` row: `project`, `sessions`, every counter, `score`, `tokens`.

Session entry:

| Field | Type | Meaning |
| --- | --- | --- |
| `agent` | string | `"claude"` or `"codex"` |
| `path` | string | Transcript path (as discovered under the given root) |
| `mtime` | string | File modification time, ISO 8601 UTC |
| `cwd` | string or null | Session working directory (see By project) |
| `project` | string | Project key (always present, even without `--by-project`) |
| `score` | int | Session score |
| counters | int | Every counter above |
| `largest_result_chars` | int | Size of the largest counted tool result |
| `tokens` | object | Normalized tokens for the session |
| `extras` | object | Agent-specific raw usage for the session |

### Tokens

`tokens` is normalized across agents: `{"input", "cached", "cache_creation", "output", "reasoning"}`, all ints. `input` is **uncached** input, so `input + cached + cache_creation` is the total prompt tokens, and `input + cached + cache_creation + output` is the total.

| Field | Claude | Codex (from the session's max cumulative `total_token_usage`) |
| --- | --- | --- |
| `input` | `input_tokens` | `input_tokens − cached_input_tokens` (clamped at 0) |
| `cached` | `cache_read_input_tokens` | `cached_input_tokens` |
| `cache_creation` | `cache_creation_input_tokens` | `cache_write_input_tokens` (0 if absent) |
| `output` | `output_tokens` | `output_tokens` (already includes reasoning) |
| `reasoning` | always 0: Claude does not report it separately (it is inside `output`) | `reasoning_output_tokens` (a subset of `output`; do not add it again) |

Raw values stay in `extras`:

- Claude session: `{"usage": {input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}, "sidechain_files": int}`, usage summed over the assistant messages of the session and its subagent transcripts. Agent block: the same keys summed over sessions.
- Codex session: `{"token_total": {raw cumulative keys, e.g. input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}, "peak_last_input_tokens": int}`. Agent block: `{"token_totals": summed raw keys, "peak_last_input_tokens": max over sessions}`.

Keys missing from a transcript are absent in raw `extras` (they are 0 in `tokens`).

### Versioning

- Adding fields does not change `schema_version`. Readers must ignore fields they don't know.
- Renaming or removing a field, or changing what a field means, bumps `schema_version`.

## Privacy

The tool only reads transcripts, and it never prints the contents of tool results. It measures result sizes but never outputs the text. The output does include transcript file paths (relative to the agent's root in text output), working directories, and project paths, and those contain project directory names. Review the output before you share it.
