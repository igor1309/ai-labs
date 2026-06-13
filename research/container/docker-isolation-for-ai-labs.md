---
date: 2026-06-13
model: claude-opus-4-8
description: "Per-project Docker as the right-sized agent-isolation strategy for ai-labs — how safe namespace isolation actually is, the config rules that determine that safety, and a per-project container architecture."
---

# Docker Isolation for ai-labs

## Scope

How to sandbox an AI coding agent doing **ai-labs development** (not deployment),
why Docker is the right-sized tool for this repo, how safe its isolation actually is,
and a per-project container architecture. Companion to
[`safer-agent-running-in-ai-labs.md`](safer-agent-running-in-ai-labs.md) (which
rejected Apple container machines as too heavy/beta) and to the iOS-side macOS-VM work
that lives in the separate `ios.config` repo.

## Why Docker fits the whole repo

ai-labs is **entirely Linux-targetable** — verified 2026-06-13:

- Node/TS workspaces (`agonara`, `clipdeck`, `nomos`, `web-scout`, `corpus-scout`,
  `session-digest`, `reinix`, `oracle`).
- Server-side Swift: `notio/backend` (Hummingbird + AsyncHTTPClient + swift-log),
  `neris/packages/swift-neris`. **No** UIKit/SwiftUI/AppKit/Combine in first-party
  code; the only `.xcodeproj` files are inside `.build/checkouts` (SPM dependencies).
- No iOS/macOS-GUI code anywhere — nothing forces macOS.

So Docker (`node:22` for JS, the official `swift` Linux image for the backends) is the
right-sized isolation. The macOS VM (`vortex-agent`, Tart) is needed **only** for the
iOS work in the other repo, where Xcode has no Linux build. Two tools, two repos.

## How safe is namespace isolation, really?

Docker does **not** virtualize hardware. It confines a process with Linux **kernel
namespaces** (PID, mount, network, UTS, IPC, user), **cgroups** (resource limits),
**dropped capabilities**, and a **default seccomp/AppArmor profile**. Crucially, the
container **shares the host kernel** — that shared kernel is the isolation boundary.

What this means for the agent-sandbox threat model:

### What Docker contains well

A coding agent that makes a mess or follows a prompt-injected instruction — `rm -rf`,
runaway processes, writing junk, arbitrary network calls — is confined to the
container's filesystem, process tree, and (if configured) network. This is the realistic
threat for solo, human-in-the-loop dev, and Docker handles it **provided the
configuration is right** (below).

### What it does not fully protect against

- **Kernel-level escape.** A container escape needs a host-kernel exploit (or a
  runtime/misconfig). Real but relatively rare, and requires the vulnerable syscall to
  be reachable through seccomp. Mitigated by keeping the host patched.
- **A determined adversary.** If the threat is a genuinely malicious agent actively
  trying to break out, a VM's hypervisor boundary is far smaller and more battle-tested
  than the kernel syscall surface. **VM > container** for adversarial isolation.

### The dominant real-world risk is configuration, not the kernel

In practice, isolation is broken by misconfiguration far more often than by kernel
0-days. The rules that actually determine safety:

1. **Never mount sensitive host paths writable** (home dir, `~/.ssh`, `~/.aws`,
   credential stores). This is the #1 way an agent sandbox leaks back to the host — and
   the same mirroring tension that sank the container-machine option. Prefer
   `git clone` *inside* the container, or mount only the project dir.
2. **Never mount the Docker socket** (`/var/run/docker.sock`). It is trivial host
   takeover — the container can spawn privileged siblings.
3. **Never use `--privileged`** and do not `--cap-add` beyond need; keep the default
   dropped-capability set.
4. **Run as a non-root user** inside the container; enable user-namespace remapping if
   available, so in-container uid 0 is not host root.
5. **Keep the default seccomp/AppArmor profile on.**
6. **Set cgroup resource limits** (`--memory`, `--cpus`, `--pids-limit`) so a runaway
   agent cannot starve the host.
7. **Constrain network egress** if exfiltration is a concern (allowlist the LLM/API
   endpoints). Often overkill for solo dev, but available.

