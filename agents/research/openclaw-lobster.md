---
date: 2026-06-02
model: claude-opus-4-8
description: "Reference: what OpenClaw Lobster is, its install status on the RackNerd VPS (107.172.143.196), the .lobster format, how a flow is triggered (cron schedules agent turns), the standalone CLI surface, and the nested-call constraint. Verified against the 2026.5.28 install and docs.openclaw.ai."
---

# OpenClaw Lobster — What It Is and Install Status

Grounded against the live CLI (OpenClaw `2026.5.28`, commit `e932160`) on the
RackNerd VPS (`107.172.143.196`) and the official docs at `docs.openclaw.ai`.

## What Lobster Is

A **typed workflow runtime** for OpenClaw. It runs multi-step tool sequences as a
single, deterministic operation with **explicit approval checkpoints** and
**resumable state** — a workflow can pause for approval and resume later without
re-running earlier steps. It is the "deterministic steps" layer that
[TaskFlow](openclaw-taskflow.md) orchestrates on top of.

Docs: https://docs.openclaw.ai/tools/lobster and
https://docs.openclaw.ai/plugins/reference/lobster

## Is It Installed on the VPS? Yes (since 2026-06-02)

**Installed and activated on 2026-06-02** on the RackNerd VPS
(`107.172.143.196`, OpenClaw `2026.5.28`):

- Plugin `lobster` v2026.5.28 installed from `clawhub:@openclaw/lobster`
  (official, integrity-verified) → `~/.openclaw/extensions/lobster`. Status:
  **loaded**.
- Plugin **enabled**; tool gate `tools.alsoAllow: ["lobster"]` written to
  `~/.openclaw/openclaw.json` (config valid).
- Gateway restarted; event loop back to `ok`.
- Recovery is documented in `inventory` repo `vps/OpenClaw/migration.md`
  Phase 2 step 5.

### Original "not installed" finding (pre-2026-06-02, historical)

Before the install, on the live `2026.5.28` host:

- **No `lobster` stock extension** — absent from
  `~/.npm-global/lib/node_modules/openclaw/dist/extensions/` (which holds 93
  other plugins, none named lobster).
- **Not in `openclaw plugins list`** — grep returns nothing.
- **No `lobster` binary on PATH.**
- The only `lobster` references in the installed code are incidental: the
  `.lobster` file extension recognized by `oc-path` (yaml/yml/lobster), and an
  entry in the **external** plugin catalog — which itself confirms Lobster is an
  installable add-on, not bundled.

## Does It Need a Separate Install? Yes

Per the plugin reference, Lobster is the optional plugin **`@openclaw/lobster`**,
distributed via **npm / ClawHub**. It is **not stock and not enabled by
default**. Two layers:

1. **The plugin** (`@openclaw/lobster`) — must be installed and enabled. (Done
   on the VPS 2026-06-02 — see status section above.)
2. **The tool gate** — even once the plugin is present, the `lobster` tool is
   opt-in. Enable it additively in config:
   ```json
   { "tools": { "alsoAllow": ["lobster"] } }
   ```
   (Now set on the VPS.)

The **standalone `lobster` CLI binary** (from the GitHub repo, on PATH) is only
needed for *local dev* of workflows. For in-agent use, the plugin's embedded
runner handles bundled workflows — but the plugin itself still must be installed,
which it is not here.

## Doc Wording Caveat

The `tools/lobster` page phrases it as "the embedded runner ships with the
Lobster plugin," which can read as "built-in." That is misleading for this
install: the runner ships *with the plugin*, and the plugin itself is a separate
`@openclaw/lobster` package that is not part of the stock set here.

## Install/activate sequence (as actually run, 2026-06-02)

The commands used, verified against the live `2026.5.28` CLI:

```bash
openclaw plugins install clawhub:@openclaw/lobster
openclaw plugins enable lobster
openclaw config set tools.alsoAllow '["lobster"]' --strict-json
sudo systemctl restart openclaw        # gateway restart to load the plugin
openclaw plugins inspect lobster       # verify Status: loaded
```

Adding the plugin changes bootstrap state, so it is reflected in
`vps/OpenClaw/migration.md` (Phase 2 step 5) per the inventory repo's OpenClaw
maintenance rule.

## `.lobster` file format

Version-controllable YAML/JSON. Fields: `name`, `args`, `env`, `steps`,
`condition`, `approval`. Step anatomy:

- `id` — step identifier.
- `command` — **any shell command or external script** (so a tested TS CLI runs
  as a step; docs: "If you want JS/TS, generate `.lobster` files from code").
- `stdin` — pipe a prior step's output via `$stepId.stdout` / `$stepId.json`.
- `approval: required` — gate execution on explicit approval.
- `condition` — e.g. `$approve.approved`.

```yaml
name: inbox-triage
steps:
  - id: collect
    command: inbox list --json
  - id: categorize
    command: inbox categorize --json
    stdin: $collect.stdout
  - id: execute
    command: inbox apply --execute
    stdin: $categorize.stdout
    condition: $approve.approved
```

## How a flow is triggered (key intel)

- **From an agent/tool:** the `lobster` tool with `action: "run"` + a `pipeline`
  (named or a `.lobster` path, with `argsJson`). Resume with
  `action: "resume", token, approve`.
- **On a schedule:** `openclaw cron` schedules **agent turns**, *not* shell
  commands or pipelines. From `openclaw cron add --help` (live): positional
  `[message]` + `--agent <id>`, `--session main|isolated`, `--cron/--every/--at`,
  delivery via `--announce/--to/--thread-id/--webhook` (`--webhook` POSTs the
  finished payload). So a nightly flow launches as: **scheduled agent turn → the
  agent runs the Lobster pipeline as a gateway tool**, which also registers the
  run in the TaskFlow/tasks ledger (observability). To dodge gotcha #13 the
  schedule can live in external `/etc/cron.d` invoking `openclaw agent` rather
  than `openclaw cron add`.
- The **standalone `lobster` CLI** can run a `.lobster` file directly in an
  external pipeline, but a run outside the gateway may not register in the ledger.

## Standalone CLI surface (from the repo)

`exec`, `where`, `pick`, `head`, `json`, `table`, `approve`, `workflows.run`,
`graph` (visualize structure — mermaid/dot/ascii), `doctor`. **No dedicated
`validate` / `lint` / `dry-run` / `test`.** → flow *wiring* is statically
inspected via `graph` + integration-tested by running; *step logic* (our CLIs) is
unit-tested in the repo suite.

## Durability / resume

An approval gate returns `status: "needs_approval"` + a compact `resumeToken`;
Lobster stores resume state under its state dir and continues without re-running
prior steps. This is **in-flight** flow state — distinct from any per-scope
last-audited cursor an orchestration owns.

## Constraint to spike

Embedded (in-process) Lobster **"does not reliably support `openclaw.invoke` for
nested calls."** A step that calls `openclaw agent` is exactly such a nested call.
Mitigations: use the standalone `lobster` CLI for that step, or call `llm-task`
directly. Resolve before relying on the in-gateway path.

## References

- https://docs.openclaw.ai/tools/lobster
- https://docs.openclaw.ai/plugins/reference/lobster
- https://docs.openclaw.ai/automation/taskflow (orchestrates Lobster steps)
- https://docs.openclaw.ai/cli/cron (cron schedules agent turns)
- https://github.com/openclaw/lobster (standalone CLI, dev only)
