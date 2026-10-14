# ADR-029: An unverified runtime version is probed

- **Status:** Accepted
- **Date:** 2026-10-10
- **Scope:** how a runtime version comes to be verified for a mapping's
  primitives when the settings do not list it
- **Decision type:** Architecture
- **Relates to:** [ADR-001](001-agister-cli-architecture.md) section 4 (a
  mapping is trusted only once verified against the real runtime),
  [ADR-027](027-homes-settings-have-one-source-in-git.md)
- **Source:** LAB-163; the owner's decisions, 2026-10-10: the probe runs
  itself, never by hand, on `gpt-6-luna` at effort `low`

## Context

A runtime mapping lists, per primitive, the version prefixes it is
`verified` for; a call on a version none of its primitives lists is
refused. Each Codex upgrade refused every Codex call until someone added
the version to home's `codex.yaml`. What that edit rested on was a hand
observation, kept as a 42-line comment log in the settings file (442cca71,
LAB-163): no test, no record a reviewer could check, and nothing that ran
again on the next version. Codex's sandbox is the one grant a mapping
cannot enforce itself: Agister hands Codex a sandbox mode, and Codex
decides what each command may do.

## Decision

A call on a version the mapping verifies no primitive for has the
runtime's adapter probe that version, where the adapter has a probe, and
runs on the primitives the probe found holding. A probe that passed is
recorded locally and read by every later call; one that failed refuses
the call with what it found.

## Rules

1. The probe runs only when the mapping verifies no primitive for the
   runtime's version; a version the settings list is never probed.
2. A probe is the adapter's: it knows its primitives and what each must
   allow and refuse. An adapter without one leaves the version unverified,
   and the call is refused as before.
3. Codex's probe runs one script in each sandbox mode, each turn in a
   scratch git repository of its own: read-only, workspace-write, and the
   workspace-write thread resumed read-only. The turns are the adapter's,
   with the arguments a call's turn gets, on `gpt-6-luna` at effort `low`.
   An action's outcome is read from the command's output Codex reports,
   never from the model's reply.
4. The script runs outside the sandbox first, where every action must
   succeed, so a refusal inside it is the sandbox's, not the host's.
5. A primitive holds when each action's outcome is the one it allows or
   refuses; read-only holds only when it holds resumed too.
6. A probe that proves nothing (the script failed outside the sandbox, a
   turn failed, the model ran nothing), that finds no primitive holding,
   or that probed another version, refuses the call with its outcomes and
   is not recorded. The process that ran it does not run it again.
7. A probe that passed is kept as `<home>/probes/<adapter>/<version>.json`
   with its outcomes and time, outside the settings, and verifies that
   exact version for every later call and `check --probe`. One probe runs
   at a time in a process.

## Consequences

- An upgrade no longer refuses Codex calls until someone edits home's
  settings; the first call after it spends about 20 seconds and three
  short turns.
- A version's evidence is a record of what the sandbox did, not a comment.
- The `verified` lists in settings stay for the versions verified before;
  a new version needs no entry. Home's `codex.yaml` drops `0.162.`,
  which rested on the comment log: the probe verifies it.
- A probe record is local: another machine probes its own Codex.

## Alternatives considered

- **A script someone runs by hand before listing a version.** Nobody runs
  it; the agent sessions only meet the refusal.
- **A contract test in CI.** CI has no logged-in Codex, and a test proves
  the version CI has, not the one a machine runs.
- **Probing every version, listed or not.** Spends turns where the
  settings already decided.

## Explicit non-decisions

- Probes for the other adapters.
- When a kept probe is run again, other than by removing its file.
- Showing kept probes in Pages, which shows the settings: its "Tested
  with" column lists the `verified` versions only.