### Verdict

For solo, human-in-the-loop development on these low-sensitivity projects, correctly
configured Docker is **adequate** — the boundary is weaker than a VM, but the realistic
risk (mistakes, prompt injection) is well contained, and the residual risk is dominated
by config you control. Escalate to a VM only if the threat model becomes adversarial,
unattended/autonomous with broad permissions, or moves to a shared/sensitive host.

## Per-project container architecture

One container per project, mirroring the repo's existing **per-project CI isolation**
(`<project>-core.yml`). This is the preferred shape over one monolithic dev container.

Why per-project:

- **Blast radius per project.** An agent working on `agonara` cannot reach `notio`'s
  source or secrets, and vice versa — isolation between projects, not just from the host.
- **Dependency isolation.** Each project's `node_modules` / `.build` stays
  container-local; no cross-contamination, no native-module arch clashes
  (`better-sqlite3` builds for the container).
- **Right base image per toolchain.** `node:22` for JS projects; the `swift` Linux
  image (matching the project's Swift toolchain) for `notio`/`neris`.
- **Parity with CI.** The container mirrors what `<project>-core.yml` already isolates,
  so "works in my container" tracks "passes CI."
- **Per-project secrets.** Inject only that project's Nomos key / API keys into its
  container (the repo already mandates one Nomos project+key per project).

Shape options (pick per taste): a `Dockerfile` per project, a devcontainer per project,
or a `docker-compose.yml` with one service per project. Keep it consistent with the
existing `docker/` discipline rather than inventing a parallel system.

## Caveats for full ai-labs in Docker

- **Two toolchains.** Per-project containers handle this naturally (node vs swift
  images); a single combined image is possible but heavier and less clean.
- **Playwright** (e2e devDep) needs browser binaries — use the official Playwright image
  or `npx playwright install --with-deps`.
- **Cloudflare Workers** (`oracle/apps/*`, wrangler): `wrangler dev`/tests run in the
  container; `wrangler deploy` is a network+auth action (needs creds) — deploy, not dev.
- **`docker/langfuse`** is a Compose *infra* stack, not code under edit. Run it on the
  host or as sibling containers — do **not** nest it inside a dev container
  (docker-in-docker is painful and weakens isolation if you mount the socket to do it).
- **Secrets + egress.** Per-project keys must be injected; LLM calls need network
  egress. Mount secrets read-only and scoped to the one project.
- **`better-sqlite3`** builds container-local; never copy a host-built binary in.

## Relation to the macOS VM

| Repo | Workload | Isolation tool | Why |
|---|---|---|---|
| ai-labs (this repo) | Node/TS + server-side Swift | **Per-project Docker** | All Linux-targetable; right-sized, mature, matches CI |
| ios.config / Vortex | iOS (Xcode, Simulator) | **Tart macOS VM** | Xcode has no Linux build; VM is the only option |

Co-locating ai-labs work in the macOS VM is *uniformity-of-habit* convenience, not a
technical need — Docker is the properly-sized tool for this repo.

## Grounding

- Repo inspection 2026-06-13: `package.json` workspaces; `notio/backend/Package.swift`
  (Hummingbird/AsyncHTTPClient/swift-log, `platforms: [.macOS(.v15)]` floor only);
  no UIKit/SwiftUI/AppKit/Combine in first-party Swift; `.xcodeproj` only under
  `.build/checkouts`.
- Existing repo Docker conventions: `docker/` directory, `docker-discipline` skill,
  per-project `<project>-core.yml` CI isolation.

## Confidence and gaps

**High confidence:** ai-labs is fully Linux-targetable; Docker namespace isolation
contains non-adversarial agent behavior when host mounts/socket/privileged are avoided;
VM offers a stronger boundary than a container; per-project containers map onto existing
CI isolation.

**Gaps:** exact Swift toolchain version for the `swift` base image not pinned here
(match the project); whether user-namespace remapping is enabled on the intended host
not verified; network-egress allowlisting not designed (named as an option only).
