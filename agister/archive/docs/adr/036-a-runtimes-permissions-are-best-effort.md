# ADR-036: A runtime's permissions are best effort

- **Status:** Accepted
- **Date:** 2026-10-13
- **Scope:** planning runtime primitives and reporting their permission grants
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) (a primitive that
  grants beyond allow is refused), [ADR-029](029-an-unverified-runtime-version-is-probed.md)
  (an unverified version or failed probe refuses a call)
- **Source:** LAB-243; the owner's LAB-241 decision, 2026-10-13

## Context

Runtime primitives bundle permissions. A read-only mode may still grant
process execution and host reads. A tool allowlist cannot express every
permission independently, and version evidence cannot guarantee the
runtime's behavior on the next call. Refusing every mismatch prevents
useful work without creating a stronger environment.

## Decision

Agister uses runtimes as shipped, with documented options only. Runtime
permissions are best effort. Required permissions and the service's
state boundary remain hard checks; extra grants and missing version
evidence are visible warnings.

## Rules

1. No runtime-specific workarounds, catalog overrides to hide grants, or
   undocumented flag tricks. The mapping describes the shipped runtime's
   documented primitives.
2. `tools.require` is a hard check: a plan withholding any required
   permission refuses the binding before any turn.
3. `tools.allow`, after policy composition, is a best-effort ceiling.
   Under `select: one`, choose the primitive with the fewest distinct
   grants that supplies every required permission and grants no `state_reaching`
   permission. Equal sizes use mapping order. Record grants beyond the
   effective allow set as `extra`, and warn loudly; do not refuse them.
   Under `select: any`, grant each primitive whose grants fit the ceiling
   and avoid state reach; a tool need not be granted to run that runtime.
4. A primitive granting a service `state_reaching` permission is never
   selected. With no safe mode, or a required permission withheld, the
   binding refuses. Extra writing grants make the call a writer under
   the existing worktree hold rule.
5. Unverified primitives and runtime versions warn. Plan from the declared
   offer, including unverified primitives. A probe is observability:
   keep its existing evidence and cache behavior, but its failure cannot
   refuse the call or take away a declared primitive.
6. `check` and `workflow show` name extra grants on each binding. The
   record keeps declared, granted and extra permissions. Call outcomes
   carry warnings; workflow outcomes carry their nodes' warnings, and
   printed results show them without changing completion status or exit
   code.
7. Prompts give evidence instructions and make no claim about the tools
   the environment provides. The judge rules only on evidence presented
   in the reviews and seeks no further evidence.
8. Rebind the shared judge through a join-only workflow partial. Do not
   duplicate its process or the whole review workflow for another runtime.

## Alternatives rejected

- **A catalog override or flag tricks per runtime.** The LAB-241 Codex
  experiment is this alternative. It hides or works around the runtime's
  shipped behavior and makes the catalog a runtime patch system.
- **Agister-made sandboxes or VMs.** Agister would own an isolation system
  instead of composing the runtime's documented options.
- **Refusing.** It treats a best-effort runtime boundary as a guarantee
  and prevents work that can proceed with an explicit warning.

## Consequences

A caller can see that a runtime grants more than requested or lacks
version evidence, and the run still proceeds. `allow` is not a security
boundary; `require` and `state_reaching` remain checks against the
mapping's declared grants. Agister does not claim a sandbox guarantee.
