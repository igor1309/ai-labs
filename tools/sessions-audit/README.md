---
date: 2026-09-29
model: claude-opus-5-5
description: "Audit local Claude Code and Codex session transcripts for context-expanding agent behavior"
---

# sessions-audit

Two standalone Python scripts that scan local agent transcripts and count behaviors that bloat context: full-file reads, re-reads with no edit in between, unfiltered builds, polling, duplicate skill loads, subagent fan-out, and large tool results. Each script prints a summary and ranks the sessions with the most of these behaviors.

Requires only the Python 3 standard library.

## Scripts

| Script | Reads | Default location |
| --- | --- | --- |
| `audit_claude_sessions.py` | Claude Code JSONL transcripts, including `subagents/` | `$CLAUDE_CONFIG_DIR/projects/` or `~/.claude/projects/` |
| `audit_codex_sessions.py` | Codex rollout JSONL (`rollout-*.jsonl`) in `sessions/` and `archived_sessions/` | `$CODEX_HOME` or `~/.codex` |

Neither transcript format is a stable interface. Both parsers rely only on the record shapes observed so far and skip records they don't recognize. The `parse errors` count in the output shows how many lines could not be parsed.

## What is measured

| Metric | Claude Code | Codex |
| --- | --- | --- |
| Full reads | `Read` calls without `offset`/`limit` | `read_file`-style calls plus plain `cat <file>` shell commands ("likely full-file") |
| Repeated reads | Re-reading a file with no observed edit to it since the last read | same |
| Builds / unfiltered | `xcodebuild` or `swift build/test`; "unfiltered" means not piped through `xcsift`/`xcbeautify`/`xcpretty`/`-quiet` | same |
| Polling candidates | `sleep`, `watch`, `gh run watch`, `gh pr checks --watch` | same |
| Repeated checks | The same `gh run view` / `gh pr checks` / `curl` / `wget` command run twice in a row | same |
| Skill loads / duplicates | Skill invocations; the same skill loaded more than once in a session | same |
| Subagents | `Agent`/`Task` calls, with the requested model | Calls that look like spawning an agent, with the requested model |
| Large results | Tool results over `--large-result-chars` (default 20,000 chars) | Function outputs over the threshold; each `response_item` output is counted once, and `event_msg` copies are ignored |
| Usage | Summed `usage` fields: input, cache-create, cache-read, output | Cumulative token totals, plus the peak last-turn input tokens |

Each session gets a score:

```
score = 4·repeated_reads + 5·unfiltered_builds + 3·duplicate_skill_loads
      + 3·repeated_checks + 2·large_results + full_reads
```

The score is a rough way to rank sessions for a closer look. It is not a quality grade.

## Usage

```bash
cd tools/sessions-audit

python3 audit_claude_sessions.py --days 7          # last 7 days, top 15 sessions
python3 audit_codex_sessions.py --days 7 --top 5
python3 audit_codex_sessions.py --active-only      # skip archived_sessions
python3 audit_claude_sessions.py --root /path/to/projects --large-result-chars 50000
```

Common flags:

- `--days N`: only transcripts modified in the last N days. Without it, the whole history is scanned.
- `--top N`: how many of the highest-scoring sessions to list (default 15).
- `--large-result-chars N`: size threshold for a "large" result (default 20,000).
- `--json`: print JSON instead of text.

Script-specific flags: `--root` (Claude projects directory) and `--home`/`--active-only` (Codex).

### JSON output

`--json` prints one object. It contains the aggregate counters (`sessions`, `tool_calls`, `full_reads`, `repeated_reads`, `builds`, `unfiltered_builds`, `polling_candidates`, `repeated_checks`, `skill_loads`, `duplicate_skill_loads`, `subagents`, `large_results`, `result_chars`, `parse_errors`), token usage (`usage` for Claude; `token_totals` and `peak_last_input_tokens` for Codex), `subagent_models`, `top_tools`, and `sessions_detail`, which has an entry for every scanned session with its path, score, and counters. `--top` does not limit it.

```bash
python3 audit_codex_sessions.py --days 7 --json | jq '.sessions_detail | sort_by(-.score) | .[:5]'
```

## Privacy

The scripts only read transcripts, and they never print the contents of tool results. They measure result sizes but never output the text. The output does include transcript file paths, and those paths contain project directory names. Review the output before you share it.
