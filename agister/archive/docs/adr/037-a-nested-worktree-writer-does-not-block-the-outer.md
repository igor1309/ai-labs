# ADR-037: A nested worktree writer does not block the outer

- **Status:** Accepted
- **Date:** 2026-10-13
- **Scope:** the directories another writer's run may still write in,
  checked under a caller's worktree hold
- **Decision type:** Architecture
- **Amends:** [ADR-025](025-a-call-works-where-it-is-called.md) rule 4;
  narrows the canonical-path overlap rule inherited from
  [ADR-022](022-a-call-may-work-in-the-callers-worktree.md) rule 3
- **Source:** LAB-247; the owner's decision, 2026-10-13:
  nested writer to outer caller only; submodules keep overlapping

## Context

The hold refuses a call while another writer's run may still write in an
overlapping directory. Canonical path containment alone makes a writer
in a git worktree nested under the main checkout block the main checkout.
Claude Code places its worktrees at `<repo>/.claude/worktrees/<name>`, so
sessions in separate worktrees cannot proceed in parallel.

A nested worktree's writer reaches the outer worktree only through paths
outside its own root, just as a sibling worktree's writer does. The
owner decided that this direction stops overlapping. The reverse
direction stays: an outer writer's permissions cover its subfolders
(ADR-025 rule 8), including nested worktrees.

## Decision

### 1. A contained writer is judged by the git boundary

A writer's directory D inside the caller's worktree overlaps when D's
canonical git root is the caller's worktree. A separate git root nested
under it does not overlap, except when its canonical root equals the
root the outer index tracks as a submodule: a gitlink entry, mode `160000`.
A directory whose git root is that submodule remains within the outer
boundary too; an independent worktree beneath it does not. Configuration in
`.gitmodules` alone is insufficient; staged gitlinks count.

A writer's directory equal to the caller's worktree, or containing it,
still overlaps by canonical path. An outer writer therefore still
blocks a call in a nested worktree. An absent or unreadable git boundary,
including a failed submodule check, keeps the path overlap: the hold
fails closed. An absent, unrelated gitlink is skipped because it cannot
equal the existing canonical writer root.

### 2. Removal keeps plain path containment

A checkout, clean copy, unreleased checkout or cleanup parent Agister may
still remove overlaps by canonical path containment alone. A git root
under it does not protect the caller's worktree from removal.

### 3. The hold receives the boundary through its worktree port

The Holder's worktree port reads a directory's root and whether that root
equals an indexed submodule's canonical root. The git adapter resolves
`git rev-parse --show-toplevel` to a canonical path and reads gitlinks
with `git ls-files --stage -z`. The hold uses these only for contained
writer directories, retaining the existing refusal messages and process
reaping for directories that overlap.

## Consequences

- A writer in a separate nested worktree does not block an outer call.
- Submodules, plain subdirectories and outer writers still block calls.
- The hold consults git for contained writers; lookup failures keep the
  earlier refusal, and removable directories need no boundary lookup.
- Worktree lock keys and the check against Agister's state directory are
  unchanged. Coordination remains cooperation, not confinement
  (ADR-025 rule 8).

## Alternatives considered

- **Keep path containment alone:** rejected; separate nested worktrees
  cannot support parallel calls in the outer checkout.
- **Exclude both directions:** rejected; an outer writer's permissions
  still cover the nested worktree.
- **Exclude submodules too:** rejected; their gitlinks keep them within
  the outer worktree's tracked boundary.
