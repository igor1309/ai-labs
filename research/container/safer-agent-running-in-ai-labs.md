---
date: 2026-06-13
model: claude-opus-4-8
description: "Applying Apple container machines (WWDC 2026) to run AI agents more safely in the ai-labs repo — fit per workload, agonara assessment, and install/version status"
---

# Safer AI-Agent-Running in ai-labs with Apple Container Machines

## Executive summary

Apple **container machines** (WWDC 2026, `container` CLI 1.0.0) are persistent,
hardware-isolated **Linux** VMs on Apple Silicon. The full capability/CLI/constraint
write-up lives in
[`wwdc-2026-launch-in-container.md`](wwdc-2026-launch-in-container.md) (iFora
`ios.config` repo); this note applies it to **ai-labs**.

Bottom line: the source note's headline caveat — "you can only sandbox the agent
*process*, not the iOS *work product*" — **does not apply here**. ai-labs is
Node/TypeScript end to end, all Linux-targetable, so the process *is* the work
product. A container machine is a strict isolation upgrade for agent-running here
(VM-level vs host or Docker namespace isolation), with three caveats that bite
specific workloads (Langfuse compose, native modules, beta-OS networking).

**Status as of 2026-06-13: the `container` CLI is NOT installed on this machine**
(`container not found`). Everything below is a design target, not a verified local
setup. Install from GitHub releases or Homebrew (`apple/container`) before scripting
against it, and re-verify the medium-confidence flag syntax from the source note.

## Why this repo is the good case

The source note was written for an iOS repo, where Apple's Linux-only guests can't
build `.xcodeproj`, run XCTest, or drive the Simulator — so sandboxing buys little.
ai-labs is the opposite: Node/TS workspaces (`nomos`, `web-scout`, `corpus-scout`,
`session-digest`, `reinix`, `agonara`, `clipdeck`), `node --test`, `tsc`, wrangler,
and the `docker/langfuse` stack. No macOS-only toolchain sits in the critical path.

What "safer" buys:

- **Hardware-level VM isolation per machine** — stronger than Docker's shared-kernel
  namespaces. A prompt-injected or runaway agent (`rm -rf`, exfiltration, process
  spawning) is confined to the VM, not the host home directory.
- **Persistent Linux FS** across sessions — reproducible agent state without polluting
  the Mac.
- **Direct IP per machine, no port forwarding** — trivial to reach an agent-spawned
  dev server.
- **Sub-second start** — cheap enough for per-task machines, not just long-lived ones.

## Per-workload fit

Scope of this note: **development** — running the coding agent that builds these
projects inside an isolated VM, not deploying the services. Fit is judged by whether
the dev loop (install/test/build/run) runs in a Linux VM and whether the isolation
actually contains the agent.

| Workload | Dev-sandbox fit | Why |
|---|---|---|
| agonara (Node HTTP server, SQLite) | **Strong** | Dev loop is pure Linux-targetable; matches the WWDC edit-on-host/build-in-VM workflow. See below. |
| Generic Node/TS test/build (`nomos`, `web-scout`, `corpus-scout`, `session-digest`, `reinix`) | **Strong** | `node --test`/`tsc` run unchanged inside the VM. |
| `docker/langfuse` (ClickHouse + Langfuse) | **Weak / not drop-in** | Multi-service networking + Compose are both gaps (see caveats). Run on host or wait for macOS 26. |
| Cloudflare Workers (`oracle/apps/*`, wrangler) | **Partial** | wrangler dev runs in the VM; deploy targets Cloudflare's edge, so isolation only helps local dev. |

## agonara: would it fit or bite (as a dev sandbox)?

**It fits — and the workflow is the one Apple demoed.** The WWDC demo is exactly this
shape: edit source on the macOS host, build and run *inside* the container machine.
For agonara the whole dev loop maps cleanly — `npm install`, `npm test`
(`node --test` + `openapi:check` + redocly lint), and `npm start` all run in the
Linux VM. Sub-second start lets you spin a clean machine per feature or per worktree;
the persistent FS keeps dev state across sessions.

The real safety win requires the **coding agent to run *inside* the VM**, not on the
host driving it via `container machine run`. Agent-on-host isolates only command
*execution* — the agent's own file writes and network stay on the host. Agent-in-VM
confines its shell, writes, spawned processes, and network.

Where it bites:

- **Home-directory mirroring works *against* the safety goal.** The headline
  convenience (source note line 24: auto-mirror the macOS username and home directory
  into the VM) means an agent inside the VM may read/write the host home — the exact
  blast radius you are trying to contain. For a safety objective you must **scope the
  mount to the agonara repo** (or work VM-side and extract artifacts with
  `container cp`), not accept the default whole-home mirror. This is the central design
  decision, not a footnote.
