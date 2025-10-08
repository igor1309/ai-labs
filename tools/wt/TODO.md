# ToDo

- [ ] Anchor new worktree directories on the repository root to keep `wt` functional when invoked from subdirectories.

Worktree path derived from caller cwd breaks in subdirectories (wt.sh:38)

  - Observation: Line 38 builds dir="../wt-${prefix}-${name}" directly from the current
    working directory; line 43 passes it to git worktree add.
  - Evidence: wt.sh:38-44.
  - Principled rationale: This violates robustness and encapsulation—the helper leaks caller
    state into its core invariant. The component should own the notion of “where worktrees
    live”, independent of the shell’s cwd, otherwise it cannot guarantee a valid worktree
    topology.
  - Strategic impact: Running wt from any nested folder (common after cd src) produces a
    target path still inside the main repo, and git worktree add aborts. The helper no longer
    provides a one-step branch/worktree workflow and encourages users to fall back to manual
    commands.
  - Actionable path: Resolve the repo root (git rev-parse --show-toplevel), compute its
    parent, and form the new worktree directory relative to that stable anchor. Optionally
    echo the resolved path so users know where the worktree landed.

    stipulates the call must originate from the repo root.
  - Evidence: README.md:51-58.
  - Principled rationale: Documentation should set correct expectations; silent preconditions
    undermine usability and trust. Without either fixing the script or documenting the
    limitation, users are left with an unexplained failure.
  - Strategic impact: New adopters following the README from their current working directory
    will see the helper fail and may abandon it altogether.
  - Actionable path: After fixing the script, note that wt targets a sibling directory of the
    repository root; until then, document the root-only limitation explicitly so users aren’t
    blindsided.