# LAB-247: a writer in a nested git worktree does not block the outer one

## Intent

Agister refuses a call while the worktree overlaps a directory that another writer's run worked in and may still write in (ADR-022 rule 3, ADR-025 rule 4). Overlap is judged by canonical path only, so a writer's run in a git worktree nested under the main checkout (Claude Code puts its worktrees at `<repo>/.claude/worktrees/<name>`) refuses every call in the main checkout. Parallel sessions then get no parallelism. Seen 2026-10-13: implement run `20261013T071446Z-e70656` in `ai-labs/.claude/worktrees/peppy-strolling-simon` refused a review in `ai-labs`.

A writer in a nested worktree cannot reach the outer worktree's files except by `..` paths, the same as a sibling worktree, and the outer worktree's git ignores the nested one. The owner decided (2026-10-13) that this direction stops overlapping. The other direction stays: a writer in the outer worktree may write into a nested folder by path, because its permissions cover subfolders (ADR-025 rule 8).

## Done when

1. A writer's directory D that lies inside the worktree overlaps it only when D is within the worktree's own git boundary: D's git root (`git rev-parse --show-toplevel`, canonical) is the worktree itself. A D whose git root is another worktree nested under it does not overlap.
2. A nested git root that the outer worktree's index tracks as a submodule (a gitlink entry) still overlaps, as today.
3. A writer's directory that is the worktree, or that contains it, overlaps it as today: a writer in the outer worktree still refuses a call in a nested one.
4. Directories Agister may still remove (a checkout, a clean copy, a cleanup parent) overlap by plain path containment, as today, whatever git roots lie under them.
5. The git boundary reaches `app` through a seam on its worktree port (for example `Root(ctx, dir) (string, error)` on `HoldWorktrees`), implemented by the git adapter. The test spy has a stub. If `Root` fails for a directory, the directory overlaps as today (fail closed).
6. Committed tests:
   - App tests in `internal/app/hold_test.go`, driving the `Root` stub: a writer in a nested worktree does not refuse an outer call; a writer in the outer worktree refuses a nested call; a writer in a plain subdirectory refuses; a writer in a submodule refuses; a removable directory containing the worktree refuses; `Root` failing refuses.
   - A real-git test in `t.TempDir()`: a main repository, `git worktree add` under it, a plain subdirectory and a submodule. It proves the adapter's `Root` gives each directory's git root and that the outer index reports the submodule. Through the real `Holder` if the existing harness allows it.
   - `TestAnotherRunThatMayStillWriteInTheWorktreeRefusesTheCall` keeps its cases. Its containing and contained repository cases stay refused where they are plain subdirectories or outer writers; a nested-worktree case is added as allowed.
7. A new ADR, `docs/adr/037-a-nested-worktree-writer-does-not-block-the-outer.md`, in the repository's ADR form. It states the rule above, names the rules of ADR-022 and ADR-025 it narrows, and records the owner's decision and the reason the outer direction stays. ADR-022 and ADR-025 are not edited. The README's ADR list names it.
8. The comments on `claims` and `lies` in `internal/app/hold.go` say the new rule. The caller skill (`skills/agister/SKILL.md`) and the README or reference text that repeat the overlap definition say it too.
9. Every other output, message, exit code and JSON of `agister` is unchanged. `scripts/test.sh` passes.

## Out of scope

- The lock's keying, and `overlaps()` in `calls.go`, which checks a workspace against Agister's state directory.
- Confining an agent to its workspace.
- Where Claude Code creates worktrees.

## Decisions

- The owner, 2026-10-13: nested→outer only. Submodules keep overlapping. The advisor's run `20261013T071850Z-797520` ruled the change a conflict with the recorded contract, which only the owner could settle.
- The design follows the analysis comment on LAB-247: a `Root` seam, with `claims` split by kind of directory.

## Open

None.