- **`better-sqlite3` is a native module in a mirrored tree.** Built inside the VM it
  produces an arm64-**Linux** binary in `node_modules`; if `node_modules` lives in the
  mirrored host tree it collides with the host's macOS build. Keep `node_modules`
  VM-local (build in-VM; don't mirror that dir). Never copy the host macOS binary in.
- **`openapi:lint` (redocly)** runs in `npm test`; telemetry is already env-disabled in
  the script, so no surprise network calls, but the lint binary must be in the image.

Net: agonara is a strong per-feature dev-sandbox candidate (modulo CLI install), with
two real setup decisions — scoping the mount away from the host home, and keeping the
native `better-sqlite3` build VM-local.

## Caveats that bite ai-labs specifically

- **Home-directory mirroring undermines isolation.** The default auto-mirror of the
  host home into the VM means an agent running in the VM can reach host files. For any
  safety objective, scope the mount to the target repo (or extract via `container cp`)
  instead of accepting the whole-home mirror. Applies to every dev-sandbox use here.
- **macOS 26 required for full functionality.** On macOS 15, container-to-container
  networking is degraded — this directly hurts `docker/langfuse/docker-compose.yml`
  (ClickHouse ↔ Langfuse) and any multi-service agent setup. agonara (single service)
  is unaffected.
- **No native Docker Compose in 1.0.0.** The Langfuse stack won't port over directly;
  third-party bridges are unofficial. Single-service workloads (agonara) sidestep this.
- **Memory not returned to host.** Long-running agent loops accrete memory inside a
  machine — plan periodic restarts for cron/batch agents.
- **Image must include `/sbin/init`** for a persistent machine; a `scratch`/minimal
  Node image needs an init layer.
- **Beta freshness.** `container` 1.0.0 (2026-06-09) and macOS 26 are new; the
  `container machine set cpus=… memory=…` flag syntax and macOS-15 networking details
  are medium-confidence in the source note — verify against the installed CLI.

## Concrete path for an agonara dev sandbox (once CLI is installed)

1. Build an arm64 Linux image: `node:22` base + git + the coding agent CLI +
   `/sbin/init`, reusing the existing `docker/` discipline rather than a parallel
   system.
2. Create a per-feature machine, scoping the mount to the repo (not the whole home):
   ```bash
   container machine create --name agonara-dev --set-default <image>
   container machine set -n agonara-dev cpus=4 memory=8G   # flag syntax: verify
   ```
3. Inside the machine: `npm install` (rebuilds `better-sqlite3` for arm64 Linux,
   `node_modules` kept VM-local, not in the mirrored tree), then run the dev loop
   (`npm test`, `npm start`); reach the server via the machine's direct IP.
4. Run the coding agent **inside** the machine so its writes/network are confined;
   pull finished artifacts back to the host with `container cp`.

## Is it worth it?

**For interactive agonara development today: no.** The only thing a container machine
buys is hardware-level containment of the coding agent's blast radius, and that threat
is already covered more cheaply by layers the repo has: git worktrees (`worktrees/`)
contain repo-level mistakes, Claude Code permission modes gate dangerous operations,
and commit discipline makes damage recoverable. The marginal isolation over
"agent-on-host, permissions on, in a worktree" is thin.

The cost is not thin: a macOS 26 (beta) dependency, a custom `/sbin/init` image to
maintain, the `better-sqlite3` VM-local rebuild, and — decisively — to get real
isolation you must scope the mount away from the home directory, which defeats the
auto-mirror convenience that is the feature's main selling point. Plain Docker would
already be overkill for this; a container machine is heavier still.

**The verdict flips** when the threat model changes:

- Agent runs **autonomously/unattended** with broad permissions
  (`--dangerously-skip-permissions`, long `/loop` runs, cron agents).
- **Many agents in parallel** needing clean, reproducible, mutually-isolated envs.
- Agent **fetches and executes untrusted code/content**.
- Work happens on a **shared or sensitive machine** where host exposure is unacceptable.

None of these describe interactive agonara dev now, so the lighter setup wins until one
of them does.

## Sources

- [`wwdc-2026-launch-in-container.md`](wwdc-2026-launch-in-container.md) — source
  capability/constraint write-up (iFora `ios.config` repo), accessed 2026-06-13.
- Local verification: `container` CLI not found on host as of 2026-06-13.
- Repo grounding: `package.json` (workspaces), `agonara/package.json`,
  `agonara/README.md`, `docker/langfuse/docker-compose.yml`.

## Confidence and gaps

**High confidence:** ai-labs workloads are Linux-targetable; agonara is a
single-process BYOA server and a strong fit; `better-sqlite3` is native and needs
in-VM rebuild; Langfuse needs Compose + inter-service networking (gaps); `container`
CLI is not installed locally.

**Inherited medium confidence (from source note):** `container machine set` flag
syntax; macOS-15 networking caveats — verify against the installed CLI.

**Gaps:** no local CLI to confirm actual command surface; host macOS version not
checked against the macOS-26 requirement; `better-sqlite3` arm64-Linux prebuilt
availability not tested.
